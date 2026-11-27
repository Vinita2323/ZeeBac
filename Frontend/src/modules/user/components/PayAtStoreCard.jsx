import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

// Customer-side "Pay at Store" card for store pickup orders.
// The merchant generates the bill in the seller app; the QR here pays the
// SELLER's own UPI ID directly. The merchant then confirms the payment.
const fmt = (n) => Number(n || 0).toFixed(2);

export default function PayAtStoreCard({ order }) {
  const bill = order?.storeBill;
  const isPaid = order?.paymentStatus === 'PAID';
  const hasBill = bill?.status === 'GENERATED' && bill?.upiUri;
  const [qrUrl, setQrUrl] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (hasBill && !isPaid) {
      QRCode.toDataURL(bill.upiUri, { width: 260, margin: 1, color: { dark: '#4a0093', light: '#ffffff' } })
        .then((url) => !cancelled && setQrUrl(url))
        .catch(() => !cancelled && setQrUrl(null));
    }
    return () => {
      cancelled = true;
    };
  }, [hasBill, isPaid, bill?.upiUri]);

  if (isPaid) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center gap-2.5">
        <span className="material-symbols-outlined text-emerald-700 text-[22px]">paid</span>
        <div className="text-[12px]">
          <p className="font-black text-emerald-900">Payment received by store</p>
          <p className="text-emerald-800">
            ₹{fmt(bill?.amountReceived ?? order.finalPayableAmount)}
            {bill?.paidVia ? ` · ${bill.paidVia === 'CASH' ? 'Cash' : 'UPI'}` : ''} — show your pickup code to collect.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-black text-purple-900 uppercase tracking-wider">Pay at Store</p>
        <span className="font-mono font-black text-[15px] text-purple-900">₹{fmt(bill?.amount ?? order.finalPayableAmount)}</span>
      </div>

      {hasBill ? (
        <div className="flex flex-col items-center gap-1.5 bg-white rounded-xl p-3 border border-purple-100">
          {qrUrl ? <img src={qrUrl} alt="Store UPI QR" className="w-44 h-44" /> : <div className="w-44 h-44 bg-slate-100 rounded-lg animate-pulse" />}
          <p className="text-[12px] font-bold text-slate-900">Pay to {bill.payeeName}</p>
          <p className="text-[11px] font-mono text-slate-500">{bill.payeeVpa}</p>
          <a
            href={bill.upiUri}
            className="mt-1 w-full text-center py-2.5 rounded-xl bg-purple-700 text-white font-black text-[12.5px]"
          >
            Pay with UPI App
          </a>
          <p className="text-[10.5px] text-slate-400 text-center leading-snug">
            Scan the QR at the counter or tap to pay. Money goes directly to the store. You can also pay cash.
          </p>
        </div>
      ) : (
        <p className="text-[11.5px] text-purple-900 leading-snug">
          The store will bill you at the counter. Pay by scanning the store's UPI QR or with cash. No extra charges.
        </p>
      )}
    </div>
  );
}
