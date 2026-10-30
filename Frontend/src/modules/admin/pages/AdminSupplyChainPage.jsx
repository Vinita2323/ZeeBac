import { useState, useEffect } from 'react';
import { B2BAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

export default function AdminSupplyChainPage() {
  const [activeTab, setActiveTab] = useState('catalogue'); // 'catalogue' | 'invoices' | 'ledger'

  // Data states
  const [catalogue, setCatalogue] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Search & Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [expandedMasterId, setExpandedMasterId] = useState(null);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Load data based on active tab
  useEffect(() => {
    fetchData();
  }, [activeTab, page, statusFilter]);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      if (activeTab === 'catalogue') {
        const res = await B2BAPI.getAdminSupplyChainCatalogue({
          search: searchQuery || undefined,
          page,
          limit: 15,
        });
        if (res.success) {
          setCatalogue(res.data || []);
          setTotalPages(res.pagination?.totalPages || 1);
          setTotalCount(res.pagination?.total || 0);
        }
      } else if (activeTab === 'invoices') {
        const params = { page, limit: 15 };
        if (searchQuery) params.invoiceNumber = searchQuery;
        if (statusFilter !== 'ALL') params.paymentStatus = statusFilter;

        const res = await B2BAPI.getAdminInvoices(params);
        if (res.success) {
          setInvoices(res.data || []);
          setTotalPages(res.pagination?.totalPages || 1);
          setTotalCount(res.pagination?.total || 0);
        }
      } else if (activeTab === 'ledger') {
        const params = { page, limit: 25 };
        if (searchQuery) params.productIdString = searchQuery;
        if (statusFilter !== 'ALL') params.movementType = statusFilter;

        const res = await B2BAPI.getAdminStockLedger(params);
        if (res.success) {
          setLedger(res.data || []);
          setTotalPages(res.pagination?.totalPages || 1);
          setTotalCount(res.pagination?.total || 0);
        }
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to load supply chain data');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchData();
  };

  return (
    <div className="space-y-6 text-left">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[28px]">hub</span>
            Supply Chain & Product Master Control
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            End-to-end product genealogy, barcode tracking, and verified stock transfers across all tiers.
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
          <button
            onClick={() => { setActiveTab('catalogue'); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'catalogue' ? 'bg-white text-primary shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Master Catalogue ({activeTab === 'catalogue' ? totalCount : 'Catalogue'})
          </button>
          <button
            onClick={() => { setActiveTab('invoices'); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'invoices' ? 'bg-white text-primary shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            B2B Invoices ({activeTab === 'invoices' ? totalCount : 'Invoices'})
          </button>
          <button
            onClick={() => { setActiveTab('ledger'); setPage(1); }}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'ledger' ? 'bg-white text-primary shadow-xs font-black' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Stock Audit Ledger
          </button>
        </div>
      </div>

      {/* Filter / Search Bar */}
      <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm flex flex-col sm:flex-row gap-3 items-center justify-between">
        <form onSubmit={handleSearchSubmit} className="flex-1 flex gap-2 w-full">
          <div className="relative flex-1">
            <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-[20px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                activeTab === 'catalogue'
                  ? 'Search by Product ID (e.g. ZBP-100200), barcode, name...'
                  : activeTab === 'invoices'
                  ? 'Search by invoice number (e.g. INV-B2B)...'
                  : 'Search by Product ID, barcode, or UTR...'
              }
              className="w-full h-11 pl-11 pr-4 bg-slate-50 border border-slate-200 rounded-2xl text-[13px] font-medium text-slate-900 outline-none focus:border-primary transition-all"
            />
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-2xl bg-primary text-white font-bold text-xs hover:bg-primary-dark transition-all cursor-pointer"
          >
            Filter
          </button>
        </form>

        {activeTab === 'invoices' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="ALL">All Payments</option>
              <option value="PAID">Paid / Transferred</option>
              <option value="PENDING">Pending Payment</option>
            </select>
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-500">Movement:</span>
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-11 px-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-800 outline-none cursor-pointer"
            >
              <option value="ALL">All (IN & OUT)</option>
              <option value="IN">IN (Stock Received)</option>
              <option value="OUT">OUT (Stock Dispatched)</option>
            </select>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="py-20 flex flex-col items-center justify-center space-y-3">
          <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-xs font-bold text-slate-400">Loading supply chain telemetry...</p>
        </div>
      ) : activeTab === 'catalogue' ? (
        /* ── TAB 1: MASTER CATALOGUE & CIRCULATION ── */
        <div className="space-y-4">
          {catalogue.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm space-y-2">
              <span className="material-symbols-outlined text-slate-300 text-[48px]">inventory</span>
              <p className="font-bold text-slate-700">No master products found</p>
              <p className="text-xs text-slate-400">Manufacturer product masters will appear here once created.</p>
            </div>
          ) : (
            catalogue.map((product) => {
              const isExpanded = expandedMasterId === product._id;
              return (
                <div
                  key={product._id}
                  className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm space-y-4 hover:border-slate-200 transition-all"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex items-start gap-4">
                      <div className="w-16 h-16 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center p-2 shrink-0">
                        {product.image ? (
                          <img src={product.image} alt={product.name} className="w-full h-full object-contain" />
                        ) : (
                          <span className="material-symbols-outlined text-slate-400 text-[28px]">inventory_2</span>
                        )}
                      </div>

                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-black text-slate-900 text-base">{product.name}</h3>
                          <span className="px-2 py-0.5 rounded-full bg-purple-50 text-primary font-bold text-[10px] uppercase">
                            {product.category || 'General'}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 font-mono">
                          {product.productId && (
                            <span className="font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-lg border border-indigo-100">
                              PID: {product.productId}
                            </span>
                          )}
                          {product.barcode && (
                            <span className="bg-slate-100 px-2 py-0.5 rounded-lg border border-slate-200 text-slate-700">
                              EAN: {product.barcode}
                            </span>
                          )}
                          <span>Cashback: <strong className="text-emerald-600 font-bold">{product.cashbackPercentage || 0}%</strong> (Locked)</span>
                        </div>

                        <p className="text-xs text-slate-500">
                          Manufacturer: <strong>{product.vendorId?.storeName || product.vendorId?.ownerName || 'Root Manufacturer'}</strong>{' '}
                          <span className="font-mono text-slate-400">({product.vendorId?.zeebacId})</span>
                        </p>
                      </div>
                    </div>

                    {/* Stock Overview Pills */}
                    <div className="flex flex-wrap items-center gap-3 md:justify-end">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100 text-right">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Manufacturer Stock</p>
                        <p className="font-black text-base text-slate-900 font-mono">{product.stock} {product.unit || 'Pcs'}</p>
                      </div>
                      <div className="bg-emerald-50 p-3 rounded-2xl border border-emerald-100 text-right">
                        <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Total in Circulation</p>
                        <p className="font-black text-base text-emerald-800 font-mono">
                          {product.totalStockInCirculation} {product.unit || 'Pcs'}
                        </p>
                      </div>
                      <button
                        onClick={() => setExpandedMasterId(isExpanded ? null : product._id)}
                        className="h-11 px-3.5 rounded-2xl bg-purple-50 hover:bg-purple-100 text-primary font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer"
                      >
                        <span>{product.downstreamHoldersCount || 0} Holders</span>
                        <span className="material-symbols-outlined text-[16px]">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Expandable Downstream Holdings Table */}
                  {isExpanded && (
                    <div className="pt-4 border-t border-slate-100 space-y-2">
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                        Supply Chain Holdings Breakdown
                      </h4>
                      <div className="overflow-x-auto rounded-2xl border border-slate-100">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                            <tr>
                              <th className="px-4 py-2.5">Tier</th>
                              <th className="px-4 py-2.5">Merchant Name</th>
                              <th className="px-4 py-2.5">Zeebac ID</th>
                              <th className="px-4 py-2.5">City</th>
                              <th className="px-4 py-2.5 text-right">Stock Held</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {product.holdings?.map((h, idx) => (
                              <tr key={idx} className={h.isRoot ? 'bg-purple-50/40 font-bold' : ''}>
                                <td className="px-4 py-2.5">
                                  <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                                    h.tier === 'Manufacturer' ? 'bg-purple-100 text-purple-800' :
                                    h.tier === 'Wholesaler' ? 'bg-blue-100 text-blue-800' :
                                    h.tier === 'Distributor' ? 'bg-amber-100 text-amber-800' :
                                    'bg-emerald-100 text-emerald-800'
                                  }`}>
                                    {h.tier}
                                  </span>
                                </td>
                                <td className="px-4 py-2.5 text-slate-900">
                                  {h.vendor?.storeName || h.vendor?.ownerName}
                                  {h.isRoot && <span className="ml-1.5 text-[10px] text-primary">(Master)</span>}
                                </td>
                                <td className="px-4 py-2.5 font-mono text-slate-600">{h.vendor?.zeebacId}</td>
                                <td className="px-4 py-2.5 text-slate-500">{h.vendor?.city || '-'}</td>
                                <td className="px-4 py-2.5 text-right font-mono font-bold text-slate-900">
                                  {h.stock} {product.unit || 'Pcs'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      ) : activeTab === 'invoices' ? (
        /* ── TAB 2: B2B INVOICES ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Invoice Number</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Seller (Supplier)</th>
                  <th className="px-4 py-3">Buyer</th>
                  <th className="px-4 py-3">Items / Qty</th>
                  <th className="px-4 py-3">Amount</th>
                  <th className="px-4 py-3">Payment</th>
                  <th className="px-4 py-3">Stock Transfer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-slate-400 font-medium">
                      No B2B invoices found.
                    </td>
                  </tr>
                ) : (
                  invoices.map((inv) => (
                    <tr key={inv._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono font-black text-slate-900">{inv.invoiceNumber}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(inv.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">{inv.sellerDetails?.storeName || inv.sellerId?.storeName}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {inv.sellerDetails?.zeebacId || inv.sellerId?.zeebacId} ({inv.sellerDetails?.businessType})
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-800">{inv.buyerDetails?.storeName || inv.buyerId?.storeName}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {inv.buyerDetails?.zeebacId || inv.buyerId?.zeebacId} ({inv.buyerDetails?.businessType})
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-800">{inv.items?.length || 0} lines</span>
                        <span className="text-slate-400"> ({inv.totalQuantity} units)</span>
                      </td>
                      <td className="px-4 py-3 font-mono font-black text-primary text-[13px]">
                        ₹{inv.totalAmount?.toFixed(2)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          inv.paymentStatus === 'PAID' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}>
                          {inv.paymentStatus} • {inv.paymentMethod}
                        </span>
                        {inv.upiDetails?.utr && (
                          <p className="font-mono text-[10px] text-slate-400 mt-0.5">UTR: {inv.upiDetails.utr}</p>
                        )}
                        {inv.cashDetails?.receivedBy && (
                          <p className="text-[10px] text-slate-400 mt-0.5">Auth: {inv.cashDetails.receivedBy}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {inv.isTransferred ? (
                          <span className="inline-flex items-center gap-1 text-emerald-700 font-bold text-[11px]">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span>
                            Transferred
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px] font-medium">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* ── TAB 3: STOCK AUDIT LEDGER ── */
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-4 py-3">Movement ID</th>
                  <th className="px-4 py-3">Date & Time</th>
                  <th className="px-4 py-3">Source Merchant</th>
                  <th className="px-4 py-3">Destination Merchant</th>
                  <th className="px-4 py-3">Product ID & Barcode</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3 text-right">Qty</th>
                  <th className="px-4 py-3 text-right">Stock (Before &rarr; After)</th>
                  <th className="px-4 py-3">Reference / UTR</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-slate-400 font-medium">
                      No stock movements recorded yet.
                    </td>
                  </tr>
                ) : (
                  ledger.map((mov) => (
                    <tr key={mov._id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="px-4 py-3 font-mono font-bold text-slate-900">
                        {mov.movementId || mov._id.slice(-8)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">
                        {new Date(mov.createdAt).toLocaleString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {mov.sourceZeebacId || mov.sourceMerchantId?.zeebacId || '-'}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-700">
                        {mov.destinationZeebacId || mov.destinationMerchantId?.zeebacId || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 truncate max-w-[180px]">{mov.productName}</p>
                        <p className="font-mono text-[10px] text-slate-400">
                          {mov.productIdString ? `PID: ${mov.productIdString}` : ''}{' '}
                          {mov.barcode ? `EAN: ${mov.barcode}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                          mov.movementType === 'IN' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
                        }`}>
                          {mov.movementType} ({mov.reason})
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-slate-900">
                        {mov.quantity}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-slate-600">
                        {mov.previousStock} &rarr; <strong className="text-slate-900">{mov.newStock}</strong>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-slate-500">
                        {mov.invoiceNumber && <div>Inv: {mov.invoiceNumber}</div>}
                        {mov.paymentReference && <div>Ref: {mov.paymentReference}</div>}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-xs text-slate-500 font-medium">
            Page {page} of {totalPages} ({totalCount} total entries)
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 disabled:opacity-40 cursor-pointer"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
