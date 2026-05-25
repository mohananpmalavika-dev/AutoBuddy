import { apiRequest } from './api';

export function getKeralaEmergencyNumbers() {
  return apiRequest('/safety/emergency-numbers');
}

export function getSafetyMode(token) {
  return apiRequest('/safety/mode', { token });
}

export function updateSafetyMode(token, payload) {
  return apiRequest('/safety/mode', {
    method: 'PUT',
    token,
    body: payload,
  });
}

export function listTrustedContacts(token) {
  return apiRequest('/safety/trusted-contacts', { token });
}

export function addTrustedContact(token, payload) {
  return apiRequest('/safety/trusted-contacts', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function deleteTrustedContact(token, contactId) {
  return apiRequest(`/safety/trusted-contacts/${contactId}`, {
    method: 'DELETE',
    token,
  });
}

export function triggerSos(token, payload) {
  return apiRequest('/safety/sos', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function sendFamilyLocation(token, payload) {
  return apiRequest('/safety/family-location', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function saveAudioRecordingMetadata(token, payload) {
  return apiRequest('/safety/audio-recording', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function getMySafetyScore(token) {
  return apiRequest('/safety/score/me', { token });
}

export function getWomenSafetyMatches(token, payload) {
  return apiRequest('/safety/women-safety-match', {
    method: 'POST',
    token,
    body: payload,
  });
}
