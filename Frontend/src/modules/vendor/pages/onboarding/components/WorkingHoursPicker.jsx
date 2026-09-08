const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function WorkingHoursPicker({ value, onChange }) {
  const hours = value || { openingTime: '', closingTime: '', workingDays: [] };

  const toggleDay = (day) => {
    const days = hours.workingDays || [];
    const next = days.includes(day) ? days.filter(d => d !== day) : [...days, day];
    onChange({ ...hours, workingDays: next });
  };

  return (
    <div className="space-y-3">
      <label className="block text-[12px] font-bold text-gray-500 uppercase tracking-wider">Business Hours</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1">Opening Time</label>
          <input
            type="time"
            value={hours.openingTime || ''}
            onChange={(e) => onChange({ ...hours, openingTime: e.target.value })}
            className="w-full h-11 sm:h-12 px-3 bg-white border border-slate-200 rounded-xl text-[14px] font-bold text-gray-900 outline-none focus:border-purple-600 transition-colors"
          />
        </div>
        <div>
          <label className="block text-[11px] font-bold text-gray-500 mb-1">Closing Time</label>
          <input
            type="time"
            value={hours.closingTime || ''}
            onChange={(e) => onChange({ ...hours, closingTime: e.target.value })}
            className="w-full h-11 sm:h-12 px-3 bg-white border border-slate-200 rounded-xl text-[14px] font-bold text-gray-900 outline-none focus:border-purple-600 transition-colors"
          />
        </div>
      </div>
      <div>
        <label className="block text-[11px] font-bold text-gray-500 mb-1.5">Working Days</label>
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {DAYS.map(day => {
            const active = (hours.workingDays || []).includes(day);
            return (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`h-10 sm:h-11 rounded-xl text-[11px] sm:text-[12px] font-bold transition-all cursor-pointer flex items-center justify-center ${
                  active ? 'bg-[#7c3aed] text-white shadow-sm font-black' : 'bg-white border border-slate-200 text-gray-600 hover:border-purple-300'
                }`}
              >
                {day}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

