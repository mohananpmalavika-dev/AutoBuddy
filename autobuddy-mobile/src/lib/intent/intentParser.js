// Rule-based intent parser (MVP)
// Transforms user utterance into a structured intent that the booking UI can convert
// into pickup/destination + preferred ride product.
//
// Later, this module can call a real AI service; keep the return shape stable.

const INTENT_TYPES = [
  'office',
  'home',
  'airport',
  'railway_station',
  'hospital',
  'shopping',
  'custom',
];

function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function pickFirstMatched(destinationText, candidates) {
  const text = destinationText;
  for (const c of candidates) {
    if (text.includes(c)) return c;
  }
  return null;
}

function extractDestinationFromText(normalized, fallback = '') {
  // Very lightweight extraction: after common verbs, take the remainder
  // or text after keywords like "to" / "for".
  const patterns = [
    /(?:to|towards|for|drop at|drop to|go to|book to|need to)\s+(.+)$/i,
    /(?:station|railway station|railway|airport|hospital|shopping|mall)\s+(.+)$/i,
  ];
  for (const p of patterns) {
    const m = normalized.match(p);
    if (m && m[1]) {
      return m[1].trim();
    }
  }

  // If user says "kollam railway station" without verbs, keep entire text.
  // But strip leading generic phrases.
  return normalizeText(fallback ? `${fallback} ${normalized}` : normalized);
}

function classifyIntent(normalized) {
  const officeHints = ['office', 'work', 'colleagues', 'company'];
  const homeHints = ['home', 'house', 'household', 'my place'];
  const airportHints = ['airport', 'air port'];
  const railwayHints = ['railway station', 'railway', 'station', 'bus stand', 'bus station'];
  const hospitalHints = ['hospital', 'clinic'];
  const shoppingHints = ['shopping', 'mall', 'lulu', 'supermarket'];

  const intent =
    pickFirstMatched(normalized, officeHints) ? 'office'
    : pickFirstMatched(normalized, homeHints) ? 'home'
    : pickFirstMatched(normalized, airportHints) ? 'airport'
    : pickFirstMatched(normalized, railwayHints) ? 'railway_station'
    : pickFirstMatched(normalized, hospitalHints) ? 'hospital'
    : pickFirstMatched(normalized, shoppingHints) ? 'shopping'
    : 'custom';

  return intent;
}

function extractRidePreference(normalized) {
  // Map utterances to our existing ride products.
  // MVP heuristics:
  // - "auto" -> likely normal/ev_auto (we don't decide exact vehicle type here)
  // - "cab" / "car" -> normal
  // - "pool" / "share" -> pool
  // - "women" / "female" -> women_only
  // - "airport" keyword usually airport product
  // - "hospital" usually instant (or whatever backend maps). Keep generic.

  if (/(women|female driver|women only|ladies)/i.test(normalized)) {
    return { rideProduct: 'women_only' };
  }
  if (/(pool|share)/i.test(normalized)) {
    return { rideProduct: 'pool' };
  }
  if (/(airport)/i.test(normalized)) {
    return { rideProduct: 'airport' };
  }
  if (/(intercity|outstation|to\s+another\s+city)/i.test(normalized)) {
    return { rideProduct: 'intercity' };
  }
  if (/(tour|sightseeing|tourism)/i.test(normalized)) {
    return { rideProduct: 'tourism' };
  }
  if (/(school|pickup for school)/i.test(normalized)) {
    return { rideProduct: 'school_elderly_safe' };
  }

  if (/(auto)/i.test(normalized)) {
    return { preferredVehicleHint: 'auto' };
  }
  if (/(cab|taxi|car)/i.test(normalized)) {
    return { preferredVehicleHint: 'taxi' };
  }
  return {};
}

/**
 * @param {string} utterance
 * @returns {{
 *   intentType: string,
 *   destinationText: string,
 *   rideProductPreference?: string,
 *   preferredVehicleHint?: string,
 *   raw: string
 * }}
 */
export function parseIntent(utterance) {
  const raw = String(utterance || '').trim();
  const normalized = normalizeText(raw);

  const intentType = classifyIntent(normalized);
  const destinationText = extractDestinationFromText(normalized, raw);
  const ridePref = extractRidePreference(normalized);

  return {
    intentType: INTENT_TYPES.includes(intentType) ? intentType : 'custom',
    destinationText,
    rideProductPreference: ridePref.rideProduct,
    preferredVehicleHint: ridePref.preferredVehicleHint,
    raw,
  };
}

