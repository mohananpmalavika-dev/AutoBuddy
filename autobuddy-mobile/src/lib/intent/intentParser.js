// Rule-based intent parser (MVP)
// Transforms user utterance into a structured intent that the booking UI can convert
// into pickup/destination + preferred ride product.
//
// Handles WhatsApp-style queries like:
//   "Book an auto to Kollam railway station"
//   "Book a taxi from Kollam to Trivandrum"
//   "Go to the railway station"
//   "Need an auto from here to Kazhakootam"
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

/** Normalise text for matching */
function normalizeText(input) {
  return String(input || '')
    .toLowerCase()
    .replace(/[\u2019']/g, "'")
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/** Return first candidate string found in text, or null */
function pickFirstMatched(text, candidates) {
  for (const c of candidates) {
    if (text.includes(c)) return c;
  }
  return null;
}

/**
 * Extract vehicle / ride-type hint.
 * Returns { rideProduct?: string, preferredVehicleHint?: string }
 */
function extractRidePreference(normalized) {
  // Ride-product-level hints
  if (/(women|female driver|women only|ladies|സ്ത്രീ|വനിത)/i.test(normalized)) {
    return { rideProduct: 'women_only' };
  }
  if (/(pool|share|ഷെയർ|പൂൾ)/i.test(normalized)) {
    return { rideProduct: 'pool' };
  }
  if (/(airport|എയർപോർട്ട്|വിമാനത്താവളം)/i.test(normalized)) {
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

  // Vehicle-type hints
  if (/(auto|rickshaw|tuk|ഓട്ടോ|റിക്ഷ)/i.test(normalized)) {
    return { preferredVehicleHint: 'auto' };
  }
  if (/(cab|taxi|car|ക്യാബ്|ടാക്സി|കാർ)/i.test(normalized)) {
    return { preferredVehicleHint: 'taxi' };
  }
  if (/(bus|mini bus)/i.test(normalized)) {
    return { preferredVehicleHint: 'bus' };
  }
  if (/(xl|suv|innova)/i.test(normalized)) {
    return { preferredVehicleHint: 'xl' };
  }
  if (/(traveller|tempo|van)/i.test(normalized)) {
    return { preferredVehicleHint: 'traveller' };
  }
  if (/(truck|lorry|lory|goods)/i.test(normalized)) {
    return { preferredVehicleHint: 'truck' };
  }
  if (/(mini truck|pickup)/i.test(normalized)) {
    return { preferredVehicleHint: 'minitruck' };
  }

  return {};
}

/**
 * Extract the destination text from an utterance.
 * Looks for patterns like "to X", "to the X", "need a ride to X".
 */
function extractDestinationFromText(normalized, fallback = '') {
  // Priority 1: explicit "to <destination>" at end of utterance
  const toPatterns = [
    /(?:to|towards|for|drop at|drop to|go to|book to|need to|heading to|reach)\s+(?:the\s+|a\s+|an\s+)?(.+)$/i,
    /(.+?)(?:ലേക്ക്|ിലേക്ക്|വരെ|ക്ക്)(?:\s+.*)?$/i,
  ];
  for (const p of toPatterns) {
    const m = normalized.match(p);
    if (m && m[1] && m[1].trim()) {
      return m[1].trim();
    }
  }

  // Priority 2: utterance is just a place name (e.g. "kollam railway station")
  // Return the whole thing if it looks like a destination
  if (normalized.length > 3) {
    return normalized;
  }

  return normalizeText(fallback ? `${fallback} ${normalized}` : normalized);
}

/**
 * Extract the pickup location if specified.
 * Looks for patterns like "from X".
 */
function extractPickupFromText(normalized) {
  const fromPatterns = [
    /(?:from|pickup from|pick me up from|start from)\s+(?:the\s+|a\s+|an\s+)?(.+?)(?:\s+(?:to|towards|for|drop at|drop to|go to|book to|heading to|reach)\s+.*)?$/i,
  ];
  for (const p of fromPatterns) {
    const m = normalized.match(p);
    if (m && m[1] && m[1].trim()) {
      return m[1].trim();
    }
  }
  return null;
}

/** Classify the type of destination place */
function classifyIntent(normalized) {
  const officeHints = ['office', 'work', 'colleagues', 'company', 'ഓഫീസ്', 'ജോലി'];
  const homeHints = ['home', 'house', 'household', 'my place', 'വീട്'];
  const airportHints = ['airport', 'air port', 't2', 't1', 'terminal', 'എയർപോർട്ട്', 'വിമാനത്താവളം'];
  const railwayHints = ['railway station', 'railway', 'station', 'bus stand', 'bus station', 'terminal', 'റെയിൽവേ', 'സ്റ്റേഷൻ', 'ബസ് സ്റ്റാൻഡ്'];
  const hospitalHints = ['hospital', 'clinic', 'doctor', 'ആശുപത്രി', 'ക്ലിനിക്', 'ഡോക്ടർ'];
  const shoppingHints = ['shopping', 'mall', 'lulu', 'supermarket', 'market', 'മാൾ', 'മാർക്കറ്റ്'];

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

/**
 * Build a human-readable destination label from the intent and raw text.
 */
function buildDestinationLabel(intentType, destinationText, raw) {
  if (destinationText && destinationText.length > 0) {
    return destinationText.charAt(0).toUpperCase() + destinationText.slice(1);
  }
  // Fallback to intent-based label
  const labels = {
    airport: 'Airport',
    railway_station: 'Railway Station',
    hospital: 'Hospital',
    shopping: 'Shopping Centre',
    office: 'Office',
    home: 'Home',
  };
  return labels[intentType] || raw || 'Unknown destination';
}

/**
 * Parse a full utterance into a structured booking intent.
 *
 * @param {string} utterance - The raw voice text.
 * @returns {{
 *   intentType: string,
 *   pickupText: string|null,
 *   destinationText: string,
 *   destinationLabel: string,
 *   rideProductPreference?: string,
 *   preferredVehicleHint?: string,
 *   raw: string,
 *   displaySummary: string
 * }}
 */
export function parseIntent(utterance) {
  const raw = String(utterance || '').trim();
  const normalized = normalizeText(raw);

  // 1. Extract vehicle/ride hints first
  const ridePref = extractRidePreference(normalized);

  // 2. Extract pickup (if explicitly stated)
  const pickupText = extractPickupFromText(normalized);

  // 3. Extract destination
  const destinationText = extractDestinationFromText(normalized, raw);

  // 4. Classify the destination type
  const intentType = classifyIntent(normalized);

  // 5. Build human-readable destination label
  const destinationLabel = buildDestinationLabel(
    intentType,
    destinationText,
    raw,
  );

  // 6. Build a short display summary
  const parts = [];
  if (ridePref.preferredVehicleHint) {
    const vehicleNames = {
      auto: '🛺 Auto',
      taxi: '🚖 Taxi',
      bus: '🚌 Bus',
      xl: '🚗 XL',
      traveller: '🚐 Traveller',
      truck: '🚛 Truck',
      minitruck: '🚚 Mini Truck',
    };
    parts.push(vehicleNames[ridePref.preferredVehicleHint] || ridePref.preferredVehicleHint);
  } else if (ridePref.rideProduct) {
    parts.push(ridePref.rideProduct.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()));
  } else {
    parts.push('🚗 Ride');
  }
  if (pickupText) {
    parts.push(`from ${pickupText.charAt(0).toUpperCase() + pickupText.slice(1)}`);
  }
  parts.push(`to ${destinationLabel}`);

  return {
    intentType: INTENT_TYPES.includes(intentType) ? intentType : 'custom',
    pickupText,           // null if not specified (assume current location)
    destinationText,      // always present when utterance is non-empty
    destinationLabel,     // human-readable destination name
    rideProductPreference: ridePref.rideProduct || null,
    preferredVehicleHint: ridePref.preferredVehicleHint || null,
    raw,
    displaySummary: parts.join(' '),
  };
}

/**
 * Quick check whether an utterance looks like a booking intent.
 * Returns true if it contains destination-like keywords or patterns.
 */
export function looksLikeBookingIntent(utterance) {
  const normalized = normalizeText(utterance || '');
  if (normalized.length < 4) return false;

  const bookingKeywords = [
    'book', 'ride', 'auto', 'taxi', 'cab', 'car', 'go to', 'need',
    'pick me', 'drop', 'reach', 'travel', 'station', 'airport',
    'bus', 'take me', 'heading', 'to ',
    'ബുക്ക്', 'റൈഡ്', 'ഓട്ടോ', 'ക്യാബ്', 'ടാക്സി', 'കാർ',
    'പോകണം', 'വരെ', 'ലേക്ക്', 'സ്റ്റേഷൻ', 'എയർപോർട്ട്',
  ];
  return bookingKeywords.some((kw) => normalized.includes(kw));
}
