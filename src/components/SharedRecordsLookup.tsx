import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, Search, ShieldCheck, ShieldX, FileText, User, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';

interface SharedRecordsLookupProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SharedRecordsLookup({ open, onOpenChange }: SharedRecordsLookupProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<'lookup' | 'token' | 'records'>('lookup');
  const [identifier, setIdentifier] = useState('');
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [foundPatient, setFoundPatient] = useState<any>(null);
  const [sharedData, setSharedData] = useState<any>(null);

  const reset = () => {
    setStep('lookup');
    setIdentifier('');
    setToken('');
    setFoundPatient(null);
    setSharedData(null);
  };

  // Step 1 — look up patient by share code or public key
  const lookup = async () => {
    if (!identifier.trim()) return toast.error('Enter a share code or Stellar public key');
    setLoading(true);
    try {
      const { data } = await api.get(`/patients/lookup/${identifier.trim()}`);
      setFoundPatient(data.patient);
      setStep('token');
    } catch (e: any) {
      toast.error('Patient not found. Check the share code or public key.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — use access token to pull records
  const accessRecords = async () => {
    if (!token.trim()) return toast.error('Enter the access token from the patient');
    setLoading(true);
    try {
      const { data } = await api.post('/shared-records/access', {
        access_token: token.trim(),
        doctor_id: user?.id,
      });
      setSharedData(data);
      setStep('records');
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Invalid or expired token');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-5 w-5 text-blue-600" />
            Access Shared Patient Records
          </DialogTitle>
          <DialogDescription>
            Patient shares their code or token — you access their history securely.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1 — Lookup */}
        {step === 'lookup' && (
          <div className="space-y-4 pt-2">
            <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800 space-y-1">
              <p className="font-medium">How this works:</p>
              <ol className="list-decimal list-inside space-y-1 text-xs">
                <li>Patient gives you their share code (e.g. HMS-A3F9K2) or Stellar public key</li>
                <li>You look them up below</li>
                <li>Patient gives you a one-time access token</li>
                <li>You enter the token to view their records</li>
              </ol>
            </div>

            <div className="space-y-2">
              <Label>Share Code or Stellar Public Key</Label>
              <Input
                placeholder="HMS-A3F9K2  or  GXXXX..."
                value={identifier}
                onChange={e => setIdentifier(e.target.value.toUpperCase())}
                className="font-mono"
                onKeyDown={e => e.key === 'Enter' && lookup()}
              />
            </div>

            <Button className="w-full" onClick={lookup} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Search className="h-4 w-4 mr-2" />}
              Look Up Patient
            </Button>
          </div>
        )}

        {/* Step 2 — Enter token */}
        {step === 'token' && foundPatient && (
          <div className="space-y-4 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('lookup')}>← Back</Button>

            {/* Patient found */}
            <div className="border rounded-lg p-4 bg-green-50 border-green-200 space-y-2">
              <div className="flex items-center gap-2 text-green-700 font-medium">
                <User className="h-4 w-4" />
                Patient Found
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Name:</span> <strong>{foundPatient.full_name}</strong></div>
                <div><span className="text-muted-foreground">Gender:</span> {foundPatient.gender}</div>
                <div><span className="text-muted-foreground">Blood Group:</span> {foundPatient.blood_group || '—'}</div>
                <div><span className="text-muted-foreground">Code:</span> <span className="font-mono text-blue-700">{foundPatient.share_code}</span></div>
              </div>
              {foundPatient.allergies && (
                <div className="text-sm">
                  <span className="text-red-600 font-medium">⚠ Allergies:</span> {foundPatient.allergies}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Access Token</Label>
              <Input
                placeholder="Token from patient (e.g. 4k18CBUssr1...)"
                value={token}
                onChange={e => setToken(e.target.value)}
                className="font-mono text-sm"
                onKeyDown={e => e.key === 'Enter' && accessRecords()}
              />
              <p className="text-xs text-muted-foreground">
                Ask the patient to share their access token — they get it from the app or reception.
              </p>
            </div>

            <Button className="w-full" onClick={accessRecords} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Access Records
            </Button>
          </div>
        )}

        {/* Step 3 — Show records */}
        {step === 'records' && sharedData && (
          <div className="space-y-4 pt-2">
            <Button variant="ghost" size="sm" onClick={reset}>← New Lookup</Button>

            {/* Patient summary */}
            <div className="border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{sharedData.patient.full_name}</h3>
                {sharedData.stellar_verified ? (
                  <Badge className="bg-green-100 text-green-700 border-green-200 gap-1">
                    <ShieldCheck className="h-3 w-3" /> Blockchain Verified
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-orange-600 border-orange-200">
                    <ShieldX className="h-3 w-3" /> Unverified
                  </Badge>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">DOB:</span> {sharedData.patient.date_of_birth ? format(new Date(sharedData.patient.date_of_birth), 'dd MMM yyyy') : '—'}</div>
                <div><span className="text-muted-foreground">Gender:</span> {sharedData.patient.gender}</div>
                <div><span className="text-muted-foreground">Blood Group:</span> <strong>{sharedData.patient.blood_group || '—'}</strong></div>
                <div><span className="text-muted-foreground">Share Code:</span> <span className="font-mono text-blue-700">{sharedData.patient.share_code}</span></div>
              </div>

              {sharedData.patient.allergies && (
                <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
                  <strong>⚠ Allergies:</strong> {sharedData.patient.allergies}
                </div>
              )}

              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />
                Access level: <Badge variant="outline" className="text-xs">{sharedData.access_level}</Badge>
                {sharedData.expires_at && (
                  <span>· Expires {format(new Date(sharedData.expires_at), 'dd MMM yyyy HH:mm')}</span>
                )}
              </div>

              {sharedData.purpose && (
                <p className="text-xs text-muted-foreground italic">Purpose: {sharedData.purpose}</p>
              )}
            </div>

            {/* Records */}
            <div>
              <h4 className="font-medium text-sm mb-2">Medical Records ({sharedData.records?.length || 0})</h4>
              {sharedData.records?.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No records found</p>
              ) : (
                <div className="space-y-2">
                  {sharedData.records?.map((record: any) => (
                    <div key={record.id} className="border rounded-lg p-3 text-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-blue-500" />
                          <span className="font-medium capitalize">{record.record_type} Record</span>
                        </div>
                        <Badge variant={record.status === 'verified' ? 'default' : 'secondary'} className="text-xs">
                          {record.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground space-y-1">
                        <div className="flex items-center gap-1">
                          <span>IPFS:</span>
                          <a
                            href={`https://gateway.pinata.cloud/ipfs/${record.cid_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-blue-600 hover:underline truncate max-w-[200px]"
                          >
                            {record.cid_hash}
                          </a>
                        </div>
                        <div className="flex items-center gap-1">
                          <span>Stellar TX:</span>
                          <a
                            href={`https://stellar.expert/explorer/testnet/tx/${record.stellar_tx_hash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-mono text-purple-600 hover:underline truncate max-w-[200px]"
                          >
                            {record.stellar_tx_hash?.substring(0, 20)}...
                          </a>
                        </div>
                        <div>Created: {format(new Date(record.created_at), 'dd MMM yyyy HH:mm')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
