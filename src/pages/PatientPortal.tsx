import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { LogOut, KeyRound, Loader2, User, Phone, Droplets, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';
import { PatientSharingPortal } from '@/components/PatientSharingPortal';

export default function PatientPortal() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [patientRecord, setPatientRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  useEffect(() => {
    if (!user) { navigate('/patient-login'); return; }
    fetchPatientRecord();
  }, [user]);

  const fetchPatientRecord = async () => {
    try {
      // Find patient record linked to this user's phone
      const { data } = await api.get(`/patients?phone=${user?.user_metadata?.phone || ''}&limit=1`);
      const patients = data.patients || data.data || [];
      if (patients.length > 0) {
        setPatientRecord(patients[0]);
      } else {
        // Try searching by user phone from profile
        const profile = await api.get('/account/profile');
        const phone = profile.data.user?.phone;
        if (phone) {
          const { data: pd } = await api.get(`/patients?phone=${phone}&limit=1`);
          const recs = pd.patients || pd.data || [];
          if (recs.length > 0) setPatientRecord(recs[0]);
        }
      }
    } catch {
      // patient record not found — show basic portal
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

  const displayName = user?.user_metadata?.full_name || patientRecord?.full_name || 'Patient';
  const phone = user?.user_metadata?.phone || patientRecord?.phone || '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-50">
      {/* Header */}
      <div className="bg-white border-b shadow-sm px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/favicon.svg" alt="HMS" className="h-8 w-8" />
          <div>
            <p className="font-semibold text-gray-800 text-sm">{displayName}</p>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3" /> {phone}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowChangePassword(true)} title="Change Password">
            <KeyRound className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { signOut(); navigate('/patient-login'); }}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 space-y-4">

        {/* Patient Info */}
        {patientRecord && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <User className="h-4 w-4 text-blue-600" />
                My Information
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">Full Name</p>
                  <p className="font-medium">{patientRecord.full_name}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="font-medium">{patientRecord.phone}</p>
                </div>
                {patientRecord.date_of_birth && (
                  <div>
                    <p className="text-xs text-muted-foreground">Date of Birth</p>
                    <p className="font-medium">{new Date(patientRecord.date_of_birth).toLocaleDateString()}</p>
                  </div>
                )}
                {patientRecord.gender && (
                  <div>
                    <p className="text-xs text-muted-foreground">Gender</p>
                    <p className="font-medium">{patientRecord.gender}</p>
                  </div>
                )}
                {patientRecord.blood_group && (
                  <div className="flex items-center gap-2">
                    <Droplets className="h-4 w-4 text-red-500" />
                    <div>
                      <p className="text-xs text-muted-foreground">Blood Group</p>
                      <p className="font-bold text-red-600">{patientRecord.blood_group}</p>
                    </div>
                  </div>
                )}
                {patientRecord.allergies && (
                  <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-2 flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-xs font-semibold text-red-700">Allergies</p>
                      <p className="text-sm text-red-600">{patientRecord.allergies}</p>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Default password warning */}
        {(
          <Card className="border-amber-200 bg-amber-50">
            <CardContent className="pt-4 pb-3">
              <div className="flex items-start gap-3">
                <KeyRound className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Change your default password</p>
                  <p className="text-xs text-amber-700 mt-1">
                    If you haven't changed your password yet, your default is <strong>HMS1234</strong>.
                    Change it to keep your account secure.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 border-amber-300 text-amber-700 hover:bg-amber-100"
                    onClick={() => setShowChangePassword(true)}
                  >
                    Change Password
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Sharing Portal */}
        {patientRecord?.id && (
          <PatientSharingPortal patientId={patientRecord.id} />
        )}

        {!patientRecord && (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <p>No patient record found for your account.</p>
              <p className="text-sm mt-1">Please visit reception to link your account.</p>
            </CardContent>
          </Card>
        )}
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
              <Input
                type="password"
                placeholder="HMS1234 (default)"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>Confirm New Password</Label>
              <Input
                type="password"
                placeholder="Repeat new password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                required
              />
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
