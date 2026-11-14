import { useState } from 'react';
import DeliveryTopBar from '../components/DeliveryTopBar';
import DeliveryBottomNav from '../components/DeliveryBottomNav';
import { toast } from 'react-hot-toast';

export default function DeliveryGigsScreen() {
  const [selectedDay, setSelectedDay] = useState(null);
  const [bookedSlots, setBookedSlots] = useState({
    '14_slot_2': true,
  });

  const currentDate = new Date();
  const currentMonthName = currentDate.toLocaleString('default', { month: 'long' }).toUpperCase();
  const currentYear = currentDate.getFullYear();

  // Next 7 days list
  const days = Array.from({ length: 7 }).map((_, idx) => {
    const d = new Date();
    d.setDate(currentDate.getDate() + idx);
    return {
      dateNum: d.getDate(),
      dayName: d.toLocaleString('en-US', { weekday: 'short' }),
      fullDate: d.toLocaleDateString('en-GB'),
      isToday: idx === 0,
      id: `${d.getDate()}_${d.getMonth()}`,
    };
  });

  const slots = [
    { id: 'slot_1', time: '06:00 AM - 11:00 AM', label: 'Morning Breakfast Rush', bonus: '+₹40/hr guarantee' },
    { id: 'slot_2', time: '11:00 AM - 04:00 PM', label: 'Lunch & Groceries Peak', bonus: 'High Demand' },
    { id: 'slot_3', time: '04:00 PM - 09:00 PM', label: 'Evening Peak Surge', bonus: '+₹20 extra per order', isHot: true },
    { id: 'slot_4', time: '09:00 PM - 12:00 AM', label: 'Late Night Express', bonus: '+₹30 extra per order', isHot: true },
  ];

  const handleBookSlot = (dayId, slotId) => {
    const key = `${dayId}_${slotId}`;
    setBookedSlots((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
    toast.success(
      bookedSlots[key]
        ? 'Gig slot booking cancelled'
        : '🎉 Gig Slot successfully booked! Extra incentive activated.'
    );
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] text-slate-900 pb-20 font-sans">
      {/* Top Header */}
      <DeliveryTopBar />

      <main className="max-w-[480px] mx-auto p-4 space-y-4">
        {/* Horizontal Promo Chips (From Image 6) */}
        <div className="flex items-center gap-2.5 overflow-x-auto scroll-hide pb-1">
          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs min-w-[210px] shrink-0 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-900">Earn extra ₹300</p>
              <p className="text-[11px] text-slate-400 font-medium">Today's Target Bonus</p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold text-xs">
              <span className="material-symbols-outlined text-[20px]">sell</span>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-3.5 border border-slate-100 shadow-2xs min-w-[210px] shrink-0 flex items-center justify-between">
            <div>
              <p className="text-xs font-black text-slate-900">Earn extra ₹7 / order</p>
              <p className="text-[11px] text-slate-400 font-medium">Peak Hour Incentive</p>
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

        {/* Month Title */}
        <div className="pt-2">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">
            {currentMonthName} {currentYear}
          </p>
        </div>

        {/* Days List (Image 6 Exact Match) */}
        <div className="space-y-2.5">
          {days.map((day) => {
            const isAnyBooked = slots.some((s) => bookedSlots[`${day.id}_${s.id}`]);

            return (
              <div
                key={day.id}
                onClick={() => setSelectedDay(day)}
                className="bg-white rounded-2xl p-2.5 sm:p-3 border border-slate-100 shadow-2xs hover:border-emerald-300 transition-all cursor-pointer flex items-center justify-between group active:scale-[0.99]"
              >
                <div className="flex items-center gap-3.5">
                  {/* Left Green Date Box */}
                  <div className="w-14 h-14 rounded-xl bg-emerald-600 text-white flex flex-col items-center justify-center font-black shadow-2xs shrink-0">
                    <span className="text-[18px] leading-tight font-display">{day.dateNum}</span>
                    <span className="text-[11px] font-medium leading-none">{day.dayName}</span>
                  </div>

                  {/* Booking Info */}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="font-display font-black text-sm text-slate-900">
                        {isAnyBooked ? 'Gig Confirmed' : 'Booking open'}
                      </h4>
                      {day.isToday && (
                        <span className="px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-800 text-[9px] font-black uppercase">
                          Today
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-0.5">
                      {isAnyBooked ? 'You have active slots booked' : 'Book now to earn extra incentives'}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-slate-400 group-hover:text-emerald-600 pr-2">
                  <span className="text-xs font-bold hidden sm:inline">
                    {isAnyBooked ? 'View Slots' : 'Select'}
                  </span>
                  <span className="material-symbols-outlined text-[20px]">
                    chevron_right
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* ─── GIG SLOT SELECTION MODAL ─── */}
      {selectedDay && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 shadow-2xl border border-slate-100 animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                  Slot Booking
                </span>
                <h3 className="font-display font-black text-base text-slate-900 mt-1">
                  Gigs for {selectedDay.dayName}, {selectedDay.dateNum} {currentMonthName}
                </h3>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="mt-4 space-y-2.5">
              {slots.map((slot) => {
                const isBooked = bookedSlots[`${selectedDay.id}_${slot.id}`];

                return (
                  <div
                    key={slot.id}
                    className={`p-3.5 rounded-2xl border transition-all flex items-center justify-between ${
                      isBooked
                        ? 'bg-emerald-50/70 border-emerald-300'
                        : 'bg-white border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-display font-black text-xs text-slate-900">
                          {slot.time}
                        </span>
                        {slot.isHot && (
                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[9px] font-black">
                            SURGE
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 font-medium mt-0.5">{slot.label}</p>
                      <p className="text-[10px] text-emerald-700 font-bold mt-0.5">{slot.bonus}</p>
                    </div>

                    <button
                      onClick={() => handleBookSlot(selectedDay.id, slot.id)}
                      className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isBooked
                          ? 'bg-emerald-600 text-white shadow-2xs'
                          : 'bg-slate-900 hover:bg-black text-white shadow-2xs'
                      }`}
                    >
                      {isBooked ? 'Booked ✓' : 'Book'}
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="mt-5">
              <button
                onClick={() => setSelectedDay(null)}
                className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold transition-all cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Nav */}
      <DeliveryBottomNav />
    </div>
  );
}
