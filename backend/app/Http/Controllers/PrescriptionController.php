<?php

namespace App\Http\Controllers;

use App\Models\Prescription;
use App\Models\PrescriptionItem;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;

class PrescriptionController extends Controller
{
    public function index(Request $request)
    {
        $query = Prescription::with(['patient', 'doctor', 'items.medication', 'visit']);

        if ($request->has('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Filter by visit current_stage (for pharmacy dashboard)
        if ($request->has('visit_stage')) {
            $query->whereHas('visit', function($q) use ($request) {
                $q->where('current_stage', $request->visit_stage);
            });
        }

        // Date range filtering for reports
        if ($request->has('from') && $request->has('to')) {
            $query->whereBetween('prescription_date', [$request->from, $request->to]);
        }

        $prescriptions = $query->orderBy('prescription_date', 'desc')
                              ->paginate($request->get('limit', 50));

        return response()->json(['prescriptions' => $prescriptions->items(), 'total' => $prescriptions->total()]);
    }

    public function show($id)
    {
        $prescription = Prescription::with(['patient', 'doctor', 'visit', 'items.medication'])
                                   ->findOrFail($id);
        return response()->json(['prescription' => $prescription]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'doctor_id' => 'required|exists:users,id',
            'visit_id' => 'nullable|uuid|exists:patient_visits,id',
            'prescription_date' => 'required|date',
            'diagnosis' => 'nullable|string',
            'notes' => 'nullable|string',
            'items' => 'required|array',
            'items.*.medication_id' => 'nullable|uuid|exists:medications,id',
            'items.*.medication_name' => 'required|string',
            'items.*.dosage' => 'required|string',
            'items.*.frequency' => 'required|string',
            'items.*.duration' => 'required|string',
            'items.*.quantity' => 'required|integer|min:1',
            'items.*.instructions' => 'nullable|string',
        ]);

        DB::beginTransaction();
        try {
            $prescriptionData = collect($validated)->except('items')->toArray();
            $prescriptionData['id'] = (string) Str::uuid();
            
            $prescription = Prescription::create($prescriptionData);

            foreach ($validated['items'] as $item) {
                $item['id'] = (string) Str::uuid();
                $item['prescription_id'] = $prescription->id;
                PrescriptionItem::create($item);
            }

            DB::commit();

            return response()->json(['prescription' => $prescription->load(['items', 'patient', 'doctor'])], 201);
        } catch (\Exception $e) {
            DB::rollBack();
            \Log::error('Prescription creation error: ' . $e->getMessage(), [
                'trace' => $e->getTraceAsString(),
                'data' => $validated
            ]);
            return response()->json([
                'error' => 'Failed to create prescription',
                'message' => $e->getMessage()
            ], 500);
        }
    }

    public function update(Request $request, $id)
    {
        $prescription = Prescription::findOrFail($id);

        $validated = $request->validate([
            'diagnosis' => 'nullable|string',
            'notes' => 'nullable|string',
            'status' => 'sometimes|in:Active,Completed,Cancelled',
        ]);

        $prescription->update($validated);

        // When prescription is dispensed → check if visit should move to billing
        if ($prescription->visit_id && $request->input('status') === 'Completed') {
            $visit = \App\Models\PatientVisit::find($prescription->visit_id);
            if ($visit && $visit->current_stage === 'pharmacy') {
                $pending = \App\Models\Prescription::where('visit_id', $visit->id)
                    ->where('status', '!=', 'Completed')
                    ->count();
                if ($pending === 0) {
                    $visit->update([
                        'pharmacy_status'       => 'Completed',
                        'pharmacy_completed_at' => now(),
                        'current_stage'         => 'billing',
                        'billing_status'        => 'Pending',
                    ]);
                    \Log::info('PrescriptionController: all dispensed → billing', ['visit_id' => $visit->id]);
                }
            }
        }

        return response()->json(['prescription' => $prescription->load(['items', 'patient', 'doctor'])]);
    }

    public function destroy($id)
    {
        $prescription = Prescription::findOrFail($id);
        $prescription->items()->delete();
        $prescription->delete();

        return response()->json(['message' => 'Prescription deleted successfully']);
    }
}
