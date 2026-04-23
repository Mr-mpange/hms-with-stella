import { useState, useEffect, Fragment, useMemo, useCallback, memo } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { mobilePaymentService, MobilePaymentRequest } from '@/lib/mobilePaymentService';
import { toast } from 'sonner';
import api from '@/lib/api';
import { format } from 'date-fns';
import { generateInvoiceNumber, logActivity } from '@/lib/utils';
import {
  Loader2,
  CheckCircle,
  XCircle,
  Smartphone,
  Plus,
  Send,
  AlertCircle,
  CreditCard,
  Shield,
  DollarSign,
  File,
  Printer,
  Download
} from 'lucide-react';

// Helper component for invoice details
const InvoiceDetailsSection = ({ selectedInvoice }: { selectedInvoice: any }) => {
  // Unwrap invoice if it's wrapped in an object
  const actualInvoice = selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.invoice 
    ? selectedInvoice.invoice 
    : selectedInvoice;
  
  return (
    <div className="border rounded-lg p-4 mb-4 bg-gray-50">
      <h4 className="font-semibold mb-3">Invoice Details</h4>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span>Patient:</span>
          <span className="font-medium">{actualInvoice.patient?.full_name}</span>
        </div>
        <div className="flex justify-between">
          <span>Invoice Date:</span>
          <span>{format(new Date(actualInvoice.invoice_date), 'MMM dd, yyyy')}</span>
        </div>
        <div className="flex justify-between">
          <span>Due Date:</span>
          <span>{format(new Date(actualInvoice.due_date), 'MMM dd, yyyy')}</span>
        </div>

        {/* Invoice Items */}
        {actualInvoice.items && actualInvoice.items.length > 0 && (
          <div className="mt-4 border-t pt-2">
            <h5 className="font-medium mb-2">Invoice Items:</h5>
            <div className="space-y-1">
              {actualInvoice.items.map((item: any, index: number) => (
                <div key={item.id || index} className="flex justify-between text-sm bg-gray-100 p-2 rounded">
                  <span className="flex-1">{item.description}</span>
                  <span className="text-right">
                    {item.quantity} × TSh{Number(item.unit_price as number).toFixed(2)} = <span className="font-semibold">TSh{Number(item.total_price as number).toFixed(2)}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t pt-2 mt-2">
          <div className="flex justify-between font-semibold text-base">
            <span>Total:</span>
            <span>TSh{Number(actualInvoice.total_amount as number).toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paid:</span>
            <span>TSh{Number(actualInvoice.paid_amount as number || 0).toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-green-600">
            <span>Remaining:</span>
            <span>TSh{(Number(actualInvoice.total_amount as number) - Number(actualInvoice.paid_amount as number || 0)).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper component for payment amount input
const PaymentAmountInput = ({ selectedInvoice }: { selectedInvoice: any }) => {
  // Unwrap invoice for payment calculations
  const actualInvoice = selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.invoice 
    ? selectedInvoice.invoice 
    : selectedInvoice;
  
  const remainingBalance = actualInvoice ? Number(actualInvoice.total_amount as number) - Number(actualInvoice.paid_amount as number || 0) : 0;
  
  return (
    <>
      <Input
        id="amount"
        name="amount"
        type="number"
        step="0.01"
        min="0.01"
        max={actualInvoice ? remainingBalance : undefined}
        defaultValue={actualInvoice ? remainingBalance.toFixed(2) : ''}
        className={`bg-white ${actualInvoice ? 'border-green-300 focus:border-green-500' : 'border-red-300'}`}
        required
      />
      <p className="text-sm text-muted-foreground">
        💰 Enter payment amount (max: TSh{actualInvoice ? remainingBalance.toFixed(2) : '0.00'})
      </p>
      {actualInvoice && (
        <div className="p-3 bg-green-50 rounded-lg border border-green-200">
          <div className="flex justify-between text-sm">
            <span className="text-green-700">Remaining Balance:</span>
            <span className="font-semibold text-green-800">
              TSh{remainingBalance.toFixed(2)}
            </span>
          </div>
        </div>
      )}
    </>
  );
};

export default function BillingDashboard() {
  const [invoices, setInvoices] = useState<any[]>([]);
  const [patients, setPatients] = useState<any[]>([]);
  const [insuranceCompanies, setInsuranceCompanies] = useState<any[]>([]);
  const [insuranceClaims, setInsuranceClaims] = useState<any[]>([]);
  const [stats, setStats] = useState({ unpaid: 0, partiallyPaid: 0, totalRevenue: 0, pendingClaims: 0, todayRevenue: 0 });
  const [loading, setLoading] = useState(true); // Initial load only
  const [refreshing, setRefreshing] = useState(false); // Background refresh
  const [dialogOpen, setDialogOpen] = useState(false);
  const [paymentDialogOpen, setPaymentDialogOpen] = useState(false);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [invoiceDetailsDialogOpen, setInvoiceDetailsDialogOpen] = useState(false);
  const [selectedInvoice, setSelectedInvoice] = useState<any>(null);
  const [selectedInvoiceDetails, setSelectedInvoiceDetails] = useState<any>(null);
  const [invoicePayments, setInvoicePayments] = useState<any[]>([]);
  const [patientReportDialogOpen, setPatientReportDialogOpen] = useState(false);
  const [selectedPatientForReport, setSelectedPatientForReport] = useState<any>(null);
  const [reportPreviewData, setReportPreviewData] = useState<any>(null);
  const [reportPreviewLoading, setReportPreviewLoading] = useState(false);
  const [invoiceSelectionDialogOpen, setInvoiceSelectionDialogOpen] = useState(false);
  const [selectedPatientForInvoiceSelection, setSelectedPatientForInvoiceSelection] = useState<any>(null);
  const [payAllDialogOpen, setPayAllDialogOpen] = useState(false);
  const [selectedPatientForPayAll, setSelectedPatientForPayAll] = useState<any>(null);
  const [payAllPaymentMethod, setPayAllPaymentMethod] = useState<string>('');
  const [payAllProcessing, setPayAllProcessing] = useState<boolean>(false);
  const [reportDateFrom, setReportDateFrom] = useState<string>('');
  const [reportDateTo, setReportDateTo] = useState<string>('');
  const [patientReportDateFrom, setPatientReportDateFrom] = useState<string>('');
  const [patientReportDateTo, setPatientReportDateTo] = useState<string>('');
  const [hospitalSettings, setHospitalSettings] = useState({
    hospital_name: 'Hospital Management System',
    hospital_address: '',
    hospital_phone: '',
    hospital_email: '',
    hospital_website: '',
    hospital_license: '',
    hospital_tagline: '',
  });
  const [logoUrl, setLogoUrl] = useState('/placeholder.svg');
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string>('');
  const [claimInvoiceId, setClaimInvoiceId] = useState<string>('');
  const [claimInsuranceId, setClaimInsuranceId] = useState<string>('');
  const [claimAmount, setClaimAmount] = useState<string>('');
  const [paymentStatus, setPaymentStatus] = useState<string>('');
  const [transactionId, setTransactionId] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<string>('');
  const [mobilePaymentProcessing, setMobilePaymentProcessing] = useState<boolean>(false);
  const [rawInvoicesData, setRawInvoicesData] = useState<any[]>([]);
  const [rawPatientsData, setRawPatientsData] = useState<any[]>([]);
  const [rawInsuranceData, setRawInsuranceData] = useState<any[]>([]);
  const [rawClaimsData, setRawClaimsData] = useState<any[]>([]);
  const [rawPaymentsData, setRawPaymentsData] = useState<any[]>([]);
  const [patientServices, setPatientServices] = useState<any[]>([]);
  const [patientCosts, setPatientCosts] = useState<Record<string, number>>({});
  const [billingVisits, setBillingVisits] = useState<any[]>([]);

  useEffect(() => {
    fetchData(true); // Initial load with loading screen

    // Set up polling instead of real-time subscriptions (every 30 seconds)
    const intervalId = setInterval(() => {
      fetchData(false); // Background refresh without loading screen
    }, 30000);

    // Cleanup interval on unmount
    return () => {
      clearInterval(intervalId);
    };
  }, []);

  // Memoize expensive computations at component level
  const groupedPatients = useMemo(() => {
    if (!rawInvoicesData.length) return {};

    return rawInvoicesData.reduce((acc, invoice) => {
      const patientId = invoice.patient_id;
      if (!acc[patientId]) {
        acc[patientId] = {
          patient: invoice.patient,
          invoices: [],
          totalAmount: 0,
          totalPaid: 0,
          unpaidAmount: 0,
          invoiceCount: 0,
          latestInvoiceDate: invoice.invoice_date,
          status: 'Unpaid'
        };
      }
      acc[patientId].invoices.push(invoice);
      acc[patientId].totalAmount += Number(invoice.total_amount);
      acc[patientId].totalPaid += Number(invoice.paid_amount || 0);
      acc[patientId].invoiceCount += 1;

      if (new Date(invoice.invoice_date) > new Date(acc[patientId].latestInvoiceDate)) {
        acc[patientId].latestInvoiceDate = invoice.invoice_date;
      }

      return acc;
    }, {} as Record<string, any>);
  }, [rawInvoicesData]);

  const processedPatients = useMemo(() => {
    if (!Object.keys(groupedPatients).length) return [];

    const patientsArray = Object.values(groupedPatients);
    patientsArray.forEach((patient: any) => {
      patient.unpaidAmount = patient.totalAmount - patient.totalPaid;

      if (patient.totalPaid === 0) {
        patient.status = 'Unpaid';
      } else if (patient.totalPaid >= patient.totalAmount) {
        patient.status = 'Paid';
      } else {
        patient.status = 'Partially Paid';
      }
    });

    return patientsArray;
  }, [groupedPatients]);

  const calculatedStats = useMemo(() => {
    if (!processedPatients.length) {
      return { unpaid: 0, partiallyPaid: 0, totalRevenue: 0, pendingClaims: 0, todayRevenue: 0 };
    }

    const unpaid = processedPatients.filter((p: any) => p.status === 'Unpaid').length;
    const partiallyPaid = processedPatients.filter((p: any) => p.status === 'Partially Paid').length;

    // Calculate today's revenue from rawPaymentsData
    const today = new Date().toISOString().split('T')[0];
    let totalRevenue = 0;
    let todayPaymentsDebug: any[] = [];
    
    if (rawPaymentsData && rawPaymentsData.length > 0) {
      rawPaymentsData.forEach((payment: any) => {
        // Handle both Date objects and string dates
        let paymentDate = '';
        if (payment.created_at) {
          if (payment.created_at instanceof Date) {
            paymentDate = payment.created_at.toISOString().split('T')[0];
          } else if (typeof payment.created_at === 'string') {
            paymentDate = payment.created_at.split('T')[0];
          } else {
            // Handle timestamp objects from MySQL
            paymentDate = new Date(payment.created_at).toISOString().split('T')[0];
          }
        }
        
        // Payments table doesn't have status column - all payments are completed when recorded
        if (paymentDate === today) {
          totalRevenue += Number(payment.amount || 0);
          todayPaymentsDebug.push({
            amount: payment.amount,
            date: paymentDate,
            method: payment.payment_method
          });
        }
      });
    }

    const pendingClaims: number = rawClaimsData?.filter(c => c.status === 'Pending').length || 0;

    const todayPaymentsCount = rawPaymentsData?.filter((p: any) => {
      if (!p.created_at) return false;
      const pDate = p.created_at instanceof Date 
        ? p.created_at.toISOString().split('T')[0]
        : new Date(p.created_at).toISOString().split('T')[0];
      return pDate === today;
    }).length || 0;

    return { unpaid, partiallyPaid, totalRevenue, pendingClaims, todayRevenue: totalRevenue };
  }, [processedPatients, rawClaimsData, rawPaymentsData]);

  // Update state when memoized values change
  useEffect(() => {
    setInvoices(processedPatients);
    setStats(calculatedStats);
  }, [processedPatients, calculatedStats]);

  const fetchData = async (isInitialLoad = false) => {
    try {
      // Only show full loading screen on initial load
      if (isInitialLoad) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      // Fetch all data from MySQL API endpoints (only existing endpoints)
      // Get today's date for filtering payments
      const today = new Date().toISOString().split('T')[0];
      
      const [
        billingVisitsRes,
        pharmacyVisitsRes,
        invoicesRes,
        patientsRes,
        insuranceRes,
        claimsRes,
        paymentsRes,
        servicesRes
      ] = await Promise.all([
        api.get('/visits?current_stage=billing&overall_status=Active&limit=200').catch(() => ({ data: { visits: [] } })),
        api.get('/visits?pharmacy_status=Completed&overall_status=Active&limit=200').catch(() => ({ data: { visits: [] } })), // Also get pharmacy completed visits
        api.get('/billing/invoices').catch(() => ({ data: { invoices: [] } })),
        api.get('/patients?status=Active').catch(() => ({ data: { patients: [] } })),
        api.get('/insurance/companies').catch(() => ({ data: { companies: [] } })),
        api.get('/insurance/claims').catch(() => ({ data: { claims: [] } })),
        api.get(`/payments?date=${today}`).catch(() => ({ data: { payments: [] } })), // Filter by today's date
        api.get('/patient-services').catch(() => ({ data: { services: [] } })) // Fetch all patient services
      ]);

      const billingVisitsData = billingVisitsRes.data.visits || [];
      const pharmacyVisitsData = pharmacyVisitsRes.data.visits || [];
      
      // Combine billing visits and pharmacy visits, removing duplicates
      const allVisitsMap = new Map();
      [...billingVisitsData, ...pharmacyVisitsData].forEach(visit => {
        allVisitsMap.set(visit.id, visit);
      });
      const combinedVisitsData = Array.from(allVisitsMap.values());
      
      const invoicesData = invoicesRes.data.invoices || [];
      const patientsData = patientsRes.data.patients || [];
      const insuranceData = insuranceRes.data.companies || [];
      const claimsData = claimsRes.data.claims || [];
      const paymentsData = paymentsRes.data.payments || [];
      const servicesData = servicesRes.data.services || [];

      // Filter visits to only include those with patient services (medications, lab tests, etc.)
      const visitsWithServices = combinedVisitsData.filter(visit => {
        const hasServices = servicesData.some((service: any) => service.patient_id === visit.patient_id);
        return hasServices;
      });






      // Update raw data state to trigger memoized computations
      setBillingVisits(visitsWithServices);
      setRawInvoicesData(invoicesData);
      setRawPatientsData(patientsData);
      setRawInsuranceData(insuranceData);
      setRawClaimsData(claimsData);
      setRawPaymentsData(paymentsData);
      setPatientServices(servicesData);

      // Calculate patient costs from services (medications + lab tests only)
      // Consultation fee is paid at registration and NOT included here
      const costs: Record<string, number> = {};
      
      // Group services by patient and calculate total cost
      if (servicesData && servicesData.length > 0) {
        servicesData.forEach((service: any) => {
          const patientId = service.patient_id;
          
          // Only include unpaid services (medications and lab tests)
          // Skip consultation fees as they're paid at registration
          const serviceType = service.service?.service_type || '';
          const isConsultation = serviceType.toLowerCase().includes('consultation');
          
          if (!isConsultation) {
            // Use total_price if available (for medications), otherwise calculate from unit_price or base_price
            const totalPrice = Number(service.total_price || 
              (service.unit_price || service.service?.base_price || service.price || 0) * (service.quantity || 1));
            
            if (!costs[patientId]) {
              costs[patientId] = 0;
            }
            costs[patientId] += totalPrice;
          }
        });
      }
      
      setPatientCosts(costs);

      // Update other state with safety checks
      setPatients(patientsData);
      setInsuranceCompanies(insuranceData);
      setInsuranceClaims(claimsData);

      // Fetch hospital settings
      try {
        const settingsRes = await api.get('/settings');
        const settings = settingsRes.data.settings || [];
        
        const settingsObj: any = {};
        settings.forEach((setting: any) => {
          settingsObj[setting.key] = setting.value;
        });

        setHospitalSettings({
          hospital_name: settingsObj.hospital_name || 'Hospital Management System',
          hospital_address: settingsObj.hospital_address || '',
          hospital_phone: settingsObj.hospital_phone || '',
          hospital_email: settingsObj.hospital_email || '',
          hospital_website: settingsObj.hospital_website || '',
          hospital_license: settingsObj.hospital_license || '',
          hospital_tagline: settingsObj.hospital_tagline || '',
        });

        // Fetch logo
        const logoRes = await api.get('/settings/logo');
        if (logoRes.data.logo_url) {
          setLogoUrl(logoRes.data.logo_url);
        }
      } catch (error) {

      }

    } catch (error) {

      toast.error('Failed to load billing data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchInvoicePayments = async (invoiceId: string) => {
    try {
      const response = await api.get(`/payments?invoice_id=${invoiceId}`);
      const payments = response.data.payments || [];
      setInvoicePayments(payments);
    } catch (error) {

      setInvoicePayments([]);
    }
  };

  // Helper function for better printing with hospital branding
  const handlePrint = (content: string, title: string) => {
    // Create a blob with the HTML content
    const blob = new Blob([content], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    
    // Open in new tab with proper URL (not about:blank)
    const printWindow = window.open(url, '_blank');
    
    if (printWindow) {
      printWindow.onload = () => {
        setTimeout(() => {
          printWindow.print();
        }, 500);
      };
    } else {
      toast.error('Please allow popups to print reports');
    }
  };

  // Hospital information template
  const getHospitalHeader = () => {
    const { hospital_name, hospital_address, hospital_phone, hospital_email, hospital_website, hospital_license, hospital_tagline } = hospitalSettings;
    const contactParts = [
      hospital_phone && `📞 ${hospital_phone}`,
      hospital_email && `📧 ${hospital_email}`,
    ].filter(Boolean).join(' &nbsp;|&nbsp; ');
    const infoParts = [
      hospital_website && `🌐 ${hospital_website}`,
      hospital_license && `License: ${hospital_license}`,
    ].filter(Boolean).join(' &nbsp;|&nbsp; ');

    return `
    <div class="hospital-header">
      <div class="hospital-logo">
        ${logoUrl && logoUrl !== '/placeholder.svg'
          ? `<img src="${logoUrl}" alt="Logo" style="width:80px;height:80px;object-fit:contain;" />`
          : ''}
      </div>
      <div class="hospital-info">
        <h1>${hospital_name}</h1>
        ${hospital_tagline ? `<h2>${hospital_tagline}</h2>` : ''}
        <div class="contact-info">
          ${hospital_address ? `<p>📍 ${hospital_address}</p>` : ''}
          ${contactParts ? `<p>${contactParts}</p>` : ''}
          ${infoParts ? `<p>${infoParts}</p>` : ''}
        </div>
      </div>
      <div class="report-info">
        <div class="report-id">Report ID: RPT-${Date.now()}</div>
        <div class="generated-date">Generated: ${new Date().toLocaleDateString('en-US', {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
          hour: '2-digit', minute: '2-digit'
        })}</div>
      </div>
    </div>`;
  };

  // Helper function to generate service description from invoice items
  const getInvoiceServiceDescription = (invoice: any) => {
    // Add null/undefined check for invoice
    if (!invoice) {
      return 'Medical Services';
    }
    
    if (!invoice.items || invoice.items.length === 0) {
      return 'Medical Services';
    }
    
    const services = invoice.items.map((item: any) => item.description || item.service_name || 'Service');
    
    if (services.length === 1) {
      return services[0];
    } else if (services.length === 2) {
      return services.join(' & ');
    } else if (services.length <= 4) {
      return services.slice(0, -1).join(', ') + ' & ' + services[services.length - 1];
    } else {
      return services.slice(0, 3).join(', ') + ` & ${services.length - 3} more services`;
    }
  };

  // Common styles for all reports
  const getReportStyles = () => `
    <style>
      @media print {
        body { margin: 0; }
        .no-print { display: none; }
      }
      
      body { 
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
        margin: 0; 
        padding: 20px; 
        line-height: 1.6; 
        color: #333;
        background: white;
      }
      
      .hospital-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 0;
        border-bottom: 3px solid #2563eb;
        margin-bottom: 30px;
        background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
        padding: 20px;
        border-radius: 8px;
      }
      
      .hospital-logo {
        flex-shrink: 0;
      }
      
      .logo-placeholder {
        width: 80px;
        height: 80px;
        background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
        border-radius: 50%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 6px rgba(0,0,0,0.2);
        border: 3px solid white;
        position: relative;
      }
      
      .logo-text {
        color: white;
        font-weight: bold;
        font-size: 14px;
        letter-spacing: 1px;
      }
      
      .logo-cross {
        color: white;
        font-size: 24px;
        font-weight: bold;
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        opacity: 0.3;
      }
      
      .hospital-info {
        flex-grow: 1;
        text-align: center;
        margin: 0 20px;
      }
      
      .hospital-info h1 {
        margin: 0;
        font-size: 24px;
        font-weight: bold;
        color: #1e40af;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .hospital-info h2 {
        margin: 5px 0 15px 0;
        font-size: 16px;
        color: #64748b;
        font-weight: normal;
      }
      
      .contact-info {
        font-size: 12px;
        color: #475569;
        line-height: 1.4;
      }
      
      .contact-info p {
        margin: 2px 0;
      }
      
      .report-info {
        flex-shrink: 0;
        text-align: right;
        font-size: 12px;
        color: #64748b;
      }
      
      .report-id {
        font-weight: bold;
        color: #1e40af;
        margin-bottom: 5px;
      }
      
      .page-title {
        text-align: center;
        margin: 30px 0;
        padding: 20px;
        background: linear-gradient(135deg, #dbeafe 0%, #bfdbfe 100%);
        border-radius: 8px;
        border-left: 5px solid #2563eb;
      }
      
      .page-title h1 {
        margin: 0;
        font-size: 28px;
        color: #1e40af;
        text-transform: uppercase;
        letter-spacing: 1px;
      }
      
      .page-title h2 {
        margin: 10px 0 0 0;
        font-size: 20px;
        color: #3730a3;
        font-weight: normal;
      }
      
      .page-title p {
        margin: 10px 0 0 0;
        color: #64748b;
        font-style: italic;
      }
      
      .patient-info {
        background: #f8fafc;
        padding: 20px;
        border-radius: 8px;
        margin: 25px 0;
        border-left: 4px solid #2563eb;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .patient-info h3 {
        margin: 0 0 15px 0;
        color: #1e40af;
        font-size: 18px;
        border-bottom: 1px solid #e2e8f0;
        padding-bottom: 8px;
      }
      
      .patient-details {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 15px;
      }
      
      .patient-details p {
        margin: 0;
        padding: 8px 0;
        border-bottom: 1px dotted #cbd5e1;
      }
      
      .section {
        margin: 30px 0;
        page-break-inside: avoid;
      }
      
      .section-title {
        font-size: 20px;
        font-weight: bold;
        color: #1e40af;
        margin: 30px 0 15px 0;
        padding: 10px 0;
        border-bottom: 2px solid #e2e8f0;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      
      .summary-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 25px 0;
      }
      
      .summary-card {
        background: white;
        border: 1px solid #e2e8f0;
        padding: 20px;
        border-radius: 8px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      }
      
      .summary-number {
        font-size: 24px;
        font-weight: bold;
        color: #1e40af;
        margin-bottom: 5px;
      }
      
      .summary-label {
        font-size: 14px;
        color: #64748b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
        background: white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        border-radius: 8px;
        overflow: hidden;
      }
      
      th, td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid #e2e8f0;
      }
      
      th {
        background: linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%);
        font-weight: bold;
        color: #374151;
        text-transform: uppercase;
        font-size: 12px;
        letter-spacing: 0.5px;
      }
      
      tr:hover {
        background-color: #f8fafc;
      }
      
      .status-active { color: #059669; font-weight: bold; }
      .status-completed { color: #0891b2; font-weight: bold; }
      .status-pending { color: #d97706; font-weight: bold; }
      .status-processing { color: #7c3aed; font-weight: bold; }
      .status-progress { color: #0284c7; font-weight: bold; }
      .amount { font-weight: bold; color: #1e40af; }
      
      .footer {
        margin-top: 50px;
        padding: 20px 0;
        border-top: 2px solid #e2e8f0;
        text-align: center;
        font-size: 12px;
        color: #64748b;
        background: #f8fafc;
        border-radius: 8px;
        page-break-inside: avoid;
      }
      
      .footer-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 10px;
      }
      
      .confidential {
        background: #fef2f2;
        border: 1px solid #fecaca;
        padding: 15px;
        border-radius: 8px;
        margin: 20px 0;
        text-align: center;
        color: #991b1b;
        font-weight: bold;
      }
      
      @page {
        margin: 1in;
        size: A4;
      }
    </style>
  `;

  // Print Functions
  const printPendingInvoicesReport = async () => {
    try {
      const invoicesRes = await api.get('/billing/invoices');
      const pendingInvoices = (invoicesRes.data.invoices || []).filter((inv: any) => inv && inv.status !== 'Paid');

      const rows = pendingInvoices.map((inv: any) => {
        const forWhat = inv.items && inv.items.length > 0
          ? inv.items.map((i: any) => i.description).join(', ')
          : inv.notes || 'General Services';
        const total = Number(inv.total_amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const balance = total - paid;
        return `
          <tr>
            <td>${inv.patient?.full_name || 'Unknown'}</td>
            <td>${inv.patient?.phone || 'N/A'}</td>
            <td>${inv.invoice_date ? format(new Date(inv.invoice_date), 'dd MMM yyyy') : 'N/A'}</td>
            <td>${forWhat}</td>
            <td style="text-align:right">TSh ${total.toLocaleString('en', {minimumFractionDigits:2})}</td>
            <td style="text-align:right">TSh ${paid.toLocaleString('en', {minimumFractionDigits:2})}</td>
            <td style="text-align:right;color:#dc2626;font-weight:bold">TSh ${balance.toLocaleString('en', {minimumFractionDigits:2})}</td>
          </tr>`;
      }).join('');

      const totalAmount = pendingInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const totalPaid = pendingInvoices.reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0);
      const totalBalance = totalAmount - totalPaid;

      handlePrint(`
        <html><head><title>Pending Invoices Report</title><style>
          body{font-family:Arial,sans-serif;margin:20px;font-size:13px}
          h1{text-align:center;margin-bottom:4px} h3{text-align:center;color:#555;margin-top:0}
          .meta{text-align:right;font-size:11px;color:#666;margin-bottom:16px}
          table{width:100%;border-collapse:collapse;margin-bottom:20px}
          th,td{border:1px solid #ddd;padding:7px 9px;text-align:left}
          th{background:#f0f0f0;font-weight:bold}
          tr:nth-child(even){background:#fafafa}
          .total-row{background:#fff3cd;font-weight:bold}
          .footer{text-align:center;font-size:11px;color:#888;margin-top:20px;border-top:1px solid #ddd;padding-top:10px}
        </style></head><body>
          <h1>Pending Invoices Report</h1>
          <h3>Patients with Outstanding Balances</h3>
          <div class="meta">Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}</div>
          <table>
            <thead><tr>
              <th>Patient Name</th><th>Phone</th><th>Date</th><th>For What</th>
              <th style="text-align:right">Amount (TSh)</th>
              <th style="text-align:right">Paid (TSh)</th>
              <th style="text-align:right">Balance (TSh)</th>
            </tr></thead>
            <tbody>
              ${rows}
              <tr class="total-row">
                <td colspan="4"><strong>TOTALS</strong></td>
                <td style="text-align:right"><strong>TSh ${totalAmount.toLocaleString('en', {minimumFractionDigits:2})}</strong></td>
                <td style="text-align:right"><strong>TSh ${totalPaid.toLocaleString('en', {minimumFractionDigits:2})}</strong></td>
                <td style="text-align:right;color:#dc2626"><strong>TSh ${totalBalance.toLocaleString('en', {minimumFractionDigits:2})}</strong></td>
              </tr>
            </tbody>
          </table>
          <div class="footer">Total Records: ${pendingInvoices.length} &nbsp;|&nbsp; Total Outstanding: TSh ${totalBalance.toLocaleString('en', {minimumFractionDigits:2})}</div>
        </body></html>
      `, 'Pending Invoices Report');
    } catch (error) {
      toast.error('Failed to generate pending invoices report');
    }
  };

  const printPaidInvoicesReport = async () => {
    try {
      const invoicesRes = await api.get('/billing/invoices');
      const paidInvoices = (invoicesRes.data.invoices || []).filter((inv: any) => inv && inv.status === 'Paid');

      const rows = paidInvoices.map((inv: any) => {
        const forWhat = inv.items && inv.items.length > 0
          ? inv.items.map((i: any) => i.description).join(', ')
          : inv.notes || 'General Services';
        const total = Number(inv.total_amount || 0);
        const paid = Number(inv.paid_amount || 0);
        const balance = total - paid;
        return `
          <tr>
            <td>${inv.patient?.full_name || 'Unknown'}</td>
            <td>${inv.patient?.phone || 'N/A'}</td>
            <td>${inv.invoice_date ? format(new Date(inv.invoice_date), 'dd MMM yyyy') : 'N/A'}</td>
            <td>${forWhat}</td>
            <td style="text-align:right">TSh ${total.toLocaleString('en', {minimumFractionDigits:2})}</td>
            <td style="text-align:right;color:#059669;font-weight:bold">TSh ${paid.toLocaleString('en', {minimumFractionDigits:2})}</td>
            <td style="text-align:right">${balance > 0 ? `TSh ${balance.toLocaleString('en', {minimumFractionDigits:2})}` : '—'}</td>
          </tr>`;
      }).join('');

      const totalAmount = paidInvoices.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
      const totalPaid = paidInvoices.reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0);

      handlePrint(`
        <html><head><title>Paid Invoices Report</title><style>
          body{font-family:Arial,sans-serif;margin:20px;font-size:13px}
          h1{text-align:center;margin-bottom:4px} h3{text-align:center;color:#555;margin-top:0}
          .meta{text-align:right;font-size:11px;color:#666;margin-bottom:16px}
          table{width:100%;border-collapse:collapse;margin-bottom:20px}
          th,td{border:1px solid #ddd;padding:7px 9px;text-align:left}
          th{background:#f0f0f0;font-weight:bold}
          tr:nth-child(even){background:#fafafa}
          .total-row{background:#d1fae5;font-weight:bold}
          .footer{text-align:center;font-size:11px;color:#888;margin-top:20px;border-top:1px solid #ddd;padding-top:10px}
        </style></head><body>
          <h1>Paid Invoices Report</h1>
          <h3>All Completed Payments</h3>
          <div class="meta">Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}</div>
          <table>
            <thead><tr>
              <th>Patient Name</th><th>Phone</th><th>Date</th><th>For What</th>
              <th style="text-align:right">Amount (TSh)</th>
              <th style="text-align:right">Paid (TSh)</th>
              <th style="text-align:right">Balance (TSh)</th>
            </tr></thead>
            <tbody>
              ${rows}
              <tr class="total-row">
                <td colspan="4"><strong>TOTALS</strong></td>
                <td style="text-align:right"><strong>TSh ${totalAmount.toLocaleString('en', {minimumFractionDigits:2})}</strong></td>
                <td style="text-align:right;color:#059669"><strong>TSh ${totalPaid.toLocaleString('en', {minimumFractionDigits:2})}</strong></td>
                <td style="text-align:right">—</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">Total Records: ${paidInvoices.length} &nbsp;|&nbsp; Total Revenue: TSh ${totalPaid.toLocaleString('en', {minimumFractionDigits:2})}</div>
        </body></html>
      `, 'Paid Invoices Report');
    } catch (error) {
      toast.error('Failed to generate paid invoices report');
    }
  };

  const printDetailedInvoiceReport = async () => {
    try {
      // Fetch all invoices with detailed items
      const invoicesResponse = await api.get('/billing/invoices');
      const allInvoices = (invoicesResponse.data.invoices || []).filter(invoice => invoice); // Add null check
      
      const printContent = `
        <html>
          <head>
            <title>Detailed Invoice Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
              .invoice-section { margin-bottom: 30px; border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
              .invoice-header { background: #f5f5f5; padding: 10px; margin: -15px -15px 15px -15px; border-radius: 5px 5px 0 0; }
              .invoice-title { font-size: 16px; font-weight: bold; color: #333; margin: 0; }
              .patient-info { display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px; }
              .patient-info div { font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
              th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }
              th { background-color: #f8f9fa; font-weight: bold; font-size: 11px; }
              td { font-size: 11px; }
              .total-row { background-color: #e3f2fd; font-weight: bold; }
              .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
              .amount { font-weight: bold; color: #2563eb; }
              .status-paid { color: #059669; font-weight: bold; }
              .status-pending { color: #d97706; font-weight: bold; }
              .status-partially { color: #dc2626; font-weight: bold; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Detailed Invoice Report</h1>
              <h3>Complete Invoice Breakdown with Service Details</h3>
            </div>
            <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
            
            ${allInvoices.map(invoice => {
              const statusClass = invoice.status === 'Paid' ? 'status-paid' : 
                                invoice.status === 'Partially Paid' ? 'status-partially' : 'status-pending';
              
              return `
                <div class="invoice-section">
                  <div class="invoice-header">
                    <div class="invoice-title">${getInvoiceServiceDescription(invoice)} - ${invoice.patient?.full_name || 'Unknown Patient'}</div>
                  </div>
                  
                  <div class="patient-info">
                    <div><strong>Patient:</strong> ${invoice.patient?.full_name || 'N/A'}</div>
                    <div><strong>Phone:</strong> ${invoice.patient?.phone || 'N/A'}</div>
                    <div><strong>Invoice Date:</strong> ${invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM dd, yyyy') : 'N/A'}</div>
                    <div><strong>Status:</strong> <span class="${statusClass}">${invoice.status || 'Pending'}</span></div>
                  </div>
                  
                  <table>
                    <thead>
                      <tr>
                        <th>Service/Item Description</th>
                        <th>Quantity</th>
                        <th>Unit Price</th>
                        <th>Total Price</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${invoice.items && invoice.items.length > 0 ? 
                        invoice.items.map(item => `
                          <tr>
                            <td>${item.description || 'Service'}</td>
                            <td>${item.quantity || 1}</td>
                            <td class="amount">TSh ${Number(item.unit_price || 0).toFixed(2)}</td>
                            <td class="amount">TSh ${Number(item.total_price || item.unit_price || 0).toFixed(2)}</td>
                          </tr>
                        `).join('') : 
                        '<tr><td colspan="4" style="text-align: center; color: #6b7280;">No detailed items available</td></tr>'
                      }
                      <tr class="total-row">
                        <td colspan="3"><strong>Total Amount</strong></td>
                        <td class="amount"><strong>TSh ${Number(invoice.total_amount || 0).toFixed(2)}</strong></td>
                      </tr>
                      <tr>
                        <td colspan="3"><strong>Amount Paid</strong></td>
                        <td class="amount"><strong>TSh ${Number(invoice.paid_amount || 0).toFixed(2)}</strong></td>
                      </tr>
                      <tr>
                        <td colspan="3"><strong>Balance Due</strong></td>
                        <td class="amount"><strong>TSh ${Number((invoice.total_amount || 0) - (invoice.paid_amount || 0)).toFixed(2)}</strong></td>
                      </tr>
                    </tbody>
                  </table>
                  
                  ${invoice.notes ? `<div style="font-size: 11px; color: #6b7280; margin-top: 10px;"><strong>Notes:</strong> ${invoice.notes}</div>` : ''}
                </div>
              `;
            }).join('')}
            
            <div class="footer">
              <p>Hospital Management System - Detailed Invoice Report</p>
              <p>Total Invoices: ${allInvoices.length} | Total Amount: TSh ${allInvoices.reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0).toFixed(2)} | Total Paid: TSh ${allInvoices.reduce((sum, inv) => sum + Number(inv.paid_amount || 0), 0).toFixed(2)}</p>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, 'Detailed Invoice Report');
    } catch (error) {

      toast.error('Failed to generate detailed invoice report');
    }
  };

  const printTodaysPaymentsReport = () => {
    const rows = rawPaymentsData.map((payment: any) => {
      const forWhat = payment.invoice?.items?.length > 0
        ? payment.invoice.items.map((i: any) => i.description).join(', ')
        : payment.notes || payment.invoice?.notes || 'Payment';
      return `
        <tr>
          <td>${payment.patient?.full_name || 'Unknown'}</td>
          <td>${payment.patient?.phone || 'N/A'}</td>
          <td>${payment.payment_date ? format(new Date(payment.payment_date), 'dd MMM yyyy, HH:mm') : 'N/A'}</td>
          <td>${forWhat}</td>
          <td style="text-align:right;color:#059669;font-weight:bold">TSh ${Number(payment.amount || 0).toLocaleString('en', {minimumFractionDigits:2})}</td>
          <td>${payment.payment_method || 'N/A'}</td>
          <td>${payment.reference_number || '—'}</td>
        </tr>`;
    }).join('');

    const total = rawPaymentsData.reduce((s: number, p: any) => s + Number(p.amount || 0), 0);

    handlePrint(`
      <html><head><title>Today's Payments Report</title><style>
        body{font-family:Arial,sans-serif;margin:20px;font-size:13px}
        h1{text-align:center;margin-bottom:4px} h3{text-align:center;color:#555;margin-top:0}
        .meta{text-align:right;font-size:11px;color:#666;margin-bottom:16px}
        table{width:100%;border-collapse:collapse;margin-bottom:20px}
        th,td{border:1px solid #ddd;padding:7px 9px;text-align:left}
        th{background:#f0f0f0;font-weight:bold}
        tr:nth-child(even){background:#fafafa}
        .total-row{background:#d1fae5;font-weight:bold}
        .footer{text-align:center;font-size:11px;color:#888;margin-top:20px;border-top:1px solid #ddd;padding-top:10px}
      </style></head><body>
        <h1>Today's Payments Report</h1>
        <h3>${format(new Date(), 'EEEE, dd MMMM yyyy')}</h3>
        <div class="meta">Generated: ${format(new Date(), 'dd MMM yyyy, HH:mm')}</div>
        <table>
          <thead><tr>
            <th>Patient Name</th><th>Phone</th><th>Date &amp; Time</th><th>For What</th>
            <th style="text-align:right">Amount (TSh)</th>
            <th>Method</th><th>Reference</th>
          </tr></thead>
          <tbody>
            ${rows}
            <tr class="total-row">
              <td colspan="4"><strong>TOTAL REVENUE TODAY</strong></td>
              <td style="text-align:right;color:#059669"><strong>TSh ${total.toLocaleString('en', {minimumFractionDigits:2})}</strong></td>
              <td colspan="2"></td>
            </tr>
          </tbody>
        </table>
        <div class="footer">Total Payments: ${rawPaymentsData.length} &nbsp;|&nbsp; Total: TSh ${total.toLocaleString('en', {minimumFractionDigits:2})}</div>
      </body></html>
    `, "Today's Payments Report");
  };

  const printComprehensiveBillingReport = async () => {
    try {
      // Fetch detailed invoice data with items
      const invoicesWithItemsResponse = await api.get('/billing/invoices');
      const detailedInvoices = (invoicesWithItemsResponse.data.invoices || []).filter(invoice => invoice); // Add null check
      
      const totalPendingAmount = billingVisits.reduce((sum, visit) => sum + (patientCosts[visit.patient_id] || 0), 0);
      const totalPaidAmount = invoices.filter(p => p.status === 'Paid').reduce((sum, p) => sum + Number(p.paidAmount || 0), 0);
      const todaysRevenue = rawPaymentsData.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalClaimsAmount = insuranceClaims.reduce((sum, c) => sum + Number(c.claim_amount || 0), 0);
      
      const printContent = `
        <html>
          <head>
            <title>Comprehensive Billing Report with Invoice Details</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
              .summary { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; margin-bottom: 30px; }
              .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; }
              .summary-title { font-weight: bold; color: #333; margin-bottom: 5px; }
              .summary-amount { font-size: 18px; font-weight: bold; color: #2563eb; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; font-weight: bold; }
              .section-title { font-size: 16px; font-weight: bold; margin: 20px 0 10px 0; color: #333; }
              .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
              .invoice-items { font-size: 11px; background: #f8f9fa; padding: 5px; border-radius: 3px; margin: 2px 0; }
              .item-detail { display: block; margin: 1px 0; }
              .amount { font-weight: bold; color: #2563eb; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Comprehensive Billing Report</h1>
              <h3>Complete Financial Overview with Invoice Details</h3>
            </div>
            <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
            
            <div class="summary">
              <div class="summary-card">
                <div class="summary-title">Pending Invoices</div>
                <div class="summary-amount">TSh ${totalPendingAmount.toFixed(2)}</div>
                <div>${billingVisits.length} patients awaiting billing</div>
              </div>
              <div class="summary-card">
                <div class="summary-title">Total Revenue (Paid)</div>
                <div class="summary-amount">TSh ${totalPaidAmount.toFixed(2)}</div>
                <div>${invoices.filter(p => p.status === 'Paid').length} paid invoices</div>
              </div>
              <div class="summary-card">
                <div class="summary-title">Today's Revenue</div>
                <div class="summary-amount">TSh ${todaysRevenue.toFixed(2)}</div>
                <div>${rawPaymentsData.length} payments today</div>
              </div>
              <div class="summary-card">
                <div class="summary-title">Insurance Claims</div>
                <div class="summary-amount">TSh ${totalClaimsAmount.toFixed(2)}</div>
                <div>${insuranceClaims.length} claims submitted</div>
              </div>
            </div>

            <div class="section-title">Detailed Invoice Breakdown</div>
            <table>
              <thead>
                <tr>
                  <th>Services</th>
                  <th>Patient</th>
                  <th>Date</th>
                  <th>Service Details</th>
                  <th>Total Amount</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${detailedInvoices.map(invoice => {
                  const itemsDisplay = invoice.items && invoice.items.length > 0 
                    ? invoice.items.map(item => 
                        `<span class="item-detail">${item.description} (Qty: ${item.quantity || 1}) - TSh${Number(item.total_price || item.unit_price || 0).toFixed(2)}</span>`
                      ).join('')
                    : '<span class="item-detail">No detailed items available</span>';
                  
                  return `
                    <tr>
                      <td><strong>${getInvoiceServiceDescription(invoice)}</strong></td>
                      <td>${invoice.patient?.full_name || 'Unknown'}</td>
                      <td>${invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td class="invoice-items">${itemsDisplay}</td>
                      <td class="amount">TSh ${Number(invoice.total_amount || 0).toFixed(2)}</td>
                      <td class="amount">TSh ${Number(invoice.paid_amount || 0).toFixed(2)}</td>
                      <td class="amount">TSh ${Number((invoice.total_amount || 0) - (invoice.paid_amount || 0)).toFixed(2)}</td>
                      <td>${invoice.status || 'Pending'}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>

            <div class="section-title">Financial Summary</div>
            <table>
              <thead>
                <tr>
                  <th>Category</th>
                  <th>Count</th>
                  <th>Amount (TSh)</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Pending Invoices</td>
                  <td>${billingVisits.length}</td>
                  <td>${totalPendingAmount.toFixed(2)}</td>
                  <td>Awaiting Billing</td>
                </tr>
                <tr>
                  <td>Paid Invoices</td>
                  <td>${invoices.filter(p => p.status === 'Paid').length}</td>
                  <td>${totalPaidAmount.toFixed(2)}</td>
                  <td>Completed</td>
                </tr>
                <tr>
                  <td>Today's Payments</td>
                  <td>${rawPaymentsData.length}</td>
                  <td>${todaysRevenue.toFixed(2)}</td>
                  <td>Received Today</td>
                </tr>
                <tr>
                  <td>Insurance Claims</td>
                  <td>${insuranceClaims.length}</td>
                  <td>${totalClaimsAmount.toFixed(2)}</td>
                  <td>Submitted</td>
                </tr>
                <tr style="background-color: #f9f9f9; font-weight: bold;">
                  <td>Total Revenue</td>
                  <td>${invoices.filter(p => p.status === 'Paid').length + rawPaymentsData.length}</td>
                  <td>${(totalPaidAmount + todaysRevenue).toFixed(2)}</td>
                  <td>All Time</td>
                </tr>
              </tbody>
            </table>

            <div class="footer">
              <p>Hospital Management System - Comprehensive Billing Report with Invoice Details</p>
              <p>Report includes all billing activities, payments, insurance claims, and detailed service breakdown</p>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, 'Comprehensive Billing Report with Details');
    } catch (error) {

      toast.error('Failed to generate comprehensive billing report');
    }
  };

  const printPatientListReport = async () => {
    try {
      const response = await api.get('/patients');
      const allPatients = response.data.patients || [];
      
      const printContent = `
        <html>
          <head>
            <title>Patient List Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; font-weight: bold; }
              .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
              .patient-id { font-family: monospace; font-size: 11px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Patient List Report</h1>
              <h3>Complete Patient Registry</h3>
            </div>
            <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
            <table>
              <thead>
                <tr>
                  <th>Patient ID</th>
                  <th>Full Name</th>
                  <th>Phone</th>
                  <th>Email</th>
                  <th>Date of Birth</th>
                  <th>Gender</th>
                  <th>Registration Date</th>
                </tr>
              </thead>
              <tbody>
                ${allPatients.map(patient => `
                  <tr>
                    <td class="patient-id">${patient.id.substring(0, 8).toUpperCase()}...</td>
                    <td>${patient.full_name || 'N/A'}</td>
                    <td>${patient.phone || 'N/A'}</td>
                    <td>${patient.email || 'N/A'}</td>
                    <td>${patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMM dd, yyyy') : 'N/A'}</td>
                    <td>${patient.gender || 'N/A'}</td>
                    <td>${patient.created_at ? format(new Date(patient.created_at), 'MMM dd, yyyy') : 'N/A'}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
            <div class="footer">
              <p>Hospital Management System - Patient Registry Report</p>
              <p>Total Patients: ${allPatients.length}</p>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, 'Patient List Report');
    } catch (error) {

      toast.error('Failed to generate patient list report');
    }
  };

  const printMedicalHistoryReport = async (fromDate?: string, toDate?: string) => {
    try {
      // Build API URLs with date filters if provided
      const dateParams = new URLSearchParams();
      if (fromDate) dateParams.append('from', fromDate);
      if (toDate) dateParams.append('to', toDate);
      const dateQuery = dateParams.toString() ? `?${dateParams.toString()}` : '';

      const [visitsResponse, prescriptionsResponse, labTestsResponse, medicationsResponse, prescriptionItemsResponse] = await Promise.all([
        api.get(`/visits${dateQuery}`),
        api.get(`/prescriptions${dateQuery}`),
        api.get(`/lab-tests${dateQuery}`),
        api.get('/pharmacy/medications').catch(() => ({ data: { medications: [] } })),
        api.get('/prescription-items').catch(() => ({ data: { prescription_items: [] } }))
      ]);
      
      const allVisits = visitsResponse.data.visits || [];
      const allPrescriptions = prescriptionsResponse.data.prescriptions || [];
      const allLabTests = labTestsResponse.data.labTests || [];
      const allMedications = medicationsResponse.data.medications || [];
      const allPrescriptionItems = prescriptionItemsResponse.data.prescription_items || [];

      const printContent = `
        <html>
          <head>
            <title>Medical History Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
              .section { margin-bottom: 30px; }
              .section-title { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; border-bottom: 1px solid #ddd; padding-bottom: 5px; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; font-weight: bold; }
              .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
              .summary-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 30px; }
              .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
              .summary-number { font-size: 24px; font-weight: bold; color: #2563eb; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Medical History Report</h1>
              <h3>Complete Medical Activities Overview</h3>
            </div>
            <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
            
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-number">${allVisits.length}</div>
                <div>Total Visits</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">${allPrescriptions.length}</div>
                <div>Total Prescriptions</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">${allLabTests.length}</div>
                <div>Total Lab Tests</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">${allPrescriptionItems.length}</div>
                <div>Medication Items</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">All Patient Visits (${allVisits.length} total)</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient Name</th>
                    <th>Visit Type</th>
                    <th>Chief Complaint</th>
                    <th>Current Stage</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${allVisits.map(visit => `
                    <tr>
                      <td>${visit.visit_date ? format(new Date(visit.visit_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td>${visit.patient?.full_name || 'Unknown'}</td>
                      <td>${visit.visit_type || 'N/A'}</td>
                      <td>${visit.chief_complaint || 'N/A'}</td>
                      <td>${visit.current_stage || 'N/A'}</td>
                      <td>${visit.overall_status || visit.status || 'N/A'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">All Prescriptions (${allPrescriptions.length} total)</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient Name</th>
                    <th>Doctor</th>
                    <th>Diagnosis</th>
                    <th>Status</th>
                    <th>Medications</th>
                  </tr>
                </thead>
                <tbody>
                  ${allPrescriptions.map(prescription => {
                    // Find prescription items for this prescription
                    const prescriptionMeds = allPrescriptionItems.filter(item => item.prescription_id === prescription.id);
                    const medicationsList = prescriptionMeds.map(item => {
                      const medication = allMedications.find(med => med.id === item.medication_id);
                      return `${medication?.name || 'Unknown'} (${item.quantity || 0} ${item.dosage_form || ''})`;
                    }).join(', ') || 'No medications found';
                    
                    return `
                      <tr>
                        <td>${prescription.prescription_date ? format(new Date(prescription.prescription_date), 'MMM dd, yyyy') : 'N/A'}</td>
                        <td>${prescription.patient?.full_name || 'Unknown'}</td>
                        <td>${prescription.doctor_profile?.name || prescription.doctor_profile?.full_name || 'Unknown'}</td>
                        <td>${prescription.diagnosis || 'N/A'}</td>
                        <td>${prescription.status || 'N/A'}</td>
                        <td style="font-size: 11px;">${medicationsList}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">All Lab Tests (${allLabTests.length} total)</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient Name</th>
                    <th>Test Name</th>
                    <th>Test Type</th>
                    <th>Status</th>
                    <th>Results Summary</th>
                    <th>Doctor</th>
                  </tr>
                </thead>
                <tbody>
                  ${allLabTests.map(test => {
                    let resultsDisplay = 'Pending';
                    let statusClass = 'status-pending';
                    
                    if (test.results) {
                      statusClass = 'status-completed';
                      try {
                        const parsedResults = typeof test.results === 'string' ? JSON.parse(test.results) : test.results;
                        if (parsedResults.results) {
                          // Format the results nicely
                          const resultEntries = Object.entries(parsedResults.results).map(([key, value]: [string, any]) => {
                            const status = value.status || 'Normal';
                            const statusIcon = status.toLowerCase().includes('abnormal') || status.toLowerCase().includes('high') || status.toLowerCase().includes('low') ? '⚠️' : '✅';
                            return `${key}: ${value.value} ${value.unit || ''} ${statusIcon}`;
                          }).join('; ');
                          resultsDisplay = resultEntries.length > 150 ? resultEntries.substring(0, 150) + '...' : resultEntries;
                        } else if (parsedResults.interpretation) {
                          resultsDisplay = `📋 ${parsedResults.interpretation.length > 100 ? parsedResults.interpretation.substring(0, 100) + '...' : parsedResults.interpretation}`;
                        } else if (parsedResults.summary) {
                          resultsDisplay = `📋 ${parsedResults.summary.length > 100 ? parsedResults.summary.substring(0, 100) + '...' : parsedResults.summary}`;
                        } else {
                          resultsDisplay = '✅ Results available';
                        }
                      } catch (e) {
                        // If not JSON, display as text
                        resultsDisplay = `📋 ${test.results.length > 100 ? test.results.substring(0, 100) + '...' : test.results}`;
                      }
                    } else if (test.status === 'Completed') {
                      resultsDisplay = '⏳ Results being processed';
                      statusClass = 'status-processing';
                    } else if (test.status === 'In Progress') {
                      resultsDisplay = '🔬 Test in progress';
                      statusClass = 'status-progress';
                    } else {
                      resultsDisplay = '⏳ Test pending';
                      statusClass = 'status-pending';
                    }
                    
                    return `
                    <tr>
                      <td>${test.test_date ? format(new Date(test.test_date), 'MMM dd, yyyy') : (test.created_at ? format(new Date(test.created_at), 'MMM dd, yyyy') : 'N/A')}</td>
                      <td><strong>${test.patient?.full_name || 'Unknown'}</strong></td>
                      <td><strong>${test.test_name || 'N/A'}</strong></td>
                      <td>${test.test_type || 'N/A'}</td>
                      <td class="${statusClass}"><strong>${test.status || 'Pending'}</strong></td>
                      <td style="font-size: 11px;">${resultsDisplay}</td>
                      <td>Dr. ${test.doctor?.name || test.doctor?.full_name || 'Unknown'}</td>
                    </tr>
                  `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">Medication Dispensing Details (${allPrescriptionItems.length} total)</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Patient</th>
                    <th>Medication</th>
                    <th>Strength</th>
                    <th>Quantity</th>
                    <th>Dosage Instructions</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${allPrescriptionItems.map(item => {
                    const medication = allMedications.find(med => med.id === item.medication_id);
                    const prescription = allPrescriptions.find(pres => pres.id === item.prescription_id);
                    
                    return `
                      <tr>
                        <td>${prescription?.prescription_date ? format(new Date(prescription.prescription_date), 'MMM dd, yyyy') : 'N/A'}</td>
                        <td>${prescription?.patient?.full_name || 'Unknown'}</td>
                        <td>${medication?.name || 'Unknown Medication'}</td>
                        <td>${medication?.strength || 'N/A'}</td>
                        <td>${item.quantity || 0} ${item.dosage_form || medication?.dosage_form || ''}</td>
                        <td style="font-size: 11px;">${item.dosage_instructions || 'No instructions'}</td>
                        <td>${item.status || prescription?.status || 'N/A'}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>

            <div class="footer">
              <p>Hospital Management System - Medical History Report</p>
              <p>Visits: ${allVisits.length} | Prescriptions: ${allPrescriptions.length} | Lab Tests: ${allLabTests.length} | Medications: ${allPrescriptionItems.length}</p>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, 'Medical History Report');
    } catch (error) {

      toast.error('Failed to generate medical history report');
    }
  };

  const printPharmacyInventoryReport = async () => {
    try {
      const response = await api.get('/pharmacy/medications');
      const allMedications = response.data.medications || [];
      
      const lowStockMeds = allMedications.filter(med => (med.stock_quantity || 0) <= (med.reorder_level || 0));
      const outOfStockMeds = allMedications.filter(med => (med.stock_quantity || 0) === 0);
      const totalValue = allMedications.reduce((sum, med) => sum + ((med.stock_quantity || 0) * (med.unit_price || 0)), 0);
      
      const printContent = `
        <html>
          <head>
            <title>Pharmacy Inventory Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
              .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
              .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
              .summary-number { font-size: 20px; font-weight: bold; color: #2563eb; }
              .low-stock { color: #f59e0b; }
              .out-of-stock { color: #ef4444; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; font-weight: bold; }
              .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
              .section-title { font-size: 16px; font-weight: bold; margin: 20px 0 10px 0; color: #333; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Pharmacy Inventory Report</h1>
              <h3>Complete Medication Stock Overview</h3>
            </div>
            <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
            
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-number">${allMedications.length}</div>
                <div>Total Medications</div>
              </div>
              <div class="summary-card">
                <div class="summary-number low-stock">${lowStockMeds.length}</div>
                <div>Low Stock Items</div>
              </div>
              <div class="summary-card">
                <div class="summary-number out-of-stock">${outOfStockMeds.length}</div>
                <div>Out of Stock</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">TSh ${totalValue.toFixed(2)}</div>
                <div>Total Inventory Value</div>
              </div>
            </div>

            <div class="section-title">Complete Medication Inventory</div>
            <table>
              <thead>
                <tr>
                  <th>Medication Name</th>
                  <th>Strength</th>
                  <th>Dosage Form</th>
                  <th>Stock Quantity</th>
                  <th>Unit Price</th>
                  <th>Total Value</th>
                  <th>Reorder Level</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${allMedications.map(med => {
                  const stock = med.stock_quantity || 0;
                  const reorderLevel = med.reorder_level || 0;
                  const unitPrice = med.unit_price || 0;
                  const totalValue = stock * unitPrice;
                  let status = 'Normal';
                  let statusClass = '';
                  
                  if (stock === 0) {
                    status = 'Out of Stock';
                    statusClass = 'out-of-stock';
                  } else if (stock <= reorderLevel) {
                    status = 'Low Stock';
                    statusClass = 'low-stock';
                  }
                  
                  return `
                    <tr>
                      <td>${med.name || 'N/A'}</td>
                      <td>${med.strength || 'N/A'}</td>
                      <td>${med.dosage_form || 'N/A'}</td>
                      <td class="${statusClass}">${stock}</td>
                      <td>TSh ${unitPrice.toFixed(2)}</td>
                      <td>TSh ${totalValue.toFixed(2)}</td>
                      <td>${reorderLevel}</td>
                      <td class="${statusClass}">${status}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>

            <div class="footer">
              <p>Hospital Management System - Pharmacy Inventory Report</p>
              <p>Total Items: ${allMedications.length} | Low Stock: ${lowStockMeds.length} | Out of Stock: ${outOfStockMeds.length} | Total Value: TSh ${totalValue.toFixed(2)}</p>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, 'Pharmacy Inventory Report');
    } catch (error) {

      toast.error('Failed to generate pharmacy inventory report');
    }
  };

  const printIndividualPatientReport = async (patient: any, fromDate?: string, toDate?: string) => {
    try {
      // Validate patient ID
      if (!patient?.id) {
        toast.error('Invalid patient selected for report');
        return;
      }

      // Build API URLs with date filters if provided
      const buildDateQuery = (baseUrl: string) => {
        const params = new URLSearchParams();
        params.append('patient_id', patient.id);
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
        return `${baseUrl}?${params.toString()}`;
      };

      // Fetch all data for this specific patient with date filtering
      const [visitsResponse, prescriptionsResponse, labTestsResponse, paymentsResponse, invoicesResponse, medicationsResponse, prescriptionItemsResponse] = await Promise.all([
        api.get(buildDateQuery('/visits')),
        api.get(buildDateQuery('/prescriptions')),
        api.get(buildDateQuery('/lab-tests')),
        api.get(buildDateQuery('/payments')),
        api.get(buildDateQuery('/billing/invoices')),
        api.get('/pharmacy/medications').catch(() => ({ data: { medications: [] } })),
        api.get('/prescription-items').catch(() => ({ data: { prescription_items: [] } }))
      ]);
      
      const patientVisits = visitsResponse.data.visits || [];
      const patientPrescriptions = prescriptionsResponse.data.prescriptions || [];
      const patientLabTests = labTestsResponse.data.labTests || [];
      const patientPayments = paymentsResponse.data.payments || [];
      const patientInvoices = (invoicesResponse.data.invoices || []).filter(invoice => invoice); // Add null check
      const allMedications = medicationsResponse.data.medications || [];
      const allPrescriptionItems = prescriptionItemsResponse.data.prescription_items || [];
      
      // Filter prescription items for this patient
      const patientPrescriptionItems = allPrescriptionItems.filter(item => 
        patientPrescriptions.some(pres => pres.id === item.prescription_id)
      );

      // Log data counts for verification

      // Verify data belongs to correct patient
      const invalidVisits = patientVisits.filter(v => v.patient_id !== patient.id);
      const invalidPayments = patientPayments.filter(p => p.patient_id !== patient.id);
      const invalidInvoices = patientInvoices.filter(i => i.patient_id !== patient.id);
      
      if (invalidVisits.length > 0 || invalidPayments.length > 0 || invalidInvoices.length > 0) {

      }
      
      // Calculate totals
      const totalPaid = patientPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const totalInvoiced = patientInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
      const totalBalance = patientInvoices.reduce((sum, invoice) => sum + Number((invoice.total_amount || 0) - (invoice.paid_amount || 0)), 0);
      
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Patient Report - ${patient.full_name}</title>
            ${getReportStyles()}
          </head>
          <body>
            ${getHospitalHeader()}
            
            <div class="page-title">
              <h1>PATIENT MEDICAL REPORT</h1>
              <h2>${patient.full_name}</h2>
              <p>Complete Medical and Financial History${fromDate && toDate ? ` (${format(new Date(fromDate), 'MMM dd, yyyy')} - ${format(new Date(toDate), 'MMM dd, yyyy')})` : fromDate ? ` (From ${format(new Date(fromDate), 'MMM dd, yyyy')})` : toDate ? ` (Until ${format(new Date(toDate), 'MMM dd, yyyy')})` : ''}</p>
            </div>
            
            <div class="patient-info">
              <h3>👤 Patient Information</h3>
              <div class="patient-details">
                <p><strong>Patient ID:</strong> <span class="patient-id">${patient.full_name} (${patient.phone})</span></p>
                <p><strong>Full Name:</strong> ${patient.full_name || 'N/A'}</p>
                <p><strong>Patient Reference:</strong> ${patient.id.substring(0, 8).toUpperCase()}...</p>
                <p><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p><strong>Email:</strong> ${patient.email || 'N/A'}</p>
                <p><strong>Date of Birth:</strong> ${patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMMM dd, yyyy') : 'N/A'}</p>
                <p><strong>Gender:</strong> ${patient.gender || 'N/A'}</p>
                <p><strong>Address:</strong> ${patient.address || 'N/A'}</p>
                <p><strong>Registration Date:</strong> ${patient.created_at ? format(new Date(patient.created_at), 'MMMM dd, yyyy') : 'N/A'}</p>
              </div>
            </div>

            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-number">${patientVisits.length}</div>
                <div class="summary-label">Total Visits</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">${patientPrescriptions.length}</div>
                <div class="summary-label">Prescriptions</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">${patientLabTests.length}</div>
                <div class="summary-label">Lab Tests</div>
              </div>
              <div class="summary-card">
                <div class="summary-number amount">TSh ${totalPaid.toFixed(2)}</div>
                <div class="summary-label">Total Paid</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">📋 Visit History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Visit Type</th>
                    <th>Chief Complaint</th>
                    <th>Diagnosis</th>
                    <th>Status</th>
                    <th>Doctor Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientVisits.length > 0 ? patientVisits.map(visit => `
                    <tr>
                      <td>${visit.visit_date ? format(new Date(visit.visit_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td>${visit.visit_type || 'N/A'}</td>
                      <td>${visit.chief_complaint || 'N/A'}</td>
                      <td>${visit.diagnosis || visit.doctor_diagnosis || 'N/A'}</td>
                      <td class="status-${(visit.overall_status || visit.status || 'pending').toLowerCase()}">${visit.overall_status || visit.status || 'N/A'}</td>
                      <td>${visit.doctor_notes || visit.notes || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No visits recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">💊 Prescription History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Doctor</th>
                    <th>Diagnosis</th>
                    <th>Medications</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientPrescriptions.length > 0 ? patientPrescriptions.map(prescription => `
                    <tr>
                      <td>${prescription.prescription_date ? format(new Date(prescription.prescription_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td>${prescription.doctor_profile?.name || prescription.doctor_profile?.full_name || 'Unknown'}</td>
                      <td>${prescription.diagnosis || 'N/A'}</td>
                      <td>${prescription.items && prescription.items.length > 0 ? 
                        prescription.items.map(item => {
                          const details = [];
                          details.push(item.medication_name || 'Unknown medication');
                          if (item.dosage) details.push(`Dosage: ${item.dosage}`);
                          if (item.frequency) details.push(`Frequency: ${item.frequency} times/day`);
                          if (item.duration) details.push(`Duration: ${item.duration} days`);
                          if (item.quantity) details.push(`Qty: ${item.quantity}`);
                          if (item.instructions) details.push(`Instructions: ${item.instructions}`);
                          return `<div style="margin-bottom: 8px; padding: 4px; border-left: 3px solid #3b82f6; background: #f8fafc;">${details.join(' • ')}</div>`;
                        }).join('') : 'No medications prescribed'}</td>
                      <td class="status-${(prescription.status || 'pending').toLowerCase()}">${prescription.status || 'N/A'}</td>
                      <td>${prescription.notes || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No prescriptions recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">🧪 Laboratory Test Results</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Test Name</th>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Results</th>
                    <th>Normal Range</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientLabTests.length > 0 ? patientLabTests.map(test => {
                    let resultsDisplay = 'Pending';
                    let statusClass = 'status-pending';
                    
                    if (test.results) {
                      statusClass = 'status-completed';
                      try {
                        const parsedResults = typeof test.results === 'string' ? JSON.parse(test.results) : test.results;
                        if (parsedResults.results) {
                          // Format the results nicely
                          const resultEntries = Object.entries(parsedResults.results).map(([key, value]: [string, any]) => {
                            const status = value.status || 'Normal';
                            const statusIcon = status.toLowerCase().includes('abnormal') || status.toLowerCase().includes('high') || status.toLowerCase().includes('low') ? '⚠️' : '✅';
                            return `${key}: ${value.value} ${value.unit || ''} ${statusIcon}`;
                          }).join('<br>');
                          resultsDisplay = resultEntries;
                        } else if (parsedResults.interpretation) {
                          resultsDisplay = `📋 ${parsedResults.interpretation}`;
                        } else if (parsedResults.summary) {
                          resultsDisplay = `📋 ${parsedResults.summary}`;
                        } else {
                          resultsDisplay = '✅ Results available - See detailed report';
                        }
                      } catch (e) {
                        // If not JSON, display as text
                        resultsDisplay = `📋 ${test.results}`;
                      }
                    } else if (test.status === 'Completed') {
                      resultsDisplay = '⏳ Results being processed';
                      statusClass = 'status-processing';
                    } else if (test.status === 'In Progress') {
                      resultsDisplay = '🔬 Test in progress';
                      statusClass = 'status-progress';
                    } else {
                      resultsDisplay = '⏳ Test pending';
                      statusClass = 'status-pending';
                    }
                    
                    return `
                    <tr>
                      <td>${test.test_date ? format(new Date(test.test_date), 'MMM dd, yyyy') : (test.created_at ? format(new Date(test.created_at), 'MMM dd, yyyy') : 'N/A')}</td>
                      <td><strong>${test.test_name || 'N/A'}</strong></td>
                      <td>Dr. ${test.doctor?.name || test.doctor?.full_name || 'Unknown'}</td>
                      <td class="${statusClass}"><strong>${test.status || 'Pending'}</strong></td>
                      <td>${resultsDisplay}</td>
                      <td>${test.normal_range || 'N/A'}</td>
                    </tr>
                  `;
                  }).join('') : '<tr><td colspan="6" style="text-align: center; color: #6b7280; padding: 20px;"><em>No laboratory tests recorded for this patient</em></td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">💰 Financial Summary</div>
              <table>
                <thead>
                  <tr>
                    <th>Invoice Date</th>
                    <th>Services</th>
                    <th>Total Amount</th>
                    <th>Paid Amount</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientInvoices.length > 0 ? patientInvoices.map(invoice => `
                    <tr>
                      <td>${invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td><strong>${getInvoiceServiceDescription(invoice)}</strong></td>
                      <td class="amount">TSh ${Number(invoice.total_amount || 0).toFixed(2)}</td>
                      <td class="amount">TSh ${Number(invoice.paid_amount || 0).toFixed(2)}</td>
                      <td class="amount">TSh ${Number((invoice.total_amount || 0) - (invoice.paid_amount || 0)).toFixed(2)}</td>
                      <td class="status-${(invoice.status || 'pending').toLowerCase()}">${invoice.status || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No invoices recorded</td></tr>'}
                  <tr style="background-color: #f3f4f6; font-weight: bold;">
                    <td colspan="2"><strong>TOTALS</strong></td>
                    <td class="amount">TSh ${totalInvoiced.toFixed(2)}</td>
                    <td class="amount">TSh ${totalPaid.toFixed(2)}</td>
                    <td class="amount">TSh ${totalBalance.toFixed(2)}</td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">💳 Payment History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Reference Number</th>
                    <th>Status</th>
                    <th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientPayments.length > 0 ? patientPayments.map(payment => `
                    <tr>
                      <td>${payment.payment_date ? format(new Date(payment.payment_date), 'MMM dd, yyyy HH:mm') : 'N/A'}</td>
                      <td class="amount">TSh ${Number(payment.amount || 0).toFixed(2)}</td>
                      <td>${payment.payment_method || 'N/A'}</td>
                      <td>${payment.reference_number || 'N/A'}</td>
                      <td class="status-${(payment.status || 'pending').toLowerCase()}">${payment.status || 'N/A'}</td>
                      <td>${payment.notes || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" style="text-align: center; color: #6b7280;">No payments recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="confidential">
              ⚠️ CONFIDENTIAL MEDICAL INFORMATION ⚠️<br>
              This report contains confidential medical information protected by privacy laws.<br>
              Unauthorized disclosure is prohibited and may result in legal action.
            </div>

            <div class="footer">
              <div class="footer-content">
                <div>
                  <strong>Hospital Management System</strong><br>
                  Individual Patient Report
                </div>
                <div>
                  Patient: ${patient.full_name}<br>
                  Reference: ${patient.id.substring(0, 8).toUpperCase()}...
                </div>
                <div>
                  Generated: ${new Date().toLocaleDateString()}<br>
                  Time: ${new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, `Patient Report - ${patient.full_name}`);
    } catch (error) {

      toast.error('Failed to generate patient report');
    }
  };

  const printMedicalOnlyReport = async (patient: any, fromDate?: string, toDate?: string) => {
    try {
      // Validate patient ID
      if (!patient?.id) {
        toast.error('Invalid patient selected for medical report');
        return;
      }

      // Build API URLs with date filters if provided
      const buildDateQuery = (baseUrl: string) => {
        const params = new URLSearchParams();
        params.append('patient_id', patient.id);
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
        return `${baseUrl}?${params.toString()}`;
      };

      const [visitsResponse, prescriptionsResponse, labTestsResponse] = await Promise.all([
        api.get(buildDateQuery('/visits')),
        api.get(buildDateQuery('/prescriptions')),
        api.get(buildDateQuery('/lab-tests'))
      ]);
      
      const patientVisits = visitsResponse.data.visits || [];
      const patientPrescriptions = prescriptionsResponse.data.prescriptions || [];
      const patientLabTests = labTestsResponse.data.labTests || [];

      // Verify data belongs to correct patient
      const invalidVisits = patientVisits.filter(v => v.patient_id !== patient.id);
      const invalidPrescriptions = patientPrescriptions.filter(p => p.patient_id !== patient.id);
      const invalidLabTests = patientLabTests.filter(l => l.patient_id !== patient.id);
      
      if (invalidVisits.length > 0 || invalidPrescriptions.length > 0 || invalidLabTests.length > 0) {

        toast.warning('Some medical data may not belong to this patient. Check console for details.');
      }
      
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Medical History Report - ${patient.full_name}</title>
            ${getReportStyles()}
          </head>
          <body>
            ${getHospitalHeader()}
            
            <div class="page-title">
              <h1>MEDICAL HISTORY REPORT</h1>
              <h2>${patient.full_name}</h2>
              <p>Complete Medical History (No Financial Information)</p>
            </div>
            
            <div class="patient-info">
              <h3>👤 Patient Information</h3>
              <div class="patient-details">
                <p><strong>Full Name:</strong> ${patient.full_name}</p>
                <p><strong>Patient ID:</strong> ${patient.id.substring(0, 8)}...</p>
                <p><strong>Date of Birth:</strong> ${patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMMM dd, yyyy') : 'N/A'}</p>
                <p><strong>Gender:</strong> ${patient.gender || 'N/A'}</p>
                <p><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p><strong>Email:</strong> ${patient.email || 'N/A'}</p>
              </div>
            </div>

            <div class="section">
              <div class="section-title">📋 Visit History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Visit Type</th>
                    <th>Chief Complaint</th>
                    <th>Diagnosis</th>
                    <th>Status</th>
                    <th>Doctor Notes</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientVisits.length > 0 ? patientVisits.map(visit => `
                    <tr>
                      <td>${visit.visit_date ? format(new Date(visit.visit_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td>${visit.visit_type || 'N/A'}</td>
                      <td>${visit.chief_complaint || 'N/A'}</td>
                      <td>${visit.diagnosis || visit.doctor_diagnosis || 'N/A'}</td>
                      <td>${visit.overall_status || visit.status || 'N/A'}</td>
                      <td>${visit.doctor_notes || visit.notes || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" style="text-align: center;">No visits recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">💊 Prescription History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Doctor</th>
                    <th>Diagnosis</th>
                    <th>Medications</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientPrescriptions.length > 0 ? patientPrescriptions.map(prescription => `
                    <tr>
                      <td>${prescription.prescription_date ? format(new Date(prescription.prescription_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td>${prescription.doctor_profile?.name || 'Unknown'}</td>
                      <td>${prescription.diagnosis || 'N/A'}</td>
                      <td>${prescription.items && prescription.items.length > 0 ? 
                        prescription.items.map(item => {
                          const details = [];
                          details.push(item.medication_name || 'Unknown medication');
                          if (item.dosage) details.push(`Dosage: ${item.dosage}`);
                          if (item.frequency) details.push(`Frequency: ${item.frequency} times/day`);
                          if (item.duration) details.push(`Duration: ${item.duration} days`);
                          if (item.quantity) details.push(`Qty: ${item.quantity}`);
                          if (item.instructions) details.push(`Instructions: ${item.instructions}`);
                          return `<div style="margin-bottom: 8px; padding: 4px; border-left: 3px solid #3b82f6; background: #f8fafc;">${details.join(' • ')}</div>`;
                        }).join('') : 'No medications prescribed'}</td>
                      <td>${prescription.status || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="5" style="text-align: center;">No prescriptions recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">🧪 Laboratory Test Results</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Test Name</th>
                    <th>Doctor</th>
                    <th>Status</th>
                    <th>Results</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientLabTests.length > 0 ? patientLabTests.map(test => {
                    let resultsDisplay = 'Pending';
                    let statusClass = 'status-pending';
                    
                    if (test.results) {
                      statusClass = 'status-completed';
                      try {
                        const parsedResults = typeof test.results === 'string' ? JSON.parse(test.results) : test.results;
                        if (parsedResults.results) {
                          // Format the results nicely
                          const resultEntries = Object.entries(parsedResults.results).map(([key, value]: [string, any]) => {
                            const status = value.status || 'Normal';
                            const statusIcon = status.toLowerCase().includes('abnormal') || status.toLowerCase().includes('high') || status.toLowerCase().includes('low') ? '⚠️' : '✅';
                            return `${key}: ${value.value} ${value.unit || ''} ${statusIcon}`;
                          }).join('<br>');
                          resultsDisplay = resultEntries;
                        } else if (parsedResults.interpretation) {
                          resultsDisplay = `📋 ${parsedResults.interpretation}`;
                        } else if (parsedResults.summary) {
                          resultsDisplay = `📋 ${parsedResults.summary}`;
                        } else {
                          resultsDisplay = '✅ Results available - See detailed report';
                        }
                      } catch (e) {
                        // If not JSON, display as text
                        resultsDisplay = `📋 ${test.results}`;
                      }
                    } else if (test.status === 'Completed') {
                      resultsDisplay = '⏳ Results being processed';
                      statusClass = 'status-processing';
                    } else if (test.status === 'In Progress') {
                      resultsDisplay = '🔬 Test in progress';
                      statusClass = 'status-progress';
                    } else {
                      resultsDisplay = '⏳ Test pending';
                      statusClass = 'status-pending';
                    }
                    
                    return `
                    <tr>
                      <td>${test.test_date ? format(new Date(test.test_date), 'MMM dd, yyyy') : (test.created_at ? format(new Date(test.created_at), 'MMM dd, yyyy') : 'N/A')}</td>
                      <td><strong>${test.test_name || 'N/A'}</strong></td>
                      <td>Dr. ${test.doctor?.name || test.doctor?.full_name || 'Unknown'}</td>
                      <td class="${statusClass}"><strong>${test.status || 'Pending'}</strong></td>
                      <td>${resultsDisplay}</td>
                    </tr>
                  `;
                  }).join('') : '<tr><td colspan="5" style="text-align: center; color: #6b7280; padding: 20px;"><em>No laboratory tests recorded for this patient</em></td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="confidential">
              ⚠️ CONFIDENTIAL MEDICAL INFORMATION ⚠️<br>
              This report contains confidential medical information protected by privacy laws.<br>
              Unauthorized disclosure is prohibited and may result in legal action.
            </div>

            <div class="footer">
              <div class="footer-content">
                <div>
                  <strong>Hospital Management System</strong><br>
                  Medical History Report
                </div>
                <div>
                  Patient: ${patient.full_name}<br>
                  Reference: ${patient.id.substring(0, 8).toUpperCase()}...
                </div>
                <div>
                  Generated: ${new Date().toLocaleDateString()}<br>
                  Time: ${new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, `Medical History - ${patient.full_name}`);
    } catch (error) {

      toast.error('Failed to generate medical report');
    }
  };

  const printFinancialOnlyReport = async (patient: any, fromDate?: string, toDate?: string) => {
    try {
      // Validate patient ID
      if (!patient?.id) {
        toast.error('Invalid patient selected for financial report');
        return;
      }

      // Build API URLs with date filters if provided
      const buildDateQuery = (baseUrl: string) => {
        const params = new URLSearchParams();
        params.append('patient_id', patient.id);
        if (fromDate) params.append('from', fromDate);
        if (toDate) params.append('to', toDate);
        return `${baseUrl}?${params.toString()}`;
      };

      const [paymentsResponse, invoicesResponse] = await Promise.all([
        api.get(buildDateQuery('/payments')),
        api.get(buildDateQuery('/billing/invoices'))
      ]);
      
      const patientPayments = paymentsResponse.data.payments || [];
      const patientInvoices = (invoicesResponse.data.invoices || []).filter(invoice => invoice); // Add null check

      // Verify data belongs to correct patient
      const invalidPayments = patientPayments.filter(p => p.patient_id !== patient.id);
      const invalidInvoices = patientInvoices.filter(i => i.patient_id !== patient.id);
      
      if (invalidPayments.length > 0 || invalidInvoices.length > 0) {

        toast.warning('Some data may not belong to this patient. Check console for details.');
      }

      const totalPaid = patientPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      const totalInvoiced = patientInvoices.reduce((sum, invoice) => sum + Number(invoice.total_amount || 0), 0);
      const totalBalance = patientInvoices.reduce((sum, invoice) => sum + Number((invoice.total_amount || 0) - (invoice.paid_amount || 0)), 0);
      
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Financial Summary - ${patient.full_name}</title>
            ${getReportStyles()}
          </head>
          <body>
            ${getHospitalHeader()}
            
            <div class="page-title">
              <h1>FINANCIAL SUMMARY REPORT</h1>
              <h2>${patient.full_name}</h2>
              <p>Complete Financial History</p>
            </div>
            
            <div class="patient-info">
              <h3>👤 Patient Information</h3>
              <div class="patient-details">
                <p><strong>Full Name:</strong> ${patient.full_name}</p>
                <p><strong>Patient ID:</strong> ${patient.id.substring(0, 8)}...</p>
                <p><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p><strong>Email:</strong> ${patient.email || 'N/A'}</p>
              </div>
            </div>

            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-number">TSh ${totalInvoiced.toFixed(2)}</div>
                <div>Total Invoiced</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">TSh ${totalPaid.toFixed(2)}</div>
                <div>Total Paid</div>
              </div>
              <div class="summary-card">
                <div class="summary-number">TSh ${totalBalance.toFixed(2)}</div>
                <div>Outstanding Balance</div>
              </div>
            </div>

            <div class="section">
              <div class="section-title">💰 Invoice Summary</div>
              <table>
                <thead>
                  <tr>
                    <th>Invoice Date</th>
                    <th>Services</th>
                    <th>Total Amount</th>
                    <th>Paid Amount</th>
                    <th>Balance</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientInvoices.length > 0 ? patientInvoices.map(invoice => `
                    <tr>
                      <td>${invoice.invoice_date ? format(new Date(invoice.invoice_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td><strong>${getInvoiceServiceDescription(invoice)}</strong></td>
                      <td class="amount">TSh ${Number(invoice.total_amount || 0).toFixed(2)}</td>
                      <td class="amount">TSh ${Number(invoice.paid_amount || 0).toFixed(2)}</td>
                      <td class="amount">TSh ${Number((invoice.total_amount || 0) - (invoice.paid_amount || 0)).toFixed(2)}</td>
                      <td>${invoice.status || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="6" style="text-align: center;">No invoices recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="section">
              <div class="section-title">💳 Payment History</div>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Amount</th>
                    <th>Payment Method</th>
                    <th>Reference Number</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientPayments.length > 0 ? patientPayments.map(payment => `
                    <tr>
                      <td>${payment.payment_date ? format(new Date(payment.payment_date), 'MMM dd, yyyy HH:mm') : 'N/A'}</td>
                      <td class="amount">TSh ${Number(payment.amount || 0).toFixed(2)}</td>
                      <td>${payment.payment_method || 'N/A'}</td>
                      <td>${payment.reference_number || 'N/A'}</td>
                      <td>${payment.status || 'N/A'}</td>
                    </tr>
                  `).join('') : '<tr><td colspan="5" style="text-align: center;">No payments recorded</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="confidential">
              ⚠️ CONFIDENTIAL FINANCIAL INFORMATION ⚠️<br>
              This report contains confidential financial information protected by privacy laws.<br>
              Unauthorized disclosure is prohibited and may result in legal action.
            </div>

            <div class="footer">
              <div class="footer-content">
                <div>
                  <strong>Hospital Management System</strong><br>
                  Financial Summary Report
                </div>
                <div>
                  Patient: ${patient.full_name}<br>
                  Reference: ${patient.id.substring(0, 8).toUpperCase()}...
                </div>
                <div>
                  Generated: ${new Date().toLocaleDateString()}<br>
                  Time: ${new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, `Financial Summary - ${patient.full_name}`);
    } catch (error) {

      toast.error('Failed to generate financial report');
    }
  };

  const printPrescriptionsOnlyReport = async (patient: any, fromDate?: string, toDate?: string) => {
    try {
      // Validate patient ID
      if (!patient?.id) {
        toast.error('Invalid patient selected for prescriptions report');
        return;
      }

      // Build API URL with date filters if provided
      const params = new URLSearchParams();
      params.append('patient_id', patient.id);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      const queryString = params.toString();

      const prescriptionsResponse = await api.get(`/prescriptions?${queryString}`);
      const patientPrescriptions = prescriptionsResponse.data.prescriptions || [];

      // Verify data belongs to correct patient
      const invalidPrescriptions = patientPrescriptions.filter(p => p.patient_id !== patient.id);
      
      if (invalidPrescriptions.length > 0) {

        toast.warning('Some prescription data may not belong to this patient. Check console for details.');
      }
      
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Prescription History - ${patient.full_name}</title>
            ${getReportStyles()}
          </head>
          <body>
            ${getHospitalHeader()}
            
            <div class="page-title">
              <h1>PRESCRIPTION HISTORY REPORT</h1>
              <h2>${patient.full_name}</h2>
              <p>Complete Prescription and Medication History</p>
            </div>
            
            <div class="patient-info">
              <h3>👤 Patient Information</h3>
              <div class="patient-details">
                <p><strong>Full Name:</strong> ${patient.full_name}</p>
                <p><strong>Patient ID:</strong> ${patient.id.substring(0, 8)}...</p>
                <p><strong>Date of Birth:</strong> ${patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMMM dd, yyyy') : 'N/A'}</p>
                <p><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p><strong>Total Prescriptions:</strong> ${patientPrescriptions.length}</p>
              </div>
            </div>

            <div class="section">
              <div class="section-title">💊 Detailed Prescription History</div>
              ${patientPrescriptions.length > 0 ? patientPrescriptions.map((prescription, index) => `
                <div style="margin-bottom: 25px; border: 1px solid #d1d5db; border-radius: 6px; padding: 15px;">
                  <h4 style="margin: 0 0 10px 0; color: #5b21b6;">Prescription #${index + 1}</h4>
                  <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px; margin-bottom: 15px;">
                    <p><strong>Date:</strong> ${prescription.prescription_date ? format(new Date(prescription.prescription_date), 'MMM dd, yyyy') : 'N/A'}</p>
                    <p><strong>Doctor:</strong> ${prescription.doctor_profile?.name || 'Unknown'}</p>
                    <p><strong>Diagnosis:</strong> ${prescription.diagnosis || 'N/A'}</p>
                    <p><strong>Status:</strong> ${prescription.status || 'N/A'}</p>
                  </div>
                  ${prescription.items && prescription.items.length > 0 ? `
                    <table style="width: 100%; border-collapse: collapse; margin-top: 10px;">
                      <thead>
                        <tr style="background-color: #f8fafc;">
                          <th style="border: 1px solid #d1d5db; padding: 8px;">Medication</th>
                          <th style="border: 1px solid #d1d5db; padding: 8px;">Dosage</th>
                          <th style="border: 1px solid #d1d5db; padding: 8px;">Frequency</th>
                          <th style="border: 1px solid #d1d5db; padding: 8px;">Duration</th>
                          <th style="border: 1px solid #d1d5db; padding: 8px;">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        ${prescription.items.map(item => `
                          <tr>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">${item.medication_name || 'N/A'}</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">${item.dosage || 'N/A'}</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">${item.frequency || 'N/A'}</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">${item.duration || 'N/A'}</td>
                            <td style="border: 1px solid #d1d5db; padding: 8px;">${item.quantity || 'N/A'}</td>
                          </tr>
                        `).join('')}
                      </tbody>
                    </table>
                  ` : '<p style="color: #6b7280; font-style: italic;">No medications listed</p>'}
                  ${prescription.notes ? `<p style="margin-top: 10px;"><strong>Notes:</strong> ${prescription.notes}</p>` : ''}
                </div>
              `).join('') : '<p style="text-align: center; color: #6b7280;">No prescriptions recorded for this patient</p>'}
            </div>

            <div class="confidential">
              ⚠️ CONFIDENTIAL MEDICAL INFORMATION ⚠️<br>
              This report contains confidential prescription information protected by privacy laws.<br>
              Unauthorized disclosure is prohibited and may result in legal action.
            </div>

            <div class="footer">
              <div class="footer-content">
                <div>
                  <strong>Hospital Management System</strong><br>
                  Prescription History Report
                </div>
                <div>
                  Patient: ${patient.full_name}<br>
                  Total Prescriptions: ${patientPrescriptions.length}
                </div>
                <div>
                  Generated: ${new Date().toLocaleDateString()}<br>
                  Time: ${new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, `Prescription History - ${patient.full_name}`);
    } catch (error) {

      toast.error('Failed to generate prescription report');
    }
  };

  const printLabResultsOnlyReport = async (patient: any, fromDate?: string, toDate?: string) => {
    try {
      // Validate patient ID
      if (!patient?.id) {
        toast.error('Invalid patient selected for lab results report');
        return;
      }

      // Build API URL with date filters if provided
      const params = new URLSearchParams();
      params.append('patient_id', patient.id);
      if (fromDate) params.append('from', fromDate);
      if (toDate) params.append('to', toDate);
      const queryString = params.toString();

      const labTestsResponse = await api.get(`/lab-tests?${queryString}`);
      const patientLabTests = labTestsResponse.data.labTests || [];

      // Verify data belongs to correct patient
      const invalidLabTests = patientLabTests.filter(l => l.patient_id !== patient.id);
      
      if (invalidLabTests.length > 0) {

        toast.warning('Some lab test data may not belong to this patient. Check console for details.');
      }
      
      const printContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <title>Laboratory Results - ${patient.full_name}</title>
            ${getReportStyles()}
          </head>
          <body>
            ${getHospitalHeader()}
            
            <div class="page-title">
              <h1>LABORATORY RESULTS REPORT</h1>
              <h2>${patient.full_name}</h2>
              <p>Complete Laboratory Test History and Results</p>
            </div>
            
            <div class="patient-info">
              <h3>👤 Patient Information</h3>
              <div class="patient-details">
                <p><strong>Full Name:</strong> ${patient.full_name}</p>
                <p><strong>Patient ID:</strong> ${patient.id.substring(0, 8)}...</p>
                <p><strong>Date of Birth:</strong> ${patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMMM dd, yyyy') : 'N/A'}</p>
                <p><strong>Phone:</strong> ${patient.phone || 'N/A'}</p>
                <p><strong>Total Lab Tests:</strong> ${patientLabTests.length}</p>
              </div>
            </div>

            <div class="section">
              <div class="section-title">🧪 Laboratory Test Results</div>
              <table>
                <thead>
                  <tr>
                    <th>Test Date</th>
                    <th>Test Name</th>
                    <th>Ordering Doctor</th>
                    <th>Status</th>
                    <th>Results</th>
                    <th>Normal Range</th>
                    <th>Completed Date</th>
                  </tr>
                </thead>
                <tbody>
                  ${patientLabTests.length > 0 ? patientLabTests.map(test => {
                    let resultsDisplay = 'Pending';
                    if (test.results) {
                      try {
                        const parsedResults = typeof test.results === 'string' ? JSON.parse(test.results) : test.results;
                        if (parsedResults.results) {
                          // Format the results nicely for detailed report
                          const resultEntries = Object.entries(parsedResults.results).map(([key, value]: [string, any]) => {
                            return `<strong>${key}:</strong> ${value.value} ${value.unit || ''} <em>(${value.status || 'N/A'})</em>`;
                          }).join('<br>');
                          resultsDisplay = resultEntries;
                          
                          // Add interpretation if available
                          if (parsedResults.interpretation) {
                            resultsDisplay += `<br><br><strong>Interpretation:</strong> ${parsedResults.interpretation}`;
                          }
                        } else if (parsedResults.interpretation) {
                          resultsDisplay = parsedResults.interpretation;
                        } else {
                          resultsDisplay = 'Results available';
                        }
                      } catch (e) {
                        // If not JSON, display as text
                        resultsDisplay = test.results;
                      }
                    }
                    
                    return `
                    <tr>
                      <td>${test.test_date ? format(new Date(test.test_date), 'MMM dd, yyyy') : 'N/A'}</td>
                      <td><strong>${test.test_name || 'N/A'}</strong></td>
                      <td>${test.doctor?.name || test.doctor?.full_name || 'Unknown'}</td>
                      <td class="status-${(test.status || 'pending').toLowerCase()}">${test.status || 'Pending'}</td>
                      <td style="font-size: 12px;">${resultsDisplay}</td>
                      <td>${test.normal_range || 'N/A'}</td>
                      <td>${test.completed_at ? format(new Date(test.completed_at), 'MMM dd, yyyy') : 'N/A'}</td>
                    </tr>
                  `;
                  }).join('') : '<tr><td colspan="7" style="text-align: center; color: #6b7280;">No lab tests recorded for this patient</td></tr>'}
                </tbody>
              </table>
            </div>

            <div class="confidential">
              ⚠️ CONFIDENTIAL MEDICAL INFORMATION ⚠️<br>
              This report contains confidential laboratory results protected by privacy laws.<br>
              Unauthorized disclosure is prohibited and may result in legal action.
            </div>

            <div class="footer">
              <div class="footer-content">
                <div>
                  <strong>Hospital Management System</strong><br>
                  Laboratory Results Report
                </div>
                <div>
                  Patient: ${patient.full_name}<br>
                  Total Tests: ${patientLabTests.length}
                </div>
                <div>
                  Generated: ${new Date().toLocaleDateString()}<br>
                  Time: ${new Date().toLocaleTimeString()}
                </div>
              </div>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, `Laboratory Results - ${patient.full_name}`);
    } catch (error) {

      toast.error('Failed to generate lab results report');
    }
  };

  const printLabTestsReport = async () => {
    try {
      const response = await api.get('/lab-tests');
      const allLabTests = response.data.labTests || [];
      
      const pendingTests = allLabTests.filter(test => test.status === 'Pending');
      const completedTests = allLabTests.filter(test => test.status === 'Completed');
      const inProgressTests = allLabTests.filter(test => test.status === 'In Progress');
      
      const printContent = `
        <html>
          <head>
            <title>Laboratory Tests Report</title>
            <style>
              body { font-family: Arial, sans-serif; margin: 20px; }
              .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
              .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
              .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin-bottom: 30px; }
              .summary-card { border: 1px solid #ddd; padding: 15px; border-radius: 5px; text-align: center; }
              .summary-number { font-size: 20px; font-weight: bold; color: #2563eb; }
              .pending { color: #f59e0b; }
              .completed { color: #10b981; }
              .in-progress { color: #3b82f6; }
              table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
              th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
              th { background-color: #f5f5f5; font-weight: bold; }
              .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>Laboratory Tests Report</h1>
              <h3>Complete Lab Activities Overview</h3>
            </div>
            <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            })}</div>
            
            <div class="summary-grid">
              <div class="summary-card">
                <div class="summary-number">${allLabTests.length}</div>
                <div>Total Tests</div>
              </div>
              <div class="summary-card">
                <div class="summary-number pending">${pendingTests.length}</div>
                <div>Pending Tests</div>
              </div>
              <div class="summary-card">
                <div class="summary-number in-progress">${inProgressTests.length}</div>
                <div>In Progress</div>
              </div>
              <div class="summary-card">
                <div class="summary-number completed">${completedTests.length}</div>
                <div>Completed Tests</div>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Test Date</th>
                  <th>Patient Name</th>
                  <th>Test Name</th>
                  <th>Doctor</th>
                  <th>Status</th>
                  <th>Results</th>
                  <th>Completed Date</th>
                </tr>
              </thead>
              <tbody>
                ${allLabTests.map(test => {
                  let resultsDisplay = 'Pending';
                  if (test.results) {
                    try {
                      const parsedResults = typeof test.results === 'string' ? JSON.parse(test.results) : test.results;
                      if (parsedResults.results) {
                        // Show summary for general report
                        const resultCount = Object.keys(parsedResults.results).length;
                        resultsDisplay = `${resultCount} result(s) available`;
                      } else if (parsedResults.interpretation) {
                        resultsDisplay = 'Results with interpretation';
                      } else {
                        resultsDisplay = 'Results available';
                      }
                    } catch (e) {
                      resultsDisplay = 'Results available';
                    }
                  }
                  
                  return `
                  <tr>
                    <td>${test.test_date ? format(new Date(test.test_date), 'MMM dd, yyyy') : 'N/A'}</td>
                    <td>${test.patient?.full_name || 'Unknown'}</td>
                    <td>${test.test_name || 'N/A'}</td>
                    <td>${test.doctor?.name || test.doctor?.full_name || 'Unknown'}</td>
                    <td class="${test.status?.toLowerCase() || 'pending'}">${test.status || 'Pending'}</td>
                    <td>${resultsDisplay}</td>
                    <td>${test.completed_at ? format(new Date(test.completed_at), 'MMM dd, yyyy') : 'N/A'}</td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>

            <div class="footer">
              <p>Hospital Management System - Laboratory Tests Report</p>
              <p>Total: ${allLabTests.length} | Pending: ${pendingTests.length} | In Progress: ${inProgressTests.length} | Completed: ${completedTests.length}</p>
            </div>
          </body>
        </html>
      `;
      
      handlePrint(printContent, 'Laboratory Tests Report');
    } catch (error) {

      toast.error('Failed to generate lab tests report');
    }
  };

  const updateClaimStatus = async (claimId: string, newStatus: string, approvedAmount?: number) => {
    try {
      // Find the claim for context
      const claim = insuranceClaims.find(c => c.id === claimId);

      await api.put(`/insurance/claims/${claimId}`, {
        status: newStatus,
        approved_amount: approvedAmount ?? undefined,
        approval_date: ['Approved', 'Paid'].includes(newStatus) ? new Date().toISOString().split('T')[0] : undefined,
        payment_date: newStatus === 'Paid' ? new Date().toISOString().split('T')[0] : undefined,
      });

      setInsuranceClaims(prev => prev.map(c => c.id === claimId
        ? { ...c, status: newStatus, approved_amount: approvedAmount ?? c.approved_amount,
            approval_date: ['Approved','Paid'].includes(newStatus) ? new Date().toISOString() : c.approval_date,
            payment_date: newStatus === 'Paid' ? new Date().toISOString() : c.payment_date }
        : c
      ));

      toast.success(`Claim ${newStatus.toLowerCase()} successfully`);

      // ── When claim is marked Paid → automate Stellar + Soroban ──────────
      if (newStatus === 'Paid' && claim) {
        const paidAmount = approvedAmount ?? Number(claim.claim_amount);
        const insuranceNumber = claim.patient?.insurance_number;
        const patientId = claim.patient_id || claim.patient?.id;

        try {
          // 1. Register insurance on Soroban contract (idempotent — safe to call each time)
          if (insuranceNumber && patientId) {
            await api.post('/contract/register-insurance', {
              patient_id: patientId,
              insurance_number: insuranceNumber,
            }).catch(() => {}); // non-blocking if already registered
          }

          // 2. Create a payment record for this insurance claim
          const paymentRes = await api.post('/payments', {
            patient_id: patientId,
            invoice_id: claim.invoice_id ?? undefined,
            amount: paidAmount,
            payment_method: 'Insurance',
            payment_type: 'Insurance Claim',
            payment_date: new Date().toISOString(),
            reference_number: claim.claim_number,
            notes: `Insurance payment for claim ${claim.claim_number}`,
            status: 'Completed',
          });

          const paymentId: string | null = paymentRes.data?.payment?.id ?? null;

          if (paymentId) {
            // 3. Bridge to Stellar + trigger Soroban smart contract
            const destWallet = import.meta.env.VITE_HOSPITAL_STELLAR_WALLET
              || 'GCIUVYTB76RWSV2FZ7URYCUPVLUPGWP5THPLO6F4NP6NUINZX4WVDFEW';
            const network = import.meta.env.VITE_STELLAR_NETWORK || 'testnet';

            // Fetch patient's medical record CID if available
            let cid: string | undefined;
            try {
              const recRes = await api.get(`/medical-records?patient_id=${patientId}`);
              const records = recRes.data?.records || recRes.data?.data || [];
              cid = records[0]?.cid_hash ?? undefined;
            } catch { /* no record — Soroban step will be skipped */ }

            const bridgeRes = await api.post(`/bridge/payment/${paymentId}`, {
              destination_wallet: destWallet,
              insurance_number: insuranceNumber,
              doctor_approved: true,   // claim approval = doctor approved
              ...(cid ? { cid } : {}),
            });

            if (bridgeRes.data?.stellar_tx_hash) {
              const txHash: string = bridgeRes.data.stellar_tx_hash;
              const xlm = Number(bridgeRes.data.xlm_amount).toFixed(4);
              const explorerUrl = `https://stellar.expert/explorer/${network}/tx/${txHash}`;
              const sorobanFired = bridgeRes.data?.soroban_released === true;

              toast.success(
                sorobanFired
                  ? `🤝 Smart contract released ${xlm} XLM — tx ${txHash.substring(0, 8)}…`
                  : `⭐ Stellar: ${xlm} XLM — tx ${txHash.substring(0, 8)}…`,
                {
                  duration: 12000,
                  action: { label: 'View on Stellar', onClick: () => window.open(explorerUrl, '_blank') },
                }
              );

              // Patch rawPaymentsData so Today's Payments table shows the link
              setRawPaymentsData(prev => [...prev, {
                ...paymentRes.data.payment,
                stellar_tx_hash: txHash,
                xlm_amount: xlm,
                bridge_status: 'bridged',
              }]);
            }
          }
        } catch (bridgeErr: any) {
          // Bridge/Soroban failure is non-blocking — claim is already marked Paid
          toast.warning('Claim paid, but Stellar bridge failed: ' + (bridgeErr?.response?.data?.error || bridgeErr?.message || 'unknown error'));
        }
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update claim');
    }
  };

  const printInsuranceClaimsReport = () => {
    const printContent = `
      <html>
        <head>
          <title>Insurance Claims Report</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .date { text-align: right; margin-bottom: 20px; font-size: 12px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
            .total { font-weight: bold; background-color: #f9f9f9; }
            .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
            .status-pending { color: #f59e0b; }
            .status-approved { color: #10b981; }
            .status-rejected { color: #ef4444; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Insurance Claims Report</h1>
            <h3>NHIF and Insurance Claims Status</h3>
          </div>
          <div class="date">Generated on: ${new Date().toLocaleDateString('en-US', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}</div>
          <table>
            <thead>
              <tr>
                <th>Claim Number</th>
                <th>Patient Name</th>
                <th>Insurance Company</th>
                <th>Claim Amount</th>
                <th>Submission Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${insuranceClaims.map(claim => `
                <tr>
                  <td>${claim.claim_number || 'N/A'}</td>
                  <td>${claim.patient?.full_name || 'Unknown'}</td>
                  <td>${claim.insurance_company?.name || 'N/A'}</td>
                  <td>TSh ${Number(claim.claim_amount || 0).toFixed(2)}</td>
                  <td>${claim.submission_date ? format(new Date(claim.submission_date), 'MMM dd, yyyy') : 'N/A'}</td>
                  <td class="status-${claim.status?.toLowerCase() || 'pending'}">${claim.status || 'Pending'}</td>
                </tr>
              `).join('')}
              <tr class="total">
                <td colspan="3"><strong>Total Claims Amount</strong></td>
                <td><strong>TSh ${insuranceClaims.reduce((sum, c) => sum + Number(c.claim_amount || 0), 0).toFixed(2)}</strong></td>
                <td colspan="2"></td>
              </tr>
            </tbody>
          </table>
          <div class="footer">
            <p>Hospital Management System - Insurance Claims Report</p>
            <p>Total Claims: ${insuranceClaims.length} | Total Amount: TSh ${insuranceClaims.reduce((sum, c) => sum + Number(c.claim_amount || 0), 0).toFixed(2)}</p>
          </div>
        </body>
      </html>
    `;
    
    handlePrint(printContent, 'Insurance Claims Report');
  };

  const handleOpenPaymentDialog = (invoice: any) => {



    // Check if invoice is wrapped in an object and unwrap it
    let actualInvoice = invoice;
    if (invoice && typeof invoice === 'object' && invoice.invoice) {

      actualInvoice = invoice.invoice;
    }
    
    // Validate invoice has required data
    if (!actualInvoice.id) {
      toast.error('Invalid invoice data. Please refresh and try again.');

      return;
    }
    
    const patientId = actualInvoice.patient_id || actualInvoice.patient?.id;
    if (!patientId) {
      toast.error('Invoice is missing patient information. Please refresh and try again.');

      return;
    }
    
    setSelectedInvoice(actualInvoice);
    
    // Check if patient has insurance - auto-select Insurance payment method
    const patient = patients.find(p => p.id === patientId);
    if (patient?.insurance_company_id) {
      setPaymentMethod('Insurance');
      toast.info('Patient has insurance - Insurance payment method selected');
    } else {
      setPaymentMethod('');
    }
    
    setPaymentStatus('');
    setTransactionId('');
    setMobilePaymentProcessing(false);
    setPaymentDialogOpen(true);
  };

  const handlePayAllInvoices = async (patientData: any) => {
    if (payAllProcessing) return; // Prevent double-clicks
    
    try {
      setPayAllProcessing(true);
      
      const unpaidInvoices = patientData.invoices.filter((inv: any) => inv.status !== 'Paid');
      
      if (unpaidInvoices.length === 0) {
        toast.error('No unpaid invoices found for this patient');
        return;
      }

      if (!payAllPaymentMethod) {
        toast.error('Please select a payment method');
        return;
      }

      const totalAmount = unpaidInvoices.reduce((sum: number, inv: any) => {
        return sum + (Number(inv.total_amount) - Number(inv.paid_amount || 0));
      }, 0);

      // Handle Mobile Money Payment
      if (['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(payAllPaymentMethod)) {
        const phoneInput = document.getElementById('payall_mobile_phone') as HTMLInputElement;
        const phoneNumber = phoneInput?.value;

        if (!phoneNumber) {
          toast.error('Please enter mobile phone number');
          return;
        }

        // Validate phone number format for Tanzania
        const phoneRegex = /^0[67][0-9]{8}$/;
        if (!phoneRegex.test(phoneNumber)) {
          toast.error('Please enter a valid Tanzanian phone number (07xxxxxxxx or 06xxxxxxxx)');
          return;
        }

        // Get patient ID - ensure it's the correct format
        const patientId = patientData.patient?.id;
        if (!patientId) {
          toast.error('Invalid patient information. Please refresh and try again.');
          return;
        }

        // Validate UUID format
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(patientId)) {
          toast.error('Invalid patient ID format. Please refresh and try again.');
          return;
        }

        try {
          toast.info(`Initiating ${payAllPaymentMethod} payment...`);
          
          // Debug: Log the payment request data

          const paymentRequest: MobilePaymentRequest = {
            phoneNumber,
            amount: totalAmount,
            invoiceId: unpaidInvoices[0].id, // Use first invoice ID as reference
            patientId: patientId,
            paymentType: 'Invoice Payment',
            paymentMethod: payAllPaymentMethod as 'M-Pesa' | 'Airtel Money' | 'Tigo Pesa' | 'Halopesa',
            description: `Bulk payment for ${unpaidInvoices.length} invoices - Patient: ${patientData.patient.full_name}`
          };

          const response = await mobilePaymentService.initiatePayment(paymentRequest);

          if (response.success && response.transactionId) {
            toast.success(`📱 ${payAllPaymentMethod} payment request sent to ${phoneNumber}. Payment will be processed automatically.`);
            
            // Close dialog
            setPayAllDialogOpen(false);
            setSelectedPatientForPayAll(null);
            setPayAllPaymentMethod('');
            
            // Refresh data after a short delay
            setTimeout(() => {
              fetchData(false);
            }, 2000);
            
            return;
          } else {
            toast.error(response.message || 'Failed to initiate mobile payment');
            return;
          }
        } catch (error: any) {

          toast.error(error.response?.data?.message || error.message || 'Failed to initiate mobile money payment');
          return;
        }
      }

      // For non-mobile payments: Create a combined payment for all unpaid invoices
      const paymentData = {
        patient_id: patientData.patient.id,
        amount: totalAmount,
        payment_method: payAllPaymentMethod,
        payment_date: new Date().toISOString(),
        reference_number: `BULK-${patientData.patient.full_name.replace(/\s+/g, '').substring(0, 8).toUpperCase()}-${Date.now().toString().slice(-6)}`,
        notes: `Bulk payment for ${unpaidInvoices.length} invoices - Patient: ${patientData.patient.full_name}`,
        status: 'Completed',
      };

      // Record the bulk payment
      const bulkPayRes = await api.post('/payments', paymentData);
      const bulkPaymentId: string | null = bulkPayRes.data?.payment?.id ?? null;

      // Update each invoice
      for (const invoice of unpaidInvoices) {
        const remainingAmount = Number(invoice.total_amount) - Number(invoice.paid_amount || 0);
        const newPaidAmount = Number(invoice.paid_amount || 0) + remainingAmount;
        
        await api.put(`/billing/invoices/${invoice.id}`, { 
          paid_amount: newPaidAmount, 
          status: 'Paid' 
        });
      }

      // Log activity
      await logActivity('billing.bulk_payment.received', {
        patient_id: patientData.patient.id,
        amount: totalAmount,
        invoice_count: unpaidInvoices.length,
        payment_method: payAllPaymentMethod
      });

      toast.success(`Bulk payment of TSh${totalAmount.toFixed(2)} recorded for ${unpaidInvoices.length} invoices!`);

      // ── Auto-bridge bulk payment to Stellar ──────────────────────────────
      if (bulkPaymentId) {
        try {
          await bridgeToStellar(bulkPaymentId);
        } catch {
          // Non-blocking
        }
      }
      
      // Refresh data
      fetchData(false);
      setPayAllDialogOpen(false);
      setSelectedPatientForPayAll(null);
      setPayAllPaymentMethod('');

    } catch (error: any) {

      toast.error(error.message || 'Failed to process bulk payment');
    } finally {
      setPayAllProcessing(false);
    }
  };

  const handleCreateInvoice = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    if (!selectedPatientId) {
      toast.error('Please select a patient');
      return;
    }

    // Get patient services for invoice items (exclude consultation - already paid at registration)
    const patientServicesList = patientServices.filter((s: any) => {
      if (s.patient_id !== selectedPatientId) return false;
      
      // Exclude consultation services (already paid at registration)
      const serviceType = s.service?.service_type || '';
      const isConsultation = serviceType.toLowerCase().includes('consultation');
      return !isConsultation;
    });

    // Calculate total cost from actual services (no fallback)
    let calculatedCost = 0;
    const invoiceItems = [];

    for (const service of patientServicesList) {
      const unitPrice = Number(service.service?.base_price || service.unit_price || service.price || 0);
      const quantity = Number(service.quantity || 1);
      const totalPrice = Number(service.total_price || (unitPrice * quantity));
      
      if (unitPrice <= 0) {

        // Set a default price for services without pricing
        const defaultPrice = service.service?.service_type?.toLowerCase().includes('lab') ? 5000 : 2000;
        calculatedCost += defaultPrice * quantity;
        
        invoiceItems.push({
          service_id: service.service_id,
          service_name: service.service?.service_name || service.service_name || 'Medical Service',
          description: `${service.service?.service_name || service.service_name || 'Medical Service'} (Default pricing applied)`,
          quantity: quantity,
          unit_price: defaultPrice,
          total_price: defaultPrice * quantity
        });
      } else {
        calculatedCost += totalPrice;
        
        invoiceItems.push({
          service_id: service.service_id,
          service_name: service.service?.service_name || service.service_name || 'Medical Service',
          description: service.service?.service_name || service.service_name || 'Medical Service',
          quantity: quantity,
          unit_price: unitPrice,
          total_price: totalPrice
        });
      }
    }

    // Ensure we have services to bill
    if (patientServicesList.length === 0) {
      toast.error('No billable services found for this patient. Please ensure services have been added.');
      return;
    }

    if (calculatedCost <= 0) {
      toast.error('Total amount must be greater than zero. Please check service pricing.');
      return;
    }

    const invoiceNumber = await generateInvoiceNumber();

    const invoiceData = {
      invoice_number: invoiceNumber,
      patient_id: selectedPatientId,
      total_amount: calculatedCost,
      paid_amount: 0,
      status: 'Pending',
      invoice_date: new Date().toISOString().split('T')[0], // Send as date only (YYYY-MM-DD)
      due_date: formData.get('dueDate') as string || null,
      notes: formData.get('notes') as string || `Invoice for ${invoiceItems.length} service(s) - Patient: ${patients.find(p => p.id === selectedPatientId)?.full_name || 'Unknown'} - Services: ${invoiceItems.map(item => item.service_name).join(', ')} - Total: TSh${calculatedCost.toFixed(2)}`,
      items: invoiceItems
    };

    try {
      const invoiceRes = await api.post('/billing/invoices', invoiceData);
      const createdInvoice = invoiceRes.data.invoice;

      // Update the patient's visit to mark billing as completed
      try {
        const visitsRes = await api.get(`/visits?patient_id=${selectedPatientId}&current_stage=billing&overall_status=Active&limit=1`);
        const visits = visitsRes.data.visits;
        
        if (visits && visits.length > 0) {
          const visit = visits[0];
          await api.put(`/visits/${visit.id}`, {
            billing_status: 'Completed',
            billing_completed_at: new Date().toISOString(),
            current_stage: 'completed',
            overall_status: 'Completed',
            updated_at: new Date().toISOString()
          });

          // Remove from billingVisits list
          setBillingVisits(prev => prev.filter(v => v.id !== visit.id));
        }
      } catch (visitError) {

        // Don't fail the whole operation if visit update fails
      }
      
      toast.success(`Invoice created for ${getInvoiceServiceDescription(createdInvoice)} - TSh${calculatedCost.toFixed(2)} (${invoiceItems.length} items)`);
      setDialogOpen(false);
      setSelectedPatientId('');
      
      // Add new invoice to local state
      setRawInvoicesData(prev => [...prev, createdInvoice]);
    } catch (error: any) {

      toast.error(`Failed to create invoice: ${error.message}`);
    }
  };

  const handleInitiateMobilePayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedInvoice) return;

    // Handle case where selectedInvoice might be wrapped in an object
    let actualInvoice = selectedInvoice;
    if (selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.invoice) {

      actualInvoice = selectedInvoice.invoice;
    }

    const formData = new FormData(e.currentTarget);
    const phoneNumber = formData.get('phoneNumber') as string;
    const amount = Number(formData.get('amount'));

    // Validate amount
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    const maxAmount = Number(actualInvoice.total_amount as number) - Number(actualInvoice.paid_amount as number || 0);
    if (amount > maxAmount) {
      toast.error(`Payment amount cannot exceed remaining balance of TSh${maxAmount.toFixed(2)}`);
      return;
    }

    // Validate phone number format for Tanzania
    const phoneRegex = /^0[67][0-9]{8}$/;
    if (!phoneRegex.test(phoneNumber)) {
      toast.error('Please enter a valid Tanzanian phone number (07xxxxxxxx or 06xxxxxxxx)');
      return;
    }

    setMobilePaymentProcessing(true);
    setPaymentStatus('processing');

    // Validate patient_id before initiating mobile payment
    let patientId;
    if (selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.invoice) {
      patientId = selectedInvoice.patientId || actualInvoice.patient_id || actualInvoice.patient?.id;
    } else {
      patientId = actualInvoice.patient_id || actualInvoice.patient?.id;
    }
    
    // If still no patient_id, try to find it from the patients array using invoice data
    if (!patientId && actualInvoice.patient) {
      const foundPatient = patients.find(p => 
        p.full_name === actualInvoice.patient.full_name || 
        p.phone === actualInvoice.patient.phone
      );
      if (foundPatient) {
        patientId = foundPatient.id;

      }
    }
    
    if (!patientId) {
      toast.error('Invalid patient information. Please refresh and try again.');

      setMobilePaymentProcessing(false);
      setPaymentStatus('');
      return;
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(patientId)) {
      toast.error('Invalid patient ID format. Please refresh and try again.');

      setMobilePaymentProcessing(false);
      setPaymentStatus('');
      return;
    }

    // Validate that patient_id matches invoice's patient_id
    if (patientId !== actualInvoice.patient_id) {
      toast.error('Patient ID mismatch with invoice. Please refresh and try again.');

      setMobilePaymentProcessing(false);
      setPaymentStatus('');
      return;
    }

    try {
      const paymentRequest: MobilePaymentRequest = {
        phoneNumber,
        amount,
        invoiceId: actualInvoice.id,
        patientId: patientId,
        paymentType: 'Invoice Payment',
        paymentMethod: paymentMethod as 'M-Pesa' | 'Airtel Money' | 'Tigo Pesa' | 'Halopesa',
        description: `Payment for ${getInvoiceServiceDescription(actualInvoice)} - Patient: ${actualInvoice.patient?.full_name || 'Unknown'}`
      };

      const response = await mobilePaymentService.initiatePayment(paymentRequest);

      if (response.success && response.transactionId) {
        toast.success(`📱 ${paymentMethod} payment request sent to ${phoneNumber}. Payment will be processed automatically.`);

        // Payment record is created by backend ZenoPay controller
        // Webhook will handle completion in background

        // Close dialog
        setPaymentDialogOpen(false);
        setSelectedInvoice(null);
        setPaymentMethod('');
        
        // Refresh data after a short delay to show updated payment
        setTimeout(() => {
          fetchData(false);
        }, 2000);

      } else {
        setPaymentStatus('failed');
        toast.error(response.message || 'Failed to initiate mobile payment');
      }
    } catch (error) {

      setPaymentStatus('failed');
      toast.error('Failed to process mobile payment');
    } finally {
      setMobilePaymentProcessing(false);
    }
  };

  const checkPaymentStatus = async (transactionId: string) => {
    try {
      // Check payment status via ZenoPay endpoint
      const response = await mobilePaymentService.checkPaymentStatus(transactionId);

      if (response.success && response.status === 'completed') {
        setPaymentStatus('completed');
        toast.success('✅ Payment confirmed successfully!');

        // Refresh data to show updated invoice
        fetchData(false);

        // Reset state after a delay
        setTimeout(() => {
          setPaymentStatus('');
          setTransactionId('');
          setSelectedInvoice(null);
          setPaymentMethod('');
        }, 3000);
      } else if (response.status === 'failed') {
        setPaymentStatus('failed');
        toast.error('❌ Payment failed');
      } else {
        // Still pending, check again after a delay
        setTimeout(() => checkPaymentStatus(transactionId), 10000);
      }
    } catch (error) {

    }
  };

  const updateInvoiceAfterPayment = async (invoiceId: string, amount: number) => {
    try {
      let invoice;
      try {
        const invoiceRes = await api.get(`/billing/invoices/${invoiceId}`);
        invoice = invoiceRes.data.invoice;
      } catch (error) {

        return;
      }

      if (invoice) {
        // Note: Invoice is automatically updated by PaymentController when payment is created
        // We just need to check the current status for visit completion logic
        const newPaidAmount = Number(invoice.paid_amount) + amount;
        const totalAmount = Number(invoice.total_amount);
        const newStatus = newPaidAmount >= totalAmount ? 'Paid' : newPaidAmount > 0 ? 'Partially Paid' : 'Unpaid';

        // If fully paid, complete the visit
        if (newStatus === 'Paid') {
          // In a real implementation, we would fetch the patient_id from the invoice
          // For now, we'll assume it's available in the invoice object
          const patientId = invoice.patient_id;

          if (patientId) {
            let visits;
            try {
              const visitsRes = await api.get(`/visits?patient_id=${patientId}&current_stage=billing&overall_status=Active&limit=1`);
              visits = visitsRes.data.visits;
            } catch (error) {

              visits = [];
            }

            if (visits && visits.length > 0) {
              try {
                await api.put(`/visits/${visits[0].id}`, {
                  billing_status: 'Paid',
                  billing_completed_at: new Date().toISOString(),
                  current_stage: 'completed',
                  overall_status: 'Completed',
                  updated_at: new Date().toISOString()
                });

              } catch (error) {

              }
            }
          }
        }
      }
    } catch (error) {

    }
  };

  // ── Shared Stellar bridge helper ─────────────────────────────────────────
  const bridgeToStellar = async (paymentId: string) => {
    const destWallet = import.meta.env.VITE_HOSPITAL_STELLAR_WALLET
      || 'GCIUVYTB76RWSV2FZ7URYCUPVLUPGWP5THPLO6F4NP6NUINZX4WVDFEW';
    const network = import.meta.env.VITE_STELLAR_NETWORK || 'testnet';

    const bridgeRes = await api.post(`/bridge/payment/${paymentId}`, {
      destination_wallet: destWallet,
    });

    if (bridgeRes.data?.stellar_tx_hash) {
      const txHash: string = bridgeRes.data.stellar_tx_hash;
      const xlm = Number(bridgeRes.data.xlm_amount).toFixed(4);
      const explorerUrl = `https://stellar.expert/explorer/${network}/tx/${txHash}`;

      toast.success(`⭐ Stellar: ${xlm} XLM — tx ${txHash.substring(0, 8)}…`, {
        duration: 10000,
        action: { label: 'View on Stellar', onClick: () => window.open(explorerUrl, '_blank') },
      });

      // Patch rawPaymentsData so the Today's Payments table shows the link immediately
      setRawPaymentsData(prev => prev.map(p =>
        p.id === paymentId
          ? { ...p, stellar_tx_hash: txHash, xlm_amount: xlm, bridge_status: 'bridged' }
          : p
      ));

      return { txHash, xlm };
    }
    return null;
  };

  const handleRecordPayment = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Debug: Log selectedInvoice at the start of form submission



    // Handle mobile payments separately
    if (['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentMethod)) {
      return handleInitiateMobilePayment(e);
    }

    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));

    // Validate amount
    if (!amount || amount <= 0) {
      toast.error('Please enter a valid payment amount');
      return;
    }

    if (!selectedInvoice) {
      toast.error('No invoice selected');
      return;
    }

    // Validate patient_id before sending payment
    let patientId;
    let actualInvoice = selectedInvoice;
    
    // Handle case where selectedInvoice might be wrapped in an object
    if (selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.invoice) {

      actualInvoice = selectedInvoice.invoice;
      patientId = selectedInvoice.patientId || actualInvoice.patient_id || actualInvoice.patient?.id;
    } else {
      patientId = selectedInvoice.patient_id || selectedInvoice.patient?.id;
    }

    // Debug: Log patient ID extraction




    const maxAmount = Number(actualInvoice.total_amount as number) - Number(actualInvoice.paid_amount as number || 0);
    if (amount > maxAmount) {
      toast.error(`Payment amount cannot exceed remaining balance of TSh${maxAmount.toFixed(2)}`);
      return;
    }
    
    // If still no patient_id, try to find it from the patients array using invoice data
    if (!patientId && actualInvoice.patient) {
      const foundPatient = patients.find(p => 
        p.full_name === actualInvoice.patient.full_name || 
        p.phone === actualInvoice.patient.phone
      );
      if (foundPatient) {
        patientId = foundPatient.id;

      }
    }
    
    if (!patientId) {
      toast.error('Invalid patient information. Please refresh and try again.');

      return;
    }

    // Validate UUID format (basic check)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;



    if (!uuidRegex.test(patientId)) {
      toast.error('Invalid patient ID format. Please refresh and try again.');

      return;
    }

    // Validate that patient_id matches invoice's patient_id
    if (patientId !== actualInvoice.patient_id) {
      toast.error('Patient ID mismatch with invoice. Please refresh and try again.');

      return;
    }

    const paymentData = {
      invoice_id: actualInvoice.id,
      patient_id: patientId,
      amount,
      payment_method: paymentMethod,
      payment_date: new Date().toISOString(),
      reference_number: formData.get('referenceNumber') as string || `PAY-${getInvoiceServiceDescription(actualInvoice).replace(/[^A-Z0-9]/g, '').substring(0, 10)}-${Date.now().toString().slice(-6)}` || null,
      notes: formData.get('notes') as string || `Payment for ${getInvoiceServiceDescription(actualInvoice)} - Patient: ${actualInvoice.patient?.full_name || 'Unknown'}`,
      status: 'Completed',
    };

    let createdPaymentId: string | null = null;

    try {
      const paymentResponse = await api.post('/payments', paymentData);
      createdPaymentId = paymentResponse.data?.payment?.id ?? null;

      // Refresh invoice data to get updated amounts
      const updatedInvoiceResponse = await api.get(`/billing/invoices/${actualInvoice.id}`);
      const updatedInvoice = updatedInvoiceResponse.data.invoice;

      // Update local invoice data
      setRawInvoicesData(prev => prev.map(inv => 
        inv.id === actualInvoice.id ? updatedInvoice : inv
      ));
      
      toast.success(`Payment of TSh${amount.toFixed(2)} recorded successfully!`);
      
    } catch (error: any) {

      const errorMessage = error.response?.data?.message || error.message || 'Failed to record payment';
      toast.error(errorMessage);
      return;
    }

    // Log payment received
    await logActivity('billing.payment.received', {
      invoice_id: actualInvoice.id,
      patient_id: patientId,
      amount: amount,
      payment_method: paymentMethod,
      reference_number: formData.get('referenceNumber') as string || null
    });

    const newPaidAmount = Number(actualInvoice.paid_amount) + amount;
    const totalAmount = Number(actualInvoice.total_amount);
    const newBalance = totalAmount - newPaidAmount;
    const newStatus = newPaidAmount >= totalAmount ? 'Paid' : newPaidAmount > 0 ? 'Partially Paid' : 'Unpaid';

    // Note: Invoice is automatically updated by PaymentController when payment is created
    // No need to update invoice manually here

    // If fully paid, complete the visit
    if (newStatus === 'Paid') {

      if (!patientId) {

        toast.warning('Payment recorded but could not update patient visit - no patient ID');
      } else {
        // First, try to find visit in billing stage
        let visits = [];
        try {
          const visitsRes = await api.get(`/visits?patient_id=${patientId}&current_stage=billing&overall_status=Active&limit=1`);
          visits = visitsRes.data.visits || [];
        } catch (error) {

        }

        // If no visit in billing, try to find ANY active visit for this patient
        if (!visits || visits.length === 0) {

          try {
            const anyVisitsRes = await api.get(`/visits?patient_id=${patientId}&overall_status=Active&limit=1`);
            const anyVisits = anyVisitsRes.data.visits || [];

            // Use the active visit even if not in billing stage
            if (anyVisits && anyVisits.length > 0) {
              visits = anyVisits;

            }
          } catch (error) {

          }
        }

        if (visits && visits.length > 0) {
          try {
            await api.put(`/visits/${visits[0].id}`, {
              billing_status: 'Paid',
              billing_completed_at: new Date().toISOString(),
              current_stage: 'completed',
              overall_status: 'Completed',
              updated_at: new Date().toISOString()
            });

            toast.success('Payment completed! Patient visit finished.');
          } catch (error: any) {

            toast.error(`Failed to update patient visit: ${error.message}`);
          }
        } else {

          // Create a completed visit record for this payment
          try {
            await api.post('/visits', {
              patient_id: selectedInvoice.patient_id,
              visit_date: new Date().toISOString(),
              reception_status: 'Completed',
              nurse_status: 'Completed',
              doctor_status: 'Completed',
              lab_status: 'Not Required',
              pharmacy_status: 'Completed',
              billing_status: 'Paid',
              billing_completed_at: new Date().toISOString(),
              current_stage: 'completed',
              overall_status: 'Completed',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            });

            toast.success('Payment completed successfully!');
          } catch (error: any) {

            toast.warning('Payment recorded successfully (no visit record created)');
          }
        }
      }
    }

    toast.success(`Payment of TSh${amount.toFixed(2)} recorded successfully`);

    // ── Auto-bridge to Stellar ────────────────────────────────────────────
    try {
      const paymentId = createdPaymentId;
      if (paymentId) {
        const result = await bridgeToStellar(paymentId);
        if (result) {
          // Also patch invoice list for the Stellar hash display
          setRawInvoicesData(prev => prev.map(inv =>
            inv.id === actualInvoice.id
              ? { ...inv, stellar_tx_hash: result.txHash, xlm_amount: result.xlm }
              : inv
          ));
        }
      }
    } catch {
      // Bridge failure is non-blocking — payment is still recorded
    }

    setPaymentDialogOpen(false);
    setSelectedInvoice(null);
    setPaymentMethod('');
    
    // Update local state instead of full refresh
    setRawInvoicesData(prev => prev.map(inv => 
      inv.id === actualInvoice.id 
        ? { ...inv, paid_amount: newPaidAmount, balance: newBalance, status: newStatus }
        : inv
    ));
  };

  if (loading) {
    return (
      <DashboardLayout title="Billing Dashboard">
        <div className="space-y-8">
          {/* Stats Cards Skeleton */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i} className="border-destructive/20 shadow-lg">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="h-4 bg-gray-200 rounded animate-pulse w-24" />
                  <div className="h-4 w-4 bg-gray-200 rounded animate-pulse" />
                </CardHeader>
                <CardContent>
                  <div className="h-8 bg-gray-200 rounded animate-pulse w-16" />
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Tabs Skeleton */}
          <div className="space-y-4">
            <div className="grid w-full grid-cols-2 gap-2">
              <div className="h-10 bg-gray-200 rounded animate-pulse" />
              <div className="h-10 bg-gray-200 rounded animate-pulse" />
            </div>

            {/* Invoices Table Skeleton */}
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="h-6 bg-gray-200 rounded animate-pulse w-32" />
                    <div className="h-4 bg-gray-200 rounded animate-pulse w-48" />
                  </div>
                  <div className="h-10 bg-gray-200 rounded animate-pulse w-32" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex space-x-4 pb-2 border-b">
                    {Array.from({ length: 9 }).map((_, i) => (
                      <div key={i} className="h-4 bg-gray-200 rounded animate-pulse flex-1" />
                    ))}
                  </div>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex space-x-4 py-2">
                      {Array.from({ length: 9 }).map((_, j) => (
                        <div key={j} className="h-4 bg-gray-200 rounded animate-pulse flex-1" />
                      ))}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout title="Billing Dashboard">
      <div className="space-y-8">
        {/* Background Refresh Indicator */}
        {refreshing && (
          <div className="fixed top-4 right-4 z-50 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 shadow-sm animate-in slide-in-from-right-2">
            <div className="flex items-center gap-2 text-sm text-blue-700">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span>Updating...</span>
            </div>
          </div>
        )}


        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-destructive/20 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Unpaid Invoices</CardTitle>
              <AlertCircle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.unpaid}</div>
            </CardContent>
          </Card>

          <Card className="border-yellow-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Partially Paid</CardTitle>
              <CreditCard className="h-4 w-4 text-yellow-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-yellow-600">{stats.partiallyPaid}</div>
            </CardContent>
          </Card>

          <Card className="border-blue-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Claims</CardTitle>
              <Shield className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.pendingClaims}</div>
            </CardContent>
          </Card>

          <Card className="border-green-200 shadow-lg">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Today's Revenue</CardTitle>
              <DollarSign className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">
                TSh {stats.todayRevenue.toLocaleString()}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Print Patient Report Button */}
        <div className="flex justify-end mb-4">
          <Button
            onClick={() => setPatientReportDialogOpen(true)}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Printer className="h-4 w-4 mr-2" />
            Print Patient Report
          </Button>
        </div>

        {/* Main Content with Tabs */}
        <Tabs defaultValue="invoices" className="space-y-4">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="invoices">Unpaid Invoices</TabsTrigger>
            <TabsTrigger value="paid">Paid Invoices</TabsTrigger>
            <TabsTrigger value="payments">Today's Payments</TabsTrigger>
            <TabsTrigger value="insurance">Insurance Claims</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
          </TabsList>

          {/* Pending Invoices Tab - Patients Awaiting Billing */}
          <TabsContent value="pending" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Patients Awaiting Billing</CardTitle>
                    <CardDescription>
                      {billingVisits.length > 0 
                        ? `${billingVisits.length} patient(s) ready for invoice creation`
                        : 'No patients waiting for billing'}
                    </CardDescription>
                  </div>

                </div>
              </CardHeader>
              <CardContent>
                {billingVisits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-center">
                    <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                    <h3 className="text-lg font-medium">All caught up!</h3>
                    <p className="text-muted-foreground text-sm mt-1">
                      No patients waiting for billing at the moment.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Patient</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Services</TableHead>
                          <TableHead>Total Cost</TableHead>
                          <TableHead>Visit Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {billingVisits.map((visit: any) => {
                          const patient = patients.find(p => p.id === visit.patient_id) || visit.patient;
                          const patientServicesList = patientServices.filter((s: any) => s.patient_id === visit.patient_id);
                          const totalCost = patientCosts[visit.patient_id] || 0;
                          
                          return (
                            <TableRow key={visit.id}>
                              <TableCell className="font-medium">
                                {patient?.full_name || 'Unknown Patient'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {patient?.phone || '-'}
                              </TableCell>
                              <TableCell>
                                <div className="text-sm">
                                  {patientServicesList.length} service(s)
                                  {patientServicesList.length > 0 && (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      {patientServicesList.slice(0, 2).map((s: any, i: number) => (
                                        <div key={i}>
                                          • {s.service_name || s.service?.service_name || 'Service'}
                                        </div>
                                      ))}
                                      {patientServicesList.length > 2 && (
                                        <div>+ {patientServicesList.length - 2} more</div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="font-semibold text-blue-600">
                                TSh{totalCost.toFixed(2)}
                              </TableCell>
                              <TableCell className="text-sm">
                                {format(new Date(visit.visit_date || visit.created_at), 'MMM dd, yyyy')}
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setSelectedPatientId(visit.patient_id);
                                    setDialogOpen(true);
                                  }}
                                  disabled={totalCost === 0}
                                >
                                  <Plus className="h-4 w-4 mr-2" />
                                  Create Invoice
                                </Button>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Invoices</CardTitle>
                    <CardDescription>Manage patient invoices and payments</CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                </div>
              </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]">Patient</TableHead>
                        <TableHead className="min-w-[100px]">Phone</TableHead>
                        <TableHead className="min-w-[150px]">Services</TableHead>
                        <TableHead className="min-w-[120px]">Calculated Cost</TableHead>
                        <TableHead className="min-w-[100px]">Total Amount</TableHead>
                        <TableHead className="min-w-[100px]">Paid Amount</TableHead>
                        <TableHead className="min-w-[100px]">Unpaid Amount</TableHead>
                        <TableHead className="min-w-[80px]">Invoice Count</TableHead>
                        <TableHead className="min-w-[100px]">Latest Date</TableHead>
                        <TableHead className="min-w-[80px]">Status</TableHead>
                        <TableHead className="min-w-[100px]">Actions</TableHead>
                        <TableHead className="min-w-[120px]">Blockchain</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices
                        .filter((patientData) => patientData.status !== 'Paid' && patientData.patient) // Hide fully paid patients and null patients
                        .map((patientData) => (
                        <TableRow key={patientData.patient.id}>
                          <TableCell className="font-medium">
                            <div>{patientData.patient?.full_name || 'Unknown Patient'}</div>
                            {(patientData.patient?.insurance_provider || patientData.patient?.insurance_number) && (
                              <span className="inline-flex items-center gap-1 bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full font-medium mt-1">
                                🛡 {patientData.patient?.insurance_provider || 'Insurance'}
                                {patientData.patient?.insurance_number && ` · ${patientData.patient.insurance_number}`}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm">{patientData.patient?.phone || 'N/A'}</TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              // Get services for this patient from their invoices
                              const patientServicesList = patientServices.filter((s: any) => s.patient_id === patientData.patient.id);
                              const serviceNames = patientServicesList.map((service: any) => {
                                if (service.service?.service_name) {
                                  return service.service.service_name;
                                } else if (service.service_name) {
                                  return service.service_name;
                                } else {
                                  return 'Medical Service';
                                }
                              });
                              
                              // Remove duplicates and limit to 3 services
                              const uniqueServices = [...new Set(serviceNames)];
                              const displayServices = uniqueServices.slice(0, 3);
                              const hasMore = uniqueServices.length > 3;
                              
                              return (
                                <div className="max-w-[150px]">
                                  {displayServices.length > 0 ? (
                                    <>
                                      {displayServices.join(', ')}
                                      {hasMore && <span className="text-muted-foreground"> +{uniqueServices.length - 3} more</span>}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No services found</span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="font-semibold text-blue-600">
                            TSh{(patientCosts[patientData.patient.id] || 0).toFixed(2)}
                          </TableCell>
                          <TableCell>TSh{Number(patientData.totalAmount as number).toFixed(2)}</TableCell>
                          <TableCell>TSh{Number(patientData.totalPaid as number).toFixed(2)}</TableCell>
                          <TableCell>TSh{Number(patientData.unpaidAmount as number).toFixed(2)}</TableCell>
                          <TableCell>{patientData.invoiceCount}</TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(patientData.latestInvoiceDate), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant={
                                patientData.status === 'Paid' ? 'default' :
                                patientData.status === 'Partially Paid' ? 'secondary' :
                                'destructive'
                              }
                            >
                              {patientData.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {(patientData.status === 'Unpaid' || patientData.status === 'Partially Paid') && (
                              <div className="flex gap-2">
                                <Button
                                  size="sm"
                                  className="bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-0 shadow-md hover:shadow-lg transition-all duration-200 transform hover:scale-105"
                                  onClick={() => {
                                    const unpaidInvoices = patientData.invoices.filter(inv => inv.status !== 'Paid');


                                    if (unpaidInvoices.length === 1) {
                                      // If only one unpaid invoice, open payment dialog directly
                                      handleOpenPaymentDialog(unpaidInvoices[0]);
                                    } else if (unpaidInvoices.length > 1) {
                                      // If multiple unpaid invoices, show selection dialog
                                      setSelectedPatientForInvoiceSelection(patientData);
                                      setInvoiceSelectionDialogOpen(true);
                                    } else {
                                      toast.error('No unpaid invoices found for this patient');
                                    }
                                  }}
                                >
                                  <CreditCard className="mr-1 h-3 w-3" />
                                  Pay Now
                                </Button>
                                
                                {patientData.invoices.filter(inv => inv.status !== 'Paid').length > 1 && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-blue-500 text-blue-600 hover:bg-blue-50 shadow-md hover:shadow-lg transition-all duration-200"
                                    onClick={() => {
                                      setSelectedPatientForPayAll(patientData);
                                      setPayAllDialogOpen(true);
                                    }}
                                  >
                                    <CreditCard className="mr-1 h-3 w-3" />
                                    Pay All
                                  </Button>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-col gap-1 text-xs">
                              {patientData.invoices?.some((inv: any) => inv.visit_id) && (
                                <a
                                  href={`/api/records/${patientData.patient.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:text-blue-800 hover:underline flex items-center gap-1"
                                  title="View medical records on IPFS"
                                >
                                  📄 Records
                                </a>
                              )}
                              {patientData.invoices?.some((inv: any) => inv.payments?.some((p: any) => p.stellar_tx_hash)) && (
                                (() => {
                                  const txHash = patientData.invoices
                                    .flatMap((inv: any) => inv.payments || [])
                                    .find((p: any) => p.stellar_tx_hash)?.stellar_tx_hash;
                                  const network = import.meta.env.VITE_STELLAR_NETWORK || 'testnet';
                                  return txHash ? (
                                    <a
                                      href={`https://stellar.expert/explorer/${network}/tx/${txHash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-purple-600 hover:text-purple-800 hover:underline flex items-center gap-1"
                                      title="View on Stellar blockchain"
                                    >
                                      ⭐ On-chain
                                    </a>
                                  ) : (
                                    <span className="text-purple-600 flex items-center gap-1">⭐ On-chain</span>
                                  );
                                })()
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Paid Invoices Tab - Shows Quick Service and other paid invoices */}
          <TabsContent value="paid" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Paid Invoices</CardTitle>
                    <CardDescription>All fully paid invoices including Quick Service payments</CardDescription>
                  </div>

                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[120px]">Patient</TableHead>
                        <TableHead className="min-w-[100px]">Phone</TableHead>
                        <TableHead className="min-w-[150px]">Services</TableHead>
                        <TableHead className="min-w-[100px]">Total Amount</TableHead>
                        <TableHead className="min-w-[100px]">Paid Amount</TableHead>
                        <TableHead className="min-w-[80px]">Invoice Count</TableHead>
                        <TableHead className="min-w-[100px]">Latest Date</TableHead>
                        <TableHead className="min-w-[80px]">Status</TableHead>
                        <TableHead className="min-w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices
                        .filter((patientData) => patientData.status === 'Paid' && patientData.patient) // Show only fully paid patients with valid patient data
                        .map((patientData) => (
                        <TableRow key={patientData.patient.id}>
                          <TableCell className="font-medium">{patientData.patient?.full_name || 'Unknown Patient'}</TableCell>
                          <TableCell className="text-sm">{patientData.patient?.phone || 'N/A'}</TableCell>
                          <TableCell className="text-xs">
                            {(() => {
                              // Get services for this patient from their invoices
                              const patientServicesList = patientServices.filter((s: any) => s.patient_id === patientData.patient.id);
                              const serviceNames = patientServicesList.map((service: any) => {
                                if (service.service?.service_name) {
                                  return service.service.service_name;
                                } else if (service.service_name) {
                                  return service.service_name;
                                } else {
                                  return 'Medical Service';
                                }
                              });
                              
                              // Remove duplicates and limit to 3 services
                              const uniqueServices = [...new Set(serviceNames)];
                              const displayServices = uniqueServices.slice(0, 3);
                              const hasMore = uniqueServices.length > 3;
                              
                              return (
                                <div className="max-w-[150px]">
                                  {displayServices.length > 0 ? (
                                    <>
                                      {displayServices.join(', ')}
                                      {hasMore && <span className="text-muted-foreground"> +{uniqueServices.length - 3} more</span>}
                                    </>
                                  ) : (
                                    <span className="text-muted-foreground">No services found</span>
                                  )}
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="font-semibold text-green-600">
                            TSh{Number(patientData.totalAmount as number).toFixed(2)}
                          </TableCell>
                          <TableCell className="text-green-600">
                            TSh{Number(patientData.totalPaid as number).toFixed(2)}
                          </TableCell>
                          <TableCell>{patientData.invoiceCount}</TableCell>
                          <TableCell className="text-sm">
                            {format(new Date(patientData.latestInvoiceDate), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <Badge variant="default" className="bg-green-600">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Paid
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // Show invoice details
                                const firstInvoice = patientData.invoices[0];
                                if (firstInvoice) {
                                  setSelectedInvoiceDetails({
                                    ...firstInvoice,
                                    patient: patientData.patient,
                                    allInvoices: patientData.invoices
                                  });
                                  // Fetch payment details for this invoice
                                  fetchInvoicePayments(firstInvoice.id);
                                  setInvoiceDetailsDialogOpen(true);
                                }
                              }}
                            >
                              <File className="mr-1 h-3 w-3" />
                              View Details
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {invoices.filter((patientData) => patientData.status === 'Paid').length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            <CheckCircle className="h-12 w-12 mx-auto mb-2 opacity-30" />
                            <p>No paid invoices found</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Today's Payments Tab */}
          <TabsContent value="payments" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Today's Payments</CardTitle>
                    <CardDescription>
                      All payments received today - {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </CardDescription>
                  </div>

                </div>
              </CardHeader>
              <CardContent>
                {rawPaymentsData.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground font-medium">No payments received today</p>
                    <p className="text-sm text-muted-foreground mt-1">Payments will appear here as they are processed</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-green-700 font-medium">Total Revenue Today</p>
                          <p className="text-3xl font-bold text-green-800">TSh {stats.todayRevenue.toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-green-700">Total Payments</p>
                          <p className="text-2xl font-bold text-green-800">{rawPaymentsData.length}</p>
                        </div>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Time</TableHead>
                            <TableHead>Patient</TableHead>
                            <TableHead>Phone</TableHead>
                            <TableHead>Amount</TableHead>
                            <TableHead>Payment Method</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Reference</TableHead>
                            <TableHead>Blockchain</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rawPaymentsData
                            .sort((a, b) => {
                              // Sort by created_at descending (newest first)
                              const dateA = new Date(a.created_at || a.payment_date);
                              const dateB = new Date(b.created_at || b.payment_date);
                              return dateB.getTime() - dateA.getTime();
                            })
                            .map((payment) => (
                            <TableRow key={payment.id}>
                              <TableCell className="text-sm">
                                {format(new Date(payment.created_at || payment.payment_date), 'h:mm a')}
                              </TableCell>
                              <TableCell className="font-medium">
                                {payment.patient?.full_name || 'Unknown'}
                              </TableCell>
                              <TableCell className="text-sm">
                                {payment.patient?.phone || '-'}
                              </TableCell>
                              <TableCell className="font-semibold text-green-600">
                                TSh {Number(payment.amount).toLocaleString()}
                              </TableCell>
                              <TableCell>
                                <Badge variant="outline">
                                  {payment.payment_method === 'M-Pesa' && '📱 M-Pesa'}
                                  {payment.payment_method === 'Airtel Money' && '📱 Airtel Money'}
                                  {payment.payment_method === 'Tigo Pesa' && '📱 Tigo Pesa'}
                                  {payment.payment_method === 'Halopesa' && '📱 Halopesa'}
                                  {payment.payment_method === 'Cash' && '💵 Cash'}
                                  {payment.payment_method === 'Card' && '💳 Card'}
                                  {payment.payment_method === 'Bank Transfer' && '🏦 Bank Transfer'}
                                  {payment.payment_method === 'Insurance' && '🛡️ Insurance'}
                                  {!['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa', 'Cash', 'Card', 'Bank Transfer', 'Insurance'].includes(payment.payment_method) && payment.payment_method}
                                </Badge>
                              </TableCell>
                              <TableCell className="text-sm">
                                {payment.payment_type || 'General'}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground font-mono">
                                {payment.reference_number || '-'}
                              </TableCell>
                              <TableCell>
                                {payment.stellar_tx_hash ? (
                                  <div className="flex flex-col gap-1">
                                    <a
                                      href={`https://stellar.expert/explorer/${import.meta.env.VITE_STELLAR_NETWORK || 'testnet'}/tx/${payment.stellar_tx_hash}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="flex items-center gap-1 text-xs text-purple-600 hover:text-purple-800 hover:underline font-mono"
                                      title={`View on Stellar: ${payment.stellar_tx_hash}`}
                                    >
                                      ⭐ {payment.stellar_tx_hash.substring(0, 8)}…
                                    </a>
                                    {payment.xlm_amount && (
                                      <span className="text-xs text-green-600 font-medium">
                                        ✅ {Number(payment.xlm_amount).toFixed(4)} XLM
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <button
                                    className="text-xs text-gray-400 hover:text-purple-600 hover:underline transition-colors"
                                    title="Bridge this payment to Stellar"
                                    onClick={async () => {
                                      try {
                                        const destWallet = import.meta.env.VITE_HOSPITAL_STELLAR_WALLET
                                          || 'GCIUVYTB76RWSV2FZ7URYCUPVLUPGWP5THPLO6F4NP6NUINZX4WVDFEW';
                                        const res = await api.post(`/bridge/payment/${payment.id}`, {
                                          destination_wallet: destWallet,
                                        });
                                        if (res.data?.stellar_tx_hash) {
                                          const txHash = res.data.stellar_tx_hash;
                                          const network = import.meta.env.VITE_STELLAR_NETWORK || 'testnet';
                                          toast.success(`⭐ Bridged! TX: ${txHash.substring(0, 8)}…`, {
                                            duration: 10000,
                                            action: {
                                              label: 'View on Stellar',
                                              onClick: () => window.open(`https://stellar.expert/explorer/${network}/tx/${txHash}`, '_blank'),
                                            },
                                          });
                                          fetchData(false);
                                        }
                                      } catch {
                                        toast.error('Bridge to Stellar failed');
                                      }
                                    }}
                                  >
                                    🔗 Bridge
                                  </button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Insurance Claims Tab */}
          <TabsContent value="insurance" className="space-y-4">
            {/* NHIF Info Card */}
            <Card className="border-blue-200 bg-gradient-to-r from-blue-50 to-white shadow-lg">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-600 rounded-lg">
                    <svg className="h-8 w-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                    </svg>
                  </div>
                  <div>
                    <CardTitle className="text-xl">NHIF Claims Management</CardTitle>
                    <CardDescription className="text-sm">
                      National Health Insurance Fund - Automated claim submission
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="p-4 bg-white rounded-lg border border-blue-100">
                    <div className="text-sm text-muted-foreground">Total Claims</div>
                    <div className="text-2xl font-bold text-blue-600">{insuranceClaims.length}</div>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-green-100">
                    <div className="text-sm text-muted-foreground">Approved</div>
                    <div className="text-2xl font-bold text-green-600">
                      {insuranceClaims.filter(c => c.status === 'Approved').length}
                    </div>
                  </div>
                  <div className="p-4 bg-white rounded-lg border border-yellow-100">
                    <div className="text-sm text-muted-foreground">Pending</div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {insuranceClaims.filter(c => c.status === 'Pending').length}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Claims Table */}
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Insurance Claims</CardTitle>
                    <CardDescription>Submit and track NHIF claims</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {insuranceClaims.length === 0 ? (
                  <div className="text-center py-12">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 mb-4">
                      <svg className="h-8 w-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No claims submitted yet</h3>
                    <p className="text-sm text-gray-500 mb-4">Start by submitting your first NHIF claim</p>
                    <Button onClick={() => setClaimDialogOpen(true)} variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Submit First Claim
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="font-semibold">Claim Number</TableHead>
                          <TableHead className="font-semibold">Patient</TableHead>
                          <TableHead className="font-semibold">Insurance No.</TableHead>
                          <TableHead className="font-semibold">Company</TableHead>
                          <TableHead className="font-semibold">Claim Amount</TableHead>
                          <TableHead className="font-semibold">Approved</TableHead>
                          <TableHead className="font-semibold">Status</TableHead>
                          <TableHead className="font-semibold">Submitted</TableHead>
                          <TableHead className="font-semibold">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {insuranceClaims.map((claim) => (
                          <TableRow key={claim.id} className="hover:bg-gray-50">
                            <TableCell className="font-mono font-medium text-blue-600">{claim.claim_number}</TableCell>
                            <TableCell>
                              <div className="font-medium">{claim.patient?.full_name || 'Unknown'}</div>
                              <div className="text-xs text-muted-foreground">{claim.patient?.phone}</div>
                            </TableCell>
                            <TableCell className="font-mono text-sm">{claim.patient?.insurance_number || '—'}</TableCell>
                            <TableCell className="text-sm">{claim.insurance_company?.name || claim.insuranceCompany?.name || '—'}</TableCell>
                            <TableCell className="font-semibold">TSh {Number(claim.claim_amount as number).toLocaleString()}</TableCell>
                            <TableCell className="font-semibold text-green-600">
                              {claim.approved_amount ? `TSh ${Number(claim.approved_amount).toLocaleString()}` : '—'}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  claim.status === 'Approved' ? 'default' :
                                  claim.status === 'Paid' ? 'default' :
                                  claim.status === 'Pending' ? 'secondary' :
                                  'destructive'
                                }
                                className={
                                  claim.status === 'Approved' ? 'bg-green-100 text-green-800' :
                                  claim.status === 'Paid' ? 'bg-blue-100 text-blue-800' :
                                  claim.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-red-100 text-red-800'
                                }
                              >
                                {claim.status}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm">
                              {claim.submission_date ? format(new Date(claim.submission_date), 'dd MMM yyyy') : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {claim.status === 'Pending' && (
                                  <>
                                    <Button size="sm" variant="outline"
                                      className="text-green-700 border-green-300 hover:bg-green-50 h-7 text-xs"
                                      onClick={() => updateClaimStatus(claim.id, 'Approved', Number(claim.claim_amount))}>
                                      Approve
                                    </Button>
                                    <Button size="sm" variant="outline"
                                      className="text-red-700 border-red-300 hover:bg-red-50 h-7 text-xs"
                                      onClick={() => updateClaimStatus(claim.id, 'Rejected')}>
                                      Reject
                                    </Button>
                                  </>
                                )}
                                {claim.status === 'Approved' && (
                                  <Button size="sm" variant="outline"
                                    className="text-blue-700 border-blue-300 hover:bg-blue-50 h-7 text-xs"
                                    onClick={() => updateClaimStatus(claim.id, 'Paid', Number(claim.approved_amount || claim.claim_amount))}>
                                    Mark Paid
                                  </Button>
                                )}
                                {(claim.status === 'Rejected' || claim.status === 'Paid') && (
                                  <span className="text-xs text-muted-foreground italic">
                                    {claim.status === 'Paid' ? `Paid ${claim.payment_date ? format(new Date(claim.payment_date), 'dd MMM') : ''}` : 'Rejected'}
                                  </span>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Reports Tab */}
          <TabsContent value="reports" className="space-y-4">
            <Card className="shadow-lg">
              <CardHeader>
                <div className="flex justify-between items-center">
                  <div>
                    <CardTitle>Medical & Financial Reports</CardTitle>
                    <CardDescription>Generate comprehensive reports with date filtering</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Date Range Filter */}
                <div className="mb-6 p-4 border rounded-lg bg-gray-50">
                  <h4 className="font-semibold mb-3">Date Range Filter (Optional)</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="reportDateFrom">From Date</Label>
                      <Input
                        id="reportDateFrom"
                        type="date"
                        value={reportDateFrom}
                        onChange={(e) => setReportDateFrom(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label htmlFor="reportDateTo">To Date</Label>
                      <Input
                        id="reportDateTo"
                        type="date"
                        value={reportDateTo}
                        onChange={(e) => setReportDateTo(e.target.value)}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Leave empty to include all records. Date range applies to creation/visit dates.
                  </p>
                </div>

                {/* Report Buttons Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <Button
                    onClick={() => printMedicalHistoryReport(reportDateFrom, reportDateTo)}
                    className="h-20 flex flex-col items-center justify-center bg-blue-600 hover:bg-blue-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Medical History Report</span>
                    <span className="text-xs opacity-80">All visits, prescriptions & lab tests</span>
                  </Button>

                  <Button
                    onClick={() => printPendingInvoicesReport()}
                    className="h-20 flex flex-col items-center justify-center bg-orange-600 hover:bg-orange-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Pending Invoices</span>
                    <span className="text-xs opacity-80">Patients awaiting billing</span>
                  </Button>

                  <Button
                    onClick={() => printPaidInvoicesReport()}
                    className="h-20 flex flex-col items-center justify-center bg-green-600 hover:bg-green-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Paid Invoices</span>
                    <span className="text-xs opacity-80">All completed payments</span>
                  </Button>

                  <Button
                    onClick={() => printTodaysPaymentsReport()}
                    className="h-20 flex flex-col items-center justify-center bg-purple-600 hover:bg-purple-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Today's Payments</span>
                    <span className="text-xs opacity-80">Daily revenue report</span>
                  </Button>

                  <Button
                    onClick={() => printLabTestsReport()}
                    className="h-20 flex flex-col items-center justify-center bg-teal-600 hover:bg-teal-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Lab Tests Report</span>
                    <span className="text-xs opacity-80">All laboratory tests</span>
                  </Button>

                  <Button
                    onClick={() => printPharmacyInventoryReport()}
                    className="h-20 flex flex-col items-center justify-center bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Pharmacy Inventory</span>
                    <span className="text-xs opacity-80">Medication stock levels</span>
                  </Button>

                  <Button
                    onClick={() => printPatientListReport()}
                    className="h-20 flex flex-col items-center justify-center bg-gray-600 hover:bg-gray-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Patient Registry</span>
                    <span className="text-xs opacity-80">Complete patient list</span>
                  </Button>

                  <Button
                    onClick={() => printComprehensiveBillingReport()}
                    className="h-20 flex flex-col items-center justify-center bg-red-600 hover:bg-red-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Comprehensive Report</span>
                    <span className="text-xs opacity-80">Complete financial overview</span>
                  </Button>

                  <Button
                    onClick={() => printDetailedInvoiceReport()}
                    className="h-20 flex flex-col items-center justify-center bg-purple-600 hover:bg-purple-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Detailed Invoices</span>
                    <span className="text-xs opacity-80">Invoice breakdown with services</span>
                  </Button>

                  <Button
                    onClick={() => printInsuranceClaimsReport()}
                    className="h-20 flex flex-col items-center justify-center bg-cyan-600 hover:bg-cyan-700"
                  >
                    <Printer className="h-6 w-6 mb-2" />
                    <span>Insurance Claims</span>
                    <span className="text-xs opacity-80">NHIF & insurance reports</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        <Dialog open={paymentDialogOpen} onOpenChange={(open) => {
          setPaymentDialogOpen(open);
          if (!open) {
            // Reset form state when dialog closes
            setPaymentStatus('');
            setTransactionId('');
            setPaymentMethod('');
            setMobilePaymentProcessing(false);
          }
        }}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Record Payment</DialogTitle>
              <DialogDescription>
                {(() => {
                  const actualInvoice = selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.invoice 
                    ? selectedInvoice.invoice 
                    : selectedInvoice;
                  const patientId = selectedInvoice && typeof selectedInvoice === 'object' && selectedInvoice.patientId
                    ? selectedInvoice.patientId
                    : actualInvoice?.patient_id || actualInvoice?.patient?.id;
                  
                  return (
                    <>
                      Record payment for {actualInvoice ? getInvoiceServiceDescription(actualInvoice) : 'Medical Services'}
                      <div className="mt-2 text-xs text-gray-500">
                        Patient ID: {patientId || 'Not found'}
                      </div>
                    </>
                  );
                })()}
              </DialogDescription>
            </DialogHeader>

            {/* Invoice Details */}
            {selectedInvoice && (
              <InvoiceDetailsSection selectedInvoice={selectedInvoice} />
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4">
              {/* Form validation helper */}
              {(() => {
                const form = document.querySelector('form');
                const isFormValid = form?.checkValidity();
                return !isFormValid ? (
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200">
                    <p className="text-sm text-red-600">⚠️ Please fill in all required fields</p>
                  </div>
                ) : null;
              })()}

              <div className="space-y-2">
                <Label htmlFor="amount">Payment Amount (TSh)</Label>
                <PaymentAmountInput selectedInvoice={selectedInvoice} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="paymentMethod">Payment Method</Label>
                {(() => {
                  const patient = patients.find(p => p.id === selectedInvoice?.patient_id);
                  const hasInsurance = patient?.insurance_company_id;
                  
                  return (
                    <>
                      <Select 
                        name="paymentMethod" 
                        value={paymentMethod} 
                        onValueChange={setPaymentMethod} 
                        required
                        disabled={hasInsurance}
                      >
                        <SelectTrigger className={paymentMethod ? 'border-green-500' : 'border-red-500'}>
                          <SelectValue placeholder="Select payment method" />
                        </SelectTrigger>
                        <SelectContent>
                          {hasInsurance ? (
                            <SelectItem value="Insurance">🛡️ Insurance (Patient has insurance)</SelectItem>
                          ) : (
                            <>
                              <SelectItem value="Cash">💵 Cash</SelectItem>
                              <SelectItem value="Card">💳 Debit/Credit Card</SelectItem>
                              <SelectItem value="M-Pesa">📱 M-Pesa</SelectItem>
                              <SelectItem value="Airtel Money">📱 Airtel Money</SelectItem>
                              <SelectItem value="Tigo Pesa">📱 Tigo Pesa</SelectItem>
                              <SelectItem value="Halopesa">📱 Halopesa</SelectItem>
                              <SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem>
                              <SelectItem value="Cheque">📄 Cheque</SelectItem>
                              <SelectItem value="Insurance">🛡️ Insurance</SelectItem>
                            </>
                          )}
                        </SelectContent>
                      </Select>
                      {hasInsurance && (
                        <p className="text-sm text-blue-600">
                          ℹ️ This patient has insurance. Payment must be processed through insurance claim.
                        </p>
                      )}
                      {!paymentMethod && !hasInsurance && (
                        <p className="text-sm text-red-600">Please select a payment method</p>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Mobile Money Fields */}
              {['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentMethod) && (
                <div className="space-y-2 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2">
                    <Smartphone className="h-4 w-4 text-blue-600" />
                    <Label htmlFor="phoneNumber" className="text-blue-800 font-medium">
                      Phone Number *
                    </Label>
                  </div>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    placeholder="0712345678"
                    pattern="^0[67][0-9]{8}$"
                    title="Please enter a valid Tanzanian phone number (07xxxxxxxx or 06xxxxxxxx)"
                    className="border-blue-300 focus:border-blue-500"
                    required
                  />
                  <p className="text-sm text-blue-600">
                    💡 Customer will receive payment request on this number
                  </p>
                  <p className="text-xs text-blue-500">
                    Format: 07xxxxxxxx or 06xxxxxxxx
                  </p>
                </div>
              )}

              {/* Bank Transfer Fields */}
              {paymentMethod === 'Bank Transfer' && (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input id="bankName" name="bankName" placeholder="e.g., CRDB Bank" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="accountNumber">Account Number</Label>
                    <Input id="accountNumber" name="accountNumber" placeholder="Account number" required />
                  </div>
                </div>
              )}

              {/* Cheque Fields */}
              {paymentMethod === 'Cheque' && (
                <div className="space-y-2">
                  <Label htmlFor="chequeNumber">Cheque Number</Label>
                  <Input id="chequeNumber" name="chequeNumber" placeholder="Cheque number" required />
                </div>
              )}

              {/* Insurance Fields */}
              {paymentMethod === 'Insurance' && (
                <div className="space-y-2">
                  <Label>Insurance Company</Label>
                  <Select name="insuranceCompanyId" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select insurance company" />
                    </SelectTrigger>
                    <SelectContent>
                      {insuranceCompanies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name} ({company.coverage_percentage}% coverage)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Mobile Payment Button */}
              {['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(paymentMethod) ? (
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                  disabled={mobilePaymentProcessing || !paymentMethod || !selectedInvoice}
                >
                  {mobilePaymentProcessing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing Payment...
                    </>
                  ) : (
                    <>
                      <Send className="mr-2 h-4 w-4" />
                      Send Payment Request
                    </>
                  )}
                </Button>
              ) : (
                /* Regular Payment Button */
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-105"
                  disabled={!paymentMethod || !selectedInvoice}
                >
                  <CreditCard className="mr-2 h-4 w-4" />
                  Record Payment
                </Button>
              )}
            </form>
          </DialogContent>
        </Dialog>

        {/* Create Invoice Dialog */}
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Invoice</DialogTitle>
              <DialogDescription>
                Create a new invoice for patient services
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateInvoice} className="space-y-4">
              {selectedPatientId && (() => {
                const patient = patients.find(p => p.id === selectedPatientId);
                const patientServicesList = patientServices.filter((s: any) => {
                  if (s.patient_id !== selectedPatientId) return false;
                  const serviceType = s.service?.service_type || '';
                  const isConsultation = serviceType.toLowerCase().includes('consultation');
                  return !isConsultation;
                });
                const totalCost = patientCosts[selectedPatientId] || 0;

                return (
                  <>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <h4 className="font-medium text-blue-900 mb-2">Patient Information</h4>
                      <div className="space-y-1 text-sm">
                        <p><span className="font-medium">Name:</span> {patient?.full_name}</p>
                        <p><span className="font-medium">Phone:</span> {patient?.phone || '-'}</p>
                        <p><span className="font-medium">Services:</span> {patientServicesList.length}</p>
                      </div>
                    </div>

                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h4 className="font-medium text-green-900 mb-2">Services to Bill</h4>
                      <div className="space-y-2">
                        {patientServicesList.map((service: any, index: number) => (
                          <div key={index} className="flex justify-between text-sm">
                            <span>{service.service_name || service.service?.service_name || 'Service'}</span>
                            <span className="font-medium">
                              {service.quantity} × TSh{Number(service.unit_price || service.service?.base_price || 0).toFixed(2)} = 
                              TSh{Number(service.total_price || 0).toFixed(2)}
                            </span>
                          </div>
                        ))}
                        <div className="border-t border-green-300 pt-2 mt-2 flex justify-between font-bold text-green-900">
                          <span>Total Amount:</span>
                          <span>TSh{totalCost.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="dueDate">Due Date (Optional)</Label>
                      <Input
                        id="dueDate"
                        name="dueDate"
                        type="date"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="notes">Notes (Optional)</Label>
                      <Textarea
                        id="notes"
                        name="notes"
                        placeholder="Add any additional notes..."
                        rows={3}
                      />
                    </div>
                  </>
                );
              })()}

              <div className="flex justify-end gap-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={!selectedPatientId}>
                  <File className="mr-2 h-4 w-4" />
                  Create Invoice
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Insurance Claim Dialog */}
        <Dialog open={claimDialogOpen} onOpenChange={setClaimDialogOpen}>
          <DialogContent className="max-w-md w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Submit Insurance Claim</DialogTitle>
              <DialogDescription>
                Submit a new insurance claim for an invoice
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={async (e) => {
              e.preventDefault();
              const formData = new FormData(e.currentTarget);
              
              try {
                setLoading(true);
                
                const invoiceId = formData.get('invoiceId') as string;
                const insuranceCompanyId = formData.get('insuranceCompanyId') as string;
                const claimAmount = Number(formData.get('claimAmount') as string);
                const notes = formData.get('notes') as string;
                
                // Find patient from invoice
                const patientData = invoices.find(pd => pd.invoices.some(inv => inv.id === invoiceId));
                const invoice = patientData?.invoices.find(inv => inv.id === invoiceId);
                
                if (!patientData || !invoice) {
                  toast.error('Invoice not found');
                  return;
                }
                
                // Get insurance company details including API key
                const insuranceCompany = insuranceCompanies.find(ic => ic.id === insuranceCompanyId);
                
                if (!insuranceCompany) {
                  toast.error('Insurance company not found');
                  return;
                }

                const claimNumber = `CLM-${Date.now().toString().slice(-8)}`;
                
                // Get ICD-10 from the invoice's linked visit if available
                const visitIcd10Code = invoice.visit?.icd10_code || invoice.visit?.final_icd10_code || '';
                const visitIcd10Desc = invoice.visit?.icd10_description || invoice.visit?.final_icd10_description || '';

                // Prepare claim data
                const claimData = {
                  invoice_id: invoiceId,
                  insurance_company_id: insuranceCompanyId,
                  patient_id: patientData.patient?.id,
                  claim_number: claimNumber,
                  claim_amount: claimAmount,
                  notes: notes,
                  status: 'Pending',
                  submission_date: new Date().toISOString(),
                  icd10_code: visitIcd10Code,
                  icd10_description: visitIcd10Desc,
                };

                // If insurance company has API key, submit via API
                if (insuranceCompany.api_key && insuranceCompany.api_endpoint) {
                  try {

                    // NHIF Tanzania format
                    const apiPayload = {
                      ClaimNumber: claimNumber,
                      CardNumber: patientData.patient?.insurance_policy_number,
                      PatientName: patientData.patient?.full_name,
                      FacilityCode: insuranceCompany.facility_code || 'HF001',
                      DateOfService: invoice.invoice_date,
                      TotalAmount: claimAmount,
                      DiagnosisCode: visitIcd10Code,
                      DiagnosisDescription: visitIcd10Desc,
                      Services: invoice.invoice_items?.map((item: any) => ({
                        ServiceCode: item.item_type || 'CONS',
                        ServiceName: item.description,
                        Quantity: item.quantity,
                        UnitPrice: item.unit_price,
                        TotalPrice: item.total_price
                      })) || [],
                      Remarks: notes
                    };
                    
                    const response = await fetch(insuranceCompany.api_endpoint, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${insuranceCompany.api_key}`,
                        'X-API-Key': insuranceCompany.api_key
                      },
                      body: JSON.stringify(apiPayload)
                    });
                    
                    if (!response.ok) {
                      throw new Error(`API request failed: ${response.statusText}`);
                    }
                    
                    const apiResult = await response.json();

                    // Update claim data with API response
                    claimData.notes = `${notes}\n\nAPI Response: ${JSON.stringify(apiResult)}`;
                    
                    toast.success('Claim submitted to insurance company via API');
                  } catch (apiError) {

                    toast.warning('Claim saved locally but API submission failed. Will retry later.');
                    claimData.notes = `${notes}\n\nAPI Error: ${apiError instanceof Error ? apiError.message : 'Unknown error'}`;
                  }
                } else {

                }

                // Save claim to database
                try {
                  const response = await api.post('/insurance/claims', claimData);
                  toast.success('Insurance claim submitted successfully');
                  setClaimDialogOpen(false);
                  
                  // Add new claim to local state
                  if (response.data.claim) {
                    setRawClaimsData(prev => [...prev, response.data.claim]);
                  }
                } catch (error: any) {

                  toast.error(`Failed to save claim: ${error.message}`);
                }
              } catch (error) {

                toast.error('Failed to submit claim');
              } finally {
                setLoading(false);
              }
            }} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invoiceId">Invoice</Label>
                <Select name="invoiceId" value={claimInvoiceId} onValueChange={(value) => {
                  setClaimInvoiceId(value);
                  // Auto-fill claim amount with invoice total


                  const selectedInvoice = invoices
                    .flatMap(pd => pd.invoices || [])
                    .find(inv => inv.id === value);

                  if (selectedInvoice) {
                    const amount = Number(selectedInvoice.total_amount || 0).toString();

                    setClaimAmount(amount);
                  }
                }} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select invoice" />
                  </SelectTrigger>
                  <SelectContent>
                    {(() => {
                      const eligibleInvoices = invoices.filter(patientData => 
                        patientData.patient?.insurance_company_id && patientData.status !== 'Paid'
                      );
                      
                      if (eligibleInvoices.length === 0) {
                        return <SelectItem value="no-invoices" disabled>No eligible invoices (patients must have insurance)</SelectItem>;
                      }
                      
                      return eligibleInvoices.map((patientData, index) => (
                        <Fragment key={patientData.patient.id || index}>
                          {patientData.invoices
                            .filter(inv => inv.status !== 'Paid')
                            .map(invoice => (
                              <SelectItem key={invoice.id} value={invoice.id}>
                                {getInvoiceServiceDescription(invoice)} - {patientData.patient?.full_name || 'Unknown'} (TSh{Number(invoice.total_amount).toFixed(2)})
                              </SelectItem>
                            ))}
                        </Fragment>
                      ));
                    })()}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="insuranceCompanyId">Insurance Company</Label>
                <Select name="insuranceCompanyId" value={claimInsuranceId} onValueChange={setClaimInsuranceId} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select insurance company" />
                  </SelectTrigger>
                  <SelectContent>
                    {insuranceCompanies && insuranceCompanies.length > 0 ? (
                      insuranceCompanies.map((company) => (
                        <SelectItem key={company.id} value={company.id}>
                          {company.name} ({company.coverage_percentage || 100}% coverage)
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-insurance" disabled>
                        No insurance companies available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="claimAmount">Claim Amount (TSh)</Label>
                <Input
                  id="claimAmount"
                  name="claimAmount"
                  type="number"
                  step="0.01"
                  value={claimAmount}
                  readOnly
                  disabled
                  className="bg-gray-100"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Auto-filled from invoice total (read-only).
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea id="notes" name="notes" rows={3} />
              </div>
              <Button type="submit" className="w-full">Submit Claim</Button>
            </form>
          </DialogContent>
        </Dialog>

        {/* Invoice Details Dialog */}
        <Dialog open={invoiceDetailsDialogOpen} onOpenChange={(open) => {
          setInvoiceDetailsDialogOpen(open);
          if (!open) {
            setInvoicePayments([]);
            setSelectedInvoiceDetails(null);
          }
        }}>
          <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Invoice Details</DialogTitle>
              <DialogDescription>
                Complete invoice information and payment history
              </DialogDescription>
            </DialogHeader>
            
            {selectedInvoiceDetails && (
              <div className="space-y-6">
                {/* Patient Information */}
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <h4 className="font-medium text-blue-900 mb-3">Patient Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Name:</span> {selectedInvoiceDetails.patient?.full_name || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Phone:</span> {selectedInvoiceDetails.patient?.phone || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Email:</span> {selectedInvoiceDetails.patient?.email || 'N/A'}
                    </div>
                    <div>
                      <span className="font-medium">Date of Birth:</span> {
                        selectedInvoiceDetails.patient?.date_of_birth 
                          ? format(new Date(selectedInvoiceDetails.patient.date_of_birth), 'MMM dd, yyyy')
                          : 'N/A'
                      }
                    </div>
                  </div>
                </div>

                {/* Invoice Information */}
                <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                  <h4 className="font-medium text-green-900 mb-3">Invoice Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="font-medium">Services:</span> {getInvoiceServiceDescription(selectedInvoiceDetails)}
                    </div>
                    <div>
                      <span className="font-medium">Invoice Date:</span> {
                        selectedInvoiceDetails.invoice_date 
                          ? format(new Date(selectedInvoiceDetails.invoice_date), 'MMM dd, yyyy')
                          : 'N/A'
                      }
                    </div>
                    <div>
                      <span className="font-medium">Due Date:</span> {
                        selectedInvoiceDetails.due_date 
                          ? format(new Date(selectedInvoiceDetails.due_date), 'MMM dd, yyyy')
                          : 'N/A'
                      }
                    </div>
                    <div>
                      <span className="font-medium">Status:</span> 
                      <Badge 
                        variant={selectedInvoiceDetails.status === 'Paid' ? 'default' : 'secondary'}
                        className={selectedInvoiceDetails.status === 'Paid' ? 'bg-green-600 ml-2' : 'ml-2'}
                      >
                        {selectedInvoiceDetails.status}
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Invoice Items */}
                <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                  <h4 className="font-medium text-gray-900 mb-3">Services & Items</h4>
                  <div className="space-y-2">
                    {(selectedInvoiceDetails.invoice_items || selectedInvoiceDetails.items) && (selectedInvoiceDetails.invoice_items || selectedInvoiceDetails.items).length > 0 ? (
                      (selectedInvoiceDetails.invoice_items || selectedInvoiceDetails.items).map((item: any, index: number) => (
                        <div key={index} className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0">
                          <div className="flex-1">
                            <div className="font-medium">{item.description || item.service_name || 'Service'}</div>
                            <div className="text-sm text-gray-600">
                              Quantity: {item.quantity || 1} × TSh{Number(item.unit_price || 0).toFixed(2)}
                            </div>
                          </div>
                          <div className="font-medium">
                            TSh{Number(item.total_price || item.unit_price || 0).toFixed(2)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-gray-600 text-sm">No items found for this invoice</p>
                    )}
                    
                    <div className="border-t border-gray-300 pt-3 mt-3 flex justify-between font-bold text-lg">
                      <span>Total Amount:</span>
                      <span className="text-green-600">TSh{Number(selectedInvoiceDetails.total_amount || 0).toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                {/* Payment Information */}
                <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                  <h4 className="font-medium text-yellow-900 mb-3">Payment Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                    <div>
                      <span className="font-medium">Total Amount:</span> TSh{Number(selectedInvoiceDetails.total_amount || 0).toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Amount Paid:</span> TSh{Number(selectedInvoiceDetails.paid_amount || 0).toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Balance Due:</span> TSh{Number((selectedInvoiceDetails.total_amount || 0) - (selectedInvoiceDetails.paid_amount || 0)).toFixed(2)}
                    </div>
                    <div>
                      <span className="font-medium">Payment Status:</span> 
                      <Badge 
                        variant={selectedInvoiceDetails.status === 'Paid' ? 'default' : 'secondary'}
                        className={selectedInvoiceDetails.status === 'Paid' ? 'bg-green-600 ml-2' : 'ml-2'}
                      >
                        {selectedInvoiceDetails.status}
                      </Badge>
                    </div>
                  </div>
                  
                  {/* Payment History */}
                  {invoicePayments.length > 0 && (
                    <div className="border-t border-yellow-300 pt-3">
                      <h5 className="font-medium text-yellow-900 mb-2">Payment History</h5>
                      <div className="space-y-2">
                        {invoicePayments.map((payment: any, index: number) => (
                          <div key={index} className="bg-white p-3 rounded border border-yellow-200">
                            <div className="grid grid-cols-2 gap-2 text-sm">
                              <div>
                                <span className="font-medium">Amount:</span> TSh{Number(payment.amount || 0).toFixed(2)}
                              </div>
                              <div>
                                <span className="font-medium">Method:</span> {payment.payment_method || 'N/A'}
                              </div>
                              <div>
                                <span className="font-medium">Date:</span> {
                                  payment.payment_date 
                                    ? format(new Date(payment.payment_date), 'MMM dd, yyyy HH:mm')
                                    : 'N/A'
                                }
                              </div>
                              <div>
                                <span className="font-medium">Reference:</span> {payment.reference_number || 'N/A'}
                              </div>
                              {payment.notes && (
                                <div className="col-span-2">
                                  <span className="font-medium">Notes:</span> {payment.notes}
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {invoicePayments.length === 0 && selectedInvoiceDetails.status === 'Paid' && (
                    <div className="border-t border-yellow-300 pt-3">
                      <p className="text-sm text-yellow-700">
                        This invoice is marked as paid, but no detailed payment records were found. 
                        This may be a legacy payment or quick service payment.
                      </p>
                    </div>
                  )}
                </div>

                {/* Notes */}
                {selectedInvoiceDetails.notes && (
                  <div className="bg-purple-50 p-4 rounded-lg border border-purple-200">
                    <h4 className="font-medium text-purple-900 mb-2">Notes</h4>
                    <p className="text-sm text-purple-800">{selectedInvoiceDetails.notes}</p>
                  </div>
                )}

                {/* Multiple Invoices Info */}
                {selectedInvoiceDetails.allInvoices && selectedInvoiceDetails.allInvoices.length > 1 && (
                  <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
                    <h4 className="font-medium text-indigo-900 mb-2">Additional Invoices</h4>
                    <p className="text-sm text-indigo-800">
                      This patient has {selectedInvoiceDetails.allInvoices.length} total invoices. 
                      Showing details for the most recent invoice.
                    </p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Patient Report Selection Dialog */}
        <Dialog open={patientReportDialogOpen} onOpenChange={setPatientReportDialogOpen}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Print Patient Report</DialogTitle>
              <DialogDescription>
                Search and select a patient to print their complete medical and financial report
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              {/* Patient Search */}
              <div className="space-y-2">
                <Label htmlFor="patientSearch">Search Patient</Label>
                <Input
                  id="patientSearch"
                  placeholder="Search by name, phone, or email..."
                  value={patientSearchTerm}
                  onChange={(e) => setPatientSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>

              {/* Patient List */}
              <div className="max-h-96 overflow-y-auto border rounded-lg">
                {patients
                  .filter(patient => {
                    if (!patientSearchTerm) return true;
                    const searchLower = patientSearchTerm.toLowerCase();
                    return (
                      patient.full_name?.toLowerCase().includes(searchLower) ||
                      patient.phone?.toLowerCase().includes(searchLower) ||
                      patient.email?.toLowerCase().includes(searchLower)
                    );
                  })
                  .map((patient) => (
                    <div
                      key={patient.id}
                      className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                        selectedPatientForReport?.id === patient.id ? 'bg-blue-50 border-blue-200' : ''
                      }`}
                      onClick={async () => {
                        setSelectedPatientForReport(patient);
                        setReportPreviewData(null);
                        setReportPreviewLoading(true);
                        try {
                          const [invRes, visitRes] = await Promise.allSettled([
                            api.get(`/billing/invoices?patient_id=${patient.id}`),
                            api.get(`/visits?patient_id=${patient.id}&limit=5`),
                          ]);
                          const invs = invRes.status === 'fulfilled' ? (invRes.value.data.invoices || []) : [];
                          const visits = visitRes.status === 'fulfilled' ? (visitRes.value.data.visits || []) : [];
                          const totalBilled = invs.reduce((s: number, i: any) => s + Number(i.total_amount || 0), 0);
                          const totalPaid = invs.reduce((s: number, i: any) => s + Number(i.paid_amount || 0), 0);
                          setReportPreviewData({ invoices: invs, visits, totalBilled, totalPaid, balance: totalBilled - totalPaid });
                        } catch {}
                        finally { setReportPreviewLoading(false); }
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="font-medium text-gray-900">{patient.full_name}</h4>
                          <p className="text-sm text-gray-600">
                            {patient.phone} • {patient.email || 'No email'}
                          </p>
                          <p className="text-xs text-gray-500">
                            DOB: {patient.date_of_birth ? format(new Date(patient.date_of_birth), 'MMM dd, yyyy') : 'N/A'} • 
                            ID: {patient.id.substring(0, 8)}...
                          </p>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium text-gray-900">
                            {patient.gender || 'N/A'}
                          </div>
                          <div className="text-xs text-gray-500">
                            Registered: {patient.created_at ? format(new Date(patient.created_at), 'MMM yyyy') : 'N/A'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                
                {patients.filter(patient => {
                  if (!patientSearchTerm) return true;
                  const searchLower = patientSearchTerm.toLowerCase();
                  return (
                    patient.full_name?.toLowerCase().includes(searchLower) ||
                    patient.phone?.toLowerCase().includes(searchLower) ||
                    patient.email?.toLowerCase().includes(searchLower)
                  );
                }).length === 0 && (
                  <div className="p-8 text-center text-gray-500">
                    <File className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No patients found matching your search</p>
                  </div>
                )}
              </div>

              {/* Selected Patient Preview & Report Type Selection */}
              {selectedPatientForReport && (
                <div className="space-y-4">
                  {/* Preview Card */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-3 flex items-center gap-2">
                      Preview — {selectedPatientForReport.full_name}
                      {reportPreviewLoading && <span className="text-xs text-blue-600 animate-pulse">Loading...</span>}
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-sm text-blue-800 mb-3">
                      <p><strong>Phone:</strong> {selectedPatientForReport.phone}</p>
                      <p><strong>Gender:</strong> {selectedPatientForReport.gender || 'N/A'}</p>
                      <p><strong>DOB:</strong> {selectedPatientForReport.date_of_birth ? format(new Date(selectedPatientForReport.date_of_birth), 'dd MMM yyyy') : 'N/A'}</p>
                      <p><strong>Blood Group:</strong> {selectedPatientForReport.blood_group || 'N/A'}</p>
                      {selectedPatientForReport.insurance_provider && (
                        <p className="col-span-2"><strong>Insurance:</strong> {selectedPatientForReport.insurance_provider} — {selectedPatientForReport.insurance_number}</p>
                      )}
                    </div>
                    {reportPreviewData && (
                      <div className="border-t border-blue-200 pt-3 space-y-2">
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-white rounded p-2">
                            <p className="text-xs text-muted-foreground">Total Billed</p>
                            <p className="font-bold text-sm">TSh {reportPreviewData.totalBilled.toLocaleString('en', {minimumFractionDigits:2})}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-xs text-muted-foreground">Total Paid</p>
                            <p className="font-bold text-sm text-green-700">TSh {reportPreviewData.totalPaid.toLocaleString('en', {minimumFractionDigits:2})}</p>
                          </div>
                          <div className="bg-white rounded p-2">
                            <p className="text-xs text-muted-foreground">Balance</p>
                            <p className={`font-bold text-sm ${reportPreviewData.balance > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              TSh {reportPreviewData.balance.toLocaleString('en', {minimumFractionDigits:2})}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-blue-700">
                          {reportPreviewData.invoices.length} invoice(s) · {reportPreviewData.visits.length} recent visit(s)
                        </div>
                        {reportPreviewData.visits.length > 0 && (
                          <div className="text-xs space-y-1">
                            <p className="font-medium text-blue-800">Recent Visits:</p>
                            {reportPreviewData.visits.slice(0, 3).map((v: any) => (
                              <div key={v.id} className="flex justify-between bg-white rounded px-2 py-1">
                                <span>{v.visit_date ? format(new Date(v.visit_date), 'dd MMM yyyy') : '—'}</span>
                                <span className="text-muted-foreground">{v.doctor_diagnosis || v.provisional_diagnosis || 'No diagnosis'}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Report Type Selection */}
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                    <h4 className="font-medium text-gray-900 mb-3">Select Report Type</h4>
                    <div className="grid grid-cols-1 gap-3">
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="reportType"
                          value="complete"
                          defaultChecked
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Complete Medical Report</div>
                          <div className="text-sm text-gray-600">Full medical history, visits, prescriptions, lab tests, and financial summary</div>
                        </div>
                      </label>
                      
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="reportType"
                          value="medical-only"
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Medical History Only</div>
                          <div className="text-sm text-gray-600">Visits, diagnoses, prescriptions, and lab results (no financial data)</div>
                        </div>
                      </label>
                      
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="reportType"
                          value="financial-only"
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Financial Summary Only</div>
                          <div className="text-sm text-gray-600">Invoices, payments, and billing history (no medical data)</div>
                        </div>
                      </label>
                      
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="reportType"
                          value="prescriptions-only"
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Prescription History</div>
                          <div className="text-sm text-gray-600">All prescriptions and medications prescribed to this patient</div>
                        </div>
                      </label>
                      
                      <label className="flex items-center space-x-3 cursor-pointer">
                        <input
                          type="radio"
                          name="reportType"
                          value="lab-results-only"
                          className="text-blue-600"
                        />
                        <div>
                          <div className="font-medium">Laboratory Results</div>
                          <div className="text-sm text-gray-600">All lab tests and results for this patient</div>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Date Range Filter */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <h4 className="font-medium text-blue-900 mb-3">📅 Date Range Filter (Optional)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="patientReportDateFrom" className="text-sm font-medium">From Date</Label>
                        <Input
                          id="patientReportDateFrom"
                          type="date"
                          value={patientReportDateFrom}
                          onChange={(e) => setPatientReportDateFrom(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor="patientReportDateTo" className="text-sm font-medium">To Date</Label>
                        <Input
                          id="patientReportDateTo"
                          type="date"
                          value={patientReportDateTo}
                          onChange={(e) => setPatientReportDateTo(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                    </div>
                    <p className="text-xs text-blue-700 mt-2">
                      💡 Leave empty to include all records. Date range applies to visit dates, prescription dates, and test dates.
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setPatientReportDialogOpen(false);
                  setSelectedPatientForReport(null);
                  setPatientSearchTerm('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedPatientForReport) {
                    // Get selected report type
                    const reportTypeRadio = document.querySelector('input[name="reportType"]:checked') as HTMLInputElement;
                    const reportType = reportTypeRadio?.value || 'complete';
                    
                    // Generate the appropriate report
                    switch(reportType) {
                      case 'complete':
                        printIndividualPatientReport(selectedPatientForReport, patientReportDateFrom, patientReportDateTo);
                        break;
                      case 'medical-only':
                        printMedicalOnlyReport(selectedPatientForReport, patientReportDateFrom, patientReportDateTo);
                        break;
                      case 'financial-only':
                        printFinancialOnlyReport(selectedPatientForReport, patientReportDateFrom, patientReportDateTo);
                        break;
                      case 'prescriptions-only':
                        printPrescriptionsOnlyReport(selectedPatientForReport, patientReportDateFrom, patientReportDateTo);
                        break;
                      case 'lab-results-only':
                        printLabResultsOnlyReport(selectedPatientForReport, patientReportDateFrom, patientReportDateTo);
                        break;
                      default:
                        printIndividualPatientReport(selectedPatientForReport, patientReportDateFrom, patientReportDateTo);
                    }
                    
                    setPatientReportDialogOpen(false);
                    setSelectedPatientForReport(null);
                    setPatientSearchTerm('');
                    setPatientReportDateFrom('');
                    setPatientReportDateTo('');
                    setPatientReportDateFrom('');
                    setPatientReportDateTo('');
                  }
                }}
                disabled={!selectedPatientForReport}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <Printer className="h-4 w-4 mr-2" />
                Generate Report
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Invoice Selection Dialog */}
        <Dialog open={invoiceSelectionDialogOpen} onOpenChange={setInvoiceSelectionDialogOpen}>
          <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Select Invoice to Pay</DialogTitle>
              <DialogDescription>
                This patient has multiple unpaid invoices. Please select which invoice you want to make a payment for.
              </DialogDescription>
            </DialogHeader>
            
            {selectedPatientForInvoiceSelection && (
              <div className="space-y-4">
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <h4 className="font-semibold text-blue-900">Patient: {selectedPatientForInvoiceSelection.patient?.full_name}</h4>
                  <p className="text-sm text-blue-700">Total Outstanding: TSh{Number(selectedPatientForInvoiceSelection.unpaidAmount || 0).toFixed(2)}</p>
                </div>
                
                <div className="space-y-3">
                  <h5 className="font-medium">Unpaid Invoices:</h5>
                  {selectedPatientForInvoiceSelection.invoices
                    ?.filter((invoice: any) => invoice.status !== 'Paid')
                    .map((invoice: any) => (
                      <div key={invoice.id} className="border rounded-lg p-4 hover:bg-gray-50">
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <h6 className="font-medium">{getInvoiceServiceDescription(invoice)}</h6>
                            <p className="text-sm text-gray-600">
                              Date: {format(new Date(invoice.invoice_date), 'MMM dd, yyyy')}
                            </p>
                          </div>
                          <Badge variant={invoice.status === 'Partial' ? 'secondary' : 'destructive'}>
                            {invoice.status}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                          <div>
                            <span className="text-gray-500">Total:</span>
                            <div className="font-semibold">TSh{Number(invoice.total_amount || 0).toFixed(2)}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Paid:</span>
                            <div className="font-semibold">TSh{Number(invoice.paid_amount || 0).toFixed(2)}</div>
                          </div>
                          <div>
                            <span className="text-gray-500">Remaining:</span>
                            <div className="font-semibold text-red-600">
                              TSh{(Number(invoice.total_amount || 0) - Number(invoice.paid_amount || 0)).toFixed(2)}
                            </div>
                          </div>
                        </div>
                        
                        <Button
                          size="sm"
                          className="w-full bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            setInvoiceSelectionDialogOpen(false);
                            setSelectedPatientForInvoiceSelection(null);
                            handleOpenPaymentDialog(invoice);
                          }}
                        >
                          <CreditCard className="mr-2 h-4 w-4" />
                          Pay This Invoice
                        </Button>
                      </div>
                    ))}
                </div>
                
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setInvoiceSelectionDialogOpen(false);
                      setSelectedPatientForInvoiceSelection(null);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Pay All Dialog */}
        <Dialog open={payAllDialogOpen} onOpenChange={(open) => {
          setPayAllDialogOpen(open);
          if (!open) {
            setSelectedPatientForPayAll(null);
            setPayAllPaymentMethod('');
            setPayAllProcessing(false);
          }
        }}>
          <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Pay All Invoices</DialogTitle>
              <DialogDescription>
                Pay all outstanding invoices for {selectedPatientForPayAll?.patient?.full_name}
              </DialogDescription>
            </DialogHeader>
            
            {selectedPatientForPayAll && (
              <div className="space-y-4">
                <div className="border rounded-lg p-4 bg-gray-50">
                  <h4 className="font-semibold mb-2">Payment Summary</h4>
                  <div className="space-y-2 text-sm">
                    {selectedPatientForPayAll.invoices
                      .filter((inv: any) => inv.status !== 'Paid')
                      .map((invoice: any, index: number) => (
                        <div key={invoice.id} className="flex justify-between">
                          <span>{getInvoiceServiceDescription(invoice)}</span>
                          <span>TSh{(Number(invoice.total_amount) - Number(invoice.paid_amount || 0)).toFixed(2)}</span>
                        </div>
                      ))}
                    <div className="border-t pt-2 mt-2 font-semibold">
                      <div className="flex justify-between">
                        <span>Total Amount:</span>
                        <span>TSh{selectedPatientForPayAll.invoices
                          .filter((inv: any) => inv.status !== 'Paid')
                          .reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) - Number(inv.paid_amount || 0)), 0)
                          .toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Payment Method Selection */}
                <div className="space-y-2">
                  <Label>Payment Method *</Label>
                  <Select value={payAllPaymentMethod} onValueChange={setPayAllPaymentMethod}>
                    <SelectTrigger className={payAllPaymentMethod ? 'border-green-500' : 'border-red-500'}>
                      <SelectValue placeholder="Select payment method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Cash">💵 Cash</SelectItem>
                      <SelectItem value="Card">💳 Debit/Credit Card</SelectItem>
                      <SelectItem value="M-Pesa">📱 M-Pesa</SelectItem>
                      <SelectItem value="Airtel Money">📱 Airtel Money</SelectItem>
                      <SelectItem value="Tigo Pesa">📱 Tigo Pesa</SelectItem>
                      <SelectItem value="Halopesa">📱 Halopesa</SelectItem>
                      <SelectItem value="Bank Transfer">🏦 Bank Transfer</SelectItem>
                      <SelectItem value="Cheque">📄 Cheque</SelectItem>
                      <SelectItem value="Insurance">🛡️ Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                  {!payAllPaymentMethod && (
                    <p className="text-sm text-red-600">Please select a payment method</p>
                  )}
                </div>

                {/* Mobile Payment Phone Number Input */}
                {['M-Pesa', 'Airtel Money', 'Tigo Pesa', 'Halopesa'].includes(payAllPaymentMethod) && (
                  <div className="space-y-2">
                    <Label>Mobile Phone Number *</Label>
                    <Input
                      id="payall_mobile_phone"
                      type="tel"
                      placeholder="e.g., 0712345678"
                      className="border-blue-300 focus:border-blue-500"
                    />
                    <p className="text-xs text-gray-600">
                      Enter phone number in format: 07XXXXXXXX or 06XXXXXXXX
                    </p>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setPayAllDialogOpen(false)}
                    className="flex-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => handlePayAllInvoices(selectedPatientForPayAll)}
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    disabled={!payAllPaymentMethod || payAllProcessing}
                  >
                    {payAllProcessing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Pay All'
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
