import { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';

export default function CashbackRulesPage() {


  const [shopRules, setShopRules] = useState([]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editFormData, setEditFormData] = useState({ shopType: 'Independent Store', minCashback: 0 });
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const fetchRules = async () => {
    try {
      const res = await AdminAPI.getCashbackRules();
      if (res.success) setShopRules(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRules();
  }, []);

  const handleEditClick = (rule) => {
    setEditingRuleId(rule._id);
    setEditFormData({ shopType: rule.shopType, minCashback: rule.minCashback });
    setIsAddingNew(false);
  };

  const handleSaveEdit = async () => {
    try {
      await AdminAPI.updateCashbackRule(editingRuleId, editFormData);
      await fetchRules();
      setEditingRuleId(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setIsAddingNew(false);
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    try {
      await AdminAPI.deleteCashbackRule(id);
      await fetchRules();
    } catch (err) {
      console.error(err);
    }
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setEditingRuleId(null);
    setEditFormData({ shopType: 'Independent Store', minCashback: 0 });
  };

  const handleSaveNew = async () => {
    try {
      await AdminAPI.createCashbackRule(editFormData);
      await fetchRules();
      setIsAddingNew(false);
    } catch (err) {
      console.error(err);
      alert('Failed to add rule. Check shopType and minCashback values.');
    }
  };

  return (
    <div className="space-y-6 animate-reveal text-left">
      <div>
        <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Cashback Rules Engine</h1>
        <p className="text-body-md text-on-surface-variant">Configure platform-wide reward limits and operational policies</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Main Configuration Settings */}
        <div className="lg:col-span-2 space-y-6">
          

          <div className="bg-white p-6 rounded-2xl border border-outline-variant/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-title-lg font-bold text-on-surface">Minimum Cashback Rules</h3>
              <button 
                onClick={handleAddNew}
                className="px-4 py-2 bg-primary/10 text-primary rounded-xl font-bold hover:bg-primary/20 transition-colors text-sm"
              >
                + Add Rule
              </button>
            </div>
            
            <div className="space-y-4">
              {shopRules.map((rule) => (
                <div key={rule._id} className="p-4 rounded-xl border border-outline-variant/10 bg-white">
                  {editingRuleId === rule._id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant mb-1">Shop Type</label>
                          <select 
                            value={editFormData.shopType}
                            onChange={(e) => setEditFormData({...editFormData, shopType: e.target.value})}
                            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                          >
                            <option value="Independent Store">Independent Store</option>
                            <option value="Chain & Brand">Chain & Brand</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant mb-1">Min Cashback (%)</label>
                          <input 
                            type="number"
                            value={editFormData.minCashback}
                            onChange={(e) => setEditFormData({...editFormData, minCashback: e.target.value === '' ? '' : Number(e.target.value)})}
                            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                            min="0"
                            max="100"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2">
                        <button onClick={handleCancelEdit} className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors cursor-pointer">Cancel</button>
                        <button onClick={handleSaveEdit} className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-sm cursor-pointer">Save</button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-on-surface">{rule.shopType}</h4>
                        <p className="text-sm text-on-surface-variant">Minimum {rule.minCashback}% cashback required</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button 
                          onClick={() => handleEditClick(rule)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-primary hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">edit</span>
                        </button>
                        <button 
                          onClick={() => handleDelete(rule.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg text-error hover:bg-error/10 transition-colors cursor-pointer"
                        >
                          <span className="material-symbols-outlined text-[18px]">delete</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {isAddingNew && (
                <div className="p-4 rounded-xl border border-primary/30 bg-primary/5">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant mb-1">Shop Type</label>
                        <select 
                          value={editFormData.shopType}
                          onChange={(e) => setEditFormData({...editFormData, shopType: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                        >
                          <option value="Independent Store">Independent Store</option>
                          <option value="Chain & Brand">Chain & Brand</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant mb-1">Min Cashback (%)</label>
                        <input 
                          type="number"
                          value={editFormData.minCashback}
                          onChange={(e) => setEditFormData({...editFormData, minCashback: e.target.value === '' ? '' : Number(e.target.value)})}
                          className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                          min="0"
                          max="100"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={handleCancelEdit} className="px-4 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container rounded-lg transition-colors cursor-pointer">Cancel</button>
                      <button onClick={handleSaveNew} className="px-4 py-2 text-sm font-bold bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors shadow-sm cursor-pointer">Add Rule</button>
                    </div>
                  </div>
                </div>
              )}
              
              {shopRules.length === 0 && !isAddingNew && (
                <div className="text-center py-6 text-on-surface-variant text-sm">
                  No minimum cashback rules defined.
                </div>
              )}
            </div>
          </div>
        </div>
        {/* Right Sidebar Info */}
        <div className="space-y-6">
          <div className="bg-primary text-white p-6 rounded-2xl shadow-lg bg-gradient-to-br from-primary to-[#2c006b]">
            <span className="material-symbols-outlined text-[32px] mb-2 text-white/80">info</span>
            <h3 className="font-title-lg font-bold mb-2">Rule Processing Order</h3>
            <p className="text-[13px] text-white/80 leading-relaxed">
              When multiple rules apply to a single transaction, the engine processes them in the following order:
            </p>
            <ol className="list-decimal list-inside mt-4 space-y-2 text-[13px] font-bold text-white/90">
              <li>Local Shop override (forces 0%)</li>

              <li>Minimum Category Cashback</li>
              <li>Vendor Custom Rate</li>
              <li>First Purchase Multiplier</li>
            </ol>
          </div>
        </div>

      </div>
    </div>
  );
}
