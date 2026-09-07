import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';

export default function ApplicationRejectedScreen() {
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

  return (
    <div className="min-h-screen flex items-center justify-center mesh-gradient p-4 relative overflow-hidden">
      <div className="blob-orb w-72 h-72 bg-red-400/10 -top-16 -right-16 animate-drift" />
      <div className="blob-orb w-64 h-64 bg-secondary/10 -bottom-16 -left-16 animate-drift-reverse" />

      <div className="relative z-10 w-full max-w-[460px] glass-panel rounded-[2.5rem] p-8 text-center space-y-5">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto">
          <span className="material-symbols-outlined text-[32px] text-red-500">cancel</span>
        </div>

        <div>
          <h1 className="text-[22px] font-black text-gray-900">Application Rejected</h1>
          <p className="text-[13.5px] text-gray-500 mt-2">Your vendor application needs a few corrections before it can be approved.</p>
        </div>

        <div className="bg-red-50 border border-red-100 rounded-2xl p-4 text-left space-y-1.5">
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider">Reason</p>
          {vendor?.rejectionCategory && (
            <span className="inline-block text-[11px] font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded-full mb-1">{vendor.rejectionCategory}</span>
          )}
          <p className="text-[14px] text-gray-800 leading-relaxed">{vendor?.rejectionReason || 'No specific reason was provided.'}</p>
        </div>

        {vendor?.resubmissionCount > 0 && (
          <p className="text-[12px] text-gray-400">Resubmitted {vendor.resubmissionCount} time{vendor.resubmissionCount > 1 ? 's' : ''} so far.</p>
        )}

        <button
          onClick={() => navigate('/vendor/application/resubmit')}
          className="w-full h-13 rounded-xl btn-primary-gradient text-white font-bold text-[15px] shadow-lg active:scale-[0.98] transition-all flex items-center justify-center gap-2 cursor-pointer"
        >
          Review & Update Application <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
        </button>

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
