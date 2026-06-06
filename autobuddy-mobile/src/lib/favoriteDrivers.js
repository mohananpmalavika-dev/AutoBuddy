export function normalizeFavoriteDriversPayload(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (Array.isArray(payload?.data)) {
    return payload.data;
  }
  if (Array.isArray(payload?.favorites)) {
    return payload.favorites;
  }
  if (Array.isArray(payload?.drivers)) {
    return payload.drivers;
  }
  if (Array.isArray(payload?.driver_ids)) {
    return payload.driver_ids.map((driverId) => ({ driver_id: driverId }));
  }
  return [];
}

export function getFavoriteDriverIds(payload) {
  return normalizeFavoriteDriversPayload(payload)
    .map((item) => item?.driver_id || item?.driverId || item?.id)
    .filter(Boolean);
}
