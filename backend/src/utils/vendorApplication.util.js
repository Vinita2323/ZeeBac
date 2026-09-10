// Tracked fields for application snapshots/diffing — captures onboarding fields
// including store details, location, media, documents, and chosen cashback rate.
export const TRACKED_FIELD_PATHS = [
  'storeName',
  'shopType',
  'category',
  'subCategory',
  'description',
  'cashbackRate',
  'businessContactNumber',
  'businessEmail',
  'gstNumber',
  'registrationNumber',
  'address.fullAddress',
  'address.landmark',
  'address.city',
  'address.state',
  'address.pincode',
  'location.coordinates',
  'businessHours.openingTime',
  'businessHours.closingTime',
  'businessHours.workingDays',
  'storeLogo',
  'storeCoverImage',
  'storeImages',
  'documents.aadhaarPan.fileUrl',
  'documents.gstCertificate.fileUrl',
  'documents.shopLicense.fileUrl',
  'documents.cancelledCheque.fileUrl',
  'documents.panCard.fileUrl',
  'documents.additionalDoc.fileUrl',
];

const getPath = (obj, path) => path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);

const isEqualValue = (a, b) => {
  if (Array.isArray(a) || Array.isArray(b)) {
    return JSON.stringify(a || []) === JSON.stringify(b || []);
  }
  return (a ?? null) === (b ?? null);
};

export function buildSnapshot(vendorDoc) {
  const plain = typeof vendorDoc.toObject === 'function' ? vendorDoc.toObject() : vendorDoc;
  const snapshot = {};
  for (const path of TRACKED_FIELD_PATHS) {
    snapshot[path] = getPath(plain, path) ?? null;
  }
  return snapshot;
}

export function diffSnapshots(oldSnapshot, newSnapshot) {
  const changes = [];
  for (const path of TRACKED_FIELD_PATHS) {
    const oldValue = oldSnapshot ? oldSnapshot[path] ?? null : null;
    const newValue = newSnapshot ? newSnapshot[path] ?? null : null;
    if (!isEqualValue(oldValue, newValue)) {
      changes.push({ field: path, oldValue, newValue });
    }
  }
  return changes;
}

export function validateApplicationComplete(vendorDoc) {
  const missing = [];

  if (!vendorDoc.storeName?.trim()) missing.push('Business/Shop Name');
  if (!vendorDoc.shopType) missing.push('Business Type (Independent Store / Chain & Brand)');
  if (!vendorDoc.category) missing.push('Business Category');
  if (vendorDoc.cashbackRate === undefined || vendorDoc.cashbackRate === null || Number.isNaN(Number(vendorDoc.cashbackRate))) {
    missing.push('Customer Cashback Percentage (%)');
  }
  if (!vendorDoc.address?.fullAddress?.trim()) missing.push('Business Address');
  if (!vendorDoc.address?.city?.trim()) missing.push('City');
  if (!vendorDoc.address?.state?.trim()) missing.push('State');
  if (!vendorDoc.address?.pincode?.trim()) missing.push('Pincode');
  if (!vendorDoc.location?.coordinates || vendorDoc.location.coordinates.length !== 2) {
    missing.push('Business Location (map pin)');
  }
  if (!vendorDoc.documents?.aadhaarPan?.fileUrl) missing.push('Owner ID / KYC document');
  if (!vendorDoc.documents?.shopLicense?.fileUrl) missing.push('Business/Shop Registration document');
  if (vendorDoc.shopType === 'Chain & Brand' && !vendorDoc.documents?.gstCertificate?.fileUrl) {
    missing.push('GST Certificate (required for Chain & Brand)');
  }

  return missing;
}
