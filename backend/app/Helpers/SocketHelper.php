<?php

namespace App\Helpers;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class SocketHelper
{
    /**
     * Emit a socket event to all connected clients
     */
    public static function emit(string $event, array $data = [], ?string $room = null): bool
    {
        try {
            $socketUrl = env('SOCKET_SERVER_URL', 'http://localhost:3000');
            
            $response = Http::timeout(2)->post("{$socketUrl}/api/socket/emit", [
                'event' => $event,
                'data' => $data,
                'room' => $room
            ]);

            if ($response->successful()) {
                Log::info("Socket event emitted: {$event}", ['data' => $data]);
                return true;
            }

            Log::warning("Failed to emit socket event: {$event}", [
                'status' => $response->status(),
                'response' => $response->body()
            ]);
            return false;

        } catch (\Exception $e) {
            Log::debug("Socket unavailable: {$e->getMessage()}");
            return false;
        }
    }

    /**
     * Emit visit updated event
     */
    public static function visitUpdated($visit): void
    {
        self::emit('visit:updated', [
            'id' => $visit->id,
            'patient_id' => $visit->patient_id,
            'current_stage' => $visit->current_stage,
            'doctor_id' => $visit->doctor_id,
            'overall_status' => $visit->overall_status
        ]);
    }

    /**
     * Emit patient registered event
     */
    public static function patientRegistered($patient): void
    {
        self::emit('patient:registered', [
            'id' => $patient->id,
            'full_name' => $patient->full_name
        ]);
    }

    /**
     * Emit appointment created event
     */
    public static function appointmentCreated($appointment): void
    {
        self::emit('appointment:created', [
            'id' => $appointment->id,
            'patient_id' => $appointment->patient_id,
            'doctor_id' => $appointment->doctor_id,
            'appointment_date' => $appointment->appointment_date
        ]);
    }

    /**
     * Emit lab test completed event
     */
    public static function labCompleted($labTest): void
    {
        self::emit('lab:completed', [
            'id' => $labTest->id,
            'patient_id' => $labTest->patient_id,
            'test_name' => $labTest->test_name
        ]);
    }

    /**
     * Emit prescription created event
     */
    public static function prescriptionCreated($prescription): void
    {
        self::emit('prescription:created', [
            'id' => $prescription->id,
            'patient_id' => $prescription->patient_id
        ]);
    }
}
