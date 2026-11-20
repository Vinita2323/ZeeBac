/**
 * Universal safe address formatter that guarantees a clean string is returned.
 * Prevents React Error #31 (Objects are not valid as a React child) when
 * backend returns structured address objects { fullAddress, landmark, city, state, pincode }.
 */
export const formatDisplayAddress = (addr, fallback = '') => {
  if (!addr) return fallback;
  if (typeof addr === 'string') {
    const trimmed = addr.trim();
    return trimmed || fallback;
  }
  if (typeof addr === 'object') {
    const parts = [
      addr.fullAddress || (addr.houseNo ? `${addr.houseNo}${addr.street ? ', ' + addr.street : ''}` : addr.street),
      addr.landmark ? (String(addr.landmark).toLowerCase().startsWith('near') ? addr.landmark : `Near ${addr.landmark}`) : null,
      addr.city,
      addr.state,
      addr.pincode ? `PIN: ${addr.pincode}` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(', ') : fallback;
  }
  return String(addr) || fallback;
};

export default formatDisplayAddress;
