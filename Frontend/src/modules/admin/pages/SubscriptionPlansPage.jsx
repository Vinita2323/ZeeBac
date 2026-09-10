import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function SubscriptionPlansPage() {
  const [plans, setPlans] = useState([]);
  const [stats, setStats] = useState({
    totalSubscribers: 0,
    monthlySubscribers: 0,
    yearlySubscribers: 0,
    expiredVendors: 0,
  });
  const [loading, setLoading] = useState(true);
  const [editingPlan, setEditingPlan] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [toastMessage, setToastMessage] = useState({ type: '', text: '' });
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsPage, setPaymentsPage] = useState(1);
  const [paymentsTotal, setPaymentsTotal] = useState(0);

  const fetchPlans = async () => {
    setLoading(true);
    try {
      const res = await AdminAPI.getSubscriptionPlans();
      if (res.success) {
        setPlans(res.data.plans || []);
        if (res.data.stats) setStats(res.data.stats);
      }
    } catch (error) {
      console.error('Failed to load subscription plans:', error);
      showToast('error', error.response?.data?.message || 'Failed to load subscription plans');
    } finally {
      setLoading(false);
    }
  };

  const fetchPayments = async (page = 1) => {
    setPaymentsLoading(true);
    try {
      const res = await AdminAPI.getSubscriptionPayments(page);
      if (res.success) {
        setPayments(res.data.payments || []);
        setPaymentsTotal(res.data.total || 0);
        setPaymentsPage(res.data.page || 1);
      }
    } catch (err) {
      console.error('Failed to load subscription payments:', err);
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    fetchPlans();
    fetchPayments(1);
  }, []);

  const showToast = (type, text) => {
    setToastMessage({ type, text });
    setTimeout(() => setToastMessage({ type: '', text: '' }), 4000);
  };

  const handleToggleActive = async (plan) => {
    try {
      const res = await AdminAPI.deleteSubscriptionPlan(plan._id);
      if (res.success) {
        showToast('success', res.message || 'Plan status updated');
        fetchPlans();
      }
    } catch (error) {
      showToast('error', error.response?.data?.message || 'Failed to toggle status');
    }
  };

  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingPlan) return;
    setIsSaving(true);
    try {
      const payload = {
        name: editingPlan.name,
        durationDays: Number(editingPlan.durationDays),
        pricing: {
          independentStore: Number(editingPlan.pricing?.independentStore),
          chainBrand: Number(editingPlan.pricing?.chainBrand),
        },
        description: editingPlan.description,
        features: Array.isArray(editingPlan.features)
          ? editingPlan.features
          : String(editingPlan.features || '').split('\n').map((s) => s.trim()).filter(Boolean),
        isActive: editingPlan.isActive,
      };

      const res = await AdminAPI.updateSubscriptionPlan(editingPlan._id, payload);
      if (res.success) {
        showToast('success', 'Plan details and pricing updated successfully');
        setEditingPlan(null);
        fetchPlans();
      }
    } catch (error) {
      showToast('error', error.response?.data?.message || 'Failed to update plan');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-10 h-10 border-3 border-primary/20 border-t-primary rounded-full animate-spin mb-3" />
        <p className="text-body-sm text-gray-500 font-medium">Loading subscription plans...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-reveal text-left pb-12">
      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-black text-on-surface tracking-tight">
            Subscription Plans Management
          </h1>
          <p className="text-[13.5px] text-on-surface-variant mt-1">
            Configure Monthly & Yearly pricing for Independent Stores and Chain & Brands.
          </p>
        </div>

        <button
          onClick={fetchPlans}
          className="self-start md:self-auto px-4 py-2 bg-white rounded-xl border border-outline-variant/30 text-on-surface text-[13px] font-bold hover:bg-gray-50 transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          Refresh
        </button>
      </div>

      {/* Toast Alert */}
      {toastMessage.text && (
        <div
          className={`p-4 rounded-2xl flex items-center gap-3 animate-reveal ${
            toastMessage.type === 'error'
              ? 'bg-red-50 text-red-800 border border-red-200'
              : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          }`}
        >
          <span className="material-symbols-outlined">
            {toastMessage.type === 'error' ? 'error' : 'verified'}
          </span>
          <p className="text-[13.5px] font-semibold">{toastMessage.text}</p>
        </div>
      )}

      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-outline-variant/15 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Active Subscribers</p>
          <h3 className="text-[26px] font-black text-purple-700 mt-1">{stats.totalSubscribers}</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">Live store listings</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-outline-variant/15 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Monthly Plans</p>
          <h3 className="text-[26px] font-black text-gray-900 mt-1">{stats.monthlySubscribers}</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">Recurring month-to-month</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-outline-variant/15 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Yearly Plans</p>
          <h3 className="text-[26px] font-black text-emerald-600 mt-1">{stats.yearlySubscribers}</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">Annual commitments</p>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-outline-variant/15 shadow-sm">
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">Expired / Inactive</p>
          <h3 className="text-[26px] font-black text-rose-600 mt-1">{stats.expiredVendors}</h3>
          <p className="text-[12px] text-gray-500 mt-0.5">Require plan renewal</p>
        </div>
      </div>

      {/* Plan Cards Grid */}
      <div className="grid md:grid-cols-2 gap-6">
        {plans.map((plan) => (
          <div
            key={plan._id}
            className={`bg-white rounded-3xl p-6 border-2 shadow-sm flex flex-col justify-between transition-all ${
              plan.isActive ? 'border-outline-variant/20' : 'border-gray-200 opacity-60 bg-gray-50/50'
            }`}
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-purple-100 text-purple-700">
                      {plan.planType} Plan
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        plan.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {plan.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <h3 className="text-[22px] font-black text-gray-900 mt-2">{plan.name}</h3>
                  <p className="text-[13px] text-gray-500 mt-0.5">{plan.description}</p>
                </div>

                <div className="text-right">
                  <span className="text-[11px] font-bold text-gray-400 uppercase block">Validity</span>
                  <span className="text-[16px] font-black text-gray-800">{plan.durationDays} Days</span>
                </div>
              </div>

              {/* Pricing Cards Box */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-purple-50/50 rounded-2xl border border-purple-100">
                <div className="space-y-0.5">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    Independent Store
                  </span>
                  <div className="text-[22px] font-black text-purple-900">
                    ₹{plan.pricing?.independentStore}
                    <span className="text-[11px] font-semibold text-gray-500"> / {plan.durationDays}d</span>
                  </div>
                </div>

                <div className="space-y-0.5 border-l border-purple-200 pl-3">
                  <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">
                    Chain & Brand
                  </span>
                  <div className="text-[22px] font-black text-indigo-900">
                    ₹{plan.pricing?.chainBrand}
                    <span className="text-[11px] font-semibold text-gray-500"> / {plan.durationDays}d</span>
                  </div>
                </div>
              </div>

              {/* Features List */}
              <div className="space-y-2 pt-1">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Features Included</p>
                <div className="space-y-1.5">
                  {(plan.features || []).map((feat, i) => (
                    <div key={i} className="flex items-center gap-2 text-[13px] text-gray-700">
                      <span className="material-symbols-outlined text-emerald-600 text-[17px]">check_circle</span>
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="pt-6 border-t border-gray-100 mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => handleToggleActive(plan)}
                className={`px-3 py-2 rounded-xl text-[12px] font-bold transition-colors cursor-pointer ${
                  plan.isActive
                    ? 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                }`}
              >
                {plan.isActive ? 'Deactivate' : 'Activate'}
              </button>

              <button
                onClick={() => setEditingPlan({ ...plan, features: (plan.features || []).join('\n') })}
                className="px-4 py-2 rounded-xl bg-purple-600 text-white font-bold text-[12.5px] hover:bg-purple-700 transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">edit</span>
                Edit Pricing & Features
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Subscription Payment Transactions Section */}
      <div className="bg-white rounded-3xl p-6 border border-outline-variant/15 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-display text-[18px] font-black text-gray-900 tracking-tight">
              Subscription Payment Transactions
            </h3>
            <p className="text-[12.5px] text-gray-500">
              Audit log of vendor plan purchases and renewals via Razorpay and Wallet.
            </p>
          </div>
          <button
            onClick={() => fetchPayments(paymentsPage)}
            disabled={paymentsLoading}
            className="self-start sm:self-auto px-3.5 py-1.5 rounded-xl border border-gray-200 text-gray-700 text-[12px] font-bold hover:bg-gray-50 transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <span className={`material-symbols-outlined text-[16px] ${paymentsLoading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Refresh</span>
          </button>
        </div>

        {paymentsLoading ? (
          <div className="py-12 flex justify-center">
            <div className="w-8 h-8 border-3 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
          </div>
        ) : payments.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-[13px]">
            <span className="material-symbols-outlined text-4xl mb-2 text-gray-300 block">receipt_long</span>
            No subscription payment transactions recorded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead className="bg-gray-50 text-gray-500 uppercase tracking-wider text-[10.5px] font-bold">
                <tr>
                  <th className="py-3 px-4 rounded-l-xl">Vendor</th>
                  <th className="py-3 px-4">Plan & Type</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Method</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Transaction / Gateway ID</th>
                  <th className="py-3 px-4 rounded-r-xl">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium">
                {payments.map((p) => (
                  <tr key={p._id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-gray-900">{p.vendorId?.storeName || p.vendorId?.ownerName || 'Unknown Vendor'}</div>
                      <div className="text-[11px] font-mono text-gray-400">{p.vendorId?.zeebacId || '—'} · {p.vendorId?.phone || ''}</div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-bold text-gray-800">{p.planType} Plan</span>
                      <span className="text-[11px] text-gray-500 block">{p.shopType}</span>
                    </td>
                    <td className="py-3.5 px-4 font-black text-gray-900">
                      ₹{p.amount?.toLocaleString('en-IN')}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wider ${
                        p.paymentMethod === 'RAZORPAY'
                          ? 'bg-purple-100 text-purple-700 border border-purple-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                      }`}>
                        {p.paymentMethod}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${
                        p.paymentStatus === 'SUCCESS'
                          ? 'bg-green-100 text-green-800'
                          : p.paymentStatus === 'PENDING'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {p.paymentStatus}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-gray-600">
                      <div>{p.transactionId}</div>
                      {p.razorpayPaymentId && (
                        <div className="text-[10px] text-purple-600 font-semibold">{p.razorpayPaymentId}</div>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-gray-500 text-[11.5px] whitespace-nowrap">
                      {new Date(p.createdAt).toLocaleDateString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Plan Modal */}
      {editingPlan && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl p-6 shadow-2xl border border-gray-100 space-y-5 animate-reveal max-h-[90vh] overflow-y-auto text-left">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-[18px] font-black text-gray-900">
                  Edit {editingPlan.planType} Plan
                </h3>
                <p className="text-[12px] text-gray-500">Update pricing and configuration</p>
              </div>
              <button
                onClick={() => setEditingPlan(null)}
                className="w-8 h-8 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Plan Display Name
                </label>
                <input
                  type="text"
                  value={editingPlan.name}
                  onChange={(e) => setEditingPlan({ ...editingPlan, name: e.target.value })}
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Independent Store Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.pricing?.independentStore}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        pricing: { ...editingPlan.pricing, independentStore: e.target.value },
                      })
                    }
                    required
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[14px] font-bold text-purple-700 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Chain & Brand Price (₹)
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={editingPlan.pricing?.chainBrand}
                    onChange={(e) =>
                      setEditingPlan({
                        ...editingPlan,
                        pricing: { ...editingPlan.pricing, chainBrand: e.target.value },
                      })
                    }
                    required
                    className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[14px] font-bold text-indigo-700 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Duration (Days)
                </label>
                <input
                  type="number"
                  min="1"
                  value={editingPlan.durationDays}
                  onChange={(e) => setEditingPlan({ ...editingPlan, durationDays: e.target.value })}
                  required
                  className="w-full h-11 px-3.5 rounded-xl border border-gray-200 text-[13.5px] focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Description
                </label>
                <textarea
                  rows="2"
                  value={editingPlan.description}
                  onChange={(e) => setEditingPlan({ ...editingPlan, description: e.target.value })}
                  className="w-full p-3 rounded-xl border border-gray-200 text-[13px] focus:outline-none focus:border-purple-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">
                  Features (One per line)
                </label>
                <textarea
                  rows="4"
                  value={editingPlan.features}
                  onChange={(e) => setEditingPlan({ ...editingPlan, features: e.target.value })}
                  placeholder="Feature 1&#10;Feature 2&#10;Feature 3"
                  className="w-full p-3 rounded-xl border border-gray-200 text-[13px] font-mono focus:outline-none focus:border-purple-500"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="modalIsActive"
                  checked={editingPlan.isActive}
                  onChange={(e) => setEditingPlan({ ...editingPlan, isActive: e.target.checked })}
                  className="w-4 h-4 text-purple-600 rounded"
                />
                <label htmlFor="modalIsActive" className="text-[13px] font-semibold text-gray-700 cursor-pointer">
                  Plan is Active and available for vendors
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingPlan(null)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-600 text-[13px] font-bold hover:bg-gray-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 text-white text-[13px] font-bold hover:bg-purple-700 shadow-md transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isSaving ? 'Saving...' : 'Save Plan Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
