import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import { toast } from 'react-hot-toast';

export default function DeliveryStatusScreen() {
  const navigate = useNavigate();
  const token = useDeliveryStore((state) => state.token);
  const rider = useDeliveryStore((state) => state.rider);
  const setAuth = useDeliveryStore((state) => state.setAuth);
  const logout = useDeliveryStore((state) => state.logout);

  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Resubmission modal state
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitForm, setResubmitForm] = useState({
    name: '',
    vehicleType: 'Bike',
    vehicleNo: '',
    aadhaarNo: '',
    aadhaarDoc: '',
    drivingLicenceNo: '',
    drivingLicenceDoc: '',
    vehicleRcDoc: '',
    insuranceDoc: '',
  });
  const [isSubmittingResubmit, setIsSubmittingResubmit] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await DeliveryAPI.getStatus();
      if (res.success && res.data) {
        setStatusData(res.data);
        if (res.data.applicationStatus === 'APPROVED') {
          // If approved, update local store
          if (rider) {
            setAuth({ ...rider, applicationStatus: 'APPROVED' }, token);
          }
        }
      }
    } catch (err) {
      console.error('Failed to get status', err);
      // If 401 or no auth, navigate to login
      if (err.response?.status === 401) {
        navigate('/delivery/login');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [navigate, rider, setAuth, token]);

  useEffect(() => {
    if (!token) {
      navigate('/delivery/login');
      return;
    }
    fetchStatus();
  }, [token, navigate, fetchStatus]);

  const handleManualRefresh = () => {
    setIsRefreshing(true);
    fetchStatus();
  };

  const handleOpenResubmit = () => {
    if (statusData) {
      setResubmitForm({
        name: statusData.name || '',
        vehicleType: statusData.vehicle?.type || 'Bike',
        vehicleNo: statusData.vehicle?.no || '',
        aadhaarNo: statusData.documents?.aadhaarNo || '',
        aadhaarDoc: statusData.documents?.aadhaarDoc || '',
        drivingLicenceNo: statusData.documents?.drivingLicenceNo || '',
        drivingLicenceDoc: statusData.documents?.drivingLicenceDoc || '',
        vehicleRcDoc: statusData.documents?.vehicleRcDoc || '',
        insuranceDoc: statusData.documents?.insuranceDoc || '',
      });
    }
    setShowResubmitModal(true);
  };

  const handleFileChange = (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setResubmitForm((prev) => ({ ...prev, [field]: reader.result }));
      toast.success('Document updated');
    };
    reader.readAsDataURL(file);
  };

  const handleResubmitSubmit = async (e) => {
    e.preventDefault();
    setIsSubmittingResubmit(true);
    try {
      const res = await DeliveryAPI.resubmit({
        name: resubmitForm.name.trim(),
        vehicleType: resubmitForm.vehicleType,
        vehicleNo: resubmitForm.vehicleNo.trim().toUpperCase(),
        documents: {
          aadhaarNo: resubmitForm.aadhaarNo,
          aadhaarDoc: resubmitForm.aadhaarDoc,
          drivingLicenceNo: resubmitForm.drivingLicenceNo,
          drivingLicenceDoc: resubmitForm.drivingLicenceDoc,
          vehicleRcDoc: resubmitForm.vehicleRcDoc,
          insuranceDoc: resubmitForm.insuranceDoc,
        },
      });

      if (res.success) {
        toast.success('Application resubmitted successfully!');
        setShowResubmitModal(false);
        fetchStatus();
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to resubmit application');
    } finally {
      setIsSubmittingResubmit(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const appStatus = statusData?.applicationStatus || 'PENDING_REVIEW';

  return (
    <div className="mesh-gradient min-h-screen flex flex-col justify-between p-4 sm:p-6 text-on-surface">
      {/* Top Header */}
      <header className="pt-6 max-w-[480px] w-full mx-auto flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-9 h-9 rounded-xl btn-primary-gradient text-white flex items-center justify-center font-black">
            <span className="material-symbols-outlined text-[20px]">two_wheeler</span>
          </div>
          <div>
            <h1 className="font-display font-black text-[16px] text-slate-900 leading-tight">
              ZeeBac Partner Status
            </h1>
            <p className="text-[11px] text-slate-500 font-mono">
              ID: {statusData?.riderId || rider?.riderId || 'RIDER'}
            </p>
          </div>
        </div>

        <button
          onClick={handleManualRefresh}
          disabled={isRefreshing}
          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-primary transition-all shadow-xs cursor-pointer"
          title="Refresh Status"
        >
          <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
            sync
          </span>
        </button>
      </header>

      {/* Main Status Display */}
      <main className="max-w-[480px] w-full mx-auto my-auto py-8">
        <div className="bg-white rounded-3xl p-6 sm:p-8 border border-slate-100 shadow-xl text-center space-y-6">
          {/* Status: APPROVED */}
          {appStatus === 'APPROVED' && (
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-full bg-emerald-50 text-emerald-600 border-2 border-emerald-200 flex items-center justify-center mx-auto animate-bounce">
                <span className="material-symbols-outlined text-[42px]">check_circle</span>
              </div>
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-bold uppercase tracking-wider inline-block">
                  Application Approved
                </span>
                <h2 className="font-display font-black text-[22px] text-slate-900">
                  Welcome aboard, {statusData?.name}!
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  Your delivery partner account has been verified by the ZeeBac admin team. You are ready to start delivering!
                </p>
              </div>

              <button
                onClick={() => navigate('/delivery/dashboard')}
                className="w-full py-4 rounded-2xl btn-primary-gradient text-white font-black text-[15px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Go to Delivery Dashboard</span>
                <span className="material-symbols-outlined text-[20px]">arrow_forward</span>
              </button>
            </div>
          )}

          {/* Status: PENDING_REVIEW or RESUBMITTED */}
          {(appStatus === 'PENDING_REVIEW' || appStatus === 'RESUBMITTED') && (
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-full bg-amber-50 text-amber-600 border-2 border-amber-200 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[42px]">hourglass_top</span>
              </div>
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold uppercase tracking-wider inline-block">
                  Under Admin Review
                </span>
                <h2 className="font-display font-black text-[22px] text-slate-900">
                  Application Under Review
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  Your application and uploaded documents are currently being verified by the ZeeBac compliance team.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Applicant:</span>
                  <span className="font-bold text-slate-900">{statusData?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vehicle:</span>
                  <span className="font-bold text-slate-900">
                    {statusData?.vehicle?.type} • {statusData?.vehicle?.no || 'Bicycle'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Verification Time:</span>
                  <span className="font-bold text-slate-900">Usually 2-4 Hours</span>
                </div>
              </div>

              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="w-full py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[13.5px] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">sync</span>
                <span>Check Status Again</span>
              </button>
            </div>
          )}

          {/* Status: UNDER_REVIEW */}
          {appStatus === 'UNDER_REVIEW' && (
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-full bg-blue-50 text-blue-600 border-2 border-blue-200 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[42px]">fact_check</span>
              </div>
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold uppercase tracking-wider inline-block">
                  Document Inspection In Progress
                </span>
                <h2 className="font-display font-black text-[22px] text-slate-900">
                  Verification In Progress
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  An admin reviewer is currently evaluating your Aadhaar, driving licence, and vehicle records.
                </p>
              </div>

              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className="w-full py-3.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-[13.5px] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">sync</span>
                <span>Check Status Again</span>
              </button>
            </div>
          )}

          {/* Status: REJECTED */}
          {appStatus === 'REJECTED' && (
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-full bg-red-50 text-red-600 border-2 border-red-200 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[42px]">cancel</span>
              </div>
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full bg-red-100 text-red-800 text-[11px] font-bold uppercase tracking-wider inline-block">
                  Application Needs Correction
                </span>
                <h2 className="font-display font-black text-[22px] text-slate-900">
                  Action Required
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  The admin reviewer found issues with your application documents.
                </p>
              </div>

              {/* Rejection Reason Card */}
              <div className="p-4 rounded-2xl bg-red-50/70 border border-red-200 text-left space-y-1.5">
                <span className="text-[11px] font-bold text-red-700 uppercase tracking-wider block">
                  Admin Feedback / Reason:
                </span>
                <p className="text-[13px] font-semibold text-red-900 leading-snug">
                  {statusData?.rejectionReason || 'Uploaded documents are blurry or incomplete. Please re-upload clear photos.'}
                </p>
              </div>

              <button
                onClick={handleOpenResubmit}
                className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">edit_document</span>
                <span>Correct Details & Resubmit</span>
              </button>
            </div>
          )}

          {/* Status: SUSPENDED */}
          {appStatus === 'SUSPENDED' && (
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-full bg-rose-50 text-rose-600 border-2 border-rose-200 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[42px]">block</span>
              </div>
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold uppercase tracking-wider inline-block">
                  Account Suspended
                </span>
                <h2 className="font-display font-black text-[22px] text-slate-900">
                  Access Temporarily Suspended
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  Your delivery partner account has been suspended by administration.
                </p>
              </div>

              {statusData?.suspensionReason && (
                <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-left text-[12.5px] text-rose-900">
                  <strong>Reason:</strong> {statusData.suspensionReason}
                </div>
              )}

              <a
                href="mailto:support@zeebac.com"
                className="w-full py-3.5 rounded-2xl bg-slate-900 text-white font-bold text-[13.5px] transition-all cursor-pointer flex items-center justify-center gap-2 block"
              >
                <span className="material-symbols-outlined text-[18px]">support_agent</span>
                <span>Contact ZeeBac Partner Support</span>
              </a>
            </div>
          )}
        </div>
      </main>

      {/* Bottom Actions */}
      <footer className="py-4 text-center space-y-2">
        <button
          onClick={() => {
            logout();
            navigate('/delivery/login');
          }}
          className="text-xs font-bold text-slate-500 hover:text-red-600 transition-colors cursor-pointer"
        >
          Sign Out of Partner Account
        </button>
      </footer>

      {/* Resubmit Application Modal */}
      {showResubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-[480px] w-full p-6 border border-slate-100 shadow-2xl max-h-[90vh] overflow-y-auto space-y-4 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-display font-black text-[17px] text-slate-900">
                  Resubmit Application
                </h3>
                <p className="text-[11.5px] text-slate-500">Correct your information or re-upload documents</p>
              </div>
              <button
                onClick={() => setShowResubmitModal(false)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleResubmitSubmit} className="space-y-3.5">
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  value={resubmitForm.name}
                  onChange={(e) => setResubmitForm((p) => ({ ...p, name: e.target.value }))}
                  className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Vehicle Type
                  </label>
                  <select
                    value={resubmitForm.vehicleType}
                    onChange={(e) => setResubmitForm((p) => ({ ...p, vehicleType: e.target.value }))}
                    className="w-full py-2.5 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-bold"
                  >
                    <option value="Bike">Bike</option>
                    <option value="Scooter">Scooter</option>
                    <option value="EV">EV</option>
                    <option value="Cycle">Cycle</option>
                  </select>
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                    Vehicle Reg. No.
                  </label>
                  <input
                    type="text"
                    value={resubmitForm.vehicleNo}
                    onChange={(e) => setResubmitForm((p) => ({ ...p, vehicleNo: e.target.value.toUpperCase() }))}
                    className="w-full py-2.5 px-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-bold uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Aadhaar Document Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('aadhaarDoc', e)}
                  className="w-full text-xs text-slate-600 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-purple-50 file:text-primary file:font-bold file:cursor-pointer"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                  Driving Licence Photo
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handleFileChange('drivingLicenceDoc', e)}
                  className="w-full text-xs text-slate-600 file:py-2 file:px-3 file:rounded-xl file:border-0 file:bg-purple-50 file:text-primary file:font-bold file:cursor-pointer"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowResubmitModal(false)}
                  className="py-2.5 px-4 rounded-xl text-slate-600 font-bold text-xs hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingResubmit}
                  className="py-2.5 px-5 rounded-xl btn-primary-gradient text-white font-bold text-xs shadow-md shadow-primary/25 cursor-pointer disabled:opacity-50"
                >
                  {isSubmittingResubmit ? 'Resubmitting...' : 'Submit Corrections'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

