import { useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useAuthStore from '../../../store/useAuthStore';
import useLanguageStore from '../../../store/useLanguageStore';
import { VendorAPI } from '../../../services/api';
import useQrCode from '../../../hooks/useQrCode';
import { downloadImage, shareContent } from '../../../utils/exportUtils';

export default function VendorQRModal({ isOpen, onClose }) {
  const { t } = useLanguageStore();
  const currentUser = useAuthStore((state) => state.currentUser) || {};
  const zeebacId = currentUser.zeebacId || 'ZBV-0000';

  const fetchQrToken = useCallback(async () => {
    try {
      const res = await VendorAPI.getQrToken();
      if (res && res.data) return res;
      throw new Error('No QR token received');
    } catch (err) {
      console.warn('Vendor QR token API failed, using store fallback:', err);
      const payeeVpa = currentUser?.bankDetails?.upiId || `${currentUser?.phone || 'vendor'}@upi`;
      const upiUri = `upi://pay?pa=${encodeURIComponent(payeeVpa)}&pn=${encodeURIComponent(currentUser?.storeName || 'ZeeBac Store')}&tr=${zeebacId}&tn=Zeebac%20Cashback&cu=INR`;
      return {
        data: {
          token: `zeebac://vendor/${zeebacId}`,
          upiUri,
          expiresIn: 3600,
        },
      };
    }
  }, [currentUser?.bankDetails?.upiId, currentUser?.phone, currentUser?.storeName, zeebacId]);

  const { qrImageUrl, isLoading: qrLoading, refresh: refreshQr } = useQrCode(fetchQrToken, true);

  useEffect(() => {
    if (isOpen && !qrImageUrl && !qrLoading) {
      refreshQr();
    }
  }, [isOpen, qrImageUrl, qrLoading, refreshQr]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-3 sm:p-6 bg-black/60 backdrop-blur-sm animate-reveal m-0">
      <div className="bg-white w-full max-w-[340px] rounded-3xl p-4 sm:p-6 shadow-2xl relative mx-auto text-left">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 transition-colors text-slate-600 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[20px]">close</span>
        </button>

        <div className="flex flex-col items-center pt-1 text-center">
          <div className="w-11 h-11 rounded-2xl bg-purple-50 text-purple-700 flex items-center justify-center mb-3 border border-purple-100">
            <span className="material-symbols-outlined text-[24px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              qr_code_2
            </span>
          </div>
          <h3 className="font-display font-bold text-[18px] text-slate-900 leading-tight">
            {t('Counter QR Standee')}
          </h3>
          <p className="text-[12px] text-slate-500 mt-1 mb-2.5 px-2">
            {t('Scan & Pay via PhonePe, Paytm, GPay or ZeeBac')}
          </p>

          <div className="flex items-center gap-1.5 justify-center mb-4 flex-wrap">
            <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">UPI</span>
            <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">PhonePe</span>
            <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">Paytm</span>
            <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">GPay</span>
            <span className="text-[9.5px] font-medium px-2 py-0.5 rounded-md bg-purple-50 text-purple-700 font-semibold border border-purple-100">
              ZeeBac
            </span>
          </div>

          <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-4 w-56 h-56 flex flex-col items-center justify-center shadow-inner mb-3 relative overflow-hidden">
            {qrImageUrl ? (
              <img src={qrImageUrl} alt="Store QR" className="w-full h-full object-contain" />
            ) : qrLoading ? (
              <div className="flex flex-col items-center gap-2">
                <div className="w-7 h-7 border-2 border-purple-300 border-t-purple-800 rounded-full animate-spin" />
                <span className="text-[11px] font-medium text-slate-500">{t('Generating QR...')}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center p-2">
                <span className="material-symbols-outlined text-rose-500 text-[24px]">error</span>
                <span className="text-[11px] text-rose-600 font-medium">{t('Failed to load QR')}</span>
                <button
                  type="button"
                  onClick={refreshQr}
                  className="px-3 py-1 bg-slate-900 text-white text-[11px] font-medium rounded-lg hover:bg-slate-800 transition-all cursor-pointer"
                >
                  {t('Retry')}
                </button>
              </div>
            )}
          </div>

          <div className="bg-slate-100 py-1 px-3 rounded-full flex items-center gap-2 mb-4">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{t('Store ID:')}</span>
            <span className="text-[11.5px] font-mono font-bold text-slate-900">{zeebacId}</span>
          </div>

          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={() => qrImageUrl && downloadImage(qrImageUrl, `Zeebac_Counter_QR_${zeebacId}.png`)}
              disabled={!qrImageUrl}
              className="flex-1 py-2.5 px-3 bg-gradient-to-r from-[#16082f] to-[#6000da] hover:opacity-95 text-white rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[15px]">download</span>
              <span>{t('Download')}</span>
            </button>
            <button
              type="button"
              onClick={() =>
                qrImageUrl &&
                shareContent(
                  qrImageUrl,
                  `${currentUser?.storeName || 'ZeeBac Store'} QR`,
                  `Pay at ${currentUser?.storeName || 'my store'} (${zeebacId}) to earn instant cashback!`
                )
              }
              disabled={!qrImageUrl}
              className="flex-1 py-2.5 px-3 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-xl font-bold text-[12px] flex items-center justify-center gap-1.5 shadow-xs active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="material-symbols-outlined text-[15px]">share</span>
              <span>{t('Share')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
