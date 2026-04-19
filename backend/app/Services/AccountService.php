<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use RuntimeException;
use Soneso\StellarSDK\Crypto\KeyPair;

/**
 * AccountService
 *
 * Handles all user account lifecycle:
 *  - Registration with optional Stellar wallet auto-generation
 *  - Profile update (name, phone, avatar, specialization)
 *  - Password change (requires current password)
 *  - Password reset via email token
 *  - Stellar wallet: generate new, link existing, export encrypted secret
 *  - Account deactivation
 */
class AccountService
{
    // AES-256-CBC key derived from APP_KEY — never stored separately
    private string $encryptionKey;

    public function __construct()
    {
        // Derive a 32-byte key from Laravel's APP_KEY
        $appKey = config('app.key');
        $this->encryptionKey = substr(hash('sha256', $appKey, true), 0, 32);
    }

    // ─── Registration ────────────────────────────────────────────────────────

    /**
     * Register a new user.
     * Optionally auto-generates a Stellar keypair for them.
     *
     * @param  array  $data {name, email, password, phone?, role, generate_wallet?}
     * @return array  {user, token, wallet?}
     */
    public function register(array $data): array
    {
        $user = User::create([
            'name'     => $data['name'],
            'email'    => $data['email'],
            'password' => Hash::make($data['password']),
            'phone'    => $data['phone'] ?? null,
            'role'     => $this->normalizeRole($data['role'] ?? 'patient'),
            'is_active'=> true,
        ]);

        $walletInfo = null;

        if (! empty($data['generate_wallet'])) {
            $walletInfo = $this->generateAndAttachWallet($user);
        }

        $token = $user->createToken('auth-token')->plainTextToken;

        Log::info('AccountService: user registered', ['user_id' => $user->id, 'role' => $user->role]);

        return [
            'user'   => $this->formatUser($user),
            'token'  => $token,
            'wallet' => $walletInfo, // only returned at registration — secret never shown again
        ];
    }

    // ─── Profile ─────────────────────────────────────────────────────────────

    /**
     * Update user profile fields.
     *
     * @param  User   $user
     * @param  array  $data {name?, phone?, avatar_url?, specialization?}
     * @return array  Updated user
     */
    public function updateProfile(User $user, array $data): array
    {
        $allowed = ['name', 'phone', 'avatar_url', 'specialization'];
        $updates = array_intersect_key($data, array_flip($allowed));

        $user->update($updates);

        Log::info('AccountService: profile updated', ['user_id' => $user->id]);

        return $this->formatUser($user->fresh());
    }

    // ─── Password ────────────────────────────────────────────────────────────

    /**
     * Change password — requires current password verification.
     *
     * @param  User    $user
     * @param  string  $currentPassword
     * @param  string  $newPassword
     */
    public function changePassword(User $user, string $currentPassword, string $newPassword): void
    {
        if (! Hash::check($currentPassword, $user->password)) {
            throw new RuntimeException('Current password is incorrect.');
        }

        $user->update(['password' => Hash::make($newPassword)]);

        // Revoke all existing tokens — force re-login on all devices
        $user->tokens()->delete();

        Log::info('AccountService: password changed', ['user_id' => $user->id]);
    }

    /**
     * Send a password reset token to the user's email.
     *
     * @param  string  $email
     */
    public function sendPasswordReset(string $email): void
    {
        $user = User::where('email', $email)->first();

        if (! $user) {
            // Don't reveal whether email exists
            return;
        }

        $token   = Str::random(64);
        $expires = now()->addMinutes(60);

        $user->update([
            'password_reset_token'      => hash('sha256', $token),
            'password_reset_expires_at' => $expires,
        ]);

        // Send email — uses Laravel's mail system (configure MAIL_* in .env)
        try {
            Mail::send('emails.password-reset', [
                'user'       => $user,
                'token'      => $token,
                'expires_at' => $expires,
                'reset_url'  => config('app.frontend_url', env('FRONTEND_URL'))
                                . '/reset-password?token=' . $token
                                . '&email=' . urlencode($email),
            ], function ($message) use ($user) {
                $message->to($user->email, $user->name)
                        ->subject('Reset Your Password — ' . config('app.name'));
            });
        } catch (\Throwable $e) {
            Log::error('AccountService: password reset email failed', ['error' => $e->getMessage()]);
        }

        Log::info('AccountService: password reset token issued', ['user_id' => $user->id]);
    }

    /**
     * Reset password using the token from email.
     *
     * @param  string  $email
     * @param  string  $token
     * @param  string  $newPassword
     */
    public function resetPassword(string $email, string $token, string $newPassword): void
    {
        $user = User::where('email', $email)->first();

        if (! $user || ! $user->password_reset_token) {
            throw new RuntimeException('Invalid or expired reset token.');
        }

        if (! hash_equals($user->password_reset_token, hash('sha256', $token))) {
            throw new RuntimeException('Invalid reset token.');
        }

        if ($user->password_reset_expires_at->isPast()) {
            throw new RuntimeException('Reset token has expired. Please request a new one.');
        }

        $user->update([
            'password'                  => Hash::make($newPassword),
            'password_reset_token'      => null,
            'password_reset_expires_at' => null,
        ]);

        // Revoke all tokens — force re-login
        $user->tokens()->delete();

        Log::info('AccountService: password reset completed', ['user_id' => $user->id]);
    }

    // ─── Stellar Wallet ──────────────────────────────────────────────────────

    /**
     * Generate a new Stellar keypair and attach it to the user.
     * The secret key is AES-256 encrypted before storage.
     * The PLAIN secret is returned ONCE — it is never retrievable again.
     *
     * @param  User  $user
     * @return array {public_key, secret_key (plain — show once), message}
     */
    public function generateWallet(User $user): array
    {
        if ($user->stellar_public_key) {
            throw new RuntimeException(
                'User already has a Stellar wallet. Use linkWallet to replace it.'
            );
        }

        return $this->generateAndAttachWallet($user);
    }

    /**
     * Link an existing Stellar public key to the user's account.
     * Use this when the user manages their own wallet (Freighter, Lobstr, etc.)
     * and only wants to associate their public key — no secret stored.
     *
     * @param  User    $user
     * @param  string  $publicKey  Stellar G... address
     */
    public function linkWallet(User $user, string $publicKey): void
    {
        $this->validatePublicKey($publicKey);

        $user->update([
            'stellar_public_key'       => $publicKey,
            'stellar_encrypted_secret' => null, // user manages their own secret
        ]);

        Log::info('AccountService: external wallet linked', [
            'user_id'    => $user->id,
            'public_key' => $publicKey,
        ]);
    }

    /**
     * Export the user's encrypted Stellar secret (for backup).
     * Requires password verification before exposing.
     *
     * @param  User    $user
     * @param  string  $password  Current account password
     * @return string  Decrypted secret key (show to user, do not store)
     */
    public function exportWalletSecret(User $user, string $password): string
    {
        if (! Hash::check($password, $user->password)) {
            throw new RuntimeException('Password verification failed.');
        }

        if (! $user->stellar_encrypted_secret) {
            throw new RuntimeException(
                'No managed wallet found. You linked an external wallet — manage your secret there.'
            );
        }

        return $this->decryptSecret($user->stellar_encrypted_secret);
    }

    /**
     * Remove the Stellar wallet from the user's account.
     *
     * @param  User    $user
     * @param  string  $password
     */
    public function removeWallet(User $user, string $password): void
    {
        if (! Hash::check($password, $user->password)) {
            throw new RuntimeException('Password verification failed.');
        }

        $user->update([
            'stellar_public_key'       => null,
            'stellar_encrypted_secret' => null,
        ]);

        Log::info('AccountService: wallet removed', ['user_id' => $user->id]);
    }

    // ─── Account ─────────────────────────────────────────────────────────────

    /**
     * Deactivate account (soft disable — does not delete data).
     *
     * @param  User    $user
     * @param  string  $password
     */
    public function deactivateAccount(User $user, string $password): void
    {
        if (! Hash::check($password, $user->password)) {
            throw new RuntimeException('Password verification failed.');
        }

        $user->update(['is_active' => false]);
        $user->tokens()->delete();

        Log::info('AccountService: account deactivated', ['user_id' => $user->id]);
    }

    /**
     * Create a patient portal account linked to a patient record.
     * Called by reception after registering a patient.
     *
     * Default password: HMS1234 (patient should change on first login)
     * Login: phone number + HMS1234
     *
     * @param  \App\Models\Patient  $patient
     * @return array {user_id, phone, default_password, message}
     */
    public function createPatientAccount(\App\Models\Patient $patient): array
    {
        // Check if account already exists for this phone
        $existing = User::where('phone', $patient->phone)->first();
        if ($existing) {
            return [
                'user_id'          => $existing->id,
                'phone'            => $patient->phone,
                'already_exists'   => true,
                'message'          => 'Account already exists for this phone number.',
            ];
        }

        $defaultPassword = 'HMS1234';

        $user = User::create([
            'name'      => $patient->full_name,
            'email'     => $patient->email ?? ($patient->phone . '@patient.hms'),
            'password'  => Hash::make($defaultPassword),
            'phone'     => $patient->phone,
            'role'      => 'patient',
            'is_active' => true,
        ]);

        // Link user to patient record
        $patient->update(['user_id' => $user->id]);

        Log::info('AccountService: patient account created', [
            'user_id'    => $user->id,
            'patient_id' => $patient->id,
            'phone'      => $patient->phone,
        ]);

        return [
            'user_id'          => $user->id,
            'phone'            => $patient->phone,
            'default_password' => $defaultPassword,
            'already_exists'   => false,
            'message'          => "Account created. Patient can login with phone: {$patient->phone} and password: {$defaultPassword}",
        ];
    }

    // ─── Private ─────────────────────────────────────────────────────────────

    private function generateAndAttachWallet(User $user): array
    {
        $keyPair    = KeyPair::random();
        $publicKey  = $keyPair->getAccountId();
        $secretKey  = $keyPair->getSecretSeed();
        $encrypted  = $this->encryptSecret($secretKey);

        $user->update([
            'stellar_public_key'       => $publicKey,
            'stellar_encrypted_secret' => $encrypted,
        ]);

        Log::info('AccountService: Stellar wallet generated', [
            'user_id'    => $user->id,
            'public_key' => $publicKey,
        ]);

        return [
            'public_key' => $publicKey,
            'secret_key' => $secretKey, // shown ONCE — user must save this
            'message'    => 'Save your secret key now. It will never be shown again.',
        ];
    }

    private function encryptSecret(string $secret): string
    {
        $iv         = random_bytes(16);
        $ciphertext = openssl_encrypt($secret, 'AES-256-CBC', $this->encryptionKey, OPENSSL_RAW_DATA, $iv);
        return base64_encode($iv . $ciphertext);
    }

    private function decryptSecret(string $encrypted): string
    {
        $raw        = base64_decode($encrypted);
        $iv         = substr($raw, 0, 16);
        $ciphertext = substr($raw, 16);
        $plain      = openssl_decrypt($ciphertext, 'AES-256-CBC', $this->encryptionKey, OPENSSL_RAW_DATA, $iv);

        if ($plain === false) {
            throw new RuntimeException('Failed to decrypt wallet secret.');
        }

        return $plain;
    }

    private function validatePublicKey(string $publicKey): void
    {
        try {
            KeyPair::fromAccountId($publicKey);
        } catch (\Throwable) {
            throw new RuntimeException('Invalid Stellar public key format.');
        }
    }

    private function normalizeRole(string $role): string
    {
        return $role === 'lab_tech' ? 'lab_technician' : $role;
    }

    public function formatUser(User $user): array
    {
        return [
            'id'                 => $user->id,
            'name'               => $user->name,
            'email'              => $user->email,
            'phone'              => $user->phone,
            'role'               => $user->role,
            'department_id'      => $user->department_id,
            'specialization'     => $user->specialization,
            'avatar_url'         => $user->avatar_url,
            'is_active'          => $user->is_active,
            'stellar_public_key' => $user->stellar_public_key,
            'has_managed_wallet' => ! empty($user->stellar_encrypted_secret),
            'last_login_at'      => $user->last_login_at,
            'created_at'         => $user->created_at,
        ];
    }
}

