import logger from './logger.js';

// Sends a 4-digit OTP via MSG91's Flow (template) API.
//
// MSG91_AUTH_KEY + MSG91_TEMPLATE_ID must be set once you have an MSG91
// account with a DLT-approved OTP template (India requires DLT registration
// for transactional SMS). Until those are configured:
//   - in development, the OTP is logged to the server console instead of
//     being sent, so local/dev testing keeps working without a real account.
//   - in production, sending throws instead of silently no-op'ing — an
//     unconfigured SMS provider in production must never look like success.
export const sendOtpSms = async (phone, otp) => {
  if (process.env.USE_DEFAULT_OTP === 'true') {
    logger.warn(`[OTP] Default OTP mode enabled — OTP for ${phone}: ${otp}`);
    return { delivered: true, dev: true };
  }

  const authKey = process.env.MSG91_AUTH_KEY;
  const templateId = process.env.MSG91_TEMPLATE_ID;

  if (!authKey || !templateId) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('MSG91_AUTH_KEY / MSG91_TEMPLATE_ID are not configured — cannot send OTP in production');
    }
    logger.warn(`[DEV OTP] MSG91 not configured — OTP for ${phone}: ${otp}`);
    return { delivered: false, dev: true };
  }

  const mobile = phone.startsWith('91') ? phone : `91${phone}`;

  const response = await fetch('https://control.msg91.com/api/v5/flow/', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      authkey: authKey,
    },
    body: JSON.stringify({
      template_id: templateId,
      short_url: '0',
      recipients: [{ mobiles: mobile, OTP: otp }],
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.type === 'error') {
    logger.error(`[sendOtpSms] MSG91 failed for ${phone}: ${JSON.stringify(result)}`);
    throw new Error(result.message || 'Failed to send OTP SMS');
  }

  return { delivered: true, dev: false };
};
