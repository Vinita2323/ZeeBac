import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import { toast } from 'react-hot-toast';

export default function GSTTaxPage() {
  const navigate = useNavigate();
  const currentVendor = useAuthStore((s) => s.currentUser) || {};

  // Period Selection
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(currentDate.getMonth() + 1); // 1-12
  const [periodType, setPeriodType] = useState('monthly'); // 'monthly' | 'quarterly'
  const [selectedQuarter, setSelectedQuarter] = useState('Q3');

  // Active Tab
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'purchases' | 'sales' | 'history'

  // Data State
  const [isLoading, setIsLoading] = useState(true);
  const [reportData, setReportData] = useState(null);
  const [filingHistory, setFilingHistory] = useState([]);
  const [filterSearch, setFilterSearch] = useState('');

  // Filing Modal State
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [customArn, setCustomArn] = useState('');
  const [filingNotes, setFilingNotes] = useState('');
  const [isSubmittingFiling, setIsSubmittingFiling] = useState(false);
  const [filingReceipt, setFilingReceipt] = useState(null);

  // Invoice Details Modal
  const [selectedInvoice, setSelectedInvoice] = useState(null);

  // Month list
  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  const quarters = [
    { value: 'Q1', label: 'Q1 (Apr - Jun)' },
    { value: 'Q2', label: 'Q2 (Jul - Sep)' },
    { value: 'Q3', label: 'Q3 (Oct - Dec)' },
    { value: 'Q4', label: 'Q4 (Jan - Mar)' },
  ];

  // Fetch Report
  const fetchGSTReport = async () => {
    setIsLoading(true);
    try {
      const params = {
        year: selectedYear,
      };
      if (periodType === 'quarterly') {
        params.quarter = selectedQuarter;
      } else {
        params.month = selectedMonth;
      }

      const res = await VendorAPI.getGstReport(params);
      if (res && res.success) {
        setReportData(res.data);
      } else {
        toast.error(res?.message || 'Failed to fetch GST data');
      }
    } catch (err) {
      console.error('GST Report fetch error:', err);
      toast.error(err.response?.data?.message || 'Could not calculate GST report');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch Filing History
  const fetchFilingHistory = async () => {
    try {
      const res = await VendorAPI.getGstHistory();
      if (res && res.success) {
        setFilingHistory(res.data || res.filings || []);
      }
    } catch (err) {
      console.error('Failed to load filing history:', err);
    }
  };

  useEffect(() => {
    fetchGSTReport();
  }, [selectedYear, selectedMonth, selectedQuarter, periodType]);

  useEffect(() => {
    fetchFilingHistory();
  }, []);

  const summary = reportData?.summary || {
    totalPurchasesTaxable: 0,
    totalInputGst: 0,
    totalCgstInput: 0,
    totalSgstInput: 0,
    purchaseInvoicesCount: 0,
    totalSalesTaxable: 0,
    totalOutputGst: 0,
    totalCgstOutput: 0,
    totalSgstOutput: 0,
    salesInvoicesCount: 0,
    netGstPayable: 0,
    itcCarryForward: 0,
    isTaxPayable: false,
  };

  const filingStatus = reportData?.filingStatus || { status: 'NOT_FILED' };
  const slabs = reportData?.slabs || {};
  const purchaseInvoices = reportData?.purchaseInvoices || [];
  const salesInvoices = reportData?.salesInvoices || [];

  // Filtered Lists for Search
  const filteredPurchases = useMemo(() => {
    if (!filterSearch.trim()) return purchaseInvoices;
    const q = filterSearch.toLowerCase();
    return purchaseInvoices.filter(
      (inv) =>
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (inv.sellerName && inv.sellerName.toLowerCase().includes(q)) ||
        (inv.sellerGstin && inv.sellerGstin.toLowerCase().includes(q))
    );
  }, [purchaseInvoices, filterSearch]);

  const filteredSales = useMemo(() => {
    if (!filterSearch.trim()) return salesInvoices;
    const q = filterSearch.toLowerCase();
    return salesInvoices.filter(
      (inv) =>
        (inv.invoiceNumber && inv.invoiceNumber.toLowerCase().includes(q)) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(q)) ||
        (inv.type && inv.type.toLowerCase().includes(q))
    );
  }, [salesInvoices, filterSearch]);

  // Submit Filing Handler
  const handleFileGST = async (e) => {
    e.preventDefault();
    setIsSubmittingFiling(true);
    try {
      const currentPeriodKey = reportData?.period?.key || `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      const payload = {
        period: currentPeriodKey,
        periodName: reportData?.period?.name || `Month ${selectedMonth}-${selectedYear}`,
        arn: customArn.trim() || undefined,
        filingMode: customArn.trim() ? 'GST_PORTAL_MANUAL' : 'ZEEBAC_AUTO',
        totalSalesTaxable: summary.totalSalesTaxable,
        totalOutputGst: summary.totalOutputGst,
        totalPurchasesTaxable: summary.totalPurchasesTaxable,
        totalInputGst: summary.totalInputGst,
        netGstPayable: summary.netGstPayable,
        itcCarryForward: summary.itcCarryForward,
        notes: filingNotes,
      };

      const res = await VendorAPI.fileGst(payload);
      if (res && res.success) {
        toast.success('GST Return filed and recorded successfully!');
        setFilingReceipt(res.filing);
        setShowFilingModal(false);
        fetchGSTReport();
        fetchFilingHistory();
      } else {
        toast.error(res?.message || 'Filing failed');
      }
    } catch (err) {
      console.error('GST filing submit error:', err);
      toast.error(err.response?.data?.message || 'Failed to submit GST filing');
    } finally {
      setIsSubmittingFiling(false);
    }
  };

  // Export JSON for GST Portal
  const exportGstr1Json = () => {
    const periodKey = reportData?.period?.key || `${selectedYear}-${selectedMonth}`;
    const gstin = reportData?.vendor?.gstin || currentVendor?.gstNumber || '23AAAAA0000A1Z5';

    const gstr1Payload = {
      gstin: gstin,
      fp: periodKey.replace('-', ''),
      version: 'GSTR1_v2.0',
      hash: 'hash-mock',
      b2b: purchaseInvoices.map((inv) => ({
        ctin: inv.sellerGstin || 'UNKNOWN',
        inv: [
          {
            inum: inv.invoiceNumber,
            idt: new Date(inv.date).toLocaleDateString('en-GB'),
            val: inv.totalAmount,
            pos: '23',
            rchrg: 'N',
            inv_typ: 'R',
            itms: [
              {
                num: 1,
                itm_det: {
                  rt: inv.gstRate || 18,
                  txval: inv.taxableAmount,
                  camt: inv.cgst || inv.gstAmount / 2,
                  samt: inv.sgst || inv.gstAmount / 2,
                  csamt: 0,
                },
              },
            ],
          },
        ],
      })),
      b2cs: salesInvoices.map((inv, idx) => ({
        sply_ty: 'INTRA',
        rt: inv.gstRate || 18,
        typ: 'OE',
        pos: '23',
        txval: inv.taxableAmount,
        camt: inv.cgst || inv.gstAmount / 2,
        samt: inv.sgst || inv.gstAmount / 2,
        csamt: 0,
      })),
      summary: summary,
    };

    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(gstr1Payload, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `GSTR1_${gstin}_${periodKey}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    toast.success('GSTR-1 JSON downloaded (Ready for GST Portal)');
  };

  // Export CSV for CA / Tax Consultant
  const exportCsv = () => {
    const periodKey = reportData?.period?.key || `${selectedYear}-${selectedMonth}`;
    let csvContent = 'data:text/csv;charset=utf-8,';

    // Summary header
    csvContent += `ZEEBAC GST FILING & TAX AUDIT REPORT\r\n`;
    csvContent += `Store: ${reportData?.vendor?.storeName || currentVendor?.storeName || 'Vendor'}\r\n`;
    csvContent += `GSTIN: ${reportData?.vendor?.gstin || 'Unregistered'}\r\n`;
    csvContent += `Period: ${reportData?.period?.name || periodKey}\r\n\r\n`;

    csvContent += `SUMMARY\r\n`;
    csvContent += `Gross Sales Taxable,Output GST Liability,Wholesaler Purchases Taxable,Input Tax Credit (ITC),Net GST Payable,ITC Surplus Carry Forward\r\n`;
    csvContent += `${summary.totalSalesTaxable},${summary.totalOutputGst},${summary.totalPurchasesTaxable},${summary.totalInputGst},${summary.netGstPayable},${summary.itcCarryForward}\r\n\r\n`;

    // Inward purchases
    csvContent += `INWARD SUPPLIES (PURCHASES FROM WHOLESALERS / ITC)\r\n`;
    csvContent += `Invoice No,Wholesaler Name,Seller GSTIN,Date,Taxable Amount,GST Rate,Input GST (ITC),Total Bill\r\n`;
    purchaseInvoices.forEach((p) => {
      csvContent += `"${p.invoiceNumber}","${p.sellerName}","${p.sellerGstin}","${new Date(p.date).toLocaleDateString()}","${p.taxableAmount}","${p.gstRate}%","${p.gstAmount}","${p.totalAmount}"\r\n`;
    });
    csvContent += `\r\n`;

    // Outward sales
    csvContent += `OUTWARD SUPPLIES (CUSTOMER SALES & BILLS)\r\n`;
    csvContent += `Invoice/Bill No,Type,Channel,Date,Taxable Amount,GST Rate,Output GST Collected,Total Bill\r\n`;
    salesInvoices.forEach((s) => {
      csvContent += `"${s.invoiceNumber}","${s.type}","${s.channel}","${new Date(s.date).toLocaleDateString()}","${s.taxableAmount}","${s.gstRate}%","${s.gstAmount}","${s.totalAmount}"\r\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `GST_Report_${periodKey}.csv`);
    document.body.appendChild(link);
    link.click();
    link.remove();
    toast.success('GST CSV Export downloaded for your CA / Accountant');
  };

  // Print Report Handler
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-50/70 pb-20 font-sans text-slate-800">
      {/* ─── Top Header (Mobile & Desktop) ─── */}
      <div className="bg-gradient-to-r from-purple-800 via-indigo-900 to-purple-900 text-white px-4 pt-4 pb-6 sm:px-6 sm:pb-8 shadow-md">
        <div className="max-w-6xl mx-auto">
          {/* Top Navbar Row */}
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => navigate('/vendor')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-xs font-semibold backdrop-blur-md transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span>Dashboard</span>
            </button>

            <div className="flex items-center gap-2">
              <a
                href="https://services.gst.gov.in/services/login"
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-amber-400/20 text-amber-200 border border-amber-300/30 text-xs font-bold hover:bg-amber-400/30 transition-all cursor-pointer"
                title="Go to official GST Portal"
              >
                <span className="material-symbols-outlined text-[16px]">account_balance</span>
                <span className="hidden sm:inline">GST Portal</span>
                <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              </a>

              <button
                onClick={fetchGSTReport}
                disabled={isLoading}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-all cursor-pointer"
                title="Refresh calculations"
              >
                <span className={`material-symbols-outlined text-[18px] ${isLoading ? 'animate-spin' : ''}`}>
                  refresh
                </span>
              </button>
            </div>
          </div>

          {/* Hero Title & Identity */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full bg-purple-500/30 text-purple-200 text-[11px] font-black uppercase tracking-wider border border-purple-400/30">
                  Tax Automation
                </span>
                {filingStatus.status === 'FILED' ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-200 text-[11px] font-black uppercase tracking-wider border border-emerald-400/30 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">verified</span>
                    Return Filed
                  </span>
                ) : (
                  <span className="px-2.5 py-0.5 rounded-full bg-amber-400/30 text-amber-200 text-[11px] font-black uppercase tracking-wider border border-amber-400/30 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">pending</span>
                    Draft (Ready to File)
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight mt-1">
                GST & Tax Filing
              </h1>
              <p className="text-purple-200/80 text-xs sm:text-sm mt-0.5">
                Automatic GST calculations from Wholesaler Purchases (ITC) & Sales Invoices
              </p>
            </div>

            {/* Quick Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              {filingStatus.status !== 'FILED' ? (
                <button
                  onClick={() => setShowFilingModal(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-slate-900 font-display font-black text-xs sm:text-sm shadow-lg hover:shadow-xl hover:from-amber-300 hover:to-amber-400 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  <span>File GST Return</span>
                </button>
              ) : (
                <button
                  onClick={() => setFilingReceipt(filingStatus)}
                  className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-display font-black text-xs sm:text-sm shadow-md hover:bg-emerald-600 transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[18px]">receipt_long</span>
                  <span>Filing Receipt</span>
                </button>
              )}

              <button
                onClick={exportGstr1Json}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                title="Download JSON for gst.gov.in"
              >
                <span className="material-symbols-outlined text-[16px]">download</span>
                <span>JSON</span>
              </button>

              <button
                onClick={exportCsv}
                className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                title="Export Excel/CSV for CA"
              >
                <span className="material-symbols-outlined text-[16px]">table_chart</span>
                <span>Excel</span>
              </button>

              <button
                onClick={handlePrint}
                className="px-3 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white font-semibold text-xs transition-all active:scale-95 hidden sm:flex items-center gap-1 cursor-pointer"
                title="Print Report"
              >
                <span className="material-symbols-outlined text-[16px]">print</span>
              </button>
            </div>
          </div>

          {/* Business & GST Details Banner */}
          <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between text-xs text-purple-200/90 gap-2">
            <div className="flex items-center gap-4 flex-wrap">
              <span>
                <strong className="text-white">Store:</strong> {reportData?.vendor?.storeName || currentVendor?.storeName || 'My Store'}
              </span>
              <span>
                <strong className="text-white">GSTIN:</strong>{' '}
                <span className="font-mono px-1.5 py-0.5 rounded bg-white/10 text-amber-300 font-bold">
                  {reportData?.vendor?.gstin || currentVendor?.gstNumber || 'UNREGISTERED'}
                </span>
              </span>
              <span>
                <strong className="text-white">Zeebac ID:</strong>{' '}
                <span className="font-mono text-purple-100">{reportData?.vendor?.zeebacId || currentVendor?.zeebacId || 'ZBV-1001'}</span>
              </span>
            </div>
            {filingStatus.status === 'FILED' && filingStatus.arn && (
              <div className="text-[11px] bg-emerald-400/20 px-2 py-0.5 rounded-md border border-emerald-400/30 text-emerald-200">
                ARN: <span className="font-mono font-bold">{filingStatus.arn}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Main Content Container ─── */}
      <div className="max-w-6xl mx-auto px-4 sm:px-6 -mt-3">
        {/* Period Selector Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-3 sm:p-4 mb-4 flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Period type toggle */}
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-bold text-slate-600">
              <button
                onClick={() => setPeriodType('monthly')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  periodType === 'monthly' ? 'bg-white text-purple-800 shadow-2xs font-extrabold' : 'hover:text-slate-900'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setPeriodType('quarterly')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  periodType === 'quarterly' ? 'bg-white text-purple-800 shadow-2xs font-extrabold' : 'hover:text-slate-900'
                }`}
              >
                Quarterly
              </button>
            </div>

            {/* Year selector */}
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value, 10))}
              className="bg-slate-100 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-700 outline-none focus:border-purple-500 cursor-pointer"
            >
              <option value={2026}>FY 2026 - 2027</option>
              <option value={2025}>FY 2025 - 2026</option>
              <option value={2024}>FY 2024 - 2025</option>
            </select>
          </div>

          {/* Month or Quarter Chips */}
          <div className="w-full md:w-auto overflow-x-auto scroll-hide">
            {periodType === 'monthly' ? (
              <div className="flex items-center gap-1.5 min-w-max">
                {months.map((m) => (
                  <button
                    key={m.value}
                    onClick={() => setSelectedMonth(m.value)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedMonth === m.value
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                    }`}
                  >
                    {m.label.slice(0, 3)}
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                {quarters.map((q) => (
                  <button
                    key={q.value}
                    onClick={() => setSelectedQuarter(q.value)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      selectedQuarter === q.value
                        ? 'bg-purple-700 text-white shadow-2xs'
                        : 'bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200/60'
                    }`}
                  >
                    {q.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ─── 3 PRIMARY GST SUMMARY CARDS ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 mb-6">
          {/* CARD 1: Wholesaler Purchases (Input Tax Credit) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-indigo-100 shadow-sm relative overflow-hidden group hover:border-indigo-300 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-50/70 rounded-full -mr-8 -mt-8 pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md">
                Inward (Purchases)
              </span>
              <span className="material-symbols-outlined text-indigo-600 text-[20px]">
                shopping_cart_checkout
              </span>
            </div>

            <p className="text-xs text-slate-500 font-medium">Input Tax Credit (ITC)</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-display font-black text-slate-900">
                ₹{summary.totalInputGst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-400 text-[10px]">Taxable Purchases</p>
                <p className="font-bold text-slate-700">₹{summary.totalPurchasesTaxable.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px]">Wholesaler Invoices</p>
                <p className="font-bold text-slate-700">{summary.purchaseInvoicesCount} Invoices</p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-indigo-700 bg-indigo-50/70 px-2.5 py-1 rounded-lg">
              <span>CGST: ₹{summary.totalCgstInput.toLocaleString('en-IN')}</span>
              <span>SGST: ₹{summary.totalSgstInput.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* CARD 2: Customer Sales (Output GST Liability) */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-purple-100 shadow-sm relative overflow-hidden group hover:border-purple-300 transition-all">
            <div className="absolute top-0 right-0 w-24 h-24 bg-purple-50/70 rounded-full -mr-8 -mt-8 pointer-events-none" />
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md">
                Outward (Sales)
              </span>
              <span className="material-symbols-outlined text-purple-600 text-[20px]">
                point_of_sale
              </span>
            </div>

            <p className="text-xs text-slate-500 font-medium">Output GST Collected</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl sm:text-3xl font-display font-black text-slate-900">
                ₹{summary.totalOutputGst.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-slate-400 text-[10px]">Taxable Sales</p>
                <p className="font-bold text-slate-700">₹{summary.totalSalesTaxable.toLocaleString('en-IN')}</p>
              </div>
              <div>
                <p className="text-slate-400 text-[10px]">Customer Bills</p>
                <p className="font-bold text-slate-700">{summary.salesInvoicesCount} Orders/Bills</p>
              </div>
            </div>

            <div className="mt-2.5 flex items-center justify-between text-[11px] text-purple-700 bg-purple-50/70 px-2.5 py-1 rounded-lg">
              <span>CGST: ₹{summary.totalCgstOutput.toLocaleString('en-IN')}</span>
              <span>SGST: ₹{summary.totalSgstOutput.toLocaleString('en-IN')}</span>
            </div>
          </div>

          {/* CARD 3: Net GST Position (Payable vs Surplus) */}
          <div
            className={`rounded-2xl p-4 sm:p-5 border shadow-sm relative overflow-hidden transition-all ${
              summary.netGstPayable > 0
                ? 'bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 border-amber-300'
                : 'bg-gradient-to-br from-emerald-500/10 via-white to-emerald-500/5 border-emerald-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span
                className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${
                  summary.netGstPayable > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {summary.netGstPayable > 0 ? 'Tax Payable to Govt' : 'ITC Surplus (Carry Forward)'}
              </span>
              <span
                className={`material-symbols-outlined text-[20px] ${
                  summary.netGstPayable > 0 ? 'text-amber-600' : 'text-emerald-600'
                }`}
              >
                {summary.netGstPayable > 0 ? 'account_balance' : 'savings'}
              </span>
            </div>

            <p className="text-xs text-slate-500 font-medium">
              Net Tax = Output GST − Input Credit (ITC)
            </p>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-2xl sm:text-3xl font-display font-black ${
                  summary.netGstPayable > 0 ? 'text-amber-900' : 'text-emerald-900'
                }`}
              >
                ₹
                {summary.netGstPayable > 0
                  ? summary.netGstPayable.toLocaleString('en-IN', { maximumFractionDigits: 2 })
                  : summary.itcCarryForward.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
            </div>

            <div className="mt-3 pt-3 border-t border-slate-200/60 text-xs">
              {summary.netGstPayable > 0 ? (
                <div className="flex items-center justify-between text-amber-900 font-medium">
                  <span>Payable via GST Challan / Cash Ledger</span>
                  <span className="material-symbols-outlined text-[16px] text-amber-600">error</span>
                </div>
              ) : (
                <div className="flex items-center justify-between text-emerald-800 font-medium">
                  <span>₹0 Tax to Pay • Surplus carries forward</span>
                  <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
                </div>
              )}
            </div>

            <div className="mt-2.5">
              {filingStatus.status === 'FILED' ? (
                <div className="bg-emerald-600 text-white text-center py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1">
                  <span className="material-symbols-outlined text-[16px]">verified</span>
                  <span>Filed & Recorded</span>
                </div>
              ) : (
                <button
                  onClick={() => setShowFilingModal(true)}
                  className="w-full bg-slate-900 hover:bg-black text-white text-center py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1 active:scale-98"
                >
                  <span className="material-symbols-outlined text-[16px]">task_alt</span>
                  <span>Review & File This Period</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ─── TABS NAVIGATION ─── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-1.5 mb-4 flex items-center gap-1 overflow-x-auto scroll-hide">
          <button
            onClick={() => {
              setActiveTab('overview');
              setFilterSearch('');
            }}
            className={`flex-1 min-w-[120px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'overview'
                ? 'bg-purple-700 text-white shadow-2xs font-extrabold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">analytics</span>
            <span>Tax Slabs & Formula</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('purchases');
              setFilterSearch('');
            }}
            className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'purchases'
                ? 'bg-purple-700 text-white shadow-2xs font-extrabold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">shopping_bag</span>
            <span>Wholesaler ITC ({purchaseInvoices.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('sales');
              setFilterSearch('');
            }}
            className={`flex-1 min-w-[130px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'sales'
                ? 'bg-purple-700 text-white shadow-2xs font-extrabold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">receipt</span>
            <span>Sales & Counter ({salesInvoices.length})</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('history');
              setFilterSearch('');
            }}
            className={`flex-1 min-w-[110px] py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'history'
                ? 'bg-purple-700 text-white shadow-2xs font-extrabold'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">history</span>
            <span>Filing History ({filingHistory.length})</span>
          </button>
        </div>

        {/* ─── TAB CONTENT 1: OVERVIEW & TAX SLABS ─── */}
        {activeTab === 'overview' && (
          <div className="space-y-4">
            {/* Calculation Walkthrough Card */}
            <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm">
              <h3 className="font-display font-black text-sm sm:text-base text-slate-900 mb-2 flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-700 text-[20px]">calculate</span>
                <span>Automatic GST Calculation Formula</span>
              </h3>
              <p className="text-xs text-slate-500 mb-4">
                Under Indian GST law, a retailer subtracts the Input Tax Credit (ITC) paid on goods purchased from wholesalers/manufacturers from the Output GST collected on customer retail sales.
              </p>

              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200/80 flex flex-col md:flex-row items-center justify-between gap-4 font-mono text-xs">
                <div className="text-center md:text-left">
                  <p className="text-[10px] text-slate-400 uppercase font-sans font-bold">1. Output GST Collected</p>
                  <p className="text-base font-bold text-purple-800">
                    + ₹{summary.totalOutputGst.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-sans">Customer Sales & POS Bills</p>
                </div>

                <div className="text-slate-400 font-bold text-lg hidden md:block">−</div>

                <div className="text-center md:text-left">
                  <p className="text-[10px] text-slate-400 uppercase font-sans font-bold">2. Input Tax Credit (ITC)</p>
                  <p className="text-base font-bold text-indigo-700">
                    − ₹{summary.totalInputGst.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-sans">Wholesaler B2B Invoices</p>
                </div>

                <div className="text-slate-400 font-bold text-lg hidden md:block">=</div>

                <div className="text-center md:text-left bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[10px] text-slate-400 uppercase font-sans font-bold">
                    {summary.netGstPayable > 0 ? '3. Net Tax Payable' : '3. ITC Carried Forward'}
                  </p>
                  <p
                    className={`text-base font-bold ${
                      summary.netGstPayable > 0 ? 'text-amber-700' : 'text-emerald-700'
                    }`}
                  >
                    = ₹{summary.netGstPayable > 0 ? summary.netGstPayable.toFixed(2) : summary.itcCarryForward.toFixed(2)}
                  </p>
                  <p className="text-[10px] text-slate-500 font-sans">
                    {summary.netGstPayable > 0 ? 'To pay to Govt' : 'Carried to next month'}
                  </p>
                </div>
              </div>
            </div>

            {/* GST Tax Slab Breakdown Table */}
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="font-display font-black text-sm sm:text-base text-slate-900">
                    Tax Slab Wise Distribution (GSTR-3B Summary)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Breakdown across 0% (Exempt), 5%, 12%, 18%, and 28% slabs
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50/80 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                    <tr>
                      <th className="py-3 px-4">GST Slab</th>
                      <th className="py-3 px-4">Purchase Taxable</th>
                      <th className="py-3 px-4 text-indigo-700">Input Tax Credit (ITC)</th>
                      <th className="py-3 px-4">Sales Taxable</th>
                      <th className="py-3 px-4 text-purple-700">Output GST</th>
                      <th className="py-3 px-4 text-right">Net Position</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {['0', '5', '12', '18', '28'].map((rate) => {
                      const item = slabs[rate] || {
                        purchaseTaxable: 0,
                        inputGst: 0,
                        salesTaxable: 0,
                        outputGst: 0,
                        netGst: 0,
                      };
                      return (
                        <tr key={rate} className="hover:bg-slate-50/50 transition-colors">
                          <td className="py-3 px-4 font-bold text-slate-900">
                            <span className="px-2 py-0.5 rounded-md bg-purple-50 text-purple-800 text-[11px] font-black">
                              {rate}% GST
                            </span>
                          </td>
                          <td className="py-3 px-4 font-medium">₹{item.purchaseTaxable.toFixed(2)}</td>
                          <td className="py-3 px-4 font-bold text-indigo-700">₹{item.inputGst.toFixed(2)}</td>
                          <td className="py-3 px-4 font-medium">₹{item.salesTaxable.toFixed(2)}</td>
                          <td className="py-3 px-4 font-bold text-purple-700">₹{item.outputGst.toFixed(2)}</td>
                          <td className="py-3 px-4 text-right font-mono font-bold">
                            {item.netGst > 0 ? (
                              <span className="text-amber-700">+₹{item.netGst.toFixed(2)}</span>
                            ) : item.netGst < 0 ? (
                              <span className="text-emerald-700">ITC ₹{Math.abs(item.netGst).toFixed(2)}</span>
                            ) : (
                              <span className="text-slate-400">₹0.00</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 font-bold border-t-2 border-slate-200 text-slate-900">
                    <tr>
                      <td className="py-3 px-4 font-black">Total</td>
                      <td className="py-3 px-4">₹{summary.totalPurchasesTaxable.toFixed(2)}</td>
                      <td className="py-3 px-4 text-indigo-700">₹{summary.totalInputGst.toFixed(2)}</td>
                      <td className="py-3 px-4">₹{summary.totalSalesTaxable.toFixed(2)}</td>
                      <td className="py-3 px-4 text-purple-700">₹{summary.totalOutputGst.toFixed(2)}</td>
                      <td className="py-3 px-4 text-right font-mono">
                        {summary.netGstPayable > 0 ? (
                          <span className="text-amber-800 font-black">Payable ₹{summary.netGstPayable.toFixed(2)}</span>
                        ) : (
                          <span className="text-emerald-800 font-black">Surplus ₹{summary.itcCarryForward.toFixed(2)}</span>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ─── TAB CONTENT 2: PURCHASES FROM WHOLESALERS (ITC) ─── */}
        {activeTab === 'purchases' && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search by wholesaler name, invoice number, or GSTIN..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-purple-500 font-medium"
                />
              </div>
              <button
                onClick={exportCsv}
                className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>Export Invoices</span>
              </button>
            </div>

            {filteredPurchases.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center text-slate-400">
                <span className="material-symbols-outlined text-[44px] text-slate-300 mb-2">
                  receipt_long
                </span>
                <p className="font-bold text-slate-600 text-sm">No Wholesaler Invoices Found</p>
                <p className="text-xs text-slate-400 mt-1">
                  Purchases made from wholesalers via B2B Invoices will automatically appear here with claimable Input Tax Credit (ITC).
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">Invoice #</th>
                        <th className="py-3 px-4">Wholesaler / Supplier</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Taxable Value</th>
                        <th className="py-3 px-4">GST Rate</th>
                        <th className="py-3 px-4 text-indigo-700">Input GST (ITC)</th>
                        <th className="py-3 px-4">Total Amount</th>
                        <th className="py-3 px-4 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredPurchases.map((inv) => (
                        <tr key={inv.id || inv.invoiceNumber} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-purple-900">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-900">{inv.sellerName}</p>
                            <p className="text-[10px] text-slate-400 font-mono">
                              GSTIN: {inv.sellerGstin || 'Not Provided'}
                            </p>
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(inv.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 font-medium">₹{inv.taxableAmount.toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {inv.gstRate}%
                            </span>
                          </td>
                          <td className="py-3 px-4 font-black text-indigo-700">
                            ₹{inv.gstAmount.toFixed(2)}
                            <div className="text-[9px] text-slate-400 font-normal">
                              CGST: ₹{(inv.cgst || inv.gstAmount / 2).toFixed(1)} | SGST: ₹{(inv.sgst || inv.gstAmount / 2).toFixed(1)}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            ₹{inv.totalAmount.toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold inline-flex items-center gap-0.5">
                              <span className="material-symbols-outlined text-[12px]">verified</span>
                              Eligible ITC
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB CONTENT 3: CUSTOMER SALES (OUTPUT SUPPLIES) ─── */}
        {activeTab === 'sales' && (
          <div className="space-y-4">
            {/* Search Bar */}
            <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex items-center justify-between gap-3">
              <div className="relative flex-1">
                <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  placeholder="Search sales invoices, order ID, channel..."
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 text-xs rounded-xl bg-slate-50 border border-slate-200 outline-none focus:border-purple-500 font-medium"
                />
              </div>
              <button
                onClick={exportCsv}
                className="px-3 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer shrink-0"
              >
                <span className="material-symbols-outlined text-[16px]">file_download</span>
                <span>Export Sales</span>
              </button>
            </div>

            {filteredSales.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center text-slate-400">
                <span className="material-symbols-outlined text-[44px] text-slate-300 mb-2">
                  point_of_sale
                </span>
                <p className="font-bold text-slate-600 text-sm">No Sales Invoices in Period</p>
                <p className="text-xs text-slate-400 mt-1">
                  POS counter bills, app customer orders, and scanned counter transactions automatically register here.
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-[10px] font-bold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">Invoice / Bill ID</th>
                        <th className="py-3 px-4">Channel & Type</th>
                        <th className="py-3 px-4">Date</th>
                        <th className="py-3 px-4">Taxable Value</th>
                        <th className="py-3 px-4">GST Rate</th>
                        <th className="py-3 px-4 text-purple-700">Output GST</th>
                        <th className="py-3 px-4">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSales.map((inv) => (
                        <tr key={inv.id || inv.invoiceNumber} className="hover:bg-slate-50/60 transition-colors">
                          <td className="py-3 px-4 font-mono font-bold text-slate-900">
                            {inv.invoiceNumber}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inv.type === 'POS_BILL'
                                  ? 'bg-blue-100 text-blue-800'
                                  : inv.type === 'APP_ORDER'
                                  ? 'bg-purple-100 text-purple-800'
                                  : 'bg-amber-100 text-amber-800'
                              }`}
                            >
                              {inv.type === 'POS_BILL' ? 'POS Counter' : inv.type === 'APP_ORDER' ? 'App Order' : 'Store Counter'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(inv.date).toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </td>
                          <td className="py-3 px-4 font-medium">₹{inv.taxableAmount.toFixed(2)}</td>
                          <td className="py-3 px-4">
                            <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-bold text-[10px]">
                              {inv.gstRate}%
                            </span>
                          </td>
                          <td className="py-3 px-4 font-black text-purple-700">
                            ₹{inv.gstAmount.toFixed(2)}
                            <div className="text-[9px] text-slate-400 font-normal">
                              CGST: ₹{(inv.cgst || inv.gstAmount / 2).toFixed(1)} | SGST: ₹{(inv.sgst || inv.gstAmount / 2).toFixed(1)}
                            </div>
                          </td>
                          <td className="py-3 px-4 font-bold text-slate-900">
                            ₹{inv.totalAmount.toFixed(2)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ─── TAB CONTENT 4: FILING HISTORY ─── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            {filingHistory.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 border border-slate-100 text-center text-slate-400">
                <span className="material-symbols-outlined text-[44px] text-slate-300 mb-2">
                  history_edu
                </span>
                <p className="font-bold text-slate-600 text-sm">No Returns Filed Yet</p>
                <p className="text-xs text-slate-400 mt-1">
                  Once you file your first GST return using the button above, your filing ARN and receipts will be permanently recorded here.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filingHistory.map((item) => (
                  <div
                    key={item._id || item.arn}
                    className="bg-white rounded-2xl p-5 border border-slate-100 shadow-sm hover:border-purple-200 transition-all"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-black uppercase text-purple-800 bg-purple-50 px-2 py-0.5 rounded-md">
                        {item.periodName || item.period}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        FILED
                      </span>
                    </div>

                    <div className="space-y-1.5 my-3 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-400">Filing ARN:</span>
                        <span className="font-mono font-bold text-slate-800">{item.arn}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Filed On:</span>
                        <span className="text-slate-700">
                          {new Date(item.filedAt).toLocaleString('en-IN', {
                            dateStyle: 'medium',
                            timeStyle: 'short',
                          })}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Gross Sales Taxable:</span>
                        <span className="font-bold text-slate-800">₹{item.totalSalesTaxable?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Output GST Collected:</span>
                        <span className="font-bold text-purple-700">₹{item.totalOutputGst?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Input Tax Credit (ITC):</span>
                        <span className="font-bold text-indigo-700">₹{item.totalInputGst?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t border-slate-100">
                        <span className="text-slate-600 font-bold">Net Position:</span>
                        <span className="font-black text-slate-900">
                          {item.netGstPayable > 0 ? `Paid ₹${item.netGstPayable?.toFixed(2)}` : `Surplus ₹${item.itcCarryForward?.toFixed(2)}`}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => setFilingReceipt(item)}
                      className="w-full mt-2 py-1.5 rounded-xl bg-slate-100 hover:bg-purple-50 text-slate-700 hover:text-purple-700 font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">receipt</span>
                      <span>View Filing Receipt</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── MODAL: FILE GST RETURN ─── */}
      {showFilingModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-800 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">send</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-base text-slate-900">
                    File GST Return
                  </h3>
                  <p className="text-xs text-slate-400">
                    Period: {reportData?.period?.name || `${selectedMonth}/${selectedYear}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowFilingModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleFileGST} className="mt-4 space-y-4">
              {/* Summary Review Box */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Gross Sales Value:</span>
                  <span className="font-bold text-slate-800">₹{summary.totalSalesTaxable.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Total Output GST (Liability):</span>
                  <span className="font-bold text-purple-700">₹{summary.totalOutputGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Wholesaler Input Credit (ITC):</span>
                  <span className="font-bold text-indigo-700">₹{summary.totalInputGst.toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-slate-200 font-bold text-sm">
                  <span className="text-slate-800">Net GST Liability:</span>
                  <span className={summary.netGstPayable > 0 ? 'text-amber-800' : 'text-emerald-800'}>
                    {summary.netGstPayable > 0
                      ? `₹${summary.netGstPayable.toFixed(2)} Payable`
                      : `₹${summary.itcCarryForward.toFixed(2)} ITC Surplus`}
                  </span>
                </div>
              </div>

              {/* ARN Input */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  GST ARN Number (Optional)
                </label>
                <input
                  type="text"
                  placeholder="Leave empty to auto-generate official Zeebac filing ARN"
                  value={customArn}
                  onChange={(e) => setCustomArn(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 outline-none focus:border-purple-500 font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  If already filed on gst.gov.in, paste your portal ARN here; otherwise Zeebac will issue a verified return acknowledgement.
                </p>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Notes / Auditor Reference
                </label>
                <input
                  type="text"
                  placeholder="e.g. Verified by CA Sharma & Associates"
                  value={filingNotes}
                  onChange={(e) => setFilingNotes(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-xl bg-white border border-slate-200 outline-none focus:border-purple-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowFilingModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingFiling}
                  className="px-5 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingFiling ? (
                    <>
                      <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                      <span>Submitting...</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check_circle</span>
                      <span>Confirm & File Return</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── MODAL: FILING RECEIPT ─── */}
      {filingReceipt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                <span className="material-symbols-outlined text-[32px]">verified</span>
              </div>
              <h3 className="font-display font-black text-lg text-slate-900">
                GST Return Filed Successfully!
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Government Acknowledgement & Tax Certificate
              </p>
            </div>

            <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200/80 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-400">ARN Number:</span>
                <span className="font-mono font-bold text-slate-900">{filingReceipt.arn}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Acknowledgement No:</span>
                <span className="font-mono text-slate-800">{filingReceipt.acknowledgementNumber || 'ACK-ZEEBAC-VERIFIED'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Filing Period:</span>
                <span className="font-bold text-slate-800">{filingReceipt.periodName || filingReceipt.period}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">GSTIN:</span>
                <span className="font-mono font-bold text-purple-800">
                  {filingReceipt.gstin || reportData?.vendor?.gstin || currentVendor?.gstNumber || 'UNREGISTERED'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Net Tax Paid:</span>
                <span className="font-bold text-slate-900">
                  ₹{filingReceipt.netGstPayable ? filingReceipt.netGstPayable.toFixed(2) : '0.00'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">ITC Carried Forward:</span>
                <span className="font-bold text-emerald-700">
                  ₹{filingReceipt.itcCarryForward ? filingReceipt.itcCarryForward.toFixed(2) : '0.00'}
                </span>
              </div>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => setFilingReceipt(null)}
                className="px-4 py-2 rounded-xl bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold transition-all cursor-pointer w-full"
              >
                Close Receipt
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
