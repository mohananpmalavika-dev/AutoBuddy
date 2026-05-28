/**
 * Retry utilities with exponential backoff
 */

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_INITIAL_DELAY_MS = 500;
const DEFAULT_MAX_DELAY_MS = 10000;
const DEFAULT_BACKOFF_MULTIPLIER = 2;

/**
 * Retry with exponential backoff
 */
export async function retryWithBackoff(
  fn,
  options = {}
) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    backoffMultiplier = DEFAULT_BACKOFF_MULTIPLIER,
    onRetry = null,
  } = options;

  let lastError;
  let delayMs = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === maxRetries) {
        break;
      }

      // Call retry callback
      if (onRetry) {
        onRetry(attempt + 1, delayMs, error);
      }

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delayMs));

      // Increase delay for next retry
      delayMs = Math.min(delayMs * backoffMultiplier, maxDelayMs);
    }
  }

  throw lastError;
}

/**
 * Retry with jitter (adds randomness to prevent thundering herd)
 */
export async function retryWithJitter(
  fn,
  options = {}
) {
  const {
    maxRetries = DEFAULT_MAX_RETRIES,
    initialDelayMs = DEFAULT_INITIAL_DELAY_MS,
    maxDelayMs = DEFAULT_MAX_DELAY_MS,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      // Exponential backoff with jitter
      const baseDelay = Math.min(initialDelayMs * Math.pow(2, attempt), maxDelayMs);
      const jitter = Math.random() * baseDelay;
      const delayMs = Math.min(baseDelay + jitter, maxDelayMs);

      if (onRetry) {
        onRetry(attempt + 1, delayMs, error);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

/**
 * Determine if error is retriable
 */
export function isRetriableError(error) {
  const status = Number(error?.status || error?.response?.status || 0);
  const message = String(error?.message || error?.toString() || '').toLowerCase();

  // Network-related errors
  if (status === 0 || message.includes('network')) {
    return true;
  }

  // Server errors
  if (status >= 500) {
    return true;
  }

  // Rate limiting
  if (status === 429) {
    return true;
  }

  // Timeout
  if (status === 408 || message.includes('timeout')) {
    return true;
  }

  // Service unavailable
  if (status === 503) {
    return true;
  }

  return false;
}

/**
 * Get retry delay for specific error
 */
export function getRetryDelayForError(error) {
  const status = Number(error?.status || error?.response?.status || 0);

  // Rate limiting - usually has Retry-After header
  if (status === 429) {
    const retryAfter = error?.response?.headers?.['retry-after'];
    if (retryAfter) {
      return parseInt(retryAfter) * 1000;
    }
    return 5000; // Default 5 seconds
  }

  // Server busy
  if (status === 503) {
    return 3000; // 3 seconds
  }

  // Timeout
  if (status === 408) {
    return 2000; // 2 seconds
  }

  // Default
  return 1000; // 1 second
}
