export const ALL_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Parses a time string (12-hour or 24-hour) into { h, m, mins }
 * Supports: '10:00', '10:00 AM', '08:30 PM', '22:15'
 */
export function parseTime(str) {
  if (!str) return null;
  const s = String(str).trim();
  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i) || s.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (m12) {
    let h = parseInt(m12[1], 10);
    const m = parseInt(m12[2], 10);
    const p = m12[3].toUpperCase();
    if (p === 'PM' && h < 12) h += 12;
    if (p === 'AM' && h === 12) h = 0;
    return { h, m, mins: h * 60 + m };
  }
  const m24 = s.match(/^(\d{1,2}):(\d{2})$/) || s.match(/(\d{1,2}):(\d{2})/);
  if (m24) {
    const h = parseInt(m24[1], 10);
    const m = parseInt(m24[2], 10);
    return { h, m, mins: h * 60 + m };
  }
  return null;
}

/**
 * Formats hour/minute or a time string into 12-hour 'hh:mm AM/PM'
 */
export function formatTo12Hour(timeStrOrH, maybeM) {
  let h, m;
  if (typeof timeStrOrH === 'number') {
    h = timeStrOrH;
    m = typeof maybeM === 'number' ? maybeM : 0;
  } else {
    const parsed = parseTime(timeStrOrH);
    if (!parsed) return timeStrOrH || '';
    h = parsed.h;
    m = parsed.m;
  }
  const p = h >= 12 ? 'PM' : 'AM';
  const dh = h % 12 === 0 ? 12 : h % 12;
  return `${dh < 10 ? '0' + dh : dh}:${m < 10 ? '0' + m : m} ${p}`;
}

/**
 * Formats a 12-hour or 24-hour string into HTML <input type="time"> compatible 'HH:mm'
 */
export function formatTo24Hour(timeStr) {
  const parsed = parseTime(timeStr);
  if (!parsed) return '09:00';
  const h = parsed.h < 10 ? '0' + parsed.h : String(parsed.h);
  const m = parsed.m < 10 ? '0' + parsed.m : String(parsed.m);
  return `${h}:${m}`;
}

/**
 * Formats structured or 24-hour hours into standard user-facing operatingHours text
 * e.g. "09:00 AM - 10:00 PM (All Days)" or "10:00 AM - 08:00 PM (Mon, Tue, Wed, Thu, Fri, Sat)"
 */
export function formatOperatingHours(openingTime, closingTime, workingDays = ALL_DAYS) {
  const openStr = formatTo12Hour(openingTime) || '09:00 AM';
  const closeStr = formatTo12Hour(closingTime) || '10:00 PM';
  const daysText = (!workingDays || workingDays.length === 7) ? 'All Days' : workingDays.join(', ');
  return `${openStr} - ${closeStr} (${daysText})`;
}

/**
 * Evaluates whether a store is currently open right now and returns formatted timing info.
 * Works with vendor objects, businessHours objects, or operatingHours strings.
 */
export function getStoreTimingStatus(vendorOrHours) {
  const DAY_KEYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayKey = DAY_KEYS[new Date().getDay()];

  let openH = 9, openM = 0, closeH = 22, closeM = 0;
  let workingDays = [...ALL_DAYS];

  const vendor = typeof vendorOrHours === 'object' && vendorOrHours !== null ? vendorOrHours : {};
  const opHoursStr = typeof vendorOrHours === 'string'
    ? vendorOrHours
    : (vendor.operatingHours || (vendor.businessHours ? '' : 'Open Daily: 09:00 AM - 10:00 PM'));

  // 1. Check structured businessHours
  if (vendor.businessHours?.openingTime && vendor.businessHours?.closingTime) {
    const o = parseTime(vendor.businessHours.openingTime);
    const c = parseTime(vendor.businessHours.closingTime);
    if (o) { openH = o.h; openM = o.m; }
    if (c) { closeH = c.h; closeM = c.m; }
    if (Array.isArray(vendor.businessHours.workingDays) && vendor.businessHours.workingDays.length > 0) {
      workingDays = vendor.businessHours.workingDays;
    }
  } else if (vendor.openingTime && vendor.closingTime) {
    const o = parseTime(vendor.openingTime);
    const c = parseTime(vendor.closingTime);
    if (o) { openH = o.h; openM = o.m; }
    if (c) { closeH = c.h; closeM = c.m; }
    if (Array.isArray(vendor.workingDays) && vendor.workingDays.length > 0) {
      workingDays = vendor.workingDays;
    }
  } else if (opHoursStr) {
    // 2. Parse from string (both 12-hour and 24-hour supported)
    const m12 = opHoursStr.match(/(\d{1,2}:\d{2}\s*(?:AM|PM))\s*[-–]\s*(\d{1,2}:\d{2}\s*(?:AM|PM))/i);
    if (m12) {
      const o = parseTime(m12[1]);
      const c = parseTime(m12[2]);
      if (o) { openH = o.h; openM = o.m; }
      if (c) { closeH = c.h; closeM = c.m; }
    } else {
      const m24 = opHoursStr.match(/(\d{1,2}:\d{2})\s*[-–]\s*(\d{1,2}:\d{2})/);
      if (m24) {
        const o = parseTime(m24[1]);
        const c = parseTime(m24[2]);
        if (o) { openH = o.h; openM = o.m; }
        if (c) { closeH = c.h; closeM = c.m; }
      }
    }
    const daysMatch = opHoursStr.match(/\(([^)]+)\)/);
    if (daysMatch) {
      const daysContent = daysMatch[1].trim();
      if (/all\s*days/i.test(daysContent)) {
        workingDays = [...ALL_DAYS];
      } else {
        const matchedDays = DAY_KEYS.filter(d => new RegExp('\\b' + d + '\\b', 'i').test(daysContent));
        if (matchedDays.length > 0) workingDays = matchedDays;
      }
    }
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const openMinutes = openH * 60 + openM;
  const closeMinutes = closeH * 60 + closeM;

  const isWorkingDay = workingDays.includes(todayKey);
  let isWithinHours = false;
  if (closeMinutes >= openMinutes) {
    isWithinHours = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  } else {
    // Overnight hours (e.g. 18:00 to 02:00)
    isWithinHours = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  }
  const isManuallyClosed = vendor.isStoreOpen === false;
  const isOpen = !isManuallyClosed && isWorkingDay && isWithinHours;

  const openTimeStr = formatTo12Hour(openH, openM);
  const closeTimeStr = formatTo12Hour(closeH, closeM);
  const timingDisplay = `${openTimeStr} - ${closeTimeStr}`;
  const workingDaysText = workingDays.length === 7 ? 'All Days' : workingDays.join(', ');

  let statusText = 'Closed';
  if (isManuallyClosed) {
    statusText = 'Closed by Store (Offline)';
  } else if (isOpen) {
    statusText = `Open Now (closes ${closeTimeStr})`;
  } else if (!isWorkingDay) {
    statusText = `Closed Today (${workingDaysText})`;
  } else if (currentMinutes < openMinutes) {
    statusText = `Closed (opens today ${openTimeStr})`;
  } else {
    statusText = `Closed (opens tomorrow ${openTimeStr})`;
  }

  return {
    isOpen,
    isManuallyClosed,
    isWorkingDay,
    openHour: openH,
    openMin: openM,
    closeHour: closeH,
    closeMin: closeM,
    openTimeStr,
    closeTimeStr,
    timingDisplay,
    workingDays,
    workingDaysText,
    statusText,
    badgeText: isOpen ? 'Open Now' : 'Closed',
  };
}
