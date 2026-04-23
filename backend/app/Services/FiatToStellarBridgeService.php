<?php

namespace App\Services;

use App\Models\Payment;
use App\Models\MedicalRecord;
use App\Repositories\MedicalRecordRepository;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * FiatToStellarBridgeService
 *
 * Bridges fiat payments (ZenoPay / Mobile Money TZS) to the Stellar blockchain.
 *
 * Flow:
 *   1. Fiat payment confirmed (ZenoPay webhook / MobileMoney callback)
 *   2. Convert TZS amount → XLM using live exchange rate
 *   3. Submit XLM payment on Stellar (hospital wallet → destination)
 *   4. If medical record CID exists → trigger Soroban insurance + payment release
 *   5. Log everything for audit
 */
class FiatToStellarBridgeService
{
    // Fallback rate if exchange API is unavailable (TZS per 1 XLM)
    // Update this periodically or rely on live rate
    private const FALLBACK_TZS_PER_XLM = 6500.0;

    public function __construct(
        private readonly StellarService          $stellar,
        private readonly SorobanService          $soroban,
        private readonly MedicalRecordRepository $recordRepo,
    ) {}

    /**
     * Called after a fiat payment is confirmed (from ZenoPay or MobileMoney webhook).
     *
     * @param  Payment  $payment         The confirmed fiat payment record
     * @param  array    $options {
     *   destination_wallet?: string   Override destination (default: hospital wallet)
     *   cid?: string                  IPFS CID if this payment is for a medical record
     *   insurance_number?: string     For Soroban insurance check
     *   doctor_approved?: bool        For Soroban payment release
     * }
     * @return array  Bridge result
     */
    public function bridgePayment(Payment $payment, array $options = []): array
    {
        $tzsAmount  = (float) $payment->amount;
        $xlmAmount  = $this->convertTzsToXlm($tzsAmount);
        $destination = $options['destination_wallet'] ?? config('stellar.hospital_public_key');

        if (empty($destination)) {
            throw new RuntimeException('No destination Stellar wallet configured.');
        }

        $memo = "HMS-PAY:{$payment->reference_number}";

        // Step 1: Send XLM on Stellar
        $stellarTxHash = $this->stellar->sendPayment(
            $destination,
            number_format($xlmAmount, 7, '.', ''),
            $memo
        );

        Log::info('FiatToStellarBridge: XLM payment sent', [
            'payment_id'      => $payment->id,
            'tzs_amount'      => $tzsAmount,
            'xlm_amount'      => $xlmAmount,
            'stellar_tx_hash' => $stellarTxHash,
        ]);

        $result = [
            'success'          => true,
            'payment_id'       => $payment->id,
            'tzs_amount'       => $tzsAmount,
            'xlm_amount'       => $xlmAmount,
            'stellar_tx_hash'  => $stellarTxHash,
            'soroban_released' => false,
            'soroban_tx_hash'  => null,
        ];

        // Step 2: If CID provided, trigger Soroban smart contract
        $cid = $options['cid'] ?? $this->findCidForPayment($payment);

        if ($cid && !empty($options['insurance_number'])) {
            try {
                // Look up the CID anchor tx hash from the medical record (not the payment tx)
                $cidAnchorTxHash = $options['cid_anchor_tx_hash']
                    ?? $this->findCidAnchorTxHash($cid, $payment->patient_id);

                $sorobanTxHash = $this->soroban->releasePayment([
                    'patient_id'          => $payment->patient_id,
                    'insurance_number'    => $options['insurance_number'],
                    'cid'                 => $cid,
                    'stellar_tx_hash'     => $stellarTxHash,
                    'cid_anchor_tx_hash'  => $cidAnchorTxHash,
                    'doctor_approved'     => $options['doctor_approved'] ?? false,
                    'amount'              => $xlmAmount,
                    'destination_wallet'  => $destination,
                ]);

                $result['soroban_released'] = true;
                $result['soroban_tx_hash']  = $sorobanTxHash;

                Log::info('FiatToStellarBridge: Soroban payment released', [
                    'payment_id'      => $payment->id,
                    'soroban_tx_hash' => $sorobanTxHash,
                ]);
            } catch (\Throwable $e) {
                // Soroban failure does NOT roll back the Stellar payment
                // Log and surface the error but keep the bridge result
                Log::warning('FiatToStellarBridge: Soroban release failed', [
                    'payment_id' => $payment->id,
                    'error'      => $e->getMessage(),
                ]);
                $result['soroban_error'] = $e->getMessage();
            }
        }

        // Step 3: Persist Stellar tx hash back onto the payment record
        $payment->update([
            'stellar_tx_hash'  => $stellarTxHash,
            'xlm_amount'       => $xlmAmount,
            'bridge_status'    => 'bridged',
        ]);

        return $result;
    }

    /**
     * Convert TZS to XLM using live rate from a public exchange API.
     * Falls back to a hardcoded rate if the API is unavailable.
     *
     * @param  float  $tzsAmount
     * @return float  XLM amount (7 decimal precision)
     */
    public function convertTzsToXlm(float $tzsAmount): float
    {
        $rate = $this->fetchLiveRate();
        $xlm  = $tzsAmount / $rate;

        Log::info('FiatToStellarBridge: TZS→XLM conversion', [
            'tzs'  => $tzsAmount,
            'rate' => $rate,
            'xlm'  => $xlm,
        ]);

        return round($xlm, 7);
    }

    /**
     * Fetch live TZS/XLM rate.
     * Uses CoinGecko free API — no key required.
     * Falls back to hardcoded rate on failure.
     */
    public function fetchLiveRate(): float
    {
        try {
            // CoinGecko: get XLM price in TZS
            $response = Http::timeout(5)
                ->get('https://api.coingecko.com/api/v3/simple/price', [
                    'ids'           => 'stellar',
                    'vs_currencies' => 'tzs',
                ]);

            if ($response->successful()) {
                $rate = $response->json('stellar.tzs');
                if ($rate && $rate > 0) {
                    return (float) $rate;
                }
            }
        } catch (\Throwable $e) {
            Log::warning('FiatToStellarBridge: rate fetch failed, using fallback', [
                'error' => $e->getMessage(),
            ]);
        }

        return self::FALLBACK_TZS_PER_XLM;
    }

    // ─── Private ────────────────────────────────────────────────────────────

    /**
     * Try to find a CID linked to this payment's patient + visit.
     */
    private function findCidForPayment(Payment $payment): ?string
    {
        if (! $payment->patient_id) {
            return null;
        }

        $record = $this->recordRepo->getByPatient($payment->patient_id)->first();
        return $record?->cid_hash ?? null;
    }

    /**
     * Find the Stellar tx hash that anchored a CID (from the medical record).
     * This is different from the payment tx hash.
     */
    private function findCidAnchorTxHash(string $cid, ?string $patientId): ?string
    {
        $record = $this->recordRepo->findByCid($cid);
        if ($record) {
            return $record->stellar_tx_hash ?? null;
        }
        if ($patientId) {
            $record = $this->recordRepo->getByPatient($patientId)->first();
            return $record?->stellar_tx_hash ?? null;
        }
        return null;
    }
}

