import { describe, it, expect } from 'vitest';
import { sanitizeMediaUrl, sanitizeMediaUrlList } from './urlSanitizer.util.js';

describe('urlSanitizer.util', () => {
  it('returns null for legacy local upload paths starting with /uploads/', () => {
    expect(sanitizeMediaUrl('/uploads/profiles/test.jpg')).toBeNull();
    expect(sanitizeMediaUrl('/uploads/storefront/cover.png')).toBeNull();
    expect(sanitizeMediaUrl('/uploads/media/video.mp4')).toBeNull();
    expect(sanitizeMediaUrl('/uploads/receipts/bill.jpg')).toBeNull();
  });

  it('returns null for legacy local upload paths starting with uploads/', () => {
    expect(sanitizeMediaUrl('uploads/profiles/test.jpg')).toBeNull();
  });

  it('preserves valid Cloudinary and remote HTTPS URLs', () => {
    const cloudinaryUrl = 'https://res.cloudinary.com/zeebac/image/upload/v12345/profiles/pic.jpg';
    expect(sanitizeMediaUrl(cloudinaryUrl)).toBe(cloudinaryUrl);
  });

  it('handles null, undefined, or non-string values gracefully', () => {
    expect(sanitizeMediaUrl(null)).toBeNull();
    expect(sanitizeMediaUrl(undefined)).toBeUndefined();
    expect(sanitizeMediaUrl('')).toBe('');
  });

  it('sanitizes arrays of URLs by filtering out legacy local paths', () => {
    const mixed = [
      '/uploads/storefront/old1.jpg',
      'https://res.cloudinary.com/zeebac/image/upload/v1/storefront/new1.jpg',
      '/uploads/storefront/old2.jpg',
      'https://res.cloudinary.com/zeebac/image/upload/v1/storefront/new2.jpg',
    ];
    const sanitized = sanitizeMediaUrlList(mixed);
    expect(sanitized).toEqual([
      'https://res.cloudinary.com/zeebac/image/upload/v1/storefront/new1.jpg',
      'https://res.cloudinary.com/zeebac/image/upload/v1/storefront/new2.jpg',
    ]);
  });
});
