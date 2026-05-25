import { apiRequest } from './api';

export function getRevenuePlans(token, role) {
  return apiRequest('/revenue/plans', {
    token,
    query: role ? { role } : undefined,
  });
}

export function subscribePlan(token, planType) {
  return apiRequest('/revenue/subscribe', {
    method: 'POST',
    token,
    body: { plan_type: planType },
  });
}

export function getMySubscription(token) {
  return apiRequest('/revenue/subscription/me', { token });
}

export function getRideQuote(token, baseFare, rideType) {
  return apiRequest('/revenue/ride/quote', {
    method: 'POST',
    token,
    body: { base_fare: baseFare, ride_type: rideType },
  });
}

export function markPriorityRide(token, bookingId) {
  return apiRequest('/revenue/priority-ride', {
    method: 'POST',
    token,
    body: { booking_id: bookingId },
  });
}

export function getActiveAds(token, placement = 'home_banner') {
  return apiRequest('/revenue/ads/active', {
    token,
    query: { placement },
  });
}

export function recordAdImpression(token, adId) {
  return apiRequest(`/revenue/ads/${adId}/impression`, {
    method: 'POST',
    token,
  });
}

export function recordAdClick(token, adId) {
  return apiRequest(`/revenue/ads/${adId}/click`, {
    method: 'POST',
    token,
  });
}

export function getWallet(token) {
  return apiRequest('/revenue/wallet/me', { token });
}

export function getReferral(token) {
  return apiRequest('/revenue/referral/me', { token });
}

export function applyReferral(token, referralCode) {
  return apiRequest('/revenue/referral/apply', {
    method: 'POST',
    token,
    body: { referral_code: referralCode },
  });
}
