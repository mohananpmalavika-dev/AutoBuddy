import { apiRequest } from './api';

const TRUST_API_TIMEOUT_MS = 60000;

export function verifyAadhaar(token, aadhaarNumber) {
  return apiRequest('/driver-trust/aadhaar/verify', {
    method: 'POST',
    token,
    body: { aadhaar_number: aadhaarNumber },
    timeoutMs: TRUST_API_TIMEOUT_MS,
  });
}

export function verifySelfie(token, payload) {
  return apiRequest('/driver-trust/selfie/verify', {
    method: 'POST',
    token,
    body: payload,
    timeoutMs: TRUST_API_TIMEOUT_MS,
  });
}

export function runKycAiReview(token) {
  return apiRequest('/driver-trust/kyc-ai/review', {
    method: 'POST',
    token,
    timeoutMs: TRUST_API_TIMEOUT_MS,
  });
}

export function getMyDriverTrustScore(token) {
  return apiRequest('/driver-trust/score/me', { token, timeoutMs: TRUST_API_TIMEOUT_MS });
}

export function createDriverComplaint(token, payload) {
  return apiRequest('/driver-trust/complaints', {
    method: 'POST',
    token,
    body: payload,
    timeoutMs: TRUST_API_TIMEOUT_MS,
  });
}
