import React, { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function RewardsManagerPage() {
  const [activeTab, setActiveTab] = useState('rules'); // 'rules' or 'offers'

  // Rules state
  const [rules, setRules] = useState({
    milestoneInterval: 5,
    minScratchReward: 5,
    maxScratchReward: 50,
    isActive: true,
  });
  const [isSavingRules, setIsSavingRules] = useState(false);

  // Offers state
  const [offers, setOffers] = useState([]);
  const [isLoadingOffers, setIsLoadingOffers] = useState(true);
  
  // New Offer Form State
  const [showAddOffer, setShowAddOffer] = useState(false);
  const [newOffer, setNewOffer] = useState({
    brandName: '',
    title: '',
    description: '',
    pointsRequired: '',
    logoUrl: '',
    claimUrl: '',
    couponCode: '',
    isActive: true
  });

  useEffect(() => {
    fetchRules();
    fetchOffers();
  }, []);

  const fetchRules = async () => {
    try {
      const res = await AdminAPI.getRewardConfig();
      if (res.success && res.data) {
        setRules(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchOffers = async () => {
    try {
      setIsLoadingOffers(true);
      const res = await AdminAPI.getPartnerOffers();
      if (res.success) {
        setOffers(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingOffers(false);
    }
  };

  const handleSaveRules = async () => {
    try {
      setIsSavingRules(true);
      const res = await AdminAPI.updateRewardConfig(rules);
      if (res.success) {
        alert('Reward rules updated successfully');
      }
    } catch (err) {
      alert('Failed to update reward rules');
    } finally {
      setIsSavingRules(false);
    }
  };

  const handleAddOffer = async (e) => {
    e.preventDefault();
    try {
      const res = await AdminAPI.createPartnerOffer(newOffer);
      if (res.success) {
        setShowAddOffer(false);
        setNewOffer({ brandName: '', title: '', description: '', pointsRequired: '', logoUrl: '', claimUrl: '', couponCode: '', isActive: true });
        fetchOffers();
      }
    } catch (err) {
      alert('Failed to add offer');
    }
  };

  const handleToggleOffer = async (id, currentStatus) => {
    try {
      await AdminAPI.updatePartnerOffer(id, { isActive: !currentStatus });
      fetchOffers();
    } catch (err) {
      alert('Failed to update offer status');
    }
  };

  const handleDeleteOffer = async (id) => {
    if (!window.confirm('Are you sure you want to delete this offer?')) return;
    try {
      await AdminAPI.deletePartnerOffer(id);
      fetchOffers();
    } catch (err) {
      alert('Failed to delete offer');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-reveal" style={{ fontFamily: "'Quicksand', sans-serif" }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-on-surface">Rewards & Revenue Hub</h1>
          <p className="text-on-surface-variant mt-1">Manage scratch cards, user referral & withdrawal limits, subscription fees, and partner offers.</p>
        </div>

        {activeTab === 'offers' && (
          <button
            onClick={() => setShowAddOffer(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-primary text-white font-bold rounded-xl shadow-md hover:bg-primary/90 transition-all cursor-pointer text-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span> Add Partner Offer
          </button>
        )}
      </div>

      {/* Tabs Header */}
      <div className="flex gap-3 border-b border-outline-variant/20 pb-2">
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-5 py-2.5 font-bold rounded-xl text-sm transition-all cursor-pointer ${
            activeTab === 'rules'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-white border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Rules & Revenue Settings
        </button>
        <button
          onClick={() => setActiveTab('offers')}
          className={`px-5 py-2.5 font-bold rounded-xl text-sm transition-all cursor-pointer ${
            activeTab === 'offers'
              ? 'bg-primary text-white shadow-sm'
              : 'bg-white border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low'
          }`}
        >
          Partner Offers ({offers.length})
        </button>
      </div>

      {/* Tab 1: Rules & Revenue Settings */}
      {activeTab === 'rules' && (
        <div className="space-y-6 max-w-4xl">
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <h2 className="text-xl font-bold mb-6 text-on-surface">Scratch Card Settings</h2>
            <div className="space-y-6">
              <div className="flex items-center justify-between p-4 bg-surface-container-low rounded-xl border border-outline-variant/30">
                <div>
                  <h3 className="font-bold text-sm text-on-surface">Enable Scratch Cards</h3>
                  <p className="text-xs text-on-surface-variant">Turn this off to hide the rewards section from users.</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={rules.isActive !== false}
                    onChange={(e) => setRules({ ...rules, isActive: e.target.checked })}
                  />
                  <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Milestone Interval (Transactions)</label>
                <input
                  type="number"
                  value={rules.milestoneInterval || ''}
                  onChange={(e) => setRules({ ...rules, milestoneInterval: parseInt(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                  placeholder="e.g. 5"
                />
                <p className="text-xs text-on-surface-variant mt-1">Users will unlock a scratch card every {rules.milestoneInterval || 5} payments.</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-bold text-on-surface-variant mb-2">Min Reward (₹)</label>
                  <input
                    type="number"
                    value={rules.minScratchReward || ''}
                    onChange={(e) => setRules({ ...rules, minScratchReward: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                    placeholder="e.g. 5"
                  />
                </div>
                <div>
                  <label className="block text-sm font-bold text-on-surface-variant mb-2">Max Reward (₹)</label>
                  <input
                    type="number"
                    value={rules.maxScratchReward || ''}
                    onChange={(e) => setRules({ ...rules, maxScratchReward: parseInt(e.target.value) || 0 })}
                    className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                    placeholder="e.g. 50"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <h2 className="text-xl font-bold mb-6 text-on-surface">Revenue & Referral Config</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Referral Reward (₹)</label>
                <input
                  type="number"
                  value={rules.referralReward ?? 25}
                  onChange={(e) => setRules({ ...rules, referralReward: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Min Withdrawal (₹)</label>
                <input
                  type="number"
                  value={rules.userMinWithdrawalAmount ?? 250}
                  onChange={(e) => setRules({ ...rules, userMinWithdrawalAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Max Withdrawal (₹)</label>
                <input
                  type="number"
                  value={rules.userMaxWithdrawalAmount ?? 10000}
                  onChange={(e) => setRules({ ...rules, userMaxWithdrawalAmount: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Withdrawal Fee (%)</label>
                <input
                  type="number"
                  step="0.5"
                  value={rules.userWithdrawalCommissionPercent ?? 2}
                  onChange={(e) => setRules({ ...rules, userWithdrawalCommissionPercent: parseFloat(e.target.value) || 0 })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20">
            <h2 className="text-xl font-bold mb-6 text-on-surface">Vendor Subscription Rates</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-4 bg-surface-container-low rounded-xl space-y-3">
                <h3 className="font-bold text-sm text-on-surface">Independent Store Pricing</h3>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Monthly Plan (₹)</label>
                  <input
                    type="number"
                    value={rules.vendorMonthlySubPriceIndependent ?? 499}
                    onChange={(e) => setRules({ ...rules, vendorMonthlySubPriceIndependent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Yearly Plan (₹)</label>
                  <input
                    type="number"
                    value={rules.vendorYearlySubPriceIndependent ?? 4999}
                    onChange={(e) => setRules({ ...rules, vendorYearlySubPriceIndependent: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div className="p-4 bg-surface-container-low rounded-xl space-y-3">
                <h3 className="font-bold text-sm text-on-surface">Chain & Brand Pricing</h3>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Monthly Plan (₹)</label>
                  <input
                    type="number"
                    value={rules.vendorMonthlySubPriceBrand ?? 1499}
                    onChange={(e) => setRules({ ...rules, vendorMonthlySubPriceBrand: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-on-surface-variant mb-1">Yearly Plan (₹)</label>
                  <input
                    type="number"
                    value={rules.vendorYearlySubPriceBrand ?? 14999}
                    onChange={(e) => setRules({ ...rules, vendorYearlySubPriceBrand: parseFloat(e.target.value) || 0 })}
                    className="w-full px-3 py-1.5 bg-white border border-outline-variant/30 rounded-lg text-sm"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleSaveRules}
              disabled={isSavingRules}
              className="px-8 py-3 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer text-sm shadow-md"
            >
              {isSavingRules ? 'Saving All Settings...' : 'Save All Settings'}
            </button>
          </div>
        </div>
      )}

      {/* Tab 2: Partner Offers */}
      {activeTab === 'offers' && (
        <div className="space-y-6">
          {isLoadingOffers ? (
            <div className="p-8 text-center text-on-surface-variant">Loading partner offers...</div>
          ) : offers.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-outline-variant/20 shadow-sm">
              <span className="material-symbols-outlined text-4xl text-on-surface-variant mb-2">local_offer</span>
              <p className="font-bold text-on-surface">No Partner Offers Created Yet</p>
              <p className="text-sm text-on-surface-variant mt-1 mb-4">Add partner deals and brand coupons for reward redemptions.</p>
              <button
                onClick={() => setShowAddOffer(true)}
                className="px-6 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors cursor-pointer text-sm shadow"
              >
                Create First Partner Offer
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {offers.map((offer) => (
                <div key={offer._id} className="bg-white rounded-2xl p-6 border border-outline-variant/20 shadow-sm flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-extrabold text-xs uppercase px-2.5 py-1 bg-primary/10 text-primary rounded-md tracking-wider">
                        {offer.brandName}
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${offer.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                        {offer.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </div>

                    <h3 className="font-bold text-base text-on-surface">{offer.title}</h3>
                    <p className="text-xs text-on-surface-variant mt-1 line-clamp-2">{offer.description}</p>
                    
                    {offer.couponCode && (
                      <div className="mt-3 p-2 bg-surface-container-low rounded-lg font-mono text-xs font-bold text-on-surface flex justify-between items-center">
                        <span>Code: {offer.couponCode}</span>
                        {offer.pointsRequired && <span className="text-primary">{offer.pointsRequired} pts</span>}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between mt-5 pt-4 border-t border-outline-variant/10">
                    <button
                      onClick={() => handleToggleOffer(offer._id, offer.isActive)}
                      className="text-xs font-bold text-primary hover:underline cursor-pointer"
                    >
                      {offer.isActive ? 'Deactivate' : 'Activate'}
                    </button>

                    <button
                      onClick={() => handleDeleteOffer(offer._id)}
                      className="text-xs font-bold text-red-600 hover:underline cursor-pointer flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add Offer Modal */}
          {showAddOffer && (
            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl animate-reveal">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-lg text-on-surface">Add Partner Offer</h3>
                  <button onClick={() => setShowAddOffer(false)} className="text-on-surface-variant hover:text-on-surface cursor-pointer">
                    <span className="material-symbols-outlined">close</span>
                  </button>
                </div>

                <form onSubmit={handleAddOffer} className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Brand Name *</label>
                    <input
                      type="text"
                      required
                      value={newOffer.brandName}
                      onChange={(e) => setNewOffer({ ...newOffer, brandName: e.target.value })}
                      placeholder="e.g. Starbucks, Zomato"
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Offer Title *</label>
                    <input
                      type="text"
                      required
                      value={newOffer.title}
                      onChange={(e) => setNewOffer({ ...newOffer, title: e.target.value })}
                      placeholder="e.g. 20% OFF on Minimum Spend ₹500"
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Description</label>
                    <textarea
                      rows="2"
                      value={newOffer.description}
                      onChange={(e) => setNewOffer({ ...newOffer, description: e.target.value })}
                      placeholder="Detailed offer terms & conditions..."
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant mb-1">Coupon Code</label>
                      <input
                        type="text"
                        value={newOffer.couponCode}
                        onChange={(e) => setNewOffer({ ...newOffer, couponCode: e.target.value })}
                        placeholder="e.g. ZEEBAC20"
                        className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-on-surface-variant mb-1">Points Required</label>
                      <input
                        type="text"
                        value={newOffer.pointsRequired}
                        onChange={(e) => setNewOffer({ ...newOffer, pointsRequired: e.target.value })}
                        placeholder="e.g. 100"
                        className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-on-surface-variant mb-1">Claim URL</label>
                    <input
                      type="url"
                      value={newOffer.claimUrl}
                      onChange={(e) => setNewOffer({ ...newOffer, claimUrl: e.target.value })}
                      placeholder="https://brand.com/redeem"
                      className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-sm focus:outline-none focus:border-primary"
                    />
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setShowAddOffer(false)}
                      className="flex-1 py-2.5 border border-outline-variant/30 text-on-surface-variant font-bold rounded-xl hover:bg-surface-container-low transition-colors text-sm cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2.5 bg-primary text-white font-bold rounded-xl hover:bg-primary/90 transition-colors text-sm cursor-pointer shadow"
                    >
                      Save Offer
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

