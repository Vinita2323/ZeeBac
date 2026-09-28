import React from 'react';

// Time Ago Helper
export function timeAgo(dateStr) {
  if (!dateStr) return 'Just now';
  const diff = Math.max(0, (Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// Formats message and highlights OTP code & currency amounts
function renderFormattedMessage(message, rawCode) {
  if (!message) return null;

  const codeStr = rawCode ? (String(rawCode).toUpperCase().startsWith('Z') ? String(rawCode) : `Z${rawCode}`) : null;
  const parts = message.split(/(Z\d{3}|\b\d{3}\b|₹[\d,.]+(?:\.\d+)?)/g);

  return parts.map((part, idx) => {
    if (codeStr && (part === codeStr || part === String(rawCode) || part === codeStr.slice(1))) {
      const prefix = part.toUpperCase().startsWith('Z') ? 'Z' : '';
      const digits = part.toUpperCase().startsWith('Z') ? part.slice(1) : part;
      return (
        <span key={idx} className="font-black text-[#15803d]">
          {prefix && <span className="text-[#6b21a8]">{prefix}</span>}
          {digits}
        </span>
      );
    }
    if (part.startsWith('₹')) {
      return (
        <span key={idx} className="font-bold text-slate-900">
          {part}
        </span>
      );
    }
    return part;
  });
}

// Admin-facing notification types get a dedicated icon + accent color
// (cashback/OTP-style branches below never fire for these types)
const ADMIN_TYPE_STYLES = {
  FRAUD_ALERT: { icon: 'gavel', color: '#dc2626' },
  HIGH_VALUE_REQUEST: { icon: 'priority_high', color: '#dc2626' },
  SUPPORT_TICKET: { icon: 'support_agent', color: '#2563eb' },
  VENDOR_KYC: { icon: 'storefront', color: '#059669' },
  PAYOUT_REQUEST: { icon: 'payments', color: '#d97706' },
};

export default function NotificationItemCard({ notif, onMarkAsRead, onCardClick }) {
  if (!notif) return null;

  // Extract amount
  const amountMatch = notif.title?.match(/₹([0-9,.]+)/) || notif.message?.match(/₹([0-9,.]+)/);
  const extractedAmount = notif.data?.amount || (amountMatch ? amountMatch[1] : null);

  // Extract cashback amount
  const cashbackMatch =
    notif.title?.match(/Cashback.*?₹([0-9,.]+)/i) ||
    notif.message?.match(/₹([0-9,.]+)\s*cashback/i) ||
    notif.message?.match(/Cashback:\s*₹([0-9,.]+)/i);
  const extractedCashback = notif.data?.cashbackAmount || (cashbackMatch ? cashbackMatch[1] : null);

  // Extract OTP code
  const codeMatch =
    notif.title?.match(/OTP:\s*([A-Za-z0-9]+)/i) ||
    notif.message?.match(/code:\s*([A-Za-z0-9]+)/i) ||
    notif.message?.match(/OTP\s*(?:code)?\s*([A-Za-z0-9]+)/i);
  const rawCode = notif.data?.verificationCode || (codeMatch ? codeMatch[1] : null);

  const { prefix, code } = (() => {
    if (!rawCode) return { prefix: 'Z', code: '157' };
    const clean = String(rawCode).trim();
    if (clean.toUpperCase().startsWith('Z')) {
      return { prefix: 'Z', code: clean.slice(1) };
    }
    return { prefix: 'Z', code: clean };
  })();

  // Identify notification classification
  const isCashOtpNotif = Boolean(
    notif.title?.includes('OTP') ||
    notif.message?.includes('OTP') ||
    notif.message?.includes('Code:') ||
    notif.data?.isCashMode === 'true' ||
    rawCode
  );

  const isSuccessNotif = Boolean(
    notif.title?.includes('Successful') ||
    notif.title?.includes('Approved') ||
    notif.title?.includes('Credited') ||
    notif.data?.status === 'Approved' ||
    (notif.type === 'credit' && !notif.title?.includes('OTP'))
  );

  // 1. CARD 1: CASHBACK SUCCESSFUL NOTIFICATION
  if (isSuccessNotif) {
    const displayAmount = extractedCashback || extractedAmount || '50';
    return (
      <div
        onClick={() => !notif.isRead && onMarkAsRead?.(notif._id)}
        className="bg-white rounded-2xl border-[1.5px] border-[#ef4444] p-3.5 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all text-left relative overflow-hidden"
      >
        <div className="flex items-start gap-3 sm:gap-3.5">
          {/* Left Red Badge Icon */}
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#ef4444] text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
            <div className="border-[1.5px] border-white/90 rounded px-1 py-0.5 flex items-center justify-center bg-white/10">
              <span className="text-[10px] font-black tracking-tighter leading-none text-white font-mono">123</span>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Title + Time */}
            <div className="flex items-start justify-between gap-1.5">
              <h4 className="font-extrabold text-[14px] sm:text-[15px] text-slate-900 tracking-tight leading-snug">
                {notif.title?.startsWith('✅') ? notif.title.replace(/:?\s*₹.*$/, ':') : `✅ ${notif.title || 'Cashback Successful:'}`}
              </h4>
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5 text-[11px] text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                <span>{timeAgo(notif.createdAt)}</span>
              </div>
            </div>

            {/* Big Blue Amount */}
            <div className="text-[26px] sm:text-[28px] font-black text-[#0045B4] font-display tracking-tight leading-none mt-1 mb-2">
              ₹{displayAmount}
            </div>

            {/* Badges Row */}
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              <span className="bg-[#DC2626] text-white text-[9.5px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                CASH OTP
              </span>
              <span className="bg-[#059669] text-white text-[9.5px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                SUCCESS
              </span>
            </div>

            {/* Message Text */}
            <p className="text-[13px] text-slate-800 font-medium leading-snug">
              {renderFormattedMessage(notif.message, rawCode)}
            </p>

            {/* Bottom Mint Green Banner */}
            <div className="bg-[#ecfdf5] border border-[#a7f3d0] rounded-xl px-3 py-2 flex items-center justify-between mt-3">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[19px] text-[#059669]">verified</span>
                <span className="text-[12px] sm:text-[12.5px] font-bold text-[#065f46]">
                  Cashback Processed Successfully
                </span>
              </div>
              <span className="bg-white border border-[#a7f3d0] px-2.5 py-0.5 rounded-lg text-[#047857] font-black text-[13px] shadow-2xs font-display">
                ₹{displayAmount}
              </span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 2. CARD 2: CASH OTP / CUSTOMER OTP CODE (ACTIVE CLAIM)
  if (isCashOtpNotif) {
    const billTotal = extractedAmount || '1000';
    return (
      <div
        onClick={() => !notif.isRead && onMarkAsRead?.(notif._id)}
        className="bg-white rounded-2xl border-[1.5px] border-[#ef4444] p-3.5 sm:p-4 shadow-[0_2px_12px_rgba(0,0,0,0.03)] transition-all text-left relative overflow-hidden"
      >
        <div className="flex items-start gap-3 sm:gap-3.5">
          {/* Left Red Badge Icon */}
          <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-full bg-[#ef4444] text-white flex items-center justify-center flex-shrink-0 shadow-sm mt-0.5">
            <div className="border-[1.5px] border-white/90 rounded px-1 py-0.5 flex items-center justify-center bg-white/10">
              <span className="text-[10px] font-black tracking-tighter leading-none text-white font-mono">123</span>
            </div>
          </div>

          {/* Right Content */}
          <div className="flex-1 min-w-0">
            {/* Top row: Title + Time */}
            <div className="flex items-start justify-between gap-1.5">
              <h4 className="font-extrabold text-[13.5px] sm:text-[14.5px] text-slate-900 tracking-tight leading-snug">
                🔑 Amount: ₹{billTotal} | OTP:{' '}
                <span className="font-black">
                  <span className="text-[#6b21a8]">{prefix}</span>
                  <span className="text-[#15803d]">{code}</span>
                </span>
              </h4>
              <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5 text-[11px] text-slate-500 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#ef4444]" />
                <span>{timeAgo(notif.createdAt)}</span>
              </div>
            </div>

            {/* Big Blue Amount */}
            <div className="text-[26px] sm:text-[28px] font-black text-[#0045B4] font-display tracking-tight leading-none mt-1 mb-2">
              ₹{billTotal}
            </div>

            {/* Badges Row */}
            <div className="flex items-center gap-1.5 mb-2">
              <span className="bg-[#DC2626] text-white text-[9.5px] font-black px-2 py-0.5 rounded uppercase tracking-wider shadow-2xs">
                CASH OTP
              </span>
            </div>

            {/* Message Text */}
            <p className="text-[13px] text-slate-800 font-medium leading-snug">
              {renderFormattedMessage(notif.message, rawCode)}
            </p>

            {/* Bottom Special OTP Box */}
            <div className="border-2 border-[#f87171] bg-[#fef2f2]/60 rounded-2xl p-2.5 sm:p-3 mt-3 relative">
              <div className="inline-block bg-[#dc2626] text-white text-[9px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider mb-2 shadow-2xs">
                CUSTOMER OTP CODE
              </div>
              <div className="flex items-center gap-2">
                {/* Amount Pill */}
                <div className="bg-white border border-[#fecaca] rounded-xl py-1.5 px-3 text-center flex-1 shadow-2xs">
                  <div className="text-[11.5px] font-black text-slate-800 leading-tight">Amount:</div>
                  <div className="text-[20px] sm:text-[22px] font-black text-[#0045B4] tracking-tight font-display mt-0.5">
                    ₹{billTotal}
                  </div>
                </div>

                {/* OTP Code Pill */}
                <div className="bg-white border border-[#fecaca] rounded-xl py-1.5 px-3 text-center flex-1 shadow-2xs">
                  <div className="text-[10.5px] font-bold text-slate-700 leading-tight">Tell Customer OTP:</div>
                  <div className="text-[20px] sm:text-[22px] font-black tracking-wider font-mono mt-0.5">
                    <span className="text-[#6b21a8]">{prefix}</span>
                    <span className="text-[#15803d]">{code}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 3. CARD 3: SUBSCRIPTION ACTIVE / SYSTEM / ADMIN ALERT / REGULAR NOTIFICATION
  const adminStyle = ADMIN_TYPE_STYLES[notif.type];
  const accentColor = adminStyle?.color || '#7c3aed';
  const iconName = notif.icon || adminStyle?.icon || 'info';
  const isAdminType = Boolean(adminStyle);

  return (
    <div
      onClick={() => {
        if (!notif.isRead) onMarkAsRead?.(notif._id);
        onCardClick?.(notif);
      }}
      className="bg-white rounded-2xl border border-slate-100 shadow-[0_2px_10px_rgba(0,0,0,0.03)] p-3.5 sm:p-4 transition-all text-left relative"
      style={{ borderLeft: `4px solid ${accentColor}` }}
    >
      <div className="flex items-start gap-3 sm:gap-3.5">
        {/* Left Icon Circle (tinted with accent color) */}
        <div
          className="w-11 h-11 sm:w-12 sm:h-12 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs mt-0.5"
          style={{ backgroundColor: `${accentColor}1A`, color: accentColor }}
        >
          <span className="material-symbols-outlined text-[22px] sm:text-[24px]">
            {iconName}
          </span>
        </div>

        {/* Right Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-1.5">
            <h4 className="font-extrabold text-[14px] sm:text-[15px] text-slate-900 tracking-tight leading-snug">
              {isAdminType || notif.title?.startsWith('🎉') || notif.title?.startsWith('📝') || notif.title?.startsWith('⚡')
                ? notif.title
                : `${notif.type === 'system' ? '🎉' : '🔔'} ${notif.title}`}
            </h4>
            <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5 text-[11px] text-slate-500 font-medium">
              {!notif.isRead && <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accentColor }} />}
              <span>{timeAgo(notif.createdAt)}</span>
            </div>
          </div>

          <p className="text-[13px] text-slate-600 font-normal leading-relaxed mt-1">
            {renderFormattedMessage(notif.message)}
          </p>
        </div>
      </div>
    </div>
  );
}
