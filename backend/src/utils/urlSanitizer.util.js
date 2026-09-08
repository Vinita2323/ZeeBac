/**
 * Utility to safely sanitize media URLs on retrieval.
 * Legacy records in MongoDB may still contain local paths like '/uploads/...',
 * but those files no longer exist on VPS/Cloudinary.
 *
 * This sanitizer returns `null` for legacy missing local paths so the API
 * response doesn't emit broken URLs, while keeping the original MongoDB
 * database records completely intact without mutating them.
 */
export const sanitizeMediaUrl = (url) => {
  if (!url || typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('uploads/')) {
    return null;
  }
  return trimmed;
};

/**
 * Sanitizes an array of media URLs, removing any legacy local missing URLs.
 */
export const sanitizeMediaUrlList = (urls) => {
  if (!Array.isArray(urls)) return urls;
  return urls
    .map(sanitizeMediaUrl)
    .filter((u) => u !== null && u !== undefined);
};
