<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Concerns\HasUuids;

class LabTest extends Model
{
    use HasUuids;

    protected $fillable = [
        'patient_id', 'doctor_id', 'visit_id', 'test_name', 'test_type',
        'service_id', 'test_date', 'status', 'results', 'notes', 'performed_by',
        'price', 'is_draft',
    ];

    protected $casts = [
        'test_date' => 'date',
    ];

    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    public function doctor()
    {
        return $this->belongsTo(User::class, 'doctor_id');
    }

    public function visit()
    {
        return $this->belongsTo(PatientVisit::class, 'visit_id');
    }

    public function performedBy()
    {
        return $this->belongsTo(User::class, 'performed_by');
    }
}
