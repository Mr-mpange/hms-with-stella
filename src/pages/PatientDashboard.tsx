import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import api from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { Calendar, File, Activity, Loader2, Search, Share2 } from 'lucide-react';
import { format } from 'date-fns';
import { PatientSharingPortal } from '@/components/PatientSharingPortal';

export default function PatientDashboard() {
  const { user, hasRole } = useAuth();
  const [patientData, setPatientData] = useState<any>(null);
  const [appointments, setAppointments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchData();
  }, [user]);

  const fetchData = async () => {
    if (!user) return;

    try {
      // For now, show a patient lookup interface for staff
      // In a real system, you might want to fetch all patients or implement search
      setLoading(false);
    } catch (error) {


      toast.error(`Failed to load dashboard data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePatientSearch = async () => {
    if (!searchTerm.trim()) return;

    try {
      // Search for patient by name or phone
      const { data } = await api.get(`/patients/search?query=${encodeURIComponent(searchTerm)}`);
      const patients = data.patients || [];

      if (patients && patients.length > 0) {
        const patient = patients[0];
        setPatientData(patient);

        // Fetch patient's appointments
        const { data: appointmentData } = await api.get(`/appointments?patient_id=${patient.id}`);
        setAppointments(appointmentData.appointments || []);
      } else {
        toast.error('Patient not found');
        setPatientData(null);
        setAppointments([]);
      }
    } catch (error: any) {

      toast.error('Error searching for patient');
    }
  };

  // Helper function to create sample data for testing
  const createSampleData = async () => {
    try {
      // Sample data creation not needed with MySQL backend
      toast.info('Sample data feature not available');
    } catch (error) {

      toast.error('Failed to create sample data');
    }
  };

  if (loading) {
    return (
      <DashboardLayout title="Patient Dashboard">
        <div className="flex items-center justify-center h-96">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Patient Dashboard">
      <div className="space-y-8">
        {/* Patient Search */}
        <Card className="shadow-lg">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Patient Lookup</CardTitle>
                <CardDescription>Search for patient records</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={createSampleData}
                className="text-primary border-primary/20 hover:bg-primary/5"
              >
                Create Sample Data
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search by name or phone number"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handlePatientSearch()}
                />
              </div>
              <Button onClick={handlePatientSearch}>
                <Search className="mr-2 h-4 w-4" />
                Search
              </Button>
            </div>
          </CardContent>
        </Card>

        {!patientData ? (
          <Card className="shadow-lg">
            <CardContent className="py-12">
              <p className="text-center text-muted-foreground">
                Search for a patient to view their records
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Patient Info Card */}
            <Card className="shadow-lg border-primary/20">
              <CardHeader>
                <CardTitle>Patient Information</CardTitle>
                <CardDescription>Patient medical profile</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Full Name</p>
                    <p className="text-lg font-semibold">{patientData.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Date of Birth</p>
                    <p className="text-lg font-semibold">
                      {format(new Date(patientData.date_of_birth), 'MMM dd, yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Gender</p>
                    <p className="text-lg font-semibold">{patientData.gender}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Blood Group</p>
                    <p className="text-lg font-semibold">{patientData.blood_group || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Phone</p>
                    <p className="text-lg font-semibold">{patientData.phone}</p>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-muted-foreground">Status</p>
                    <Badge variant={patientData.status === 'Active' ? 'default' : 'secondary'}>
                      {patientData.status}
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Cards */}
            <div className="grid gap-4 md:grid-cols-3">
              <Card className="border-primary/20 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Appointments</CardTitle>
                  <Calendar className="h-4 w-4 text-primary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-primary">{appointments.length}</div>
                </CardContent>
              </Card>

              <Card className="border-secondary/20 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Upcoming</CardTitle>
                  <Activity className="h-4 w-4 text-secondary" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-secondary">
                    {appointments.filter(a => ['Scheduled', 'Confirmed'].includes(a.status)).length}
                  </div>
                </CardContent>
              </Card>

              <Card className="border-accent/20 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Medical Records</CardTitle>
                  <File className="h-4 w-4 text-accent" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-accent">
                    {patientData.medical_history ? 1 : 0}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Appointments */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle>Patient Appointments</CardTitle>
                <CardDescription>View scheduled and past appointments</CardDescription>
              </CardHeader>
              <CardContent>
                {appointments.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">No appointments found</p>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date & Time</TableHead>
                          <TableHead>Doctor</TableHead>
                          <TableHead>Department</TableHead>
                          <TableHead>Reason</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {appointments.map((appointment) => (
                          <TableRow key={appointment.id}>
                            <TableCell>
                              {format(new Date(appointment.appointment_date), 'MMM dd, yyyy')} {appointment.appointment_time}
                            </TableCell>
                            <TableCell className="font-medium">
                              {appointment.doctor?.full_name || 'Unknown'}
                            </TableCell>
                            <TableCell>{appointment.department?.name || 'N/A'}</TableCell>
                            <TableCell className="max-w-xs truncate">{appointment.reason}</TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  appointment.status === 'Confirmed' ? 'default' :
                                  appointment.status === 'Scheduled' ? 'secondary' :
                                  appointment.status === 'Completed' ? 'outline' :
                                  'destructive'
                                }
                              >
                                {appointment.status}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Medical History */}
            {patientData.medical_history && (
              <Card className="shadow-lg">
                <CardHeader>
                  <CardTitle>Medical History</CardTitle>
                  <CardDescription>Patient's recorded medical history</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm">{patientData.medical_history}</p>
                </CardContent>
              </Card>
            )}

            {/* Sharing Portal */}
            <Card className="shadow-lg">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Share2 className="h-5 w-5 text-blue-600" />
                  Share My Records
                </CardTitle>
                <CardDescription>
                  Generate a one-time access token to share your medical records with another doctor
                </CardDescription>
              </CardHeader>
              <CardContent>
                <PatientSharingPortal patientId={patientData.id} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
