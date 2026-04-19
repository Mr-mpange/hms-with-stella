import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Download, Share2, CheckCircle, Star } from 'lucide-react';
import { toast } from 'sonner';

interface PatientStellarCardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: {
    full_name: string;
    share_code: string;
    stellar_public_key: string;
    secret_key?: string; // only shown once at generation
  };
}

export function PatientStellarCard({ open, onOpenChange, patient }: PatientStellarCardProps) {
  const [copied, setCopied] = useState(false);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success(`${label} copied`);
    setTimeout(() => setCopied(false), 2000);
  };

  const printCard = () => window.print();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Star className="h-5 w-5 text-yellow-500" />
            Patient Medical ID — Stellar
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 print:block" id="stellar-card">

          {/* Card */}
          <div className="border-2 border-blue-200 rounded-xl p-5 bg-gradient-to-br from-blue-50 to-indigo-50 text-center space-y-4">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Patient Name</p>
              <p className="text-xl font-bold text-gray-800">{patient.full_name}</p>
            </div>

            {/* QR Code */}
            <div className="flex justify-center">
              <div className="bg-white p-3 rounded-lg shadow-sm">
                <QRCodeSVG
                  value={patient.share_code}
                  size={140}
                  level="M"
                  includeMargin={false}
                />
              </div>
            </div>

            {/* Share Code */}
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Medical Share Code</p>
              <div className="flex items-center justify-center gap-2">
                <span className="text-3xl font-mono font-bold text-blue-700 tracking-widest">
                  {patient.share_code}
                </span>
                <button
                  onClick={() => copy(patient.share_code, 'Share code')}
                  className="text-blue-400 hover:text-blue-600"
                >
                  {copied ? <CheckCircle className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Show this code or QR to any doctor to share your records
              </p>
            </div>

            {/* Stellar public key */}
            <div className="bg-white/70 rounded-lg p-3 text-left">
              <p className="text-xs text-muted-foreground mb-1">Stellar Public Key (Medical ID)</p>
              <p className="text-xs font-mono text-gray-600 break-all">{patient.stellar_public_key}</p>
            </div>
          </div>

          {/* Secret key warning — shown only once */}
          {patient.secret_key && (
            <div className="border border-red-200 bg-red-50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2 text-red-700 font-semibold text-sm">
                <span>⚠️</span> Secret Key — Save This Now
              </div>
              <p className="text-xs text-red-600">
                This is shown only once. Store it safely — it cannot be recovered.
              </p>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono bg-white border rounded px-2 py-1 flex-1 break-all">
                  {patient.secret_key}
                </code>
                <button onClick={() => copy(patient.secret_key!, 'Secret key')}>
                  <Copy className="h-4 w-4 text-red-400 hover:text-red-600" />
                </button>
              </div>
            </div>
          )}

          {/* How to use */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm space-y-2">
            <p className="font-medium text-gray-700">How to share your records:</p>
            <ol className="text-muted-foreground space-y-1 text-xs list-decimal list-inside">
              <li>Tell the doctor your code: <strong>{patient.share_code}</strong></li>
              <li>Or show them the QR code above</li>
              <li>The doctor will request access — you approve it</li>
              <li>Access expires automatically after 48 hours</li>
              <li>You can revoke access anytime</li>
            </ol>
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={printCard}>
              <Download className="h-4 w-4 mr-2" /> Print Card
            </Button>
            <Button className="flex-1" onClick={() => onOpenChange(false)}>
              Done
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
