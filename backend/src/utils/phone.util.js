/**
 * Utility functions for parsing, normalizing, and extracting Indian mobile numbers
 * from UPI gateway payloads (PhonePe, Paytm, Google Pay, BHIM, etc.).
 */

/**
 * Normalizes an Indian mobile number into a clean 10-digit string.
 * Strips out prefixes (+91, 91, 0), spaces, dashes, and special characters.
 * Validates that the number starts with 6, 7, 8, or 9.
 *
 * @param {string|number} rawPhone
 * @returns {string|null} 10-digit phone string or null if invalid
 */
export const cleanIndianPhoneNumber = (rawPhone) => {
  if (!rawPhone) return null;
  const digits = String(rawPhone).replace(/\D/g, '');

  let phone10 = null;
  if (digits.length === 10) {
    phone10 = digits;
  } else if (digits.length === 12 && digits.startsWith('91')) {
    phone10 = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    phone10 = digits.slice(1);
  } else if (digits.length > 10) {
    // If has country code with more digits, inspect the last 10
    const last10 = digits.slice(-10);
    if (/^[6-9]\d{9}$/.test(last10)) {
      phone10 = last10;
    }
  }

  if (phone10 && /^[6-9]\d{9}$/.test(phone10)) {
    return phone10;
  }
  return null;
};

/**
 * Extracts a customer's 10-digit mobile number from a payment gateway entity
 * (Razorpay / UPI webhook payload).
 *
 * Strategies:
 * 1. payment.contact (Standard on Google Pay, Cards, and Gateway Checkout)
 * 2. payment.vpa prefix (Near 100% match on PhonePe @ybl/@axl/@ibl and Paytm @paytm/@ptyes)
 * 3. payment.notes.customerPhone or payment.notes.phone
 *
 * @param {object} payment - Razorpay payment entity
 * @returns {string|null} Clean 10-digit phone number or null
 */
export const extractCustomerPhoneFromUpi = (payment) => {
  if (!payment) return null;

  // 1. Direct contact number from gateway
  if (payment.contact) {
    const cleaned = cleanIndianPhoneNumber(payment.contact);
    if (cleaned) return cleaned;
  }

  // 2. Extract from UPI VPA (Virtual Payment Address)
  // PhonePe: 93358XXXXX@ybl, 93358XXXXX@axl, 93358XXXXX@ibl
  // Paytm: 93358XXXXX@paytm, 93358XXXXX@ptyes, 93358XXXXX@ptaxis
  // BHIM/Bank: 93358XXXXX@upi, 93358XXXXX@okhdfcbank
  if (payment.vpa && typeof payment.vpa === 'string') {
    const prefix = payment.vpa.split('@')[0];
    const cleanedFromVpa = cleanIndianPhoneNumber(prefix);
    if (cleanedFromVpa) return cleanedFromVpa;
  }

  // 3. Fallback: Notes metadata if provided
  const notes = payment.notes || {};
  if (notes.customerPhone || notes.phone || notes.contact) {
    const cleanedFromNotes = cleanIndianPhoneNumber(notes.customerPhone || notes.phone || notes.contact);
    if (cleanedFromNotes) return cleanedFromNotes;
  }

  return null;
};
