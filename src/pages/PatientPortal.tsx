import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  LogOut, KeyRound, Loader2, User, Phone, Droplets,
  AlertTriangle, Stethoscope, FlaskConical, Pill,
  Receipt, Share2, Calendar, FileText, CheckCircle
} from 'lucide-react';
import { format } from 'date-fns';
import api from '@/lib/api';
import { PatientSharingPortal } from '@/components/PatientSharingPortal';

export default function PatientPortal() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const [patient, setPatient] = useState<any>(null);
  const [visits, setVisits] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [labTests, setLabTests] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/patient-login'); return; }
    loadAll();
  }, [user]);

  const loadAll = async () => {
    try {
      // Get user profile to find phone
      const profileRes = await api.get('/account/profile');
      const phone = profileRes.data.user?.phone;
      if (!phone) { setLoading(false); return; }

      // Find patient record by phone
      const pRes = await api.get(`/patients?search=${phone}&limit=1`);
      const patients = pRes.data.patients || pRes.data.data || [];
      if (patients.length === 0) { setLoading(false); return; }

      const p = patients[0];
      setPatient(p);

      // Load all patient data in parallel
      const [visitsRes, prescRes, labRes, invRes] = await Promise.allSettled([
        api.get(`/visits?patient_id=${p.id}&limit=50`),
        api.get(`/prescriptions?patient_id=${p.id}&limit=50`),
        api.get(`/lab-tests?patient_id=${p.id}&limit=50`),
        api.get(`/invoices?patient_id=${p.id}&limit=50`),
      ]);

      if (visitsRes.status === 'fulfilled') {
        setVisits(visitsRes.value.data.visits || visitsRes.value.data.data || []);
      }
      if (prescRes.status === 'fulfilled') {
        setPrescriptions(prescRes.value.data.prescriptions || prescRes.value.data.data || []);
      }
      if (labRes.status === 'fulfilled') {
        setLabTests(labRes.value.data.labTests || labRes.value.data.data || []);
      }
      if (invRes.status === 'fulfilled') {
        setInvoices(invRes.value.data.invoices || invRes.value.data.data || []);
      }
    } catch (e) {
      toast.error('Failed to load your data');
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) return toast.error('Passwords do not match');
    if (newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    setChangingPassword(true);
    try {
      await api.post('/account/change-password', {
        current_password: currentPassword,
        new_password: newPassword,
        new_password_confirmation: confirmPassword,
      });
      toast.success('Password changed. Please log in again.');
      setShowChangePassword(false);
      await signOut();
      navigate('/patient-login');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to change password');
    } finally {
      setChangingPassword(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
      </div>
    );
  }

  const totalPaid = invoices
    .filter(i => i.status === 'Paid')
    .reduce((s, i) => s + parseFloat(i.paid_amount || 0), 0);

  const totalOwed = invoices
    .filter(i => i.status !== 'Paid' && i.status !== 'Cancelled')
    .reduce((s, i) => s + parseFloat(i.balance || 0), 0);

  return (
    <div className="min-h-screen bg-gray-50">

      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="HMS" className="h-8 w-8" />
          <div>
            <p className="font-semibold text-gray-800 text-sm">{patient?.full_name || user?.user_metadata?.full_name}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {patient?.phone || user?.user_metadata?.phone}
            </p>
          </div>
        </div>
        <div className="flex gap-1">
          <Button variant="ghost" size="sm" onClick={() => setShowChangePassword(true)} title="Change Password">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/patient-login'); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Default password warning */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="py-3 px-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-amber-800">
                <strong>Security:</strong> Make sure your password is strong and only you know it.
              </p>
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700 text-xs flex-shrink-0"
                onClick={() => setShowChangePassword(true)}>
                Change
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Visits', value: visits.length, icon: Calendar, color: 'text-blue-600' },
            { label: 'Prescriptions', value: prescriptions.length, icon: Pill, color: 'text-green-600' },
            { label: 'Lab Tests', value: labTests.length, icon: FlaskConical, color: 'text-purple-600' },
            { label: 'Invoices', value: invoices.length, icon: Receipt, color: 'text-orange-600' },
          ].map(s => (
            <Card key={s.label} className="text-center">
              <CardContent className="pt-3 pb-2 px-2">
                <s.icon className={`h-5 w-5 mx-auto mb-1 ${s.color}`} />
                <p className="text-xl font-bold">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Tabs */}
        <Tabs defaultValue="info">
          <TabsList className="grid grid-cols-5 w-full">
            <TabsTrigger value="info"><User className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="visits"><Stethoscope className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="lab"><FlaskConical className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="billing"><Receipt className="h-4 w-4" /></TabsTrigger>
            <TabsTrigger value="share"><Share2 className="h-4 w-4" /></TabsTrigger>
          </TabsList>

          {/* ── My Info ── */}
          <TabsContent value="info" className="space-y-3 mt-3">
            {patient ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-600" /> My Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-xs text-muted-foreground">Full Name</p><p className="font-medium">{patient.full_name}</p></div>
                    <div><p className="text-xs text-muted-foreground">Phone</p><p className="font-medium">{patient.phone}</p></div>
                    {patient.date_of_birth && <div><p className="text-xs text-muted-foreground">Date of Birth</p><p className="font-medium">{format(new Date(patient.date_of_birth), 'dd MMM yyyy')}</p></div>}
                    {patient.gender && <div><p className="text-xs text-muted-foreground">Gender</p><p className="font-medium">{patient.gender}</p></div>}
                    {patient.email && <div className="col-span-2"><p className="text-xs text-muted-foreground">Email</p><p className="font-medium">{patient.email}</p></div>}
                    {patient.address && <div className="col-span-2"><p className="text-xs text-muted-foreground">Address</p><p className="font-medium">{patient.address}</p></div>}
                  </div>

                  {patient.blood_group && (
                    <div className="flex items-center gap-2 bg-red-50 border border-red-100 rounded-lg p-3">
                      <Droplets className="h-5 w-5 text-red-500" />
                      <div>
                        <p className="text-xs text-muted-foreground">Blood Group</p>
                        <p className="text-xl font-bold text-red-600">{patient.blood_group}</p>
                      </div>
                    </div>
                  )}

                  {patient.allergies && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
                      <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-semibold text-red-700">⚠ Allergies</p>
                        <p className="text-sm text-red-600">{patient.allergies}</p>
                      </div>
                    </div>
                  )}

                  {patient.insurance_provider && (
                    <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 text-sm">
                      <p className="text-xs text-muted-foreground">Insurance</p>
                      <p className="font-medium">{patient.insurance_provider}</p>
                      {patient.insurance_number && <p className="text-xs text-muted-foreground">No: {patient.insurance_number}</p>}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card><CardContent className="pt-6 text-center text-muted-foreground">
                No patient record found. Visit reception to link your account.
              </CardContent></Card>
            )}
          </TabsContent>

          {/* ── Visits & Diagnoses ── */}
          <TabsContent value="visits" className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">{visits.length} visit{visits.length !== 1 ? 's' : ''} recorded</p>
            {visits.length === 0 ? (
              <Card><CardContent className="pt-6 text-center text-muted-foreground">No visits yet</CardContent></Card>
            ) : visits.map(v => (
              <Card key={v.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-blue-500" />
                      <span className="font-medium text-sm">
                        {v.visit_date ? format(new Date(v.visit_date), 'dd MMM yyyy') : '—'}
                      </span>
                    </div>
                    <Badge variant={v.overall_status === 'Completed' ? 'default' : 'secondary'} className="text-xs">
                      {v.overall_status || v.status}
                    </Badge>
                  </div>

                  {v.chief_complaint && (
                    <div><p className="text-xs text-muted-foreground">Complaint</p>
                    <p className="text-sm">{v.chief_complaint}</p></div>
                  )}

                  {(v.final_diagnosis || v.provisional_diagnosis) && (
                    <div className="bg-blue-50 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Diagnosis</p>
                      <p className="text-sm font-medium">{v.final_diagnosis || v.provisional_diagnosis}</p>
                      {(v.final_icd10_code || v.icd10_code) && (
                        <Badge variant="outline" className="text-xs mt-1">
                          ICD-10: {v.final_icd10_code || v.icd10_code}
                        </Badge>
                      )}
                    </div>
                  )}

                  {v.treatment_rx && (
                    <div><p className="text-xs text-muted-foreground">Treatment</p>
                    <p className="text-sm">{v.treatment_rx}</p></div>
                  )}

                  {v.doctor?.name && (
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <Stethoscope className="h-3 w-3" /> Dr. {v.doctor.name}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Lab Tests ── */}
          <TabsContent value="lab" className="space-y-3 mt-3">
            <p className="text-xs text-muted-foreground">{labTests.length} test{labTests.length !== 1 ? 's' : ''}</p>
            {labTests.length === 0 ? (
              <Card><CardContent className="pt-6 text-center text-muted-foreground">No lab tests yet</CardContent></Card>
            ) : labTests.map(t => (
              <Card key={t.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <FlaskConical className="h-4 w-4 text-purple-500" />
                      <span className="font-medium text-sm">{t.test_name}</span>
                    </div>
                    <Badge variant={t.status === 'Completed' ? 'default' : 'secondary'} className="text-xs">
                      {t.status}
                    </Badge>
                  </div>

                  {t.status === 'Completed' && t.result_value && (
                    <div className="bg-purple-50 rounded-lg p-3 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold">{t.result_value} {t.result_unit}</span>
                        {t.normal_range && (
                          <span className="text-xs text-muted-foreground">Normal: {t.normal_range}</span>
                        )}
                      </div>
                      {t.result_notes && <p className="text-xs text-muted-foreground">{t.result_notes}</p>}
                    </div>
                  )}

                  {t.test_date && (
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(t.test_date), 'dd MMM yyyy')}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Billing ── */}
          <TabsContent value="billing" className="space-y-3 mt-3">
            <div className="grid grid-cols-2 gap-3">
              <Card className="bg-green-50 border-green-200">
                <CardContent className="pt-3 pb-2 text-center">
                  <p className="text-xs text-muted-foreground">Total Paid</p>
                  <p className="text-lg font-bold text-green-700">TSh {totalPaid.toLocaleString()}</p>
                </CardContent>
              </Card>
              <Card className={totalOwed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50'}>
                <CardContent className="pt-3 pb-2 text-center">
                  <p className="text-xs text-muted-foreground">Outstanding</p>
                  <p className={`text-lg font-bold ${totalOwed > 0 ? 'text-red-700' : 'text-gray-500'}`}>
                    TSh {totalOwed.toLocaleString()}
                  </p>
                </CardContent>
              </Card>
            </div>

            {invoices.length === 0 ? (
              <Card><CardContent className="pt-6 text-center text-muted-foreground">No invoices yet</CardContent></Card>
            ) : invoices.map(inv => (
              <Card key={inv.id}>
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-sm">{inv.invoice_number}</p>
                      <p className="text-xs text-muted-foreground">
                        {inv.invoice_date ? format(new Date(inv.invoice_date), 'dd MMM yyyy') : '—'}
                      </p>
                    </div>
                    <Badge variant={inv.status === 'Paid' ? 'default' : inv.status === 'Pending' ? 'secondary' : 'destructive'} className="text-xs">
                      {inv.status}
                    </Badge>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-medium">TSh {parseFloat(inv.total_amount || 0).toLocaleString()}</span>
                  </div>
                  {parseFloat(inv.paid_amount || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-green-500" /> Paid
                      </span>
                      <span className="text-green-600 font-medium">TSh {parseFloat(inv.paid_amount).toLocaleString()}</span>
                    </div>
                  )}
                  {parseFloat(inv.balance || 0) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Balance</span>
                      <span className="text-red-600 font-medium">TSh {parseFloat(inv.balance).toLocaleString()}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          {/* ── Share Records ── */}
          <TabsContent value="share" className="mt-3">
            {patient?.id ? (
              <PatientSharingPortal patientId={patient.id} />
            ) : (
              <Card><CardContent className="pt-6 text-center text-muted-foreground">
                Link your account at reception to share records.
              </CardContent></Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Change Password Dialog */}
      <Dialog open={showChangePassword} onOpenChange={setShowChangePassword}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Change Password
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={changePassword} className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Current Password</Label>
              <Input type="password" placeholder="Current password" value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" placeholder="At least 6 characters" value={newPassword}
                onChange={e => setNewPassword(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input type="password" placeholder="Repeat new password" value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)} required />
            </div>
            <Button type="submit" className="w-full" disabled={changingPassword}>
              {changingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Change Password
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
