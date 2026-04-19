'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatCard } from '@/components/StatCard';
import { AppointmentsCard } from '@/components/AppointmentsCard';
import { PatientsCard } from '@/components/PatientsCard';
import { QuickServiceDialog } from '@/components/QuickServiceDialog';
import { StatCardSkeleton, AppointmentsCardSkeleton, PatientsCardSkeleton } from '@/components/DashboardSkeleton';
import { mobilePaymentService, MobilePaymentRequest } from '@/lib/mobilePaymentService';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { logActivity } from '@/lib/utils';
import api from '@/lib/api';
import {
  Loader2,
  Building,
  Calendar,
  Clock,
  CheckCircle,
  Users,
  UserPlus,
  Phone,
  Clipboard,
  HeartHandshake,
  Stethoscope,
  Pill,
  Shield,
  Search,
  ChevronDown,
  ChevronUp,
  FileText,
  X,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PatientIdentityDialog } from '@/components/PatientIdentityDialog';

export default function ReceptionistDashboard() {
  const { user } = useAuth();

  // State management
  const [appointments, setAppointments] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [departments, setDepartments] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<any[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<any[]>([]);
  const [showInsurancePanel, setShowInsurancePanel] = useState(false);
  const [insurancePatients, setInsurancePatients] = useState<any[]>([]);
  const [insuranceLoading, setInsuranceLoading] = useState(false);
  const [insuranceSearch, setInsuranceSearch] = useState('');
  const [insuranceFilter, setInsuranceFilter] = useState('');
  const [selectedInsurancePatient, setSelectedInsurancePatient] = useState<any>(null);
  const [showInsuranceDetailDialog, setShowInsuranceDetailDialog] = useState(false);
  const [insuranceClaims, setInsuranceClaims] = useState<any[]>([]);
  const [selectedStellarPatient, setSelectedStellarPatient] = useState<any>(null);
  const [showStellarDialog, setShowStellarDialog] = useState(false);
  const [lastRegisteredPatient, setLastRegisteredPatient] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true); // Initial load only
  const [refreshing, setRefreshing] = useState<boolean>(false); // Background refresh
  const [stats, setStats] = useState<{
    todayAppointments: number;
    pendingAppointments: number;
    completedCheckins: number;
    totalPatients: number;
    nurseQueuePatients: number;
    receptionQueuePatients: number;
  }>({
    todayAppointments: 0,
    pendingAppointments: 0,
    completedCheckins: 0,
    totalPatients: 0,
    nurseQueuePatients: 0,
    receptionQueuePatients: 0,
  });
  
  const [showRegisterDialog, setShowRegisterDialog] = useState(false);
  const [showBookAppointmentDialog, setShowBookAppointmentDialog] = useState(false);

  const [showPatientSearch, setShowPatientSearch] = useState(false);
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showReturningPatientDialog, setShowReturningPatientDialog] = useState(false);
  const [returningPatientSearch, setReturningPatientSearch] = useState('');
  const [returningPatientResults, setReturningPatientResults] = useState<any[]>([]);
  const [roleUpdateIndicator, setRoleUpdateIndicator] = useState<string | null>(null);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [showRegistrationPaymentDialog, setShowRegistrationPaymentDialog] = useState(false);
  const [selectedAppointmentForPayment, setSelectedAppointmentForPayment] = useState<any>(null);
  const [showQuickServiceDialog, setShowQuickServiceDialog] = useState(false);
  const [selectedPatientForService, setSelectedPatientForService] = useState<any>(null);
  const [showDirectPharmacyDialog, setShowDirectPharmacyDialog] = useState(false);
  const [directPharmacySearch, setDirectPharmacySearch] = useState('');
  const [directPharmacyResults, setDirectPharmacyResults] = useState<any[]>([]);
  const [availableMedications, setAvailableMedications] = useState<any[]>([]);
  const [consultationFee, setConsultationFee] = useState(2000);
  const [departmentFees, setDepartmentFees] = useState<Record<string, number>>({});
  const [paymentForm, setPaymentForm] = useState({
    amount_paid: '',
    payment_method: 'Cash'
  });

  const [registerForm, setRegisterForm] = useState({
    full_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',
    blood_group: '',
    address: '',
    insurance_company_id: '',
    insurance_number: '',
  });
  
  const [registerWithAppointment, setRegisterWithAppointment] = useState(false);
  const [appointmentDepartmentId, setAppointmentDepartmentId] = useState<string>('');
  const [appointmentDoctorId, setAppointmentDoctorId] = useState<string>('');
  const [appointmentDate, setAppointmentDate] = useState<string>('');
  const [appointmentTime, setAppointmentTime] = useState<string>('');
  const [appointmentReason, setAppointmentReason] = useState<string>('');
  const [departmentDoctors, setDepartmentDoctors] = useState<any[]>([]);
  const [visitType, setVisitType] = useState<'Consultation' | 'Pharmacy Only'>('Consultation');

  const [appointmentForm, setAppointmentForm] = useState({
    patient_id: '',
    doctor_id: '',
    appointment_date: '',
    appointment_time: '',
    appointment_type: 'Consultation',
    reason: '',
    department_id: '',
  });
  
  // Debug state changes
  // useEffect(() => {
  //   
  // }, [appointments]);
  
  // useEffect(() => {
  //   
  // }, [departments]);
  
  // useEffect(() => {
  //   
  // }, [doctors]);
  
  // useEffect(() => {
  //   
  // }, [patients]);

  // Load data when component mounts or user changes
  useEffect(() => {
    if (!user) return;
    
    fetchData(true); // Initial load with loading screen
    fetchConsultationFee();
    fetchMedications();

    // Fetch insurance companies immediately and independently
    api.get('/insurance/companies')
      .then(r => setInsuranceCompanies(r.data.companies || []))
      .catch(() => {});

    // Set up polling instead of real-time subscriptions (every 30 seconds)
    const intervalId = setInterval(() => {
      fetchData(false); // Background refresh without loading screen
    }, 30000);

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, [user]);

  const fetchMedications = async () => {
    try {
      const response = await api.get('/pharmacy/medications');
      const meds = response.data.medications || [];
      // Only show medications that are in stock
      setAvailableMedications(meds.filter((m: any) => (m.stock_quantity || m.quantity_in_stock || 0) > 0));
    } catch (error) {

      setAvailableMedications([]);
    }
  };

  const fetchData = async (isInitialLoad = true) => {
    if (!user) return;

    if (isInitialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
    try {
      const today = new Date().toISOString().split('T')[0];

      // First, get appointments with basic info (exclude cancelled appointments)
      const appointmentsRes = await api.get('/appointments?order=appointment_time.asc');
      const appointmentsBasic = (appointmentsRes.data.appointments || []).filter(
        apt => apt.status !== 'Cancelled'
      );

      // Fetch departments first
      let departmentsData = [];
      try {
        const departmentsRes = await api.get('/departments?order=name');
        departmentsData = departmentsRes.data.departments || [];

        if (departmentsData.length === 0) {

          toast.warning('No departments found. Please contact admin to set up departments.');
        }
      } catch (deptError) {


        toast.error('Failed to load departments. Please check backend connection.');
      }

      // Then get doctor profiles for the appointments
      const doctorIds = [...new Set(appointmentsBasic?.map(apt => apt.doctor_id).filter(Boolean) || [])];

      let appointmentsData = appointmentsBasic || [];
      if (doctorIds.length > 0) {
        try {
          const doctorsRes = await api.get(`/users/profiles?ids=${doctorIds.join(',')}`);
          const doctorsData = doctorsRes.data.profiles || [];

          // Merge doctor and department information into appointments
          appointmentsData = (appointmentsBasic || []).map(apt => ({
            ...apt,
            doctor: doctorsData.find(doc => doc.id === apt.doctor_id) || null,
            department: departmentsData.find(dept => dept.id === apt.department_id) || null
          }));
        } catch (error) {

          appointmentsData = appointmentsBasic || [];
        }
      }

      const patientsRes = await api.get('/patients?order=created_at.desc&limit=10');
      const patientsData = patientsRes.data.patients || [];
      const totalPatientsCount = patientsRes.data.total || patientsData.length;

      // Fetch doctors - get profiles that have doctor role
      let doctorsData = [];
      try {
        // Fetch doctors using the public profiles endpoint
        const doctorsRes = await api.get('/users/profiles?role=doctor');
        doctorsData = doctorsRes.data.profiles || [];

        if (doctorsData.length === 0) {

          toast.warning('No doctors found. Please contact admin to assign doctor roles.');
        }
      } catch (error) {


        toast.error('Failed to load doctors. Please check backend connection.');
        doctorsData = [];
      }

      // If still no doctors, try to create some sample doctor users
      if (!doctorsData || doctorsData.length === 0) {

        try {
          // Check if we have any profiles at all
          const profilesRes = await api.get('/users/profiles?limit=5');
          const allProfiles = profilesRes.data.profiles || [];

          if (allProfiles && allProfiles.length > 0) {
            // Assign doctor role to first few profiles for demo
            for (let i = 0; i < Math.min(3, allProfiles.length); i++) {
              const profile = allProfiles[i];
              await api.post('/users/roles', {
                user_id: profile.id,
                role: 'doctor'
              });
            }

            // Now fetch doctors again
            const rolesRes = await api.get('/users/roles?role=doctor');
            const newDoctors = rolesRes.data.roles || [];

            if (newDoctors && newDoctors.length > 0) {
              const doctorIds = newDoctors.map(dr => dr.user_id);
              const doctorsRes = await api.get(`/users/profiles?ids=${doctorIds.join(',')}`);
              const doctorProfiles = doctorsRes.data.profiles || [];
              doctorsData = doctorProfiles || [];

            }
          }
        } catch (createError) {

        }
      }

      // Fetch patient visits to get accurate workflow stats
      // Note: We need to check both patient_visits and visits tables
      let patientVisits = [];
      let appointmentVisits = [];
      
      try {

        const visitsRes = await api.get('/visits?overall_status=Active');
        patientVisits = visitsRes.data.visits || [];


      } catch (visitsError) {


      }
      
      // Also fetch from the visits table for appointment-based workflow
      try {

        const aptVisitsRes = await api.get('/appointment-visits?overall_status=Active');
        appointmentVisits = aptVisitsRes.data.visits || [];

      } catch (error) {

      }

      // Ensure appointmentsData is an array before filtering
      const appointmentsArray = Array.isArray(appointmentsData) ? appointmentsData : [];
      
      // Fix date comparison - extract date from appointment_date
      const todayAppointments = appointmentsArray.filter(a => {
        if (!a.appointment_date) return false;
        // Extract date part from appointment_date (handle both Date objects and strings)
        let aptDate = '';
        if (a.appointment_date instanceof Date) {
          aptDate = a.appointment_date.toISOString().split('T')[0];
        } else if (typeof a.appointment_date === 'string') {
          aptDate = a.appointment_date.split('T')[0];
        }
        return aptDate === today;
      }).length;
      
      const pendingAppointments = appointmentsArray.filter(a => a.status === 'Scheduled').length;
      
      // Count confirmed appointments for TODAY only
      const confirmedAppointments = appointmentsArray.filter(a => {
        if (a.status !== 'Confirmed') return false;
        if (!a.appointment_date) return false;
        // Extract date part
        let aptDate = '';
        if (a.appointment_date instanceof Date) {
          aptDate = a.appointment_date.toISOString().split('T')[0];
        } else if (typeof a.appointment_date === 'string') {
          aptDate = a.appointment_date.split('T')[0];
        }
        return aptDate === today;
      }).length;

      // Calculate nurse queue patients (from new registrations in patient_visits table)
      // Include NULL, empty, or 'Pending' status as these all mean waiting for vitals
      const nurseQueuePatients = patientVisits?.filter(v =>
        v.current_stage === 'nurse' && (!v.nurse_status || v.nurse_status === 'Pending' || v.nurse_status === '')
      ).length || 0;

      // Calculate reception queue patients (from appointments in visits table)
      // These are appointments that need check-in
      const receptionQueueFromAppointments = appointmentVisits?.filter(v =>
        v.current_stage === 'reception' && (!v.reception_status || v.reception_status === 'Pending' || v.reception_status === '')
      ).length || 0;
      
      // Also check patient_visits table for reception queue
      const receptionQueueFromPatientVisits = patientVisits?.filter(v =>
        v.current_stage === 'reception' && (!v.reception_status || v.reception_status === 'Pending' || v.reception_status === '')
      ).length || 0;
      
      const receptionQueuePatients = receptionQueueFromAppointments + receptionQueueFromPatientVisits;

      // Fetch insurance companies
      let insuranceData = [];
      try {
        const insuranceRes = await api.get('/insurance/companies');
        insuranceData = insuranceRes.data.companies || [];
      } catch (error) {

      }

      setAppointments(appointmentsArray);
      setPatients(patientsData || []);
      setDepartments(departmentsData || []);
      setDoctors(doctorsData || []);
      setInsuranceCompanies(insuranceData || []);

      // Debug logging

      // Fetch today's checked-in patients
      let checkedInToday = [];
      try {
        const checkedInRes = await api.get(`/visits?reception_status=Checked In&reception_completed_at=${today}`);
        checkedInToday = checkedInRes.data.visits || [];
      } catch (error) {

      }

      setStats({
        todayAppointments,
        pendingAppointments,
        completedCheckins: checkedInToday.length, // Count of checked-in patients today
        totalPatients: totalPatientsCount,
        nurseQueuePatients,
        receptionQueuePatients,
      });
    } catch (error) {


      // Set empty data to prevent crashes
      setAppointments([]);
      setPatients([]);
      setDepartments([]);
      setDoctors([]);
      setStats({
        todayAppointments: 0,
        pendingAppointments: 0,
        completedCheckins: 0,
        totalPatients: 0,
        nurseQueuePatients: 0,
        receptionQueuePatients: 0,
      });

      toast.error(`Failed to load dashboard data: ${error.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  // Helper function to create sample data for testing
  const createSampleData = async () => {
    if (!user) return;

    try {
      // Create sample departments if none exist
      const deptsRes = await api.get('/departments?limit=1');
      const existingDepts = deptsRes.data.departments || [];
      if (!existingDepts || existingDepts.length === 0) {
        await api.post('/departments', [
          { name: 'General Medicine', description: 'General medical care' },
          { name: 'Cardiology', description: 'Heart and cardiovascular system' },
          { name: 'Pediatrics', description: 'Children and infants' }
        ]);
      }

      // Create sample patients if none exist
      const patientsRes = await api.get('/patients?limit=1');
      const existingPatients = patientsRes.data.patients || [];
      if (!existingPatients || existingPatients.length === 0) {
        const newPatientsRes = await api.post('/patients', [
          {
            full_name: 'John Doe',
            date_of_birth: '1990-01-01',
            gender: 'Male',
            phone: '+255700000001',
            email: 'john@example.com',
            blood_group: 'O+',
            status: 'Active'
          },
          {
            full_name: 'Jane Smith',
            date_of_birth: '1985-05-15',
            gender: 'Female',
            phone: '+255700000002',
            email: 'jane@example.com',
            blood_group: 'A+',
            status: 'Active'
          }
        ]);
        const newPatients = newPatientsRes.data.patients || [];

        if (newPatients && newPatients.length > 0) {
          // Create sample appointments
          await api.post('/appointments', [
            {
              patient_id: newPatients[0].id,
              doctor_id: user.id,
              appointment_date: new Date().toISOString().split('T')[0],
              appointment_time: '10:00',
              reason: 'Regular checkup',
              status: 'Scheduled'
            }
          ]);
        }
      }

      toast.success('Sample data created');
      fetchData(false);
    } catch (error) {

    }
  };

  // Helper function to automatically assign doctor
  const getAutoAssignedDoctor = (doctorsList: any[], departmentId?: string) => {
    if (doctorsList.length === 0) return null;

    // Filter doctors by department if specified
    let availableDoctors = doctorsList;
    if (departmentId) {
      // For now, we'll use a simple approach - in a real system you'd have doctor specializations
      // For demo purposes, we'll assume all doctors can handle all departments
      availableDoctors = doctorsList;
    }

    if (availableDoctors.length === 0) return null;

    // Simple load balancing: assign to doctor with fewest current appointments
    // In a real system, you'd check actual appointment counts per doctor
    const today = new Date().toISOString().split('T')[0];
    const doctorAppointmentCounts = new Map();

    // Count current appointments for each doctor
    appointments.forEach(apt => {
      if (apt.appointment_date === today && apt.doctor?.id) {
        doctorAppointmentCounts.set(
          apt.doctor.id,
          (doctorAppointmentCounts.get(apt.doctor.id) || 0) + 1
        );
      }
    });

    // Find doctor with fewest appointments
    let selectedDoctor = availableDoctors[0];
    let minAppointments = doctorAppointmentCounts.get(selectedDoctor.id) || 0;

    availableDoctors.forEach(doctor => {
      const count = doctorAppointmentCounts.get(doctor.id) || 0;
      if (count < minAppointments) {
        selectedDoctor = doctor;
        minAppointments = count;
      }
    });

    return selectedDoctor;
  };

  // Auto-assign doctor when department changes or form opens
  useEffect(() => {
    if (appointmentForm.department_id && doctors.length > 0 && !appointmentForm.doctor_id) {
      const autoDoctor = getAutoAssignedDoctor(doctors, appointmentForm.department_id);
      if (autoDoctor) {
        setAppointmentForm(prev => ({
          ...prev,
          doctor_id: autoDoctor?.id || ''
        }));
      }
    }
  }, [appointmentForm.department_id, doctors]);

  // Fetch doctors for selected department in registration
  useEffect(() => {
    const fetchDepartmentDoctors = async () => {
      if (!appointmentDepartmentId) {
        setDepartmentDoctors([]);
        setAppointmentDoctorId('');
        return;
      }

      try {
        const response = await api.get(`/departments/${appointmentDepartmentId}/doctors`);
        const assignedDoctors = response.data.doctors || [];

        // Doctors are already filtered by department_id in the backend
        setDepartmentDoctors(assignedDoctors);
        
        // Auto-select if only one doctor
        if (assignedDoctors.length === 1) {
          setAppointmentDoctorId(assignedDoctors[0].id);
        } else {
          setAppointmentDoctorId('');
        }
      } catch (error) {

        setDepartmentDoctors([]);
      }
    };

    fetchDepartmentDoctors();
  }, [appointmentDepartmentId]);

  // ---------------- FETCH DATA ----------------
  const fetchConsultationFee = async () => {
    try {
      // Fetch default consultation fee
      const settingsRes = await api.get('/settings/consultation_fee');
      
      if (settingsRes.data && settingsRes.data.value) {
        setConsultationFee(Number(settingsRes.data.value));
      }

      // Fetch department-specific fees
      const deptFeesRes = await api.get('/departments/fees');
      const deptFeesData = deptFeesRes.data.fees || [];

      if (deptFeesData && deptFeesData.length > 0) {
        const feesMap: Record<string, number> = {};
        deptFeesData.forEach(fee => {
          feesMap[fee.department_id] = fee.fee_amount;
        });
        setDepartmentFees(feesMap);
      }
    } catch (error) {

    }
  };

  // Get consultation fee for a specific department
  const getDepartmentFee = (departmentId: string | null) => {
    if (!departmentId) return consultationFee;
    return departmentFees[departmentId] || consultationFee;
  };

  const handleInitiateCheckIn = async (appointment: any) => {
    // Check if patient already paid for appointment today
    try {
      const today = new Date().toISOString().split('T')[0];
      const paymentsRes = await api.get(`/payments?patient_id=${appointment.patient_id}&date=${today}`);
      const todayPayments = paymentsRes.data.payments || [];
      
      // Check if there's an appointment fee payment today for this appointment
      const appointmentPayment = todayPayments.find(p => 
        p.payment_type === 'Appointment Fee' && 
        p.status === 'Completed'
      );
      
      if (appointmentPayment) {
        // Patient already paid appointment fee today - skip payment
        const confirmSkip = window.confirm(
          `This patient already paid appointment fee (TSh ${appointmentPayment.amount}) today. Skip payment and check in directly?`
        );
        
        if (confirmSkip) {
          await handleCheckIn(appointment.id);
          toast.success('Patient checked in (appointment fee already paid today)');
          return;
        } else {
          // User wants to collect payment again (maybe different appointment/service)
          toast.info('Proceeding with payment collection');
        }
      }
    } catch (error) {

    }
    
    setSelectedAppointmentForPayment(appointment);
    const fee = getDepartmentFee(appointment.department_id);
    setPaymentForm({
      amount_paid: fee.toString(),
      payment_method: 'Cash'
    });
    setShowPaymentDialog(true);
  };

  const handlePaymentSubmit = async () => {
    if (!selectedAppointmentForPayment) return;

    const amountPaid = Number(paymentForm.amount_paid);
    const requiredFee = getDepartmentFee(selectedAppointmentForPayment.department_id);
    if (isNaN(amountPaid) || amountPaid < requiredFee) {
      toast.error(`Payment must be at least TSh ${requiredFee.toLocaleString()}`);
      return;
    }

    try {
      // Handle Mobile Money Payment
      if (['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method)) {

        const phoneInput = document.getElementById('apt_mobile_phone') as HTMLInputElement;
        const phoneNumber = phoneInput?.value;
        
        if (!phoneNumber) {
          toast.error('Please enter mobile money phone number');
          return;
        }
        
        // Validate phone number
        const phoneRegex = /^0[67][0-9]{8}$/;
        if (!phoneRegex.test(phoneNumber)) {
          toast.error('Invalid phone number format. Use 07xxxxxxxx or 06xxxxxxxx');
          return;
        }
        
        try {
          toast.info(`Initiating ${paymentForm.payment_method} payment...`);
          
          // Use mobilePaymentService
          const paymentRequest: MobilePaymentRequest = {
            phoneNumber,
            amount: amountPaid,
            invoiceId: selectedAppointmentForPayment.id, // Use appointment ID
            paymentType: 'Appointment Fee', // Specify appointment fee
            paymentMethod: paymentForm.payment_method as 'M-Pesa' | 'Airtel Money' | 'Tigo Pesa' | 'Halopesa',
            description: `Appointment fee for appointment ${selectedAppointmentForPayment.id}`
          };

          const response = await mobilePaymentService.initiatePayment(paymentRequest);

          if (response.success && response.transactionId) {
            toast.success(
              `📱 ${paymentForm.payment_method} payment request sent to ${phoneNumber}!\n` +
              `Transaction ID: ${response.transactionId.slice(-8)}\n` +
              `Patient will receive payment prompt on their phone.\n` +
              `Check-in will complete automatically once payment is confirmed.`,
              { duration: 6000 }
            );
            
            // Payment is pending - webhook will confirm it and complete check-in

            // Close dialog - webhook will handle the rest
            setShowPaymentDialog(false);
            setSelectedAppointmentForPayment(null);
            return; // Exit here for mobile payments
          } else {
            toast.error(response.message || 'Failed to initiate mobile payment');
            return;
          }
          
        } catch (error) {

          toast.error('Failed to initiate mobile money payment');
          return;
        }
      }

      // For non-mobile payments: Create payment record immediately
      // Create invoice first (with paid_amount = 0, payment will update it)
      const invoiceRes = await api.post('/invoices', {
        patient_id: selectedAppointmentForPayment.patient_id,
        invoice_date: new Date().toISOString().split('T')[0],
        total_amount: amountPaid,
        paid_amount: 0,
        balance: amountPaid,
        status: 'Pending',
        notes: 'Appointment Fee'
      });
      
      const invoiceId = invoiceRes.data.invoice?.id || invoiceRes.data.invoiceId;
      
      const paymentData = {
        patient_id: selectedAppointmentForPayment.patient_id,
        invoice_id: invoiceId,
        amount: amountPaid,
        payment_method: paymentForm.payment_method,
        payment_type: 'Appointment Fee',
        status: 'Completed',
        payment_date: new Date().toISOString(),
        reference_number: invoiceRes.data.invoice?.invoice_number || null
      };
      
      const paymentRes = await api.post('/payments', paymentData);
      if (paymentRes.status !== 200 || paymentRes.data.error) throw new Error(paymentRes.data.error || 'Failed to create payment');

      // Now proceed with check-in
      await handleCheckIn(selectedAppointmentForPayment.id);
      
      setShowPaymentDialog(false);
      setSelectedAppointmentForPayment(null);
      toast.success(`Payment of TSh ${amountPaid} received. Patient checked in.`);
    } catch (error) {

      toast.error('Failed to process payment');
    }
  };

  const handleCheckIn = async (appointmentId: string) => {
    try {
      // First, get appointment details
      const appointmentRes = await api.get(`/appointments/${appointmentId}`);
      const appointment = appointmentRes.data.appointment;
      if (appointmentRes.status !== 200 || appointmentRes.data.error) throw new Error(appointmentRes.data.error || 'Failed to fetch appointment');

      // Update appointment status
      const updateRes = await api.put(`/appointments/${appointmentId}`, { 
        status: 'Confirmed', 
        updated_at: new Date().toISOString() 
      });
      if (updateRes.status !== 200 || updateRes.data.error) throw new Error(updateRes.data.error || 'Failed to update appointment');

      // Use upsert to update existing visit or create new one (prevents duplicates)
      // First, try to find existing visit
      const visitsRes = await api.get(`/visits?appointment_id=${appointmentId}`);
      const visitsData = visitsRes.data.visits || [];
      const existingVisit = visitsData.length > 0 ? visitsData[0] : null;

      if (existingVisit) {
        // Update existing visit
        const visitRes = await api.put(`/visits/${existingVisit.id}`, {
          reception_status: 'Checked In',
          reception_completed_at: new Date().toISOString(),
          current_stage: 'nurse',
          nurse_status: 'Pending',
          updated_at: new Date().toISOString()
        });
        if (visitRes.status !== 200 || visitRes.data.error) throw new Error(visitRes.data.error || 'Failed to update visit');
      } else {
        // Create new visit only if it doesn't exist
        const visitData = {
          patient_id: appointment.patient_id,
          appointment_id: appointmentId,
          doctor_id: appointment.doctor_id, // Link to specific doctor
          visit_date: new Date().toISOString().split('T')[0],
          reception_status: 'Checked In',
          reception_completed_at: new Date().toISOString(),
          current_stage: 'nurse',
          nurse_status: 'Pending',
          overall_status: 'Active'
        };

        const visitRes = await api.post('/visits', visitData);

        if (visitRes.status !== 200 || visitRes.data.error) {
          // If error is duplicate, just update the existing one
          // In this case, we'll assume the visit was created and try to update it
          const updateRes = await api.put(`/visits?appointment_id=${appointmentId}`, {
            reception_status: 'Checked In',
            reception_completed_at: new Date().toISOString(),
            current_stage: 'nurse',
            nurse_status: 'Pending',
            updated_at: new Date().toISOString()
          });
          
          if (updateRes.status !== 200 || updateRes.data.error) throw new Error(updateRes.data.error || 'Failed to update visit');
        }
      }

      // Remove from local state immediately
      setAppointments(prev => prev.filter(apt => apt.id !== appointmentId));

      toast.success('Patient checked in and sent to nurse queue');
      logActivity('appointment.check_in', { appointment_id: appointmentId });
    } catch (error) {

      toast.error(`Failed to check in: ${error.message || 'Unknown error'}`);
    }
  };

  const handleCancelAppointment = async (appointmentId: string) => {
    try {
      // Update appointment status
      const updateRes = await api.put(`/appointments/${appointmentId}`, { status: 'Cancelled' });
      if (updateRes.status !== 200 || updateRes.data.error) throw new Error(updateRes.data.error || 'Failed to update appointment');

      // Try to update patient visit workflow if it exists
      try {
        // First, find the visit for this appointment
        const visitsRes = await api.get(`/visits?appointment_id=${appointmentId}&limit=1`);
        const visits = visitsRes.data.visits || [];
        
        if (visits.length > 0) {
          const visit = visits[0];
          // Update the visit status
          await api.put(`/visits/${visit.id}`, {
            overall_status: 'Cancelled',
            reception_status: 'Cancelled',
            updated_at: new Date().toISOString()
          });

        } else {

        }
      } catch (visitError) {

        // Don't fail the cancellation if visit update fails
      }

      toast.success('Appointment cancelled');
      logActivity('appointment.cancel', { appointment_id: appointmentId });
      
      // Remove from local state
      setAppointments(prev => prev.filter(apt => apt.id !== appointmentId));
    } catch (error) {

      toast.error('Failed to cancel appointment');
    }
  };

  const handleRegisterPatient = () => {
    setRegisterForm({
      full_name: '',
      date_of_birth: '',
      gender: '',
      phone: '',
      email: '',
      blood_group: '',
      address: '',
      insurance_company_id: '',
      insurance_number: '',
    });
    setRegisterWithAppointment(false);
    setAppointmentDepartmentId('');
    setAppointmentDoctorId('');
    setAppointmentDate('');
    setAppointmentTime('');
    setAppointmentReason('');
    setShowRegisterDialog(true);
    // Ensure insurance companies are loaded when dialog opens
    if (insuranceCompanies.length === 0) {
      api.get('/insurance/companies')
        .then(r => setInsuranceCompanies(r.data.companies || []))
        .catch(() => {});
    }
  };

  const handleBookAppointment = () => {
    setAppointmentForm({
      patient_id: '',
      doctor_id: '',
      appointment_date: '',
      appointment_time: '',
      appointment_type: 'Consultation',
      reason: '',
      department_id: '',
    });
    setShowBookAppointmentDialog(true);
  };

  const handlePatientSearch = () => {
    setShowPatientSearch(true);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleViewSchedule = () => {
    setShowScheduleDialog(true);
  };

  // Real-time search for returning patients
  useEffect(() => {
    if (!showReturningPatientDialog) {
      setReturningPatientResults([]);
      return;
    }

    if (!returningPatientSearch.trim() || returningPatientSearch.trim().length < 1) {
      setReturningPatientResults([]);
      return;
    }
    
    const timeoutId = setTimeout(async () => {
      try {
        const searchRes = await api.get(`/patients?search=${encodeURIComponent(returningPatientSearch)}&limit=10`);
        
        if (searchRes.data.error) {
          throw new Error(searchRes.data.error);
        }
        
        setReturningPatientResults(searchRes.data.patients || []);
      } catch (error) {

      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [returningPatientSearch, showReturningPatientDialog]);

  const [selectedReturningPatient, setSelectedReturningPatient] = useState<any>(null);
  const [showReturningPatientPaymentDialog, setShowReturningPatientPaymentDialog] = useState(false);

  const initiateReturningPatientVisit = async (patient: any) => {
    try {
      // Check if patient already has an active visit TODAY
      const today = new Date().toISOString().split('T')[0];
      const visitsRes = await api.get(`/visits?patient_id=${patient.id}&overall_status=Active&from=${today}&to=${today}&limit=1`);
      if (visitsRes.status !== 200 || visitsRes.data.error) {
        throw new Error(visitsRes.data.error || 'Failed to check existing visits');
      }

      const existingVisits = visitsRes.data.visits || [];
      if (existingVisits && existingVisits.length > 0) {
        toast.error('This patient already has an active visit today. Please complete the current visit first.');
        return;
      }

      // Check if patient already paid consultation fee today
      const paymentsRes = await api.get(`/payments?patient_id=${patient.id}&date=${today}`);
      const todayPayments = paymentsRes.data.payments || [];
      
      // Check if there's a consultation fee payment today
      const consultationPayment = todayPayments.find(p => 
        p.payment_type === 'Consultation Fee' && 
        p.status === 'Completed'
      );
      
      if (consultationPayment) {
        // Patient already paid consultation fee today - skip payment
        const confirmSkip = window.confirm(
          `${patient.full_name} already paid consultation fee (TSh ${consultationPayment.amount}) today. Skip payment and create visit directly?`
        );
        
        if (confirmSkip) {
          await createVisitForReturningPatient(patient);
          return;
        } else {
          // User wants to collect payment again (maybe for a different visit/service)
          toast.info('Proceeding with payment collection');
        }
      }

      // Show payment dialog
      setSelectedReturningPatient(patient);
      setPaymentForm({
        amount_paid: consultationFee.toString(),
        payment_method: 'Cash'
      });
      setShowReturningPatientDialog(false);
      setShowReturningPatientPaymentDialog(true);
    } catch (error: any) {

      toast.error(error.message || 'Failed to initiate visit');
    }
  };

  const completeReturningPatientVisit = async () => {
    if (!selectedReturningPatient) return;

    // Check if this is a non-consultation visit (Pharmacy Only)
    if (visitType === 'Pharmacy Only') {
      // Skip payment and create visit directly
      try {
        setLoading(true);

        // Determine next stage based on visit type
        let nextStage = 'nurse';
        let nextStatus = 'Pending';
        
        if (visitType === 'Pharmacy Only') {
          nextStage = 'pharmacy';
        }

        // Create visit without payment
        const visitData = {
          patient_id: selectedReturningPatient.id,
          visit_date: new Date().toISOString().split('T')[0],
          visit_type: visitType,
          status: 'Active',
          current_stage: nextStage,
          reception_status: 'Checked In',
          reception_completed_at: new Date().toISOString(),
          overall_status: 'Active',
          notes: `${visitType} - No consultation fee required`
        };

        if (nextStage === 'pharmacy') {
          visitData['pharmacy_status'] = nextStatus;
          visitData['doctor_status'] = 'Not Required';
          visitData['nurse_status'] = 'Not Required';
          visitData['lab_status'] = 'Not Required';
          visitData['billing_status'] = 'Pending';
        }

        await api.post('/visits', visitData);

        toast.success(`${selectedReturningPatient.full_name} checked in! (${visitType} - No consultation fee)`);
        
        // Reset and close
        setShowReturningPatientPaymentDialog(false);
        setSelectedReturningPatient(null);
        setVisitType('Consultation');
        
        // Refresh data
        fetchData(false);
      } catch (error: any) {

        toast.error(error.response?.data?.error || 'Failed to create visit');
      } finally {
        setLoading(false);
      }
      return;
    }

    const amountPaid = Number(paymentForm.amount_paid);
    if (isNaN(amountPaid) || amountPaid < consultationFee) {
      toast.error(`Payment must be at least TSh ${consultationFee.toLocaleString()}`);
      return;
    }

    try {
      setLoading(true);

      // Handle Mobile Money Payment
      if (['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method)) {

        const phoneInput = document.getElementById('ret_mobile_phone') as HTMLInputElement;
        const phoneNumber = phoneInput?.value;
        
        if (!phoneNumber) {
          toast.error('Please enter mobile money phone number');
          setLoading(false);
          return;
        }
        
        // Validate phone number
        const phoneRegex = /^0[67][0-9]{8}$/;
        if (!phoneRegex.test(phoneNumber)) {
          toast.error('Invalid phone number format. Use 07xxxxxxxx or 06xxxxxxxx');
          setLoading(false);
          return;
        }
        
        try {
          toast.info(`Initiating ${paymentForm.payment_method} payment...`);
          
          // Use mobilePaymentService
          const paymentRequest: MobilePaymentRequest = {
            phoneNumber,
            amount: amountPaid,
            patientId: selectedReturningPatient.id,
            paymentType: 'Consultation',
            paymentMethod: paymentForm.payment_method as 'M-Pesa' | 'Airtel Money' | 'Tigo Pesa' | 'Halopesa',
            description: `Consultation fee for ${selectedReturningPatient.full_name}`
          };

          const response = await mobilePaymentService.initiatePayment(paymentRequest);

          if (response.success && response.transactionId) {
            toast.success(
              `📱 ${paymentForm.payment_method} payment request sent to ${phoneNumber}!\n` +
              `Transaction ID: ${response.transactionId.slice(-8)}\n` +
              `Patient will receive payment prompt on their phone.\n` +
              `Visit will be created automatically once payment is confirmed.`,
              { duration: 6000 }
            );
            
            // Payment is pending - webhook will confirm it and create visit

            // Close dialog - webhook will handle the rest
            setShowReturningPatientPaymentDialog(false);
            setSelectedReturningPatient(null);
            setReturningPatientSearch('');
            setReturningPatientResults([]);
            setLoading(false);
            return; // Exit here for mobile payments
          } else {
            toast.error(response.message || 'Failed to initiate mobile payment');
            setLoading(false);
            return;
          }
          
        } catch (error) {

          toast.error('Failed to initiate mobile money payment');
          setLoading(false);
          return;
        }
      }

      // For non-mobile payments: Create invoice first (with paid_amount = 0), then payment record and visit
      const invoiceRes = await api.post('/invoices', {
        patient_id: selectedReturningPatient.id,
        invoice_date: new Date().toISOString().split('T')[0],
        total_amount: amountPaid,
        paid_amount: 0,
        balance: amountPaid,
        status: 'Pending',
        notes: 'Consultation Fee - Returning Patient'
      });

      const invoiceId = invoiceRes.data.invoice?.id || invoiceRes.data.invoiceId;
      
      if (!invoiceId) {

        throw new Error('Failed to get invoice ID from invoice creation');
      }
      
      const paymentData = {
        patient_id: selectedReturningPatient.id,
        invoice_id: invoiceId,
        amount: amountPaid,
        payment_method: paymentForm.payment_method,
        payment_type: 'Consultation Fee',
        status: 'Completed',
        payment_date: new Date().toISOString(),
        reference_number: invoiceRes.data.invoice?.invoice_number || null
      };

      await api.post('/payments', paymentData);

      // Create visit
      await createVisitForReturningPatient(selectedReturningPatient);

      toast.success(`Payment received. ${selectedReturningPatient.full_name} sent to Nurse.`);
      setShowReturningPatientPaymentDialog(false);
      setSelectedReturningPatient(null);
      setReturningPatientSearch('');
      setReturningPatientResults([]);
    } catch (error: any) {

      toast.error(error.message || 'Failed to complete visit');
    } finally {
      setLoading(false);
    }
  };

  const fetchInsurancePatients = async (search = '', companyId = '') => {
    setInsuranceLoading(true);
    try {
      const params: any = { has_insurance: 1, limit: 100 };
      if (search.trim()) params.search = search.trim();
      if (companyId) params.insurance_company_id = companyId;
      const { data } = await api.get('/patients', { params });
      setInsurancePatients(data.patients || []);
    } catch { toast.error('Failed to load insurance patients'); }
    finally { setInsuranceLoading(false); }
  };

  const fetchPatientClaims = async (patientId: string) => {
    try {
      const { data } = await api.get(`/insurance/claims?patient_id=${patientId}`);
      setInsuranceClaims(data.claims || []);
    } catch { setInsuranceClaims([]); }
  };

  const createVisitForReturningPatient = async (patient: any) => {
    // Determine routing based on visit type
    let currentStage = 'nurse';
    let nurseStatus = 'Pending';
    let doctorStatus = 'Not Required';
    let labStatus = 'Not Required';
    let pharmacyStatus = 'Not Required';
    let billingStatus = 'Not Required';
    
    // Route based on visit type - only pharmacy now
    if (visitType === 'Pharmacy Only') {
      currentStage = 'pharmacy';
      pharmacyStatus = 'Pending';
      nurseStatus = 'Not Required';
    } else {
      // Consultation - goes to nurse first
      currentStage = 'nurse';
      nurseStatus = 'Pending';
    }
    
    // Create new visit with all required fields
    const visitData = {
      patient_id: patient.id,
      visit_date: new Date().toISOString().split('T')[0],
      visit_type: visitType,
      reception_status: 'Completed',
      reception_completed_at: new Date().toISOString(),
      current_stage: currentStage,
      nurse_status: nurseStatus,
      doctor_status: doctorStatus,
      lab_status: labStatus,
      pharmacy_status: pharmacyStatus,
      billing_status: billingStatus,
      overall_status: 'Active',
      notes: `Returning patient - ${visitType}`
    };

    const visitRes = await api.post('/visits', visitData);

    if ((visitRes.status !== 200 && visitRes.status !== 201) || visitRes.data.error) {
      throw new Error(visitRes.data.error || 'Failed to create visit');
    }

    // Show success message with destination
    const destination = currentStage === 'nurse' ? 'nurse' : 
                       currentStage === 'lab' ? 'laboratory' : 
                       currentStage === 'pharmacy' ? 'pharmacy' : 'nurse';
    toast.success(`${patient.full_name} sent to ${destination}!`);

    // Refresh data
    fetchData(false);
  };

  const searchPatients = async (query: string) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }

    try {
      setLoading(true);
      const searchRes = await api.get(`/patients?search=${encodeURIComponent(query)}&limit=20`);
      
      if (searchRes.data.error) {
        throw new Error(searchRes.data.error);
      }
      
      setSearchResults(searchRes.data.patients || []);
    } catch (error: any) {

      toast.error(error.response?.data?.error || 'Failed to search patients');
    } finally {
      setLoading(false);
    }
  };

  // Real-time search with debounce
  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      if (searchQuery.trim().length >= 1) {
        searchPatients(searchQuery);
      } else if (searchQuery.trim().length === 0) {
        setSearchResults([]);
      }
    }, 300); // Wait 300ms after user stops typing

    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  const submitPatientRegistration = async () => {
    // Validate required fields
    if (!registerForm.full_name || !registerForm.date_of_birth ||
        !registerForm.gender || !registerForm.phone || !registerForm.address) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Validate gender value
    if (!['Male', 'Female', 'Other'].includes(registerForm.gender)) {
      toast.error('Gender must be Male, Female, or Other');
      return;
    }

    // Check if this is a non-consultation visit (Pharmacy Only)
    // These visits should NOT charge consultation fee
    if (visitType === 'Pharmacy Only') {
      // Skip payment and create visit directly
      await createVisitWithoutPayment();
      return;
    }

    // Determine the fee based on whether booking with appointment
    const feeToCharge = registerWithAppointment && appointmentDepartmentId
      ? getDepartmentFee(appointmentDepartmentId)
      : consultationFee;

    // Insurance patients — skip cash payment, go directly to visit creation
    if (registerForm.insurance_company_id) {
      setShowRegisterDialog(false);
      await createVisitWithInsurance();
      return;
    }

    // Close registration dialog and show payment dialog
    setShowRegisterDialog(false);
    
    // Check if patient has insurance - auto-select Insurance payment
    const paymentMethod = registerForm.insurance_company_id ? 'Insurance' : 'Cash';
    
    setPaymentForm({
      amount_paid: feeToCharge.toString(),
      payment_method: paymentMethod
    });
    setShowRegistrationPaymentDialog(true);
  };

  const createVisitWithoutPayment = async () => {
    try {
      setLoading(true);

      // Register patient first
      const patientData = {
        full_name: registerForm.full_name,
        date_of_birth: registerForm.date_of_birth,
        gender: registerForm.gender,
        phone: registerForm.phone,
        email: registerForm.email || null,
        address: registerForm.address || null,
        blood_group: registerForm.blood_group || null,
        insurance_company_id: registerForm.insurance_company_id || null,
        insurance_number: registerForm.insurance_number || null,
        status: 'Active'
      };

      const patientRes = await api.post('/patients', patientData);
      const newPatient = patientRes.data.patient || patientRes.data;

      // Determine routing based on visit type
      let currentStage = 'nurse';
      let nurseStatus = 'Pending';
      let doctorStatus = 'Not Required';
      let labStatus = 'Not Required';
      let pharmacyStatus = 'Not Required';
      let billingStatus = 'Not Required';
      
      // Route based on visit type - only pharmacy now
      if (visitType === 'Pharmacy Only') {
        currentStage = 'pharmacy';
        pharmacyStatus = 'Pending';
        nurseStatus = 'Not Required';
      } else {
        // Consultation - goes to nurse first
        currentStage = 'nurse';
        nurseStatus = 'Pending';
      }

      // Create visit without payment
      const visitData = {
        patient_id: newPatient.id,
        visit_date: new Date().toISOString().split('T')[0],
        visit_type: visitType,
        reception_status: 'Completed',
        reception_completed_at: new Date().toISOString(),
        current_stage: currentStage,
        nurse_status: nurseStatus,
        doctor_status: doctorStatus,
        lab_status: labStatus,
        pharmacy_status: pharmacyStatus,
        billing_status: billingStatus,
        overall_status: 'Active',
        notes: `${visitType} - No consultation fee required`
      };

      await api.post('/visits', visitData);

      // Show success message with destination
      const destination = currentStage === 'nurse' ? 'nurse' : 
                         currentStage === 'lab' ? 'laboratory' : 
                         currentStage === 'pharmacy' ? 'pharmacy' : 'nurse';
      
      toast.success(`${registerForm.full_name} registered and sent to ${destination}! (${visitType} - No consultation fee)`);
      
      // Reset and close
      setShowRegisterDialog(false);
      setRegisterForm({
        full_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        address: '',
        blood_group: '',
        insurance_company_id: '',
        insurance_number: ''
      });
      setVisitType('Consultation');
      
      // Refresh data
      fetchData(false);
    } catch (error: any) {

      toast.error(error.response?.data?.error || 'Failed to create visit');
    } finally {
      setLoading(false);
    }
  };

  // Insurance patient registration — no cash payment, bill goes to insurance
  const createVisitWithInsurance = async () => {
    setLoading(true);
    try {
      const patientData = {
        full_name: registerForm.full_name,
        date_of_birth: registerForm.date_of_birth,
        gender: registerForm.gender,
        phone: registerForm.phone,
        email: registerForm.email || null,
        blood_group: registerForm.blood_group || null,
        address: registerForm.address || null,
        insurance_company_id: registerForm.insurance_company_id || null,
        insurance_number: registerForm.insurance_number || null,
        status: 'Active',
      };

      const patientRes = await api.post('/patients', patientData);
      if (patientRes.data.error) throw new Error(patientRes.data.error);

      const patientId = patientRes.data.patient?.id;
      if (!patientId) throw new Error('Patient ID not returned');

      // Create invoice marked as Insurance (consultation fee covered by insurance)
      const invoiceRes = await api.post('/invoices', {
        patient_id: patientId,
        invoice_date: new Date().toISOString().split('T')[0],
        total_amount: consultationFee,
        paid_amount: consultationFee, // Marked as paid — covered by insurance
        balance: 0,
        status: 'Paid',
        notes: `Insurance Patient - ${registerForm.insurance_number || 'No insurance number'} — Covered by ${insuranceCompanies.find(c => c.id === registerForm.insurance_company_id)?.name || 'Insurance'}`
      });

      const invoiceId = invoiceRes.data.invoice?.id;

      // Create insurance claim if invoice created
      if (invoiceId && registerForm.insurance_company_id) {
        const claimNumber = `CLM-${Date.now().toString().slice(-8)}`;
        await api.post('/insurance/claims', {
          invoice_id: invoiceId,
          insurance_company_id: registerForm.insurance_company_id,
          patient_id: patientId,
          claim_number: claimNumber,
          claim_amount: consultationFee,
          submission_date: new Date().toISOString().split('T')[0],
          status: 'Pending',
          notes: `Auto-created on patient registration`,
        }).catch(() => {}); // non-critical
      }

      // Create visit
      await api.post('/visits', {
        patient_id: patientId,
        visit_date: new Date().toISOString().split('T')[0],
        visit_type: visitType || 'Consultation',
        reception_status: 'Completed',
        reception_completed_at: new Date().toISOString(),
        current_stage: 'nurse',
        nurse_status: 'Pending',
        doctor_status: 'Pending',
        lab_status: 'Not Required',
        pharmacy_status: 'Not Required',
        billing_status: 'Insurance',
        overall_status: 'Active',
        notes: `Insurance patient - ${registerForm.insurance_number || ''}`,
      });

      toast.success(`${registerForm.full_name} registered (Insurance) and sent to nurse!`);
      setRegisterForm({ full_name: '', date_of_birth: '', gender: '', phone: '', email: '', blood_group: '', address: '', insurance_company_id: '', insurance_number: '' });
      setVisitType('Consultation');
      fetchData(false);
    } catch (error: any) {
      toast.error(error.response?.data?.error || error.message || 'Failed to register insurance patient');
    } finally {
      setLoading(false);
    }
  };

  const completePatientRegistration = async () => {
    // Prevent multiple submissions
    if (loading) {

      return;
    }

    const amountPaid = Number(paymentForm.amount_paid);
    if (isNaN(amountPaid) || amountPaid < consultationFee) {
      toast.error(`Payment must be at least TSh ${consultationFee.toLocaleString()}`);
      return;
    }

    // Get phone number BEFORE closing dialog (if mobile money)
    let mobilePhoneNumber = '';
    if (['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method)) {
      const phoneInput = document.getElementById('mobile_phone') as HTMLInputElement;
      mobilePhoneNumber = phoneInput?.value || '';
      
      if (!mobilePhoneNumber) {
        toast.error('Please enter mobile money phone number');
        return;
      }
      
      // Validate phone number
      const phoneRegex = /^0[67][0-9]{8}$/;
      if (!phoneRegex.test(mobilePhoneNumber)) {
        toast.error('Invalid phone number format. Use 07xxxxxxxx or 06xxxxxxxx');
        return;
      }
    }
    
    // Don't close dialog yet for mobile payments - we'll close after payment confirmation
    // For cash payments, close immediately
    if (paymentForm.payment_method === 'Cash') {
      setShowRegistrationPaymentDialog(false);
    }
    
    setLoading(true); // Prevent duplicate submissions
    try {
      // First, create the patient record
      const patientData = {
        full_name: registerForm.full_name,
        date_of_birth: registerForm.date_of_birth,
        gender: registerForm.gender,
        phone: registerForm.phone,
        email: registerForm.email || null,
        blood_group: registerForm.blood_group || null,
        address: registerForm.address || null,
        insurance_company_id: registerForm.insurance_company_id || null,
        insurance_number: registerForm.insurance_number || null,
        status: 'Active',
      };
      
      const patientRes = await api.post('/patients', patientData);
      
      // Check for errors (201 is success for creation)
      if (patientRes.data.error) {
        const patientError = new Error(patientRes.data.error || 'Failed to register patient');

        toast.error(`Registration failed: ${patientError.message}`);
        return;
      }

      // Get the patient ID from response (backend returns patient object)
      const patientId = patientRes.data.patient?.id || patientRes.data.patientId;
      if (!patientId) {

        toast.error('Patient registered but ID not returned');
        return;
      }

      // Handle Mobile Money Payment - Initiate payment after patient is created
      if (['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method)) {

        // Phone number already validated and captured before dialog closed
        try {
          toast.info(`Initiating ${paymentForm.payment_method} payment...`);
          
          // Use mobilePaymentService (same as BillingDashboard)
          const paymentRequest: MobilePaymentRequest = {
            phoneNumber: mobilePhoneNumber,
            amount: amountPaid,
            invoiceId: '', // No invoice for registration payment
            patientId: patientId, // Send patient ID instead
            paymentType: 'Registration', // Specify payment type
            paymentMethod: paymentForm.payment_method as 'M-Pesa' | 'Airtel Money' | 'Tigo Pesa' | 'Halopesa',
            description: `Registration fee for ${registerForm.full_name}`
          };

          const response = await mobilePaymentService.initiatePayment(paymentRequest);

          if (response.success && response.transactionId) {

            // Check if test mode - payment is already completed
            if ((response as any).testMode) {
              toast.success('✅ Payment completed! Patient added to nurse queue.');
              
              // Close dialog and reset form immediately
              setShowRegistrationPaymentDialog(false);
              setRegisterForm({
                full_name: '',
                date_of_birth: '',
                gender: '',
                phone: '',
                email: '',
                blood_group: '',
                address: '',
                insurance_company_id: '',
                insurance_number: ''
              });
              setLoading(false);
              fetchData(false);
              return;
            }
            
            // Production mode - show waiting message and poll
            toast.info(
              `📱 ${paymentForm.payment_method} payment initiated!\n` +
              `Waiting for payment confirmation...\n` +
              `Transaction ID: ${response.transactionId.slice(-8)}`,
              { duration: 5000 }
            );
            
            // Poll for payment status
            const checkPayment = async (attempt = 1, maxAttempts = 30) => {
              if (attempt > maxAttempts) {
                toast.error('Payment confirmation timeout. Please check payment status manually.');
                setLoading(false);
                setShowRegistrationPaymentDialog(false);
                return;
              }
              
              try {
                const statusResponse = await mobilePaymentService.checkPaymentStatus(response.transactionId);
                
                if (statusResponse.success && statusResponse.status === 'completed') {
                  // Payment confirmed!
                  toast.success('✅ Payment confirmed! Patient added to nurse queue.');
                  
                  // Close dialog and reset form
                  setShowRegistrationPaymentDialog(false);
                  setRegisterForm({
                    full_name: '',
                    date_of_birth: '',
                    gender: '',
                    phone: '',
                    email: '',
                    blood_group: '',
                    address: '',
                    insurance_company_id: '',
                    insurance_number: ''
                  });
                  setLoading(false);
                  fetchData(false);
                } else {
                  // Still pending, check again
                  setTimeout(() => checkPayment(attempt + 1, maxAttempts), 2000);
                }
              } catch (error) {

                setTimeout(() => checkPayment(attempt + 1, maxAttempts), 2000);
              }
            };
            
            // Start polling after 2 seconds
            setTimeout(() => checkPayment(), 2000);
            return; // Exit here for mobile payments
          } else {
            // Show specific error message from backend
            const errorMessage = response.message || 'Failed to initiate mobile payment';
            toast.error(errorMessage, { duration: 8000 });
            setShowRegistrationPaymentDialog(false); // Close dialog on error
            setLoading(false); // Clear loading state on error
            return;
          }
          
        } catch (error: any) {

          // Check if error response has the ZenoPay API error message
          const errorMessage = error?.response?.data?.message || 
                              error?.message || 
                              'Failed to initiate mobile money payment';
          
          toast.error(errorMessage, { duration: 8000 });
          setShowRegistrationPaymentDialog(false); // Close dialog on error
          setLoading(false); // Clear loading state on error
          return;
        }
      }

      // For non-mobile payments: Create invoice first (with paid_amount = 0), then payment record and complete registration
      const invoiceRes = await api.post('/invoices', {
        patient_id: patientId,
        invoice_date: new Date().toISOString().split('T')[0],
        total_amount: amountPaid,
        paid_amount: 0,
        balance: amountPaid,
        status: 'Pending',
        notes: 'Registration Fee - New Patient'
      });
      
      const invoiceId = invoiceRes.data.invoice?.id || invoiceRes.data.invoiceId;
      
      const paymentData = {
        patient_id: patientId,
        invoice_id: invoiceId,
        amount: amountPaid,
        payment_method: paymentForm.payment_method,
        payment_type: 'Consultation Fee',
        status: 'Completed',
        payment_date: new Date().toISOString(),
        reference_number: invoiceRes.data.invoice?.invoice_number || null
      };
      
      await api.post('/payments', paymentData);

      // Success - patient created
      toast.success('Patient registered and payment received!');

      // Auto-create portal account for the patient
      if (patientId) {
        try {
          const accRes = await api.post(`/patients/${patientId}/create-account`);
          const p = patientRes.data.patient || { id: patientId, full_name: registerForm.full_name, phone: registerForm.phone };
          setLastRegisteredPatient({ ...p, portal_info: accRes.data });
          if (!accRes.data.already_exists) {
            toast.info(`Portal account created. Patient can login with phone: ${registerForm.phone} and password: HMS1234`);
          }
        } catch {
          // account creation failure doesn't block registration
        }
      }

      // If registering with appointment, create appointment instead of immediate visit
      if (registerWithAppointment && appointmentDepartmentId && appointmentDoctorId && appointmentDate && appointmentTime) {
        // Create appointment
        const appointmentData = {
          patient_id: patientId,
          doctor_id: appointmentDoctorId,
          department_id: appointmentDepartmentId,
          appointment_date: appointmentDate,
          appointment_time: appointmentTime,
          appointment_type: 'Consultation',
          reason: appointmentReason || 'Initial consultation',
          status: 'Scheduled'
        };
        
        const appointmentRes = await api.post('/appointments', appointmentData);
        if (!appointmentRes.data.error) {
          toast.success(`Appointment scheduled for ${appointmentDate} at ${appointmentTime}`);
        }
      } else {
        // Create immediate visit workflow (walk-in patient)
        const visitData = {
          patient_id: patientId,
          visit_date: new Date().toISOString().split('T')[0],
          visit_type: visitType || 'Consultation',
          reception_status: 'Completed',
          reception_completed_at: new Date().toISOString(),
          current_stage: 'nurse',
          nurse_status: 'Pending',
          doctor_status: 'Not Required',
          lab_status: 'Not Required',
          pharmacy_status: 'Not Required',
          billing_status: 'Not Required',
          overall_status: 'Active',
          notes: `Walk-in patient - ${visitType || 'Consultation'}`
        };

        // Create visit
        const visitRes = await api.post('/visits', visitData);

        if (!visitRes.data.error) {
          toast.success(`${registerForm.full_name} registered and sent to nurse queue!`);
        } else {
          toast.warning('Patient registered but visit creation had issues');
        }
      }

      // Dialog already closed at start of function
      
      // Reset form
      setRegisterForm({
        full_name: '',
        date_of_birth: '',
        gender: '',
        phone: '',
        email: '',
        blood_group: '',
        address: '',
        insurance_company_id: '',
        insurance_number: ''
      });
      
      // Refresh the dashboard data to show the new patient
      fetchData(false);

      logActivity('patient.register', { patient_id: patientId, full_name: registerForm.full_name, amount_paid: amountPaid });
    } catch (error: any) {

      const errorMessage = error.response?.data?.error || error.response?.data?.details || error.message || 'Unknown error';
      toast.error(`Failed to register patient: ${errorMessage}`);
    } finally {
      setLoading(false); // Re-enable button
    }
  };

  const submitBookAppointment = async () => {
    // Validate required fields
    if (!appointmentForm.patient_id || !appointmentForm.doctor_id ||
        !appointmentForm.appointment_date || !appointmentForm.appointment_time) {
      toast.error('Please fill in all required fields');
      return;
    }

    try {
      const appointmentData = {
        patient_id: appointmentForm.patient_id,
        doctor_id: appointmentForm.doctor_id,
        appointment_date: appointmentForm.appointment_date,
        appointment_time: appointmentForm.appointment_time,
        appointment_type: appointmentForm.appointment_type || 'Consultation',
        reason: appointmentForm.reason || null,
        notes: null
      };

      const appointmentRes = await api.post('/appointments', appointmentData);
      
      if (appointmentRes.data.error) {
        throw new Error(appointmentRes.data.error);
      }
      
      // Get the appointment ID from response
      const appointmentId = appointmentRes.data.appointmentId;
      if (!appointmentId) {
        throw new Error('Appointment created but ID not returned');
      }
      
      // 
      // 

      // Create patient visit workflow for appointment (starts at reception for check-in)
      try {
        const visitData = {
          patient_id: appointmentForm.patient_id,
          appointment_id: appointmentId,
          visit_date: appointmentForm.appointment_date,
          reception_status: 'Pending',
          current_stage: 'reception',
          overall_status: 'Active'
        };
        
        await api.post('/visits', visitData);
      } catch (visitError: any) {

        // Don't fail the appointment creation if visit creation fails
      }

      toast.success('Appointment booked successfully!');
      setShowBookAppointmentDialog(false);
      
      // Reset form
      setAppointmentForm({
        patient_id: '',
        doctor_id: '',
        appointment_date: '',
        appointment_time: '',
        appointment_type: 'Consultation',
        reason: '',
        department_id: ''
      });
      
      // Refresh data in background
      fetchData(false);
    } catch (error: any) {

      toast.error(`Failed to book appointment: ${error.message || 'Unknown error'}`);
    }
  };



  // ---------------- LOADING SCREEN ----------------
  if (loading) {
    return (
      <DashboardLayout title="Receptionist Dashboard">
        <div className="space-y-8">
          {/* Skeleton stats */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {[1,2,3,4].map(i => (
              <StatCardSkeleton key={i} />
            ))}
          </div>
          {/* Skeleton cards */}
          <div className="grid gap-8 lg:grid-cols-2">
            <AppointmentsCardSkeleton />
            <PatientsCardSkeleton />
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // ---------------- MAIN RENDER ----------------
  return (
    <>
      <DashboardLayout title="Receptionist Dashboard">
        <div className="space-y-8">
          {/* Background Refresh Indicator */}
          {refreshing && (
            <div className="fixed top-4 right-4 z-50 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 shadow-sm animate-in slide-in-from-right-2">
              <div className="flex items-center gap-2 text-sm text-blue-700">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Updating...</span>
              </div>
            </div>
          )}


          {/* Welcome Section */}
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 p-6 rounded-lg border border-green-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 rounded-full">
                  <Building className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">
                    Welcome back, Receptionist!
                  </h2>
                  <p className="text-gray-600">
                    Here's your front desk overview for today
                  </p>
                </div>
              </div>
              {/* Sample data action removed */}
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Today's Appointments"
              value={stats.todayAppointments}
              icon={Calendar}
              color="blue"
              sub="Scheduled for today"
            />
            <StatCard
              title="Pending Appointments"
              value={stats.pendingAppointments}
              icon={Clock}
              color="orange"
              sub="Awaiting confirmation"
            />
            <StatCard
              title="Completed Check-ins"
              value={stats.completedCheckins}
              icon={CheckCircle}
              color="green"
              sub="Confirmed today"
            />
            <StatCard
              title="Total Patients"
              value={stats.totalPatients}
              icon={Users}
              color="purple"
              sub="In system"
            />
          </div>

          {/* Workflow Queue Status */}
          <Card className="shadow-lg border-green-200 bg-green-50/30">
            <CardHeader className="bg-green-100/50">
              <CardTitle className="flex items-center gap-2 text-green-800">
                <Users className="h-5 w-5" />
                Current Patient Workflow Status
              </CardTitle>
              <CardDescription className="text-green-700">
                Real-time view of where patients are in the hospital workflow
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                <div className="p-4 bg-white rounded-lg border border-green-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-green-800">Nurse Queue</h4>
                    <Badge variant="default" className="bg-green-600">
                      {stats.nurseQueuePatients} patient{stats.nurseQueuePatients !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Patients waiting for vital signs (from new registrations)
                  </p>
                  <div className="text-xs text-green-600">
                    ✓ Auto-assigned from patient registration
                  </div>
                </div>

                <div className="p-4 bg-white rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-blue-800">Reception Queue</h4>
                    <Badge variant="default" className="bg-blue-600">
                      {stats.receptionQueuePatients} patient{stats.receptionQueuePatients !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-2">
                    Patients waiting for check-in (from appointments)
                  </p>
                  <div className="text-xs text-blue-600">
                    ✓ Requires check-in before nurse visit
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Doctor/Department Queue for Today */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5" />
                Today's Doctor Appointments by Department
              </CardTitle>
              <CardDescription>View which doctors have appointments scheduled today</CardDescription>
            </CardHeader>
            <CardContent>
              {(() => {
                // Use local date to avoid timezone issues
                const now = new Date();
                const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                
                const todayAppointments = appointments.filter(apt => {
                  // Extract date from appointment_date using local time
                  let aptDate = '';
                  if (apt.appointment_date instanceof Date) {
                    const d = apt.appointment_date;
                    aptDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  } else if (typeof apt.appointment_date === 'string') {
                    const d = new Date(apt.appointment_date);
                    aptDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                  }
                  // Show all appointments for today (Scheduled, Completed, etc.)
                  return aptDate === today;
                });
                
                // Group by doctor
                type DoctorGroup = {
                  doctor: any;
                  department: any;
                  appointments: any[];
                };
                
                const byDoctor = todayAppointments.reduce((acc, apt) => {
                  const doctorId = apt.doctor_id;
                  if (!acc[doctorId]) {
                    acc[doctorId] = {
                      doctor: apt.doctor,
                      department: apt.department,
                      appointments: []
                    };
                  }
                  acc[doctorId].appointments.push(apt);
                  return acc;
                }, {} as Record<string, DoctorGroup>);
                
                const doctorList: DoctorGroup[] = Object.values(byDoctor);
                
                return doctorList.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Stethoscope className="h-12 w-12 mx-auto mb-2 opacity-30" />
                    <p>No appointments scheduled for today</p>
                  </div>
                ) : (
                  <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {doctorList.map((item, idx) => (
                      <div key={idx} className="p-4 border rounded-lg bg-gradient-to-br from-blue-50 to-indigo-50">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <p className="font-semibold text-blue-900">
                              Dr. {item.doctor?.full_name || 'Unknown'}
                            </p>
                            {item.department?.name && (
                              <p className="text-xs text-blue-600">{item.department.name}</p>
                            )}
                          </div>
                          <Badge className="bg-blue-600">
                            {item.appointments.length}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {item.appointments.length} appointment{item.appointments.length !== 1 ? 's' : ''} today
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* Today's Appointments & Recent Patients */}
          <div className="grid gap-8 lg:grid-cols-2">
            <AppointmentsCard appointments={appointments} onCheckIn={handleInitiateCheckIn} onCancel={handleCancelAppointment} />
            <PatientsCard 
              patients={patients} 
              onQuickService={(patient) => {
                setSelectedPatientForService(patient);
                setShowQuickServiceDialog(true);
              }}
            />
          </div>

          {/* Quick Actions */}
          <Card className="shadow-lg">
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common receptionist tasks</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={handleRegisterPatient}>
                  <UserPlus className="h-6 w-6" />
                  <span>Register New Patient</span>
                  <span className="text-xs text-muted-foreground">→ Goes to Nurse</span>
                </Button>
                <Button variant="default" className="h-20 flex-col gap-2 bg-blue-600 hover:bg-blue-700" onClick={() => setShowReturningPatientDialog(true)}>
                  <Users className="h-6 w-6" />
                  <span>Returning Patient</span>
                  <span className="text-xs">→ Create New Visit</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2 bg-green-50 hover:bg-green-100 border-green-200" onClick={() => {
                  setSelectedPatientForService(null); // No patient - walk-in
                  setShowQuickServiceDialog(true);
                }}>
                  <Stethoscope className="h-6 w-6 text-green-600" />
                  <span className="text-green-700">Quick Service (Walk-in)</span>
                  <span className="text-xs text-green-600">→ Direct Service Only</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2 bg-blue-50 hover:bg-blue-100 border-blue-200" onClick={() => {
                  setShowInsurancePanel(true);
                  fetchInsurancePatients('', '');
                }}>
                  <Shield className="h-6 w-6 text-blue-600" />
                  <span className="text-blue-700">Insurance Patients</span>
                  <span className="text-xs text-blue-600">→ View & Search</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2 bg-purple-50 hover:bg-purple-100 border-purple-200" onClick={() => setShowDirectPharmacyDialog(true)}>
                  <Pill className="h-6 w-6 text-purple-600" />
                  <span className="text-purple-700">Direct to Pharmacy</span>
                  <span className="text-xs text-purple-600">→ Medication Only</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={handleBookAppointment}>
                  <Calendar className="h-6 w-6" />
                  <span>Book Follow-up Appointment</span>
                  <span className="text-xs text-muted-foreground">→ Scheduled Visit</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={handlePatientSearch}>
                  <Phone className="h-6 w-6" />
                  <span>Patient Search</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={handleViewSchedule}>
                  <Clipboard className="h-6 w-6" />
                  <span>View Schedule</span>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Departments */}
          <Card className="shadow-lg">
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Departments & Doctor Queue
                </CardTitle>
                <CardDescription>Available departments and current doctor workload</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                {departments.map((dept) => {
                  const deptAppointments = appointments.filter(a => a.department?.id === dept.id);
                  // Use local date to avoid timezone issues
                  const now = new Date();
                  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                  const todayDeptAppts = deptAppointments.filter(a => {
                    if (a.appointment_date instanceof Date) {
                      const d = a.appointment_date;
                      const aptDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      return aptDate === today;
                    } else if (typeof a.appointment_date === 'string') {
                      const d = new Date(a.appointment_date);
                      const aptDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      return aptDate === today;
                    }
                    return false;
                  });

                  return (
                    <div key={dept.id} className="p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                      <h4 className="font-medium">{dept.name}</h4>
                      <p className="text-sm text-muted-foreground mt-1">{dept.description}</p>
                      <div className="mt-2 text-xs text-muted-foreground">
                        {todayDeptAppts.length} appointments today
                      </div>
                    </div>
                  );
                })}

                {/* Doctor Queue Status */}
                <div className="md:col-span-2 lg:col-span-3">
                  <div className="flex items-center gap-2 mb-3">
                    <h4 className="font-medium">Doctor Queue Status (Today)</h4>
                    {roleUpdateIndicator && (
                      <div className="flex items-center gap-1 text-sm text-blue-600">
                        <Loader2 className="h-3 w-3 animate-spin" />
                        <span>Updating...</span>
                      </div>
                    )}
                  </div>
                  <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
                    {doctors.slice(0, 6).map((doctor) => {
                      // Use local date to avoid timezone issues
                      const now = new Date();
                      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
                      const doctorAppts = appointments.filter(a => {
                        let aptDate = '';
                        if (a.appointment_date instanceof Date) {
                          const d = a.appointment_date;
                          aptDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        } else if (typeof a.appointment_date === 'string') {
                          const d = new Date(a.appointment_date);
                          aptDate = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        }
                        return aptDate === today && a.doctor?.id === doctor.id;
                      });
                      const isAvailable = doctorAppts.length < 8; // Assume 8 is max per day

                      return (
                        <div key={doctor.id} className={`p-3 border rounded-lg ${
                          isAvailable ? 'border-green-200 bg-green-50' : 'border-orange-200 bg-orange-50'
                        }`}>
                          <div className="flex justify-between items-center">
                            <span className="font-medium text-sm">{doctor.full_name}</span>
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              isAvailable ? 'bg-green-100 text-green-800' : 'bg-orange-100 text-orange-800'
                            }`}>
                              {doctorAppts.length}/8 slots
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {isAvailable ? 'Available' : 'Busy'} • {doctorAppts.length} appointments today
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>

      {/* Insurance Patients Panel */}
      <Dialog open={showInsurancePanel} onOpenChange={setShowInsurancePanel}>
        <DialogContent className="max-w-5xl h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-blue-600" />
              Insurance Patients
            </DialogTitle>
            <DialogDescription>All patients registered with insurance coverage</DialogDescription>
          </DialogHeader>

          <div className="px-6 py-3 border-b flex gap-3 flex-shrink-0">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, phone or insurance number..."
                className="pl-9"
                value={insuranceSearch}
                onChange={e => {
                  setInsuranceSearch(e.target.value);
                  fetchInsurancePatients(e.target.value, insuranceFilter);
                }}
              />
            </div>
            <select
              className="border rounded-md px-3 py-2 text-sm min-w-[180px]"
              value={insuranceFilter}
              onChange={e => {
                setInsuranceFilter(e.target.value);
                fetchInsurancePatients(insuranceSearch, e.target.value);
              }}
            >
              <option value="">All Companies</option>
              {insuranceCompanies.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <ScrollArea className="flex-1 px-6 py-4">
            {insuranceLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading...
              </div>
            ) : insurancePatients.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-30" />
                <p>No insurance patients found</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Patient</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Insurance Company</TableHead>
                    <TableHead>Insurance No.</TableHead>
                    <TableHead>Gender / Age</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {insurancePatients.map((p: any) => {
                    const age = p.date_of_birth
                      ? new Date().getFullYear() - new Date(p.date_of_birth).getFullYear()
                      : null;
                    const company = p.insurance_company?.name || p.insurance_provider || '—';
                    return (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.full_name}</TableCell>
                        <TableCell>{p.phone}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {company}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono text-sm">{p.insurance_number || '—'}</TableCell>
                        <TableCell>{p.gender}{age ? ` / ${age} yrs` : ''}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1"
                            onClick={() => {
                              setSelectedInsurancePatient(p);
                              fetchPatientClaims(p.id);
                              setShowInsuranceDetailDialog(true);
                            }}
                          >
                            <FileText className="h-3 w-3" />
                            View Report
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1 text-blue-600 border-blue-200 hover:bg-blue-50"
                            onClick={() => {
                              setSelectedStellarPatient(p);
                              setShowStellarDialog(true);
                            }}
                          >
                            <span className="text-xs">⭐</span>
                            Stellar ID
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {/* Insurance Patient Detail Dialog */}
      {selectedInsurancePatient && (
        <Dialog open={showInsuranceDetailDialog} onOpenChange={setShowInsuranceDetailDialog}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600" />
                Insurance Report — {selectedInsurancePatient.full_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 p-4 bg-blue-50 rounded-lg text-sm">
                <div><span className="text-muted-foreground">Name:</span> <strong>{selectedInsurancePatient.full_name}</strong></div>
                <div><span className="text-muted-foreground">Phone:</span> {selectedInsurancePatient.phone}</div>
                <div><span className="text-muted-foreground">Gender:</span> {selectedInsurancePatient.gender}</div>
                <div><span className="text-muted-foreground">Blood Group:</span> {selectedInsurancePatient.blood_group || '—'}</div>
                <div><span className="text-muted-foreground">DOB:</span> {selectedInsurancePatient.date_of_birth ? format(new Date(selectedInsurancePatient.date_of_birth), 'dd MMM yyyy') : '—'}</div>
                <div><span className="text-muted-foreground">Address:</span> {selectedInsurancePatient.address || '—'}</div>
              </div>
              <div className="p-4 border border-blue-200 rounded-lg bg-white space-y-2 text-sm">
                <p className="font-semibold text-blue-700 flex items-center gap-1"><Shield className="h-4 w-4" /> Insurance Details</p>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Company:</span> <strong>{selectedInsurancePatient.insurance_company?.name || selectedInsurancePatient.insurance_provider || '—'}</strong></div>
                  <div><span className="text-muted-foreground">Insurance No:</span> <span className="font-mono">{selectedInsurancePatient.insurance_number || '—'}</span></div>
                </div>
              </div>
              <div>
                <p className="font-semibold mb-2 text-sm">Insurance Claims ({insuranceClaims.length})</p>
                {insuranceClaims.length === 0 ? (
                  <p className="text-sm text-muted-foreground italic text-center py-4 border rounded-lg">No claims found for this patient</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Claim #</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Approved</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {insuranceClaims.map((c: any) => (
                        <TableRow key={c.id}>
                          <TableCell className="font-mono text-xs">{c.claim_number || c.id.slice(0, 8)}</TableCell>
                          <TableCell>TSh {Number(c.claim_amount || 0).toLocaleString()}</TableCell>
                          <TableCell>{c.approved_amount ? `TSh ${Number(c.approved_amount).toLocaleString()}` : '—'}</TableCell>
                          <TableCell>
                            <Badge variant={c.status === 'Paid' ? 'default' : c.status === 'Approved' ? 'secondary' : c.status === 'Rejected' ? 'destructive' : 'outline'} className="text-[10px]">{c.status}</Badge>
                          </TableCell>
                          <TableCell className="text-xs">{c.submission_date ? format(new Date(c.submission_date), 'dd MMM yyyy') : '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Register Patient Dialog */}
      <Dialog open={showRegisterDialog} onOpenChange={(open) => {
        setShowRegisterDialog(open);
        if (open) {
          api.get('/insurance/companies')
            .then(r => setInsuranceCompanies(r.data.companies || []))
            .catch(() => {});
        }
      }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Register New Patient</DialogTitle>
            <DialogDescription>Enter patient information to register them</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Full Name *</Label>
                <Input id="full_name" required value={registerForm.full_name} onChange={(e) => setRegisterForm({ ...registerForm, full_name: e.target.value })} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="date_of_birth">Date of Birth *</Label>
                <Input 
                  type="date" 
                  id="date_of_birth" 
                  required 
                  max={new Date().toISOString().split('T')[0]}
                  value={registerForm.date_of_birth} 
                  onChange={(e) => setRegisterForm({ ...registerForm, date_of_birth: e.target.value })} 
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="gender">Gender *</Label>
                <select
                  id="gender"
                  className="w-full p-2 border rounded-md"
                  value={registerForm.gender}
                  onChange={(e) => setRegisterForm({ ...registerForm, gender: e.target.value })}
                  required
                >
                  <option value="">Select Gender</option>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone *</Label>
                <Input id="phone" required value={registerForm.phone} onChange={(e) => setRegisterForm({ ...registerForm, phone: e.target.value })} placeholder="+255 700 000 000" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input type="email" id="email" value={registerForm.email} onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="blood_group">Blood Group</Label>
                <Input id="blood_group" value={registerForm.blood_group} onChange={(e) => setRegisterForm({ ...registerForm, blood_group: e.target.value })} placeholder="A+" />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Address *</Label>
              <Input id="address" required value={registerForm.address} onChange={(e) => setRegisterForm({ ...registerForm, address: e.target.value })} placeholder="Street, City" />
            </div>
            
            {/* Insurance Information */}
            <div className="border-t pt-4 mt-4">
              <h4 className="font-medium mb-3 text-sm text-gray-700">Insurance Information (Optional)</h4>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="insurance_company_id">Insurance Company</Label>
                  <select
                    id="insurance_company_id"
                    className="w-full p-2 border rounded-md"
                    value={registerForm.insurance_company_id}
                    onChange={(e) => setRegisterForm({ ...registerForm, insurance_company_id: e.target.value })}
                  >
                    <option value="">No Insurance</option>
                    {insuranceCompanies.map((company) => (
                      <option key={company.id} value={company.id}>
                        {company.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="insurance_number">Insurance Number</Label>
                  <Input 
                    id="insurance_number" 
                    value={registerForm.insurance_number} 
                    onChange={(e) => setRegisterForm({ ...registerForm, insurance_number: e.target.value })} 
                    placeholder="e.g., NHIF-123456"
                    disabled={!registerForm.insurance_company_id}
                  />
                </div>
              </div>
            </div>
            
            {/* Option to book with appointment */}
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center space-x-2 mb-3">
                <Checkbox 
                  id="book_with_appointment" 
                  checked={registerWithAppointment}
                  onCheckedChange={(checked) => setRegisterWithAppointment(checked as boolean)}
                />
                <Label htmlFor="book_with_appointment" className="font-medium cursor-pointer">
                  Book appointment with specialized doctor (pay department fee instead of consultation fee)
                </Label>
              </div>
              
              {registerWithAppointment && (
                <div className="space-y-3 ml-6 p-4 border rounded-lg bg-blue-50/50">
                  <div className="space-y-2">
                    <Label htmlFor="reg_department">Select Department *</Label>
                    <select
                      id="reg_department"
                      className="w-full p-2 border rounded-md"
                      value={appointmentDepartmentId}
                      onChange={(e) => setAppointmentDepartmentId(e.target.value)}
                      required={registerWithAppointment}
                      disabled={departments.length === 0}
                    >
                      <option value="">
                        {departments.length === 0 ? 'Loading departments...' : 'Select Department'}
                      </option>
                      {departments.map((dept) => (
                        <option key={dept.id} value={dept.id}>
                          {dept.name} - TSh {getDepartmentFee(dept.id).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    {departments.length === 0 && (
                      <p className="text-xs text-amber-600">No departments available. Please create departments first.</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg_doctor">Select Doctor *</Label>
                    <select
                      id="reg_doctor"
                      className="w-full p-2 border rounded-md"
                      value={appointmentDoctorId}
                      onChange={(e) => setAppointmentDoctorId(e.target.value)}
                      required={registerWithAppointment}
                      disabled={!appointmentDepartmentId || departmentDoctors.length === 0}
                    >
                      <option value="">
                        {!appointmentDepartmentId 
                          ? 'Select department first' 
                          : departmentDoctors.length === 0 
                          ? 'No doctors assigned to this department' 
                          : 'Select Doctor'}
                      </option>
                      {departmentDoctors.map((doc) => (
                        <option key={doc.id} value={doc.id}>
                          Dr. {doc.name || doc.full_name}
                        </option>
                      ))}
                    </select>
                    {departmentDoctors.length === 1 && appointmentDoctorId && (
                      <p className="text-xs text-green-600">✓ Auto-selected (only doctor in this department)</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="reg_appt_date">Appointment Date *</Label>
                      <Input
                        type="date"
                        id="reg_appt_date"
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        required={registerWithAppointment}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="reg_appt_time">Time *</Label>
                      <Input
                        type="time"
                        id="reg_appt_time"
                        value={appointmentTime}
                        onChange={(e) => setAppointmentTime(e.target.value)}
                        required={registerWithAppointment}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="reg_appt_reason">Reason for Visit</Label>
                    <Input
                      id="reg_appt_reason"
                      value={appointmentReason}
                      onChange={(e) => setAppointmentReason(e.target.value)}
                      placeholder="e.g., Heart checkup, Follow-up"
                    />
                  </div>

                  <p className="text-xs text-blue-700 bg-blue-100 p-2 rounded">
                    <strong>Note:</strong> Patient will be charged TSh {getDepartmentFee(appointmentDepartmentId).toLocaleString()} (department fee) and appointment will be scheduled for {appointmentDate || '[date]'} at {appointmentTime || '[time]'}
                  </p>
                </div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setShowRegisterDialog(false)}>Cancel</Button>
            <Button 
              type="button"
              onClick={submitPatientRegistration}
              disabled={registerWithAppointment && (!appointmentDepartmentId || !appointmentDoctorId || !appointmentDate || !appointmentTime)}
              className={registerForm.insurance_company_id ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              {registerForm.insurance_company_id
                ? '🛡 Register (Insurance — Free)'
                : registerWithAppointment ? 'Register & Schedule Appointment' : 'Register Patient'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Book Appointment Dialog */}
      <Dialog open={showBookAppointmentDialog} onOpenChange={setShowBookAppointmentDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader className="pb-4 border-b">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <Calendar className="h-5 w-5 text-blue-600" />
              {appointmentForm.patient_id ? 'Book Follow-up Appointment' : 'Book New Appointment'}
            </DialogTitle>
            <DialogDescription>
              {appointmentForm.patient_id
                ? 'Schedule a follow-up appointment for an existing patient'
                : 'Schedule a new appointment for a patient (Note: New patients should be registered first)'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4 overflow-y-auto flex-1">
            <div className="space-y-2">
              <Label htmlFor="appt_patient">Patient *</Label>
              <select
                id="appt_patient"
                className="w-full p-2 border rounded-md"
                value={appointmentForm.patient_id}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, patient_id: e.target.value })}
                required
              >
                <option value="">Select Patient</option>
                {patients.map(p => (
                  <option key={p.id} value={p.id}>{p.full_name} - {p.phone}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt_doctor">Doctor *</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <select
                    id="appt_doctor"
                    className="w-full p-2 border rounded-md"
                    value={appointmentForm.doctor_id}
                    onChange={(e) => setAppointmentForm({ ...appointmentForm, doctor_id: e.target.value })}
                    required
                    disabled={roleUpdateIndicator !== null}
                  >
                    <option value="">
                      {roleUpdateIndicator ? 'Updating doctors...' : 'Select Doctor'}
                    </option>
                    {doctors.map(d => (
                      <option key={d.id} value={d.id}>{d.full_name}</option>
                    ))}
                  </select>
                  {roleUpdateIndicator && (
                    <div className="absolute right-2 top-1/2 transform -translate-y-1/2">
                      <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                    </div>
                  )}
                </div>
                {appointmentForm.department_id && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const autoDoctor = getAutoAssignedDoctor(doctors, appointmentForm.department_id);
                      if (autoDoctor) {
                        setAppointmentForm(prev => ({ ...prev, doctor_id: autoDoctor.id }));
                      }
                    }}
                    className="px-3"
                  >
                    Auto
                  </Button>
                )}
              </div>
              {appointmentForm.department_id && appointmentForm.doctor_id && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-green-600">✓</span>
                  <span className="text-muted-foreground">
                    Doctor auto-assigned based on availability
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setAppointmentForm(prev => ({ ...prev, doctor_id: '' }))}
                    className="text-xs h-auto p-1"
                  >
                    Change
                  </Button>
                </div>
              )}
              {appointmentForm.department_id && !appointmentForm.doctor_id && (
                <p className="text-sm text-muted-foreground">
                  💡 Select a department above to auto-assign a doctor
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appt_date">Date *</Label>
                <Input
                  type="date"
                  id="appt_date"
                  value={appointmentForm.appointment_date}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, appointment_date: e.target.value })}
                  min={new Date().toISOString().split('T')[0]}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appt_time">Time *</Label>
                <Input
                  type="time"
                  id="appt_time"
                  value={appointmentForm.appointment_time}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, appointment_time: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt_department">Department</Label>
              <select
                id="appt_department"
                className="w-full p-2 border rounded-md"
                value={appointmentForm.department_id}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, department_id: e.target.value })}
              >
                <option value="">Select Department</option>
                {departments.map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt_reason">Reason for Visit</Label>
              <Input
                id="appt_reason"
                value={appointmentForm.reason}
                onChange={(e) => setAppointmentForm({ ...appointmentForm, reason: e.target.value })}
                placeholder="e.g., Regular checkup, Follow-up"
              />
            </div>

            {/* Consultation Fee Display */}
            {appointmentForm.department_id && (
              <div className="p-4 bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-blue-900">Consultation Fee</div>
                    <div className="text-xs text-blue-600 mt-1">
                      {departments.find(d => d.id === appointmentForm.department_id)?.name || 'Selected Department'}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-blue-700">
                      TSh {getDepartmentFee(appointmentForm.department_id).toLocaleString()}
                    </div>
                    <div className="text-xs text-blue-600">
                      {departmentFees[appointmentForm.department_id] ? 'Department rate' : 'Default rate'}
                    </div>
                  </div>
                </div>
                <div className="mt-2 text-xs text-blue-700 bg-blue-100/50 p-2 rounded">
                  💡 This fee will be collected at reception during check-in
                </div>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => setShowBookAppointmentDialog(false)}>Cancel</Button>
            <Button onClick={submitBookAppointment} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">
              <Calendar className="h-4 w-4 mr-2" />
              Book Appointment
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Patient Search Dialog */}
      <Dialog open={showPatientSearch} onOpenChange={setShowPatientSearch}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Patient Search</DialogTitle>
            <DialogDescription>Search for patients by name or phone number</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Input
                placeholder="Search by name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={loading}
                className="pr-10"
              />
              {loading && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="border rounded-lg p-4 max-h-96 overflow-y-auto">
                <p className="text-sm text-muted-foreground mb-2">
                  Found {searchResults.length} patient{searchResults.length !== 1 ? 's' : ''}
                </p>
                {searchResults.map((patient) => (
                  <div key={patient.id} className="p-3 border-b last:border-b-0 hover:bg-gray-50">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{patient.full_name}</span>
                      {(patient.insurance_provider || patient.insurance_number) && (
                        <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                          🛡 {patient.insurance_provider || 'Insurance'}
                          {patient.insurance_number && ` · ${patient.insurance_number}`}
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {patient.phone} • DOB: {format(new Date(patient.date_of_birth), 'MMM dd, yyyy')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Gender: {patient.gender} • Blood Group: {patient.blood_group || 'N/A'}
                    </div>
                    {patient.address && (
                      <div className="text-sm text-muted-foreground">
                        Address: {patient.address}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {searchResults.length === 0 && searchQuery.trim().length >= 1 && !loading && (
              <p className="text-center text-muted-foreground py-8">No patients found matching "{searchQuery}"</p>
            )}
          </div>
        </DialogContent>
      </Dialog>



      {/* View Schedule Dialog */}
      <Dialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Today's Schedule</DialogTitle>
            <DialogDescription>All appointments for today</DialogDescription>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto">
            {appointments.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No appointments for today</p>
            ) : (
              <div className="space-y-2">
                {appointments.map((apt) => (
                  <div key={apt.id} className="p-3 border rounded-lg">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium">{apt.patient?.full_name}</div>
                        <div className="text-sm text-muted-foreground">
                          {apt.appointment_time} • Dr. {apt.doctor?.full_name}
                        </div>
                        <div className="text-sm text-muted-foreground">{apt.reason || 'No reason specified'}</div>
                      </div>
                      <Badge variant={apt.status === 'Confirmed' ? 'default' : 'secondary'}>
                        {apt.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Collect Appointment Fee</DialogTitle>
            <DialogDescription>
              Patient: {selectedAppointmentForPayment?.patient?.full_name || 'Unknown'}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); handlePaymentSubmit(); }} className="space-y-4">
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-medium">Appointment Fee:</span>
                <span className="text-2xl font-bold text-blue-600">TSh {consultationFee.toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="payment_method">Payment Method</Label>
              <select
                id="payment_method"
                className="w-full p-2 border rounded-md"
                value={paymentForm.payment_method}
                onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
              >
                <option value="Cash">💵 Cash</option>
                <option value="Card">💳 Card</option>
                <option value="M-Pesa">📱 M-Pesa</option>
                <option value="Airtel Money">📱 Airtel Money</option>
                <option value="Tigo Pesa">📱 Tigo Pesa</option>
                <option value="Halopesa">📱 Halopesa</option>
              </select>
            </div>

            {/* Mobile Money Phone Number Input */}
            {['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method) && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Label htmlFor="apt_mobile_phone">Mobile Money Phone Number *</Label>
                <Input
                  id="apt_mobile_phone"
                  type="tel"
                  placeholder="0712345678"
                  pattern="^0[67][0-9]{8}$"
                  title="Enter valid Tanzanian phone number (07xxxxxxxx or 06xxxxxxxx)"
                  required
                />
                <p className="text-xs text-blue-600">
                  📱 Payment request will be sent to this number
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="amount_paid">Amount Paid</Label>
              <Input
                id="amount_paid"
                type="number"
                value={paymentForm.amount_paid}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                placeholder="Enter amount"
              />
            </div>

            {Number(paymentForm.amount_paid) > consultationFee && (
              <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                <div className="flex justify-between items-center">
                  <span className="font-medium text-green-800">Change to Return:</span>
                  <span className="text-xl font-bold text-green-600">
                    TSh {(Number(paymentForm.amount_paid) - consultationFee).toLocaleString()}
                  </span>
                </div>
              </div>
            )}

            {Number(paymentForm.amount_paid) < consultationFee && paymentForm.amount_paid !== '' && (
              <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                <span className="text-sm text-red-600">Insufficient payment amount</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowPaymentDialog(false)}>
                Cancel
              </Button>
              <Button 
                type="submit"
                disabled={Number(paymentForm.amount_paid) < consultationFee}
              >
                Confirm Payment & Check In
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Registration Payment Dialog */}
      <Dialog open={showRegistrationPaymentDialog} onOpenChange={setShowRegistrationPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Collect {registerWithAppointment && appointmentDepartmentId ? 'Department' : 'Consultation'} Fee</DialogTitle>
            <DialogDescription>
              New Patient: {registerForm.full_name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); completePatientRegistration(); }} className="space-y-4">
            {registerWithAppointment && appointmentDepartmentId && (
              <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
                <p className="text-sm text-purple-800">
                  <strong>Booking with Appointment:</strong> Department-specific fee applies
                </p>
              </div>
            )}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {registerWithAppointment && appointmentDepartmentId ? 'Department Fee:' : 'Consultation Fee:'}
                </span>
                <span className="text-2xl font-bold text-blue-600">
                  TSh {(registerWithAppointment && appointmentDepartmentId 
                    ? getDepartmentFee(appointmentDepartmentId) 
                    : consultationFee).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reg_payment_method">Payment Method</Label>
              {registerForm.insurance_company_id ? (
                <>
                  <select
                    id="reg_payment_method"
                    className="w-full p-2 border rounded-md bg-blue-50"
                    value="Insurance"
                    disabled
                  >
                    <option value="Insurance">🛡️ Insurance (Patient has insurance)</option>
                  </select>
                  <p className="text-sm text-blue-600">
                    ℹ️ This patient has insurance. Payment will be processed through insurance claim.
                  </p>
                </>
              ) : (
                <select
                  id="reg_payment_method"
                  className="w-full p-2 border rounded-md"
                  value={paymentForm.payment_method}
                  onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                >
                  <option value="Cash">💵 Cash</option>
                  <option value="Card">💳 Card</option>
                  <option value="M-Pesa">📱 M-Pesa</option>
                  <option value="Airtel Money">📱 Airtel Money</option>
                  <option value="Tigo Pesa">📱 Tigo Pesa</option>
                  <option value="Halopesa">📱 Halopesa</option>
                </select>
              )}
            </div>

            {/* Mobile Money Phone Number Input */}
            {['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method) && !registerForm.insurance_company_id && (
              <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <Label htmlFor="mobile_phone">Mobile Money Phone Number *</Label>
                <Input
                  id="mobile_phone"
                  type="tel"
                  placeholder="0712345678"
                  pattern="^0[67][0-9]{8}$"
                  title="Enter valid Tanzanian phone number (07xxxxxxxx or 06xxxxxxxx)"
                  required
                />
                <p className="text-xs text-blue-600">
                  📱 Payment request will be sent to this number
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="reg_amount_paid">Amount Paid</Label>
              <Input
                id="reg_amount_paid"
                type="number"
                value={paymentForm.amount_paid}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                placeholder="Enter amount"
              />
            </div>

            {(() => {
              const requiredFee = registerWithAppointment && appointmentDepartmentId 
                ? getDepartmentFee(appointmentDepartmentId) 
                : consultationFee;
              
              return (
                <>
                  {Number(paymentForm.amount_paid) > requiredFee && (
                    <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-green-800">Change to Return:</span>
                        <span className="text-xl font-bold text-green-600">
                          TSh {(Number(paymentForm.amount_paid) - requiredFee).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}

                  {Number(paymentForm.amount_paid) < requiredFee && paymentForm.amount_paid !== '' && (
                    <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                      <span className="text-sm text-red-600">Insufficient payment amount</span>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-4">
                    <Button 
                      type="button"
                      variant="outline" 
                      onClick={() => {
                        setShowRegistrationPaymentDialog(false);
                        setShowRegisterDialog(true);
                      }}
                    >
                      Back
                    </Button>
                    <Button 
                      type="submit"
                      disabled={Number(paymentForm.amount_paid) < requiredFee || loading}
                    >
                      {loading ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Processing...
                        </>
                      ) : (
                        'Confirm Payment & Register'
                      )}
                    </Button>
                  </div>
                </>
              );
            })()}
          </form>
        </DialogContent>
      </Dialog>

      {/* Returning Patient Payment Dialog */}
      <Dialog open={showReturningPatientPaymentDialog} onOpenChange={setShowReturningPatientPaymentDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Collect Consultation Fee</DialogTitle>
            <DialogDescription>
              Returning Patient: {selectedReturningPatient?.full_name}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); completeReturningPatientVisit(); }} className="space-y-4">
            
            <div className="space-y-2">
              <Label htmlFor="visit_type">Visit Type</Label>
              <select
                id="visit_type"
                className="w-full p-2 border rounded-md bg-white"
                value={visitType}
                onChange={(e) => setVisitType(e.target.value as any)}
              >
                <option value="Consultation">🩺 Consultation (Doctor Visit)</option>
                <option value="Pharmacy Only">💊 Pharmacy Only (Buy Medicine)</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {visitType === 'Consultation' && '→ Nurse → Doctor → Lab/Pharmacy/Discharge'}
                {visitType === 'Pharmacy Only' && '→ Pharmacist writes prescription → Dispense → Billing'}
              </p>
            </div>

            <div className={`p-4 rounded-lg border ${visitType === 'Consultation' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200'}`}>
              <div className="flex justify-between items-center">
                <span className="font-medium">
                  {visitType === 'Consultation' ? 'Consultation Fee:' : 'Fee:'}
                </span>
                <span className={`text-2xl font-bold ${visitType === 'Consultation' ? 'text-blue-600' : 'text-green-600'}`}>
                  {visitType === 'Consultation' ? `TSh ${consultationFee.toLocaleString()}` : 'FREE'}
                </span>
              </div>
              {visitType !== 'Consultation' && (
                <p className="text-xs text-green-700 mt-2">
                  ✓ No consultation fee for {visitType} visits
                </p>
              )}
            </div>

            {visitType === 'Consultation' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="ret_payment_method">Payment Method</Label>
                  <select
                    id="ret_payment_method"
                    className="w-full p-2 border rounded-md"
                    value={paymentForm.payment_method}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_method: e.target.value })}
                  >
                    <option value="Cash">💵 Cash</option>
                    <option value="Card">💳 Card</option>
                    <option value="M-Pesa">📱 M-Pesa</option>
                    <option value="Airtel Money">📱 Airtel Money</option>
                    <option value="Tigo Pesa">📱 Tigo Pesa</option>
                    <option value="Halopesa">📱 Halopesa</option>
                  </select>
                </div>

                {/* Mobile Money Phone Number Input */}
                {['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentForm.payment_method) && (
                  <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <Label htmlFor="ret_mobile_phone">Mobile Money Phone Number *</Label>
                    <Input
                      id="ret_mobile_phone"
                      type="tel"
                      placeholder="0712345678"
                      pattern="^0[67][0-9]{8}$"
                      title="Enter valid Tanzanian phone number (07xxxxxxxx or 06xxxxxxxx)"
                      required
                    />
                    <p className="text-xs text-blue-600">
                      📱 Payment request will be sent to this number
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="ret_amount_paid">Amount Paid</Label>
                  <Input
                    id="ret_amount_paid"
                    type="number"
                    value={paymentForm.amount_paid}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount_paid: e.target.value })}
                    placeholder="Enter amount"
                  />
                </div>

                {Number(paymentForm.amount_paid) > consultationFee && (
                  <div className="p-3 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex justify-between items-center">
                      <span className="font-medium text-green-800">Change to Return:</span>
                      <span className="text-xl font-bold text-green-600">
                        TSh {(Number(paymentForm.amount_paid) - consultationFee).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}

                {Number(paymentForm.amount_paid) < consultationFee && paymentForm.amount_paid !== '' && (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <span className="text-sm text-red-600">Insufficient payment amount</span>
                  </div>
                )}
              </>
            )}

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline" onClick={() => {
                setShowReturningPatientPaymentDialog(false);
                setShowReturningPatientDialog(true);
              }}>
                Back
              </Button>
              <Button 
                type="submit"
                disabled={visitType === 'Consultation' && Number(paymentForm.amount_paid) < consultationFee}
                className={visitType !== 'Consultation' ? 'bg-green-600 hover:bg-green-700' : ''}
              >
                {visitType === 'Consultation' ? 'Confirm Payment & Create Visit' : 'Create Visit (No Payment)'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Returning Patient Dialog */}
      <Dialog open={showReturningPatientDialog} onOpenChange={setShowReturningPatientDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Returning Patient - Create New Visit</DialogTitle>
            <DialogDescription>
              Search for an existing patient and create a new visit
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Search Patient</Label>
              <Input
                placeholder="Search by name or phone..."
                value={returningPatientSearch}
                onChange={(e) => setReturningPatientSearch(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-muted-foreground mt-1">
                Start typing to search in real-time
              </p>
            </div>

            <div className="max-h-96 overflow-y-auto border rounded-lg">
              {returningPatientResults.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {returningPatientSearch.trim().length >= 1
                    ? `No patients found matching "${returningPatientSearch}"`
                    : 'Start typing to search for patients'}
                </div>
              ) : (
                <div className="divide-y">
                  {returningPatientResults.map((patient) => (
                    <div key={patient.id} className="p-4 hover:bg-muted/50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-lg">{patient.full_name}</span>
                            {(patient.insurance_provider || patient.insurance_number) && (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium">
                                🛡 {patient.insurance_provider || 'Insurance'}
                                {patient.insurance_number && ` · ${patient.insurance_number}`}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground mt-1 space-y-1">
                            <div>📞 {patient.phone}</div>
                            <div>🎂 DOB: {format(new Date(patient.date_of_birth), 'MMM dd, yyyy')} ({new Date().getFullYear() - new Date(patient.date_of_birth).getFullYear()} years)</div>
                            <div>⚧ {patient.gender}</div>
                            {patient.blood_group && <div>🩸 {patient.blood_group}</div>}
                            {patient.allergies && (
                              <div className="text-red-600 font-medium">⚠️ Allergies: {patient.allergies}</div>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => {
                              setSelectedPatientForService(patient);
                              setShowQuickServiceDialog(true);
                              setShowReturningPatientDialog(false);
                            }}
                            disabled={loading}
                          >
                            <Stethoscope className="h-4 w-4 mr-2" />
                            Quick Service
                          </Button>
                          <Button
                            onClick={() => initiateReturningPatientVisit(patient)}
                            disabled={loading}
                          >
                            {loading ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                Creating...
                              </>
                            ) : (
                              <>
                                <UserPlus className="h-4 w-4 mr-2" />
                                Create Visit
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Quick Service Dialog */}
      <QuickServiceDialog
        open={showQuickServiceDialog}
        onOpenChange={setShowQuickServiceDialog}
        patient={selectedPatientForService}
        onSuccess={() => {
          toast.success('Service assigned successfully');
          fetchData();
        }}
      />

      {/* Direct to Pharmacy Dialog */}
      <Dialog open={showDirectPharmacyDialog} onOpenChange={(open) => {
        setShowDirectPharmacyDialog(open);
        if (!open) {
          setDirectPharmacySearch('');
          setDirectPharmacyResults([]);
        }
      }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pill className="h-5 w-5 text-purple-600" />
              Direct to Pharmacy
            </DialogTitle>
            <DialogDescription>
              Send patient directly to pharmacy queue. Pharmacy staff will create the prescription.
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="existing" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="existing">Existing Patient</TabsTrigger>
              <TabsTrigger value="new">New Walk-in</TabsTrigger>
            </TabsList>
            
            {/* Existing Patient Tab */}
            <TabsContent value="existing" className="space-y-4">
                <div className="space-y-2">
                  <Label>Search Patient</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Search by name or phone..."
                      value={directPharmacySearch}
                      onChange={(e) => setDirectPharmacySearch(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          api.get(`/patients?search=${directPharmacySearch}`)
                            .then(({ data }) => setDirectPharmacyResults(data.patients || []))
                            .catch(() => toast.error('Failed to search patients'));
                        }
                      }}
                    />
                    <Button 
                      onClick={async () => {
                        try {
                          const { data } = await api.get(`/patients?search=${directPharmacySearch}`);
                          setDirectPharmacyResults(data.patients || []);
                        } catch (error) {
                          toast.error('Failed to search patients');
                        }
                      }}
                    >
                      Search
                    </Button>
                  </div>
                </div>

                {/* Search Results */}
                {directPharmacyResults.length > 0 && (
                  <div className="border rounded-lg max-h-60 overflow-y-auto">
                    {directPharmacyResults.map((patient) => (
                      <div
                        key={patient.id}
                        className="p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
                        onClick={async () => {
                          try {
                            // Create pharmacy visit directly
                            const visitData = {
                              patient_id: patient.id,
                              visit_date: new Date().toISOString().split('T')[0],
                              visit_type: 'Pharmacy Only',
                              status: 'Active',
                              current_stage: 'pharmacy',
                              reception_status: 'Checked In',
                              reception_completed_at: new Date().toISOString(),
                              doctor_status: 'Not Required',
                              nurse_status: 'Not Required',
                              lab_status: 'Not Required',
                              pharmacy_status: 'Pending',
                              billing_status: 'Pending',
                              overall_status: 'Active',
                              notes: 'Direct to pharmacy - prescription to be created by pharmacy staff'
                            };

                            await api.post('/visits', visitData);
                            toast.success(`${patient.full_name} sent to pharmacy queue!`);
                            setShowDirectPharmacyDialog(false);
                            setDirectPharmacySearch('');
                            setDirectPharmacyResults([]);
                            fetchData(false);
                          } catch (error: any) {

                            toast.error(error.response?.data?.error || 'Failed to send to pharmacy');
                          }
                        }}
                      >
                        <div className="font-medium">{patient.full_name}</div>
                        <div className="text-sm text-gray-600">{patient.phone}</div>
                        {patient.insurance_company && (
                          <div className="text-xs text-blue-600">Insurance: {patient.insurance_company}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            
              {/* New Walk-in Patient Tab */}
              <TabsContent value="new" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Full Name *</Label>
                    <Input placeholder="Patient name" id="pharmacy_name" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone *</Label>
                    <Input placeholder="Phone number" id="pharmacy_phone" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Gender *</Label>
                    <select className="w-full p-2 border rounded-md" id="pharmacy_gender" required>
                      <option value="">Select...</option>
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Date of Birth *</Label>
                    <Input 
                      type="date" 
                      id="pharmacy_dob" 
                      max={new Date().toISOString().split('T')[0]}
                      required
                    />
                  </div>
                </div>
                
                <Button 
                  className="w-full bg-purple-600 hover:bg-purple-700"
                  onClick={async () => {
                    try {
                      const name = (document.getElementById('pharmacy_name') as HTMLInputElement).value;
                      const phone = (document.getElementById('pharmacy_phone') as HTMLInputElement).value;
                      const gender = (document.getElementById('pharmacy_gender') as HTMLSelectElement).value;
                      const dob = (document.getElementById('pharmacy_dob') as HTMLInputElement).value;
                      
                      if (!name || !phone) {
                        toast.error('Name and phone are required');
                        return;
                      }
                      
                      if (!gender) {
                        toast.error('Gender is required');
                        return;
                      }
                      
                      if (!dob) {
                        toast.error('Date of birth is required');
                        return;
                      }
                      
                      // Register patient
                      const patientData = {
                        full_name: name,
                        phone: phone,
                        gender: gender,
                        date_of_birth: dob,
                        address: 'Walk-in',
                        status: 'Active'
                      };
                      
                      const patientRes = await api.post('/patients', patientData);
                      const newPatient = patientRes.data.patient || patientRes.data;
                      
                      // Create pharmacy visit directly
                      const visitData = {
                        patient_id: newPatient.id,
                        visit_date: new Date().toISOString().split('T')[0],
                        visit_type: 'Pharmacy Only',
                        status: 'Active',
                        current_stage: 'pharmacy',
                        reception_status: 'Checked In',
                        reception_completed_at: new Date().toISOString(),
                        doctor_status: 'Not Required',
                        nurse_status: 'Not Required',
                        lab_status: 'Not Required',
                        pharmacy_status: 'Pending',
                        billing_status: 'Pending',
                        overall_status: 'Active',
                        notes: 'Direct to pharmacy - prescription to be created by pharmacy staff'
                      };

                      await api.post('/visits', visitData);
                      toast.success(`${name} registered and sent to pharmacy queue!`);
                      setShowDirectPharmacyDialog(false);
                      setDirectPharmacySearch('');
                      fetchData(false);
                    } catch (error: any) {
                      toast.error(error.response?.data?.error || 'Failed to register patient');
                    }
                  }}
                >
                  Register & Send to Pharmacy
                </Button>
              </TabsContent>
            </Tabs>

          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <p className="text-sm text-purple-800">
              <strong>Note:</strong> This sends the patient directly to the pharmacy queue. Pharmacy staff will create the prescription.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Stellar Identity Dialog */}
      {selectedStellarPatient && (
        <PatientIdentityDialog
          open={showStellarDialog}
          onOpenChange={setShowStellarDialog}
          patient={selectedStellarPatient}
          onIdentityAssigned={fetchData}
        />
      )}

      {/* Patient Portal Account Info — shown after registration */}
      {lastRegisteredPatient && (
        <div className="fixed bottom-4 right-4 z-50 bg-white border border-blue-200 rounded-xl shadow-lg p-4 max-w-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="font-semibold text-sm text-blue-800">✅ Portal Account Ready</p>
              <p className="text-xs text-gray-600"><strong>{lastRegisteredPatient.full_name}</strong></p>
              <p className="text-xs text-gray-600">Phone: <strong>{lastRegisteredPatient.phone}</strong></p>
              <p className="text-xs text-gray-600">Password: <strong>HMS1234</strong></p>
              <p className="text-xs text-muted-foreground">Patient can login at: /patient-login</p>
            </div>
            <button
              onClick={() => setLastRegisteredPatient(null)}
              className="text-gray-400 hover:text-gray-600 text-lg leading-none"
            >×</button>
          </div>
        </div>
      )}

    </>
  );
}
