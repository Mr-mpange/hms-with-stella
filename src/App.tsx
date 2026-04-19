import { Suspense, lazy, useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import { updateFavicon, updatePageTitle } from "@/lib/favicon";

// Eager load critical routes (login/landing)
import Index from "./pages/Index";
import Auth from "./pages/Auth";

// Lazy load dashboard routes for better initial load
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const DoctorDashboard = lazy(() => import("./pages/DoctorDashboard"));
const PatientDashboard = lazy(() => import("./pages/PatientDashboard"));
const PatientLogin = lazy(() => import("./pages/PatientLogin"));
const PatientPortal = lazy(() => import("./pages/PatientPortal"));
const LabDashboard = lazy(() => import("./pages/LabDashboard"));
const PharmacyDashboard = lazy(() => import("./pages/PharmacyDashboard"));
const BillingDashboard = lazy(() => import("./pages/BillingDashboard"));
const NurseDashboard = lazy(() => import("./pages/NurseDashboard"));
const ReceptionistDashboard = lazy(() => import("./pages/ReceptionistDashboard"));
const DischargeDashboard = lazy(() => import("./pages/DischargeDashboard"));
const MedicalServicesDashboard = lazy(() => import("./pages/MedicalServicesDashboard"));
const ActivityLogs = lazy(() => import("./pages/ActivityLogs"));
const SettingsPage = lazy(() => import("./pages/SettingsPage"));
const PaymentSuccess = lazy(() => import("./pages/PaymentSuccess"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Optimized query client configuration
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30000, // 30 seconds
      gcTime: 60000, // 1 minute (formerly cacheTime)
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

// Loading fallback component
const LoadingFallback = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="animate-pulse text-lg text-gray-600">Loading...</div>
  </div>
);

const App = () => {
  // Don't load settings on app mount - wait until after login
  // This prevents repeated API calls on the auth page

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
          <AuthProvider>
            <Suspense fallback={<LoadingFallback />}>
              <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/admin"
              element={
                <ProtectedRoute requiredRole="admin">
                  <AdminDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/doctor"
              element={
                <ProtectedRoute requiredRole="doctor">
                  <DoctorDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/patient"
              element={
                <ProtectedRoute>
                  <PatientDashboard />
                </ProtectedRoute>
              }
            />
            <Route path="/patient-login" element={<PatientLogin />} />
            <Route
              path="/patient-portal"
              element={
                <ProtectedRoute>
                  <PatientPortal />
                </ProtectedRoute>
              }
            />
            <Route
              path="/lab"
              element={
                <ProtectedRoute requiredRole="lab_tech">
                  <LabDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pharmacy"
              element={
                <ProtectedRoute requiredRole="pharmacist">
                  <PharmacyDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing"
              element={
                <ProtectedRoute requiredRole="billing">
                  <BillingDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/nurse"
              element={
                <ProtectedRoute requiredRole="nurse">
                  <NurseDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/receptionist"
              element={
                <ProtectedRoute requiredRole="receptionist">
                  <ReceptionistDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/discharge"
              element={
                <ProtectedRoute requiredRole="receptionist">
                  <DischargeDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/services"
              element={
                <ProtectedRoute>
                  <MedicalServicesDashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/logs"
              element={
                <ProtectedRoute requiredRole="admin">
                  <ActivityLogs />
                </ProtectedRoute>
              }
            />
            <Route
              path="/settings"
              element={
                <ProtectedRoute requiredRole="admin">
                  <SettingsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/billing/payment-success"
              element={<PaymentSuccess />}
            />
            {/* Catch-all route for unmatched paths */}
            <Route path="*" element={<NotFound />} />
          </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
