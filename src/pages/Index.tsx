import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2 } from 'lucide-react';

const Index = () => {
  const { user, primaryRole, roles, loading, rolesLoaded } = useAuth();
  const navigate = useNavigate();
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {

    // Don't redirect if still loading
    if (loading) {

      return;
    }

    // Don't redirect if already attempted or max retries reached
    if (retryCount > 3) {

      // If we've tried multiple times and still no roles, redirect to auth
      if (!user) {

        navigate('/auth');
      } else {
        // Default redirect for authenticated users with no roles
        navigate('/patient-portal');
      }
      return;
    }

    if (!user) {

      navigate('/auth');
      return;
    }

    // Wait for roles to be loaded, but with a retry limit
    if (!rolesLoaded) {

      const timer = setTimeout(() => {

        setRetryCount(prev => prev + 1);
      }, 500);
      return () => clearTimeout(timer);
    }

    // Use primary role if available, otherwise use priority order
    if (primaryRole) {
      const roleRoutes: Record<string, string> = {
        admin: '/admin',
        doctor: '/doctor',
        nurse: '/nurse',
        receptionist: '/receptionist',
        lab_tech: '/lab',
        pharmacist: '/pharmacy',
        billing: '/billing',
        patient: '/patient-portal'
      };
      const targetRoute = roleRoutes[primaryRole] || '/patient-portal';

      navigate(targetRoute);
    } else if (roles && roles.length > 0) {
      // Fallback to priority order if no primary role set

      if (roles.includes('admin')) {

        navigate('/admin');
      } else if (roles.includes('doctor')) {

        navigate('/doctor');
      } else if (roles.includes('nurse')) {

        navigate('/nurse');
      } else if (roles.includes('receptionist')) {

        navigate('/receptionist');
      } else if (roles.includes('lab_tech')) {

        navigate('/lab');
      } else if (roles.includes('pharmacist')) {

        navigate('/pharmacy');
      } else if (roles.includes('billing')) {

        navigate('/billing');
      } else {
        navigate('/patient-portal');
      }
    } else {
      // No roles found, redirect to patient dashboard as default
      navigate('/patient-portal');
    }
  }, [user, primaryRole, roles, loading, rolesLoaded, navigate, retryCount]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-primary/5 via-background to-secondary/5">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
};

export default Index;