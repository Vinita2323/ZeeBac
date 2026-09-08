import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';
import StepAccount from './steps/StepAccount';
import StepBusiness from './steps/StepBusiness';
import StepDocuments from './steps/StepDocuments';
import StepReview from './steps/StepReview';
import ReviewChangesScreen from './ReviewChangesScreen';

const STEP_LABELS = ['Account', 'Business', 'Documents', 'Review'];

const emptyFormData = {
  storeName: '', shopType: '', category: '', subCategory: '', description: '',
  gstNumber: '', businessContactNumber: '', businessEmail: '',
  address: { fullAddress: '', landmark: '', city: '', state: '', pincode: '' },
  lat: null, lng: null,
  storeLogo: null, storeCoverImage: null, storeImages: [],
  businessHours: { openingTime: '', closingTime: '', workingDays: [] },
  documents: { aadhaarPan: null, gstCertificate: null, shopLicense: null, panCard: null, cancelledCheque: null, additionalDoc: null },
};

// Maps a fetched vendor doc onto the wizard's formData shape (existing
// documents/images stay as server objects/URLs until the vendor replaces them).
const vendorToFormData = (vendor) => ({
  storeName: vendor.storeName || '',
  shopType: vendor.shopType || '',
  category: vendor.category || '',
  subCategory: vendor.subCategory || '',
  description: vendor.description || '',
  gstNumber: vendor.gstNumber || '',
  businessContactNumber: vendor.businessContactNumber || '',
  businessEmail: vendor.businessEmail || '',
  address: {
    fullAddress: vendor.address?.fullAddress || '',
    landmark: vendor.address?.landmark || '',
    city: vendor.address?.city || '',
    state: vendor.address?.state || '',
    pincode: vendor.address?.pincode || '',
  },
  lat: vendor.location?.coordinates?.[1] ?? null,
  lng: vendor.location?.coordinates?.[0] ?? null,
  storeLogo: vendor.storeLogo || null,
  storeCoverImage: vendor.storeCoverImage || null,
  storeImages: vendor.storeImages || [],
  businessHours: {
    openingTime: vendor.businessHours?.openingTime || '',
    closingTime: vendor.businessHours?.closingTime || '',
    workingDays: vendor.businessHours?.workingDays || [],
  },
  documents: {
    aadhaarPan: vendor.documents?.aadhaarPan?.fileUrl ? vendor.documents.aadhaarPan : null,
    gstCertificate: vendor.documents?.gstCertificate?.fileUrl ? vendor.documents.gstCertificate : null,
    shopLicense: vendor.documents?.shopLicense?.fileUrl ? vendor.documents.shopLicense : null,
    panCard: vendor.documents?.panCard?.fileUrl ? vendor.documents.panCard : null,
    cancelledCheque: vendor.documents?.cancelledCheque?.fileUrl ? vendor.documents.cancelledCheque : null,
    additionalDoc: vendor.documents?.additionalDoc?.fileUrl ? vendor.documents.additionalDoc : null,
  },
});

const buildPayload = (data) => {
  const payload = new FormData();
  const scalarFields = ['storeName', 'shopType', 'category', 'subCategory', 'description', 'gstNumber', 'businessContactNumber', 'businessEmail'];
  scalarFields.forEach(f => { if (data[f] !== undefined && data[f] !== null) payload.append(f, data[f]); });
  payload.append('address', JSON.stringify(data.address));
  payload.append('businessHours', JSON.stringify(data.businessHours));
  if (data.lat != null) payload.append('lat', data.lat);
  if (data.lng != null) payload.append('lng', data.lng);

  if (data.storeLogo instanceof File) payload.append('storeLogo', data.storeLogo);
  if (data.storeCoverImage instanceof File) payload.append('storeCoverImage', data.storeCoverImage);
  (data.storeImages || []).forEach(img => { if (img instanceof File) payload.append('storeImages', img); });

  Object.entries(data.documents).forEach(([key, val]) => {
    if (val instanceof File) payload.append(key, val);
  });

  return payload;
};

// `mode`: 'register' (public /vendor-app/signup entry) or 'resubmit' (rejected
// vendor editing their existing application). In resubmit mode Step 1 is
// skipped (account already exists) and Step 4 shows the changes-diff screen.
export default function VendorOnboardingWizard({ mode = 'register' }) {
  const navigate = useNavigate();
  const currentUser = useAuthStore((s) => s.currentUser);
  const [step, setStep] = useState(mode === 'resubmit' ? 2 : 1);
  const [account, setAccount] = useState(mode === 'resubmit' ? currentUser : null);
  const [data, setData] = useState(emptyFormData);
  const [errors, setErrors] = useState({});
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingResume, setIsLoadingResume] = useState(mode === 'resubmit' || (!!currentUser && currentUser.applicationStatus === 'DRAFT'));
  const [previousSnapshotVendor, setPreviousSnapshotVendor] = useState(null); // full vendor doc as it was, for the diff screen

  // Resume an existing DRAFT, or load current data for a resubmit edit.
  useEffect(() => {
    if (!isLoadingResume) return;
    VendorAPI.getProfile().then((res) => {
      if (res.success) {
        setAccount(res.data);
        setData(vendorToFormData(res.data));
        setPreviousSnapshotVendor(res.data);
      }
    }).finally(() => setIsLoadingResume(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setData(prev => ({ ...prev, [key]: value }));

  const validateBusiness = () => {
    const next = {};
    if (!data.storeName.trim()) next.storeName = 'Enter your shop name';
    if (!data.shopType) next.shopType = 'Select a business type';
    if (!data.category) next.category = 'Select a business category';
    if (data.shopType === 'Chain & Brand' && !data.gstNumber?.trim()) next.gstNumber = 'GST number is required for Chain & Brand';
    if (!data.address.fullAddress.trim()) next['address.fullAddress'] = 'Enter your business address';
    if (!data.address.city.trim()) next['address.city'] = 'Enter city';
    if (!data.address.state.trim()) next['address.state'] = 'Enter state';
    if (!/^\d{6}$/.test(data.address.pincode)) next['address.pincode'] = 'Enter a valid 6-digit pincode';
    if (data.lat == null || data.lng == null) next.location = 'Select your business location on the map';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateDocuments = () => {
    const next = {};
    if (!data.documents.aadhaarPan) next['documents.aadhaarPan'] = 'Owner ID / KYC document is required';
    if (!data.documents.shopLicense) next['documents.shopLicense'] = 'Business registration document is required';
    if (data.shopType === 'Chain & Brand' && !data.documents.gstCertificate) next['documents.gstCertificate'] = 'GST certificate is required for Chain & Brand';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const saveDraftSilently = async () => {
    if (mode !== 'register') return; // draft endpoint only applies to DRAFT applications
    try {
      setIsSaving(true);
      await VendorAPI.saveApplicationDraft(buildPayload(data));
    } catch (err) {
      console.error('Draft save failed', err);
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = async () => {
    if (step === 2 && !validateBusiness()) return;
    if (step === 3 && !validateDocuments()) return;
    await saveDraftSilently();
    setStep(s => Math.min(s + 1, 4));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goBack = () => {
    setStep(s => Math.max(s - 1, mode === 'resubmit' ? 2 : 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await VendorAPI.submitApplication(buildPayload(data));
      if (res.success) {
        useAuthStore.getState().updateProfile({ applicationStatus: 'PENDING_REVIEW', status: 'Pending' });
        navigate('/vendor/application', { replace: true });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit application.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResubmit = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const res = await VendorAPI.resubmitApplication(buildPayload(data));
      if (res.success) {
        useAuthStore.getState().updateProfile({ applicationStatus: 'RESUBMITTED', status: 'Pending' });
        navigate('/vendor/application', { replace: true });
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to resubmit application.');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoadingResume) {
    return (
      <div className="min-h-screen flex items-center justify-center mesh-gradient">
        <div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }

  const totalSteps = 4;
  const visibleStepStart = mode === 'resubmit' ? 2 : 1;

  return (
    <div className="min-h-screen mesh-gradient text-gray-900 relative" style={{ width: '100%', display: 'block' }}>
      <div className="blob-orb w-72 h-72 bg-primary/14 -top-16 -right-16 animate-drift" />
      <div className="blob-orb w-64 h-64 bg-secondary/12 bottom-10 -left-16 animate-drift-reverse" />

      {/* Header / progress */}
      <header className="sticky top-0 z-50 glass-header border-b border-outline-variant/10">
        <div className="max-w-lg mx-auto w-full px-4 h-16 flex items-center gap-3">
          {step > visibleStepStart ? (
            <button onClick={goBack} className="w-10 h-10 rounded-full hover:bg-gray-100 flex items-center justify-center text-gray-700 cursor-pointer shrink-0">
              <span className="material-symbols-outlined">arrow_back</span>
            </button>
          ) : <div className="w-10 h-10 shrink-0" />}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              {STEP_LABELS.map((label, idx) => {
                const stepNum = idx + 1;
                if (mode === 'resubmit' && stepNum === 1) return null;
                return (
                  <div key={label} className={`flex-1 h-1.5 rounded-full transition-all duration-500 ${stepNum <= step ? 'bg-[#7c3aed]' : 'bg-gray-200'}`} />
                );
              })}
            </div>
            <p className="text-[11px] font-bold text-gray-500 mt-1 truncate">Step {step - visibleStepStart + 1} of {totalSteps - visibleStepStart + 1} — {STEP_LABELS[step - 1]}</p>
          </div>
        </div>
      </header>

      <main style={{ display: 'block', width: '100%', maxWidth: '512px', marginLeft: 'auto', marginRight: 'auto', paddingLeft: '16px', paddingRight: '16px', paddingTop: '24px', paddingBottom: '40px', position: 'relative', zIndex: 10 }}>
        {step === 1 && <StepAccount onComplete={(vendor) => { setAccount(vendor); setStep(2); }} />}
        {step === 2 && <StepBusiness data={data} update={update} errors={errors} />}
        {step === 3 && <StepDocuments data={data} update={update} errors={errors} />}
        {step === 4 && mode === 'register' && (
          <StepReview
            data={data} account={account} onEdit={setStep} onSubmit={handleSubmit}
            isSubmitting={isSaving} confirmChecked={confirmChecked} setConfirmChecked={setConfirmChecked}
          />
        )}
        {step === 4 && mode === 'resubmit' && (
          <ReviewChangesScreen
            previous={previousSnapshotVendor} current={data} onEdit={setStep}
            onResubmit={handleResubmit} isSubmitting={isSaving}
          />
        )}

        {step > 1 && step < 4 && (
          <div className="w-full mt-5">
            <button
              onClick={goNext}
              disabled={isSaving}
              className="w-full h-13 rounded-2xl btn-primary-gradient text-white font-bold text-[15px] flex items-center justify-center gap-2 shadow-lg active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
            >
              {isSaving ? (
                <><span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" /> Saving...</>
              ) : (
                <>Continue <span className="material-symbols-outlined text-[18px]">arrow_forward</span></>
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
