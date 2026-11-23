import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import ProductBarcodeScannerModal from '../common/ProductBarcodeScannerModal';
import { OrderAPI, getMediaUrl } from '../../services/api';
import { toast } from 'react-hot-toast';

// Audio feedback synthesizers (matching dark store scanner sounds)
const playSuccessChime = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
    osc.frequency.setValueAtTime(880, ctx.currentTime + 0.1); // A5
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
    if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
  } catch (_) {}
};

const playErrorBuzz = () => {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, ctx.currentTime);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
    if (navigator.vibrate) navigator.vibrate([150, 50, 150]);
  } catch (_) {}
};

export default function DarkStorePickerModal({ isOpen, onClose, order, onOrderUpdated }) {
  if (!isOpen || !order) return null;

  // Tote / Bag ID
  const [toteNumber, setToteNumber] = useState(
    order.toteNumber || `TOTE-${String(order.orderId || '').replace(/\D/g, '').slice(-3) || '01'}`
  );
  const [isEditingTote, setIsEditingTote] = useState(false);

  // Sorting items by physical warehouse location path (Rack -> Shelf -> Bin)
  const [items, setItems] = useState(() => {
    const list = Array.isArray(order.items) ? [...order.items] : [];
    // Sort so picker walks aisle A -> B -> C sequentially
    return list.sort((a, b) => {
      const locA = (a.binCode || a.warehouseLocation?.binCode || 'ZZZ').toUpperCase();
      const locB = (b.binCode || b.warehouseLocation?.binCode || 'ZZZ').toUpperCase();
      return locA.localeCompare(locB);
    });
  });

  const [activeItemIndex, setActiveItemIndex] = useState(() => {
    const firstUnpicked = items.findIndex((i) => !i.picked);
    return firstUnpicked >= 0 ? firstUnpicked : 0;
  });

  // Camera Barcode Scanner Modal State
  const [scannerOpen, setScannerOpen] = useState(false);
  const [manualBarcodeInput, setManualBarcodeInput] = useState('');
  const [scanErrorMsg, setScanErrorMsg] = useState('');

  // Timer SLA Countdown (Quick Commerce 120s / 2min pick SLA)
  const [secondsElapsed, setSecondsElapsed] = useState(() => {
    if (order.pickingStartedAt) {
      const diff = Math.floor((Date.now() - new Date(order.pickingStartedAt).getTime()) / 1000);
      return Math.max(0, diff);
    }
    return 0;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isFinishing, setIsFinishing] = useState(false);
  const [showCompletionCelebration, setShowCompletionCelebration] = useState(false);

  // Start picking session on mount if not already started
  useEffect(() => {
    if (order && order.packingStatus !== 'PICKING_IN_PROGRESS' && order.packingStatus !== 'PICKED' && order.packingStatus !== 'READY_FOR_PICKUP') {
      OrderAPI.startPicking(order._id || order.orderId, { toteNumber })
        .then((res) => {
          if (res.success && res.data?.order) {
            if (onOrderUpdated) onOrderUpdated(res.data.order);
          }
        })
        .catch((err) => console.warn('startPicking auto-call error:', err));
    }
  }, [order?._id]);

  // SLA Timer interval
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsElapsed((prev) => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTimer = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const currentItem = items[activeItemIndex] || items[0];
  const pickedCount = items.filter((i) => i.picked).length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((pickedCount / totalCount) * 100) : 0;
  const isOrderFullyPicked = pickedCount === totalCount && totalCount > 0;

  // Handle Barcode Detection from Camera Scanner or Manual Barcode input
  const handleBarcodeScanned = async (scannedCode) => {
    if (!currentItem) return;
    const cleanScanned = String(scannedCode || '').trim();
    const cleanExpected = String(currentItem.barcode || '').trim();

    setScanErrorMsg('');

    // If item has a registered barcode and they don't match -> alert error
    if (cleanExpected && cleanScanned.toLowerCase() !== cleanExpected.toLowerCase()) {
      playErrorBuzz();
      setScanErrorMsg(`Barcode Mismatch! Scanned "${cleanScanned}", expected "${cleanExpected}" for ${currentItem.name}.`);
      toast.error(`❌ Wrong item scanned! Check Bin ${currentItem.binCode || 'location'}.`);
      return;
    }

    // Success! Mark item as picked
    await confirmItemPicked(currentItem, cleanScanned, false);
  };

  // Confirm item pick (via scanned barcode or 1-tap manual confirm)
  const confirmItemPicked = async (itemToPick, barcodeUsed = '', isManual = false) => {
    setIsSubmitting(true);
    setScanErrorMsg('');
    try {
      const res = await OrderAPI.pickOrderItem(order._id || order.orderId, {
        itemId: itemToPick._id || itemToPick.productId,
        barcode: barcodeUsed || itemToPick.barcode,
        quantity: itemToPick.quantity,
        isManualConfirm: isManual,
      });

      if (res.success) {
        playSuccessChime();
        toast.success(`✅ Picked ${itemToPick.name} (${itemToPick.quantity} units)!`);

        // Update local item list
        const updatedList = items.map((it) =>
          it._id === itemToPick._id || it.productId === itemToPick.productId
            ? { ...it, picked: true, pickedQuantity: it.quantity, pickedAt: new Date() }
            : it
        );
        setItems(updatedList);

        if (onOrderUpdated && res.data?.order) {
          onOrderUpdated(res.data.order);
        }

        // Close camera scanner if open
        setScannerOpen(false);
        setManualBarcodeInput('');

        // Find next unpicked item index
        const nextUnpickedIndex = updatedList.findIndex((i) => !i.picked);
        if (nextUnpickedIndex >= 0) {
          setActiveItemIndex(nextUnpickedIndex);
        } else {
          // All items picked!
          setShowCompletionCelebration(true);
        }
      } else {
        playErrorBuzz();
        setScanErrorMsg(res.message || 'Failed to pick item');
        toast.error(res.message || 'Failed to pick item');
      }
    } catch (err) {
      playErrorBuzz();
      const msg = err.response?.data?.message || 'Error confirming pick';
      setScanErrorMsg(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Finish packing and stage on dispatch rack
  const handleFinishPacking = async () => {
    setIsFinishing(true);
    try {
      const res = await OrderAPI.finishPacking(order._id || order.orderId, { toteNumber });
      if (res.success) {
        playSuccessChime();
        toast.success(`🎉 Order #${order.orderId} packed in Tote ${toteNumber} and ready for pickup!`);
        if (onOrderUpdated && res.data?.order) {
          onOrderUpdated(res.data.order);
        }
        onClose();
      } else {
        toast.error(res.message || 'Failed to finish packing');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error finishing packing');
    } finally {
      setIsFinishing(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 animate-fade-in text-left">
      <div className="bg-white rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-slate-100 overflow-hidden">
        {/* ── TOP HEADER (Dark Store WMS Picker Station Bar) ── */}
        <div className="bg-gradient-to-r from-purple-900 via-indigo-950 to-purple-900 text-white p-4 shrink-0 shadow-sm">
          <div className="flex items-center justify-between pb-2 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300">
                Dark Store Picker Mode
              </span>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="flex items-center justify-between pt-3">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-display font-black text-lg text-white">Order #{order.orderId}</h3>
                <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-bold">
                  {totalCount} Items
                </span>
              </div>
              <p className="text-[11px] text-purple-200">
                Customer: <span className="font-semibold text-white">{order.customerName}</span>
              </p>
            </div>

            {/* SLA Pick Timer Countdown */}
            <div className="bg-black/40 border border-white/20 rounded-2xl px-3.5 py-1.5 text-center shrink-0">
              <div className="text-[9.5px] uppercase tracking-wider text-purple-300 font-bold">Pick Timer</div>
              <div
                className={`font-mono font-black text-lg leading-tight ${
                  secondsElapsed > 120 ? 'text-rose-400 animate-pulse' : 'text-emerald-400'
                }`}
              >
                {formatTimer(secondsElapsed)}
              </div>
            </div>
          </div>

          {/* Tote / Basket ID Pill */}
          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[16px] text-amber-300">shopping_basket</span>
              <span className="text-xs text-purple-200 font-medium">Assigned Tote / Bag:</span>
              {isEditingTote ? (
                <input
                  type="text"
                  value={toteNumber}
                  onChange={(e) => setToteNumber(e.target.value)}
                  onBlur={() => setIsEditingTote(false)}
                  autoFocus
                  className="bg-white/20 text-white font-mono font-bold text-xs px-2 py-0.5 rounded border border-white/30 focus:outline-none"
                />
              ) : (
                <span
                  onClick={() => setIsEditingTote(true)}
                  className="bg-amber-400 text-slate-950 font-mono font-black text-xs px-2 py-0.5 rounded-md cursor-pointer hover:bg-amber-300 transition-colors shadow-2xs"
                  title="Click to edit Tote ID"
                >
                  {toteNumber} ✏️
                </span>
              )}
            </div>
            <div className="text-xs font-bold text-emerald-300 font-mono">
              {pickedCount}/{totalCount} Picked ({progressPercent}%)
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden mt-2">
            <div
              className="bg-emerald-400 h-full transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* ── MAIN CONTENT AREA ── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* COMPLETION CELEBRATION VIEW */}
          {isOrderFullyPicked ? (
            <div className="bg-emerald-50 border-2 border-emerald-300 rounded-3xl p-5 text-center space-y-3 animate-scale-up">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-white flex items-center justify-center mx-auto shadow-md">
                <span className="material-symbols-outlined text-[36px]">check_circle</span>
              </div>
              <h3 className="font-display font-black text-xl text-slate-900">All Items Picked Successfully!</h3>
              <p className="text-xs text-slate-600 max-w-sm mx-auto">
                Completed pick route in <strong className="text-emerald-700 font-bold">{secondsElapsed} seconds</strong>. Place
                items into Tote <strong>{toteNumber}</strong> and stage on Dispatch Counter.
              </p>

              {/* Store Pickup OTP info for rider handover */}
              <div className="bg-white rounded-2xl p-3 border border-emerald-200 flex items-center justify-between max-w-xs mx-auto">
                <div className="text-left">
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Store Handover OTP</p>
                  <p className="font-mono font-black text-xl text-purple-900 tracking-widest">
                    {order.pickupOtp || '1234'}
                  </p>
                </div>
                <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">
                  Ready for Rider
                </span>
              </div>

              <button
                type="button"
                onClick={handleFinishPacking}
                disabled={isFinishing}
                className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-display font-black text-sm shadow-md active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
              >
                {isFinishing ? (
                  <span className="animate-spin material-symbols-outlined text-[18px]">progress_activity</span>
                ) : (
                  <span className="material-symbols-outlined text-[20px]">inventory</span>
                )}
                <span>Stage for Dispatch Handover →</span>
              </button>
            </div>
          ) : (
            <>
              {/* CURRENT ACTIVE ITEM CARD (Video Full Focus Design) */}
              {currentItem && (
                <div className="bg-slate-50 rounded-3xl p-4 border border-slate-200/90 shadow-xs space-y-3">
                  {/* Huge Prominent Bin Location Badge */}
                  <div className="bg-gradient-to-r from-purple-700 to-indigo-800 text-white rounded-2xl p-3.5 shadow-sm flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-1.5 text-purple-200 text-[10.5px] font-bold uppercase tracking-wider">
                        <span className="material-symbols-outlined text-[15px] text-amber-300">location_on</span>
                        <span>Walk To Bin Location</span>
                      </div>
                      <h2 className="font-mono font-black text-[24px] sm:text-[28px] tracking-wider leading-none text-white mt-1">
                        {currentItem.binCode || currentItem.warehouseLocation?.binCode || 'C01-S01-B01'}
                      </h2>
                      <p className="text-[11px] text-purple-200 mt-0.5">
                        Rack {currentItem.warehouseLocation?.rack || 'C01'} • Shelf{' '}
                        {currentItem.warehouseLocation?.shelf || 'S01'} • Bin{' '}
                        {currentItem.warehouseLocation?.bin || 'B01'}
                      </p>
                    </div>

                    <div className="bg-white/20 backdrop-blur-md rounded-2xl px-3 py-2 text-center shrink-0 border border-white/20">
                      <p className="text-[9.5px] uppercase tracking-wider text-purple-200 font-bold">Pick Quantity</p>
                      <h3 className="font-display font-black text-[22px] leading-tight text-white">
                        × {currentItem.quantity}
                      </h3>
                    </div>
                  </div>

                  {/* Product Details Card */}
                  <div className="bg-white rounded-2xl p-3.5 border border-slate-100 flex items-start gap-3">
                    <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center p-1.5 shrink-0 overflow-hidden">
                      {currentItem.image ? (
                        <img
                          src={getMediaUrl(currentItem.image)}
                          alt={currentItem.name}
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="material-symbols-outlined text-purple-700 text-[28px]">inventory_2</span>
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold uppercase text-purple-700 bg-purple-50 px-2 py-0.5 rounded-full border border-purple-200">
                          {currentItem.category || 'Product'}
                        </span>
                        {currentItem.picked && (
                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[12px]">check</span>
                            <span>Picked</span>
                          </span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-900 text-[15px] truncate mt-1">{currentItem.name}</h4>
                      <p className="text-xs text-slate-500 font-mono mt-0.5">
                        Price: ₹{currentItem.price} • Line Total: ₹{currentItem.price * currentItem.quantity}
                      </p>

                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {currentItem.barcode && (
                          <span className="text-[10.5px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            Barcode: {currentItem.barcode}
                          </span>
                        )}
                        {currentItem.batchNumber && (
                          <span className="text-[10.5px] font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-md border border-slate-200">
                            Batch: {currentItem.batchNumber}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Scan Error Message Banner (if wrong barcode scanned) */}
                  {scanErrorMsg && (
                    <div className="bg-rose-50 border border-rose-300 rounded-2xl p-3 flex items-start gap-2.5 text-rose-800 text-xs animate-shake">
                      <span className="material-symbols-outlined text-rose-600 text-[20px] shrink-0">error</span>
                      <div className="min-w-0 flex-1">
                        <strong className="block font-bold">Scanning Mismatch:</strong>
                        <span>{scanErrorMsg}</span>
                      </div>
                    </div>
                  )}

                  {/* Barcode Verification Actions */}
                  {!currentItem.picked ? (
                    <div className="space-y-2 pt-1">
                      {/* Primary Button: Open Camera Scanner */}
                      <button
                        type="button"
                        onClick={() => setScannerOpen(true)}
                        className="w-full py-3.5 rounded-2xl bg-purple-700 hover:bg-purple-800 text-white font-display font-black text-sm shadow-md shadow-purple-600/25 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span className="material-symbols-outlined text-[20px]">qr_code_scanner</span>
                        <span>Scan Item Barcode with Camera</span>
                      </button>

                      {/* Manual Barcode Input Fallback */}
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={manualBarcodeInput}
                          onChange={(e) => setManualBarcodeInput(e.target.value)}
                          placeholder="Or type EAN/Barcode..."
                          className="flex-1 h-11 px-3 bg-white border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                        />
                        <button
                          type="button"
                          onClick={() => handleBarcodeScanned(manualBarcodeInput)}
                          disabled={!manualBarcodeInput.trim() || isSubmitting}
                          className="px-4 h-11 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
                        >
                          Verify
                        </button>
                      </div>

                      {/* 1-Tap Manual Confirm Pick Button (for damaged/missing barcodes) */}
                      <button
                        type="button"
                        onClick={() => confirmItemPicked(currentItem, currentItem.barcode || '', true)}
                        disabled={isSubmitting}
                        className="w-full py-2 text-xs font-bold text-slate-600 hover:text-purple-700 underline text-center cursor-pointer transition-colors block"
                      >
                        ⚡ Barcode missing or unreadable? Tap to Manual Confirm Pick ({currentItem.quantity} Units)
                      </button>
                    </div>
                  ) : (
                    <div className="bg-emerald-100/70 border border-emerald-300 rounded-2xl p-3 text-center">
                      <p className="text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px]">verified</span>
                        <span>Item verified and placed into Tote {toteNumber}!</span>
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── PICK ROUTE CHECKLIST (All Items in Order) ── */}
              <div className="bg-white rounded-3xl p-4 border border-slate-100 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <h4 className="font-display font-black text-xs uppercase tracking-wider text-slate-700">
                    Pick Route Checklist ({items.length} items)
                  </h4>
                  <span className="text-[11px] text-slate-400 font-medium">Sorted by Aisle Location</span>
                </div>

                <div className="divide-y divide-slate-100 max-h-48 overflow-y-auto pr-1">
                  {items.map((it, idx) => {
                    const isCurrent = idx === activeItemIndex;
                    return (
                      <div
                        key={it._id || idx}
                        onClick={() => setActiveItemIndex(idx)}
                        className={`py-2 px-2 rounded-xl flex items-center justify-between gap-2.5 transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-purple-50 border border-purple-200'
                            : it.picked
                            ? 'bg-emerald-50/50 hover:bg-emerald-50'
                            : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                              it.picked
                                ? 'bg-emerald-500 text-white'
                                : isCurrent
                                ? 'bg-purple-700 text-white'
                                : 'bg-slate-200 text-slate-600'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[14px]">
                              {it.picked ? 'check' : 'location_on'}
                            </span>
                          </div>

                          <div className="min-w-0 flex-1">
                            <p
                              className={`text-xs font-bold truncate ${
                                it.picked ? 'line-through text-slate-400' : 'text-slate-900'
                              }`}
                            >
                              {it.name}
                            </p>
                            <p className="text-[10px] font-mono font-bold text-purple-700">
                              📍 {it.binCode || it.warehouseLocation?.binCode || 'C01-S01-B01'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className="font-bold text-xs font-mono text-slate-800">×{it.quantity}</span>
                          {it.picked ? (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">
                              Picked
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── FOOTER ACTIONS ── */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-700 font-bold text-xs hover:bg-slate-100 transition-colors cursor-pointer"
          >
            Exit Station
          </button>

          {!isOrderFullyPicked ? (
            <button
              type="button"
              onClick={() => {
                // Advance to next unpicked item
                const nextIndex = (activeItemIndex + 1) % items.length;
                setActiveItemIndex(nextIndex);
              }}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span>Next Item</span>
              <span className="material-symbols-outlined text-[16px]">chevron_right</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinishPacking}
              disabled={isFinishing}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <span>Ready for Handover →</span>
            </button>
          )}
        </div>
      </div>

      {/* ── INTEGRATED CAMERA BARCODE SCANNER MODAL ── */}
      <ProductBarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title={`Scan Barcode for ${currentItem?.name || 'Item'}`}
        subtitle={`Target Bin: ${currentItem?.binCode || 'location'}`}
        onScanSuccess={handleBarcodeScanned}
      />
    </div>,
    document.body
  );
}
