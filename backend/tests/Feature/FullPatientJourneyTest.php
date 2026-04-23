<?php

namespace Tests\Feature;

use App\Models\Department;
use App\Models\Invoice;
use App\Models\LabTest;
use App\Models\Medication;
use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\User;
use Illuminate\Support\Str;
use Tests\TestCase;

/**
 * Full Patient Journey — Registration → Billing
 *
 * Simulates the complete HMS workflow:
 *
 *  1. Receptionist registers patient + books appointment
 *  2. Receptionist checks patient in (creates visit, collects consultation fee)
 *  3. Nurse records vitals
 *  4. Doctor consults, orders lab test + prescribes medication
 *  5. Lab technician completes the test → visit auto-moves to billing
 *  6. Pharmacist dispenses medication
 *  7. Billing collects payment → invoice marked Paid
 *
 * Run with:
 *   php artisan test tests/Feature/FullPatientJourneyTest.php
 */
class FullPatientJourneyTest extends TestCase
{
    // ─── Shared state across steps ───────────────────────────────────────────

    private User       $receptionist;
    private User       $nurse;
    private User       $doctor;
    private User       $labTech;
    private User       $pharmacist;
    private User       $billing;
    private Patient    $patient;
    private array      $receptionHeaders;
    private array      $nurseHeaders;
    private array      $doctorHeaders;
    private array      $labHeaders;
    private array      $pharmacyHeaders;
    private array      $billingHeaders;
    private string     $visitId;
    private string     $appointmentId;
    private string     $labTestId;
    private string     $prescriptionId;
    private string     $invoiceId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedStaff();
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function seedStaff(): void
    {
        $dept = Department::create([
            'id'   => (string) Str::uuid(),
            'name' => 'General Medicine',
            'code' => 'GM',
        ]);

        $this->receptionist = User::factory()->create(['role' => 'receptionist', 'is_active' => true]);
        $this->nurse        = User::factory()->create(['role' => 'nurse',        'is_active' => true]);
        $this->doctor       = User::factory()->create(['role' => 'doctor',       'is_active' => true, 'department_id' => $dept->id]);
        $this->labTech      = User::factory()->create(['role' => 'lab_technician', 'is_active' => true]);
        $this->pharmacist   = User::factory()->create(['role' => 'pharmacist',   'is_active' => true]);
        $this->billing      = User::factory()->create(['role' => 'billing',      'is_active' => true]);

        $this->receptionHeaders = ['Authorization' => 'Bearer ' . $this->receptionist->createToken('t')->plainTextToken];
        $this->nurseHeaders     = ['Authorization' => 'Bearer ' . $this->nurse->createToken('t')->plainTextToken];
        $this->doctorHeaders    = ['Authorization' => 'Bearer ' . $this->doctor->createToken('t')->plainTextToken];
        $this->labHeaders       = ['Authorization' => 'Bearer ' . $this->labTech->createToken('t')->plainTextToken];
        $this->pharmacyHeaders  = ['Authorization' => 'Bearer ' . $this->pharmacist->createToken('t')->plainTextToken];
        $this->billingHeaders   = ['Authorization' => 'Bearer ' . $this->billing->createToken('t')->plainTextToken];
    }

    // ─── THE SINGLE TEST ─────────────────────────────────────────────────────

    public function test_full_patient_journey_from_registration_to_paid_invoice(): void
    {
        // ── STEP 1: Receptionist registers patient ────────────────────────────
        $patientRes = $this->postJson('/api/patients', [
            'full_name'     => 'Amina Hassan',
            'date_of_birth' => '1990-05-15',
            'gender'        => 'Female',
            'phone'         => '+255712345678',
            'blood_group'   => 'O+',
            'address'       => 'Dar es Salaam, Tanzania',
        ], $this->receptionHeaders);

        $patientRes->assertStatus(201);
        $this->patient = Patient::find($patientRes->json('patient.id'));
        $this->assertNotNull($this->patient, 'Patient should be created');

        // ── STEP 2: Receptionist books appointment ────────────────────────────
        $apptRes = $this->postJson('/api/appointments', [
            'patient_id'       => $this->patient->id,
            'doctor_id'        => $this->doctor->id,
            'appointment_date' => now()->toDateTimeString(),
            'type'             => 'Consultation',
            'reason'           => 'Fever and headache',
            'status'           => 'Scheduled',
        ], $this->receptionHeaders);

        $apptRes->assertStatus(201);
        $this->appointmentId = $apptRes->json('appointment.id');

        // ── STEP 3: Receptionist creates visit (check-in) ─────────────────────
        $visitRes = $this->postJson('/api/visits', [
            'patient_id'       => $this->patient->id,
            'doctor_id'        => $this->doctor->id,
            'appointment_id'   => $this->appointmentId,
            'visit_date'       => now()->toDateTimeString(),
            'chief_complaint'  => 'Fever and headache for 3 days',
            'current_stage'    => 'reception',
            'overall_status'   => 'Active',
            'reception_status' => 'Checked In',
        ], $this->receptionHeaders);

        $visitRes->assertStatus(201);
        $this->visitId = $visitRes->json('visit.id');
        $this->assertNotEmpty($this->visitId);

        // ── STEP 4: Receptionist collects consultation fee ────────────────────
        // Create invoice for consultation fee
        $consultInvoiceRes = $this->postJson('/api/billing/invoices', [
            'patient_id'   => $this->patient->id,
            'total_amount' => 10000,
            'paid_amount'  => 0,
            'invoice_date' => now()->toDateString(),
            'status'       => 'Pending',
            'notes'        => 'Consultation fee',
        ], $this->receptionHeaders);

        $consultInvoiceRes->assertStatus(201);
        $consultInvoiceId = $consultInvoiceRes->json('invoice.id');

        // Record consultation payment
        $consultPayRes = $this->postJson('/api/payments', [
            'patient_id'     => $this->patient->id,
            'invoice_id'     => $consultInvoiceId,
            'amount'         => 10000,
            'payment_method' => 'Cash',
            'payment_type'   => 'Consultation Fee',
            'payment_date'   => now()->toDateString(),
        ], $this->receptionHeaders);

        $consultPayRes->assertStatus(201);

        // Consultation invoice should now be Paid
        $this->assertDatabaseHas('invoices', [
            'id'     => $consultInvoiceId,
            'status' => 'Paid',
        ]);

        // Move visit to nurse stage
        $this->putJson("/api/visits/{$this->visitId}", [
            'current_stage'          => 'nurse',
            'reception_status'       => 'Completed',
            'reception_completed_at' => now()->toDateTimeString(),
        ], $this->receptionHeaders)->assertOk();

        // ── STEP 5: Nurse records vitals ──────────────────────────────────────
        $this->putJson("/api/visits/{$this->visitId}", [
            'vital_signs' => [
                'temperature'    => '38.5',
                'blood_pressure' => '120/80',
                'pulse'          => '88',
                'weight'         => '65',
                'height'         => '165',
                'spo2'           => '98',
            ],
            'nurse_notes'          => 'Patient appears febrile. BP normal.',
            'current_stage'        => 'doctor',
            'nurse_status'         => 'Completed',
            'nurse_completed_at'   => now()->toDateTimeString(),
        ], $this->nurseHeaders)->assertOk();

        // ── STEP 6: Doctor consults ───────────────────────────────────────────
        $this->putJson("/api/visits/{$this->visitId}", [
            'provisional_diagnosis' => 'Suspected malaria — pending lab confirmation',
            'doctor_notes'          => 'Patient has fever for 3 days. Ordered malaria RDT.',
            'doctor_status'         => 'In Progress',
            'doctor_started_at'     => now()->toDateTimeString(),
        ], $this->doctorHeaders)->assertOk();

        // ── STEP 7: Doctor orders lab test ────────────────────────────────────
        $labRes = $this->postJson('/api/lab-tests', [
            'patient_id' => $this->patient->id,
            'doctor_id'  => $this->doctor->id,
            'visit_id'   => $this->visitId,
            'test_name'  => 'Malaria RDT',
            'test_type'  => 'Parasitology',
            'test_date'  => now()->toDateString(),
            'status'     => 'Pending',
        ], $this->doctorHeaders);

        $labRes->assertStatus(201);
        $this->labTestId = $labRes->json('labTest.id');

        // ── STEP 8: Doctor prescribes medication ──────────────────────────────
        // Create a medication in stock first
        $medication = Medication::create([
            'id'             => (string) Str::uuid(),
            'name'           => 'Artemether-Lumefantrine',
            'generic_name'   => 'AL',
            'category'       => 'Antimalarial',
            'dosage_form'    => 'Tablet',
            'strength'       => '20/120mg',
            'unit_price'     => 3500,
            'stock_quantity' => 100,
            'is_active'      => true,
        ]);

        $prescRes = $this->postJson('/api/prescriptions', [
            'patient_id'        => $this->patient->id,
            'doctor_id'         => $this->doctor->id,
            'visit_id'          => $this->visitId,
            'prescription_date' => now()->toDateString(),
            'diagnosis'         => 'Malaria',
            'items' => [
                [
                    'medication_id'   => $medication->id,
                    'medication_name' => 'Artemether-Lumefantrine 20/120mg',
                    'dosage'          => '4 tablets',
                    'frequency'       => 'Twice daily',
                    'duration'        => '3 days',
                    'quantity'        => 24,
                    'instructions'    => 'Take with food',
                ],
            ],
        ], $this->doctorHeaders);

        $prescRes->assertStatus(201);
        $this->prescriptionId = $prescRes->json('prescription.id');

        // Doctor completes consultation → move to lab
        $this->putJson("/api/visits/{$this->visitId}", [
            'final_diagnosis'              => 'Malaria',
            'doctor_status'                => 'Completed',
            'doctor_completed_at'          => now()->toDateTimeString(),
            'doctor_consultation_saved_at' => now()->toDateTimeString(),
            'current_stage'                => 'lab',
            'lab_status'                   => 'Pending',
        ], $this->doctorHeaders)->assertOk();

        $this->assertDatabaseHas('patient_visits', [
            'id'            => $this->visitId,
            'current_stage' => 'lab',
        ]);

        // ── STEP 9: Lab technician completes test ─────────────────────────────
        $this->putJson("/api/lab-tests/{$this->labTestId}", [
            'status'       => 'Completed',
            'results'      => json_encode(['result' => 'Positive', 'parasite_count' => '++', 'species' => 'P. falciparum']),
            'notes'        => 'Malaria positive — P. falciparum',
        ], $this->labHeaders)->assertOk();

        // All lab tests done → visit should auto-move to billing
        $this->assertDatabaseHas('patient_visits', [
            'id'            => $this->visitId,
            'current_stage' => 'billing',
        ]);

        // Auto-invoice should have been created
        $invoice = Invoice::where('patient_id', $this->patient->id)
            ->where('visit_id', $this->visitId)
            ->first();

        $this->assertNotNull($invoice, 'Auto-invoice should be created when visit reaches billing');
        $this->assertEquals('Pending', $invoice->status);
        $this->invoiceId = $invoice->id;

        // ── STEP 10: Pharmacist dispenses medication ──────────────────────────
        $this->putJson("/api/prescriptions/{$this->prescriptionId}", [
            'status' => 'Completed',
        ], $this->pharmacyHeaders)->assertOk();

        // ── STEP 11: Billing collects full payment ────────────────────────────
        $invoice->refresh();
        $totalDue = (float) $invoice->total_amount;
        $this->assertGreaterThan(0, $totalDue, 'Invoice total should be > 0');

        $payRes = $this->postJson('/api/payments', [
            'patient_id'     => $this->patient->id,
            'invoice_id'     => $this->invoiceId,
            'amount'         => $totalDue,
            'payment_method' => 'Cash',
            'payment_type'   => 'Full Payment',
            'payment_date'   => now()->toDateString(),
            'notes'          => 'Full payment collected at billing',
        ], $this->billingHeaders);

        $payRes->assertStatus(201);

        // ── STEP 12: Mark visit as completed ─────────────────────────────────
        $this->putJson("/api/visits/{$this->visitId}", [
            'billing_status'        => 'Completed',
            'billing_completed_at'  => now()->toDateTimeString(),
            'current_stage'         => 'completed',
            'overall_status'        => 'Completed',
        ], $this->billingHeaders)->assertOk();

        // ── FINAL ASSERTIONS ──────────────────────────────────────────────────

        // Invoice fully paid
        $this->assertDatabaseHas('invoices', [
            'id'     => $this->invoiceId,
            'status' => 'Paid',
        ]);

        // Payment recorded
        $this->assertDatabaseHas('payments', [
            'patient_id'     => $this->patient->id,
            'invoice_id'     => $this->invoiceId,
            'payment_method' => 'Cash',
        ]);

        // Visit completed
        $this->assertDatabaseHas('patient_visits', [
            'id'             => $this->visitId,
            'overall_status' => 'Completed',
            'billing_status' => 'Completed',
        ]);

        // Invoice has line items (lab test + medication from auto-invoice)
        $itemCount = \App\Models\InvoiceItem::where('invoice_id', $this->invoiceId)->count();
        $this->assertGreaterThan(0, $itemCount, 'Invoice should have at least one line item');

        // Lab test is completed
        $this->assertDatabaseHas('lab_tests', [
            'id'     => $this->labTestId,
            'status' => 'Completed',
        ]);

        // Prescription is dispensed
        $this->assertDatabaseHas('prescriptions', [
            'id'     => $this->prescriptionId,
            'status' => 'Completed',
        ]);
    }
}
