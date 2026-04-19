import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardHeader, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Phone, Lock, ArrowLeft } from 'lucide-react';

export default function PatientLogin() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await signIn(phone, password);
      if (error) {
        toast.error(error.message || 'Login failed. Check your phone number and password.');
      } else {
        toast.success('Welcome!');
        navigate('/patient');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm shadow-xl">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <img src="/favicon.svg" alt="HMS" className="h-20 w-20 object-contain" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800">Patient Portal</h1>
            <CardDescription>
              Login with your phone number and password
            </CardDescription>
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={login} className="space-y-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Phone className="h-4 w-4" /> Phone Number
              </Label>
              <Input
                type="tel"
                placeholder="0712 345 678"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                required
                disabled={loading}
                className="text-lg"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Lock className="h-4 w-4" /> Password
              </Label>
              <Input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Login
            </Button>
          </form>

          <div className="mt-4 space-y-3">
            <div className="text-center text-xs text-muted-foreground">
              Don't have an account? Visit the hospital reception to register.
              <br />
              They will create your account and give you your Medical ID.
            </div>

            <Link
              to="/auth"
              className="flex items-center justify-center gap-1 text-sm text-gray-500 hover:text-gray-700"
            >
              <ArrowLeft className="h-3 w-3" /> Staff login
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
