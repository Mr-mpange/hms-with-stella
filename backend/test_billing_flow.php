<?php
require 'vendor/autoload.php';
$app = require 'bootstrap/app.php';
$app->make('Illuminate\Contracts\Console\Kernel')->bootstrap();

$base = 'http://localhost:8000/api';

function req(string $method, string $url, array $data = [], string $token = ''): array {
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_CUSTOMREQUEST, strtoupper($method));
    $headers = ['Content-Type: application/json', 'Accept: application/json'];
    if ($token) $headers[] = "Authorization: Bearer $token";
    curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);
    if ($data) curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
    $body = curl_exec($ch);
    $status = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    return ['status' => $status, 'body' => json_decode($body, true) ?? []];
}

echo "Testing billing auto-invoice flow..." . PHP_EOL;

// Login
$r = req('POST', "$base/auth/login", ['email' => 'doctor@test.com', 'password' => 'password123']);
$token = $r['body']['token'];
$doctorId = $r['body']['user']['id'];
echo "✅ Logged in as doctor" . PHP_EOL;

// Get a patient
$r = req('GET', "$base/patients?limit=1", [], $token);
$patient = $r['body']['patients'][0] ?? null;
if (!$patient) { echo "❌ No patients found"; exit; }
$patientId = $patient['id'];
echo "✅ Patient: {$patient['full_name']}" . PHP_EOL;

// Create a visit
$r = req('POST', "$base/visits", [
    'patient_id'     => $patientId,
    'visit_date'     => date('Y-m-d'),
    'current_stage'  => 'doctor',
    'doctor_status'  => 'Pending',
    'overall_status' => 'Active',
], $token);
$visitId = $r['body']['visit']['id'] ?? '';
echo "✅ Visit created: $visitId" . PHP_EOL;

// Move visit to billing (simulates doctor completing with no lab/pharmacy)
$r = req('PUT', "$base/visits/$visitId", [
    'doctor_status'       => 'Completed',
    'doctor_completed_at' => date('c'),
    'final_diagnosis'     => 'Hypertension',
    'final_icd10_code'    => 'I10',
    'treatment_rx'        => 'Amlodipine 5mg',
    'current_stage'       => 'billing',
    'billing_status'      => 'Pending',
], $token);
echo "✅ Visit moved to billing (status: {$r['status']})" . PHP_EOL;

// Check if invoice was auto-created
sleep(1);
$r = req('GET', "$base/invoices?patient_id=$patientId", [], $token);
$invoices = $r['body']['invoices'] ?? [];
$found = array_filter($invoices, fn($i) => ($i['visit_id'] ?? '') === $visitId);

if (!empty($found)) {
    $inv = array_values($found)[0];
    echo "✅ Invoice auto-created: {$inv['invoice_number']}" . PHP_EOL;
    echo "   Total: TSh " . number_format($inv['total_amount']) . PHP_EOL;
    echo "   Status: {$inv['status']}" . PHP_EOL;
    echo "   Items: " . count($inv['items'] ?? []) . PHP_EOL;
} else {
    echo "❌ No invoice found for visit $visitId" . PHP_EOL;
    echo "   Total invoices for patient: " . count($invoices) . PHP_EOL;
}
