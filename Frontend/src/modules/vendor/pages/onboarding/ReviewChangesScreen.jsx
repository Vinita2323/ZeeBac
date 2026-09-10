const FIELD_LABELS = {
  storeName: 'Business Name',
  shopType: 'Business Type',
  category: 'Category',
  subCategory: 'Sub-category',
  cashbackRate: 'Customer Cashback (%)',
  description: 'Description',
  gstNumber: 'GST Number',
  businessContactNumber: 'Business Contact Number',
  businessEmail: 'Business Email',
  'address.fullAddress': 'Address',
  'address.landmark': 'Landmark',
  'address.city': 'City',
  'address.state': 'State',
  'address.pincode': 'Pincode',
  location: 'Map Location',
  storeLogo: 'Store Logo',
  storeCoverImage: 'Store Cover Image',
  storeImages: 'Store Gallery',
  'businessHours.openingTime': 'Opening Time',
  'businessHours.closingTime': 'Closing Time',
  'businessHours.workingDays': 'Working Days',
  'documents.aadhaarPan': 'Owner ID / KYC Document',
  'documents.gstCertificate': 'GST Certificate',
  'documents.shopLicense': 'Shop Registration Document',
  'documents.panCard': 'PAN Card',
  'documents.cancelledCheque': 'Cancelled Cheque',
  'documents.additionalDoc': 'Additional Document',
};

const SECTIONS = [
  { title: 'Business', fields: ['storeName', 'shopType', 'cashbackRate', 'category', 'subCategory', 'description', 'gstNumber', 'businessContactNumber', 'businessEmail'] },
  { title: 'Location', fields: ['address.fullAddress', 'address.landmark', 'address.city', 'address.state', 'address.pincode', 'location'] },
  { title: 'Store', fields: ['storeLogo', 'storeCoverImage', 'storeImages', 'businessHours.openingTime', 'businessHours.closingTime', 'businessHours.workingDays'] },
  { title: 'Documents', fields: ['documents.aadhaarPan', 'documents.gstCertificate', 'documents.shopLicense', 'documents.panCard', 'documents.cancelledCheque'] },
];

const fileDisplay = (v) => {
  if (!v) return '—';
  if (v instanceof File) return v.name;
  if (typeof v === 'object') return v.fileName || 'Uploaded';
  return String(v);
};

// Reads a scalar/text value out of `current` (form data shape) for a given dot-path.
function readCurrent(current, path) {
  if (path.startsWith('documents.')) return fileDisplay(current.documents[path.split('.')[1]]);
  if (path === 'storeLogo') return fileDisplay(current.storeLogo);
  if (path === 'storeCoverImage') return fileDisplay(current.storeCoverImage);
  if (path === 'storeImages') return `${current.storeImages?.length || 0} photo(s)`;
  if (path === 'location') return current.lat && current.lng ? `${current.lat.toFixed(5)}, ${current.lng.toFixed(5)}` : '—';
  if (path.startsWith('address.')) return current.address[path.split('.')[1]] || '—';
  if (path.startsWith('businessHours.')) {
    const key = path.split('.')[1];
    if (key === 'workingDays') return current.businessHours.workingDays?.join(', ') || '—';
    return current.businessHours[key] || '—';
  }
  if (path === 'cashbackRate') return current.cashbackRate != null ? `${current.cashbackRate}%` : '—';
  return current[path] || '—';
}

// Reads the equivalent value out of `previous` (raw vendor doc from the server).
function readPrevious(previous, path) {
  if (!previous) return '—';
  if (path.startsWith('documents.')) return fileDisplay(previous.documents?.[path.split('.')[1]]);
  if (path === 'storeLogo') return fileDisplay(previous.storeLogo);
  if (path === 'storeCoverImage') return fileDisplay(previous.storeCoverImage);
  if (path === 'storeImages') return `${previous.storeImages?.length || 0} photo(s)`;
  if (path === 'location') return previous.location?.coordinates ? `${previous.location.coordinates[1].toFixed(5)}, ${previous.location.coordinates[0].toFixed(5)}` : '—';
  if (path.startsWith('address.')) return previous.address?.[path.split('.')[1]] || '—';
  if (path.startsWith('businessHours.')) {
    const key = path.split('.')[1];
    if (key === 'workingDays') return previous.businessHours?.workingDays?.join(', ') || '—';
    return previous.businessHours?.[key] || '—';
  }
  if (path === 'cashbackRate') return previous.cashbackRate != null ? `${previous.cashbackRate}%` : '—';
  return previous[path] || '—';
}

export default function ReviewChangesScreen({ previous, current, onEdit, onResubmit, isSubmitting }) {
  const sectionsWithDiffs = SECTIONS.map(section => {
    const changes = section.fields
      .map(path => ({ path, oldValue: readPrevious(previous, path), newValue: readCurrent(current, path) }))
      .filter(c => c.oldValue !== c.newValue);
    return { ...section, changes };
  });

  const totalChanges = sectionsWithDiffs.reduce((sum, s) => sum + s.changes.length, 0);

  return (
    <div className="w-full max-w-lg mx-auto glass-panel rounded-3xl p-6 sm:p-8 space-y-5">
      <div>
        <div className="w-14 h-14 rounded-2xl bg-[#7c3aed]/10 flex items-center justify-center mb-4">
          <span className="material-symbols-outlined text-[#7c3aed] text-[28px]">difference</span>
        </div>
        <h1 className="text-[24px] font-black tracking-tight text-gray-900 leading-tight mb-1">Review Changes</h1>
        <p className="text-[13.5px] text-gray-500">
          {totalChanges === 0
            ? "You haven't changed anything yet — go back and update the field the admin flagged."
            : `You changed ${totalChanges} field${totalChanges > 1 ? 's' : ''}. Here's what will be resubmitted.`}
        </p>
      </div>

      {sectionsWithDiffs.map(section => (
        <div key={section.title} className="bg-white/70 rounded-2xl border border-white/60 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[13px] font-black text-gray-700 uppercase tracking-wider">{section.title}</h3>
            <button type="button" onClick={() => onEdit(section.title === 'Documents' || section.title === 'Store' ? 3 : 2)} className="text-[12px] font-bold text-[#7c3aed] hover:underline cursor-pointer flex items-center gap-0.5">
              <span className="material-symbols-outlined text-[14px]">edit</span> Edit
            </button>
          </div>
          {section.changes.length === 0 ? (
            <p className="text-[13px] text-gray-400 italic">No changes</p>
          ) : (
            <div className="space-y-2.5">
              {section.changes.map(c => (
                <div key={c.path} className="text-[13px]">
                  <p className="font-bold text-gray-700 mb-0.5">{FIELD_LABELS[c.path] || c.path}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-red-500 line-through decoration-red-300">{c.oldValue}</span>
                    <span className="material-symbols-outlined text-gray-400 text-[14px]">arrow_forward</span>
                    <span className="text-green-600 font-bold">{c.newValue}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <button
        onClick={onResubmit}
        disabled={totalChanges === 0 || isSubmitting}
        className={`w-full h-13 rounded-xl font-bold text-[16px] shadow-lg flex items-center justify-center gap-2 transition-all ${
          totalChanges > 0 && !isSubmitting ? 'btn-primary-gradient text-white active:scale-[0.98] cursor-pointer' : 'bg-gray-200 text-gray-400 cursor-not-allowed'
        }`}
      >
        {isSubmitting ? <span className="w-5 h-5 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <>Resubmit Application <span className="material-symbols-outlined text-[18px]">send</span></>}
      </button>
    </div>
  );
}
