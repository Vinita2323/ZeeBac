export const isFoodSector = (category = '', subCategory = '') => {
  if (!category && !subCategory) return false;
  const foodKeywords = [
    'food', 'grocery', 'fmcg', 'dairy', 'restaurant', 'cafe', 'bakery',
    'sweet', 'snack', 'beverage', 'drink', 'spice', 'meat', 'fish',
    'agriculture', 'grain', 'edible', 'confectionery', 'tea', 'coffee'
  ];
  const text = `${category || ''} ${subCategory || ''}`.toLowerCase();
  return foodKeywords.some(kw => text.includes(kw));
};

export const isManufacturerOrWholesaler = (businessType) => {
  if (!businessType) return false;
  const t = String(businessType).trim().toLowerCase();
  return t === 'manufacturer' || t === 'wholesaler' || t === 'distributor';
};

