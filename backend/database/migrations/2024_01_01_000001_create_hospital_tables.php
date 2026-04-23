<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Drop default users table and recreate with UUID
        Schema::dropIfExists('users');
        
        Schema::create('users', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('email')->unique();
            $table->timestamp('email_verified_at')->nullable();
            $table->string('password');
            $table->string('phone', 20)->nullable();
            $table->enum('role', ['admin', 'doctor', 'nurse', 'receptionist', 'pharmacist', 'lab_technician', 'billing', 'patient'])->default('patient');
            $table->boolean('is_active')->default(true);
            $table->rememberToken();
            $table->timestamps();
            $table->index(['email', 'role']);
        });

        // User Roles (for multiple roles per user)
        Schema::create('user_roles', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id');
            $table->string('role', 50);
            $table->timestamps();
            $table->index(['user_id', 'role']);
            $table->foreign('user_id')->references('id')->on('users')->onDelete('cascade');
        });

        // Departments
        Schema::create('departments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->text('description')->nullable();
            $table->uuid('head_doctor_id')->nullable();
            $table->decimal('consultation_fee', 10, 2)->default(0);
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('name');
        });

        // Patients
        Schema::create('patients', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('full_name');
            $table->date('date_of_birth');
            $table->enum('gender', ['Male', 'Female', 'Other']);
            $table->string('phone', 20);
            $table->string('email')->nullable();
            $table->text('address');
            $table->string('emergency_contact')->nullable();
            $table->string('emergency_phone', 20)->nullable();
            $table->string('blood_group', 10)->nullable();
            $table->text('allergies')->nullable();
            $table->text('medical_history')->nullable();
            $table->string('insurance_provider')->nullable();
            $table->string('insurance_number', 100)->nullable();
            $table->enum('status', ['Active', 'Inactive'])->default('Active');
            $table->timestamps();
            $table->index(['full_name', 'phone', 'status']);
        });

        // Appointments
        Schema::create('appointments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id');
            $table->uuid('doctor_id');
            $table->uuid('department_id')->nullable();
            $table->dateTime('appointment_date');
            $table->integer('duration')->default(30);
            $table->string('type', 50)->default('Consultation');
            $table->enum('status', ['Scheduled', 'Confirmed', 'In Progress', 'Completed', 'Cancelled'])->default('Scheduled');
            $table->text('reason')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'doctor_id', 'appointment_date', 'status']);
        });

        // Patient Visits
        Schema::create('patient_visits', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id');
            $table->uuid('doctor_id')->nullable();
            $table->uuid('appointment_id')->nullable();
            $table->dateTime('visit_date');
            $table->text('chief_complaint')->nullable();
            $table->text('diagnosis')->nullable();
            $table->text('treatment_plan')->nullable();
            $table->json('vital_signs')->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['Active', 'Completed'])->default('Active');
            $table->timestamps();
            $table->index(['patient_id', 'doctor_id', 'visit_date']);
        });

        // Medical Services
        Schema::create('medical_services', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('service_code', 50)->unique();
            $table->string('service_name');
            $table->string('service_type', 100);
            $table->text('description')->nullable();
            $table->decimal('base_price', 10, 2);
            $table->string('currency', 10)->default('TSH');
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['service_code', 'service_type', 'is_active']);
        });

        // Patient Services
        Schema::create('patient_services', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id');
            $table->uuid('service_id');
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 10, 2);
            $table->decimal('total_price', 10, 2);
            $table->date('service_date');
            $table->enum('status', ['Pending', 'In Progress', 'Completed', 'Cancelled'])->default('Pending');
            $table->text('notes')->nullable();
            $table->uuid('created_by')->nullable();
            $table->uuid('completed_by')->nullable();
            $table->dateTime('completed_at')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'service_id', 'status', 'service_date']);
        });

        // Prescriptions
        Schema::create('prescriptions', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id');
            $table->uuid('doctor_id');
            $table->uuid('visit_id')->nullable();
            $table->date('prescription_date');
            $table->text('diagnosis')->nullable();
            $table->text('notes')->nullable();
            $table->enum('status', ['Active', 'Completed', 'Cancelled'])->default('Active');
            $table->timestamps();
            $table->index(['patient_id', 'doctor_id', 'status']);
        });

        // Prescription Items
        Schema::create('prescription_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('prescription_id');
            $table->string('medication_name');
            $table->string('dosage', 100);
            $table->string('frequency', 100);
            $table->string('duration', 100);
            $table->integer('quantity');
            $table->text('instructions')->nullable();
            $table->timestamps();
            $table->index('prescription_id');
        });

        // Medications (Pharmacy)
        Schema::create('medications', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('generic_name')->nullable();
            $table->string('category', 100)->nullable();
            $table->string('dosage_form', 100)->nullable();
            $table->string('strength', 100)->nullable();
            $table->string('manufacturer')->nullable();
            $table->decimal('unit_price', 10, 2);
            $table->integer('stock_quantity')->default(0);
            $table->integer('reorder_level')->default(10);
            $table->date('expiry_date')->nullable();
            $table->string('batch_number', 100)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index(['name', 'category', 'is_active']);
        });

        // Lab Tests
        Schema::create('lab_tests', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id');
            $table->uuid('doctor_id')->nullable();
            $table->uuid('visit_id')->nullable();
            $table->string('test_name');
            $table->string('test_type', 100)->nullable();
            $table->uuid('service_id')->nullable();
            $table->date('test_date')->nullable();
            $table->enum('status', ['Pending', 'In Progress', 'Completed', 'Cancelled', 'Draft', 'Ordered', 'Sample Collected'])->default('Pending');
            $table->decimal('price', 10, 2)->nullable();
            $table->boolean('is_draft')->default(false);
            $table->text('results')->nullable();
            $table->text('notes')->nullable();
            $table->uuid('performed_by')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'doctor_id', 'status', 'test_date']);
        });

        // Invoices
        Schema::create('invoices', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id');
            $table->uuid('visit_id')->nullable();
            $table->string('invoice_number', 50)->unique();
            $table->date('invoice_date');
            $table->date('due_date')->nullable();
            $table->decimal('total_amount', 10, 2);
            $table->decimal('paid_amount', 10, 2)->default(0);
            $table->decimal('balance', 10, 2);
            $table->enum('status', ['Pending', 'Partial', 'Partially Paid', 'Paid', 'Cancelled'])->default('Pending');
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'invoice_number', 'status']);
        });

        // Invoice Items
        Schema::create('invoice_items', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('invoice_id');
            $table->string('description');
            $table->integer('quantity')->default(1);
            $table->decimal('unit_price', 10, 2);
            $table->decimal('total_price', 10, 2);
            $table->timestamps();
            $table->index('invoice_id');
        });

        // Payments
        Schema::create('payments', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('patient_id')->nullable();
            $table->uuid('invoice_id')->nullable();
            $table->decimal('amount', 10, 2);
            $table->string('payment_method', 50);
            $table->string('payment_type', 100)->nullable();
            $table->string('status', 50)->default('Completed');
            $table->date('payment_date');
            $table->string('reference_number', 100)->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'invoice_id', 'payment_date']);
        });

        // Insurance Companies
        Schema::create('insurance_companies', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name')->unique();
            $table->string('contact_person')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email')->nullable();
            $table->text('address')->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
            $table->index('name');
        });

        // Insurance Claims
        Schema::create('insurance_claims', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('claim_number', 100)->unique();
            $table->uuid('patient_id');
            $table->uuid('insurance_company_id');
            $table->uuid('invoice_id')->nullable();
            $table->decimal('claim_amount', 10, 2);
            $table->decimal('approved_amount', 10, 2)->nullable();
            $table->enum('status', ['Pending', 'Approved', 'Rejected', 'Paid'])->default('Pending');
            $table->date('submission_date');
            $table->date('approval_date')->nullable();
            $table->date('payment_date')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
            $table->index(['patient_id', 'insurance_company_id'], 'ins_claims_patient_company_idx');
            $table->index(['claim_number', 'status'], 'ins_claims_number_status_idx');
        });

        // Activity Logs
        Schema::create('activity_logs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('user_id')->nullable();
            $table->string('action');
            $table->json('details')->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->text('user_agent')->nullable();
            $table->timestamps();
            $table->index(['user_id', 'action', 'created_at']);
        });

        // System Settings
        Schema::create('system_settings', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('setting_key', 100)->unique();
            $table->text('setting_value')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
            $table->index('setting_key');
        });
        
        // Settings (simplified key-value store)
        Schema::create('settings', function (Blueprint $table) {
            $table->string('key', 100)->primary();
            $table->text('value')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });
        
        // Department Fees
        Schema::create('department_fees', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->uuid('department_id')->unique();
            $table->decimal('fee_amount', 10, 2)->default(0);
            $table->timestamps();
            $table->foreign('department_id')->references('id')->on('departments')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('department_fees');
        Schema::dropIfExists('settings');
        Schema::dropIfExists('system_settings');
        Schema::dropIfExists('activity_logs');
        Schema::dropIfExists('insurance_claims');
        Schema::dropIfExists('insurance_companies');
        Schema::dropIfExists('payments');
        Schema::dropIfExists('invoice_items');
        Schema::dropIfExists('invoices');
        Schema::dropIfExists('lab_tests');
        Schema::dropIfExists('medications');
        Schema::dropIfExists('prescription_items');
        Schema::dropIfExists('prescriptions');
        Schema::dropIfExists('patient_services');
        Schema::dropIfExists('medical_services');
        Schema::dropIfExists('patient_visits');
        Schema::dropIfExists('appointments');
        Schema::dropIfExists('patients');
        Schema::dropIfExists('departments');
        Schema::dropIfExists('user_roles');
        Schema::dropIfExists('users');
    }
};
