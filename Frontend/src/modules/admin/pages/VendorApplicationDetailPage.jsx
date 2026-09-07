import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { AdminAPI, API_BASE_URL } from '../../../services/api';
import ApproveDialog from '../components/vendors/ApproveDialog';
import RejectDialog from '../components/vendors/RejectDialog';

const STATUS_BADGE = {
  DRAFT: 'bg-gray-100 text-gray-600',
  PENDING_REVIEW: 'bg-amber-100 text-amber-700',
  RESUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  REJECTED: 'bg-red-100 text-red-700',
};

const HISTORY_META = {
  SUBMITTED: { icon: 'send', color: 'text-primary bg-primary/10' },
  APPROVED: { icon: 'check_circle', color: 'text-green-600 bg-green-100' },
  REJECTED: { icon: 'cancel', color: 'text-red-600 bg-red-100' },
  RESUBMITTED: { icon: 'restart_alt', color: 'text-blue-600 bg-blue-100' },
};

function Section({ title, icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-sm p-5">
      <h3 className="font-bold text-[14px] text-on-surface mb-4 flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-[18px]">{icon}</span>
        {title}
      </h3>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div>
      <p className="text-on-surface-variant text-[11px] uppercase tracking-wider font-bold mb-0.5">{label}</p>
      <p className="font-medium text-on-surface text-[13.5px]">{value || <span className="text-outline">—</span>}</p>
    </div>
  );
}

function DocPreview({ label, doc }) {
  const [fullscreen, setFullscreen] = useState(false);
  if (!doc?.fileUrl) {
    return (
      <div className="flex items-center gap-3 p-3 rounded-xl border border-dashed border-outline-variant/30">
        <span className="material-symbols-outlined text-outline">description</span>
        <div>
          <p className="text-[13px] font-bold text-on-surface-variant">{label}</p>
          <p className="text-[11px] text-outline">Not provided</p>
        </div>
      </div>
    );
  }
  const url = `${API_BASE_URL}${doc.fileUrl}`;
  const isPdf = doc.fileType === 'application/pdf';

  return (
    <>
      <div onClick={() => !isPdf && setFullscreen(true)} className={`flex items-center gap-3 p-3 rounded-xl border border-outline-variant/20 hover:border-primary/40 transition-colors ${!isPdf ? 'cursor-pointer' : ''}`}>
        <div className="w-12 h-12 rounded-lg bg-surface-container overflow-hidden flex items-center justify-center shrink-0">
          {isPdf ? <span className="material-symbols-outlined text-red-500">picture_as_pdf</span> : <img src={url} alt={label} className="w-full h-full object-cover" />}
        </div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-on-surface">{label}</p>
          {isPdf
            ? <a href={url} target="_blank" rel="noreferrer" className="text-[11px] text-primary font-bold hover:underline">Open PDF</a>
            : <p className="text-[11px] text-outline truncate">Tap to view full size</p>}
        </div>
      </div>
      {fullscreen && createPortal(
        <div className="fixed inset-0 bg-black/80 z-[80] flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setFullscreen(false)}>
          <img src={url} alt={label} className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl" />
        </div>, document.body
      )}
    </>
  );
}

export default function VendorApplicationDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [vendor, setVendor] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showApprove, setShowApprove] = useState(false);
  const [showReject, setShowReject] = useState(false);

  const fetchVendor = async () => {
    setIsLoading(true);
    try {
      const res = await AdminAPI.getVendorById(id);
      if (res.success) setVendor(res.data);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { fetchVendor(); }, [id]);

  const handleApprove = async (cashbackRate) => {
    await AdminAPI.approveVendor(id, cashbackRate);
    setShowApprove(false);
    fetchVendor();
  };

  const handleReject = async (reasonCategory, comment) => {
    await AdminAPI.rejectVendor(id, reasonCategory, comment);
    setShowReject(false);
    fetchVendor();
  };

  if (isLoading) {
    return <div className="flex justify-center py-20"><div className="w-8 h-8 border-2 border-primary/20 border-t-primary rounded-full animate-spin" /></div>;
  }
  if (!vendor) {
    return <div className="text-center py-20 text-on-surface-variant">Vendor not found.</div>;
  }

  const latestResubmit = [...(vendor.applicationHistory || [])].reverse().find(h => h.action === 'RESUBMITTED');

  return (
    <div className="space-y-6 animate-reveal text-left pb-10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/admin/vendors')} className="w-9 h-9 rounded-full hover:bg-surface-container-low flex items-center justify-center cursor-pointer">
            <span className="material-symbols-outlined">arrow_back</span>
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[22px] font-black tracking-tight text-on-surface">{vendor.storeName || vendor.ownerName}</h1>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide ${STATUS_BADGE[vendor.applicationStatus] || 'bg-gray-100 text-gray-600'}`}>
                {vendor.applicationStatus === 'RESUBMITTED' ? '🔵 Resubmitted' : vendor.applicationStatus?.replace('_', ' ')}
              </span>
            </div>
            <p className="text-[12px] font-mono text-on-surface-variant">{vendor.zeebacId} · {vendor.phone}</p>
          </div>
        </div>

        {(vendor.applicationStatus === 'PENDING_REVIEW' || vendor.applicationStatus === 'RESUBMITTED') && (
          <div className="flex gap-2">
            <button onClick={() => setShowReject(true)} className="px-4 h-10 rounded-xl bg-red-500/10 text-red-600 font-bold text-[13px] hover:bg-red-500 hover:text-white transition-colors cursor-pointer">
              Reject
            </button>
            <button onClick={() => setShowApprove(true)} className="px-4 h-10 rounded-xl bg-green-500/10 text-green-600 font-bold text-[13px] hover:bg-green-500 hover:text-white transition-colors cursor-pointer">
              Approve
            </button>
          </div>
        )}
      </div>

      {vendor.applicationStatus === 'REJECTED' && (
        <div className="bg-red-50 border border-red-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-red-500 uppercase tracking-wider mb-1">Rejection Reason</p>
          <p className="text-[14px] text-on-surface font-medium">{vendor.rejectionReason}</p>
        </div>
      )}

      {vendor.applicationStatus === 'RESUBMITTED' && latestResubmit && (
        <div className="bg-blue-50 border border-blue-100 rounded-2xl p-4">
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-1">Previous Rejection Reason</p>
          <p className="text-[13.5px] text-on-surface font-medium mb-3">{vendor.rejectionReason}</p>
          <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider mb-2">Changes Since Previous Submission</p>
          {latestResubmit.changedFields?.length > 0 ? (
            <div className="space-y-2">
              {latestResubmit.changedFields.map((c, idx) => (
                <div key={idx} className="text-[13px] bg-white rounded-lg p-2.5">
                  <p className="font-bold text-on-surface mb-1">{c.field}</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-red-500 line-through decoration-red-300">{JSON.stringify(c.oldValue) || '—'}</span>
                    <span className="material-symbols-outlined text-outline text-[14px]">arrow_forward</span>
                    <span className="text-green-600 font-bold">{JSON.stringify(c.newValue) || '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : <p className="text-[13px] text-on-surface-variant">No tracked field changes.</p>}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        <Section title="Vendor Account Details" icon="person">
          <div className="grid grid-cols-2 gap-3">
            <Row label="Owner Name" value={vendor.ownerName} />
            <Row label="Mobile" value={vendor.phone} />
            <Row label="Account Email" value={vendor.email} />
            <Row label="Zeebac ID" value={vendor.zeebacId} />
          </div>
        </Section>

        <Section title="Business Details" icon="storefront">
          <div className="grid grid-cols-2 gap-3">
            <Row label="Shop Name" value={vendor.storeName} />
            <Row label="Type" value={vendor.shopType} />
            <Row label="Category" value={vendor.category} />
            <Row label="Sub-category" value={vendor.subCategory} />
            <Row label="GST Number" value={vendor.gstNumber} />
            <div className="col-span-2"><Row label="Description" value={vendor.description} /></div>
          </div>
        </Section>

        <Section title="Contact Details" icon="call">
          <div className="grid grid-cols-2 gap-3">
            <Row label="Business Contact" value={vendor.businessContactNumber} />
            <Row label="Business Email" value={vendor.businessEmail} />
          </div>
        </Section>

        <Section title="Location" icon="location_on">
          <div className="space-y-3">
            <Row label="Address" value={vendor.address?.fullAddress} />
            <div className="grid grid-cols-3 gap-3">
              <Row label="City" value={vendor.address?.city} />
              <Row label="State" value={vendor.address?.state} />
              <Row label="Pincode" value={vendor.address?.pincode} />
            </div>
            {vendor.location?.coordinates && (
              <a
                href={`https://www.openstreetmap.org/?mlat=${vendor.location.coordinates[1]}&mlon=${vendor.location.coordinates[0]}#map=17/${vendor.location.coordinates[1]}/${vendor.location.coordinates[0]}`}
                target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-[12px] font-bold text-primary hover:underline"
              >
                <span className="material-symbols-outlined text-[15px]">map</span>
                View on map ({vendor.location.coordinates[1].toFixed(5)}, {vendor.location.coordinates[0].toFixed(5)})
              </a>
            )}
          </div>
        </Section>

        <Section title="Store Images" icon="photo_library">
          <div className="flex gap-3 flex-wrap">
            {vendor.storeLogo && <img src={`${API_BASE_URL}${vendor.storeLogo}`} alt="Logo" className="w-16 h-16 rounded-full object-cover border border-outline-variant/20" />}
            {vendor.storeCoverImage && <img src={`${API_BASE_URL}${vendor.storeCoverImage}`} alt="Cover" className="w-24 h-16 rounded-lg object-cover border border-outline-variant/20" />}
            {(vendor.storeImages || []).map((img, i) => (
              <img key={i} src={`${API_BASE_URL}${img}`} alt={`Gallery ${i}`} className="w-16 h-16 rounded-lg object-cover border border-outline-variant/20" />
            ))}
            {!vendor.storeLogo && !vendor.storeCoverImage && !(vendor.storeImages || []).length && <p className="text-[13px] text-outline">No images uploaded</p>}
          </div>
        </Section>

        <Section title="Business Hours" icon="schedule">
          <Row label="Hours" value={vendor.businessHours?.openingTime ? `${vendor.businessHours.openingTime} – ${vendor.businessHours.closingTime}` : null} />
          <div className="mt-2"><Row label="Working Days" value={vendor.businessHours?.workingDays?.join(', ')} /></div>
        </Section>
      </div>

      <Section title="Documents" icon="folder">
        <div className="grid md:grid-cols-2 gap-3">
          <DocPreview label="Owner ID / KYC (Aadhaar/PAN)" doc={vendor.documents?.aadhaarPan} />
          <DocPreview label="Shop Registration Document" doc={vendor.documents?.shopLicense} />
          <DocPreview label="GST Certificate" doc={vendor.documents?.gstCertificate} />
          <DocPreview label="PAN Card" doc={vendor.documents?.panCard} />
          <DocPreview label="Cancelled Cheque" doc={vendor.documents?.cancelledCheque} />
          <DocPreview label="Additional Document" doc={vendor.documents?.additionalDoc} />
        </div>
      </Section>

      <Section title="Application History" icon="history">
        {(!vendor.applicationHistory || vendor.applicationHistory.length === 0) ? (
          <p className="text-[13px] text-outline">No history yet — application still in draft.</p>
        ) : (
          <div className="space-y-0">
            {vendor.applicationHistory.map((h, idx) => {
              const meta = HISTORY_META[h.action] || { icon: 'circle', color: 'text-gray-500 bg-gray-100' };
              return (
                <div key={h._id || idx} className="flex gap-3 pb-5 last:pb-0 relative">
                  {idx < vendor.applicationHistory.length - 1 && <div className="absolute left-[15px] top-8 bottom-0 w-px bg-outline-variant/20" />}
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${meta.color}`}>
                    <span className="material-symbols-outlined text-[16px]">{meta.icon}</span>
                  </div>
                  <div className="pt-0.5">
                    <p className="font-bold text-[13.5px] text-on-surface">
                      {h.action.charAt(0) + h.action.slice(1).toLowerCase()}
                      <span className="font-normal text-on-surface-variant"> · v{h.version} · by {h.actionByRole}</span>
                    </p>
                    <p className="text-[11px] text-outline">{new Date(h.actionAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                    {h.rejectionCategory && <p className="text-[12.5px] text-red-600 mt-1">Reason: {h.rejectionCategory}{h.rejectionComment ? ` — ${h.rejectionComment}` : ''}</p>}
                    {h.changedFields?.length > 0 && <p className="text-[12px] text-on-surface-variant mt-1">{h.changedFields.length} field(s) changed</p>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {showApprove && <ApproveDialog vendorName={vendor.storeName || vendor.ownerName} onConfirm={handleApprove} onClose={() => setShowApprove(false)} />}
      {showReject && <RejectDialog vendorName={vendor.storeName || vendor.ownerName} onConfirm={handleReject} onClose={() => setShowReject(false)} />}
    </div>
  );
}
