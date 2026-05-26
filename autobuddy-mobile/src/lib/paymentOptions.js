export function normalizeAdminPaymentOptions(rawOptions = {}) {
  const qrEnabled = Boolean(rawOptions?.enable_qr);
  const razorpayEnabled = Boolean(rawOptions?.enable_razorpay);
  const upiId = String(rawOptions?.registration_upi_id || rawOptions?.upi_id || '').trim();
  const upiEnabled = Boolean(rawOptions?.enable_upi) || Boolean(upiId);
  const qrCodeUrl = String(rawOptions?.registration_qr_code_url || rawOptions?.qr_code_url || '').trim();
  const razorpayPaymentLink = String(rawOptions?.razorpay_payment_link || '').trim();

  const methods = [];
  if (qrEnabled) {
    methods.push({ key: 'qr', label: 'QR' });
  }
  if (upiEnabled) {
    methods.push({ key: 'upi', label: 'UPI' });
  }
  if (razorpayEnabled) {
    methods.push({ key: 'razorpay', label: 'Razorpay' });
  }

  return {
    methods,
    qrEnabled,
    upiEnabled,
    razorpayEnabled,
    upiId,
    qrCodeUrl,
    razorpayPaymentLink,
  };
}

export function requiresUtrForPaymentMethod(method) {
  const normalized = String(method || '').trim().toLowerCase();
  return normalized === 'qr' || normalized === 'upi';
}
