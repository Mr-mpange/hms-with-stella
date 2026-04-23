<?php

namespace App\Http\Controllers;

use App\Services\MedicalRecordService;
use App\Services\SorobanService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class SorobanController extends Controller
{
    public function __construct(
        private readonly SorobanService       $soroban,
        private readonly MedicalRecordService $recordService,
    ) {}

    /**
     * POST /api/contract/register-insurance
     * Register a patient's insurance on the Soroban contract (idempotent).
     * Must be called before validate_insurance can return true.
     */
    public function registerInsurance(Request $request): JsonResponse
    {
        $request->validate([
            'patient_id'       => 'required|string',
            'insurance_number' => 'required|string',
        ]);

        try {
            $this->soroban->registerInsurance(
                $request->input('patient_id'),
                $request->input('insurance_number')
            );

            return response()->json([
                'success'    => true,
                'patient_id' => $request->input('patient_id'),
                'message'    => 'Insurance registered on Soroban contract',
            ]);
        } catch (Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/contract/insurance-check
     * Validate insurance status via Soroban smart contract.
     */
    public function insuranceCheck(Request $request): JsonResponse
    {
        $request->validate([
            'patient_id'       => 'required|uuid|exists:patients,id',
            'insurance_number' => 'required|string',
        ]);

        try {
            $valid = $this->soroban->validateInsurance(
                $request->input('patient_id'),
                $request->input('insurance_number')
            );

            return response()->json([
                'success'           => true,
                'insurance_valid'   => $valid,
                'patient_id'        => $request->input('patient_id'),
            ]);
        } catch (Throwable $e) {
            return response()->json(['success' => false, 'error' => $e->getMessage()], 500);
        }
    }

    /**
     * POST /api/contract/release-payment
     * Run the full Soroban automation:
     *   insurance check → CID verification → payment release
     */
    public function releasePayment(Request $request): JsonResponse
    {
        $request->validate([
            'cid'                => 'required|string',
            'patient_id'         => 'required|uuid|exists:patients,id',
            'insurance_number'   => 'required|string',
            'doctor_approved'    => 'required|boolean',
            'amount'             => 'required|numeric|min:0.0000001',
            'destination_wallet' => 'required|string',
        ]);

        try {
            $result = $this->recordService->processInsurancePayment($request->all());
            return response()->json($result);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'error'   => $e->getMessage(),
            ], 422);
        }
    }
}
