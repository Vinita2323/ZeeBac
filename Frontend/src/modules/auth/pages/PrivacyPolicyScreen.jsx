import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthAPI } from '../../../services/api';
import { safeNavigateBack } from '../../../utils/navigationUtils';

const DEFAULT_PRIVACY = `## 1. Information We Collect
We collect information that you provide directly to us, such as when you create or modify your account, request on-demand services, contact customer support, or otherwise communicate with us. This information may include: name, email, phone number, and postal address.

## 2. How We Use Information
We may use the information we collect about you to provide, maintain, and improve our services, including to facilitate payments, send receipts, provide products and services you request, and develop new features.

## 3. Sharing of Information
We may share the information we collect about you with vendors to provide you with the services you request. We will not sell your personal information to third parties without your explicit consent.

## 4. Security Data
We take reasonable measures to help protect information about you from loss, theft, misuse and unauthorized access, disclosure, alteration and destruction.`;

export default function PrivacyPolicyScreen() {
  const navigate = useNavigate();
  const [content, setContent] = useState(DEFAULT_PRIVACY);
  const [title, setTitle] = useState('Privacy Policy');
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadContent = async () => {
      try {
        const res = await AuthAPI.getLegalContent();
        if (isMounted && res?.success && res.data?.privacyPolicy) {
          const pp = res.data.privacyPolicy;
          if (pp.content) setContent(pp.content);
          if (pp.title) setTitle(pp.title);
          if (pp.lastUpdated) setLastUpdated(pp.lastUpdated);
        }
      } catch (err) {
        console.warn('Using offline privacy policy fallback:', err);
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
