import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { VendorAPI, AuthAPI } from '../../../../services/api';
import useAuthStore from '../../../../store/useAuthStore';
import useLanguageStore from '../../../../store/useLanguageStore';
import StepBusinessType from './steps/StepBusinessType';
import StepRetailerSubtype from './steps/StepRetailerSubtype';
import StepAccount from './steps/StepAccount';
import StepBusiness from './steps/StepBusiness';
import StepDocuments from './steps/StepDocuments';
import StepReview from './steps/StepReview';
import ReviewChangesScreen from './ReviewChangesScreen';
import { isFoodSector, isManufacturerOrWholesaler } from '../../../../utils/vendorSectorUtils';

const STEP_LABELS = ['Account', 'Business', 'Documents', 'Review'];

const emptyFormData = {
  storeName: '',
  shopType: 'Independent Store',
  businessType: '',
  retailerSubtype: null,
  category: '',
  subCategory: '',
  description: '',
  cashbackRate: 2,
  gstNumber: '',
  fssaiNumber: '',
  businessContactNumber: '',
  businessEmail: '',
  address: { fullAddress: '', landmark: '', city: '', state: '', pincode: '' },
  lat: null,
  lng: null,
  storeLogo: null,
  storeCoverImage: null,
  storeImages: [],
  businessHours: { openingTime: '', closingTime: '', workingDays: [] },
  documents: {
    aadhaarPan: null,
    gstCertificate: null,
    shopLicense: null,
    panCard: null,
    cancelledCheque: null,
    additionalDoc: null,
    udyamCertificate: null,
    trademarkCertificate: null,
    fssaiCertificate: null,
  },
};

const vendorToFormData = (vendor) => ({
  storeName: vendor.storeName || '',
  shopType: vendor.shopType || 'Independent Store',
  businessType: vendor.businessType || '',
  retailerSubtype: vendor.retailerSubtype || (vendor.shopType === 'Chain & Brand' ? 'chain_brand' : (vendor.businessType === 'Retailer' ? 'independent_store' : null)),
  category: vendor.category || '',
  subCategory: vendor.subCategory || '',
  description: vendor.description || '',
  cashbackRate: vendor.cashbackRate ?? (vendor.shopType === 'Chain & Brand' ? 5 : 2),
  gstNumber: vendor.gstNumber || '',
  fssaiNumber: vendor.fssaiNumber || '',
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
    udyamCertificate: vendor.documents?.udyamCertificate?.fileUrl ? vendor.documents.udyamCertificate : (vendor.documents?.trademarkCertificate?.fileUrl ? vendor.documents.trademarkCertificate : null),
    trademarkCertificate: vendor.documents?.trademarkCertificate?.fileUrl ? vendor.documents.trademarkCertificate : null,
    fssaiCertificate: vendor.documents?.fssaiCertificate?.fileUrl ? vendor.documents.fssaiCertificate : null,
  },
});

const buildPayload = (data) => {
  const payload = new FormData();
  const scalarFields = [
    'storeName',
    'shopType',
    'businessType',
    'retailerSubtype',
    'category',
    'subCategory',
    'description',
    'cashbackRate',
    'gstNumber',
    'fssaiNumber',
    'businessContactNumber',
    'businessEmail',
  ];
  scalarFields.forEach(f => {
    if (data[f] !== undefined && data[f] !== null) payload.append(f, data[f]);
  });
  payload.append('address', JSON.stringify(data.address));
  payload.append('businessHours', JSON.stringify(data.businessHours));
  if (data.lat != null) payload.append('lat', data.lat);
  if (data.lng != null) payload.append('lng', data.lng);

  if (data.storeLogo instanceof File) payload.append('storeLogo', data.storeLogo);
  if (data.storeCoverImage instanceof File) payload.append('storeCoverImage', data.storeCoverImage);
  (data.storeImages || []).forEach(img => {
    if (img instanceof File) payload.append('storeImages', img);
  });

  Object.entries(data.documents).forEach(([key, val]) => {
    if (val instanceof File) payload.append(key, val);
  });

  return payload;
};

// `mode`: 'register' (public /vendor-app/signup entry) or 'resubmit'
export default function VendorOnboardingWizard({ mode = 'register' }) {
  const navigate = useNavigate();
  const { t } = useLanguageStore();
  const currentUser = useAuthStore((s) => s.currentUser);

  // 'type_select' | 'subtype_select' | 'form'
  const isResuming = mode === 'resubmit' || (!!currentUser && currentUser.applicationStatus === 'DRAFT');
  const [entryPhase, setEntryPhase] = useState(isResuming ? 'form' : 'type_select');

  const [step, setStep] = useState(mode === 'resubmit' ? 2 : 1);
  const [account, setAccount] = useState(mode === 'resubmit' ? currentUser : null);
  const [accountState, setAccountState] = useState({ name: '', phone: '', email: '' });
  const [data, setData] = useState(emptyFormData);
  const [errors, setErrors] = useState({});
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoadingResume, setIsLoadingResume] = useState(isResuming);
  const [previousSnapshotVendor, setPreviousSnapshotVendor] = useState(null);
  const [minRates, setMinRates] = useState({
    'Independent Store': 2,
    'Chain & Brand': 5,
  });

  useEffect(() => {
    AuthAPI.getCashbackRules().then((res) => {
      if (res.success && res.data?.minRates) {
        setMinRates(res.data.minRates);
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isLoadingResume) return;
    VendorAPI.getProfile().then((res) => {
      if (res.success) {
        setAccount(res.data);
        const parsed = vendorToFormData(res.data);
        setData(parsed);
        setPreviousSnapshotVendor(res.data);
        if (!parsed.businessType) {
          setEntryPhase('type_select');
        } else {
          setEntryPhase('form');
        }
      }
    }).finally(() => setIsLoadingResume(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const update = (key, value) => setData(prev => ({ ...prev, [key]: value }));

  // Selection step handlers
  const handleSelectBusinessType = (typeId) => {
    update('businessType', typeId);
    if (typeId === 'Retailer') {
      if (!data.retailerSubtype) {
        update('retailerSubtype', 'independent_store');
        update('shopType', 'Independent Store');
      }
    } else {
      update('retailerSubtype', null);
      update('shopType', 'Independent Store');
      update('cashbackRate', 0);
    }
  };

  const handleContinueFromBusinessType = () => {
    if (!data.businessType) return;
    if (data.businessType === 'Retailer') {
      setEntryPhase('subtype_select');
    } else {
      setEntryPhase('form');
      setStep(1);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectRetailerSubtype = (subtypeId, shopTypeName) => {
    update('retailerSubtype', subtypeId);
    update('shopType', shopTypeName);
    const min = minRates[shopTypeName] ?? (shopTypeName === 'Chain & Brand' ? 5 : 2);
    if (data.cashbackRate === undefined || data.cashbackRate === null || Number(data.cashbackRate) < min) {
      update('cashbackRate', min);
    }
  };

  const handleContinueFromRetailerSubtype = () => {
    if (!data.retailerSubtype) return;
    setEntryPhase('form');
    setStep(1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const validateBusiness = () => {
    const next = {};
    const isB2B = isManufacturerOrWholesaler(data.businessType);
    const isChain = data.retailerSubtype === 'chain_brand' || data.shopType === 'Chain & Brand';

    if (!data.storeName.trim()) next.storeName = isB2B ? t('Enter Company / Enterprise Name') : t('Enter your business name');
    if (!data.businessType) next.businessType = t('Select your merchant trade type (Manufacturer, Wholesaler, or Retailer)');
    if (data.businessType === 'Retailer' && !data.shopType) next.shopType = t('Select a retailer scale');
    if (!data.category) next.category = t('Select a business category');

    if (isB2B) {
      if (!data.gstNumber?.trim()) {
        next.gstNumber = t('GST number is required for Manufacturer and Wholesaler');
      }
    } else if (isChain && !data.gstNumber?.trim()) {
      next.gstNumber = t('GST number is required for Chain & Brand');
    }

    if (isB2B && isFoodSector(data.category, data.subCategory) && data.fssaiNumber?.trim() && !/^\d{14}$/.test(data.fssaiNumber.trim())) {
      next.fssaiNumber = t('Enter a valid 14-digit FSSAI License Number');
    }

    if (!data.address.fullAddress.trim()) next['address.fullAddress'] = t('Enter your business address');
    if (!data.address.city.trim()) next['address.city'] = t('Enter city');
    if (!data.address.state.trim()) next['address.state'] = t('Enter state');
    if (!/^\d{6}$/.test(data.address.pincode)) next['address.pincode'] = t('Enter a valid 6-digit pincode');
    if (data.lat == null || data.lng == null) next.location = t('Select your business location on the map');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const validateDocuments = () => {
    const next = {};
    const isB2B = isManufacturerOrWholesaler(data.businessType);

    if (isB2B) {
      const hasUdyam = !!(data.documents.udyamCertificate || data.documents.trademarkCertificate);
      if (!hasUdyam) {
        next['documents.udyamCertificate'] = t('Trademark certificate / Udyam certificate is required');
      }
      if (!data.documents.gstCertificate) {
        next['documents.gstCertificate'] = t('GST certificate is required');
      }
      if (isFoodSector(data.category, data.subCategory) && !data.documents.fssaiCertificate) {
        next['documents.fssaiCertificate'] = t('FSSAI license certificate is required for food sector');
      }
    } else {
      if (!data.documents.aadhaarPan) next['documents.aadhaarPan'] = t('Owner ID / KYC document is required');
      if (!data.documents.shopLicense) next['documents.shopLicense'] = t('Business registration document is required');
      if ((data.retailerSubtype === 'chain_brand' || data.shopType === 'Chain & Brand') && !data.documents.gstCertificate) {
        next['documents.gstCertificate'] = t('GST certificate is required for Chain & Brand');
      }
    }

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
    if (entryPhase === 'form' && step === 1) {
      // Return to selection step
      if (data.businessType === 'Retailer') {
        setEntryPhase('subtype_select');
      } else {
        setEntryPhase('type_select');
      }
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (entryPhase === 'subtype_select') {
      setEntryPhase('type_select');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (entryPhase === 'type_select') {
      navigate('/vendor-app/login');
      return;
    }

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
          <button
            onClick={goBack}
            id="wizard-header-back-button"
            aria-label="Back"
            style={{
              width: '36px', height: '36px', borderRadius: '50%',
              border: 'none', background: 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', flexShrink: 0, color: '#374151',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>arrow_back</span>
          </button>

          {/* Progress / Title */}
          <div style={{ flex: 1, minWidth: 0 }}>
            {entryPhase === 'type_select' ? (
              <div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ flex: 1, height: '5px', borderRadius: '999px', background: '#7c3aed' }} />
                  <div style={{ flex: 1, height: '5px', borderRadius: '999px', background: '#e5e7eb' }} />
                </div>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', margin: 0 }}>
                  {t('Register Your Business')} — {t('Step 1: Business Type')}
                </p>
              </div>
            ) : entryPhase === 'subtype_select' ? (
              <div>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '4px' }}>
                  <div style={{ flex: 1, height: '5px', borderRadius: '999px', background: '#7c3aed' }} />
                  <div style={{ flex: 1, height: '5px', borderRadius: '999px', background: '#7c3aed' }} />
                </div>
                <p style={{ fontSize: '11px', fontWeight: '700', color: '#6b7280', margin: 0 }}>
                  {t('Register Your Business')} — {t('Step 2: Retailer Model')}
                </p>
              </div>
            ) : (
              <div>
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
                  {t('Step')} {visibleCurrent} {t('of')} {visibleTotal} — {t(STEP_LABELS[step - 1])}
                </p>
              </div>
            )}
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
        {/* Phase 1: Business Type Selection Screen */}
        {entryPhase === 'type_select' && (
          <StepBusinessType
            selectedType={data.businessType}
            onSelect={handleSelectBusinessType}
            onContinue={handleContinueFromBusinessType}
            onBack={() => navigate('/vendor-app/login')}
          />
        )}

        {/* Phase 2: Retailer Subtype Selection Screen */}
        {entryPhase === 'subtype_select' && (
          <StepRetailerSubtype
            selectedSubtype={data.retailerSubtype}
            onSelect={handleSelectRetailerSubtype}
            onContinue={handleContinueFromRetailerSubtype}
            onBack={() => setEntryPhase('type_select')}
          />
        )}

        {/* Phase 3: Registration Wizard Steps */}
        {entryPhase === 'form' && step === 1 && (
          <StepAccount
            businessType={data.businessType}
            retailerSubtype={data.retailerSubtype}
            shopType={data.shopType}
            accountState={accountState}
            onUpdateAccountState={setAccountState}
            onComplete={(vendor) => {
              setAccount(vendor);
              setStep(2);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {entryPhase === 'form' && step === 2 && (
          <StepBusiness
            data={data}
            update={update}
            errors={errors}
            minRates={minRates}
          />
        )}

        {entryPhase === 'form' && step === 3 && (
          <StepDocuments
            data={data}
            update={update}
            errors={errors}
          />
        )}

        {entryPhase === 'form' && step === 4 && mode === 'register' && (
          <StepReview
            data={data}
            account={account}
            onEdit={setStep}
            onSubmit={handleSubmit}
            isSubmitting={isSaving}
            confirmChecked={confirmChecked}
            setConfirmChecked={setConfirmChecked}
          />
        )}

        {entryPhase === 'form' && step === 4 && mode === 'resubmit' && (
          <ReviewChangesScreen
            previous={previousSnapshotVendor}
            current={data}
            onEdit={setStep}
            onResubmit={handleResubmit}
            isSubmitting={isSaving}
          />
        )}

        {/* Continue Button for Steps 2 & 3 */}
        {entryPhase === 'form' && step > 1 && step < 4 && (
          <button
            onClick={goNext}
            disabled={isSaving}
            id="wizard-step-continue-button"
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
                {t('Saving...')}
              </>
            ) : (
              <>
                {t('Continue')}
                <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>arrow_forward</span>
              </>
            )}
          </button>
        )}
      </main>
    </div>
  );
}
