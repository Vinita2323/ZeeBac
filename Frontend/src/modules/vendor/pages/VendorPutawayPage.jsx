import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PutawayAPI, VendorAPI } from '../../../services/api';
import ProductBarcodeScannerModal from '../../../components/common/ProductBarcodeScannerModal';
import { toast } from 'react-hot-toast';

// Audio feedback synthesizers
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

export default function VendorPutawayPage() {
  const navigate = useNavigate();

  // Active view: 'station' (The video flow) | 'queue' | 'bins'
  const [activeTab, setActiveTab] = useState('station');

  // Station Step: 1 (Scan Item) -> 2 (View Target Location) -> 3 (Scan Bin) -> 4 (Confirm Qty)
  const [stationStep, setStationStep] = useState(1);
  const [activeTask, setActiveTask] = useState(null);

  // Scanner modal states
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerMode, setScannerMode] = useState('PRODUCT'); // 'PRODUCT' | 'BIN'

  // Input states
  const [manualProductCode, setManualProductCode] = useState('');
  const [manualBinCode, setManualBinCode] = useState('');
  const [confirmQty, setConfirmQty] = useState('');
  const [putawayNotes, setPutawayNotes] = useState('');

  // Queue & Data states
  const [tasks, setTasks] = useState([]);
  const [taskFilter, setTaskFilter] = useState('PENDING'); // 'PENDING' | 'COMPLETED' | 'ALL'
  const [searchQuery, setSearchQuery] = useState('');
  const [stats, setStats] = useState({
    pendingTasksCount: 0,
    completedTasksCount: 0,
    totalUnitsPending: 0,
  });
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dark store bin map
  const [binData, setBinData] = useState(null);
  const [selectedZone, setSelectedZone] = useState('ALL');

  // Success celebration modal
  const [successCelebration, setSuccessCelebration] = useState(null);

  // Create Task Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [productsList, setProductsList] = useState([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [inwardQuantityInput, setInwardQuantityInput] = useState(24);

  // Load tasks & stats
  const fetchTasks = async () => {
    try {
      setLoading(true);
      const res = await PutawayAPI.getTasks({
        status: taskFilter,
        search: searchQuery || undefined,
        limit: 30,
      });
      if (res.success) {
        setTasks(res.data || []);
        if (res.stats) setStats(res.stats);
      }
    } catch (err) {
      console.error('Failed to load putaway tasks', err);
      toast.error('Could not load putaway tasks');
    } finally {
      setLoading(false);
    }
  };

  // Load dark store bin map
  const fetchBinMap = async () => {
    try {
      const res = await PutawayAPI.getDarkStoreBins();
      if (res.success) {
        setBinData(res.data);
      }
    } catch (err) {
      console.error('Failed to load bin map', err);
    }
  };

  // Load catalog products for manual task creation
  const fetchProducts = async () => {
    try {
      const res = await VendorAPI.getProducts();
      if (res.success) {
        setProductsList(res.data || []);
      }
    } catch (err) {}
  };

  useEffect(() => {
    fetchTasks();
  }, [taskFilter]);

  useEffect(() => {
    fetchBinMap();
    fetchProducts();
  }, []);

  // ── STEP 1: SCAN ITEM ──
  const handleItemScan = async (codeToScan) => {
    const barcode = String(codeToScan || manualProductCode).trim();
    if (!barcode) {
      toast.error('Please scan or enter product barcode / LPN');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await PutawayAPI.scanItem({ barcode });
      if (res.success && res.data) {
        playSuccessChime();
        setActiveTask(res.data);
        setConfirmQty(String(res.data.inwardQuantity || 1));
        setStationStep(2); // Advance to system-directed location card!
        toast.success(res.message || 'Product identified! Walk to designated bin.');
        setManualProductCode('');
        setScannerOpen(false);
      } else {
        playErrorBuzz();
        toast.error(res.message || 'Product not found');
      }
    } catch (err) {
      playErrorBuzz();
      toast.error(err.response?.data?.message || 'Product not found in dark store catalog');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pick task directly from pending list
  const handlePickTaskFromQueue = (taskItem) => {
    setActiveTask(taskItem);
    setConfirmQty(String(taskItem.inwardQuantity || 1));
    setStationStep(2);
    setActiveTab('station');
    playSuccessChime();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // ── STEP 3: SCAN & VERIFY BIN ──
  const handleBinScan = async (codeToVerify) => {
    const binCode = String(codeToVerify || manualBinCode).trim();
    if (!binCode) {
      toast.error('Please scan the shelf / bin barcode');
      return;
    }

    if (!activeTask) return;

    setIsSubmitting(true);
    try {
      const res = await PutawayAPI.verifyBin({
        taskId: activeTask._id,
        binCode,
      });

      if (res.success && res.verified) {
        playSuccessChime();
        setActiveTask(res.data || activeTask);
        setStationStep(4); // Advance to quantity confirmation!
        toast.success(`✅ Location Verified: Bin ${activeTask.targetLocation.binCode}`);
        setManualBinCode('');
        setScannerOpen(false);
      } else {
        playErrorBuzz();
        toast.error(res.message || 'Wrong bin scanned!');
      }
    } catch (err) {
      playErrorBuzz();
      toast.error(
        err.response?.data?.message ||
          `⚠️ Wrong Bin! You scanned "${binCode}". Target is "${activeTask.targetLocation.binCode}".`
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── STEP 4: CONFIRM PUTAWAY & MAKE LIVE ──
  const handleConfirmPutaway = async (e) => {
    if (e) e.preventDefault();
    if (!activeTask) return;

    const qty = parseInt(confirmQty, 10);
    if (!qty || qty <= 0) {
      toast.error('Please enter a valid quantity greater than 0');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await PutawayAPI.confirmPutaway({
        taskId: activeTask._id,
        quantity: qty,
        binCode: activeTask.targetLocation.binCode,
        notes: putawayNotes,
      });

      if (res.success) {
        playSuccessChime();
        setSuccessCelebration({
          productName: activeTask.productName,
          quantity: qty,
          binCode: activeTask.targetLocation.binCode,
          rack: activeTask.targetLocation.rack,
          shelf: activeTask.targetLocation.shelf,
          newStock: res.data?.newStock ?? qty,
        });

        // Reset station
        setActiveTask(null);
        setStationStep(1);
        setConfirmQty('');
        setPutawayNotes('');

        fetchTasks();
        fetchBinMap();
      } else {
        toast.error(res.message || 'Failed to complete putaway');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Server error confirming putaway');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Create Inbound Task
  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!selectedProductId) {
      toast.error('Please select a product');
      return;
    }

    try {
      const res = await PutawayAPI.createTask({
        productId: selectedProductId,
        inwardQuantity: Number(inwardQuantityInput) || 1,
      });
      if (res.success) {
        toast.success('Inbound task created successfully!');
        setShowCreateModal(false);
        fetchTasks();
        // Option to put away now
        if (res.data) {
          handlePickTaskFromQueue(res.data);
        }
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create task');
    }
  };

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans pb-16">
      {/* ── TOP HEADER & WMS TELEMETRY STRIP ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-[#7c3aed] to-[#9333ea] text-white flex items-center justify-center shadow-md shadow-purple-500/20">
              <span className="material-symbols-outlined text-[22px]">shelves</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-display font-black text-lg text-slate-900 tracking-tight leading-tight">
                  Dark Store Putaway Station
                </h1>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200">
                  WMS Live
                </span>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Zepto / Blinkit Shelf Inwarding & Location Verification
              </p>
            </div>
          </div>

          {/* Quick Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-3.5 py-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold transition-all active:scale-95 cursor-pointer flex items-center gap-1.5 border border-purple-200"
            >
              <span className="material-symbols-outlined text-[16px]">add_box</span>
              <span>Inward New Batch</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveTab('station');
                setStationStep(1);
                setActiveTask(null);
              }}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-black text-white text-xs font-display font-black shadow-md transition-all active:scale-95 cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">barcode_scanner</span>
              <span>Open Scanner</span>
            </button>
          </div>
        </div>

        {/* ── METRICS OVERVIEW STRIP ── */}
        <div className="max-w-6xl mx-auto px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs gap-3 overflow-x-auto">
          <div className="flex items-center gap-6 min-w-max">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
              <span className="text-slate-500 font-medium">Pending Tasks:</span>
              <strong className="font-mono font-black text-slate-900 text-sm">
                {stats.pendingTasksCount || 0}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-purple-600 text-[18px]">inventory</span>
              <span className="text-slate-500 font-medium">Units to Put Away:</span>
              <strong className="font-mono font-black text-purple-900 text-sm">
                {stats.totalUnitsPending || 0} pcs
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-emerald-600 text-[18px]">verified</span>
              <span className="text-slate-500 font-medium">Putaways Completed:</span>
              <strong className="font-mono font-black text-emerald-800 text-sm">
                {stats.completedTasksCount || 0}
              </strong>
            </div>

            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-blue-600 text-[18px]">grid_view</span>
              <span className="text-slate-500 font-medium">Occupied Bins:</span>
              <strong className="font-mono font-black text-blue-900 text-sm">
                {binData?.occupiedBinsCount || 0} / {binData?.totalBins || 0}
              </strong>
            </div>
          </div>

          {/* Tab Navigation Pill */}
          <div className="inline-flex p-1 bg-white rounded-xl border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setActiveTab('station')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'station'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Putaway Station
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('queue')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'queue'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Task Queue ({stats.pendingTasksCount || 0})
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('bins')}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                activeTab === 'bins'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Dark Store Bins
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 space-y-6">
        {/* ═════════════════════════════════════════════════════════════════════
            TAB 1: PUTAWAY STATION (THE VIDEO FLOW)
        ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'station' && (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* Step Progress Tracker */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200/80 shadow-xs">
              <div className="flex items-center justify-between text-xs font-bold text-slate-500 px-2">
                <span className={stationStep >= 1 ? 'text-purple-700 font-black' : ''}>
                  1. Scan Item
                </span>
                <span className="material-symbols-outlined text-[16px] text-slate-300">arrow_forward</span>
                <span className={stationStep >= 2 ? 'text-purple-700 font-black' : ''}>
                  2. View Bin Location
                </span>
                <span className="material-symbols-outlined text-[16px] text-slate-300">arrow_forward</span>
                <span className={stationStep >= 3 ? 'text-purple-700 font-black' : ''}>
                  3. Scan Bin
                </span>
                <span className="material-symbols-outlined text-[16px] text-slate-300">arrow_forward</span>
                <span className={stationStep >= 4 ? 'text-emerald-700 font-black' : ''}>
                  4. Make Live
                </span>
              </div>
              <div className="w-full bg-slate-100 h-2 rounded-full mt-3 overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-600 to-emerald-500 h-full transition-all duration-300 ease-out"
                  style={{ width: `${(stationStep / 4) * 100}%` }}
                />
              </div>
            </div>

            {/* ── STEP 1: SCAN PRODUCT / LPN ── */}
            {stationStep === 1 && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-md text-center space-y-5">
                <div className="w-20 h-20 rounded-3xl bg-purple-50 text-purple-700 flex items-center justify-center mx-auto shadow-inner border border-purple-100">
                  <span className="material-symbols-outlined text-[42px] animate-pulse">
                    qr_code_scanner
                  </span>
                </div>

                <div>
                  <h2 className="font-display font-black text-xl text-slate-900 tracking-tight">
                    Step 1: Scan Inbound Product or LPN
                  </h2>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Pick an item from the inbound cart/tote. Point camera at the barcode on the product pack, or enter barcode manually.
                  </p>
                </div>

                {/* Big Camera Scan Button */}
                <button
                  type="button"
                  onClick={() => {
                    setScannerMode('PRODUCT');
                    setScannerOpen(true);
                  }}
                  className="w-full py-4 rounded-2xl bg-gradient-to-r from-[#7c3aed] to-[#9333ea] hover:opacity-95 text-white font-display font-black text-sm shadow-lg shadow-purple-600/25 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[24px]">photo_camera</span>
                  <span>Launch Camera Barcode Scanner</span>
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Or Enter Manually</span>
                  <div className="flex-1 h-px bg-slate-200" />
                </div>

                {/* Manual Barcode Input Form */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleItemScan();
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={manualProductCode}
                    onChange={(e) => setManualProductCode(e.target.value)}
                    placeholder="Enter EAN-13, SKU, or Product Barcode (e.g. 8901262...)"
                    className="flex-1 px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs font-mono font-bold outline-none focus:border-purple-600"
                  />
                  <button
                    type="submit"
                    disabled={isSubmitting || !manualProductCode.trim()}
                    className="px-5 py-3 rounded-2xl bg-slate-900 hover:bg-black text-white text-xs font-bold disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {isSubmitting ? 'Searching...' : 'Scan Item'}
                  </button>
                </form>

                {/* Quick Inbound Queue Chips (Easy Testing) */}
                {tasks.filter((t) => t.status === 'PENDING').length > 0 && (
                  <div className="pt-2 text-left border-t border-slate-100">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-2">
                      Ready in Inbound Queue (Tap to Start):
                    </span>
                    <div className="space-y-2">
                      {tasks
                        .filter((t) => t.status === 'PENDING')
                        .slice(0, 3)
                        .map((taskItem) => (
                          <div
                            key={taskItem._id}
                            onClick={() => handlePickTaskFromQueue(taskItem)}
                            className="p-3 rounded-2xl bg-slate-50 hover:bg-purple-50/70 border border-slate-200/70 flex items-center justify-between cursor-pointer transition-all hover:scale-[1.01]"
                          >
                            <div className="flex items-center gap-3">
                              {taskItem.image ? (
                                <img
                                  src={taskItem.image}
                                  alt=""
                                  className="w-10 h-10 object-contain rounded-xl bg-white border border-slate-200 p-0.5"
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center font-bold text-xs">
                                  📦
                                </div>
                              )}
                              <div>
                                <h4 className="font-bold text-xs text-slate-900">{taskItem.productName}</h4>
                                <p className="text-[10px] text-slate-500 font-mono">
                                  Barcode: {taskItem.barcode || 'N/A'} • {taskItem.inwardQuantity} units
                                </p>
                              </div>
                            </div>
                            <span className="text-xs font-black text-purple-700 bg-white px-2.5 py-1 rounded-xl border border-purple-200 shadow-2xs">
                              Putaway →
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── STEP 2 & 3: SYSTEM-DIRECTED LOCATION & BIN SCAN (THE CORE VIDEO DISPLAY) ── */}
            {(stationStep === 2 || stationStep === 3) && activeTask && (
              <div className="space-y-4">
                {/* Product Summary Header Card */}
                <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-xs flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    {activeTask.image ? (
                      <img
                        src={activeTask.image}
                        alt=""
                        className="w-14 h-14 object-contain rounded-2xl bg-slate-50 border border-slate-200 p-1 shrink-0"
                      />
                    ) : (
                      <div className="w-14 h-14 rounded-2xl bg-purple-100 text-purple-700 flex items-center justify-center text-xl shrink-0 font-bold">
                        📦
                      </div>
                    )}
                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                        Task #{activeTask.taskNumber}
                      </span>
                      <h3 className="font-display font-black text-sm text-slate-900 mt-1 truncate">
                        {activeTask.productName}
                      </h3>
                      <p className="text-[11px] text-slate-500 font-mono">
                        Barcode: {activeTask.barcode} • Batch: {activeTask.batchNumber || 'N/A'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block">Inward Qty</span>
                    <span className="font-mono font-black text-xl text-slate-900">
                      {activeTask.inwardQuantity} pcs
                    </span>
                  </div>
                </div>

                {/* ── HUGE HIGH-CONTRAST TARGET LOCATION CARD (ZEPTO DARK STORE STYLE) ── */}
                <div className="bg-gradient-to-br from-[#1e1b4b] to-[#0f172a] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden border border-purple-900/50">
                  <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                    <span className="material-symbols-outlined text-[140px]">shelves</span>
                  </div>

                  <div className="flex items-center justify-between mb-4">
                    <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                      SYSTEM-DIRECTED PUTAWAY LOCATION
                    </span>
                    <span className="text-xs font-mono text-purple-300 font-bold">
                      {activeTask.targetLocation.zone}
                    </span>
                  </div>

                  <p className="text-xs text-slate-300 font-medium">
                    Walk to this rack and shelf in your dark store:
                  </p>

                  {/* 3 Large Coordinate Boxes: Rack • Shelf • Bin */}
                  <div className="grid grid-cols-3 gap-3 my-5 text-center">
                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 block">
                        RACK
                      </span>
                      <span className="text-2xl sm:text-3xl font-display font-black text-white mt-1 block">
                        {activeTask.targetLocation.rack}
                      </span>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/10">
                      <span className="text-[10px] font-black uppercase tracking-wider text-purple-300 block">
                        SHELF
                      </span>
                      <span className="text-2xl sm:text-3xl font-display font-black text-white mt-1 block">
                        {activeTask.targetLocation.shelf}
                      </span>
                    </div>

                    <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-emerald-400/40 ring-2 ring-emerald-500/30">
                      <span className="text-[10px] font-black uppercase tracking-wider text-emerald-300 block">
                        BIN
                      </span>
                      <span className="text-2xl sm:text-3xl font-display font-black text-emerald-300 mt-1 block">
                        {activeTask.targetLocation.bin}
                      </span>
                    </div>
                  </div>

                  {/* Large Bin Barcode Identifier */}
                  <div className="bg-white text-slate-900 rounded-2xl p-4 text-center shadow-inner space-y-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">
                      EXPECTED SHELF BARCODE TO SCAN:
                    </span>
                    <div className="font-mono font-black text-2xl sm:text-3xl text-purple-900 tracking-wider">
                      {activeTask.targetLocation.binCode}
                    </div>
                    <div className="flex items-center justify-center gap-1 text-[11px] font-bold text-slate-500">
                      <span className="material-symbols-outlined text-[15px] text-emerald-600">qr_code</span>
                      <span>Scan sticker on shelf to verify you are at the correct location</span>
                    </div>
                  </div>

                  {/* Action Section for Step 2 -> 3 */}
                  <div className="mt-5 space-y-2">
                    <button
                      type="button"
                      onClick={() => {
                        setScannerMode('BIN');
                        setScannerOpen(true);
                      }}
                      className="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-display font-black text-sm shadow-lg shadow-emerald-500/30 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span className="material-symbols-outlined text-[24px]">qr_code_scanner</span>
                      <span>Scan Bin Barcode at Shelf (Camera)</span>
                    </button>

                    {/* Quick Simulation / Manual Override */}
                    <div className="flex items-center justify-between text-xs pt-1 px-1">
                      <button
                        type="button"
                        onClick={() => handleBinScan(activeTask.targetLocation.binCode)}
                        className="text-emerald-300 hover:text-white font-bold underline cursor-pointer text-[11px]"
                      >
                        ⚡ 1-Tap Verify Location ({activeTask.targetLocation.binCode})
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setActiveTask(null);
                          setStationStep(1);
                        }}
                        className="text-slate-400 hover:text-slate-200 text-[11px] cursor-pointer"
                      >
                        Cancel & Switch Item
                      </button>
                    </div>
                  </div>
                </div>

                {/* Manual Bin Input Alternative */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 text-xs space-y-2">
                  <span className="font-bold text-slate-700 block">Or Type Scanned Bin Code:</span>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleBinScan();
                    }}
                    className="flex gap-2"
                  >
                    <input
                      type="text"
                      value={manualBinCode}
                      onChange={(e) => setManualBinCode(e.target.value)}
                      placeholder={`e.g. ${activeTask.targetLocation.binCode}`}
                      className="flex-1 px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono font-bold outline-none focus:border-purple-600 uppercase"
                    />
                    <button
                      type="submit"
                      disabled={isSubmitting || !manualBinCode.trim()}
                      className="px-4 py-2 rounded-xl bg-slate-900 text-white font-bold text-xs"
                    >
                      Verify
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* ── STEP 4: CONFIRM PLACEMENT & QUANTITY (MAKE STOCK LIVE) ── */}
            {stationStep === 4 && activeTask && (
              <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-md space-y-5 animate-in zoom-in-95">
                <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900">
                  <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                    <span className="material-symbols-outlined text-[24px]">verified</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-emerald-950 uppercase tracking-wide">
                      Location Verified: Bin {activeTask.targetLocation.binCode}
                    </h4>
                    <p className="text-[11px] text-emerald-800 font-medium">
                      Correct shelf reached ({activeTask.targetLocation.rack}, {activeTask.targetLocation.shelf}). Confirm placed units below.
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Quantity Placed into Bin (pcs):
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      min="1"
                      required
                      value={confirmQty}
                      onChange={(e) => setConfirmQty(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 rounded-2xl border border-slate-200 text-xl font-mono font-black text-slate-900 outline-none focus:border-emerald-600"
                    />
                    <span className="absolute right-4 top-3 text-sm font-bold text-slate-400">Pcs</span>
                  </div>
                </div>

                {/* Preset Chips */}
                <div className="flex gap-2">
                  {[12, 24, activeTask.inwardQuantity].map((preset, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setConfirmQty(String(preset))}
                      className="flex-1 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs"
                    >
                      {preset} pcs
                    </button>
                  ))}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 block">
                    Shelf Placement Remarks (Optional):
                  </label>
                  <input
                    type="text"
                    value={putawayNotes}
                    onChange={(e) => setPutawayNotes(e.target.value)}
                    placeholder="e.g. Front row stacked, expiry FIFO verified"
                    className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={handleConfirmPutaway}
                  className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-sm shadow-lg shadow-emerald-600/30 active:scale-98 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[22px]">rocket_launch</span>
                  <span>{isSubmitting ? 'Updating WMS...' : 'Confirm Putaway & Make Stock LIVE 🎉'}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════
            TAB 2: INBOUND QUEUE & COMPLETED TASKS
        ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'queue' && (
          <div className="space-y-4">
            {/* Filter Pill and Search */}
            <div className="bg-white rounded-3xl p-4 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex p-1 bg-slate-100 rounded-2xl border border-slate-200">
                <button
                  type="button"
                  onClick={() => setTaskFilter('PENDING')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    taskFilter === 'PENDING' ? 'bg-white text-purple-700 shadow-xs font-black' : 'text-slate-600'
                  }`}
                >
                  Pending Putaway ({stats.pendingTasksCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('COMPLETED')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    taskFilter === 'COMPLETED' ? 'bg-white text-purple-700 shadow-xs font-black' : 'text-slate-600'
                  }`}
                >
                  Completed ({stats.completedTasksCount || 0})
                </button>
                <button
                  type="button"
                  onClick={() => setTaskFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                    taskFilter === 'ALL' ? 'bg-white text-purple-700 shadow-xs font-black' : 'text-slate-600'
                  }`}
                >
                  All Tasks
                </button>
              </div>

              <div className="relative w-full sm:w-auto sm:min-w-[240px]">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-slate-400 text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && fetchTasks()}
                  placeholder="Search item, barcode, bin..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs font-medium outline-none focus:border-purple-600"
                />
              </div>
            </div>

            {/* Task Cards Grid */}
            {loading ? (
              <div className="p-12 text-center text-slate-400 bg-white rounded-3xl border border-slate-200">
                <div className="w-8 h-8 border-3 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                <span>Loading putaway tasks...</span>
              </div>
            ) : tasks.length === 0 ? (
              <div className="p-12 text-center text-slate-500 bg-white rounded-3xl border border-slate-200 space-y-2">
                <span className="material-symbols-outlined text-4xl text-slate-300">task_alt</span>
                <p className="font-bold text-sm text-slate-700">No tasks found matching this filter</p>
                <p className="text-xs text-slate-400">All inbound stock is put away or no tasks created yet.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tasks.map((taskItem) => (
                  <div
                    key={taskItem._id}
                    className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs space-y-3 flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-center justify-between text-[10px] font-mono mb-2">
                        <span className="text-slate-400 font-bold">#{taskItem.taskNumber}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full font-black uppercase tracking-wider ${
                            taskItem.status === 'COMPLETED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-amber-100 text-amber-900 animate-pulse'
                          }`}
                        >
                          {taskItem.status}
                        </span>
                      </div>

                      <div className="flex items-start gap-3">
                        {taskItem.image ? (
                          <img
                            src={taskItem.image}
                            alt=""
                            className="w-12 h-12 rounded-xl object-contain bg-slate-50 border border-slate-100 p-1 shrink-0"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-lg shrink-0">
                            📦
                          </div>
                        )}
                        <div className="min-w-0">
                          <h4 className="font-bold text-xs text-slate-900 truncate">
                            {taskItem.productName}
                          </h4>
                          <p className="text-[10px] text-slate-500 font-mono">
                            Barcode: {taskItem.barcode || 'N/A'}
                          </p>
                          <p className="text-[10px] text-slate-500 font-medium">
                            Qty: <strong className="text-slate-800">{taskItem.inwardQuantity} pcs</strong>
                          </p>
                        </div>
                      </div>

                      {/* Location Badge */}
                      <div className="mt-3 p-2 rounded-xl bg-slate-50 border border-slate-100 text-[11px] flex items-center justify-between">
                        <span className="text-slate-500">Target Shelf:</span>
                        <span className="font-mono font-black text-purple-900">
                          📍 {taskItem.targetLocation?.binCode}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(taskItem.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                        })}
                      </span>

                      {taskItem.status !== 'COMPLETED' ? (
                        <button
                          type="button"
                          onClick={() => handlePickTaskFromQueue(taskItem)}
                          className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold active:scale-95 transition-all cursor-pointer shadow-xs"
                        >
                          Putaway Now →
                        </button>
                      ) : (
                        <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[15px]">done_all</span>
                          <span>In Stock</span>
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════════
            TAB 3: DARK STORE BIN LAYOUT & PRINTABLE BARCODES
        ═════════════════════════════════════════════════════════════════════ */}
        {activeTab === 'bins' && binData && (
          <div className="space-y-4">
            <div className="bg-white rounded-3xl p-5 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-display font-black text-base text-slate-900">
                  Dark Store Rack & Bin Mapping
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Visual layout of all racks, shelves and bins. Print barcode stickers to affix on physical shelves.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-3.5 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">print</span>
                  <span>Print Shelf Barcode Stickers</span>
                </button>
              </div>
            </div>

            {/* Bins Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {binData.bins.slice(0, 48).map((bin) => (
                <div
                  key={bin.binCode}
                  className={`p-3 rounded-2xl border transition-all text-center space-y-1.5 ${
                    bin.isOccupied
                      ? 'bg-purple-50/70 border-purple-200 ring-1 ring-purple-100'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <span className="text-[9px] font-mono text-slate-400 block uppercase">
                    {bin.rack} • {bin.shelf}
                  </span>
                  <div className="font-mono font-black text-sm text-slate-900 tracking-wider">
                    {bin.binCode}
                  </div>
                  <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[10px]">
                    <span className={bin.isOccupied ? 'text-purple-700 font-bold' : 'text-slate-400'}>
                      {bin.isOccupied ? `${bin.itemsCount} Items` : 'Empty Bin'}
                    </span>
                    {bin.isOccupied && (
                      <span className="font-mono font-black text-slate-800">
                        {bin.totalStock} pcs
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* ═════════════════════════════════════════════════════════════════════
          BARCODE SCANNER MODAL (FOR PRODUCT AND BIN BARCODES)
      ═════════════════════════════════════════════════════════════════════ */}
      <ProductBarcodeScannerModal
        isOpen={scannerOpen}
        onClose={() => setScannerOpen(false)}
        title={scannerMode === 'PRODUCT' ? 'Scan Inbound Product Barcode' : 'Scan Shelf / Bin Barcode'}
        subtitle={
          scannerMode === 'PRODUCT'
            ? 'Point camera at the EAN / SKU barcode on the product pack'
            : `Point camera at shelf sticker for Bin: ${activeTask?.targetLocation?.binCode || ''}`
        }
        onScan={(scannedCode) => {
          if (scannerMode === 'PRODUCT') {
            handleItemScan(scannedCode);
          } else {
            handleBinScan(scannedCode);
          }
        }}
      />

      {/* ═════════════════════════════════════════════════════════════════════
          SUCCESS CELEBRATION MODAL (STOCK LIVE CONFIRMATION)
      ═════════════════════════════════════════════════════════════════════ */}
      {successCelebration && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-in zoom-in-95 border border-slate-100 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto text-3xl shadow-inner">
              🎉
            </div>

            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                Putaway Confirmed • Stock is Live
              </span>
              <h3 className="font-display font-black text-xl text-slate-900 mt-2">
                +{successCelebration.quantity} Units Added
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 font-bold">
                {successCelebration.productName}
              </p>
            </div>

            <div className="bg-slate-50 rounded-2xl p-3 text-left text-xs space-y-1.5 border border-slate-100 font-mono">
              <div className="flex justify-between">
                <span className="text-slate-500">Target Shelf:</span>
                <span className="font-black text-purple-900">📍 {successCelebration.binCode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Rack / Shelf:</span>
                <span className="font-bold text-slate-800">
                  {successCelebration.rack} • {successCelebration.shelf}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Live Stock:</span>
                <span className="font-black text-emerald-700">
                  {successCelebration.newStock} pcs
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setSuccessCelebration(null);
                setStationStep(1);
              }}
              className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-display font-black text-xs shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Put Away Next Item 🚀
            </button>
          </div>
        </div>
      )}

      {/* ═════════════════════════════════════════════════════════════════════
          CREATE INBOUND TASK MODAL
      ═════════════════════════════════════════════════════════════════════ */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl space-y-4 border border-slate-100 max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-display font-black text-base text-slate-900">
                Inward New Stock Batch
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:bg-slate-200"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">Select Product:</label>
                <select
                  required
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 rounded-xl border border-slate-200 font-medium outline-none focus:border-purple-600"
                >
                  <option value="">-- Choose from Catalog --</option>
                  {productsList.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} (Stock: {p.stock || 0})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">Inward Quantity (pcs):</label>
                <input
                  type="number"
                  min="1"
                  required
                  value={inwardQuantityInput}
                  onChange={(e) => setInwardQuantityInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 rounded-xl border border-slate-200 font-mono font-bold outline-none"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 rounded-2xl bg-purple-600 hover:bg-purple-700 text-white font-display font-black text-xs shadow-md active:scale-95 transition-all mt-2 cursor-pointer"
              >
                Generate Putaway Task & Target Bin
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
