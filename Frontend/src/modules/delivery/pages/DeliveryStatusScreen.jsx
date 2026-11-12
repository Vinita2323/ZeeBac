import { useState, useEffect, useCallback, useMemo } from 'react';
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

  // Full Resubmission Wizard Modal State
  const [showResubmitModal, setShowResubmitModal] = useState(false);
  const [resubmitStep, setResubmitStep] = useState(1);
  const [isSubmittingResubmit, setIsSubmittingResubmit] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  // Initial snapshot to compute live diff
  const [initialSnapshot, setInitialSnapshot] = useState(null);

  // Comprehensive resubmission form containing all onboarding fields
  const [resubmitForm, setResubmitForm] = useState({
    name: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    gender: 'Male',
    profilePhoto: '',
    address: {
      currentAddress: '',
      city: 'Lucknow',
      state: 'Uttar Pradesh',
      pincode: '',
      permanentAddress: '',
    },
    vehicleType: 'Bike',
    vehicleNo: '',
    vehicleModel: '',
    documents: {
      aadhaarNo: '',
      aadhaarDoc: '',
      panNo: '',
      panDoc: '',
      drivingLicenceNo: '',
      drivingLicenceDoc: '',
      vehicleRcDoc: '',
      insuranceDoc: '',
      profilePhoto: '',
    },
    bankDetails: {
      accountHolderName: '',
      bankName: '',
      accountNumber: '',
      ifscCode: '',
      upiId: '',
    },
  });

  // Client-side image compression utility
  const compressImage = (file) => {
    return new Promise((resolve) => {
      if (!file.type || !file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve('');
        reader.readAsDataURL(file);
        return;
      }
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 1200;
          const MAX_HEIGHT = 1200;
          let width = img.width;
          let height = img.height;
          if (width > height) {
            if (width > MAX_WIDTH) {
              height = Math.round((height * MAX_WIDTH) / width);
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width = Math.round((width * MAX_HEIGHT) / height);
              height = MAX_HEIGHT;
            }
          }
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => resolve(e.target.result);
        img.src = e.target.result;
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await DeliveryAPI.getStatus();
      if (res.success && res.data) {
        setStatusData(res.data);
        if (res.data.applicationStatus === 'APPROVED') {
          if (rider) {
            setAuth({ ...rider, applicationStatus: 'APPROVED' }, token);
          }
        }
      }
    } catch (err) {
      console.error('Failed to get status', err);
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

  // Open resubmission wizard and prefill all fields from statusData
  const handleOpenResubmit = () => {
    if (statusData) {
      const initial = {
        name: statusData.name || '',
        phone: statusData.phone || '',
        email: statusData.email || '',
        dateOfBirth: statusData.dateOfBirth || '',
        gender: statusData.gender || 'Male',
        profilePhoto: statusData.profileImage || statusData.documents?.profilePhoto || '',
        address: {
          currentAddress: statusData.address?.currentAddress || statusData.address?.street || '',
          city: statusData.address?.city || 'Lucknow',
          state: statusData.address?.state || 'Uttar Pradesh',
          pincode: statusData.address?.pincode || '',
          permanentAddress:
            statusData.address?.permanentAddress ||
            statusData.address?.currentAddress ||
            statusData.address?.street ||
            '',
        },
        vehicleType: statusData.vehicle?.type || 'Bike',
        vehicleNo: statusData.vehicle?.no || '',
        vehicleModel: statusData.vehicle?.model || '',
        documents: {
          aadhaarNo: statusData.documents?.aadhaarNo || '',
          aadhaarDoc: statusData.documents?.aadhaarDoc || '',
          panNo: statusData.documents?.panNo || '',
          panDoc: statusData.documents?.panDoc || '',
          drivingLicenceNo: statusData.documents?.drivingLicenceNo || '',
          drivingLicenceDoc: statusData.documents?.drivingLicenceDoc || '',
          vehicleRcDoc: statusData.documents?.vehicleRcDoc || '',
          insuranceDoc: statusData.documents?.insuranceDoc || '',
          profilePhoto: statusData.profileImage || statusData.documents?.profilePhoto || '',
        },
        bankDetails: {
          accountHolderName: statusData.bankDetails?.accountHolderName || statusData.name || '',
          bankName: statusData.bankDetails?.bankName || '',
          accountNumber: statusData.bankDetails?.accountNumber || '',
          ifscCode: statusData.bankDetails?.ifscCode || '',
          upiId: statusData.bankDetails?.upiId || '',
        },
      };

      setResubmitForm(JSON.parse(JSON.stringify(initial)));
      setInitialSnapshot(JSON.parse(JSON.stringify(initial)));
      setResubmitStep(1);
      setShowResubmitModal(true);
    }
  };

  // Handle document file upload with instant compression
  const handleDocumentUpload = async (docKey, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const toastId = toast.loading(`Compressing ${docKey}...`);
    try {
      const compressedBase64 = await compressImage(file);
      if (!compressedBase64) {
        toast.error('Failed to read image file', { id: toastId });
        return;
      }

      setResubmitForm((prev) => {
        const next = { ...prev };
        if (docKey === 'profilePhoto') {
          next.profilePhoto = compressedBase64;
          next.documents = { ...next.documents, profilePhoto: compressedBase64 };
        } else {
          next.documents = { ...next.documents, [docKey]: compressedBase64 };
        }
        return next;
      });

      toast.success('Document updated successfully', { id: toastId });
    } catch (err) {
      toast.error('Image upload failed', { id: toastId });
    }
  };

  // Live Diff Computation between Initial Snapshot and Current Resubmit Form
  const diffChanges = useMemo(() => {
    if (!initialSnapshot) return [];
    const changes = [];

    const check = (label, category, oldVal, newVal, isDoc = false) => {
      const o = String(oldVal || '').trim();
      const n = String(newVal || '').trim();
      if (isDoc) {
        if (n && n !== o) {
          changes.push({
            label,
            category,
            isDoc: true,
            oldVal: o ? 'Previous Document' : 'None',
            newVal: 'New Document Uploaded',
          });
        }
      } else if (o !== n) {
        changes.push({
          label,
          category,
          isDoc: false,
          oldVal: o || 'None',
          newVal: n || 'None',
        });
      }
    };

    // Personal
    check('Full Name', 'Personal', initialSnapshot.name, resubmitForm.name);
    check('Email Address', 'Personal', initialSnapshot.email, resubmitForm.email);
    check('Date of Birth', 'Personal', initialSnapshot.dateOfBirth, resubmitForm.dateOfBirth);
    check('Gender', 'Personal', initialSnapshot.gender, resubmitForm.gender);
    check('Profile Photo', 'Personal', initialSnapshot.profilePhoto, resubmitForm.profilePhoto, true);

    // Address
    check('Current Address', 'Address', initialSnapshot.address?.currentAddress, resubmitForm.address?.currentAddress);
    check('City', 'Address', initialSnapshot.address?.city, resubmitForm.address?.city);
    check('State', 'Address', initialSnapshot.address?.state, resubmitForm.address?.state);
    check('Pincode', 'Address', initialSnapshot.address?.pincode, resubmitForm.address?.pincode);
    check('Permanent Address', 'Address', initialSnapshot.address?.permanentAddress, resubmitForm.address?.permanentAddress);

    // Vehicle
    check('Vehicle Type', 'Vehicle', initialSnapshot.vehicleType, resubmitForm.vehicleType);
    check('Vehicle Registration No', 'Vehicle', initialSnapshot.vehicleNo, resubmitForm.vehicleNo?.toUpperCase());
    check('Vehicle Model', 'Vehicle', initialSnapshot.vehicleModel, resubmitForm.vehicleModel);

    // Documents
    check('Aadhaar Number', 'Documents', initialSnapshot.documents?.aadhaarNo, resubmitForm.documents?.aadhaarNo);
    check('Aadhaar Document Photo', 'Documents', initialSnapshot.documents?.aadhaarDoc, resubmitForm.documents?.aadhaarDoc, true);
    check('PAN Number', 'Documents', initialSnapshot.documents?.panNo, resubmitForm.documents?.panNo?.toUpperCase());
    check('PAN Card Photo', 'Documents', initialSnapshot.documents?.panDoc, resubmitForm.documents?.panDoc, true);
    check('Driving Licence Number', 'Documents', initialSnapshot.documents?.drivingLicenceNo, resubmitForm.documents?.drivingLicenceNo?.toUpperCase());
    check('Driving Licence Photo', 'Documents', initialSnapshot.documents?.drivingLicenceDoc, resubmitForm.documents?.drivingLicenceDoc, true);
    check('Vehicle RC Document', 'Documents', initialSnapshot.documents?.vehicleRcDoc, resubmitForm.documents?.vehicleRcDoc, true);
    check('Vehicle Insurance Document', 'Documents', initialSnapshot.documents?.insuranceDoc, resubmitForm.documents?.insuranceDoc, true);

    // Bank
    check('Account Holder Name', 'Bank', initialSnapshot.bankDetails?.accountHolderName, resubmitForm.bankDetails?.accountHolderName);
    check('Bank Name', 'Bank', initialSnapshot.bankDetails?.bankName, resubmitForm.bankDetails?.bankName);
    check('Account Number', 'Bank', initialSnapshot.bankDetails?.accountNumber, resubmitForm.bankDetails?.accountNumber);
    check('IFSC Code', 'Bank', initialSnapshot.bankDetails?.ifscCode, resubmitForm.bankDetails?.ifscCode?.toUpperCase());
    check('UPI ID', 'Bank', initialSnapshot.bankDetails?.upiId, resubmitForm.bankDetails?.upiId);

    return changes;
  }, [initialSnapshot, resubmitForm]);

  // Submit resubmission to backend
  const handleResubmitSubmit = async (e) => {
    e?.preventDefault();
    if (diffChanges.length === 0) {
      toast.error('Please make the required corrections before resubmitting.');
      return;
    }

    setIsSubmittingResubmit(true);
    try {
      const payload = {
        name: resubmitForm.name.trim(),
        email: resubmitForm.email.trim(),
        dateOfBirth: resubmitForm.dateOfBirth,
        gender: resubmitForm.gender,
        profilePhoto: resubmitForm.profilePhoto,
        address: {
          currentAddress: resubmitForm.address.currentAddress.trim(),
          city: resubmitForm.address.city.trim(),
          state: resubmitForm.address.state.trim(),
          pincode: resubmitForm.address.pincode.trim(),
          permanentAddress:
            resubmitForm.address.permanentAddress.trim() || resubmitForm.address.currentAddress.trim(),
        },
        vehicleType: resubmitForm.vehicleType,
        vehicleNo: resubmitForm.vehicleNo.trim().toUpperCase(),
        vehicleModel: resubmitForm.vehicleModel.trim(),
        documents: {
          ...resubmitForm.documents,
          profilePhoto: resubmitForm.profilePhoto,
        },
        bankDetails: {
          accountHolderName: resubmitForm.bankDetails.accountHolderName.trim(),
          bankName: resubmitForm.bankDetails.bankName.trim(),
          accountNumber: resubmitForm.bankDetails.accountNumber.trim(),
          ifscCode: resubmitForm.bankDetails.ifscCode.trim().toUpperCase(),
          upiId: resubmitForm.bankDetails.upiId.trim(),
        },
      };

      const res = await DeliveryAPI.resubmit(payload);
      if (res.success) {
        toast.success('Corrections resubmitted successfully! Admin has been notified.');
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
  const stepsList = [
    { num: 1, label: 'Personal', icon: 'person' },
    { num: 2, label: 'Address', icon: 'home_pin' },
    { num: 3, label: 'Documents', icon: 'badge' },
    { num: 4, label: 'Vehicle', icon: 'two_wheeler' },
    { num: 5, label: 'Bank', icon: 'account_balance' },
    { num: 6, label: 'Review Changes', icon: 'fact_check', badge: diffChanges.length },
  ];

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
                  Welcome to Zeebac Fleet!
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  Your delivery partner account has been approved. You are ready to start delivering and earning.
                </p>
              </div>

              <button
                onClick={() => navigate('/delivery/dashboard')}
                className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Open Rider Dashboard</span>
                <span className="material-symbols-outlined text-[18px]">arrow_forward</span>
              </button>
            </div>
          )}

          {/* Status: RESUBMITTED */}
          {appStatus === 'RESUBMITTED' && (
            <div className="space-y-4">
              <div className="w-20 h-20 rounded-full bg-indigo-50 text-indigo-600 border-2 border-indigo-200 flex items-center justify-center mx-auto">
                <span className="material-symbols-outlined text-[42px]">history_edu</span>
              </div>
              <div className="space-y-1">
                <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-900 text-[11px] font-black uppercase tracking-wider inline-block border border-indigo-200">
                  Corrections Resubmitted • Under Review
                </span>
                <h2 className="font-display font-black text-[22px] text-slate-900">
                  Corrections Received
                </h2>
                <p className="text-[13px] text-slate-600 max-w-[340px] mx-auto">
                  Your updated details and replacement documents have been sent to the admin team for re-evaluation.
                </p>
              </div>

              {/* Addressed Feedback Card */}
              {statusData?.lastRejectionReason && (
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 border border-indigo-200 text-left space-y-1">
                  <span className="text-[10.5px] font-bold text-indigo-800 uppercase tracking-wider block">
                    Admin Feedback Addressed:
                  </span>
                  <p className="text-[12px] font-semibold text-indigo-950">
                    "{statusData.lastRejectionReason}"
                  </p>
                </div>
              )}

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 text-left space-y-2 text-[12px]">
                <div className="flex justify-between">
                  <span className="text-slate-500">Applicant:</span>
                  <span className="font-bold text-slate-900">{statusData?.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Vehicle:</span>
                  <span className="font-bold text-slate-900">
                    {statusData?.vehicle?.type} • {statusData?.vehicle?.no || 'Bike'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Re-Verification:</span>
                  <span className="font-bold text-emerald-700">Priority Queue (~1-2 Hours)</span>
                </div>
              </div>

              <div className="space-y-2">
                <button
                  onClick={handleManualRefresh}
                  disabled={isRefreshing}
                  className="w-full py-3.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[13.5px] transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <span className={`material-symbols-outlined text-[18px] ${isRefreshing ? 'animate-spin' : ''}`}>
                    sync
                  </span>
                  <span>Check Status Again</span>
                </button>

                <button
                  onClick={handleOpenResubmit}
                  className="w-full py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[12.5px] transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[16px]">edit</span>
                  <span>Review / Edit Submitted Details Again</span>
                </button>
              </div>
            </div>
          )}

          {/* Status: PENDING_REVIEW */}
          {appStatus === 'PENDING_REVIEW' && (
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
                  The admin reviewer found issues with your application details or documents.
                </p>
              </div>

              {/* Rejection Reason Card */}
              <div className="p-4 rounded-2xl bg-red-50/80 border border-red-200 text-left space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-red-700">
                  <span className="material-symbols-outlined text-[16px]">report</span>
                  <span className="text-[11px] font-bold uppercase tracking-wider">
                    Admin Feedback / Reason:
                  </span>
                </div>
                <p className="text-[13.5px] font-bold text-red-950 leading-snug pl-1">
                  "{statusData?.rejectionReason || statusData?.lastRejectionReason || 'Uploaded documents are blurry or incomplete. Please re-upload clear photos.'}"
                </p>
              </div>

              <button
                onClick={handleOpenResubmit}
                className="w-full py-3.5 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                <span className="material-symbols-outlined text-[18px]">edit_document</span>
                <span>Review, Correct & Resubmit Details</span>
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

      {/* ───────────────────────────────────────────────────────────── */}
      {/* FULL ONBOARDING RESUBMISSION WIZARD MODAL                    */}
      {/* ───────────────────────────────────────────────────────────── */}
      {showResubmitModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl max-w-[560px] w-full max-h-[92vh] flex flex-col border border-slate-100 shadow-2xl animate-in fade-in zoom-in-95 duration-200 text-left overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-slate-100 bg-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-purple-50 text-primary flex items-center justify-center font-bold">
                  <span className="material-symbols-outlined text-[22px]">edit_document</span>
                </div>
                <div>
                  <h3 className="font-display font-black text-[16.5px] text-slate-900 leading-tight">
                    Edit & Resubmit Application
                  </h3>
                  <p className="text-[11.5px] text-slate-500">
                    Correct any rejected fields or re-upload clear documents
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowResubmitModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Admin Rejection Feedback Banner */}
            {(statusData?.rejectionReason || statusData?.lastRejectionReason) && (
              <div className="bg-red-50/90 border-b border-red-200 p-3 sm:px-5 flex items-start gap-2.5 shrink-0">
                <span className="material-symbols-outlined text-[18px] text-red-600 shrink-0 mt-0.5">
                  error
                </span>
                <div className="text-[12px] leading-snug">
                  <span className="font-bold text-red-800 uppercase tracking-wider text-[10px] block">
                    Admin Rejection Feedback:
                  </span>
                  <p className="font-semibold text-red-950 mt-0.5">
                    "{statusData.rejectionReason || statusData.lastRejectionReason}"
                  </p>
                </div>
              </div>
            )}

            {/* Step Navigation Tabs Bar */}
            <div className="bg-slate-50/80 border-b border-slate-200 px-3 py-2 flex items-center gap-1.5 overflow-x-auto scroll-hide shrink-0">
              {stepsList.map((st) => {
                const isActive = resubmitStep === st.num;
                return (
                  <button
                    key={st.num}
                    type="button"
                    onClick={() => setResubmitStep(st.num)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 cursor-pointer ${
                      isActive
                        ? 'btn-primary-gradient text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">{st.icon}</span>
                    <span>{st.label}</span>
                    {st.badge > 0 && (
                      <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${isActive ? 'bg-white/30 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                        {st.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Modal Body / Scrollable Form Sections */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4 text-xs">
              {/* STEP 1: PERSONAL INFORMATION */}
              {resubmitStep === 1 && (
                <div className="space-y-3.5">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">person</span>
                    <span>Personal Information</span>
                  </h4>

                  {/* Profile Photo Preview & Change */}
                  <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-2xl bg-slate-200 overflow-hidden relative border border-slate-300 shrink-0">
                      {resubmitForm.profilePhoto ? (
                        <img
                          src={resubmitForm.profilePhoto}
                          alt="Profile"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-slate-400">
                          <span className="material-symbols-outlined text-[24px]">person</span>
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5 flex-1">
                      <span className="font-bold text-slate-900 block text-[12.5px]">Profile Photo / Selfie</span>
                      <label className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-xl bg-purple-50 text-primary font-bold text-xs border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer">
                        <span className="material-symbols-outlined text-[15px]">upload</span>
                        <span>Replace Photo</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleDocumentUpload('profilePhoto', e)}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={resubmitForm.name}
                      onChange={(e) => setResubmitForm((p) => ({ ...p, name: e.target.value }))}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      placeholder="Enter full name"
                      required
                    />
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Mobile Number (Verified)
                    </label>
                    <input
                      type="text"
                      value={resubmitForm.phone}
                      disabled
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-100 border border-slate-200 text-[13px] font-mono font-bold text-slate-500 cursor-not-allowed"
                    />
                    <span className="text-[10px] text-slate-400 block mt-0.5">Mobile number cannot be altered</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Email Address
                      </label>
                      <input
                        type="email"
                        value={resubmitForm.email}
                        onChange={(e) => setResubmitForm((p) => ({ ...p, email: e.target.value }))}
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                        placeholder="rider@example.com"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Date of Birth
                      </label>
                      <input
                        type="date"
                        value={resubmitForm.dateOfBirth}
                        onChange={(e) => setResubmitForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Gender
                    </label>
                    <select
                      value={resubmitForm.gender}
                      onChange={(e) => setResubmitForm((p) => ({ ...p, gender: e.target.value }))}
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                    >
                      <option value="Male">Male</option>
                      <option value="Female">Female</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              )}

              {/* STEP 2: ADDRESS */}
              {resubmitStep === 2 && (
                <div className="space-y-3.5">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">home_pin</span>
                    <span>Address Details</span>
                  </h4>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Current Street Address
                    </label>
                    <input
                      type="text"
                      value={resubmitForm.address.currentAddress}
                      onChange={(e) =>
                        setResubmitForm((p) => ({
                          ...p,
                          address: { ...p.address, currentAddress: e.target.value },
                        }))
                      }
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      placeholder="House / Flat / Street address"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        City
                      </label>
                      <input
                        type="text"
                        value={resubmitForm.address.city}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            address: { ...p.address, city: e.target.value },
                          }))
                        }
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Pincode
                      </label>
                      <input
                        type="text"
                        maxLength={6}
                        value={resubmitForm.address.pincode}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            address: { ...p.address, pincode: e.target.value.replace(/\D/g, '') },
                          }))
                        }
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-semibold text-slate-900 focus:outline-none focus:border-primary"
                        placeholder="226010"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Permanent Address
                    </label>
                    <input
                      type="text"
                      value={resubmitForm.address.permanentAddress}
                      onChange={(e) =>
                        setResubmitForm((p) => ({
                          ...p,
                          address: { ...p.address, permanentAddress: e.target.value },
                        }))
                      }
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      placeholder="Permanent address (or same as current)"
                    />
                  </div>
                </div>
              )}

              {/* STEP 3: DOCUMENTS */}
              {resubmitStep === 3 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold uppercase tracking-wider text-[11px] text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">badge</span>
                      <span>Identity & Vehicle Documents</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">Upload clear, legible photos</span>
                  </div>

                  {/* Aadhaar Card */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">badge</span>
                        <span>Aadhaar Card</span>
                      </span>
                      <label className="py-1 px-2.5 rounded-lg bg-purple-50 text-primary font-bold text-[11px] border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">upload</span>
                        <span>{resubmitForm.documents.aadhaarDoc ? 'Replace Photo' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleDocumentUpload('aadhaarDoc', e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div>
                      <input
                        type="text"
                        maxLength={12}
                        value={resubmitForm.documents.aadhaarNo}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            documents: { ...p.documents, aadhaarNo: e.target.value.replace(/\D/g, '') },
                          }))
                        }
                        placeholder="12-digit Aadhaar Number"
                        className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-semibold"
                      />
                    </div>

                    {resubmitForm.documents.aadhaarDoc && (
                      <div className="relative h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                        <img
                          src={resubmitForm.documents.aadhaarDoc}
                          alt="Aadhaar"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewImage(resubmitForm.documents.aadhaarDoc)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-[11px] gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                          <span>Click to Inspect Full Photo</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Driving Licence */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">license</span>
                        <span>Driving Licence</span>
                      </span>
                      <label className="py-1 px-2.5 rounded-lg bg-purple-50 text-primary font-bold text-[11px] border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">upload</span>
                        <span>{resubmitForm.documents.drivingLicenceDoc ? 'Replace Photo' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleDocumentUpload('drivingLicenceDoc', e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div>
                      <input
                        type="text"
                        value={resubmitForm.documents.drivingLicenceNo}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            documents: { ...p.documents, drivingLicenceNo: e.target.value.toUpperCase() },
                          }))
                        }
                        placeholder="Driving Licence Number (e.g. DL-UP32-2021-00123)"
                        className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-semibold uppercase"
                      />
                    </div>

                    {resubmitForm.documents.drivingLicenceDoc && (
                      <div className="relative h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                        <img
                          src={resubmitForm.documents.drivingLicenceDoc}
                          alt="Driving Licence"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewImage(resubmitForm.documents.drivingLicenceDoc)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-[11px] gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                          <span>Click to Inspect Full Photo</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* PAN Card */}
                  <div className="p-3.5 rounded-2xl bg-white border border-slate-200 shadow-2xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900 text-[12.5px] flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-primary">credit_card</span>
                        <span>PAN Card</span>
                      </span>
                      <label className="py-1 px-2.5 rounded-lg bg-purple-50 text-primary font-bold text-[11px] border border-purple-200 hover:bg-purple-100 transition-colors cursor-pointer flex items-center gap-1">
                        <span className="material-symbols-outlined text-[13px]">upload</span>
                        <span>{resubmitForm.documents.panDoc ? 'Replace Photo' : 'Upload Photo'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => handleDocumentUpload('panDoc', e)}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div>
                      <input
                        type="text"
                        maxLength={10}
                        value={resubmitForm.documents.panNo}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            documents: { ...p.documents, panNo: e.target.value.toUpperCase() },
                          }))
                        }
                        placeholder="10-digit PAN Number (e.g. ABCDE1234F)"
                        className="w-full py-2 px-3 rounded-xl bg-slate-50 border border-slate-200 text-xs font-mono font-semibold uppercase"
                      />
                    </div>

                    {resubmitForm.documents.panDoc && (
                      <div className="relative h-28 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 group">
                        <img
                          src={resubmitForm.documents.panDoc}
                          alt="PAN"
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => setPreviewImage(resubmitForm.documents.panDoc)}
                          className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-[11px] gap-1"
                        >
                          <span className="material-symbols-outlined text-[16px]">zoom_in</span>
                          <span>Click to Inspect Full Photo</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Vehicle RC & Insurance */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* RC */}
                    <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-[11.5px]">Vehicle RC</span>
                        <label className="py-1 px-2 rounded-lg bg-purple-50 text-primary font-bold text-[10.5px] border border-purple-200 hover:bg-purple-100 cursor-pointer">
                          <span>{resubmitForm.documents.vehicleRcDoc ? 'Replace' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleDocumentUpload('vehicleRcDoc', e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {resubmitForm.documents.vehicleRcDoc && (
                        <div
                          onClick={() => setPreviewImage(resubmitForm.documents.vehicleRcDoc)}
                          className="h-20 rounded-xl overflow-hidden border border-slate-200 cursor-pointer"
                        >
                          <img
                            src={resubmitForm.documents.vehicleRcDoc}
                            alt="RC"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>

                    {/* Insurance */}
                    <div className="p-3 rounded-2xl bg-white border border-slate-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-[11.5px]">Insurance</span>
                        <label className="py-1 px-2 rounded-lg bg-purple-50 text-primary font-bold text-[10.5px] border border-purple-200 hover:bg-purple-100 cursor-pointer">
                          <span>{resubmitForm.documents.insuranceDoc ? 'Replace' : 'Upload'}</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={(e) => handleDocumentUpload('insuranceDoc', e)}
                            className="hidden"
                          />
                        </label>
                      </div>
                      {resubmitForm.documents.insuranceDoc && (
                        <div
                          onClick={() => setPreviewImage(resubmitForm.documents.insuranceDoc)}
                          className="h-20 rounded-xl overflow-hidden border border-slate-200 cursor-pointer"
                        >
                          <img
                            src={resubmitForm.documents.insuranceDoc}
                            alt="Insurance"
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 4: VEHICLE */}
              {resubmitStep === 4 && (
                <div className="space-y-3.5">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">two_wheeler</span>
                    <span>Vehicle Information</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Vehicle Type
                      </label>
                      <select
                        value={resubmitForm.vehicleType}
                        onChange={(e) => setResubmitForm((p) => ({ ...p, vehicleType: e.target.value }))}
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-bold"
                      >
                        <option value="Bike">Motorcycle / Bike</option>
                        <option value="Scooter">Scooter / Activa</option>
                        <option value="EV">Electric Vehicle (EV)</option>
                        <option value="Cycle">Bicycle / Cycle</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Vehicle Reg. No.
                      </label>
                      <input
                        type="text"
                        value={resubmitForm.vehicleNo}
                        onChange={(e) =>
                          setResubmitForm((p) => ({ ...p, vehicleNo: e.target.value.toUpperCase() }))
                        }
                        placeholder="UP32 AB 1234"
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-bold uppercase"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Vehicle Model / Make
                    </label>
                    <input
                      type="text"
                      value={resubmitForm.vehicleModel}
                      onChange={(e) => setResubmitForm((p) => ({ ...p, vehicleModel: e.target.value }))}
                      placeholder="e.g. Hero Splendor Plus, Honda Activa 6G"
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                    />
                  </div>
                </div>
              )}

              {/* STEP 5: BANK DETAILS */}
              {resubmitStep === 5 && (
                <div className="space-y-3.5">
                  <h4 className="font-bold uppercase tracking-wider text-[11px] text-primary flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">account_balance</span>
                    <span>Bank & Settlement Details</span>
                  </h4>

                  <div>
                    <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                      Account Holder Name
                    </label>
                    <input
                      type="text"
                      value={resubmitForm.bankDetails.accountHolderName}
                      onChange={(e) =>
                        setResubmitForm((p) => ({
                          ...p,
                          bankDetails: { ...p.bankDetails, accountHolderName: e.target.value },
                        }))
                      }
                      className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Bank Name
                      </label>
                      <input
                        type="text"
                        value={resubmitForm.bankDetails.bankName}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            bankDetails: { ...p.bankDetails, bankName: e.target.value },
                          }))
                        }
                        placeholder="e.g. HDFC Bank, SBI"
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        Account Number
                      </label>
                      <input
                        type="text"
                        value={resubmitForm.bankDetails.accountNumber}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            bankDetails: {
                              ...p.bankDetails,
                              accountNumber: e.target.value.replace(/\D/g, ''),
                            },
                          }))
                        }
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        IFSC Code
                      </label>
                      <input
                        type="text"
                        maxLength={11}
                        value={resubmitForm.bankDetails.ifscCode}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            bankDetails: { ...p.bankDetails, ifscCode: e.target.value.toUpperCase() },
                          }))
                        }
                        placeholder="HDFC0001234"
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-semibold uppercase text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase block mb-1">
                        UPI ID (for instant payouts)
                      </label>
                      <input
                        type="text"
                        value={resubmitForm.bankDetails.upiId}
                        onChange={(e) =>
                          setResubmitForm((p) => ({
                            ...p,
                            bankDetails: { ...p.bankDetails, upiId: e.target.value },
                          }))
                        }
                        placeholder="name@okhdfcbank"
                        className="w-full py-2.5 px-3 rounded-xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-semibold text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* STEP 6: REVIEW CHANGES & SUBMIT */}
              {resubmitStep === 6 && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold uppercase tracking-wider text-[11px] text-primary flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px]">fact_check</span>
                      <span>Review Corrections Before Resubmitting</span>
                    </h4>
                    <span className="px-2 py-0.5 rounded-full text-[10.5px] font-black bg-indigo-100 text-indigo-800">
                      {diffChanges.length} Change{diffChanges.length === 1 ? '' : 's'} Detected
                    </span>
                  </div>

                  {diffChanges.length === 0 ? (
                    <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-1.5">
                      <span className="material-symbols-outlined text-[24px] text-amber-600">info</span>
                      <p className="text-[12.5px] font-bold text-amber-900">
                        No fields have been modified yet.
                      </p>
                      <p className="text-[11.5px] text-amber-700">
                        Please update the necessary information or re-upload your rejected documents before clicking resubmit.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <span className="text-[11px] font-bold text-slate-500 uppercase block">
                        Summary of Updates Sent to Admin:
                      </span>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                        {diffChanges.map((change, idx) => (
                          <div
                            key={idx}
                            className="p-3 rounded-2xl bg-indigo-50/60 border border-indigo-200 text-left space-y-1 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900 text-xs">
                                {change.label}
                              </span>
                              <span className="px-2 py-0.5 rounded text-[9.5px] font-bold uppercase bg-indigo-100 text-indigo-700">
                                {change.category}
                              </span>
                            </div>
                            {change.isDoc ? (
                              <div className="flex items-center gap-1 text-emerald-700 font-bold text-[11.5px] pt-0.5">
                                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                                <span>{change.newVal}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5 text-[11.5px] pt-0.5">
                                <span className="text-red-500 line-through truncate max-w-[150px]" title={change.oldVal}>
                                  {change.oldVal}
                                </span>
                                <span className="text-slate-400">➔</span>
                                <span className="text-emerald-700 font-bold truncate max-w-[170px]" title={change.newVal}>
                                  {change.newVal}
                                </span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Controls */}
            <div className="p-4 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (resubmitStep > 1) {
                    setResubmitStep((s) => s - 1);
                  } else {
                    setShowResubmitModal(false);
                  }
                }}
                className="py-2.5 px-4 rounded-xl text-slate-600 font-bold text-xs hover:bg-slate-200 transition-colors cursor-pointer"
              >
                {resubmitStep === 1 ? 'Cancel' : 'Previous Step'}
              </button>

              <div className="flex items-center gap-2">
                {resubmitStep < 6 ? (
                  <>
                    {diffChanges.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setResubmitStep(6)}
                        className="py-2.5 px-3.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 transition-colors cursor-pointer"
                      >
                        Review ({diffChanges.length})
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setResubmitStep((s) => Math.min(s + 1, 6))}
                      className="py-2.5 px-5 rounded-xl btn-primary-gradient text-white font-bold text-xs shadow-md shadow-primary/25 cursor-pointer flex items-center gap-1.5"
                    >
                      <span>Next</span>
                      <span className="material-symbols-outlined text-[15px]">arrow_forward</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleResubmitSubmit}
                    disabled={isSubmittingResubmit || diffChanges.length === 0}
                    className="py-2.5 px-6 rounded-xl btn-primary-gradient text-white font-bold text-xs shadow-md shadow-primary/25 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                  >
                    {isSubmittingResubmit ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>Resubmitting...</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[16px]">send</span>
                        <span>Resubmit Application</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Document Preview Modal */}
      {previewImage && (
        <div
          className="fixed inset-0 z-60 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="bg-white rounded-3xl p-4 max-w-[500px] w-full space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-bold text-slate-800 text-xs">Document Preview</span>
              <button
                type="button"
                onClick={() => setPreviewImage(null)}
                className="p-1 rounded-full text-slate-400 hover:text-slate-600"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="max-h-[70vh] overflow-hidden rounded-2xl border border-slate-200">
              <img src={previewImage} alt="Document" className="w-full h-auto object-contain max-h-[65vh]" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
