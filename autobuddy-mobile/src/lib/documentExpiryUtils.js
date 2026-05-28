/**
 * Document expiry utilities for driver documents
 */

export const EXPIRY_WARNING_DAYS = 30;
export const EXPIRY_CRITICAL_DAYS = 7;

/**
 * Calculate days until expiry
 */
export function daysUntilExpiry(expiryDate) {
  if (!expiryDate) return null;
  const expiry = new Date(expiryDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  expiry.setHours(0, 0, 0, 0);
  
  const diffTime = expiry - today;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Get expiry status
 */
export function getExpiryStatus(expiryDate) {
  const days = daysUntilExpiry(expiryDate);
  
  if (days === null) return 'no_expiry';
  if (days < 0) return 'expired';
  if (days <= EXPIRY_CRITICAL_DAYS) return 'critical';
  if (days <= EXPIRY_WARNING_DAYS) return 'warning';
  return 'valid';
}

/**
 * Get expiry message
 */
export function getExpiryMessage(expiryDate) {
  const days = daysUntilExpiry(expiryDate);
  
  if (days === null) return 'No expiry date';
  if (days < 0) return `Expired ${Math.abs(days)} days ago`;
  if (days === 0) return 'Expires today';
  if (days === 1) return 'Expires tomorrow';
  return `Expires in ${days} days`;
}

/**
 * Get expiry color
 */
export function getExpiryColor(expiryDate) {
  const status = getExpiryStatus(expiryDate);
  
  switch (status) {
    case 'expired':
      return '#FF3B30'; // Red
    case 'critical':
      return '#FF9500'; // Orange
    case 'warning':
      return '#FFD60A'; // Yellow
    case 'valid':
      return '#34C759'; // Green
    default:
      return '#8E8E93'; // Gray
  }
}

/**
 * Check if any documents are expiring soon
 */
export function getExpiringDocuments(documents) {
  return documents
    .filter((doc) => doc.requires_expiry && doc.expiry_date)
    .filter((doc) => {
      const days = daysUntilExpiry(doc.expiry_date);
      return days !== null && days <= EXPIRY_WARNING_DAYS && days >= 0;
    })
    .sort((a, b) => daysUntilExpiry(a.expiry_date) - daysUntilExpiry(b.expiry_date));
}

/**
 * Check if any documents are expired
 */
export function getExpiredDocuments(documents) {
  return documents
    .filter((doc) => doc.requires_expiry && doc.expiry_date)
    .filter((doc) => {
      const days = daysUntilExpiry(doc.expiry_date);
      return days !== null && days < 0;
    });
}

/**
 * Get critical documents (expired or critical)
 */
export function getCriticalDocuments(documents) {
  return documents
    .filter((doc) => doc.requires_expiry && doc.expiry_date)
    .filter((doc) => {
      const days = daysUntilExpiry(doc.expiry_date);
      return days !== null && days <= EXPIRY_CRITICAL_DAYS;
    });
}

/**
 * Format expiry date for display
 */
export function formatExpiryDate(expiryDate) {
  if (!expiryDate) return 'No expiry';
  const date = new Date(expiryDate);
  if (Number.isNaN(date.getTime())) return String(expiryDate);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Get document status badge text
 */
export function getDocumentStatusText(doc) {
  if (doc.verification_status === 'rejected') return `❌ Rejected: ${doc.reject_reason}`;
  if (doc.verification_status === 'verified') {
    const days = daysUntilExpiry(doc.expiry_date);
    if (days !== null && days < 0) return `⚠️ Expired`;
    if (days !== null && days <= EXPIRY_CRITICAL_DAYS) return `⏰ Expires ${getExpiryMessage(doc.expiry_date)}`;
    if (days !== null && days <= EXPIRY_WARNING_DAYS) return `📅 Expires ${getExpiryMessage(doc.expiry_date)}`;
    return '✅ Verified';
  }
  return '⏳ Pending';
}
