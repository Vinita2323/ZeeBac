import { API_BASE_URL } from '../../../../../services/api';

function SectionCard({ title, icon, onEdit, children }) {
  return (
    <div className="bg-white/70 rounded-2xl border border-white/60 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-black text-gray-700 uppercase tracking-wider flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[#7c3aed] text-[16px]">{icon}</span>
          {title}
        </h3>
        <button type="button" onClick={onEdit} className="text-[12px] font-bold text-[#7c3aed] hover:underline cursor-pointer flex items-center gap-0.5">
          <span className="material-symbols-outlined text-[14px]">edit</span> Edit
        </button>
      </div>
      <div className="space-y-1.5 text-[13.5px]">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-3 text-[13px] sm:text-[13.5px]">
      <span className="text-gray-500 shrink-0">{label}</span>
      <span className="font-bold text-gray-900 text-right min-w-0 flex-1 break-words">{value || <span className="text-gray-300">—</span>}</span>
    </div>
  );
}

const docLabel = (v) => {
  if (!v) return null;
  if (v instanceof File) return v.name;
  return v.fileName || 'Uploaded';
};

export default function StepReview({ data, account, onEdit, onSubmit, isSubmitting, confirmChecked, setConfirmChecked }) {
  const docs = data.documents;

  return (
    <div className="w-full glass-panel rounded-3xl p-6 sm:p-8 space-y-4 animate-reveal">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">fact_check</span>
        </div>
        <h1 className="text-[24px] font-black tracking-tight text-gray-900 leading-tight mb-1">Review & Submit</h1>
        <p className="text-[13.5px] text-gray-500">Check everything carefully before sending it to our team.</p>
      </div>

      <SectionCard title="Account" icon="person" onEdit={() => onEdit(1)}>
        <Row label="Name" value={account?.ownerName} />
        <Row label="Mobile" value={account?.phone} />
        <Row label="Email" value={account?.email} />
      </SectionCard>

      <SectionCard title="Business" icon="storefront" onEdit={() => onEdit(2)}>
        <Row label="Shop Name" value={data.storeName} />
        <Row label="Type" value={data.shopType} />
        <Row label="Category" value={data.category} />
        {data.subCategory && <Row label="Sub-category" value={data.subCategory} />}
        {data.gstNumber && <Row label="GST Number" value={data.gstNumber} />}
        <Row label="Contact Number" value={data.businessContactNumber} />
        <Row label="Business Email" value={data.businessEmail} />
      </SectionCard>

      <SectionCard title="Location" icon="location_on" onEdit={() => onEdit(2)}>
        <Row label="Address" value={data.address.fullAddress} />
        <Row label="City" value={data.address.city} />
        <Row label="State" value={data.address.state} />
        <Row label="Pincode" value={data.address.pincode} />
        <Row label="Map Pin" value={data.lat && data.lng ? `${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}` : null} />
      </SectionCard>

      <SectionCard title="Store" icon="photo_library" onEdit={() => onEdit(3)}>
        <Row label="Logo" value={data.storeLogo ? '✓ Uploaded' : null} />
        <Row label="Cover Image" value={data.storeCoverImage ? '✓ Uploaded' : null} />
        <Row label="Gallery" value={data.storeImages?.length ? `${data.storeImages.length} photo(s)` : null} />
        <Row label="Hours" value={data.businessHours?.openingTime ? `${data.businessHours.openingTime} – ${data.businessHours.closingTime}` : null} />
        <Row label="Working Days" value={data.businessHours?.workingDays?.join(', ')} />
      </SectionCard>

      <SectionCard title="Documents" icon="folder" onEdit={() => onEdit(3)}>
        <Row label="Owner ID / KYC" value={docLabel(docs.aadhaarPan) ? `✓ ${docLabel(docs.aadhaarPan)}` : null} />
        <Row label="Shop Registration" value={docLabel(docs.shopLicense) ? `✓ ${docLabel(docs.shopLicense)}` : null} />
        <Row label="GST Certificate" value={docLabel(docs.gstCertificate) ? `✓ ${docLabel(docs.gstCertificate)}` : (data.shopType === 'Chain & Brand' ? null : 'Not provided')} />
        <Row label="PAN Card" value={docLabel(docs.panCard) ? `✓ ${docLabel(docs.panCard)}` : 'Not provided'} />
        <Row label="Cancelled Cheque" value={docLabel(docs.cancelledCheque) ? `✓ ${docLabel(docs.cancelledCheque)}` : 'Not provided'} />
      </SectionCard>

      <label className="flex items-start gap-2.5 p-3 rounded-xl bg-[#7c3aed]/5 cursor-pointer">
        <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#7c3aed] cursor-pointer" />
        <span className="text-[12.5px] text-gray-600 leading-snug">
          Please review your information carefully. Once submitted, your application will be sent to the Zeebac admin team for verification.
        </span>
      </label>

      <button
        onClick={onSubmit}
        disabled={!confirmChecked || isSubmitting}
        className={`w-full h-13 rounded-xl font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 transition-all ${
          confirmChecked && !isSubmitting ? 'btn-primary-gradient text-white active:scale-[0.98] cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {isSubmitting ? <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <>Submit Application <span className="material-symbols-outlined text-[18px]">send</span></>}
      </button>
    </div>
  );
}
