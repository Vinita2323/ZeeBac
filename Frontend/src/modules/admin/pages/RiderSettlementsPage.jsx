import RiderSettlementRequests from '../components/RiderSettlementRequests';

export default function RiderSettlementsPage() {
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
          <span className="material-symbols-outlined text-[#7c3aed] text-3xl">account_balance_wallet</span>
          <span>Rider Deposits & Payouts</span>
        </h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Pay rider withdrawal requests and verify UPI cash-in-hand deposits
        </p>
      </div>

      <RiderSettlementRequests />
    </div>
  );
}
