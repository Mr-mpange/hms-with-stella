<?php

namespace App\Services;

use Illuminate\Support\Facades\Log;
use RuntimeException;
use Soneso\StellarSDK\InvokeContractHostFunction;
use Soneso\StellarSDK\InvokeHostFunctionOperationBuilder;
use Soneso\StellarSDK\Crypto\KeyPair;
use Soneso\StellarSDK\Crypto\StrKey;
use Soneso\StellarSDK\Network;
use Soneso\StellarSDK\Soroban\Responses\GetTransactionResponse;
use Soneso\StellarSDK\Soroban\Responses\SendTransactionResponse;
use Soneso\StellarSDK\Soroban\Requests\SimulateTransactionRequest;
use Soneso\StellarSDK\Soroban\SorobanServer;
use Soneso\StellarSDK\StellarSDK;
use Soneso\StellarSDK\TransactionBuilder;
use Soneso\StellarSDK\Xdr\XdrSCVal;

/**
 * SorobanService
 *
 * Uses soneso/stellar-php-sdk to interact with Soroban smart contracts.
 *
 * Business rule:
 *   IF insurance_active AND cid_verified AND doctor_approved
 *   THEN release payment → return tx_hash
 *   ELSE throw RuntimeException
 */
class SorobanService
{
    private SorobanServer $soroban;
    private StellarSDK    $sdk;
    private Network       $network;
    private string        $hospitalPublicKey;
    private string        $hospitalSecretKey;
    private string        $insuranceContractId;
    private string        $paymentContractId;
    private string        $rpcUrl;
    private string        $horizonUrl;

    private const POLL_MAX_ATTEMPTS  = 10;
    private const POLL_SLEEP_SECONDS = 3;

    public function __construct()
    {
        $this->rpcUrl              = config('stellar.soroban_rpc_url');
        $this->horizonUrl          = config('stellar.horizon_url');
        $this->hospitalPublicKey   = config('stellar.hospital_public_key', '');
        $this->hospitalSecretKey   = config('stellar.hospital_secret_key', '');
        $this->insuranceContractId = config('stellar.insurance_contract_id', '');
        $this->paymentContractId   = config('stellar.payment_contract_id', '');

        $networkName   = config('stellar.network', 'testnet');
        $this->network = $networkName === 'mainnet' ? Network::public() : Network::testnet();

        $this->soroban = new SorobanServer($this->rpcUrl);

        $this->sdk = new StellarSDK($this->horizonUrl);
    }

    /**
     * Validate insurance via Soroban contract.
     * Calls: validate_insurance(patient_id: String, insurance_number: String) → Bool
     */
    public function validateInsurance(string $patientId, string $insuranceNumber): bool
    {
        $this->assertContractsConfigured();

        try {
            $result = $this->invokeContractFunction(
                $this->contractHex($this->insuranceContractId),
                'validate_insurance',
                [
                    XdrSCVal::forString($patientId),
                    XdrSCVal::forString($insuranceNumber),
                ]
            );

            $isValid = $result?->b === true;

            Log::info('SorobanService: insurance validation', [
                'patient_id' => $patientId,
                'valid'      => $isValid,
            ]);

            return $isValid;
        } catch (\Throwable $e) {
            Log::warning('SorobanService: validateInsurance failed', ['error' => $e->getMessage()]);
            throw $e;
        }
    }

    /**
     * Verify a CID on-chain via the smart contract.
     * Calls: verify_cid(cid: String, stellar_tx_hash: String) → Bool
     */
    public function verifyCidOnChain(string $cid, string $stellarTxHash): bool
    {
        $this->assertContractsConfigured();

        $result = $this->invokeContractFunction(
            $this->contractHex($this->insuranceContractId),
            'verify_cid',
            [
                XdrSCVal::forString($cid),
                XdrSCVal::forString($stellarTxHash),
            ]
        );

        return $result?->b === true;
    }

    /**
     * Full insurance + payment release flow.
     *
     * Business rule:
     *   IF insurance_active AND cid_verified AND doctor_approved
     *   THEN release_payment → return tx_hash
     *   ELSE throw RuntimeException
     */
    public function releasePayment(array $params): string
    {
        $this->assertContractsConfigured();

        if (! $this->validateInsurance($params['patient_id'], $params['insurance_number'])) {
            throw new RuntimeException('Smart contract rejected: insurance is not active.');
        }

        if (! $this->verifyCidOnChain($params['cid'], $params['stellar_tx_hash'])) {
            throw new RuntimeException('Smart contract rejected: CID not verified on Stellar.');
        }

        if (empty($params['doctor_approved'])) {
            throw new RuntimeException('Smart contract rejected: doctor approval not confirmed.');
        }

        $amountStroops = (int) round((float) $params['amount'] * 10_000_000);

        $txHash = $this->invokeContractFunctionAndGetHash(
            $this->contractHex($this->paymentContractId),
            'release_payment',
            [
                XdrSCVal::forString($params['patient_id']),
                XdrSCVal::forString($params['cid']),
                XdrSCVal::forString($params['destination_wallet']),
                XdrSCVal::forI128Parts(0, $amountStroops),
            ]
        );

        Log::info('SorobanService: payment released', [
            'patient_id' => $params['patient_id'],
            'cid'        => $params['cid'],
            'amount'     => $params['amount'],
            'tx_hash'    => $txHash,
        ]);

        return $txHash;
    }

    // ─── Private ────────────────────────────────────────────────────────────

    /**
     * Invoke a contract function, simulate, sign, send, poll for result.
     * Returns the XdrSCVal result.
     */
    private function invokeContractFunction(string $contractIdHex, string $functionName, array $args): ?XdrSCVal
    {
        $keyPair  = KeyPair::fromSeed($this->hospitalSecretKey);
        $account  = $this->sdk->requestAccount($this->hospitalPublicKey);

        $hostFunction = new InvokeContractHostFunction($contractIdHex, $functionName, $args);
        $operation    = (new InvokeHostFunctionOperationBuilder($hostFunction))->build();

        $transaction = (new TransactionBuilder($account))
            ->addOperation($operation)
            ->build();

        $simResponse = $this->soroban->simulateTransaction(
            new SimulateTransactionRequest($transaction)
        );

        if ($simResponse->resultError !== null) {
            throw new RuntimeException(
                "Soroban simulate failed [{$functionName}]: " . $simResponse->resultError
            );
        }

        $transaction->setSorobanTransactionData($simResponse->transactionData);
        $transaction->addResourceFee($simResponse->minResourceFee ?? 0);
        $transaction->sign($keyPair, $this->network);

        $sendResponse = $this->soroban->sendTransaction($transaction);

        if ($sendResponse->status === SendTransactionResponse::STATUS_ERROR) {
            throw new RuntimeException(
                "Soroban send failed [{$functionName}]: " . ($sendResponse->errorResultXdr ?? 'unknown')
            );
        }

        return $this->pollTransaction($sendResponse->hash);
    }

    /**
     * Same as invokeContractFunction but returns the tx hash.
     */
    private function invokeContractFunctionAndGetHash(string $contractIdHex, string $functionName, array $args): string
    {
        $keyPair  = KeyPair::fromSeed($this->hospitalSecretKey);
        $account  = $this->sdk->requestAccount($this->hospitalPublicKey);

        $hostFunction = new InvokeContractHostFunction($contractIdHex, $functionName, $args);
        $operation    = (new InvokeHostFunctionOperationBuilder($hostFunction))->build();

        $transaction = (new TransactionBuilder($account))
            ->addOperation($operation)
            ->build();

        $simResponse = $this->soroban->simulateTransaction(
            new SimulateTransactionRequest($transaction)
        );

        if ($simResponse->resultError !== null) {
            throw new RuntimeException(
                "Soroban simulate failed [{$functionName}]: " . $simResponse->resultError
            );
        }

        $transaction->setSorobanTransactionData($simResponse->transactionData);
        $transaction->addResourceFee($simResponse->minResourceFee ?? 0);
        $transaction->sign($keyPair, $this->network);

        $sendResponse = $this->soroban->sendTransaction($transaction);

        if ($sendResponse->status === SendTransactionResponse::STATUS_ERROR) {
            throw new RuntimeException(
                "Soroban send failed [{$functionName}]: " . ($sendResponse->errorResultXdr ?? 'unknown')
            );
        }

        $txHash = $sendResponse->hash;
        $this->pollTransaction($txHash);
        return $txHash;
    }

    /**
     * Poll getTransaction until SUCCESS or FAILED.
     */
    private function pollTransaction(string $txHash): ?XdrSCVal
    {
        for ($i = 0; $i < self::POLL_MAX_ATTEMPTS; $i++) {
            sleep(self::POLL_SLEEP_SECONDS);

            $response = $this->soroban->getTransaction($txHash);

            if ($response->status === GetTransactionResponse::STATUS_SUCCESS) {
                return $this->extractResultValue($response);
            }

            if ($response->status === GetTransactionResponse::STATUS_FAILED) {
                throw new RuntimeException(
                    "Soroban transaction failed: {$txHash} — " . ($response->resultXdr ?? 'no detail')
                );
            }

            Log::debug('SorobanService: polling', ['hash' => $txHash, 'attempt' => $i + 1]);
        }

        throw new RuntimeException("Soroban transaction timed out: {$txHash}");
    }

    private function extractResultValue(GetTransactionResponse $response): ?XdrSCVal
    {
        if ($response->resultMetaXdr === null) {
            return null;
        }

        try {
            $meta        = \Soneso\StellarSDK\Xdr\XdrTransactionMeta::fromBase64Xdr($response->resultMetaXdr);
            $sorobanMeta = $meta->v3?->sorobanMeta;
            return $sorobanMeta?->returnValue ?? null;
        } catch (\Throwable $e) {
            Log::warning('SorobanService: could not extract result', ['error' => $e->getMessage()]);
            return null;
        }
    }

    /**
     * Convert a Stellar contract strkey (C...) to hex for the SDK.
     */
    private function contractHex(string $contractStrkey): string
    {
        if (ctype_xdigit($contractStrkey) && strlen($contractStrkey) === 64) {
            return $contractStrkey; // already hex
        }
        return StrKey::decodeContractIdHex($contractStrkey);
    }

    private function assertContractsConfigured(): void
    {
        if (empty($this->hospitalPublicKey) || empty($this->hospitalSecretKey)) {
            throw new RuntimeException(
                'Stellar keys not configured. Set STELLAR_HOSPITAL_PUBLIC_KEY and STELLAR_HOSPITAL_SECRET_KEY in .env'
            );
        }

        if (empty($this->insuranceContractId) || empty($this->paymentContractId)) {
            throw new RuntimeException(
                'Soroban contract IDs not configured. Set STELLAR_INSURANCE_CONTRACT_ID and STELLAR_PAYMENT_CONTRACT_ID in .env'
            );
        }
    }
}
