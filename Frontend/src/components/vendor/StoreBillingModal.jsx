import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { OrderAPI } from '../../services/api';

// Store pickup in-store billing ("Merchant Billing Karega").
// 1. Merchant generates the bill → a UPI QR to the SELLER's own UPI ID is shown.
// 2. Customer scans & pays directly to the seller (or pays cash).
// 3. Merchant confirms "UPI Received" or "Cash Received".
// Handover (pickup code → DELIVERED) is a separate step done afterwards.
const fmt = (n) => Number(n || 0).toFixed(2);

export default function StoreBillingModal({ order, onClose, onOrderUpdated }) {
  const [bill, setBill] = useState(order?.storeBill?.status === 'GENERATED' ? order.storeBill : null);
  const [qrUrl, setQrUrl] = useState(null);
  const [mode, setMode] = useState('UPI'); // 'UPI' | 'CASH'
  const [utr, setUtr] = useState('');
  const [cashGiven, setCashGiven] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const amount = Number(order?.finalPayableAmount || 0);

  useEffect(() => {
    let cancelled = false;
    if (bill?.upiUri) {
      QRCode.toDataURL(bill.upiUri, { width: 300, margin: 1, color: { dark: '#4a0093', light: '#ffffff' } })
        .then((url) => !cancelled && setQrUrl(url))
        .catch(() => !cancelled && setQrUrl(null));
    }
    return () => {
      cancelled = true;
    };
  }, [bill?.upiUri]);

  const apiError = (err, fallback) => err?.response?.data?.message || fallback;

  const handleGenerate = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await OrderAPI.generateStoreBill(order.orderId);
      if (res.success) {
        setBill(res.data.storeBill);
        onOrderUpdated?.(res.data.order);
      } else setError(res.message || 'Could not generate bill');
    } catch (err) {
      setError(apiError(err, 'Could not generate bill'));
      if (err?.response?.data?.code === 'SELLER_UPI_MISSING') setMode('CASH');
    } finally {
      setBusy(false);
    }
  };

  const handleConfirm = async () => {
    setError('');
    const payload = { method: mode };
    if (mode === 'UPI') {
      if (utr.trim()) payload.utr = utr.trim();
    } else if (cashGiven !== '') {
      if (Number(cashGiven) < amount) {
        setError(`Cash received must be at least ₹${fmt(amount)}.`);
        return;
      }
      payload.amountReceived = Number(cashGiven);
    }
    setBusy(true);
    try {
      const res = await OrderAPI.confirmStoreBillPayment(order.orderId, payload);
      if (res.success) {
        onOrderUpdated?.(res.data.order);
        onClose?.({ paid: true, change: res.data.change });
      } else setError(res.message || 'Could not confirm payment');
    } catch (err) {
      setError(apiError(err, 'Could not confirm payment'));
    } finally {
      setBusy(false);
    }
  };

  const change = cashGiven !== '' ? Number(cashGiven) - amount : 0;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-reveal"
      onClick={() => !busy && onClose?.()}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-3xl max-w-sm w-full p-5 space-y-4 shadow-2xl border border-slate-100 text-left max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display font-black text-[16px] text-slate-900">Store Billing</h3>
            <p className="text-[12px] text-slate-500 mt-0.5">
              Order #{order.orderId} · {order.customerName || 'Customer'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            disabled={busy}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center cursor-pointer shrink-0"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Bill summary */}
        <div className="bg-slate-50 border border-slate-100 rounded-2xl p-3 space-y-1 text-[12px]">
          <div className="flex justify-between text-slate-600">
            <span>Items ({order.items?.length || 0})</span>
            <span className="font-mono">₹{fmt(order.itemTotal ?? order.totalAmount)}</span>
          </div>
          {Number(order.taxAmount) > 0 && (
            <div className="flex justify-between text-slate-600">
              <span>GST</span>
              <span className="font-mono">₹{fmt(order.taxAmount)}</span>
            </div>
          )}
          {Number(order.pointsRedeemed) > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Zeebac Points redeemed</span>
              <span className="font-mono">−₹{fmt(order.pointsRedeemed)}</span>
            </div>
          )}
          <div className="flex justify-between pt-1 border-t border-slate-200 font-black text-[14px] text-slate-900">
            <span>To Collect</span>
            <span className="font-mono text-primary">₹{fmt(amount)}</span>
          </div>
        </div>

        {/* Method tabs */}
        <div className="grid grid-cols-2 gap-2">
          {['UPI', 'CASH'].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError('');
              }}
              className={`py-2 rounded-xl text-[12px] font-bold border cursor-pointer ${
                mode === m ? 'bg-purple-700 text-white border-purple-700' : 'bg-white text-slate-700 border-slate-200'
              }`}
            >
              {m === 'UPI' ? 'UPI (Scan QR)' : 'Cash'}
            </button>
          ))}
        </div>

        {mode === 'UPI' ? (
          !bill ? (
            <button
              type="button"
              disabled={busy}
              onClick={handleGenerate}
              className="w-full py-3 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-black text-[13px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[17px]">qr_code_2</span>
              {busy ? 'Generating…' : 'Generate Bill & QR'}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-col items-center gap-1.5 bg-white border-2 border-purple-100 rounded-2xl p-3">
                {qrUrl ? (
                  <img src={qrUrl} alt="UPI payment QR" className="w-52 h-52" />
                ) : (
                  <div className="w-52 h-52 bg-slate-100 rounded-xl animate-pulse" />
                )}
                <p className="text-[12px] font-bold text-slate-900">Pay ₹{fmt(bill.amount)} to {bill.payeeName}</p>
                <p className="text-[11px] font-mono text-slate-500">{bill.payeeVpa}</p>
                <p className="text-[10.5px] text-slate-400">Bill Ref: {bill.billRef}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-2.5 text-[11.5px] text-amber-900 leading-snug">
                Payment goes directly to your UPI account. <b>Check your UPI app</b> for ₹{fmt(bill.amount)} before confirming.
              </div>
              <input
                type="text"
                value={utr}
                onChange={(e) => setUtr(e.target.value.slice(0, 40))}
                placeholder="UTR / Txn ID (optional)"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[13px] focus:border-purple-600 focus:outline-none"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleConfirm}
                className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[13px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[17px]">check_circle</span>
                {busy ? 'Confirming…' : 'UPI Received'}
              </button>
            </div>
          )
        ) : (
          <div className="space-y-3">
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
                Cash received from customer (optional)
              </label>
              <input
                type="number"
                inputMode="decimal"
                min={amount}
                step="0.01"
                value={cashGiven}
                onChange={(e) => {
                  setCashGiven(e.target.value);
                  setError('');
                }}
                placeholder={`₹${fmt(amount)}`}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-[14px] font-mono focus:border-emerald-600 focus:outline-none"
              />
              {cashGiven !== '' && change >= 0 && (
                <p className="text-[12px] font-bold text-emerald-700">Return change: ₹{fmt(change)}</p>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={handleConfirm}
              className="w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[13px] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <span className="material-symbols-outlined text-[17px]">payments</span>
              {busy ? 'Saving…' : `Cash Received ₹${fmt(amount)}`}
            </button>
          </div>
        )}

        {error && <p className="text-[12px] font-bold text-rose-600">{error}</p>}

        <p className="text-[10.5px] text-slate-400 leading-snug">
          After payment is confirmed, hand over the order using the customer's 4-digit pickup code.
        </p>
      </div>
    </div>
  );
}
