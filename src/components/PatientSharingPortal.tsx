import { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Copy, CheckCircle, Share2, ShieldCheck, ShieldX,
  Loader2, Trash2, Clock, Star, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '@/lib/api';

interface PatientSharingPortalProps {
  patientId: string;
}

export function PatientSharingPortal({ patientId }: PatientSharingPortalProps) {
  const [patient, setPatient] = useState<any>(null);
  const [grants, setGrants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  // Grant form
  const [showGrantForm, setShowGrantForm] = useState(false);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [doctors, setDoctors] = useState<any[]>([]);
  const [selectedDoctor, setSelectedDoctor] = useState<any>(null);
  const [expiryHours, setExpiryHours] = useState('48');
  const [purpose, setPurpose] = useState('');

  // Generated token dialog
  const [generatedToken, setGeneratedToken] = useState<any>(null);

  useEffect(() => {
    fetchPatient();
    fetchGrants();
  }, [patientId]);

  const fetchPatient = async () => {
    try {
      const { data } = await api.get(`/patients/${patientId}`);
      setPatient(data.patient || data);
    } catch {
      toast.error('Failed to load patient data');
    } finally {
      setLoading(false);
    }
  };

  const fetchGrants = async () => {
    try {
      const { data } = await api.get(`/patients/${patientId}/access-grants`);
      setGrants(data.grants || []);
    } catch {
      // no grants yet
    }
  };

  const searchDoctors = async (q: string) => {
    setDoctorSearch(q);
    if (q.length < 2) { setDoctors([]); return; }
    try {
      const { data } = await api.get(`/users/profiles?role=doctor&search=${q}`);
      setDoctors(data.users || data.doctors || []);
    } catch {
      setDoctors([]);
    }
  };

  const assignIdentity = async () => {
    setGenerating(true);
    try {
      const { data } = await api.post(`/patients/${patientId}/identity`, { generate_wallet: true });
      setPatient((p: any) => ({ ...p, stellar_public_key: data.public_key, share_code: data.share_code }));
      toast.success('Stellar identity assigned');
      if (data.secret_key) {
        setGeneratedToken({ type: 'identity', ...data });
      }
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to assign identity');
    } finally {
      setGenerating(false);
    }
  };

  const grantAccess = async () => {
    if (!selectedDoctor) return toast.error('Select a doctor first');
    setGenerating(true);
    try {
      const { data } = await api.post(`/patients/${patientId}/access-grants`, {
        doctor_id: selectedDoctor.id,
        access_level: 'view',
        expires_hours: expiryHours ? parseInt(expiryHours) : null,
        purpose: purpose || null,
      });
      setGeneratedToken({ type: 'grant', ...data, doctor_name: selectedDoctor.name });
      setShowGrantForm(false);
      setSelectedDoctor(null);
      setPurpose('');
      fetchGrants();
      toast.success('Access token generated');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to generate token');
    } finally {
      setGenerating(false);
    }
  };

  const revokeGrant = async (grantId: string) => {
    setRevoking(grantId);
    try {
      await api.delete(`/patients/${patientId}/access-grants/${grantId}`);
      setGrants(g => g.filter(x => x.id !== grantId));
      toast.success('Access revoked');
    } catch {
      toast.error('Failed to revoke access');
    } finally {
      setRevoking(null);
    }
  };

  const revokeAll = async () => {
    if (!confirm('Revoke ALL active access grants? This will block all doctors from accessing records.')) return;
    try {
      const { data } = await api.delete(`/patients/${patientId}/access-grants`);
      setGrants([]);
      toast.success(`${data.grants_revoked} grants revoked`);
    } catch {
      toast.error('Failed to revoke all grants');
    }
  };

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(null), 2000);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Identity Card */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-blue-800">
            <Star className="h-5 w-5 text-yellow-500" />
            Your Medical ID
          </CardTitle>
          <CardDescription>Share this code with any doctor to give them access to your records</CardDescription>
        </CardHeader>
        <CardContent>
          {patient?.stellar_public_key ? (
            <div className="flex flex-col md:flex-row gap-6 items-center">
              {/* QR Code */}
              <div className="bg-white p-4 rounded-xl shadow-sm flex-shrink-0">
                <QRCodeSVG value={patient.share_code || patient.stellar_public_key} size={160} level="M" />
              </div>

              {/* Details */}
              <div className="space-y-4 flex-1">
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Share Code</p>
                  <div className="flex items-center gap-2">
                    <span className="text-3xl font-mono font-bold text-blue-700 tracking-widest">
                      {patient.share_code}
                    </span>
                    <button onClick={() => copy(patient.share_code, 'Share code')}>
                      {copied === 'Share code'
                        ? <CheckCircle className="h-4 w-4 text-green-500" />
                        : <Copy className="h-4 w-4 text-blue-400 hover:text-blue-600" />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Tell this code to any doctor — they can look you up instantly
                  </p>
                </div>

                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Stellar Public Key</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono text-gray-600 break-all bg-white/70 px-2 py-1 rounded">
                      {patient.stellar_public_key}
                    </code>
                    <button onClick={() => copy(patient.stellar_public_key, 'Public key')} className="flex-shrink-0">
                      <Copy className="h-3 w-3 text-gray-400 hover:text-gray-600" />
                    </button>
                  </div>
                </div>

                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                  onClick={() => setShowGrantForm(true)}
                >
                  <Share2 className="h-4 w-4" />
                  Generate Access Token for a Doctor
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-center py-6 space-y-4">
              <p className="text-muted-foreground">
                You don't have a Stellar medical ID yet. Generate one to share your records securely.
              </p>
              <Button onClick={assignIdentity} disabled={generating} className="gap-2">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Star className="h-4 w-4" />}
                Generate My Medical ID
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Access Grants */}
      {grants.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Who Has Access</CardTitle>
              <CardDescription>{grants.length} active grant{grants.length !== 1 ? 's' : ''}</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={fetchGrants}>
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button variant="destructive" size="sm" onClick={revokeAll} className="gap-1">
                <ShieldX className="h-4 w-4" />
                Revoke All
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {grants.map((grant: any) => (
                <div key={grant.id} className="flex items-center justify-between p-3 border rounded-lg bg-gray-50">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-500" />
                      <span className="font-medium text-sm">{grant.doctor?.name || 'Doctor'}</span>
                      <Badge variant="outline" className="text-xs">{grant.access_level}</Badge>
                    </div>
                    {grant.purpose && (
                      <p className="text-xs text-muted-foreground italic">{grant.purpose}</p>
                    )}
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {grant.expires_at
                        ? `Expires ${format(new Date(grant.expires_at), 'dd MMM yyyy HH:mm')}`
                        : 'No expiry'}
                      {grant.is_expired && <Badge variant="destructive" className="text-xs ml-1">Expired</Badge>}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50"
                    onClick={() => revokeGrant(grant.id)}
                    disabled={revoking === grant.id}
                  >
                    {revoking === grant.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <Trash2 className="h-4 w-4" />}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Grant Access Form Dialog */}
      <Dialog open={showGrantForm} onOpenChange={setShowGrantForm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-blue-600" />
              Share Records with a Doctor
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-2">
              <Label>Search Doctor</Label>
              <Input
                placeholder="Type doctor name..."
                value={doctorSearch}
                onChange={e => searchDoctors(e.target.value)}
              />
              {doctors.length > 0 && (
                <div className="border rounded-lg divide-y max-h-40 overflow-y-auto">
                  {doctors.map((d: any) => (
                    <button
                      key={d.id}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors ${selectedDoctor?.id === d.id ? 'bg-blue-50 font-medium' : ''}`}
                      onClick={() => { setSelectedDoctor(d); setDoctors([]); setDoctorSearch(d.name); }}
                    >
                      {d.name} <span className="text-muted-foreground">— {d.email}</span>
                    </button>
                  ))}
                </div>
              )}
              {selectedDoctor && (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-2 rounded-lg">
                  <CheckCircle className="h-4 w-4" />
                  Selected: {selectedDoctor.name}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Access expires after (hours)</Label>
              <Input
                type="number"
                placeholder="48"
                value={expiryHours}
                onChange={e => setExpiryHours(e.target.value)}
                min="1"
                max="8760"
              />
              <p className="text-xs text-muted-foreground">Leave blank for no expiry. 48 hours recommended.</p>
            </div>

            <div className="space-y-2">
              <Label>Purpose (optional)</Label>
              <Input
                placeholder="e.g. Second opinion — cardiology"
                value={purpose}
                onChange={e => setPurpose(e.target.value)}
              />
            </div>

            <Button className="w-full" onClick={grantAccess} disabled={generating || !selectedDoctor}>
              {generating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Share2 className="h-4 w-4 mr-2" />}
              Generate Access Token
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Generated Token Dialog */}
      <Dialog open={!!generatedToken} onOpenChange={() => setGeneratedToken(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle className="h-5 w-5" />
              {generatedToken?.type === 'identity' ? 'Medical ID Created' : 'Access Token Generated'}
            </DialogTitle>
          </DialogHeader>

          {generatedToken?.type === 'grant' && (
            <div className="space-y-4 pt-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Send this token to {generatedToken.doctor_name}</p>
                  <div className="flex items-center gap-2">
                    <code className="text-sm font-mono bg-white border rounded px-3 py-2 flex-1 break-all">
                      {generatedToken.access_token}
                    </code>
                    <button onClick={() => copy(generatedToken.access_token, 'Token')}>
                      {copied === 'Token'
                        ? <CheckCircle className="h-5 w-5 text-green-500" />
                        : <Copy className="h-5 w-5 text-blue-500" />}
                    </button>
                  </div>
                </div>

                {generatedToken.expires_at && (
                  <p className="text-xs text-muted-foreground">
                    Expires: {format(new Date(generatedToken.expires_at), 'dd MMM yyyy HH:mm')}
                  </p>
                )}

                {/* QR Code of the token */}
                <div className="flex justify-center">
                  <div className="bg-white p-3 rounded-lg shadow-sm">
                    <QRCodeSVG value={generatedToken.access_token} size={140} level="M" />
                  </div>
                </div>
                <p className="text-xs text-center text-muted-foreground">
                  Doctor can scan this QR or paste the token above
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-800 space-y-1">
                <p className="font-medium">How to share:</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Copy the token or show the QR code</li>
                  <li>Send it to {generatedToken.doctor_name} via WhatsApp or show in person</li>
                  <li>They enter it in their doctor portal to access your records</li>
                  <li>Access expires automatically — you can also revoke it anytime</li>
                </ol>
              </div>

              <Button className="w-full" onClick={() => setGeneratedToken(null)}>Done</Button>
            </div>
          )}

          {generatedToken?.type === 'identity' && (
            <div className="space-y-4 pt-2">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3 text-center">
                <div className="flex justify-center">
                  <QRCodeSVG value={generatedToken.share_code} size={140} level="M" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Your Share Code</p>
                  <p className="text-2xl font-mono font-bold text-blue-700">{generatedToken.share_code}</p>
                </div>
              </div>

              {generatedToken.secret_key && (
                <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
                  <p className="text-sm font-semibold text-red-700">⚠️ Save Your Secret Key — Shown Once Only</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-white border rounded px-2 py-1 flex-1 break-all">
                      {generatedToken.secret_key}
                    </code>
                    <button onClick={() => copy(generatedToken.secret_key, 'Secret key')}>
                      <Copy className="h-4 w-4 text-red-400" />
                    </button>
                  </div>
                </div>
              )}

              <Button className="w-full" onClick={() => setGeneratedToken(null)}>Done</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
