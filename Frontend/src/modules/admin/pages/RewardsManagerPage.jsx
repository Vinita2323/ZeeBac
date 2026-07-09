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
      <div>
        <h1 className="text-3xl font-black text-on-surface">Rewards Hub</h1>
        <p className="text-on-surface-variant mt-2">Manage scratch card rules for the User App.</p>
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-sm border border-outline-variant/20 max-w-2xl">
        <h2 className="text-xl font-bold mb-6">Scratch Card Settings</h2>
        
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
                onChange={(e) => setRules({ ...rules, milestoneInterval: parseInt(e.target.value) })}
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
                  onChange={(e) => setRules({ ...rules, minScratchReward: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                  placeholder="e.g. 5"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Max Reward (₹)</label>
                <input
                  type="number"
                  value={rules.maxScratchReward || ''}
                  onChange={(e) => setRules({ ...rules, maxScratchReward: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg focus:outline-none focus:border-primary/50"
                  placeholder="e.g. 50"
                />
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-outline-variant/20">
            <button
              onClick={handleSaveRules}
              disabled={isSavingRules}
              className="px-6 py-2 bg-primary text-white font-bold rounded-lg hover:bg-primary/90 disabled:opacity-50"
            >
              {isSavingRules ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
      </div>
    </div>
  );
}

