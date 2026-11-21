import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import DeliveryTopBar from '../components/DeliveryTopBar';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { DeliveryAPI } from '../../../services/api';
import useDeliveryStore from '../../../store/useDeliveryStore';
import { toast } from 'react-hot-toast';

export default function DeliveryGigsScreen() {
  const navigate = useNavigate();
  const rider = useDeliveryStore((state) => state.rider);
  const setOnlineStatus = useDeliveryStore((state) => state.setOnlineStatus);

  const [loading, setLoading] = useState(true);
  const [zones, setZones] = useState([]);
  const [selectedZone, setSelectedZone] = useState(rider?.workingZone || 'Gomti Nagar');
  const [selectedCity, setSelectedCity] = useState(rider?.workingCity || 'Lucknow');
  const [days, setDays] = useState([]);
  const [slots, setSlots] = useState([]);
  const [bookedGigs, setBookedGigs] = useState([]);
  const [selectedDay, setSelectedDay] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState('book'); // 'book' | 'my_gigs'

  const currentDate = new Date();
  const currentMonthName = currentDate.toLocaleString('default', { month: 'long' }).toUpperCase();
  const currentYear = currentDate.getFullYear();

  // Load zones & gigs
  const loadData = async (zoneName = selectedZone) => {
    try {
      setLoading(true);
      const [zonesRes, gigsRes] = await Promise.all([
        DeliveryAPI.getZones({ city: selectedCity }),
        DeliveryAPI.getGigs({ zoneName }),
      ]);

      if (zonesRes.success && zonesRes.data) {
        setZones(zonesRes.data.zones || []);
        if (zonesRes.data.currentZone && !zoneName) {
          setSelectedZone(zonesRes.data.currentZone);
        }
      }

      if (gigsRes.success && gigsRes.data) {
        setDays(gigsRes.data.days || []);
        setSlots(gigsRes.data.slots || []);
        setBookedGigs(gigsRes.data.bookedGigs || []);
        if (gigsRes.data.days?.length > 0 && !selectedDay) {
          setSelectedDay(gigsRes.data.days[0]);
        }
      }
    } catch (err) {
      console.error('Error fetching gigs data:', err);
      toast.error('Failed to load gigs schedule');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(selectedZone);
  }, [selectedZone, selectedCity]);

  const handleZoneChange = async (newZone) => {
    setSelectedZone(newZone);
    try {
      await DeliveryAPI.updateWorkingZone({ zoneName: newZone, city: selectedCity });
      toast.success(`Working zone changed to ${newZone}`);
      loadData(newZone);
    } catch {
      toast.error('Failed to update zone');
    }
  };

  const handleBookSlot = async (dayObj, slot) => {
    setIsSubmitting(true);
    try {
      const res = await DeliveryAPI.bookGig({
        date: dayObj.date,
        slotId: slot.slotId,
        zoneName: selectedZone,
      });

      if (res.success) {
        toast.success(res.message || '🎉 Gig slot successfully booked! Surge incentives activated.');
        await loadData(selectedZone);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to book slot');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancelGig = async (gigId) => {
    if (!window.confirm('Are you sure you want to cancel this booked slot?')) return;
    setIsSubmitting(true);
    try {
      const res = await DeliveryAPI.cancelGig(gigId);
      if (res.success) {
        toast.success('Gig slot cancelled');
        await loadData(selectedZone);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to cancel gig');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckInGig = async (gigId) => {
    setIsSubmitting(true);
    try {
      const res = await DeliveryAPI.checkInGig(gigId);
      if (res.success) {
        toast.success(res.message || '🚀 Checked in! You are now ONLINE & ready to receive orders.');
        setOnlineStatus(true);
        navigate('/delivery');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Check-in failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Helper: check if a slot is booked for selected date
  const isSlotBooked = (dateStr, slotId) => {
    return bookedGigs.some(
      (g) => g.date === dateStr && g.slotId === slotId && ['BOOKED', 'CHECKED_IN'].includes(g.status)
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-24 font-sans">
      {/* Top Header */}
      <DeliveryTopBar />

      <main className="max-w-[480px] mx-auto p-4 space-y-4">
        {/* Working Zone Selector Chip Bar */}
        <div className="bg-white rounded-2xl p-3 border border-slate-100 shadow-2xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
              <span className="material-symbols-outlined text-[18px]">location_on</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">Current Working Zone</p>
              <h4 className="font-display font-black text-xs text-slate-900">
                {selectedZone} • {selectedCity}
              </h4>
            </div>
          </div>

          {/* Quick Zone Picker Dropdown */}
          <select
            value={selectedZone}
            onChange={(e) => handleZoneChange(e.target.value)}
            className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-slate-800 outline-hidden cursor-pointer"
          >
            {zones.map((z) => (
              <option key={z.zoneId || z._id} value={z.name}>
                {z.name} {z.surgeBonus > 0 ? `(+₹${z.surgeBonus} Surge)` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* View Switcher: Book Gigs vs My Booked Shifts */}
        <div className="flex p-1 bg-slate-200/80 rounded-2xl">
          <button
            onClick={() => setActiveTab('book')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
              activeTab === 'book'
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            📅 Available Slots ({slots.length})
          </button>
          <button
            onClick={() => setActiveTab('my_gigs')}
            className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              activeTab === 'my_gigs'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span>My Booked Shifts</span>
            {bookedGigs.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                  activeTab === 'my_gigs' ? 'bg-white text-emerald-700' : 'bg-emerald-600 text-white'
                }`}
              >
                {bookedGigs.length}
              </span>
            )}
          </button>
        </div>

        {/* Horizontal Promo Chips */}
        <div className="flex items-center gap-2.5 overflow-x-auto scroll-hide pb-1">
          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs min-w-[210px] shrink-0 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-900">Earn extra ₹300</p>
              <p className="text-[11px] text-slate-400 font-medium">Daily Target Incentive</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs">
              <span className="material-symbols-outlined text-[20px]">sell</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs min-w-[210px] shrink-0 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-900">Peak Hour Surge</p>
              <p className="text-[11px] text-slate-400 font-medium">+₹20 to +₹40 / order</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center font-bold text-xs">
              <span className="material-symbols-outlined text-[20px]">trending_up</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs min-w-[210px] shrink-0 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-900">Rain & Bad Weather</p>
              <p className="text-[11px] text-slate-400 font-medium">+₹15 surge automatic</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center font-bold text-xs">
              <span className="material-symbols-outlined text-[20px]">rainy</span>
            </div>
          </div>
        </div>

        {/* TAB 1: BOOK GIGS */}
        {activeTab === 'book' && (
          <div className="space-y-4">
            {/* Month Title */}
            <div className="pt-1 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
                {currentMonthName} {currentYear} • NEXT 7 DAYS
              </p>
              <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                Slots Open
              </span>
            </div>

            {/* 7 Days Horizontal Date Selector */}
            <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
              {days.map((day) => {
                const isSelected = selectedDay?.date === day.date;
                const hasBookingOnDay = bookedGigs.some(
                  (g) => g.date === day.date && ['BOOKED', 'CHECKED_IN'].includes(g.status)
                );

                return (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDay(day)}
                    className={`flex flex-col items-center justify-center min-w-[62px] py-2.5 px-2 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md scale-105'
                        : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-300'
                    }`}
                  >
                    <span className="text-[10px] font-black uppercase tracking-wider opacity-80">
                      {day.dayName}
                    </span>
                    <span className="text-base font-black font-display my-0.5">
                      {day.dateNum}
                    </span>
                    {hasBookingOnDay && (
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          isSelected ? 'bg-amber-300' : 'bg-emerald-500'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Selected Date Header */}
            {selectedDay && (
              <div className="bg-slate-100 rounded-xl px-3 py-2 flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">
                  {selectedDay.dayName}, {selectedDay.fullDateFormatted || selectedDay.date}
                </span>
                <span className="text-slate-500 text-[11px]">
                  {selectedZone} Area
                </span>
              </div>
            )}

            {/* Slot Cards List */}
            {loading ? (
              <div className="p-8 text-center text-slate-400 text-xs font-bold">
                Loading available slots...
              </div>
            ) : slots.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 text-center text-slate-500 border border-slate-100">
                <p className="font-bold text-sm">No slots open for this zone</p>
                <p className="text-xs mt-1 text-slate-400">Try selecting another working zone.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {slots.map((slot) => {
                  const booked = selectedDay ? isSlotBooked(selectedDay.date, slot.slotId) : false;

                  return (
                    <div
                      key={slot.slotId}
                      className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                        booked
                          ? 'bg-emerald-50/80 border-emerald-300 shadow-2xs'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-display font-black text-xs text-slate-900">
                            {slot.timeRange || slot.time}
                          </span>
                          {(slot.isHot || (slot.surgeBonus && slot.surgeBonus > 0)) && (
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[9px] font-black uppercase tracking-wider">
                              +{slot.surgeBonus || 20} SURGE 🔥
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                          {slot.label}
                        </p>
                        <p className="text-[10px] text-emerald-700 font-bold mt-0.5">
                          {slot.incentiveBadge || (slot.surgeBonus ? `+₹${slot.surgeBonus} extra per order` : 'High Demand Slot')}
                        </p>
                      </div>

                      <button
                        onClick={() => handleBookSlot(selectedDay, slot)}
                        disabled={isSubmitting || booked}
                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          booked
                            ? 'bg-emerald-600 text-white shadow-2xs cursor-default'
                            : 'bg-slate-900 hover:bg-black text-white shadow-2xs active:scale-95'
                        }`}
                      >
                        {booked ? 'Booked ✓' : 'Book Gig'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MY BOOKED SHIFTS */}
        {activeTab === 'my_gigs' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between pt-1">
              <h3 className="font-display font-black text-sm text-slate-900">
                Your Scheduled Shifts ({bookedGigs.length})
              </h3>
              <span className="text-[10px] text-slate-400 font-bold">Zomato / Zepto Gig Model</span>
            </div>

            {bookedGigs.length === 0 ? (
              <div className="bg-white rounded-2xl p-8 text-center text-slate-500 border border-slate-100 space-y-2">
                <span className="material-symbols-outlined text-4xl text-slate-300">event_busy</span>
                <p className="font-bold text-sm text-slate-800">No active shifts booked</p>
                <p className="text-xs text-slate-400">
                  Book a slot from the Available Slots tab to reserve your delivery shift with surge incentives.
                </p>
                <button
                  onClick={() => setActiveTab('book')}
                  className="mt-2 px-4 py-2 bg-emerald-600 text-white text-xs font-bold rounded-xl shadow-2xs cursor-pointer"
                >
                  Browse Slots
                </button>
              </div>
            ) : (
              bookedGigs.map((gig) => {
                const isCheckedIn = gig.status === 'CHECKED_IN';
                const todayStr = new Date().toISOString().slice(0, 10);
                const isToday = gig.date === todayStr;

                return (
                  <div
                    key={gig.gigId}
                    className="bg-white rounded-2xl p-4 border border-slate-100 shadow-2xs space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-black font-display text-slate-900">
                            {gig.timeRange}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              isCheckedIn
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-blue-100 text-blue-800'
                            }`}
                          >
                            {isCheckedIn ? 'Checked In • Working' : 'Confirmed'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 font-bold mt-0.5">
                          📅 {gig.date} {isToday ? '(Today)' : ''}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          📍 Zone: <span className="text-slate-700 font-semibold">{gig.zone}</span>
                          {gig.surgeBonus > 0 && ` • +₹${gig.surgeBonus} Surge Bonus`}
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="font-mono text-xs font-black text-emerald-700">
                          {gig.gigId.slice(-6)}
                        </span>
                      </div>
                    </div>

                    {/* Actions: Check In & Cancel */}
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                      {!isCheckedIn ? (
                        <>
                          <button
                            onClick={() => handleCheckInGig(gig.gigId)}
                            disabled={isSubmitting}
                            className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black shadow-xs flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all"
                          >
                            <span className="material-symbols-outlined text-[16px]">login</span>
                            <span>Check-In & Go Online 🚀</span>
                          </button>
                          <button
                            onClick={() => handleCancelGig(gig.gigId)}
                            disabled={isSubmitting}
                            className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-600 hover:text-rose-600 text-xs font-bold transition-all cursor-pointer"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center justify-between w-full">
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-black">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                            <span>Shift Active • You are Online</span>
                          </div>
                          <button
                            onClick={() => navigate('/delivery')}
                            className="px-3 py-1.5 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
                          >
                            Go to Orders →
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </main>

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
