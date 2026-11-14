import { getMediaUrl } from '../../../../../services/api';
import UploadCard from '../components/UploadCard';
import WorkingHoursPicker from '../components/WorkingHoursPicker';
import { isFoodSector, isManufacturerOrWholesaler } from '../../../../../utils/vendorSectorUtils';

function ImagePicker({ label, value, onChange, round }) {
  const isFile = value instanceof File;
  const previewUrl = isFile ? URL.createObjectURL(value) : (value ? getMediaUrl(value) : null);
  const inputId = `img-${label.replace(/\s+/g, '-').toLowerCase()}`;

  return (
    <div className="space-y-1.5">
      <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">{label}</label>
      <input type="file" id={inputId} className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && onChange(e.target.files[0])} />
      <label
        htmlFor={inputId}
        className={`relative flex items-center justify-center bg-gray-50 border-2 border-dashed border-gray-200 hover:border-[#7c3aed]/40 cursor-pointer overflow-hidden transition-colors ${
          round ? 'w-24 h-24 rounded-full' : 'w-full h-28 rounded-xl'
        }`}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
        ) : (
          <span className="material-symbols-outlined text-gray-400 text-[28px]">add_a_photo</span>
        )}
      </label>
    </div>
  );
}

export default function StepDocuments({ data, update, errors }) {
  const isB2B = isManufacturerOrWholesaler(data.businessType);
  const isFood = isFoodSector(data.category, data.subCategory);
  const updateDoc = (key, file) => update('documents', { ...data.documents, [key]: file });

  const handleGalleryAdd = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 6 - (data.storeImages?.length || 0));
    if (files.length) update('storeImages', [...(data.storeImages || []), ...files]);
    e.target.value = '';
  };
  const removeGalleryImage = (idx) => {
    update('storeImages', data.storeImages.filter((_, i) => i !== idx));
  };

  return (
    <div className="w-full box-border bg-white/85 backdrop-blur-xl border border-white/90 rounded-3xl p-4 sm:p-7 shadow-xl flex flex-col gap-6">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">photo_library</span>
        </div>
        <h1 className="text-[22px] sm:text-[24px] font-black tracking-tight text-gray-900 leading-tight mb-1">
          {isB2B ? 'Enterprise logo & documents' : 'Store info & documents'}
        </h1>
        <p className="text-[13px] sm:text-[13.5px] text-gray-500">
          {isB2B
            ? 'Add your company logo and the official documents to verify your enterprise.'
            : 'Add your store visuals and the documents we need to verify your business.'}
        </p>
      </div>

      {/* Store visuals */}
      {isB2B ? (
        <div className="flex items-center gap-4 p-3.5 bg-purple-50/50 rounded-2xl border border-purple-100">
          <div className="shrink-0">
            <ImagePicker label="Company Logo (Optional)" round value={data.storeLogo} onChange={(f) => update('storeLogo', f)} />
          </div>
          <div className="text-[12.5px] text-gray-600">
            <p className="font-bold text-gray-900 mb-0.5">{data.businessType} Enterprise Logo</p>
            <p className="text-[11.5px] text-gray-500">Displayed on B2B invoices, merchant catalogues, and retail purchase orders.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-col sm:flex-row items-start gap-4">
            <div className="w-full sm:w-auto flex justify-center sm:block">
              <ImagePicker label="Store Logo" round value={data.storeLogo} onChange={(f) => update('storeLogo', f)} />
            </div>
            <div className="flex-1 w-full">
              <ImagePicker label="Store Cover Image" value={data.storeCoverImage} onChange={(f) => update('storeCoverImage', f)} />
            </div>
          </div>

          {/* Gallery */}
          <div className="space-y-1.5">
            <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">Store Gallery (Optional, up to 6)</label>
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {(data.storeImages || []).map((img, idx) => {
                const url = img instanceof File ? URL.createObjectURL(img) : getMediaUrl(img);
                return (
                  <div key={idx} className="relative aspect-square rounded-lg overflow-hidden group">
                    <img src={url} alt="" className="w-full h-full object-cover" />
                    <button type="button" onClick={() => removeGalleryImage(idx)} className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                      <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                  </div>
                );
              })}
              {(data.storeImages?.length || 0) < 6 && (
                <label className="aspect-square rounded-lg bg-gray-50 border-2 border-dashed border-gray-200 hover:border-[#7c3aed]/40 flex items-center justify-center cursor-pointer transition-colors">
                  <input type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryAdd} />
                  <span className="material-symbols-outlined text-gray-400">add</span>
                </label>
              )}
            </div>
          </div>

          <WorkingHoursPicker value={data.businessHours} onChange={(v) => update('businessHours', v)} />
        </>
      )}

      {/* Documents */}
      <div className="pt-2 border-t border-gray-100 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-[13px] font-black text-gray-700 uppercase tracking-wider">
            {isB2B ? `${data.businessType} Verification Documents` : 'Verification Documents'}
          </h3>
          {isB2B && (
            <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded-full border border-purple-200">
              {data.businessType} Simplified KYC
            </span>
          )}
        </div>

        {isB2B ? (
          <>
            <p className="text-[12px] text-gray-500">
              Only the following official verification documents are required for {data.businessType || 'B2B'} enterprise onboarding:
            </p>

            {/* 1. Trademark / Udyam Certificate */}
            <UploadCard
              label="Trademark Certificate / Udyami Certificate"
              required
              value={data.documents.udyamCertificate}
              onUpload={(f) => updateDoc('udyamCertificate', f)}
              onRemove={() => updateDoc('udyamCertificate', null)}
              error={errors['documents.udyamCertificate']}
            />

            {/* 2. GST Certificate */}
            <UploadCard
              label="GST Certificate"
              required
              value={data.documents.gstCertificate}
              onUpload={(f) => updateDoc('gstCertificate', f)}
              onRemove={() => updateDoc('gstCertificate', null)}
              error={errors['documents.gstCertificate']}
            />

            {/* 3. FSSAI License (for food sector) */}
            <UploadCard
              label={`FSSAI License Certificate${isFood ? ' (Required for Food Sector)' : ' (Food Sector Only - Optional)'}`}
              required={isFood}
              value={data.documents.fssaiCertificate}
              onUpload={(f) => updateDoc('fssaiCertificate', f)}
              onRemove={() => updateDoc('fssaiCertificate', null)}
              error={errors['documents.fssaiCertificate']}
            />
          </>
        ) : (
          <>
            <UploadCard label="Owner ID / KYC Document (Aadhaar / PAN)" required value={data.documents.aadhaarPan} onUpload={(f) => updateDoc('aadhaarPan', f)} onRemove={() => updateDoc('aadhaarPan', null)} error={errors['documents.aadhaarPan']} />
            <UploadCard label="Business / Shop Registration Document" required value={data.documents.shopLicense} onUpload={(f) => updateDoc('shopLicense', f)} onRemove={() => updateDoc('shopLicense', null)} error={errors['documents.shopLicense']} />
            <UploadCard
              label="GST Certificate"
              required={data.shopType === 'Chain & Brand'}
              value={data.documents.gstCertificate}
              onUpload={(f) => updateDoc('gstCertificate', f)}
              onRemove={() => updateDoc('gstCertificate', null)}
              error={errors['documents.gstCertificate']}
            />
            <UploadCard label="PAN Card" value={data.documents.panCard} onUpload={(f) => updateDoc('panCard', f)} onRemove={() => updateDoc('panCard', null)} />
            <UploadCard label="Cancelled Cheque" value={data.documents.cancelledCheque} onUpload={(f) => updateDoc('cancelledCheque', f)} onRemove={() => updateDoc('cancelledCheque', null)} />
            <UploadCard label="Additional Document" value={data.documents.additionalDoc} onUpload={(f) => updateDoc('additionalDoc', f)} onRemove={() => updateDoc('additionalDoc', null)} />
          </>
        )}

        <p className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-1">
          <span className="material-symbols-outlined text-[13px]">lock</span>
          Documents are stored securely and are only visible to Zeebac's verification team.
        </p>
      </div>
    </div>
  );
}
