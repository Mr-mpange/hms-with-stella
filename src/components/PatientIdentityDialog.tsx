import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Loader2, Fingerprint, Link } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api';
import { PatientStellarCard } from './PatientStellarCard';

interface PatientIdentityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: { id: string; full_name: string; stellar_public_key?: string; share_code?: string };
  onIdentityAssigned?: () => void;
}

export function PatientIdentityDialog({ open, onOpenChange, patient, onIdentityAssigned }: PatientIdentityDialogProps) {
  const [mode, setMode] = useState<'choose' | 'link'>('choose');
  const [externalKey, setExternalKey] = useState('');
  const [loading, setLoading] = useState(false);
  const [stellarCard, setStellarCard] = useState<any>(null);

  // Patient already has identity
  if (patient.stellar_public_key && patient.share_code) {
    return (
      <>
        <Dialog open={open} onOpenChange={onOpenChange}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5 text-blue-600" />
                Stellar Identity — {patient.full_name}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                <div>
                  <p className="text-xs text-muted-foreground">Share Code</p>
                  <p className="text-2xl font-mono font-bold text-blue-700">{patient.share_code}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Stellar Public Key</p>
                  <p className="text-xs font-mono text-gray-600 break-all">{patient.stellar_public_key}</p>
                </div>
              </div>
              <Button className="w-full" onClick={() => {
                setStellarCard({ ...patient, secret_key: undefined });
              }}>
                Show QR Card
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        {stellarCard && (
          <PatientStellarCard
            open={!!stellarCard}
            onOpenChange={() => setStellarCard(null)}
            patient={stellarCard}
          />
        )}
      </>
    );
  }

  const generate = async () => {
    setLoading(true);
    try {
      const { data } = await api.post(`/patients/${patient.id}/identity`, { generate_wallet: true });
      setStellarCard({
        full_name: patient.full_name,
        share_code: data.share_code,
        stellar_public_key: data.public_key,
        secret_key: data.secret_key,
      });
      onIdentityAssigned?.();
      onOpenChange(false);
      toast.success('Stellar identity created for ' + patient.full_name);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to generate identity');
    } finally {
      setLoading(false);
    }
  };

  const link = async () => {
    if (!externalKey.trim()) return toast.error('Enter a Stellar public key');
    setLoading(true);
    try {
      const { data } = await api.post(`/patients/${patient.id}/identity`, { public_key: externalKey.trim() });
      setStellarCard({
        full_name: patient.full_name,
        share_code: data.share_code,
        stellar_public_key: data.public_key,
      });
      onIdentityAssigned?.();
      onOpenChange(false);
      toast.success('Wallet linked for ' + patient.full_name);
    } catch (e: any) {
      toast.error(e.response?.data?.error || 'Failed to link wallet');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fingerprint className="h-5 w-5 text-blue-600" />
              Assign Stellar Identity
            </DialogTitle>
            <DialogDescription>
              Give <strong>{patient.full_name}</strong> a universal medical ID on the Stellar blockchain.
            </DialogDescription>
          </DialogHeader>

          {mode === 'choose' && (
            <div className="space-y-3 pt-2">
              <p className="text-sm text-muted-foreground">
                The patient will get a <strong>share code</strong> (e.g. HMS-A3F9K2) and a QR code
                they can show to any doctor to share their medical history.
              </p>

              <Button className="w-full h-14 flex-col gap-1" onClick={generate} disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
                <span className="font-semibold">Generate New Wallet</span>
                <span className="text-xs font-normal opacity-70">System creates a Stellar keypair for the patient</span>
              </Button>

              <Button variant="outline" className="w-full h-14 flex-col gap-1" onClick={() => setMode('link')}>
                <Link className="h-5 w-5" />
                <span className="font-semibold">Link Existing Wallet</span>
                <span className="text-xs font-normal opacity-70">Patient already has a Stellar wallet (Freighter, Lobstr, etc.)</span>
              </Button>
            </div>
          )}

          {mode === 'link' && (
            <div className="space-y-4 pt-2">
              <Button variant="ghost" size="sm" onClick={() => setMode('choose')}>← Back</Button>
              <div className="space-y-2">
                <Label>Patient's Stellar Public Key</Label>
                <Input
                  placeholder="GXXXX..."
                  value={externalKey}
                  onChange={e => setExternalKey(e.target.value)}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground">
                  Starts with G — found in Freighter, Lobstr, or Stellar Laboratory
                </p>
              </div>
              <Button className="w-full" onClick={link} disabled={loading}>
                {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Link Wallet
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {stellarCard && (
        <PatientStellarCard
          open={!!stellarCard}
          onOpenChange={() => setStellarCard(null)}
          patient={stellarCard}
        />
      )}
    </>
  );
}
