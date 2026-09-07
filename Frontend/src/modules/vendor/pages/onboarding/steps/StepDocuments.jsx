import { API_BASE_URL } from '../../../../../services/api';
import UploadCard from '../components/UploadCard';
import WorkingHoursPicker from '../components/WorkingHoursPicker';

function ImagePicker({ label, value, onChange, round }) {
  const isFile = value instanceof File;
  const previewUrl = isFile ? URL.createObjectURL(value) : (value ? `${API_BASE_URL}${value}` : null);
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
    <div className="w-full max-w-[520px] glass-panel rounded-[2rem] p-7 space-y-6">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">photo_library</span>
        </div>
        <h1 className="text-[24px] font-black tracking-tight text-gray-900 leading-tight mb-1">Store info & documents</h1>
        <p className="text-[13.5px] text-gray-500">Add your store visuals and the documents we need to verify your business.</p>
      </div>

      {/* Store visuals */}
      <div className="flex items-start gap-4">
        <ImagePicker label="Store Logo" round value={data.storeLogo} onChange={(f) => update('storeLogo', f)} />
        <div className="flex-1">
          <ImagePicker label="Store Cover Image" value={data.storeCoverImage} onChange={(f) => update('storeCoverImage', f)} />
        </div>
      </div>

      {/* Gallery */}
      <div className="space-y-1.5">
        <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">Store Gallery (Optional, up to 6)</label>
        <div className="grid grid-cols-4 gap-2">
          {(data.storeImages || []).map((img, idx) => {
            const url = img instanceof File ? URL.createObjectURL(img) : `${API_BASE_URL}${img}`;
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

      {/* Documents */}
      <div className="pt-2 border-t border-gray-100 space-y-3">
        <h3 className="text-[13px] font-black text-gray-700 uppercase tracking-wider">Verification Documents</h3>
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
        <p className="text-[11px] text-gray-400 flex items-center gap-1.5 pt-1">
          <span className="material-symbols-outlined text-[13px]">lock</span>
          Documents are stored securely and are only visible to Zeebac's verification team.
        </p>
      </div>
    </div>
  );
}
