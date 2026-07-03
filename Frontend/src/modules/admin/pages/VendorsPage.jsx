import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AdminAPI, API_BASE_URL } from '../../../services/api';

export default function VendorsPage() {
  const [activeTab, setActiveTab] = useState('All');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name_asc');
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [selectedVendorDetails, setSelectedVendorDetails] = useState(null);
  const [expandedDoc, setExpandedDoc] = useState(null);
  const [fullscreenImage, setFullscreenImage] = useState(null);
  const [vendors, setVendors] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchVendors = async () => {
    setIsLoading(true);
    try {
      // In a real app we'd pass page and search to the API.
      // For now, getting all or filtering by status.
      const statusFilter = activeTab === 'All' ? '' : activeTab;
      const res = await AdminAPI.getVendors(statusFilter, 1);
      
      // Transform backend data to match frontend structure if needed
      const formattedVendors = res.data.map(v => ({
        id: v._id,
        zeebacId: v.zeebacId,
        name: v.storeName,
        owner: v.ownerName,
        category: v.category,
        shopType: v.shopType,
        location: v.address?.city + ', ' + v.address?.state,
        subscription: v.subscription?.plan || 'Basic Plan (Free)',
        aadhaar: v.aadhaar || 'Uploaded',
        pan: v.pan || 'Uploaded',
        gstNumber: v.gstNumber || 'N/A',
        documents: v.documents || {},
        status: v.status,
        joined: new Date(v.createdAt).toLocaleDateString(),
      }));
      setVendors(formattedVendors);
    } catch (error) {
      console.error("Failed to fetch vendors", error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchVendors();
  }, [activeTab]);

  useEffect(() => {
    const mainContent = document.querySelector('main');
    const scrollTargets = [document.body, document.documentElement, mainContent].filter(Boolean);
    
    if (isDetailsModalOpen || fullscreenImage) {
      scrollTargets.forEach(el => {
        el.style.setProperty('overflow', 'hidden', 'important');
        el.style.setProperty('overflow-y', 'hidden', 'important');
      });
    } else {
      scrollTargets.forEach(el => {
        el.style.removeProperty('overflow');
        el.style.removeProperty('overflow-y');
      });
    }
    
    return () => {
      scrollTargets.forEach(el => {
        el.style.removeProperty('overflow');
        el.style.removeProperty('overflow-y');
      });
    };
  }, [isDetailsModalOpen, fullscreenImage]);

  let filteredVendors = vendors.filter(v => 
    (activeTab === 'All' || v.status === activeTab) &&
    (v.name.toLowerCase().includes(search.toLowerCase()) || v.owner.toLowerCase().includes(search.toLowerCase()))
  );

  filteredVendors.sort((a, b) => {
    if (sortBy === 'name_asc') return a.name.localeCompare(b.name);
    if (sortBy === 'name_desc') return b.name.localeCompare(a.name);
    if (sortBy === 'category') return a.category.localeCompare(b.category);
    return 0;
  });

  const handleOpenDetails = (vendor) => {
    setSelectedVendorDetails(vendor);
    setIsDetailsModalOpen(true);
    setExpandedDoc(null);
  };

  const handleApprove = async (id) => {
    const rate = prompt("Enter cashback rate (e.g. 5 for 5%):", "5");
    if (rate !== null) {
      try {
        await AdminAPI.approveVendor(id, parseFloat(rate));
        fetchVendors();
      } catch (error) {
        alert("Failed to approve vendor");
      }
    }
  };

  const handleReject = async (id) => {
    const reason = prompt("Enter rejection reason:");
    if (reason) {
      try {
        await AdminAPI.rejectVendor(id, reason);
        fetchVendors();
      } catch (error) {
        alert("Failed to reject vendor");
      }
    }
  };

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Vendor Management</h1>
          <p className="text-body-md text-on-surface-variant">Verify KYC documents and manage vendor accounts</p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
          <div className="relative group w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant group-focus-within:text-primary transition-colors">search</span>
            <input 
              type="text" 
              placeholder="Search vendors..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full sm:w-48 focus:w-full sm:focus:w-72 h-10 bg-white border border-outline-variant/30 rounded-xl pl-10 pr-4 text-[14px] focus:outline-none focus:border-primary focus:shadow-[0_2px_12px_rgba(98,0,234,0.08)] transition-all duration-300"
            />
          </div>

          <div className="relative w-full sm:w-auto">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px]">sort</span>
            <select 
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="w-full sm:w-auto h-10 bg-white border border-outline-variant/30 rounded-xl pl-9 pr-8 text-[13px] focus:outline-none focus:border-primary appearance-none cursor-pointer transition-colors"
            >
              <option value="name_asc">Name (A-Z)</option>
              <option value="name_desc">Name (Z-A)</option>
              <option value="category">Category</option>
            </select>
            <span className="absolute right-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-on-surface-variant text-[18px] pointer-events-none">expand_more</span>
          </div>

          <button className="h-10 px-4 bg-primary text-white rounded-xl text-[14px] font-bold flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors shrink-0 w-full sm:w-auto">
            <span className="material-symbols-outlined text-[18px]">download</span>
            <span className="sm:inline">Export</span>
          </button>
        </div>
      </div>

      <div className="flex border-b border-outline-variant/20">
        {['All', 'Pending', 'Verified', 'Rejected'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-6 py-3 font-title-md text-[14px] capitalize transition-all border-b-2 cursor-pointer ${
              activeTab === tab 
                ? 'border-primary text-primary font-bold' 
                : 'border-transparent text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab}
            {tab === 'Pending' && <span className="ml-2 bg-orange-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">2</span>}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] overflow-hidden">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="border-b border-outline-variant/10 text-[11px] uppercase tracking-wider text-on-surface-variant bg-[#f8f9fc]">
                <th className="p-4 font-bold">Store</th>
                <th className="p-4 font-bold">Type</th>
                <th className="p-4 font-bold">Category</th>
                <th className="p-4 font-bold">Owner (KYC)</th>
                <th className="p-4 font-bold">Joined</th>
                <th className="p-4 font-bold">Status</th>
                <th className="p-4 font-bold text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-outline-variant/5 hover:bg-surface-container-low transition-colors text-[14px]">
                  <td className="p-4">
                    <p className="font-bold text-on-surface">{vendor.name}</p>
                    <p className="font-mono text-[11px] text-on-surface-variant mt-0.5">{vendor.id}</p>
                  </td>
                  {/* Shop Type Badge Column */}
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${
                      vendor.shopType === 'Chain & Brand'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      <span className="material-symbols-outlined text-[12px]">
                        {vendor.shopType === 'Chain & Brand' ? 'apartment' : 'storefront'}
                      </span>
                      {vendor.shopType === 'Chain & Brand' ? '🏢 Chain & Brand' : '🏪 Independent Store'}
                    </span>
                  </td>
                  <td className="p-4 text-on-surface-variant">{vendor.category}</td>
                  <td className="p-4">
                    <p className="font-medium text-on-surface">{vendor.owner}</p>
                    <p className="text-[11px] text-on-surface-variant mt-0.5">Aadhaar: {vendor.aadhaar}</p>
                    <p className="text-[11px] text-on-surface-variant">PAN: {vendor.pan}</p>
                  </td>
                  <td className="p-4 text-on-surface-variant">{vendor.joined}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide
                      ${vendor.status === 'Verified' ? 'bg-green-500/10 text-green-600' : ''}
                      ${vendor.status === 'Pending' ? 'bg-orange-500/10 text-orange-600' : ''}
                      ${vendor.status === 'Rejected' ? 'bg-red-500/10 text-red-600' : ''}
                    `}>
                      {vendor.status}
                    </span>
                  </td>
                  <td className="p-4 flex justify-center gap-2 items-center h-full">
                    {vendor.status === 'Pending' ? (
                      <>
                        <button 
                          onClick={() => handleOpenDetails(vendor)}
                          className="px-3 py-1.5 bg-blue-500/10 text-blue-600 font-bold text-[12px] rounded-lg hover:bg-blue-500 hover:text-white transition-colors cursor-pointer"
                        >
                          View Details
                        </button>
                        <button 
                          onClick={() => handleApprove(vendor.id)}
                          className="px-3 py-1.5 bg-green-500/10 text-green-600 font-bold text-[12px] rounded-lg hover:bg-green-500 hover:text-white transition-colors cursor-pointer"
                        >
                          Approve
                        </button>
                        <button 
                          onClick={() => handleReject(vendor.id)}
                          className="px-3 py-1.5 bg-red-500/10 text-red-600 font-bold text-[12px] rounded-lg hover:bg-red-500 hover:text-white transition-colors cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <>
                        <button 
                          onClick={() => handleOpenDetails(vendor)}
                          className="px-3 py-1.5 bg-primary/10 text-primary font-bold text-[12px] rounded-lg hover:bg-primary hover:text-white transition-colors cursor-pointer"
                        >
                          Details
                        </button>
                        <button className="px-3 py-1.5 bg-red-500/10 text-red-600 font-bold text-[12px] rounded-lg hover:bg-red-500 hover:text-white transition-colors cursor-pointer">
                          Suspend
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
              {filteredVendors.length === 0 && (
                <tr>
                  <td colSpan="7" className="p-8 text-center text-on-surface-variant">
                    No vendors found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Vendor Details Modal */}
      {isDetailsModalOpen && selectedVendorDetails && createPortal(
        <div 
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        >
          <div className="bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-outline-variant/10 flex justify-between items-center bg-surface-container-lowest">
              <div>
                <h3 className="font-bold text-title-md text-on-surface">Vendor Complete Details</h3>
                <p className="text-[12px] text-on-surface-variant">ID: {selectedVendorDetails.id}</p>
              </div>
              <button 
                onClick={() => setIsDetailsModalOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-surface-container-low text-on-surface-variant cursor-pointer"
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            
            <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-[#f8f9fa]">
              {/* Store Information */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-outline-variant/10">
                <h4 className="font-bold text-[14px] text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">store</span>
                  Store Information
                </h4>
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Store Name</p>
                    <p className="font-medium text-on-surface">{selectedVendorDetails.name}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Category</p>
                    <p className="font-medium text-on-surface">{selectedVendorDetails.category}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Shop Type</p>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-full ${
                      selectedVendorDetails.shopType === 'Chain & Brand'
                        ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                    }`}>
                      <span className="material-symbols-outlined text-[13px]">
                        {selectedVendorDetails.shopType === 'Chain & Brand' ? 'apartment' : 'storefront'}
                      </span>
                      {selectedVendorDetails.shopType === 'Chain & Brand' ? '🏢 Chain & Brand' : '🏪 Independent Store'}
                    </span>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Location</p>
                    <p className="font-medium text-on-surface">{selectedVendorDetails.location}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">GST Number</p>
                    <p className="font-medium text-on-surface">{selectedVendorDetails.gstNumber}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Joined Date</p>
                    <p className="font-medium text-on-surface">{selectedVendorDetails.joined}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Status</p>
                    <span className={`px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wide inline-block
                      ${selectedVendorDetails.status === 'Verified' ? 'bg-green-500/10 text-green-600' : ''}
                      ${selectedVendorDetails.status === 'Pending' ? 'bg-orange-500/10 text-orange-600' : ''}
                      ${selectedVendorDetails.status === 'Rejected' ? 'bg-red-500/10 text-red-600' : ''}
                    `}>
                      {selectedVendorDetails.status}
                    </span>
                  </div>
                </div>
              </div>

              {/* Owner & Account Information */}
              <div className="bg-white p-4 rounded-xl shadow-sm border border-outline-variant/10">
                <h4 className="font-bold text-[14px] text-on-surface mb-4 flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-[18px]">person</span>
                  Owner & Account Info
                </h4>
                <div className="grid grid-cols-2 gap-4 text-[13px]">
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Owner Name</p>
                    <p className="font-medium text-on-surface">{selectedVendorDetails.owner}</p>
                  </div>
                  <div>
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Contact Email</p>
                    <p className="font-medium text-on-surface">contact@{selectedVendorDetails.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com</p>
                  </div>
                  <div className="col-span-2 sm:col-span-1">
                    <p className="text-on-surface-variant mb-1 text-[11px] uppercase tracking-wider font-bold">Active Subscription</p>
                    <span className="font-mono text-[12px] bg-primary/10 text-primary px-2 py-1 rounded-md font-bold">{selectedVendorDetails.subscription}</span>
                  </div>
                </div>
              </div>

              {/* Aadhaar Section */}
              <div className="bg-white rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <div 
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-surface-container-low transition-colors"
                  onClick={() => setExpandedDoc(expandedDoc === 'aadhaar' ? null : 'aadhaar')}
                >
                  <h4 className="font-bold text-[14px] text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">badge</span>
                    Aadhaar Card
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[13px] bg-primary/5 text-primary px-2 py-1 rounded-md">{selectedVendorDetails.aadhaar}</span>
                    <span className="material-symbols-outlined text-on-surface-variant transition-transform duration-200" style={{ transform: expandedDoc === 'aadhaar' ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                  </div>
                </div>
                {expandedDoc === 'aadhaar' && (
                  <div className="px-4 pb-4 animate-reveal">
                    <div className="w-full h-[200px] bg-surface-container rounded-lg flex items-center justify-center border border-outline-variant/20 overflow-hidden">
                      {selectedVendorDetails.documents?.aadhaarPan?.fileUrl ? (
                        <img 
                          src={`${API_BASE_URL}${selectedVendorDetails.documents.aadhaarPan.fileUrl}`}
                          alt="Aadhaar Card" 
                          className="w-full h-full object-contain cursor-pointer hover:scale-[1.02] transition-transform"
                          onClick={() => setFullscreenImage(`${API_BASE_URL}${selectedVendorDetails.documents.aadhaarPan.fileUrl}`)}
                        />
                      ) : (
                        <span className="text-on-surface-variant font-medium text-[13px]">No document uploaded</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* PAN Section */}
              <div className="bg-white rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <div 
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-surface-container-low transition-colors"
                  onClick={() => setExpandedDoc(expandedDoc === 'pan' ? null : 'pan')}
                >
                  <h4 className="font-bold text-[14px] text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">credit_card</span>
                    PAN Card
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-[13px] bg-primary/5 text-primary px-2 py-1 rounded-md">{selectedVendorDetails.pan}</span>
                    <span className="material-symbols-outlined text-on-surface-variant transition-transform duration-200" style={{ transform: expandedDoc === 'pan' ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                  </div>
                </div>
                {expandedDoc === 'pan' && (
                  <div className="px-4 pb-4 animate-reveal">
                    <div className="w-full h-[200px] bg-surface-container rounded-lg flex items-center justify-center border border-outline-variant/20 overflow-hidden">
                      {selectedVendorDetails.documents?.aadhaarPan?.fileUrl ? (
                        <img 
                          src={`${API_BASE_URL}${selectedVendorDetails.documents.aadhaarPan.fileUrl}`}
                          alt="PAN Card" 
                          className="w-full h-full object-contain cursor-pointer hover:scale-[1.02] transition-transform"
                          onClick={() => setFullscreenImage(`${API_BASE_URL}${selectedVendorDetails.documents.aadhaarPan.fileUrl}`)}
                        />
                      ) : (
                        <span className="text-on-surface-variant font-medium text-[13px]">No document uploaded</span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* GST Certificate Section */}
              <div className="bg-white rounded-xl shadow-sm border border-outline-variant/10 overflow-hidden">
                <div 
                  className="flex justify-between items-center p-4 cursor-pointer hover:bg-surface-container-low transition-colors"
                  onClick={() => setExpandedDoc(expandedDoc === 'gst' ? null : 'gst')}
                >
                  <h4 className="font-bold text-[14px] text-on-surface flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-[18px]">receipt_long</span>
                    GST Certificate
                  </h4>
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-on-surface-variant transition-transform duration-200" style={{ transform: expandedDoc === 'gst' ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                  </div>
                </div>
                {expandedDoc === 'gst' && (
                  <div className="px-4 pb-4 animate-reveal">
                    <div className="w-full h-[200px] bg-surface-container rounded-lg flex items-center justify-center border border-outline-variant/20 overflow-hidden">
                      {selectedVendorDetails.documents?.gstCertificate?.fileUrl ? (
                        <img 
                          src={`${API_BASE_URL}${selectedVendorDetails.documents.gstCertificate.fileUrl}`}
                          alt="GST Certificate" 
                          className="w-full h-full object-contain cursor-pointer hover:scale-[1.02] transition-transform"
                          onClick={() => setFullscreenImage(`${API_BASE_URL}${selectedVendorDetails.documents.gstCertificate.fileUrl}`)}
                        />
                      ) : (
                        <span className="text-on-surface-variant font-medium text-[13px]">No document uploaded</span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-outline-variant/10 flex justify-end gap-3 bg-white">
              <button 
                onClick={() => setIsDetailsModalOpen(false)}
                className="px-6 py-2 rounded-xl border border-outline-variant/20 font-bold text-[14px] text-on-surface-variant hover:bg-surface-container-low transition-colors cursor-pointer"
              >
                Close
              </button>
              {selectedVendorDetails.status === 'Pending' && (
                <button 
                  onClick={() => {
                    handleApprove(selectedVendorDetails.id);
                    setIsDetailsModalOpen(false);
                  }}
                  className="px-6 py-2 rounded-xl bg-primary text-white font-bold text-[14px] hover:bg-primary/90 transition-colors shadow-md cursor-pointer"
                >
                  Verify & Approve
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Fullscreen Image Modal */}
      {fullscreenImage && createPortal(
        <div 
          className="fixed inset-0 bg-black/80 z-[60] flex items-center justify-center p-4 cursor-zoom-out"
          style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
          onClick={() => setFullscreenImage(null)}
        >
          <img 
            src={fullscreenImage} 
            alt="Fullscreen Document" 
            className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
          />
          <button 
            className="absolute top-4 right-4 w-10 h-10 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenImage(null);
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>,
        document.body
      )}

    </div>
  );
}
