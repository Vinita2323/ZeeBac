import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';

const STATUS_META = {
  DRAFT: { icon: 'edit_note', color: 'text-gray-500', bg: 'bg-gray-100', label: 'Draft', message: 'Your application is not yet submitted. Continue where you left off.' },
  PENDING_REVIEW: { icon: 'hourglass_top', color: 'text-amber-600', bg: 'bg-amber-100', label: '🟡 Under Review', message: 'Your vendor application has been submitted and is currently being reviewed by the Zeebac admin team.' },
  RESUBMITTED: { icon: 'hourglass_top', color: 'text-amber-600', bg: 'bg-amber-100', label: '🟡 Resubmitted — Under Review', message: 'Your updated application has been resubmitted and is being reviewed by the Zeebac admin team.' },
};

export default function ApplicationStatusScreen() {
  const navigate = useNavigate();
  const logout = useAuthStore((s) => s.logout);
  const [vendor, setVendor] = useState(useAuthStore.getState().currentUser);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    VendorAPI.getProfile().then((res) => {
      if (res.success) setVendor(res.data);
    }).finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const meta = STATUS_META[vendor?.applicationStatus] || STATUS_META.PENDING_REVIEW;

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4 relative overflow-hidden">
      <div className="blob-orb w-72 h-72 bg-primary/14 -top-16 -right-16 animate-drift" />
      <div className="blob-orb w-64 h-64 bg-secondary/12 -bottom-16 -left-16 animate-drift-reverse" />

      <div className="relative z-10 w-full max-w-[440px] glass-panel rounded-[2.5rem] p-8 text-center space-y-5">
        <div className={`w-16 h-16 rounded-full ${meta.bg} flex items-center justify-center mx-auto`}>
          <span className={`material-symbols-outlined text-[32px] ${meta.color}`}>{meta.icon}</span>
        </div>

        <div>
          <p className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">Application Status</p>
          <h1 className="text-[22px] font-black text-gray-900">{meta.label}</h1>
          <p className="text-[13.5px] text-gray-500 mt-3 leading-relaxed">{meta.message}</p>
        </div>

        <div className="bg-white/70 rounded-2xl p-4 space-y-2 text-left text-[13px]">
          <div className="flex justify-between">
            <span className="text-gray-500">Submitted On</span>
            <span className="font-bold text-gray-900">{vendor?.submittedAt ? new Date(vendor.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-500">Last Updated</span>
            <span className="font-bold text-gray-900">{vendor?.lastSubmittedAt ? new Date(vendor.lastSubmittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}</span>
          </div>
          {vendor?.resubmissionCount > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Resubmissions</span>
              <span className="font-bold text-gray-900">{vendor.resubmissionCount}</span>
            </div>
          )}
        </div>

        {vendor?.applicationStatus === 'DRAFT' && (
          <button
            onClick={() => navigate('/vendor-app/signup')}
            className="w-full h-12 rounded-xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg active:scale-[0.98] transition-all cursor-pointer"
          >
            Continue Application
          </button>
        )}

        <button
          onClick={() => { logout(); navigate('/vendor-app/login'); }}
          className="w-full h-11 rounded-xl border border-gray-200 text-gray-500 font-bold text-[13px] hover:bg-gray-50 transition-colors cursor-pointer"
        >
          Log Out
        </button>
      </div>
    </div>
  );
}
