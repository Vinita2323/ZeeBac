import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserAPI } from '../../../services/api';
import useAuthStore from '../../../store/useAuthStore';
import { generateReceiptPDF } from '../../../utils/exportUtils';

export default function StoreBillsSubView({ onBack, t = (k, d) => d || k }) {
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const [bills, setBills] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [selectedBill, setSelectedBill] = useState(null);

  const formatDateTime = (val, opts = { dateStyle: 'short', timeStyle: 'short' }) => {
    if (!val) return 'Recently';
    try {
      const d = new Date(val);
      return isNaN(d.getTime()) ? String(val) : d.toLocaleString('en-IN', opts);
    } catch {
      return String(val);
    }
  };

  useEffect(() => {
    const fetchBills = async () => {
      setIsLoading(true);
      try {
        const [billsRes, txnRes] = await Promise.all([
          UserAPI.getCustomerBills().catch(() => ({ success: false, data: [] })),
          UserAPI.getMyTransactions().catch(() => ({ success: false, data: [] })),
        ]);

        if (billsRes && billsRes.success && Array.isArray(billsRes.data) && billsRes.data.length > 0) {
          setBills(billsRes.data);
        } else {
          // Fallback: extract bills from transaction history
          const extracted = [];
          const seen = new Set();
          if (txnRes && txnRes.success && Array.isArray(txnRes.data)) {
            txnRes.data.forEach((tx) => {
              const bKey = tx.billNumber || tx.transactionId;
              if (bKey && !seen.has(bKey)) {
                seen.add(bKey);
                extracted.push({
                  id: tx._id,
                  transactionId: tx.transactionId,
                  billNumber: tx.billNumber || tx.transactionId,
                  date: tx.createdAt || tx.timestamp || new Date(),
                  vendorStoreName: tx.vendorName || tx.vendorId?.storeName || 'Zeebac Partner Store',
                  vendorZeebacId: tx.vendorZeebacId || tx.vendorId?.zeebacId || 'ZBV-STORE',
                  vendorPhone: tx.vendorPhone || tx.vendorId?.phone || '',
                  vendorAddress: tx.vendorAddress || 'Verified Merchant Store',
                  customerName: tx.customerName || currentUser?.name || 'Valued Customer',
                  customerZeebacId: tx.customerZeebacId || currentUser?.zeebacId,
                  paymentMethod: tx.paymentMethod || 'Cash',
                  items: Array.isArray(tx.items) && tx.items.length > 0 ? tx.items : [
                    { name: 'Store Purchase', quantity: 1, price: tx.amount, total: tx.amount }
                  ],
                  amount: tx.amount,
                  cashbackAmount: tx.cashbackAmount || 0,
                  cashbackPercent: tx.cashbackPercent || 0,
                  status: tx.status || 'Approved',
                });
              }
            });
          }
          setBills(extracted);
        }
      } catch (err) {
        console.error('Failed to load store bills', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchBills();
  }, [currentUser]);

  const filteredBills = bills.filter((b) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      (b.vendorStoreName || '').toLowerCase().includes(q) ||
      (b.billNumber || '').toLowerCase().includes(q) ||
      (b.vendorZeebacId || '').toLowerCase().includes(q) ||
      (b.items || []).some((it) => (it.name || '').toLowerCase().includes(q))
    );
  });

  const totalCashbackEarned = bills.reduce((acc, b) => acc + Number(b.cashbackAmount || 0), 0);

  return (
    <div className="bg-white min-h-screen text-on-surface flex flex-col font-body-lg pb-10">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3 border-b border-slate-100 flex items-center justify-between shadow-xs">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-full flex items-center justify-center text-slate-700 hover:bg-slate-100 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </button>
          <div>
            <h1 className="font-display text-[16px] font-black text-slate-900 leading-tight">
              {t('My Store Invoices & Bills', 'My Store Invoices & Bills')}
            </h1>
            <p className="text-[10.5px] text-slate-500 font-medium">
              {bills.length} {t('invoices generated at store counters', 'store invoices recorded')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowSearch(!showSearch)}
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
            showSearch ? 'bg-primary text-white' : 'text-slate-600 hover:bg-slate-100'
          }`}
          title="Search Bills"
        >
          <span className="material-symbols-outlined text-[19px]">search</span>
        </button>
      </header>

      {/* Main Body */}
      <main className="max-w-md mx-auto w-full px-4 py-3 space-y-3 flex-1">
        {/* Search Bar Input */}
        {showSearch && (
          <div className="relative animate-reveal">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">
              search
            </span>
            <input
              type="text"
              placeholder={t('Search by store, bill no or item...')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 pl-9 pr-9 py-2.5 rounded-xl text-xs text-slate-800 border border-slate-200 focus:border-primary focus:bg-white transition-all outline-none"
              autoFocus
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            )}
          </div>
        )}

        {/* Quick Stats Banner */}
        <div className="bg-gradient-to-r from-purple-50 via-fuchsia-50/40 to-emerald-50/50 rounded-2xl p-3.5 border border-purple-100/80 flex items-center justify-between">
          <div>
            <p className="text-[10px] text-purple-700 uppercase font-bold tracking-wider">
              {t('Total Store Bills', 'Total Store Bills')}
            </p>
            <p className="font-display font-black text-xl text-purple-950 mt-0.5">
              {bills.length}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-emerald-700 uppercase font-bold tracking-wider flex items-center justify-end gap-1">
              <span className="material-symbols-outlined text-[12px]">redeem</span>
              {t('Total Cashback Earned', 'Cashback Earned')}
            </p>
            <p className="font-display font-black text-xl text-emerald-600 mt-0.5">
              +₹{totalCashbackEarned.toLocaleString('en-IN')}
            </p>
          </div>
        </div>

        {/* Loading Spinner */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-48 space-y-2">
            <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
            <p className="text-xs text-slate-500 font-medium">Loading store purchase bills...</p>
          </div>
        ) : filteredBills.length > 0 ? (
          /* Store Bills List */
          <div className="space-y-3">
            {filteredBills.map((bill) => (
              <div
                key={bill.id || bill.billNumber}
                className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-xs hover:border-purple-300 hover:shadow-md transition-all space-y-2.5 text-left"
              >
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 border border-purple-100 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[22px]">receipt_long</span>
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-display font-black text-[14px] text-slate-900 truncate">
                        {bill.vendorStoreName || 'Zeebac Store'}
                      </h4>
                      <p className="text-[11px] text-slate-500 font-medium flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono font-bold text-purple-700 bg-purple-50 px-1.5 py-0.2 rounded text-[10px] border border-purple-200/60">
                          {bill.vendorZeebacId || 'ZBV-STORE'}
                        </span>
                        <span>•</span>
                        <span className="font-mono font-semibold text-slate-700">{bill.billNumber}</span>
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="font-mono font-black text-[15px] text-slate-900 leading-tight">
                      ₹{Number(bill.amount || 0).toLocaleString('en-IN')}
                    </p>
                    <span className="inline-flex items-center gap-0.5 text-[9.5px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 mt-0.5">
                      <span className="material-symbols-outlined text-[11px]">redeem</span>
                      +{Number(bill.cashbackAmount || 0)} Cashback
                    </span>
                  </div>
                </div>

                {/* Items preview */}
                <div className="bg-slate-50/80 rounded-xl p-2.5 text-[11px] text-slate-600 space-y-1">
                  <div className="flex items-center justify-between text-[10.5px] font-bold text-slate-400 uppercase tracking-wider">
                    <span>Items ({(bill.items || []).length})</span>
                    <span className="font-mono font-normal lowercase">{bill.paymentMethod || 'Cash'}</span>
                  </div>
                  <div className="space-y-0.5">
                    {(bill.items || []).slice(0, 3).map((it, idx) => (
                      <div key={idx} className="flex justify-between items-center text-slate-700 text-[11px]">
                        <span className="truncate pr-2 font-medium">{it.name} (x{it.quantity})</span>
                        <span className="font-mono font-medium shrink-0">₹{it.total || (it.price * it.quantity)}</span>
                      </div>
                    ))}
                    {(bill.items || []).length > 3 && (
                      <p className="text-[10px] text-slate-400 font-medium italic pt-0.5">
                        +{(bill.items.length - 3)} more items
                      </p>
                    )}
                  </div>
                </div>

                {/* Date & Actions */}
                <div className="flex items-center justify-between pt-0.5">
                  <span className="text-[10.5px] text-slate-400 font-medium">
                    {formatDateTime(bill.date || bill.createdAt || bill.timestamp)}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => generateReceiptPDF(bill)}
                      className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] flex items-center gap-1 cursor-pointer transition-colors"
                      title="Download Receipt PDF"
                    >
                      <span className="material-symbols-outlined text-[14px]">download</span>
                      <span>Download</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedBill(bill)}
                      className="px-3 py-1.5 rounded-xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-[11px] flex items-center gap-1 cursor-pointer shadow-xs active:scale-95 transition-all"
                    >
                      <span className="material-symbols-outlined text-[14px]">visibility</span>
                      <span>View Bill</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* Empty State */
          <div className="py-14 text-center space-y-2 opacity-65">
            <span className="material-symbols-outlined text-[42px] text-purple-600">receipt_long</span>
            <p className="text-sm font-bold text-slate-800">{t('No store bills found')}</p>
            <p className="text-[11.5px] text-slate-500 max-w-xs mx-auto">
              {searchQuery
                ? t('No bills matched your search keyword.')
                : t('When you shop at any partner retail store and enter your Zeebac ID or mobile number, itemized bills with instant cashback appear here.')}
            </p>
          </div>
        )}
      </main>

      {/* ─── MODAL: THERMAL POS RECEIPT (MATCHING SCREENSHOT media_1794940746404_eef49dbe.jpg) ─── */}
      {selectedBill && createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-reveal"
          onClick={() => setSelectedBill(null)}
        >
          <div
            className="bg-white rounded-3xl max-w-[420px] w-full shadow-2xl p-5 sm:p-6 text-left space-y-4 relative max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSelectedBill(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>

            {/* Printable Thermal POS Slip Card */}
            <div className="border border-slate-200 rounded-2xl p-4 sm:p-5 bg-white text-slate-800 font-mono text-xs space-y-3 shadow-xs">
              {/* Store Brand Header */}
              <div className="text-center space-y-0.5 border-b border-dashed border-slate-300 pb-3">
                <div className="w-10 h-10 mx-auto rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold mb-1 shadow-xs">
                  <span className="material-symbols-outlined text-[22px]">storefront</span>
                </div>
                <h3 className="font-display font-black text-base text-slate-900 tracking-wide uppercase">
                  {selectedBill.vendorStoreName || selectedBill.vendorName || selectedBill.storeName || 'Zeebac Store'}
                </h3>
                <p className="text-[11px] text-slate-500 font-sans">
                  Zeebac Store ID: <span className="font-mono font-bold text-purple-700">{selectedBill.vendorZeebacId || 'ZBV-STORE'}</span>
                </p>
                <p className="text-[10px] text-slate-500 font-sans">Verified Merchant Store</p>
                {selectedBill.vendorPhone && (
                  <p className="text-[10px] text-slate-500 font-sans">Ph: {selectedBill.vendorPhone}</p>
                )}
                {selectedBill.vendorAddress && (
                  <p className="text-[9.5px] text-slate-400 font-sans truncate max-w-[280px] mx-auto">
                    {selectedBill.vendorAddress}
                  </p>
                )}
              </div>

              {/* Invoice & Customer Meta */}
              <div className="space-y-1 text-[11px] border-b border-dashed border-slate-300 pb-2.5">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Tax Invoice / Bill No:</span>
                  <span className="font-bold text-slate-900">{selectedBill.billNumber || selectedBill.transactionId || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Date & Time:</span>
                  <span className="text-slate-700">
                    {formatDateTime(selectedBill.date || selectedBill.createdAt || selectedBill.timestamp, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Customer:</span>
                  <span className="font-bold text-slate-800">{selectedBill.customerName || currentUser?.name || 'Valued Customer'}</span>
                </div>
                {selectedBill.customerZeebacId && (
                  <div className="flex justify-between">
                    <span className="text-slate-500 font-sans">Customer ID:</span>
                    <span className="font-bold text-purple-700">{selectedBill.customerZeebacId}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-slate-500 font-sans">Payment Mode:</span>
                  <span className="font-bold text-slate-900">{selectedBill.paymentMethod || selectedBill.paymentMode || 'Cash'}</span>
                </div>
              </div>

              {/* Itemized Table */}
              <div className="space-y-1.5 border-b border-dashed border-slate-300 pb-2.5">
                <div className="grid grid-cols-12 font-bold text-[10.5px] text-slate-500 pb-1 border-b border-slate-100 font-sans">
                  <span className="col-span-6">Item</span>
                  <span className="col-span-2 text-center">Qty</span>
                  <span className="col-span-2 text-right">Price</span>
                  <span className="col-span-2 text-right">Total</span>
                </div>
                {(Array.isArray(selectedBill.items) && selectedBill.items.length > 0 ? selectedBill.items : [
                  { name: 'Store Purchase', quantity: 1, price: selectedBill.amount || 0, total: selectedBill.amount || 0 }
                ]).map((it, idx) => (
                  <div key={idx} className="grid grid-cols-12 text-[11px] text-slate-800">
                    <span className="col-span-6 truncate font-medium">{it.name}</span>
                    <span className="col-span-2 text-center">{it.quantity}</span>
                    <span className="col-span-2 text-right">₹{Number(it.price || it.rate || 0).toFixed(0)}</span>
                    <span className="col-span-2 text-right font-bold">
                      ₹{Number(it.total || ((it.price || it.rate || 0) * (it.quantity || 1))).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              {/* Grand Total */}
              <div className="space-y-1 pt-1 text-[11px]">
                <div className="flex justify-between font-bold text-[13px] text-slate-900 pt-1 border-t border-slate-200">
                  <span>Grand Total:</span>
                  <span>₹{Number(selectedBill.amount || 0).toLocaleString('en-IN')}</span>
                </div>
                <div className="flex justify-between text-slate-500 text-[10.5px] font-sans">
                  <span>GST (Statutory Included):</span>
                  <span>₹0 (Inc.)</span>
                </div>
              </div>

              {/* Zeebac Instant Reward Box */}
              {Number(selectedBill.cashbackAmount) > 0 && (
                <div className="p-2.5 bg-purple-50 rounded-xl border border-purple-200 text-center space-y-0.5 text-[11px] font-sans">
                  <p className="text-[10px] font-bold uppercase text-purple-700">
                    🎁 Zeebac Instant Reward
                  </p>
                  <p className="font-black text-purple-900 text-[14px]">
                    +₹{Number(selectedBill.cashbackAmount).toFixed(0)} Cashback
                  </p>
                  <p className="text-[9.5px] text-purple-700">
                    Points Credited Instantly to Customer Wallet!
                  </p>
                </div>
              )}

              <div className="text-center pt-1 text-[10px] text-slate-400 leading-tight font-sans">
                <p>Thank you for shopping with us!</p>
                <p>Powered by Zeebac Retail POS Network</p>
              </div>
            </div>

            {/* Receipt Modal Action Buttons */}
            <div className="grid grid-cols-3 gap-2 pt-1 font-sans">
              <button
                type="button"
                onClick={() => generateReceiptPDF(selectedBill)}
                className="py-3 px-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
                title="Download PDF Bill"
              >
                <span className="material-symbols-outlined text-[17px]">download</span>
                <span>Download</span>
              </button>

              <button
                type="button"
                onClick={() => window.print()}
                className="py-3 px-2 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">print</span>
                <span>Print</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const bill = selectedBill;
                  const text = `🧾 *Zeebac Bill Receipt*\nStore: ${bill.vendorStoreName || 'Zeebac Store'}\nBill No: ${bill.billNumber || bill.transactionId}\nCustomer: ${bill.customerName || 'Customer'} (${bill.customerZeebacId || ''})\nTotal: ₹${bill.amount}\n🎁 *Cashback Credited:* ₹${bill.cashbackAmount || 0} Points in Zeebac Wallet!\nThank you!`;
                  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
                }}
                className="py-3 px-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center justify-center gap-1 shadow-sm active:scale-95 transition-all cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px]">share</span>
                <span>WhatsApp</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
