import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import { toast } from 'react-hot-toast';

export default function DeliveryOnboardingWizard() {
  const navigate = useNavigate();
  const setAuth = useDeliveryStore((state) => state.setAuth);

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: Personal
    name: '',
    phone: '',
    email: '',
    dateOfBirth: '',
    gender: 'Male',
    profilePhoto: '',

    // Step 2: Address
    street: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',

    // Step 3: Identity Docs
    aadhaarNo: '',
    aadhaarDoc: '',
    panNo: '',
    panDoc: '',
    drivingLicenceNo: '',
    drivingLicenceDoc: '',

    // Step 4: Vehicle
    vehicleType: 'Bike',
    vehicleNo: '',
    vehicleModel: '',
    vehicleRcDoc: '',
    insuranceDoc: '',

    // Step 5: Bank
    accountHolderName: '',
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',

    // Declaration
    acceptedTerms: false,
  });

  const handleChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // Convert uploaded image to base64 string
  const handleFileUpload = (field, e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be under 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      handleChange(field, reader.result);
      toast.success('Document uploaded successfully');
    };
    reader.readAsDataURL(file);
  };

  // Validation per step
  const validateStep = (step) => {
    if (step === 1) {
      if (!formData.name.trim()) {
        toast.error('Please enter your full name');
        return false;
      }
      const cleanPhone = formData.phone.replace(/\D/g, '');
      if (cleanPhone.length < 10) {
        toast.error('Please enter a valid 10-digit mobile number');
        return false;
      }
      return true;
    }

    if (step === 2) {
      if (!formData.street.trim() || !formData.city.trim() || !formData.pincode.trim()) {
        toast.error('Please fill street address, city, and pincode');
        return false;
      }
      if (formData.pincode.replace(/\D/g, '').length !== 6) {
        toast.error('Please enter a valid 6-digit pincode');
        return false;
      }
      return true;
    }

    if (step === 3) {
      if (!formData.aadhaarNo.trim()) {
        toast.error('Aadhaar number is required for identity verification');
        return false;
      }
      if (formData.vehicleType !== 'Cycle' && !formData.drivingLicenceNo.trim()) {
        toast.error('Driving licence number is required for motorized vehicles');
        return false;
      }
      return true;
    }

    if (step === 4) {
      if (formData.vehicleType !== 'Cycle' && !formData.vehicleNo.trim()) {
        toast.error('Vehicle registration number is required');
        return false;
      }
      return true;
    }

    if (step === 5) {
      if (!formData.accountNumber.trim() && !formData.upiId.trim()) {
        toast.error('Please provide either bank account details or a UPI ID for payouts');
        return false;
      }
      return true;
    }

    return true;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep((prev) => Math.min(prev + 1, 6));
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Final Submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.acceptedTerms) {
      toast.error('Please accept the declaration before submitting');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        name: formData.name.trim(),
        phone: formData.phone.replace(/\D/g, '').slice(-10),
        email: formData.email.trim() || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        gender: formData.gender,
        address: {
          street: formData.street.trim(),
          landmark: formData.landmark.trim(),
          city: formData.city.trim(),
          state: formData.state.trim() || 'Uttar Pradesh',
          pincode: formData.pincode.trim(),
        },
        vehicleType: formData.vehicleType,
        vehicleNo: formData.vehicleNo.trim().toUpperCase(),
        vehicleModel: formData.vehicleModel.trim(),
        documents: {
          profilePhoto: formData.profilePhoto,
          aadhaarNo: formData.aadhaarNo.trim(),
          aadhaarDoc: formData.aadhaarDoc,
          panNo: formData.panNo.trim().toUpperCase(),
          panDoc: formData.panDoc,
          drivingLicenceNo: formData.drivingLicenceNo.trim().toUpperCase(),
          drivingLicenceDoc: formData.drivingLicenceDoc,
          vehicleRcDoc: formData.vehicleRcDoc,
          insuranceDoc: formData.insuranceDoc,
        },
        bankDetails: {
          accountHolderName: formData.accountHolderName.trim() || formData.name.trim(),
          bankName: formData.bankName.trim(),
          accountNumber: formData.accountNumber.trim(),
          ifscCode: formData.ifscCode.trim().toUpperCase(),
          upiId: formData.upiId.trim(),
        },
      };

      const res = await DeliveryAPI.register(payload);
      if (res.success) {
        setAuth(res.data.rider, res.data.token);
        toast.success('Registration successful! Application submitted for review.');
        navigate('/delivery/status');
      } else {
        toast.error(res.message || 'Registration failed');
      }
    } catch (err) {
      console.error('Registration failed', err);
      toast.error(err.response?.data?.message || 'Failed to submit application. Please verify all details.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const steps = [
    { num: 1, title: 'Personal', icon: 'person' },
    { num: 2, title: 'Address', icon: 'home_pin' },
    { num: 3, title: 'Documents', icon: 'badge' },
    { num: 4, title: 'Vehicle', icon: 'two_wheeler' },
    { num: 5, title: 'Bank', icon: 'account_balance' },
    { num: 6, title: 'Review', icon: 'fact_check' },
  ];

  return (
    <div className="mesh-gradient min-h-screen flex flex-col font-body-lg pb-12 text-on-surface">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md px-4 py-3.5 border-b border-slate-100 shadow-xs">
        <div className="max-w-[520px] mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Link
              to="/delivery/login"
              className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
            </Link>
            <div>
              <h1 className="font-display font-black text-[16px] text-slate-900 leading-tight">
                Delivery Partner Onboarding
              </h1>
              <p className="text-[11px] text-slate-500 font-medium">
                Step {currentStep} of 6 • {steps[currentStep - 1].title} Details
              </p>
            </div>
          </div>
          <span className="text-[12px] font-bold text-primary font-mono bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">
            {Math.round((currentStep / 6) * 100)}%
          </span>
        </div>
      </header>

      {/* Progress Stepper Bar */}
      <div className="bg-white border-b border-slate-100 px-4 py-2.5">
        <div className="max-w-[520px] mx-auto flex items-center justify-between">
          {steps.map((s) => (
            <div
              key={s.num}
              onClick={() => {
                if (s.num < currentStep) setCurrentStep(s.num);
              }}
              className={`flex flex-col items-center gap-1 cursor-pointer transition-all ${
                s.num === currentStep
                  ? 'text-primary scale-105'
                  : s.num < currentStep
                  ? 'text-emerald-600'
                  : 'text-slate-300'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[12px] font-black transition-all ${
                  s.num === currentStep
                    ? 'btn-primary-gradient text-white shadow-md shadow-primary/25'
                    : s.num < currentStep
                    ? 'bg-emerald-500 text-white'
                    : 'bg-slate-100 text-slate-400'
                }`}
              >
                {s.num < currentStep ? (
                  <span className="material-symbols-outlined text-[14px]">check</span>
                ) : (
                  s.num
                )}
              </div>
              <span className="text-[9.5px] font-bold tracking-tight hidden sm:block">
                {s.title}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Form Container */}
      <main className="flex-1 max-w-[520px] w-full mx-auto p-4">
        <div className="bg-white rounded-3xl p-5 sm:p-7 border border-slate-100 shadow-xl space-y-5">
          {/* STEP 1: Personal Details */}
          {currentStep === 1 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-black text-[18px] text-slate-900">Personal Information</h2>
                <p className="text-[12px] text-slate-500">Provide your basic contact and identity details</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Full Name (as per Aadhaar / PAN) *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  placeholder="e.g. Ramesh Kumar Sharma"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[14px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Mobile Number (WhatsApp linked) *
                </label>
                <div className="flex items-center gap-2">
                  <span className="px-3 py-3 rounded-2xl bg-slate-100 text-[13px] font-bold text-slate-700 select-none">
                    +91
                  </span>
                  <input
                    type="tel"
                    maxLength={10}
                    value={formData.phone}
                    onChange={(e) => handleChange('phone', e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    className="flex-1 py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[14px] font-bold text-slate-900 font-mono focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Email Address (Optional)
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="ramesh.kumar@example.com"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-medium text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Date of Birth
                  </label>
                  <input
                    type="date"
                    value={formData.dateOfBirth}
                    onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                    className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-800 focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleChange('gender', e.target.value)}
                    className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-semibold text-slate-800 focus:outline-none focus:border-primary"
                  >
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              {/* Profile Photo */}
              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Profile Photo (Selfie / Clear Face Photo)
                </label>
                <div className="flex items-center gap-3">
                  {formData.profilePhoto ? (
                    <img
                      src={formData.profilePhoto}
                      alt="Profile preview"
                      className="w-14 h-14 rounded-2xl object-cover border-2 border-primary/30"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
                      <span className="material-symbols-outlined text-[24px]">person</span>
                    </div>
                  )}
                  <label className="flex-1 cursor-pointer py-2.5 px-3.5 rounded-2xl bg-purple-50 border border-purple-200 text-primary text-[12.5px] font-bold text-center hover:bg-purple-100 transition-colors flex items-center justify-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">add_a_photo</span>
                    <span>{formData.profilePhoto ? 'Change Photo' : 'Upload Selfie'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload('profilePhoto', e)}
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Address Details */}
          {currentStep === 2 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-black text-[18px] text-slate-900">Residential Address</h2>
                <p className="text-[12px] text-slate-500">Where you currently reside and operate delivery from</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Street / House No. / Area *
                </label>
                <input
                  type="text"
                  value={formData.street}
                  onChange={(e) => handleChange('street', e.target.value)}
                  placeholder="e.g. Flat 302, Sector 12, Vikas Nagar"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[14px] font-medium text-slate-900 focus:outline-none focus:border-primary"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Landmark (Optional)
                </label>
                <input
                  type="text"
                  value={formData.landmark}
                  onChange={(e) => handleChange('landmark', e.target.value)}
                  placeholder="Near Water Tank / SBI Branch"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-medium text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    City *
                  </label>
                  <input
                    type="text"
                    value={formData.city}
                    onChange={(e) => handleChange('city', e.target.value)}
                    placeholder="Lucknow"
                    className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                    required
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Pincode *
                  </label>
                  <input
                    type="text"
                    maxLength={6}
                    value={formData.pincode}
                    onChange={(e) => handleChange('pincode', e.target.value.replace(/\D/g, ''))}
                    placeholder="226022"
                    className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-bold text-slate-900 font-mono focus:outline-none focus:border-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={formData.state || 'Uttar Pradesh'}
                  onChange={(e) => handleChange('state', e.target.value)}
                  placeholder="Uttar Pradesh"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>
            </div>
          )}

          {/* STEP 3: Identity Documents */}
          {currentStep === 3 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-black text-[18px] text-slate-900">Identity Documents</h2>
                <p className="text-[12px] text-slate-500">Government issued KYC documents for fast verification</p>
              </div>

              {/* Aadhaar */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">badge</span>
                    <span>Aadhaar Card *</span>
                  </span>
                  {formData.aadhaarDoc && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      <span>Uploaded</span>
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={12}
                  value={formData.aadhaarNo}
                  onChange={(e) => handleChange('aadhaarNo', e.target.value.replace(/\D/g, ''))}
                  placeholder="12-digit Aadhaar Number"
                  className="w-full py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                  required
                />
                <label className="block cursor-pointer py-2 px-3 rounded-xl bg-purple-50 border border-purple-200 text-primary text-[11.5px] font-bold text-center hover:bg-purple-100 transition-colors">
                  <span>{formData.aadhaarDoc ? 'Replace Aadhaar Photo' : '+ Upload Aadhaar Front / Full Card'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload('aadhaarDoc', e)}
                  />
                </label>
              </div>

              {/* PAN */}
              <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">credit_card</span>
                    <span>PAN Card (Optional)</span>
                  </span>
                  {formData.panDoc && (
                    <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                      <span className="material-symbols-outlined text-[13px]">check_circle</span>
                      <span>Uploaded</span>
                    </span>
                  )}
                </div>
                <input
                  type="text"
                  maxLength={10}
                  value={formData.panNo}
                  onChange={(e) => handleChange('panNo', e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  className="w-full py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary uppercase"
                />
                <label className="block cursor-pointer py-2 px-3 rounded-xl bg-purple-50 border border-purple-200 text-primary text-[11.5px] font-bold text-center hover:bg-purple-100 transition-colors">
                  <span>{formData.panDoc ? 'Replace PAN Photo' : '+ Upload PAN Photo'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload('panDoc', e)}
                  />
                </label>
              </div>

              {/* Driving Licence */}
              {formData.vehicleType !== 'Cycle' && (
                <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-slate-800 flex items-center gap-1.5">
                      <span className="material-symbols-outlined text-[16px] text-primary">license</span>
                      <span>Driving Licence *</span>
                    </span>
                    {formData.drivingLicenceDoc && (
                      <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-0.5">
                        <span className="material-symbols-outlined text-[13px]">check_circle</span>
                        <span>Uploaded</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.drivingLicenceNo}
                    onChange={(e) => handleChange('drivingLicenceNo', e.target.value.toUpperCase())}
                    placeholder="DL Number (e.g. UP3220200012345)"
                    className="w-full py-2.5 px-3 rounded-xl bg-white border border-slate-200 text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary uppercase"
                    required
                  />
                  <label className="block cursor-pointer py-2 px-3 rounded-xl bg-purple-50 border border-purple-200 text-primary text-[11.5px] font-bold text-center hover:bg-purple-100 transition-colors">
                    <span>{formData.drivingLicenceDoc ? 'Replace DL Photo' : '+ Upload Driving Licence Photo'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleFileUpload('drivingLicenceDoc', e)}
                    />
                  </label>
                </div>
              )}
            </div>
          )}

          {/* STEP 4: Vehicle Details */}
          {currentStep === 4 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-black text-[18px] text-slate-900">Vehicle Information</h2>
                <p className="text-[12px] text-slate-500">Details of the two-wheeler you will use for order deliveries</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Vehicle Type *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {['Bike', 'Scooter', 'EV', 'Cycle'].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleChange('vehicleType', v)}
                      className={`py-3 px-2 rounded-2xl border text-center font-bold text-[12.5px] transition-all cursor-pointer flex flex-col items-center gap-1 ${
                        formData.vehicleType === v
                          ? 'btn-primary-gradient text-white border-transparent shadow-md shadow-primary/25'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:border-primary/50'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[20px]">
                        {v === 'Cycle' ? 'pedal_bike' : v === 'EV' ? 'electric_scooter' : 'two_wheeler'}
                      </span>
                      <span>{v}</span>
                    </button>
                  ))}
                </div>
              </div>

              {formData.vehicleType !== 'Cycle' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Vehicle Registration No. *
                      </label>
                      <input
                        type="text"
                        value={formData.vehicleNo}
                        onChange={(e) => handleChange('vehicleNo', e.target.value.toUpperCase())}
                        placeholder="UP32 AB 1234"
                        className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-mono font-bold text-slate-900 uppercase focus:outline-none focus:border-primary"
                        required
                      />
                    </div>

                    <div>
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                        Vehicle Model / Make
                      </label>
                      <input
                        type="text"
                        value={formData.vehicleModel}
                        onChange={(e) => handleChange('vehicleModel', e.target.value)}
                        placeholder="Hero Splendor / Activa"
                        className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-medium text-slate-900 focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  {/* RC & Insurance uploads */}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="cursor-pointer p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center hover:border-primary transition-colors block">
                      <span className="material-symbols-outlined text-primary text-[20px] block mb-1">description</span>
                      <span className="text-[11px] font-bold text-slate-800 block truncate">
                        {formData.vehicleRcDoc ? 'RC Uploaded ✓' : 'Upload RC'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('vehicleRcDoc', e)}
                      />
                    </label>

                    <label className="cursor-pointer p-3 rounded-2xl bg-slate-50 border border-slate-200 text-center hover:border-primary transition-colors block">
                      <span className="material-symbols-outlined text-primary text-[20px] block mb-1">verified_user</span>
                      <span className="text-[11px] font-bold text-slate-800 block truncate">
                        {formData.insuranceDoc ? 'Insurance ✓' : 'Upload Insurance'}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('insuranceDoc', e)}
                      />
                    </label>
                  </div>
                </>
              )}
            </div>
          )}

          {/* STEP 5: Bank Details */}
          {currentStep === 5 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-black text-[18px] text-slate-900">Payout & Bank Account</h2>
                <p className="text-[12px] text-slate-500">Your delivery earnings will be directly transferred here</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  UPI ID (Fastest Payouts)
                </label>
                <input
                  type="text"
                  value={formData.upiId}
                  onChange={(e) => handleChange('upiId', e.target.value)}
                  placeholder="e.g. mobile@upi or username@okhdfcbank"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-4 text-slate-400 text-[11px] font-bold uppercase">Or Bank Account</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Account Holder Name
                </label>
                <input
                  type="text"
                  value={formData.accountHolderName}
                  onChange={(e) => handleChange('accountHolderName', e.target.value)}
                  placeholder={formData.name || 'Account Holder Name'}
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-semibold text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                  Bank Name
                </label>
                <input
                  type="text"
                  value={formData.bankName}
                  onChange={(e) => handleChange('bankName', e.target.value)}
                  placeholder="State Bank of India / HDFC Bank"
                  className="w-full py-3 px-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-[13.5px] font-medium text-slate-900 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    Account Number
                  </label>
                  <input
                    type="password"
                    value={formData.accountNumber}
                    onChange={(e) => handleChange('accountNumber', e.target.value.replace(/\D/g, ''))}
                    placeholder="••••••••••••"
                    className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block mb-1">
                    IFSC Code
                  </label>
                  <input
                    type="text"
                    maxLength={11}
                    value={formData.ifscCode}
                    onChange={(e) => handleChange('ifscCode', e.target.value.toUpperCase())}
                    placeholder="SBIN0001234"
                    className="w-full py-3 px-3 rounded-2xl bg-slate-50 border border-slate-200 text-[13px] font-mono font-bold text-slate-900 uppercase focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Summary & Submission */}
          {currentStep === 6 && (
            <div className="space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="font-display font-black text-[18px] text-slate-900">Application Review</h2>
                <p className="text-[12px] text-slate-500">Please review your information before final submission</p>
              </div>

              {/* Summary Cards */}
              <div className="space-y-2.5 text-left text-[12.5px]">
                {/* Personal */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 block text-[10.5px] uppercase font-bold">Personal</span>
                    <strong className="text-slate-900 block text-[13.5px]">{formData.name}</strong>
                    <span className="text-slate-600 font-mono">+91 {formData.phone}</span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(1)}
                    className="text-primary text-[11px] font-bold hover:underline"
                  >
                    Edit
                  </button>
                </div>

                {/* Address */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 block text-[10.5px] uppercase font-bold">Address</span>
                    <span className="text-slate-800 font-medium line-clamp-1">
                      {formData.street}, {formData.city} - {formData.pincode}
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(2)}
                    className="text-primary text-[11px] font-bold hover:underline"
                  >
                    Edit
                  </button>
                </div>

                {/* Vehicle */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 block text-[10.5px] uppercase font-bold">Vehicle</span>
                    <span className="text-slate-900 font-bold">
                      {formData.vehicleType} • {formData.vehicleNo || 'Bicycle'}
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(4)}
                    className="text-primary text-[11px] font-bold hover:underline"
                  >
                    Edit
                  </button>
                </div>

                {/* Bank / UPI */}
                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 flex justify-between items-center">
                  <div>
                    <span className="text-slate-500 block text-[10.5px] uppercase font-bold">Payout Mode</span>
                    <span className="text-slate-900 font-mono font-bold">
                      {formData.upiId ? `UPI: ${formData.upiId}` : `A/C: ••••${formData.accountNumber.slice(-4)}`}
                    </span>
                  </div>
                  <button
                    onClick={() => setCurrentStep(5)}
                    className="text-primary text-[11px] font-bold hover:underline"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Declaration Checkbox */}
              <label className="flex items-start gap-2.5 p-3 rounded-2xl bg-purple-50/60 border border-purple-100 cursor-pointer text-left">
                <input
                  type="checkbox"
                  checked={formData.acceptedTerms}
                  onChange={(e) => handleChange('acceptedTerms', e.target.checked)}
                  className="mt-1 w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer"
                />
                <span className="text-[11.5px] text-slate-700 leading-snug">
                  I hereby declare that the documents and information provided are true to the best of my knowledge. I agree to ZeeBac delivery partner service terms and conduct guidelines.
                </span>
              </label>
            </div>
          )}

          {/* Stepper Navigation Buttons */}
          <div className="pt-2 flex items-center justify-between gap-3">
            {currentStep > 1 ? (
              <button
                type="button"
                onClick={handlePrev}
                className="py-3 px-5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[13px] transition-colors cursor-pointer flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[16px]">arrow_back</span>
                <span>Back</span>
              </button>
            ) : (
              <Link
                to="/delivery/login"
                className="py-3 px-4 text-slate-500 font-bold text-[12.5px] hover:text-slate-800"
              >
                Already registered?
              </Link>
            )}

            {currentStep < 6 ? (
              <button
                type="button"
                onClick={handleNext}
                className="flex-1 py-3.5 px-6 rounded-2xl btn-primary-gradient text-white font-bold text-[13.5px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span>Continue</span>
                <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting || !formData.acceptedTerms}
                className="flex-1 py-3.5 px-6 rounded-2xl btn-primary-gradient text-white font-bold text-[14px] shadow-lg shadow-primary/25 active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[18px]">send</span>
                    <span>Submit Application</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

