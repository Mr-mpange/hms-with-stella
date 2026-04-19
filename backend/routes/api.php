<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\PatientController;
use App\Http\Controllers\AppointmentController;
use App\Http\Controllers\DepartmentController;
use App\Http\Controllers\VisitController;
use App\Http\Controllers\PrescriptionController;
use App\Http\Controllers\ServiceController;
use App\Http\Controllers\PaymentController;
use App\Http\Controllers\ICD10Controller;

// Public routes
Route::post('/auth/login', [AuthController::class, 'login']);
Route::post('/auth/register', [AuthController::class, 'register']);

// ZenoPay Webhook (public - no auth required)
Route::post('/payments/zenopay/callback', [\App\Http\Controllers\ZenoPayController::class, 'handleCallback']);

// Health check — shows status of all services independently
Route::get('/health', function () {
    $status = [];

    // Database (critical — system cannot run without this)
    try {
        \DB::connection()->getPdo();
        $status['database'] = ['status' => 'ok', 'critical' => true];
    } catch (\Exception $e) {
        $status['database'] = ['status' => 'error', 'critical' => true, 'error' => $e->getMessage()];
    }

    // IPFS / Pinata (non-critical — records saved to DB, bridged later)
    try {
        $response = \Illuminate\Support\Facades\Http::timeout(5)
            ->withToken(config('ipfs.pinata.jwt'))
            ->get('https://api.pinata.cloud/data/testAuthentication');
        $status['ipfs'] = [
            'status'   => $response->successful() ? 'ok' : 'error',
            'critical' => false,
            'note'     => 'Records still saved to DB if IPFS is down',
        ];
    } catch (\Exception $e) {
        $status['ipfs'] = ['status' => 'unreachable', 'critical' => false, 'note' => 'Non-critical — system continues without IPFS'];
    }

    // Stellar Horizon (CRITICAL — medical records and payments require Stellar)
    try {
        $response = \Illuminate\Support\Facades\Http::timeout(5)
            ->get(config('stellar.horizon_url'));
        $status['stellar'] = [
            'status'   => $response->successful() ? 'ok' : 'error',
            'critical' => true,
            'note'     => 'Medical records and payments require Stellar',
        ];
    } catch (\Exception $e) {
        $status['stellar'] = ['status' => 'unreachable', 'critical' => true, 'note' => 'CRITICAL — record creation and payments are blocked'];
    }

    // Soroban RPC (non-critical — insurance falls back to manual)
    try {
        $body = json_encode(['jsonrpc' => '2.0', 'method' => 'getHealth', 'id' => 1]);
        $response = \Illuminate\Support\Facades\Http::timeout(5)
            ->withBody($body, 'application/json')
            ->post(config('stellar.soroban_rpc_url'));
        $result = $response->json('result.status');
        $status['soroban'] = [
            'status'   => $result === 'healthy' ? 'ok' : 'error',
            'critical' => false,
            'note'     => 'Insurance falls back to manual approval if Soroban is down',
            'contracts' => [
                'insurance' => config('stellar.insurance_contract_id'),
                'payment'   => config('stellar.payment_contract_id'),
            ],
        ];
    } catch (\Exception $e) {
        $status['soroban'] = ['status' => 'unreachable', 'critical' => false, 'note' => 'Non-critical — system continues without Soroban'];
    }

    // Overall system status — database AND Stellar are both critical
    $systemOk = $status['database']['status'] === 'ok'
             && $status['stellar']['status'] === 'ok';

    return response()->json([
        'system'   => $systemOk ? 'operational' : 'degraded',
        'message'  => $systemOk
            ? 'Hospital system is fully operational'
            : 'System degraded — check critical services',
        'services' => $status,
    ], $systemOk ? 200 : 503);
});

// Public logo endpoint (no auth required)
Route::get('/settings/logo', function() {
    $logo = \App\Models\Setting::where('key', 'hospital_logo')->first();
    if ($logo && $logo->value) {
        return response()->json(['logo_url' => $logo->value]);
    }
    return response()->json(['logo_url' => null]);
});

// Public API routes for external system integration (no auth required)
Route::prefix('public')->group(function () {
    // Get all departments
    Route::get('/departments', function() {
        $departments = \App\Models\Department::where('is_active', true)
            ->select('id', 'name', 'description', 'code')
            ->get();
        return response()->json([
            'success' => true,
            'departments' => $departments
        ]);
    });
    
    // Get doctors by department
    Route::get('/departments/{id}/doctors', function($id) {
        $department = \App\Models\Department::find($id);
        if (!$department) {
            return response()->json(['success' => false, 'error' => 'Department not found'], 404);
        }
        
        $doctors = \App\Models\User::where('role', 'doctor')
            ->where('department_id', $id)
            ->select('id', 'name', 'email', 'phone', 'specialization')
            ->get();
            
        return response()->json([
            'success' => true,
            'department' => $department->name,
            'doctors' => $doctors
        ]);
    });
    
    // Get all doctors
    Route::get('/doctors', function() {
        $doctors = \App\Models\User::where('role', 'doctor')
            ->with('department:id,name')
            ->select('id', 'name', 'email', 'phone', 'specialization', 'department_id')
            ->get();
            
        return response()->json([
            'success' => true,
            'doctors' => $doctors
        ]);
    });
    
    // Create appointment (public - for external systems)
    Route::post('/appointments/create', function(Request $request) {
        $validated = $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id',
            'doctor_id' => 'required|exists:users,id',
            'department_id' => 'nullable|uuid|exists:departments,id',
            'appointment_date' => 'required|date',
            'appointment_time' => 'nullable|string',
            'type' => 'nullable|string|max:50',
            'reason' => 'nullable|string',
            'notes' => 'nullable|string',
        ]);

        // Combine date and time if time is provided
        if (isset($validated['appointment_time'])) {
            $validated['appointment_date'] = $validated['appointment_date'] . ' ' . $validated['appointment_time'];
            unset($validated['appointment_time']);
        }

        $validated['id'] = (string) \Illuminate\Support\Str::uuid();
        $validated['status'] = 'Scheduled';
        
        $appointment = \App\Models\Appointment::create($validated);

        return response()->json([
            'success' => true,
            'message' => 'Appointment created successfully',
            'appointment' => $appointment->load(['patient', 'doctor', 'department'])
        ], 201);
    });
    
    // Get patient appointments (requires patient_id)
    Route::get('/appointments/my-appointments', function(Request $request) {
        $request->validate([
            'patient_id' => 'required|uuid|exists:patients,id'
        ]);
        
        $appointments = \App\Models\Appointment::where('patient_id', $request->patient_id)
            ->with(['doctor:id,name,specialization', 'department:id,name'])
            ->orderBy('appointment_date', 'desc')
            ->get();
            
        return response()->json([
            'success' => true,
            'appointments' => $appointments
        ]);
    });
});

// Protected routes
Route::middleware('auth:sanctum')->group(function () {
    // Auth
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);
    
    // Patients
    Route::get('/patients', [PatientController::class, 'index']);
    Route::get('/patients/{id}', [PatientController::class, 'show']);
    Route::post('/patients', [PatientController::class, 'store']);
    Route::put('/patients/{id}', [PatientController::class, 'update']);
    Route::delete('/patients/{id}', [PatientController::class, 'destroy']);
    
    // Appointments
    Route::get('/appointments', [AppointmentController::class, 'index']);
    Route::get('/appointments/{id}', [AppointmentController::class, 'show']);
    Route::post('/appointments', [AppointmentController::class, 'store']);
    Route::put('/appointments/{id}', [AppointmentController::class, 'update']);
    Route::delete('/appointments/{id}', [AppointmentController::class, 'destroy']);
    
    // ICD-10 Code Search
    Route::get('/icd10/search', [ICD10Controller::class, 'search']);
    Route::get('/icd10/stats', [ICD10Controller::class, 'stats']);
    Route::post('/icd10/import', [ICD10Controller::class, 'import']);
    Route::post('/icd10/debug-pdf', [ICD10Controller::class, 'debugPdf']);

    // Departments
    Route::get('/departments', [DepartmentController::class, 'index']);
    
    // Department Fees (must be before {id} route)
    Route::get('/departments/fees', function(Request $request) {
        $fees = \App\Models\DepartmentFee::with('department')->get();
        return response()->json(['fees' => $fees]);
    });
    
    Route::post('/departments/fees', function(Request $request) {
        $request->validate([
            'department_id' => 'required|exists:departments,id',
            'fee_amount' => 'required|numeric|min:0'
        ]);
        
        $fee = \App\Models\DepartmentFee::updateOrCreate(
            ['department_id' => $request->department_id],
            ['fee_amount' => $request->fee_amount]
        );
        
        return response()->json(['success' => true, 'fee' => $fee]);
    });
    
    Route::get('/departments/{id}/doctors', function(Request $request, $id) {
        $doctors = \App\Models\User::where('role', 'doctor')
            ->where('department_id', $id)
            ->get();
        return response()->json(['doctors' => $doctors]);
    });
    
    Route::post('/departments/{id}/doctors', function(Request $request, $id) {
        $request->validate([
            'doctor_id' => 'required|exists:users,id'
        ]);
        
        $doctor = \App\Models\User::findOrFail($request->doctor_id);
        
        // Verify the user is a doctor
        if ($doctor->role !== 'doctor') {
            return response()->json(['error' => 'User is not a doctor'], 400);
        }
        
        $doctor->department_id = $id;
        $doctor->save();
        
        return response()->json(['success' => true, 'doctor' => $doctor]);
    });
    
    Route::delete('/departments/{id}/doctors', function(Request $request, $id) {
        $request->validate([
            'doctor_id' => 'required|exists:users,id'
        ]);
        
        $doctor = \App\Models\User::findOrFail($request->doctor_id);
        $doctor->department_id = null;
        $doctor->save();
        
        return response()->json(['success' => true, 'doctor' => $doctor]);
    });
    
    Route::get('/departments/{id}', [DepartmentController::class, 'show']);
    Route::post('/departments', [DepartmentController::class, 'store']);
    Route::put('/departments/{id}', [DepartmentController::class, 'update']);
    Route::delete('/departments/{id}', [DepartmentController::class, 'destroy']);
    
    // Visits
    Route::get('/visits', [VisitController::class, 'index']);
    Route::get('/visits/{id}', [VisitController::class, 'show']);
    Route::post('/visits', [VisitController::class, 'store']);
    Route::put('/visits/{id}', [VisitController::class, 'update']);
    Route::delete('/visits/{id}', [VisitController::class, 'destroy']);
    
    // Prescriptions
    Route::get('/prescriptions', [PrescriptionController::class, 'index']);
    Route::get('/prescriptions/{id}', [PrescriptionController::class, 'show']);
    Route::post('/prescriptions', [PrescriptionController::class, 'store']);
    Route::put('/prescriptions/{id}', [PrescriptionController::class, 'update']);
    Route::delete('/prescriptions/{id}', [PrescriptionController::class, 'destroy']);
    
    // Prescriptions Batch
    Route::post('/prescriptions/batch', function(Request $request) {
        $request->validate([
            'prescriptions' => 'required|array',
        ]);
        
        $created = [];
        foreach ($request->prescriptions as $prescData) {
            $prescription = \App\Models\Prescription::create([
                'id' => \Illuminate\Support\Str::uuid(),
                ...$prescData
            ]);
            $created[] = $prescription;
        }
        
        return response()->json(['prescriptions' => $created, 'count' => count($created)], 201);
    });
    
    // Services
    Route::get('/services', [ServiceController::class, 'index']);
    Route::get('/services/{id}', [ServiceController::class, 'show']);
    Route::post('/services', [ServiceController::class, 'store']);
    Route::put('/services/{id}', [ServiceController::class, 'update']);
    Route::delete('/services/{id}', [ServiceController::class, 'destroy']);
    Route::post('/services/assign', [ServiceController::class, 'assignToPatient']);
    Route::get('/patients/{patientId}/services', [ServiceController::class, 'getPatientServices']);
    
    // Patient Services (alias for services/assign for backward compatibility)
    Route::post('/patient-services', [ServiceController::class, 'assignToPatient']);
    Route::get('/patient-services', [ServiceController::class, 'getAllPatientServices']);
    Route::put('/patient-services/{id}', [ServiceController::class, 'updatePatientService']);
    
    // Service Forms
    Route::post('/service-forms', function(Request $request) {
        $request->validate([
            'visit_id' => 'required|exists:visits,id',
            'patient_id' => 'required|exists:patients,id',
            'form_data' => 'required|array',
            'completed_by' => 'required|exists:users,id'
        ]);
        
        \DB::table('service_forms')->insert([
            'visit_id' => $request->visit_id,
            'patient_id' => $request->patient_id,
            'service_id' => $request->service_id ?? null,
            'form_data' => json_encode($request->form_data),
            'completed_by' => $request->completed_by,
            'completed_at' => now(),
            'created_at' => now(),
            'updated_at' => now()
        ]);
        
        return response()->json(['success' => true, 'message' => 'Form saved']);
    });
    
    // Payments
    Route::get('/payments', [PaymentController::class, 'index']);
    Route::get('/payments/{id}', [PaymentController::class, 'show']);
    Route::post('/payments', [PaymentController::class, 'store']);
    Route::delete('/payments/{id}', [PaymentController::class, 'destroy']);
    
    // ZenoPay Integration
    Route::post('/payments/zenopay/initiate', [\App\Http\Controllers\ZenoPayController::class, 'initiatePayment']);
    Route::post('/payments/zenopay/verify', [\App\Http\Controllers\ZenoPayController::class, 'verifyPayment']);
    Route::get('/payments/zenopay/status/{reference}', [\App\Http\Controllers\ZenoPayController::class, 'getPaymentStatus']);
    
    // Users (admin endpoints)
    Route::get('/users', function(Request $request) {
        $users = \App\Models\User::with('department')->get();
        return response()->json(['users' => $users]);
    });
    
    Route::get('/users/profiles', function(Request $request) {
        $query = \App\Models\User::query();
        
        if ($request->has('role')) {
            $query->where('role', $request->role);
        }
        
        if ($request->has('ids')) {
            $ids = explode(',', $request->ids);
            $query->whereIn('id', $ids);
        }
        
        return response()->json(['profiles' => $query->get()]);
    });
    
    // User Roles (for multi-role support - currently simplified)
    Route::get('/users/roles', function(Request $request) {
        $query = \App\Models\User::query();
        
        if ($request->has('role')) {
            $query->where('role', $request->role);
        }
        
        $users = $query->get();
        $roles = $users->map(function($user) {
            return [
                'user_id' => $user->id,
                'role' => $user->role,
                'user' => $user
            ];
        });
        
        return response()->json(['roles' => $roles]);
    });
    
    Route::post('/users/roles', function(Request $request) {
        $request->validate([
            'user_id' => 'required|exists:users,id',
            'role' => 'required|in:admin,doctor,nurse,receptionist,pharmacist,lab_technician,lab_tech,billing,patient'
        ]);
        
        $user = \App\Models\User::find($request->user_id);
        // Normalize lab_tech to lab_technician for consistency
        $role = $request->role === 'lab_tech' ? 'lab_technician' : $request->role;
        $user->role = $role;
        $user->save();
        
        return response()->json(['success' => true, 'user' => $user]);
    });
    
    // Update user department
    Route::put('/users/{id}/department', function(Request $request, $id) {
        $request->validate([
            'department_id' => 'required|exists:departments,id'
        ]);
        
        $user = \App\Models\User::findOrFail($id);
        $user->department_id = $request->department_id;
        $user->save();
        
        return response()->json(['success' => true, 'user' => $user->load('department')]);
    });
    
    // Update user (general)
    Route::put('/users/{id}', function(Request $request, $id) {
        try {
            $user = \App\Models\User::findOrFail($id);
            
            $validated = $request->validate([
                'name' => 'sometimes|string|max:255',
                'full_name' => 'sometimes|string|max:255',
                'email' => 'sometimes|email|unique:users,email,' . $id,
                'phone' => 'sometimes|nullable|string|max:20',
                'role' => 'sometimes|in:admin,doctor,nurse,receptionist,pharmacist,lab_technician,patient,billing',
                'department_id' => 'sometimes|nullable|exists:departments,id',
                'is_active' => 'sometimes|boolean'
            ]);
            
            // Handle full_name -> name mapping
            if (isset($validated['full_name']) && !isset($validated['name'])) {
                $validated['name'] = $validated['full_name'];
                unset($validated['full_name']);
            }
            
            $user->update($validated);
            
            return response()->json(['success' => true, 'user' => $user->load('department')]);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Validation failed',
                'errors' => $e->errors()
            ], 422);
        }
    });
    
    // Settings
    Route::get('/settings', function(Request $request) {
        $settings = \App\Models\Setting::all();
        $settingsArray = $settings->map(function($setting) {
            return [
                'key' => $setting->key,
                'value' => $setting->value
            ];
        });
        return response()->json(['settings' => $settingsArray]);
    });
    
    Route::get('/settings/{key}', function(Request $request, $key) {
        $setting = \App\Models\Setting::where('key', $key)->first();
        return response()->json(['key' => $key, 'value' => $setting ? $setting->value : null]);
    });
    
    Route::put('/settings/{key}', function(Request $request, $key) {
        $request->validate(['value' => 'nullable']);
        
        // Allow empty values for optional settings
        $setting = \App\Models\Setting::updateOrCreate(
            ['key' => $key],
            ['value' => $request->value ?? '']
        );
        
        return response()->json(['success' => true, 'setting' => $setting]);
    });
    

    
    // Services Bulk Import
    Route::post('/services/bulk', function(Request $request) {
        $request->validate([
            'services' => 'required|array',
            'services.*.service_name' => 'required|string',
            'services.*.service_type' => 'required|string',
            'services.*.base_price' => 'required|numeric|min:0',
        ]);
        
        $results = ['success' => 0, 'failed' => 0, 'errors' => []];
        
        foreach ($request->services as $serviceData) {
            try {
                // Add UUID if not present
                if (!isset($serviceData['id'])) {
                    $serviceData['id'] = \Illuminate\Support\Str::uuid();
                }
                
                // Set defaults
                if (!isset($serviceData['currency'])) {
                    $serviceData['currency'] = 'TSh';
                }
                if (!isset($serviceData['is_active'])) {
                    $serviceData['is_active'] = true;
                }
                
                \App\Models\MedicalService::create($serviceData);
                $results['success']++;
            } catch (\Exception $e) {
                $results['failed']++;
                $results['errors'][] = [
                    'service' => $serviceData['service_name'] ?? 'Unknown',
                    'error' => $e->getMessage()
                ];
            }
        }
        
        return response()->json(['results' => $results]);
    });
    
    // Billing/Invoices
    Route::get('/billing/invoices', [\App\Http\Controllers\InvoiceController::class, 'index']);
    Route::get('/billing/invoices/{id}', [\App\Http\Controllers\InvoiceController::class, 'show']);
    Route::post('/billing/invoices', [\App\Http\Controllers\InvoiceController::class, 'store']);
    Route::put('/billing/invoices/{id}', [\App\Http\Controllers\InvoiceController::class, 'update']);
    Route::delete('/billing/invoices/{id}', [\App\Http\Controllers\InvoiceController::class, 'destroy']);
    
    // Invoice Items
    Route::post('/billing/invoice-items', [\App\Http\Controllers\InvoiceController::class, 'storeItem']);
    
    // Invoices (alias routes for backward compatibility)
    Route::get('/invoices', [\App\Http\Controllers\InvoiceController::class, 'index']);
    Route::get('/invoices/{id}', [\App\Http\Controllers\InvoiceController::class, 'show']);
    Route::post('/invoices', [\App\Http\Controllers\InvoiceController::class, 'store']);
    Route::put('/invoices/{id}', [\App\Http\Controllers\InvoiceController::class, 'update']);
    Route::delete('/invoices/{id}', [\App\Http\Controllers\InvoiceController::class, 'destroy']);
    
    // Lab Tests
    Route::get('/lab-tests', [\App\Http\Controllers\LabTestController::class, 'index']);
    Route::get('/lab-tests/{id}', [\App\Http\Controllers\LabTestController::class, 'show']);
    Route::post('/lab-tests', [\App\Http\Controllers\LabTestController::class, 'store']);
    Route::put('/lab-tests/{id}', [\App\Http\Controllers\LabTestController::class, 'update']);
    Route::delete('/lab-tests/{id}', [\App\Http\Controllers\LabTestController::class, 'destroy']);
    
    // Activity Logs
    Route::get('/activity', function(Request $request) {
        $query = \App\Models\ActivityLog::with('user')->orderBy('created_at', 'desc');
        
        if ($request->has('user_id')) {
            $query->where('user_id', $request->user_id);
        }
        
        if ($request->has('action')) {
            $query->where('action', 'like', '%' . $request->action . '%');
        }
        
        if ($request->has('from')) {
            $query->where('created_at', '>=', $request->from);
        }
        
        if ($request->has('to')) {
            $query->where('created_at', '<=', $request->to);
        }
        
        $limit = $request->get('limit', 100);
        $logs = $query->limit($limit)->get();
        
        return response()->json(['logs' => $logs]);
    });
    
    Route::post('/activity', function(Request $request) {
        $request->validate([
            'action' => 'required|string',
            'details' => 'nullable',
        ]);
        
        // Handle details - can be string (JSON) or array
        $details = $request->details;
        if (is_string($details)) {
            $details = json_decode($details, true);
        }
        
        $log = \App\Models\ActivityLog::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'user_id' => $request->user()->id,
            'action' => $request->action,
            'details' => $details,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent(),
        ]);
        
        return response()->json(['log' => $log], 201);
    });
    
    // Insurance Companies
    Route::get('/insurance/companies', function(Request $request) {
        $companies = \App\Models\InsuranceCompany::all();
        return response()->json(['companies' => $companies]);
    });
    
    // Settings Management
    Route::get('/settings', function(Request $request) {
        // Return as array of objects for frontend compatibility
        $settings = \App\Models\Setting::all()->map(function($setting) {
            return [
                'key' => $setting->key,
                'value' => $setting->value,
                'description' => $setting->description
            ];
        });
        return response()->json(['settings' => $settings]);
    });
    
    Route::post('/settings/logo', function(Request $request) {
        $request->validate([
            'logo' => 'required|string', // Base64 encoded image or URL
        ]);
        
        $setting = \App\Models\Setting::updateOrCreate(
            ['key' => 'hospital_logo'],
            ['value' => $request->logo]
        );
        
        return response()->json(['success' => true, 'logo_url' => $setting->value]);
    });
    
    Route::post('/settings', function(Request $request) {
        $request->validate([
            'key' => 'required|string',
            'value' => 'required',
        ]);
        
        $setting = \App\Models\Setting::updateOrCreate(
            ['key' => $request->key],
            ['value' => $request->value]
        );
        
        return response()->json(['success' => true, 'setting' => $setting], 201);
    });
    
    Route::put('/settings/{key}', function(Request $request, $key) {
        $request->validate([
            'value' => 'required',
        ]);
        
        $setting = \App\Models\Setting::updateOrCreate(
            ['key' => $key],
            ['value' => $request->value]
        );
        
        return response()->json(['success' => true, 'setting' => $setting]);
    });
    
    // Mobile Money Payments
    Route::post('/mobile-money/initiate', [App\Http\Controllers\MobileMoneyController::class, 'initiatePayment']);
    Route::get('/mobile-money/status/{paymentId}', [App\Http\Controllers\MobileMoneyController::class, 'checkStatus']);
    Route::post('/mobile-money/callback', [App\Http\Controllers\MobileMoneyController::class, 'handleCallback']);
    
    // Insurance Claims
    Route::get('/insurance/claims', function(Request $request) {
        $query = \App\Models\InsuranceClaim::with(['invoice', 'insuranceCompany', 'patient']);
        
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }
        
        $claims = $query->orderBy('created_at', 'desc')->get();
        return response()->json(['claims' => $claims]);
    });
    
    Route::post('/insurance/claims', function(Request $request) {
        $validated = $request->validate([
            'invoice_id' => 'required|exists:invoices,id',
            'insurance_company_id' => 'required|exists:insurance_companies,id',
            'claim_amount' => 'required|numeric|min:0',
            'claim_number' => 'nullable|string',
            'patient_id' => 'nullable|exists:patients,id',
            'submission_date' => 'nullable|date',
            'status' => 'nullable|in:Pending,Approved,Rejected,Paid',
            'notes' => 'nullable|string'
        ]);

        // Auto-generate claim number if not provided
        $claimNumber = $validated['claim_number'] ?? ('CLM-' . date('Ymd') . '-' . str_pad(\App\Models\InsuranceClaim::whereDate('created_at', today())->count() + 1, 4, '0', STR_PAD_LEFT));
        // Ensure uniqueness
        while (\App\Models\InsuranceClaim::where('claim_number', $claimNumber)->exists()) {
            $claimNumber = 'CLM-' . date('Ymd') . '-' . rand(1000, 9999);
        }
        
        $claim = \App\Models\InsuranceClaim::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'invoice_id' => $validated['invoice_id'],
            'insurance_company_id' => $validated['insurance_company_id'],
            'patient_id' => $validated['patient_id'] ?? null,
            'claim_amount' => $validated['claim_amount'],
            'claim_number' => $claimNumber,
            'submission_date' => $validated['submission_date'] ?? now()->toDateString(),
            'status' => $validated['status'] ?? 'Pending',
            'notes' => $validated['notes'] ?? null,
        ]);
        
        return response()->json(['claim' => $claim], 201);
    });

    Route::put('/insurance/claims/{id}', function(Request $request, $id) {
        $claim = \App\Models\InsuranceClaim::findOrFail($id);
        $validated = $request->validate([
            'status'          => 'sometimes|in:Pending,Approved,Rejected,Paid',
            'approved_amount' => 'sometimes|nullable|numeric|min:0',
            'approval_date'   => 'sometimes|nullable|date',
            'payment_date'    => 'sometimes|nullable|date',
            'notes'           => 'sometimes|nullable|string',
        ]);
        $claim->update($validated);
        return response()->json(['claim' => $claim->load(['patient', 'insuranceCompany'])]);
    });
    
    // Appointment Visits (from patient_visits table - for appointment-based workflow)
    Route::get('/appointment-visits', function(Request $request) {
        $query = DB::table('patient_visits');
        
        if ($request->has('overall_status')) {
            $query->where('overall_status', $request->overall_status);
        }
        
        if ($request->has('current_stage')) {
            $query->where('current_stage', $request->current_stage);
        }
        
        $visits = $query->get();
        return response()->json(['visits' => $visits]);
    });
    
    // Patient Visits (alternative endpoint - legacy)
    Route::get('/patient-visits', function(Request $request) {
        $query = DB::table('patient_visits');
        
        if ($request->has('status')) {
            $query->where('overall_status', $request->status);
        }
        
        if ($request->has('ready_for_discharge') && $request->ready_for_discharge === 'true') {
            $query->where('pharmacy_status', 'Completed')
                  ->where('billing_status', 'Completed');
        }
        
        $visits = $query->get();
        return response()->json(['visits' => $visits]);
    });
    
    // Pharmacy Medications
    Route::get('/pharmacy/medications', function(Request $request) {
        $query = \App\Models\Medication::query();
        
        if ($request->has('search')) {
            $query->where('name', 'like', '%' . $request->search . '%');
        }
        
        $medications = $query->orderBy('name')->get();
        return response()->json(['medications' => $medications]);
    });
    
    Route::get('/pharmacy/medications/{id}', function(Request $request, $id) {
        $medication = \App\Models\Medication::findOrFail($id);
        return response()->json(['medication' => $medication]);
    });
    
    Route::post('/pharmacy/medications', function(Request $request) {
        $request->validate([
            'name' => 'required|string',
            'generic_name' => 'nullable|string',
            'dosage_form' => 'required|string',
            'strength' => 'required|string',
            'quantity_in_stock' => 'required|integer|min:0',
            'unit_price' => 'required|numeric|min:0',
        ]);

        $qty = $request->quantity_in_stock ?? $request->stock_quantity ?? 0;

        $medication = \App\Models\Medication::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'name' => $request->name,
            'generic_name' => $request->generic_name,
            'dosage_form' => $request->dosage_form,
            'strength' => $request->strength,
            'stock_quantity' => $qty,
            'initial_quantity' => $qty,
            'stock_updated_at' => now(),
            'unit_price' => $request->unit_price,
            'manufacturer' => $request->manufacturer,
            'expiry_date' => $request->expiry_date,
        ]);
        
        return response()->json(['medication' => $medication], 201);
    });
    
    Route::put('/pharmacy/medications/{id}', function(Request $request, $id) {
        try {
            $medication = \App\Models\Medication::findOrFail($id);
            
            // Validate the input
            $validated = $request->validate([
                'quantity_in_stock' => 'sometimes|integer|min:0',
                'stock_quantity' => 'sometimes|integer|min:0',
                'initial_quantity' => 'sometimes|integer|min:0',
                'name' => 'sometimes|string',
                'generic_name' => 'sometimes|string|nullable',
                'category' => 'sometimes|string|nullable',
                'dosage_form' => 'sometimes|string|nullable',
                'strength' => 'sometimes|string|nullable',
                'manufacturer' => 'sometimes|string|nullable',
                'unit_price' => 'sometimes|numeric|min:0',
                'reorder_level' => 'sometimes|integer|min:0|nullable',
                'expiry_date' => 'sometimes|date|nullable',
                'batch_number' => 'sometimes|string|nullable',
                'is_active' => 'sometimes|boolean',
            ]);
            
            // Handle both quantity_in_stock and stock_quantity
            if (isset($validated['quantity_in_stock'])) {
                $newQty = $validated['quantity_in_stock'];
                $validated['stock_quantity'] = $newQty;
                unset($validated['quantity_in_stock']);

                if ($newQty > $medication->stock_quantity) {
                    $validated['initial_quantity'] = $newQty;
                }
                $validated['stock_updated_at'] = now();
            } elseif (isset($validated['stock_quantity'])) {
                if ($validated['stock_quantity'] > $medication->stock_quantity) {
                    $validated['initial_quantity'] = $validated['stock_quantity'];
                }
                $validated['stock_updated_at'] = now();
            }
            
            $oldQty = $medication->stock_quantity;
            $medication->update($validated);
            $medication->refresh();

            // Log stock change if quantity changed
            $newQty = $medication->stock_quantity;
            if ($newQty !== $oldQty) {
                $change = $newQty - $oldQty;
                $logType = $request->input('_log_type', $change > 0 ? 'restock' : 'dispense');
                \DB::table('medication_stock_logs')->insert([
                    'id' => \Illuminate\Support\Str::uuid(),
                    'medication_id' => $medication->id,
                    'quantity_before' => $oldQty,
                    'quantity_after' => $newQty,
                    'change' => $change,
                    'type' => $logType,
                    'reference' => $request->input('_log_reference'),
                    'notes' => $request->input('_log_notes') ?: ($change > 0 ? 'Manual restock' : 'Stock adjustment'),
                    'performed_by' => auth()->id(),
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }

            return response()->json(['medication' => $medication]);
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'error' => 'Medication not found',
                'message' => "Medication with ID {$id} does not exist"
            ], 404);
        } catch (\Illuminate\Validation\ValidationException $e) {
            return response()->json([
                'error' => 'Validation failed',
                'details' => $e->errors()
            ], 422);
        } catch (\Exception $e) {
            \Log::error('Medication update error: ' . $e->getMessage(), [
                'id' => $id,
                'request' => $request->all(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'error' => 'Failed to update medication',
                'message' => $e->getMessage(),
                'type' => get_class($e)
            ], 500);
        }
    });
    
    Route::delete('/pharmacy/medications/{id}', function(Request $request, $id) {
        try {
            $medication = \App\Models\Medication::findOrFail($id);
            
            // Check if medication is used in any prescriptions
            $prescriptionItemsCount = \DB::table('prescription_items')
                ->where('medication_id', $id)
                ->count();
            
            if ($prescriptionItemsCount > 0) {
                return response()->json([
                    'error' => 'Cannot delete medication',
                    'message' => "This medication is used in {$prescriptionItemsCount} prescription(s). Please remove it from all prescriptions first."
                ], 422);
            }
            
            $medicationName = $medication->name;
            $medication->delete();
            
            \Log::info('Medication deleted', [
                'medication_id' => $id,
                'medication_name' => $medicationName,
                'deleted_by' => auth()->user()->id ?? 'system'
            ]);
            
            return response()->json([
                'message' => "Medication '{$medicationName}' deleted successfully"
            ]);
            
        } catch (\Illuminate\Database\Eloquent\ModelNotFoundException $e) {
            return response()->json([
                'error' => 'Medication not found',
                'message' => "Medication with ID {$id} does not exist"
            ], 404);
        } catch (\Exception $e) {
            \Log::error('Medication deletion error: ' . $e->getMessage(), [
                'medication_id' => $id,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json([
                'error' => 'Failed to delete medication',
                'message' => $e->getMessage()
            ], 500);
        }
    });
    
    // Stock history for a medication
    Route::get('/pharmacy/medications/{id}/stock-history', function(Request $request, $id) {
        $logs = \DB::table('medication_stock_logs')
            ->where('medication_id', $id)
            ->orderBy('created_at', 'desc')
            ->limit(100)
            ->get();
        return response()->json(['logs' => $logs]);
    });

    Route::post('/pharmacy/medications/bulk', function(Request $request) {
        $request->validate([
            'medications' => 'required|array',
        ]);
        
        $results = ['success' => 0, 'failed' => 0, 'errors' => []];
        
        foreach ($request->medications as $medData) {
            try {
                \App\Models\Medication::create([
                    'id' => \Illuminate\Support\Str::uuid(),
                    ...$medData
                ]);
                $results['success']++;
            } catch (\Exception $e) {
                $results['failed']++;
                $results['errors'][] = $e->getMessage();
            }
        }
        
        return response()->json(['results' => $results]);
    });
    
    // Labs (alternative endpoint for lab-tests)
    Route::get('/labs', function(Request $request) {
        $query = \App\Models\LabTest::with(['patient', 'doctor']);
        
        if ($request->has('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }
        
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        if ($request->has('from')) {
            $query->whereDate('created_at', '>=', $request->from);
        }

        if ($request->has('to')) {
            $query->whereDate('created_at', '<=', $request->to);
        }
        
        if ($request->has('limit')) {
            $query->limit($request->limit);
        }
        
        // FIXED: Prioritize active tests over completed ones
        // Order by: Active tests first (Pending, In Progress), then by creation date
        $tests = $query->orderByRaw("
            CASE 
                WHEN status IN ('Pending', 'In Progress', 'Sample Collected', 'Ordered') THEN 0
                WHEN status = 'Cancelled' THEN 1  
                WHEN status = 'Completed' THEN 2
                ELSE 3
            END ASC, created_at DESC
        ")->get();
        
        // Transform tests to include lab_results as an array
        $testsWithResults = $tests->map(function($test) {
            $testArray = $test->toArray();
            // Parse results JSON field into lab_results array
            if (isset($testArray['results']) && is_string($testArray['results'])) {
                $testArray['lab_results'] = json_decode($testArray['results'], true) ?: [];
            } else if (isset($testArray['results']) && is_array($testArray['results'])) {
                $testArray['lab_results'] = $testArray['results'];
            } else {
                $testArray['lab_results'] = [];
            }
            return $testArray;
        });
        
        return response()->json(['labTests' => $testsWithResults, 'tests' => $testsWithResults]);
    });
    
    Route::post('/labs', function(Request $request) {
        $request->validate([
            'patient_id' => 'required|exists:patients,id',
            'test_name' => 'required|string',
            'test_type' => 'nullable|string',
        ]);
        
        // Map 'Ordered' status to 'Pending' (valid enum value)
        $status = $request->status ?? 'Pending';
        if ($status === 'Ordered') {
            $status = 'Pending';
        }
        
        $labTest = \App\Models\LabTest::create([
            'id' => \Illuminate\Support\Str::uuid(),
            'patient_id' => $request->patient_id,
            'test_name' => $request->test_name,
            'test_type' => $request->test_type ?? 'Laboratory',
            'doctor_id' => $request->doctor_id ?? $request->user()->id,
            'test_date' => $request->test_date ?? $request->ordered_date ?? now()->toDateString(),
            'status' => $status,
            'notes' => $request->notes ?? $request->instructions,
        ]);
        
        // Create invoice for lab test
        try {
            // Find the service price for this lab test
            $service = \App\Models\MedicalService::where('service_name', $request->test_name)
                ->orWhere('service_name', 'like', '%' . $request->test_name . '%')
                ->first();
            
            $testPrice = $service ? $service->base_price : 5000; // Default price if not found
            
            // Generate invoice number
            $date = date('Ymd');
            $count = \App\Models\Invoice::whereDate('created_at', today())->count() + 1;
            $invoiceNumber = 'INV-' . $date . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
            
            // Ensure uniqueness
            while (\App\Models\Invoice::where('invoice_number', $invoiceNumber)->exists()) {
                $count++;
                $invoiceNumber = 'INV-' . $date . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
            }
            
            $invoice = \App\Models\Invoice::create([
                'id' => \Illuminate\Support\Str::uuid(),
                'invoice_number' => $invoiceNumber,
                'patient_id' => $request->patient_id,
                'total_amount' => $testPrice,
                'paid_amount' => 0,
                'balance' => $testPrice,
                'status' => 'Pending',
                'invoice_date' => now()->toDateString(),
                'notes' => 'Lab Test: ' . $request->test_name,
            ]);
            
            // Create invoice item
            \App\Models\InvoiceItem::create([
                'id' => \Illuminate\Support\Str::uuid(),
                'invoice_id' => $invoice->id,
                'service_id' => $service ? $service->id : null,
                'description' => 'Lab Test: ' . $request->test_name,
                'quantity' => 1,
                'unit_price' => $testPrice,
                'total_price' => $testPrice,
            ]);
            
            \Log::info('Invoice created for lab test', [
                'lab_test_id' => $labTest->id,
                'invoice_id' => $invoice->id,
                'invoice_number' => $invoiceNumber
            ]);
        } catch (\Exception $e) {
            \Log::error('Failed to create invoice for lab test: ' . $e->getMessage());
            // Don't fail the lab test creation if invoice fails
        }
        
        return response()->json(['labTest' => $labTest], 201);
    });
    
    Route::put('/labs/{id}', function(Request $request, $id) {
        $labTest = \App\Models\LabTest::findOrFail($id);

        // 30-minute edit window: only lab staff can edit within 30 min of creation
        // After that, only admin can edit
        $createdAt = $labTest->created_at;
        $minutesSinceCreation = $createdAt ? now()->diffInMinutes($createdAt) : 0;
        $isWithinEditWindow = $minutesSinceCreation <= 30;
        $currentUser = auth()->user();
        $isAdmin = $currentUser && $currentUser->role === 'admin';

        // Only block edits to results/status fields (not workflow updates from other stages)
        $isResultEdit = $request->hasAny(['results', 'status']) &&
                        !in_array($request->status, ['In Progress', 'Pending', 'Ordered', 'Sample Collected', 'Cancelled']);

        if ($isResultEdit && !$isWithinEditWindow && !$isAdmin) {
            return response()->json([
                'error' => 'Edit window expired',
                'message' => 'Lab results can only be edited within 30 minutes of creation. Please contact an admin.',
                'created_at' => $createdAt,
                'minutes_elapsed' => $minutesSinceCreation,
            ], 403);
        }
        
        // Prevent marking as Completed without results
        if ($request->has('status') && $request->status === 'Completed') {
            if (empty($labTest->results) && !$request->has('results')) {
                return response()->json([
                    'error' => 'Cannot mark test as Completed without entering results'
                ], 400);
            }
        }
        
        $labTest->update($request->all());
        return response()->json(['labTest' => $labTest]);
    });
    
    Route::get('/labs/services', function(Request $request) {
        // Return lab test services/catalog
        $services = \App\Models\MedicalService::where('service_type', 'Laboratory')->get();
        return response()->json(['services' => $services]);
    });
    
    Route::post('/labs/results/batch', function(Request $request) {
        try {
            $request->validate([
                'results' => 'required|array',
                'testIds' => 'required|array',
            ]);
            
            $updated = 0;
            $errors = [];
            
            // Update test results
            foreach ($request->results as $result) {
                if (isset($result['test_id']) && isset($result['results'])) {
                    try {
                        $test = \App\Models\LabTest::find($result['test_id']);
                        if ($test) {
                            // Store results as JSON string if it's an array
                            $resultsData = is_array($result['results']) 
                                ? json_encode($result['results']) 
                                : $result['results'];
                            
                            $test->results = $resultsData;
                            $test->status = 'Completed';
                            $test->save();
                            $updated++;
                        } else {
                            $errors[] = "Test not found: {$result['test_id']}";
                        }
                    } catch (\Exception $e) {
                        $errors[] = "Error updating test {$result['test_id']}: " . $e->getMessage();
                    }
                }
            }
            
            return response()->json([
                'success' => true, 
                'updated' => $updated,
                'errors' => $errors
            ]);
        } catch (\Exception $e) {
            \Log::error('Batch results error: ' . $e->getMessage());
            \Log::error('Request data: ' . json_encode($request->all()));
            return response()->json([
                'error' => $e->getMessage(),
                'trace' => config('app.debug') ? $e->getTraceAsString() : null
            ], 500);
        }
    });
    
    // Consultations
    Route::post('/consultations', function(Request $request) {
        $request->validate([
            'appointment_id' => 'required|exists:appointments,id',
            'diagnosis' => 'required|string',
            'treatment_plan' => 'nullable|string',
        ]);
        
        // Update the visit/appointment with consultation details
        $appointment = \App\Models\Appointment::findOrFail($request->appointment_id);
        $appointment->update([
            'diagnosis' => $request->diagnosis,
            'treatment_plan' => $request->treatment_plan,
            'status' => 'Completed',
        ]);
        
        // Update related visit
        $visit = \App\Models\PatientVisit::where('appointment_id', $request->appointment_id)->first();
        if ($visit) {
            $visit->update([
                'doctor_status' => 'Completed',
                'doctor_completed_at' => now(),
                'current_stage' => 'pharmacy',
            ]);
        }
        
        return response()->json(['success' => true, 'appointment' => $appointment]);
    });
});

// ─── Decentralized HMS: IPFS + Stellar + Soroban ────────────────────────────
// All routes below require Stellar to be reachable.
// If Stellar is down, these endpoints return 503 — by design.
use App\Http\Controllers\MedicalRecordController;
use App\Http\Controllers\IpfsController;
use App\Http\Controllers\StellarController;
use App\Http\Controllers\SorobanController;

Route::middleware(['auth:sanctum', 'stellar'])->group(function () {

    // Medical Records — requires IPFS + Stellar (CID anchoring)
    Route::post('/records/create',       [MedicalRecordController::class, 'create']);
    Route::get('/records/{patient_id}',  [MedicalRecordController::class, 'getByPatient']);
    Route::post('/records/upload-ipfs',  [MedicalRecordController::class, 'uploadFile']);

    // IPFS
    Route::post('/ipfs/upload',          [IpfsController::class, 'upload']);
    Route::get('/ipfs/{cid}',            [IpfsController::class, 'retrieve']);

    // Stellar
    Route::post('/stellar/store-hash',   [StellarController::class, 'storeHash']);
    Route::post('/stellar/payment',      [StellarController::class, 'payment']);
    Route::get('/stellar/verify/{cid}',  [StellarController::class, 'verify']);

    // Soroban Smart Contracts
    Route::post('/contract/insurance-check',  [SorobanController::class, 'insuranceCheck']);
    Route::post('/contract/release-payment',  [SorobanController::class, 'releasePayment']);
});

// ─── Fiat → Stellar Bridge ───────────────────────────────────────────────────
use App\Http\Controllers\BridgeController;

Route::middleware(['auth:sanctum', 'stellar'])->group(function () {
    Route::post('/bridge/payment/{payment_id}', [BridgeController::class, 'bridgePayment']);
    Route::get('/bridge/rate',                  [BridgeController::class, 'getRate']);
    Route::get('/bridge/convert',               [BridgeController::class, 'convert']);
});

// ─── Account Management ──────────────────────────────────────────────────────
use App\Http\Controllers\AccountController;

// Public (no auth)
Route::post('/account/forgot-password', [AccountController::class, 'forgotPassword']);
Route::post('/account/reset-password',  [AccountController::class, 'resetPassword']);

// Protected
Route::middleware('auth:sanctum')->group(function () {
    // Profile
    Route::get('/account/profile',          [AccountController::class, 'profile']);
    Route::put('/account/profile',          [AccountController::class, 'updateProfile']);

    // Password
    Route::post('/account/change-password', [AccountController::class, 'changePassword']);

    // Stellar Wallet
    Route::post('/account/wallet/generate', [AccountController::class, 'generateWallet']);
    Route::post('/account/wallet/link',     [AccountController::class, 'linkWallet']);
    Route::post('/account/wallet/export',   [AccountController::class, 'exportWallet']);
    Route::delete('/account/wallet',        [AccountController::class, 'removeWallet']);

    // Account
    Route::delete('/account',               [AccountController::class, 'deactivate']);
});

// ─── Patient Identity & Record Sharing ──────────────────────────────────────
use App\Http\Controllers\PatientIdentityController;

// Public — doctor accesses shared records using patient's token
Route::post('/shared-records/access', [PatientIdentityController::class, 'accessShared']);

// Public — look up patient by Stellar key or share code
Route::get('/patients/lookup/{identifier}', [PatientIdentityController::class, 'lookup']);

Route::middleware('auth:sanctum')->group(function () {
    // Assign Stellar identity to a patient
    Route::post('/patients/{id}/identity',              [PatientIdentityController::class, 'assign']);

    // Access grant management (patient controls who sees their records)
    Route::post  ('/patients/{id}/access-grants',       [PatientIdentityController::class, 'grantAccess']);
    Route::get   ('/patients/{id}/access-grants',       [PatientIdentityController::class, 'listGrants']);
    Route::delete('/patients/{id}/access-grants/{grantId}', [PatientIdentityController::class, 'revokeGrant']);
    Route::delete('/patients/{id}/access-grants',       [PatientIdentityController::class, 'revokeAll']);
});

// ─── Patient Account Creation (by reception) ─────────────────────────────────
Route::middleware('auth:sanctum')->group(function () {
    // Reception creates a patient portal account after registering a patient
    // Patient gets phone number as username + default password HMS1234
    Route::post('/patients/{id}/create-account', function (string $id) {
        $patient = \App\Models\Patient::findOrFail($id);
        $svc     = app(\App\Services\AccountService::class);
        $result  = $svc->createPatientAccount($patient);
        return response()->json(['success' => true, ...$result]);
    });
});
