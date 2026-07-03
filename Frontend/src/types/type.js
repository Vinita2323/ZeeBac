/**
 * @typedef {Object} Location
 * @property {Object} coordinates
 * @property {number} coordinates.latitude
 * @property {number} coordinates.longitude
 * @property {string} address
 * @property {string} city
 * @property {string} state
 * @property {string} pincode
 */

/**
 * @typedef {Object} User
 * @property {string} _id
 * @property {string} zeebacId
 * @property {string} name
 * @property {string} phone
 * @property {string} [email]
 * @property {string} role - 'customer'
 * @property {string} [profileImage]
 * @property {Location} [location]
 * @property {string} status - 'Active' | 'Suspended' | 'Banned'
 */

/**
 * @typedef {Object} Vendor
 * @property {string} _id
 * @property {string} zeebacId
 * @property {string} storeName
 * @property {string} ownerName
 * @property {string} phone
 * @property {string} shopType - 'Independent Store' | 'Chain & Brand'
 * @property {string} category
 * @property {string} role - 'vendor'
 * @property {string} status - 'Pending' | 'Verified' | 'Rejected' | 'Suspended'
 * @property {Object} [stats]
 * @property {string} [profilePic]
 */

/**
 * @typedef {Object} Admin
 * @property {string} _id
 * @property {string} name
 * @property {string} role - 'admin' | 'super_admin'
 * @property {string[]} permissions
 */

/**
 * @typedef {Object} AuthResponse
 * @property {boolean} success
 * @property {string} accessToken
 * @property {string} refreshToken
 * @property {User} [user]
 * @property {Vendor} [vendor]
 * @property {Admin} [admin]
 */

export {};
