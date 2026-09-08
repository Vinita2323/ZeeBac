import { API_BASE_URL } from '../../../../../services/api';

const MAX_SIZE_MB = 5;

// `value` is either:
//  - a browser File object (freshly picked, not yet uploaded)
//  - a server document object { fileName, fileUrl, fileType } (already on the application)
//  - null/undefined (nothing uploaded)
export default function UploadCard({ label, required, value, onUpload, onRemove, error }) {
  const id = `upload-${label.replace(/\s+/g, '-').toLowerCase()}`;
  const isFile = value instanceof File;
  const isServerDoc = value && !isFile;

  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      alert('Only JPG, PNG, WEBP, or PDF files are allowed.');
      return;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      alert(`File is too large. Max size is ${MAX_SIZE_MB}MB.`);
      return;
    }
    onUpload(file);
  };

  const fileName = isFile ? value.name : isServerDoc ? (value.fileName || 'Document') : null;
  const isPdf = (isFile && value.type === 'application/pdf') || (isServerDoc && value.fileType === 'application/pdf');
  const previewUrl = isFile ? URL.createObjectURL(value) : (isServerDoc && value.fileUrl ? `${API_BASE_URL}${value.fileUrl}` : null);

  return (
    <div className="space-y-1">
      <div className={`relative overflow-hidden bg-white border-2 border-dashed rounded-lg p-4 transition-colors ${error ? 'border-red-300' : 'border-gray-200 hover:border-[#7c3aed]/50'}`}>
        <input type="file" id={id} className="hidden" onChange={handleChange} accept="image/*,.pdf,application/pdf" />

        {!value ? (
          <label htmlFor={id} className="flex items-center gap-3 cursor-pointer">
            <div className="w-12 h-12 rounded-xl bg-[#7c3aed]/5 flex items-center justify-center text-[#7c3aed] shrink-0">
              <span className="material-symbols-outlined">cloud_upload</span>
            </div>
            <div className="min-w-0">
              <h4 className="font-bold text-[14px] text-gray-900">{label}{required && <span className="text-red-500"> *</span>}{!required && <span className="text-gray-400 font-medium"> (Optional)</span>}</h4>
              <p className="text-[12px] text-gray-500">Tap to upload — image or PDF, max {MAX_SIZE_MB}MB</p>
            </div>
          </label>
        ) : (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl bg-green-50 flex items-center justify-center text-green-600 shrink-0 overflow-hidden">
                {!isPdf && previewUrl ? (
                  <img src={previewUrl} alt={label} className="w-full h-full object-cover" />
                ) : (
                  <span className="material-symbols-outlined">{isPdf ? 'picture_as_pdf' : 'task'}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-[13.5px] sm:text-[14px] text-gray-900 truncate">{label}</h4>
                <p className="text-[12px] text-gray-500 truncate">{fileName}</p>
              </div>
            </div>
            <button type="button" onClick={onRemove} className="text-red-500 px-3 py-1.5 rounded-lg bg-red-50 text-[12px] font-bold hover:bg-red-100 transition-colors shrink-0 cursor-pointer">
              Replace
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="text-[11.5px] font-bold text-red-500 flex items-center gap-1 ml-1">
          <span className="material-symbols-outlined text-[13px]">error</span>{error}
        </p>
      )}
    </div>
  );
}
