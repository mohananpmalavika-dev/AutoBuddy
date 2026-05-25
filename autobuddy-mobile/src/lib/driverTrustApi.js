import { apiRequest } from './api';

export function verifyAadhaar(token, aadhaarNumber) {
  return apiRequest('/driver-trust/aadhaar/verify', {
    method: 'POST',
    token,
    body: { aadhaar_number: aadhaarNumber },
  });
}

export function verifySelfie(token, payload) {
  return apiRequest('/driver-trust/selfie/verify', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function runKycAiReview(token) {
  return apiRequest('/driver-trust/kyc-ai/review', {
    method: 'POST',
    token,
  });
}

export function getMyDriverTrustScore(token) {
  return apiRequest('/driver-trust/score/me', { token });
}

export function createDriverComplaint(token, payload) {
  return apiRequest('/driver-trust/complaints', {
    method: 'POST',
    token,
    body: payload,
  });
}
