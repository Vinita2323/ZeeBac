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

// `mode`: 'register' (public /vendor-app/signup entry) or 'resubmit'
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
  const [previousSnapshotVendor, setPreviousSnapshotVendor] = useState(null);

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
    if (mode !== 'register') return;
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
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fcfaff' }}>
        <div className="w-8 h-8 border-2 border-purple-200 border-t-purple-600 rounded-full animate-spin" />
      </div>
    );
  }

  const totalSteps = 4;
  const visibleStepStart = mode === 'resubmit' ? 2 : 1;
  const visibleTotal = totalSteps - visibleStepStart + 1;
  const visibleCurrent = step - visibleStepStart + 1;

  return (
    <div style={{ minHeight: '100vh', width: '100%', background: '#fcfaff', display: 'block', fontFamily: "'Hanken Grotesk', sans-serif" }}>

      {/* Sticky Header */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(252,250,255,0.92)',
        backdropFilter: 'blur(16px)',
        borderBottom: '1px solid rgba(124,58,237,0.08)',
        width: '100%',
        boxSizing: 'border-box',
      }}>
        <div style={{
          maxWidth: '540px',
          margin: '0 auto',
          padding: '0 16px',
          height: '60px',
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          boxSizing: 'border-box',
          width: '100%',
        }}>
          {/* Back button */}
          {step > visibleStepStart ? (
            <button
              onClick={goBack}
              style={{
                width: '36px', height: '36px', borderRadius: '50%',
                border: 'none', background: 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', flexShrink: 0, color: '#374151',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>arrow_back</span>
            </button>
          ) : (
            <div style={{ width: '36px', height: '36px', flexShrink: 0 }} />
          )}

          {/* Progress */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
              {STEP_LABELS.map((label, idx) => {
                const stepNum = idx + 1;
                if (mode === 'resubmit' && stepNum === 1) return null;
                return (
                  <div key={label} style={{
                    flex: 1, height: '5px', borderRadius: '999px',
                    background: stepNum <= step ? '#7c3aed' : '#e5e7eb',
                    transition: 'background 0.4s ease',
                  }} />
                );
              })}
            </div>
            <p style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', margin: 0 }}>
              Step {visibleCurrent} of {visibleTotal} — {STEP_LABELS[step - 1]}
            </p>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main style={{
        display: 'block',
        width: '100%',
        maxWidth: '540px',
        margin: '0 auto',
        padding: '20px 16px 48px',
        boxSizing: 'border-box',
      }}>
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

        {/* Continue Button */}
        {step > 1 && step < 4 && (
          <button
            onClick={goNext}
            disabled={isSaving}
            style={{
              display: 'flex',
              width: '100%',
              height: '52px',
              marginTop: '20px',
              borderRadius: '14px',
              border: 'none',
              background: 'linear-gradient(135deg, #16082f 0%, #3b0764 50%, #6000da 100%)',
              color: '#ffffff',
              fontWeight: '700',
              fontSize: '15px',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              opacity: isSaving ? 0.6 : 1,
              boxShadow: '0 8px 24px rgba(96,0,218,0.28)',
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              transition: 'opacity 0.2s',
            }}
          >
            {isSaving ? (
              <>
                <span className="w-5 h-5 border-2 border-white/50 border-t-white rounded-full animate-spin" style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.7s linear infinite' }} />
                Saving...
              </>
            ) : (
              <>
                Continue
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </>
            )}
          </button>
        )}
      </main>
    </div>
  );
}
