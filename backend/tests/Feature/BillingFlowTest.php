<?php

namespace Tests\Feature;

use Tests\TestCase;
use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Invoice;
use App\Models\Payment;
use App\Models\LabTest;
use App\Models\Prescription;
use App\Models\PrescriptionItem;
use App\Models\Medication;
use App\Models\PatientService;
use Illuminate\Support\Str;

class BillingFlowTest extends TestCase
{
    // ─── 1. Invoice CRUD ─────────────────────────────────────────────────────

    public function test_can_create_invoice(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $res = $this->postJson('/api/billing/invoices', [
            'patient_id'   => $patient->id,
            'total_amount' => 15000,
            'paid_amount'  => 0,
            'invoice_date' => now()->toDateString(),
            'status'       => 'Pending',
        ], $headers);

        $res->assertStatus(201)
            ->assertJsonPath('invoice.patient_id', $patient->id)
            ->assertJsonPath('invoice.status', 'Pending')
            ->assertJsonPath('invoice.total_amount', '15000.00');

        $this->assertDatabaseHas('invoices', ['patient_id' => $patient->id, 'status' => 'Pending']);
    }

    public function test_invoice_number_auto_generated(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $res = $this->postJson('/api/billing/invoices', [
            'patient_id'   => $patient->id,
            'total_amount' => 5000,
            'invoice_date' => now()->toDateString(),
        ], $headers);

        $res->assertStatus(201);
        $this->assertStringStartsWith('INV-', $res->json('invoice.invoice_number'));
    }

    public function test_can_list_invoices(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-TEST-0001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 10000,
            'paid_amount'    => 0,
            'balance'        => 10000,
            'status'         => 'Pending',
        ]);

        $res = $this->getJson('/api/billing/invoices', $headers);
        $res->assertOk()->assertJsonStructure(['invoices']);
        $this->assertGreaterThanOrEqual(1, count($res->json('invoices')));
    }

    public function test_can_get_invoice_by_id(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-TEST-0002',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 8000,
            'paid_amount'    => 0,
            'balance'        => 8000,
            'status'         => 'Pending',
        ]);

        $res = $this->getJson("/api/billing/invoices/{$invoice->id}", $headers);
        $res->assertOk()
            ->assertJsonPath('invoice.id', $invoice->id)
            ->assertJsonPath('invoice.invoice_number', 'INV-TEST-0002');
    }

    public function test_can_filter_invoices_by_patient(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient1 = $this->makePatient();
        $patient2 = $this->makePatient();

        Invoice::create([
            'patient_id' => $patient1->id, 'invoice_number' => 'INV-P1-001',
            'invoice_date' => now()->toDateString(), 'total_amount' => 5000,
            'paid_amount' => 0, 'balance' => 5000, 'status' => 'Pending',
        ]);
        Invoice::create([
            'patient_id' => $patient2->id, 'invoice_number' => 'INV-P2-001',
            'invoice_date' => now()->toDateString(), 'total_amount' => 3000,
            'paid_amount' => 0, 'balance' => 3000, 'status' => 'Pending',
        ]);

        $res = $this->getJson("/api/billing/invoices?patient_id={$patient1->id}", $headers);
        $res->assertOk();
        $invoices = $res->json('invoices');
        $this->assertCount(1, $invoices);
        $this->assertEquals($patient1->id, $invoices[0]['patient_id']);
    }

    // ─── 2. Payment Processing ────────────────────────────────────────────────

    public function test_can_record_cash_payment(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-PAY-001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 20000,
            'paid_amount'    => 0,
            'balance'        => 20000,
            'status'         => 'Pending',
        ]);

        $res = $this->postJson('/api/payments', [
            'patient_id'     => $patient->id,
            'invoice_id'     => $invoice->id,
            'amount'         => 20000,
            'payment_method' => 'Cash',
            'payment_date'   => now()->toDateString(),
        ], $headers);

        $res->assertStatus(201)
            ->assertJsonPath('payment.amount', '20000.00');

        // Invoice should now be Paid
        $this->assertDatabaseHas('invoices', [
            'id'     => $invoice->id,
            'status' => 'Paid',
        ]);
    }

    public function test_partial_payment_sets_partially_paid_status(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-PART-001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 30000,
            'paid_amount'    => 0,
            'balance'        => 30000,
            'status'         => 'Pending',
        ]);

        $this->postJson('/api/payments', [
            'patient_id'     => $patient->id,
            'invoice_id'     => $invoice->id,
            'amount'         => 10000,
            'payment_method' => 'Cash',
            'payment_date'   => now()->toDateString(),
        ], $headers)->assertStatus(201);

        $this->assertDatabaseHas('invoices', [
            'id'          => $invoice->id,
            'status'      => 'Partially Paid',
            'paid_amount' => 10000,
        ]);
    }

    public function test_overpayment_is_rejected(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-OVER-001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 5000,
            'paid_amount'    => 0,
            'balance'        => 5000,
            'status'         => 'Pending',
        ]);

        $res = $this->postJson('/api/payments', [
            'patient_id'     => $patient->id,
            'invoice_id'     => $invoice->id,
            'amount'         => 9999,
            'payment_method' => 'Cash',
            'payment_date'   => now()->toDateString(),
        ], $headers);

        $res->assertStatus(422)
            ->assertJsonPath('error', 'payment_exceeds_balance');
    }

    public function test_patient_invoice_mismatch_is_rejected(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient1 = $this->makePatient();
        $patient2 = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient1->id,
            'invoice_number' => 'INV-MIS-001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 5000,
            'paid_amount'    => 0,
            'balance'        => 5000,
            'status'         => 'Pending',
        ]);

        $res = $this->postJson('/api/payments', [
            'patient_id'     => $patient2->id, // wrong patient
            'invoice_id'     => $invoice->id,
            'amount'         => 5000,
            'payment_method' => 'Cash',
            'payment_date'   => now()->toDateString(),
        ], $headers);

        $res->assertStatus(422)
            ->assertJsonPath('error', 'patient_invoice_mismatch');
    }

    public function test_payment_deletion_reverts_invoice(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-DEL-001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 10000,
            'paid_amount'    => 0,
            'balance'        => 10000,
            'status'         => 'Pending',
        ]);

        $payRes = $this->postJson('/api/payments', [
            'patient_id'     => $patient->id,
            'invoice_id'     => $invoice->id,
            'amount'         => 10000,
            'payment_method' => 'Cash',
            'payment_date'   => now()->toDateString(),
        ], $headers);

        $paymentId = $payRes->json('payment.id');

        // Invoice should be Paid
        $this->assertDatabaseHas('invoices', ['id' => $invoice->id, 'status' => 'Paid']);

        // Delete the payment
        $this->deleteJson("/api/payments/{$paymentId}", [], $headers)->assertOk();

        // Invoice should revert to Pending
        $this->assertDatabaseHas('invoices', ['id' => $invoice->id, 'status' => 'Pending']);
    }

    // ─── 3. Auto-Invoice on Billing Stage ────────────────────────────────────

    public function test_auto_invoice_created_when_visit_moves_to_billing(): void
    {
        [$doctor, , $headers] = $this->actingAsUser(['role' => 'doctor']);
        $patient = $this->makePatient();

        // Create a visit at pharmacy stage
        $visit = PatientVisit::create([
            'patient_id'    => $patient->id,
            'visit_date'    => now(),
            'current_stage' => 'pharmacy',
            'overall_status' => 'Active',
        ]);

        // Move to billing stage
        $res = $this->putJson("/api/visits/{$visit->id}", [
            'current_stage' => 'billing',
        ], $headers);

        $res->assertOk();

        // Invoice should be auto-created
        $this->assertDatabaseHas('invoices', [
            'patient_id' => $patient->id,
            'visit_id'   => $visit->id,
        ]);
    }

    public function test_auto_invoice_not_duplicated_on_second_update(): void
    {
        [$doctor, , $headers] = $this->actingAsUser(['role' => 'doctor']);
        $patient = $this->makePatient();

        $visit = PatientVisit::create([
            'patient_id'    => $patient->id,
            'visit_date'    => now(),
            'current_stage' => 'pharmacy',
            'overall_status' => 'Active',
        ]);

        // Move to billing — creates invoice
        $this->putJson("/api/visits/{$visit->id}", ['current_stage' => 'billing'], $headers);

        // Update again (e.g. billing_status) — should NOT create another invoice
        $this->putJson("/api/visits/{$visit->id}", ['billing_status' => 'Completed'], $headers);

        $count = Invoice::where('patient_id', $patient->id)
            ->where('visit_id', $visit->id)
            ->count();

        $this->assertEquals(1, $count);
    }

    public function test_auto_invoice_includes_lab_tests(): void
    {
        [$doctor, , $headers] = $this->actingAsUser(['role' => 'doctor']);
        $patient = $this->makePatient();

        $visit = PatientVisit::create([
            'patient_id'    => $patient->id,
            'visit_date'    => now(),
            'current_stage' => 'pharmacy',
            'overall_status' => 'Active',
        ]);

        // Add a lab test linked to this visit (doctor_id nullable after migration fix)
        LabTest::create([
            'id'         => (string) Str::uuid(),
            'patient_id' => $patient->id,
            'visit_id'   => $visit->id,
            'doctor_id'  => $doctor->id,
            'test_name'  => 'Full Blood Count',
            'price'      => 8000,
            'status'     => 'Completed',
        ]);

        $this->putJson("/api/visits/{$visit->id}", ['current_stage' => 'billing'], $headers);

        $invoice = Invoice::where('visit_id', $visit->id)->first();
        $this->assertNotNull($invoice);
        $this->assertEquals(8000, (float) $invoice->total_amount);

        $this->assertDatabaseHas('invoice_items', [
            'invoice_id'  => $invoice->id,
            'description' => 'Lab Test: Full Blood Count',
        ]);
    }

    // ─── 4. Invoice Items ─────────────────────────────────────────────────────

    public function test_can_add_item_to_invoice(): void
    {
        [, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        $invoice = Invoice::create([
            'patient_id'     => $patient->id,
            'invoice_number' => 'INV-ITEM-001',
            'invoice_date'   => now()->toDateString(),
            'total_amount'   => 0,
            'paid_amount'    => 0,
            'balance'        => 0,
            'status'         => 'Pending',
        ]);

        $res = $this->postJson('/api/billing/invoice-items', [
            'invoice_id'  => $invoice->id,
            'description' => 'Consultation Fee',
            'quantity'    => 1,
            'unit_price'  => 5000,
        ], $headers);

        $res->assertStatus(201)
            ->assertJsonPath('item.description', 'Consultation Fee')
            ->assertJsonPath('item.total_price', '5000.00');
    }

    // ─── 5. Full End-to-End Billing Flow ─────────────────────────────────────

    public function test_full_billing_flow_visit_to_paid_invoice(): void
    {
        [$doctor, , $headers] = $this->actingAsUser(['role' => 'billing']);
        $patient = $this->makePatient();

        // Step 1: Create visit
        $visit = PatientVisit::create([
            'patient_id'    => $patient->id,
            'visit_date'    => now(),
            'current_stage' => 'pharmacy',
            'overall_status' => 'Active',
        ]);

        // Step 2: Add services
        LabTest::create([
            'id' => (string) Str::uuid(), 'patient_id' => $patient->id,
            'visit_id' => $visit->id, 'doctor_id' => $doctor->id,
            'test_name' => 'Malaria Test',
            'price' => 5000, 'status' => 'Completed',
        ]);

        // Step 3: Move to billing — auto-invoice created
        $this->putJson("/api/visits/{$visit->id}", ['current_stage' => 'billing'], $headers);

        $invoice = Invoice::where('visit_id', $visit->id)->first();
        $this->assertNotNull($invoice, 'Invoice should be auto-created');
        $this->assertEquals('Pending', $invoice->status);

        // Step 4: Record payment
        $payRes = $this->postJson('/api/payments', [
            'patient_id'     => $patient->id,
            'invoice_id'     => $invoice->id,
            'amount'         => (float) $invoice->total_amount,
            'payment_method' => 'Cash',
            'payment_date'   => now()->toDateString(),
        ], $headers);

        $payRes->assertStatus(201);

        // Step 5: Invoice should be fully paid
        $invoice->refresh();
        $this->assertEquals('Paid', $invoice->status);
        $this->assertEquals(0, (float) $invoice->balance);
    }
}
