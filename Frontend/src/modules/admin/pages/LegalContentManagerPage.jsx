import React, { useState, useEffect } from 'react';
import { AdminAPI } from '../../../services/api';
import { toast } from 'react-hot-toast';

const DEFAULT_PRIVACY = `## 1. Information We Collect
We collect information that you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, and postal address.

## 2. How We Use Information
We may use the information we collect about you to provide, maintain, and improve our services, including to facilitate payments, send receipts, provide products and services you request, and develop new features.

## 3. Sharing of Information
We may share the information we collect about you with vendors to provide you with the services you request. We will not sell your personal information to third parties without your explicit consent.

## 4. Security Data
We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.`;

const DEFAULT_TERMS = `## 1. Acceptance of Terms
By accessing or using the Zeebac platform, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, then you may not access the platform or use any services.

## 2. User Responsibilities
You are responsible for maintaining the security of your account and password. Zeebac cannot and will not be liable for any loss or damage from your failure to comply with this security obligation.

## 3. Cashback & Rewards
Cashback offers and rewards are subject to change without notice. Zeebac reserves the right to modify, suspend, or terminate the cashback program at any time at our sole discretion.

## 4. Vendor Agreements
Vendors must provide accurate business information and honor all promotional offers listed on the Zeebac platform. Failure to do so may result in account suspension or termination.`;

export default function LegalContentManagerPage() {
  const [activeTab, setActiveTab] = useState('privacy'); // 'privacy' | 'terms'
  const [viewMode, setViewMode] = useState('edit'); // 'edit' | 'split' | 'preview'
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [privacyPolicy, setPrivacyPolicy] = useState({
    title: 'Privacy Policy',
    content: '',
    lastUpdated: null,
  });

  const [termsOfService, setTermsOfService] = useState({
    title: 'Terms of Service',
    content: '',
    lastUpdated: null,
  });

  useEffect(() => {
    fetchContent();
  }, []);

  const fetchContent = async () => {
    try {
      setLoading(true);
      const res = await AdminAPI.getLegalContent();
      if (res?.success && res.data) {
        if (res.data.privacyPolicy) {
          setPrivacyPolicy({
            title: res.data.privacyPolicy.title || 'Privacy Policy',
            content: res.data.privacyPolicy.content || DEFAULT_PRIVACY,
            lastUpdated: res.data.privacyPolicy.lastUpdated || null,
          });
        }
        if (res.data.termsOfService) {
          setTermsOfService({
            title: res.data.termsOfService.title || 'Terms of Service',
            content: res.data.termsOfService.content || DEFAULT_TERMS,
            lastUpdated: res.data.termsOfService.lastUpdated || null,
          });
        }
      }
    } catch (err) {
      console.error('Failed to fetch legal content:', err);
      toast.error('Failed to load legal content from server');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const payload = {
        privacyPolicy: {
          title: privacyPolicy.title,
          content: privacyPolicy.content,
        },
        termsOfService: {
          title: termsOfService.title,
          content: termsOfService.content,
        },
      };
      const res = await AdminAPI.updateLegalContent(payload);
      if (res?.success) {
        toast.success('Legal content updated & published live!');
        if (res.data?.privacyPolicy?.lastUpdated) {
          setPrivacyPolicy((prev) => ({ ...prev, lastUpdated: res.data.privacyPolicy.lastUpdated }));
        }
        if (res.data?.termsOfService?.lastUpdated) {
          setTermsOfService((prev) => ({ ...prev, lastUpdated: res.data.termsOfService.lastUpdated }));
        }
      } else {
        toast.error(res?.message || 'Failed to save changes');
      }
    } catch (err) {
      console.error(err);
      toast.error('Error saving legal content');
    } finally {
      setSaving(false);
    }
  };

  const handleResetToDefault = () => {
    if (!window.confirm(`Are you sure you want to reset the ${activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Service'} to default?`)) {
      return;
    }
    if (activeTab === 'privacy') {
      setPrivacyPolicy((prev) => ({ ...prev, content: DEFAULT_PRIVACY, title: 'Privacy Policy' }));
    } else {
      setTermsOfService((prev) => ({ ...prev, content: DEFAULT_TERMS, title: 'Terms of Service' }));
    }
    toast.success('Restored default template. Click "Save Changes" to publish.');
  };

  const currentDoc = activeTab === 'privacy' ? privacyPolicy : termsOfService;
  const updateCurrentDoc = (updates) => {
    if (activeTab === 'privacy') {
      setPrivacyPolicy((prev) => ({ ...prev, ...updates }));
    } else {
      setTermsOfService((prev) => ({ ...prev, ...updates }));
    }
  };

  const renderSimpleMarkdownPreview = (text) => {
    if (!text) return <p className="text-gray-400 italic">No content written yet.</p>;

    const lines = text.split('\n');
    return (
      <div className="space-y-4 text-on-surface leading-relaxed text-sm">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('## ')) {
            return (
              <h2 key={idx} className="font-display font-bold text-base text-primary pt-2">
                {trimmed.replace(/^##\s+/, '')}
              </h2>
            );
          }
          if (trimmed.startsWith('# ')) {
            return (
              <h1 key={idx} className="font-display font-black text-lg text-on-surface pt-2">
                {trimmed.replace(/^#\s+/, '')}
              </h1>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <li key={idx} className="ml-4 list-disc text-on-surface-variant">
                {trimmed.replace(/^[-*]\s+/, '')}
              </li>
            );
          }
          if (trimmed === '') {
            return <div key={idx} className="h-1" />;
          }
          return (
            <p key={idx} className="text-on-surface-variant">
              {line}
            </p>
          );
        })}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin" />
          <p className="text-sm font-bold text-on-surface-variant">Loading legal policies...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto space-y-6 animate-reveal">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-outline-variant/15 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[28px] text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>
              gavel
            </span>
            <h1 className="font-display text-[24px] font-black tracking-tight text-on-surface">Legal &amp; Policy CMS</h1>
          </div>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Edit Privacy Policy and Terms of Service displayed across customer &amp; vendor apps in real-time.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3.5 py-2 rounded-xl text-xs font-bold border border-outline-variant/30 text-on-surface-variant hover:bg-surface-container-low transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">restart_alt</span>
            Reset to Default
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-white shadow-sm transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <span className="material-symbols-outlined text-[16px]">save</span>
                Save &amp; Publish Live
              </>
            )}
          </button>
        </div>
      </div>

      {/* Tabs & View Mode Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2 rounded-2xl border border-outline-variant/20 shadow-xs">
        {/* Document Selector Tabs */}
        <div className="flex items-center gap-1 bg-surface-container-low p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('privacy')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'privacy'
                ? 'bg-white text-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">security</span>
            Privacy Policy
          </button>
          <button
            onClick={() => setActiveTab('terms')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'terms'
                ? 'bg-white text-primary shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[16px]">description</span>
            Terms of Service
          </button>
        </div>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-2">
          {currentDoc.lastUpdated && (
            <span className="text-[11px] text-on-surface-variant hidden md:inline mr-2">
              Last saved: {new Date(currentDoc.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <div className="flex items-center gap-0.5 bg-surface-container-low p-1 rounded-xl">
            <button
              onClick={() => setViewMode('edit')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'edit' ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant'
              }`}
              title="Editor Only"
            >
              <span className="material-symbols-outlined text-[15px]">edit</span>
              <span className="hidden sm:inline">Editor</span>
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'split' ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant'
              }`}
              title="Split View"
            >
              <span className="material-symbols-outlined text-[15px]">vertical_split</span>
              <span className="hidden sm:inline">Split</span>
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                viewMode === 'preview' ? 'bg-white text-primary shadow-xs' : 'text-on-surface-variant'
              }`}
              title="Preview Only"
            >
              <span className="material-symbols-outlined text-[15px]">visibility</span>
              <span className="hidden sm:inline">Preview</span>
            </button>
          </div>
        </div>
      </div>

      {/* Editor & Preview Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Editor Column */}
        {(viewMode === 'edit' || viewMode === 'split') && (
          <div className={`space-y-4 ${viewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
            <div className="bg-white rounded-2xl border border-outline-variant/20 p-5 shadow-xs space-y-4">
              {/* Document Title Input */}
              <div>
                <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
                  Page Display Title
                </label>
                <input
                  type="text"
                  value={currentDoc.title}
                  onChange={(e) => updateCurrentDoc({ title: e.target.value })}
                  placeholder="e.g. Privacy Policy"
                  className="w-full px-4 py-2.5 bg-surface-container-low border border-outline-variant/30 rounded-xl text-sm font-bold text-on-surface focus:outline-none focus:border-primary/50"
                />
              </div>

              {/* Content Markdown / Plain Text Area */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                    Policy Content (Markdown supported)
                  </label>
                  <span className="text-[11px] text-on-surface-variant">
                    {currentDoc.content?.length || 0} characters · {currentDoc.content?.split(/\s+/).filter(Boolean).length || 0} words
                  </span>
                </div>
                <textarea
                  rows={20}
                  value={currentDoc.content}
                  onChange={(e) => updateCurrentDoc({ content: e.target.value })}
                  placeholder="Enter policy sections here. Use '## Section Name' for section headings..."
                  className="w-full px-4 py-3 bg-surface-container-low border border-outline-variant/30 rounded-xl text-xs sm:text-sm font-mono text-on-surface leading-relaxed focus:outline-none focus:border-primary/50 resize-y"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Tip: Use <code className="bg-gray-100 px-1 py-0.5 rounded text-gray-700">## 1. Heading</code> for major sections and standard paragraphs for descriptions.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Live Preview Column */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`space-y-4 ${viewMode === 'split' ? 'lg:col-span-6' : 'lg:col-span-12'}`}>
            <div className="bg-white rounded-2xl border border-outline-variant/20 p-5 sm:p-7 shadow-xs">
              <div className="flex items-center justify-between border-b border-outline-variant/15 pb-3 mb-5">
                <span className="text-xs font-bold text-primary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">devices</span>
                  Live User Preview ({activeTab === 'privacy' ? '/privacy' : '/terms'})
                </span>
                <span className="text-[10.5px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                  Responsive
                </span>
              </div>

              {/* Mock App View Container */}
              <div className="bg-[#f8f9fc] rounded-2xl border border-outline-variant/15 p-5 sm:p-8 max-h-[600px] overflow-y-auto">
                <div className="max-w-[540px] mx-auto space-y-6">
                  <div className="text-left border-b border-outline-variant/15 pb-4">
                    <h1 className="font-display font-black text-[22px] text-on-surface">{currentDoc.title}</h1>
                    <p className="text-xs text-on-surface-variant mt-0.5">Zeebac Platform Policy Agreement</p>
                  </div>

                  {renderSimpleMarkdownPreview(currentDoc.content)}

                  <div className="pt-6 border-t border-outline-variant/15 text-center text-[11px] text-on-surface-variant">
                    <p>Last updated: {currentDoc.lastUpdated ? new Date(currentDoc.lastUpdated).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : 'Recently'}</p>
                    <p className="font-semibold mt-0.5">Zeebac Technologies Inc.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
