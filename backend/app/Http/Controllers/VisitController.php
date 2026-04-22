<?php

namespace App\Http\Controllers;

use App\Models\PatientVisit;
use App\Events\PatientVisitUpdated;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class VisitController extends Controller
{
    public function index(Request $request)
    {
        // Include prescriptions and labTests when fetching for a specific patient (for reports)
        $eagerLoad = ['patient', 'doctor', 'appointment'];
        if ($request->has('patient_id')) {
            $eagerLoad[] = 'prescriptions.items';
            $eagerLoad[] = 'labTests';
        }
        $query = PatientVisit::with($eagerLoad);

        // Basic filters
        if ($request->has('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->has('doctor_id')) {
            $query->where('doctor_id', $request->doctor_id);
        }

        if ($request->has('appointment_id')) {
            $query->where('appointment_id', $request->appointment_id);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Workflow stage filters - CRITICAL FIX
        if ($request->has('current_stage')) {
            $query->where('current_stage', $request->current_stage);
        }

        if ($request->has('overall_status')) {
            $query->where('overall_status', $request->overall_status);
        }

        // Stage-specific status filters
        if ($request->has('reception_status')) {
            $query->where('reception_status', $request->reception_status);
        }

        if ($request->has('nurse_status')) {
            $query->where('nurse_status', $request->nurse_status);
        }

        if ($request->has('doctor_status')) {
            $query->where('doctor_status', $request->doctor_status);
        }

        if ($request->has('lab_status')) {
            $query->where('lab_status', $request->lab_status);
        }

        if ($request->has('pharmacy_status')) {
            $query->where('pharmacy_status', $request->pharmacy_status);
        }

        if ($request->has('billing_status')) {
            $query->where('billing_status', $request->billing_status);
        }

        // Date range filters
        if ($request->has('from')) {
            $query->whereDate('visit_date', '>=', $request->from);
        }

        if ($request->has('to')) {
            $query->whereDate('visit_date', '<=', $request->to);
        }

        $visits = $query->orderBy('visit_date', 'desc')
                       ->paginate($request->get('limit', 200));

        return response()->json(['visits' => $visits->items(), 'total' => $visits->total()]);
    }

    public function show($id)
    {
        $visit = PatientVisit::with(['patient', 'doctor', 'appointment', 'prescriptions', 'labTests'])
                            ->findOrFail($id);

        // If no labTests linked via visit_id (legacy records), fall back to patient_id lookup
        if ($visit->labTests->isEmpty()) {
            $visit->setRelation('labTests',
                \App\Models\LabTest::where('patient_id', $visit->patient_id)
                    ->orderBy('created_at', 'desc')
                    ->get()
            );
        }

        return response()->json(['visit' => $visit]);
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'doctor_id' => 'nullable|exists:users,id',
            'appointment_id' => 'nullable|uuid|exists:appointments,id',
            'visit_date' => 'required|date',
            'chief_complaint' => 'nullable|string',
            'diagnosis' => 'nullable|string', // Keep for backward compatibility
            'provisional_diagnosis' => 'nullable|string',
            'treatment_plan' => 'nullable|string',
            'vital_signs' => 'nullable|array',
            'notes' => 'nullable|string',
            // Comprehensive medical history fields
            'chief_complaint_detailed' => 'nullable|string',
            'history_present_illness' => 'nullable|string',
            'review_of_systems' => 'nullable|string',
            'past_medical_history' => 'nullable|string',
            'family_social_history' => 'nullable|string',
            'obstetric_history' => 'nullable|string',
            'developmental_milestones' => 'nullable|string',
            'investigation_plan' => 'nullable|string',
            'final_diagnosis' => 'nullable|string',
            'treatment_rx' => 'nullable|string',
            'other_management' => 'nullable|string',
            'provisional_diagnosis_completed' => 'nullable|boolean',
            // Workflow fields - CRITICAL FIX
            'current_stage' => 'nullable|string',
            'overall_status' => 'nullable|string',
            'reception_status' => 'nullable|string',
            'nurse_status' => 'nullable|string',
            'doctor_status' => 'nullable|string',
            'lab_status' => 'nullable|string',
            'pharmacy_status' => 'nullable|string',
            'billing_status' => 'nullable|string',
            'reception_completed_at' => 'nullable|date',
            'nurse_completed_at' => 'nullable|date',
            'doctor_completed_at' => 'nullable|date',
            'lab_completed_at' => 'nullable|date',
            'pharmacy_completed_at' => 'nullable|date',
            'billing_completed_at' => 'nullable|date',
        ]);

        $validated['id'] = (string) Str::uuid();
        $visit = PatientVisit::create($validated);

        return response()->json(['visit' => $visit->load(['patient', 'doctor'])], 201);
    }

    public function update(Request $request, $id)
    {
        $visit = PatientVisit::findOrFail($id);

        $validated = $request->validate([
            'chief_complaint' => 'nullable|string',
            'diagnosis' => 'nullable|string', // Keep for backward compatibility
            'provisional_diagnosis' => 'nullable|string',
            'treatment_plan' => 'nullable|string',
            'vital_signs' => 'nullable|array',
            'notes' => 'nullable|string',
            'nurse_notes' => 'nullable|string',
            'doctor_notes' => 'nullable|string',
            'doctor_diagnosis' => 'nullable|string',
            'doctor_started_at' => 'nullable|date',
            'doctor_consultation_saved_at' => 'nullable|date',
            'lab_notes' => 'nullable|string',
            'status' => 'sometimes|in:Active,Completed',
            // Comprehensive medical history fields
            'chief_complaint_detailed' => 'nullable|string',
            'history_present_illness' => 'nullable|string',
            'review_of_systems' => 'nullable|string',
            'past_medical_history' => 'nullable|string',
            'family_social_history' => 'nullable|string',
            'obstetric_history' => 'nullable|string',
            'developmental_milestones' => 'nullable|string',
            'investigation_plan' => 'nullable|string',
            'final_diagnosis' => 'nullable|string',
            'treatment_rx' => 'nullable|string',
            'other_management' => 'nullable|string',
            'provisional_diagnosis_completed' => 'sometimes|boolean',
            // Workflow fields
            'current_stage' => 'sometimes|string',
            'overall_status' => 'sometimes|string',
            'reception_status' => 'sometimes|string',
            'nurse_status' => 'sometimes|string',
            'doctor_status' => 'sometimes|string',
            'lab_status' => 'sometimes|string',
            'pharmacy_status' => 'sometimes|string',
            'billing_status' => 'sometimes|string',
            'reception_completed_at' => 'sometimes|date',
            'nurse_completed_at' => 'sometimes|date',
            'doctor_completed_at' => 'sometimes|date',
            'lab_completed_at' => 'sometimes|date',
            'pharmacy_completed_at' => 'sometimes|date',
            'billing_completed_at' => 'sometimes|date',
            'lab_results_reviewed' => 'sometimes|boolean',
            'lab_results_reviewed_at' => 'sometimes|date',
        ]);

        $visit->update($validated);

        // ── Auto-create invoice when visit reaches billing stage ──────────
        $movingToBilling = isset($validated['current_stage'])
            && $validated['current_stage'] === 'billing'
            && $visit->getOriginal('current_stage') !== 'billing';

        if ($movingToBilling) {
            $this->autoCreateInvoice($visit);
        }

        // Broadcast real-time update via WebSocket
        broadcast(new PatientVisitUpdated($visit, 'updated'))->toOthers();

        // Emit socket event for real-time updates (legacy support)
        try {
            \App\Helpers\SocketHelper::visitUpdated($visit);
        } catch (\Exception $e) {
            \Log::warning('Failed to emit socket event: ' . $e->getMessage());
        }

        return response()->json(['visit' => $visit->load(['patient', 'doctor'])]);
    }

    public function destroy($id)
    {
        $visit = PatientVisit::findOrFail($id);
        $visit->delete();

        return response()->json(['message' => 'Visit deleted successfully']);
    }

    // ─── Auto-create invoice when visit reaches billing ──────────────────────

    private function autoCreateInvoice(\App\Models\PatientVisit $visit): void
    {
        // Don't create if invoice already exists for this visit
        $existing = \App\Models\Invoice::where('patient_id', $visit->patient_id)
            ->where('visit_id', $visit->id)
            ->first();

        if ($existing) return;

        $items    = [];
        $total    = 0;

        // 1. Lab tests ordered for this visit
        $labTests = \App\Models\LabTest::where('visit_id', $visit->id)
            ->orWhere(function ($q) use ($visit) {
                $q->where('patient_id', $visit->patient_id)
                  ->whereDate('created_at', $visit->visit_date ?? today());
            })
            ->get();

        foreach ($labTests as $lab) {
            $price = $lab->price ?? 5000; // default 5000 TZS if no price set
            $items[] = [
                'description' => 'Lab Test: ' . $lab->test_name,
                'quantity'    => 1,
                'unit_price'  => $price,
                'total_price' => $price,
            ];
            $total += $price;
        }

        // 2. Prescriptions / medications
        $prescriptions = \App\Models\Prescription::where('visit_id', $visit->id)->get();
        foreach ($prescriptions as $presc) {
            $prescItems = \App\Models\PrescriptionItem::where('prescription_id', $presc->id)->get();
            foreach ($prescItems as $item) {
                $med   = $item->medication;
                $price = ($med?->selling_price ?? $med?->unit_price ?? 0) * ($item->quantity ?? 1);
                if ($price > 0) {
                    $items[] = [
                        'description' => 'Medication: ' . ($item->medication_name ?? $med?->name ?? 'Medication'),
                        'quantity'    => $item->quantity ?? 1,
                        'unit_price'  => $med?->selling_price ?? $med?->unit_price ?? 0,
                        'total_price' => $price,
                    ];
                    $total += $price;
                }
            }
        }

        // 3. Patient services (procedures)
        $services = \App\Models\PatientService::where('visit_id', $visit->id)->get();
        foreach ($services as $svc) {
            $price = $svc->total_price ?? $svc->unit_price ?? 0;
            if ($price > 0) {
                $items[] = [
                    'description' => 'Service: ' . ($svc->service_name ?? 'Procedure'),
                    'quantity'    => $svc->quantity ?? 1,
                    'unit_price'  => $svc->unit_price ?? $price,
                    'total_price' => $price,
                ];
                $total += $price;
            }
        }

        // 4. Consultation fee from department settings
        $deptFee = 0;
        if ($visit->doctor_id) {
            $doctor = \App\Models\User::find($visit->doctor_id);
            if ($doctor?->department_id) {
                $deptFee = \App\Models\DepartmentFee::where('department_id', $doctor->department_id)
                    ->value('consultation_fee') ?? 0;
            }
        }
        if ($deptFee == 0) {
            $deptFee = \App\Models\Setting::where('key', 'consultation_fee')->value('value') ?? 0;
        }
        if ($deptFee > 0) {
            $items[] = [
                'description' => 'Consultation Fee',
                'quantity'    => 1,
                'unit_price'  => $deptFee,
                'total_price' => $deptFee,
            ];
            $total += $deptFee;
        }

        // If nothing to bill, create a zero invoice so billing staff can see the visit
        if ($total == 0 && empty($items)) {
            $items[] = ['description' => 'Consultation', 'quantity' => 1, 'unit_price' => 0, 'total_price' => 0];
        }

        // Generate invoice number
        $date    = date('Ymd');
        $count   = \App\Models\Invoice::whereDate('created_at', today())->count() + 1;
        $invNum  = 'INV-' . $date . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        while (\App\Models\Invoice::where('invoice_number', $invNum)->exists()) {
            $count++;
            $invNum = 'INV-' . $date . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        }

        $invoice = \App\Models\Invoice::create([
            'id'             => (string) \Illuminate\Support\Str::uuid(),
            'invoice_number' => $invNum,
            'patient_id'     => $visit->patient_id,
            'visit_id'       => $visit->id,
            'total_amount'   => $total,
            'paid_amount'    => 0,
            'balance'        => $total,
            'status'         => 'Pending',
            'invoice_date'   => now()->toDateString(),
            'notes'          => 'Auto-generated from visit ' . $visit->id,
        ]);

        foreach ($items as $item) {
            \App\Models\InvoiceItem::create([
                'id'          => (string) \Illuminate\Support\Str::uuid(),
                'invoice_id'  => $invoice->id,
                'description' => $item['description'],
                'quantity'    => $item['quantity'],
                'unit_price'  => $item['unit_price'],
                'total_price' => $item['total_price'],
            ]);
        }

        \Log::info('VisitController: auto-invoice created', [
            'visit_id'   => $visit->id,
            'invoice_id' => $invoice->id,
            'total'      => $total,
            'items'      => count($items),
        ]);
    }
}
