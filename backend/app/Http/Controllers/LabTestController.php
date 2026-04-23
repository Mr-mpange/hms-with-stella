<?php

namespace App\Http\Controllers;

use App\Models\LabTest;
use App\Http\Controllers\VisitController;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class LabTestController extends Controller
{
    public function index(Request $request)
    {
        $query = LabTest::with(['patient', 'doctor']);
        
        if ($request->has('patient_ids')) {
            $ids = explode(',', $request->patient_ids);
            $query->whereIn('patient_id', $ids);
        } elseif ($request->has('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        if ($request->has('visit_id')) {
            $query->where('visit_id', $request->visit_id);
        }

        if ($request->has('doctor_id')) {
            $query->where('doctor_id', $request->doctor_id);
        }
        
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }
        
        if ($request->has('from')) {
            $query->where('created_at', '>=', $request->from);
        }
        
        if ($request->has('to')) {
            $query->where('created_at', '<=', $request->to);
        }
        
        $labTests = $query->orderBy('created_at', 'desc')->get();
        
        return response()->json(['labTests' => $labTests]);
    }
    
    public function show($id)
    {
        $labTest = LabTest::with(['patient', 'doctor'])->findOrFail($id);
        return response()->json(['labTest' => $labTest]);
    }
    
    public function store(Request $request)
    {
        $request->validate([
            'patient_id' => 'required|exists:patients,id',
            'test_name' => 'required|string',
            'test_type' => 'required|string',
            'doctor_id' => 'required|exists:users,id',
            'test_date' => 'required|date',
            'visit_id' => 'nullable|exists:patient_visits,id',
        ]);
        
        $labTest = LabTest::create([
            'id' => Str::uuid(),
            'patient_id' => $request->patient_id,
            'test_name' => $request->test_name,
            'test_type' => $request->test_type,
            'doctor_id' => $request->doctor_id,
            'test_date' => $request->test_date,
            'status' => $request->status ?? 'Pending',
            'notes' => $request->notes,
            'visit_id' => $request->visit_id,
        ]);
        
        return response()->json(['labTest' => $labTest], 201);
    }
    
    public function update(Request $request, $id)
    {
        $labTest = LabTest::findOrFail($id);

        $labTest->update($request->only([
            'status', 'result_value', 'result_unit', 'normal_range',
            'result_notes', 'results', 'notes', 'completed_at',
        ]));

        // When all lab tests for a visit are complete → move visit to billing
        if ($labTest->visit_id && $request->input('status') === 'Completed') {
            $visit = \App\Models\PatientVisit::find($labTest->visit_id);
            if ($visit && $visit->current_stage === 'lab') {
                $pending = \App\Models\LabTest::where('visit_id', $visit->id)
                    ->where('status', '!=', 'Completed')
                    ->count();
                if ($pending === 0) {
                    // Use VisitController to trigger autoCreateInvoice
                    $visitController = app(VisitController::class);
                    $fakeRequest = new \Illuminate\Http\Request();
                    $fakeRequest->merge([
                        'lab_status'       => 'Completed',
                        'lab_completed_at' => now()->toDateTimeString(),
                        'current_stage'    => 'billing',
                        'billing_status'   => 'Pending',
                    ]);
                    $visitController->update($fakeRequest, $visit->id);
                    \Log::info('LabTestController: all tests done → billing', ['visit_id' => $visit->id]);
                }
            }
        }

        return response()->json(['labTest' => $labTest]);
    }
    
    public function destroy($id)
    {
        $labTest = LabTest::findOrFail($id);
        $labTest->delete();
        
        return response()->json(['message' => 'Lab test deleted successfully']);
    }
}
