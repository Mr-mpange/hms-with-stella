<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\AccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function __construct(private readonly AccountService $account) {}

    /**
     * POST /api/auth/login
     * Accepts email OR phone number as identifier.
     */
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email'    => 'required|string', // accepts email or phone
            'password' => 'required',
        ]);

        $identifier = $request->input('email');

        // Try email first, then phone
        $user = User::where('email', $identifier)->first()
             ?? User::where('phone', $identifier)->first()
             ?? User::where('phone', $this->normalizePhone($identifier))->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['The provided credentials are incorrect.'],
            ]);
        }

        if (! $user->is_active) {
            return response()->json(['error' => 'Account is inactive. Contact your administrator.'], 403);
        }

        $user->update(['last_login_at' => now()]);

        $token = $user->createToken('auth-token')->plainTextToken;

        return response()->json([
            'token' => $token,
            'user'  => $this->account->formatUser($user),
        ]);
    }

    /**
     * POST /api/auth/register
     * Accepts optional generate_wallet=true to auto-create a Stellar keypair.
     */
    public function register(Request $request): JsonResponse
    {
        $request->validate([
            'name'              => 'required|string|max:255',
            'email'             => 'required|email|unique:users',
            'password'          => 'required|string|min:8|confirmed',
            'phone'             => 'nullable|string|max:20',
            'role'              => 'required|in:admin,doctor,nurse,receptionist,pharmacist,lab_technician,lab_tech,billing,patient',
            'generate_wallet'   => 'nullable|boolean',
        ]);

        $result = $this->account->register($request->only(
            'name', 'email', 'password', 'phone', 'role', 'generate_wallet'
        ));

        return response()->json($result, 201);
    }

    /**
     * POST /api/auth/logout
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();
        return response()->json(['message' => 'Logged out successfully.']);
    }

    /**
     * GET /api/auth/me
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        if (! $user) {
            return response()->json(['error' => 'Unauthenticated'], 401);
        }

        return response()->json(['user' => $this->account->formatUser($user)]);
    }

    // ─── Private ────────────────────────────────────────────────────────────

    private function normalizePhone(string $phone): string
    {
        $phone = preg_replace('/\D/', '', $phone);
        if (str_starts_with($phone, '0') && strlen($phone) === 10) {
            return '+255' . substr($phone, 1);
        }
        if (str_starts_with($phone, '255') && strlen($phone) === 12) {
            return '+' . $phone;
        }
        return $phone;
    }
}
