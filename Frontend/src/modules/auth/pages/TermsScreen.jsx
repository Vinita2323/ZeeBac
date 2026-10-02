import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../../../services/api';
import { safeNavigateBack } from '../../../utils/navigationUtils';

const DEFAULT_TERMS = `## 1. Acceptance of Terms
By accessing or using the Zeebac platform, you agree to be bound by these Terms of Service. If you do not agree to all the terms and conditions, then you may not access the platform or use any services.

## 2. User Responsibilities
You are responsible for maintaining the security of your account and password. Zeebac cannot and will not be liable for any loss or damage from your failure to comply with this security obligation.

## 3. Cashback & Rewards
Cashback offers and rewards are subject to change without notice. Zeebac reserves the right to modify, suspend, or terminate the cashback program at any time at our sole discretion.

## 4. Vendor Agreements
Vendors must provide accurate business information and honor all promotional offers listed on the Zeebac platform. Failure to do so may result in account suspension or termination.`;

export default function TermsScreen() {
  const navigate = useNavigate();
  const [content, setContent] = useState(DEFAULT_TERMS);
  const [title, setTitle] = useState('Terms of Service');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadContent = async () => {
      try {
        const res = await AuthAPI.getLegalContent();
        if (isMounted && res?.success && res.data?.termsOfService) {
          const tos = res.data.termsOfService;
          if (tos.content) setContent(tos.content);
          if (tos.title) setTitle(tos.title);
          if (tos.lastUpdated) setLastUpdated(tos.lastUpdated);
        }
      } catch (err) {
        console.warn('Using offline terms of service fallback:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadContent();
    return () => {
      isMounted = false;
    };
  }, []);

  const renderSections = (text) => {
    if (!text) return null;
    const lines = text.split('\n');
    return (
      <div className="space-y-6">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith('## ') || trimmed.startsWith('# ')) {
            const headingText = trimmed.replace(/^#+\s+/, '');
            return (
              <h2 key={idx} className="font-display font-bold text-[18px] text-primary pt-3 first:pt-0">
                {headingText}
              </h2>
            );
          }
          if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
            return (
              <li key={idx} className="ml-5 list-disc text-body-md text-on-surface-variant leading-relaxed">
                {trimmed.replace(/^[-*]\s+/, '')}
              </li>
            );
          }
          if (trimmed === '') {
            return <div key={idx} className="h-1" />;
          }
          return (
            <p key={idx} className="text-body-md text-on-surface-variant leading-relaxed">
              {line}
            </p>
          );
        })}
      </div>
    );
  };

  return (
    <div className="bg-[#f8f9fc] min-h-screen flex flex-col font-body-lg text-on-surface">
      <header className="sticky top-0 z-30 bg-white/80 backdrop-blur-md px-4 py-3 flex items-center gap-3 border-b border-outline-variant/10 shadow-sm">
        <button 
          onClick={() => safeNavigateBack(navigate, '/login')}
          className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-surface-container-low transition-colors cursor-pointer"
          title="Go Back"
        >
          <span className="material-symbols-outlined text-[24px]">arrow_back</span>
        </button>
        <h1 className="font-display font-black text-[20px]">{title}</h1>
      </header>

      <main className="flex-1 max-w-[600px] mx-auto w-full px-5 py-8 space-y-6">
        {isLoading ? (
          <div className="space-y-4 animate-pulse pt-4">
            <div className="h-5 bg-gray-200 rounded w-1/3" />
            <div className="h-20 bg-gray-100 rounded w-full" />
            <div className="h-5 bg-gray-200 rounded w-2/5" />
            <div className="h-24 bg-gray-100 rounded w-full" />
          </div>
        ) : (
          renderSections(content)
        )}

        <div className="pt-8 pb-12 text-center text-on-surface-variant text-[12px] border-t border-outline-variant/10">
          <p>
            Last updated:{' '}
            {lastUpdated
              ? new Date(lastUpdated).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
              : 'June 2026'}
          </p>
          <p className="font-semibold mt-0.5">Zeebac Technologies Inc.</p>
        </div>
      </main>
    </div>
  );
}
