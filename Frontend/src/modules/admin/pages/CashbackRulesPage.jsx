import { useState } from 'react';

export default function CashbackRulesPage() {


  const [shopRules, setShopRules] = useState([
    { id: 1, shopType: 'Local Shops', minCashback: 5 },
    { id: 2, shopType: 'Big Shops and Brands', minCashback: 2 }
  ]);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [editFormData, setEditFormData] = useState({ shopType: '', minCashback: 0 });
  const [isAddingNew, setIsAddingNew] = useState(false);

  const handleEditClick = (rule) => {
    setEditingRuleId(rule.id);
    setEditFormData({ shopType: rule.shopType, minCashback: rule.minCashback });
    setIsAddingNew(false);
  };

  const handleSaveEdit = () => {
    setShopRules(shopRules.map(rule => 
      rule.id === editingRuleId ? { ...rule, ...editFormData } : rule
    ));
    setEditingRuleId(null);
  };

  const handleCancelEdit = () => {
    setEditingRuleId(null);
    setIsAddingNew(false);
  };

  const handleDelete = (id) => {
    setShopRules(shopRules.filter(rule => rule.id !== id));
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setEditingRuleId(null);
    setEditFormData({ shopType: '', minCashback: 0 });
  };

  const handleSaveNew = () => {
    const newId = shopRules.length > 0 ? Math.max(...shopRules.map(r => r.id)) + 1 : 1;
    setShopRules([...shopRules, { id: newId, ...editFormData }]);
    setIsAddingNew(false);
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
                <div key={rule.id} className="p-4 rounded-xl border border-outline-variant/20 bg-surface-container-low/30">
                  {editingRuleId === rule.id ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant mb-1">Shop Type</label>
                          <input 
                            type="text"
                            value={editFormData.shopType}
                            onChange={(e) => setEditFormData({...editFormData, shopType: e.target.value})}
                            className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                            placeholder="e.g. Local Shops"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-on-surface-variant mb-1">Min Cashback (%)</label>
                          <input 
                            type="number"
                            value={editFormData.minCashback}
                            onChange={(e) => setEditFormData({...editFormData, minCashback: Number(e.target.value)})}
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
                        <input 
                          type="text"
                          value={editFormData.shopType}
                          onChange={(e) => setEditFormData({...editFormData, shopType: e.target.value})}
                          className="w-full px-3 py-2 rounded-lg border border-outline-variant/30 focus:border-primary focus:ring-1 focus:ring-primary outline-none"
                          placeholder="e.g. Local Shops"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-on-surface-variant mb-1">Min Cashback (%)</label>
                        <input 
                          type="number"
                          value={editFormData.minCashback}
                          onChange={(e) => setEditFormData({...editFormData, minCashback: Number(e.target.value)})}
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

          <div className="flex justify-end">
            <button className="h-12 px-8 bg-primary text-white rounded-xl font-bold hover:bg-primary/90 transition-colors shadow-md active:scale-[0.98]">
              Save Configuration
            </button>
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
