/**
 * Type Guards and Runtime Validation
 * 
 * Provides type guards and runtime validation for safe type assertions.
 * Prevents unsafe type assertions that can cause runtime errors.
 * 
 * Created as part of BUG-013 and BUG-014 fixes.
 */

/**
 * Type guard for checking if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Type guard for checking if value is a string
 */
export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for checking if value is a number
 */
export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && !isNaN(value) && isFinite(value);
}

/**
 * Type guard for checking if value is a boolean
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

/**
 * Type guard for checking if value is an array
 */
export function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/**
 * Type guard for non-empty string
 */
export function isNonEmptyString(value: unknown): value is string {
  return isString(value) && value.trim().length > 0;
}

/**
 * Type guard for positive number
 */
export function isPositiveNumber(value: unknown): value is number {
  return isNumber(value) && value > 0;
}

/**
 * Safe type assertion with validation
 * BUG-013 FIX: Use this instead of unsafe 'as' assertions
 */
export function assertType<T>(
  value: unknown,
  validator: (v: unknown) => v is T,
  errorMessage: string
): T {
  if (!validator(value)) {
    throw new TypeError(errorMessage);
  }
  return value;
}

/**
 * Safe object property access with type checking
 * BUG-013 FIX: Use this for dynamic property access
 */
export function getObjectProperty<T>(
  obj: unknown,
  key: string,
  validator: (v: unknown) => v is T
): T | undefined {
  if (!isObject(obj)) return undefined;
  const value = obj[key];
  return validator(value) ? value : undefined;
}

/**
 * Runtime prop validation for React components
 * BUG-014 FIX: Validate component props at runtime
 */
export interface PropValidation {
  isValid: boolean;
  errors: string[];
}

export function validateProps(
  props: Record<string, unknown>,
  schema: Record<string, (value: unknown) => boolean>
): PropValidation {
  const errors: string[] = [];

  for (const [key, validator] of Object.entries(schema)) {
    const value = props[key];
    if (!validator(value)) {
      errors.push(`Invalid prop '${key}': expected valid value, got ${typeof value}`);
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Common prop validators
 */
export const PropValidators = {
  requiredString: (v: unknown) => isNonEmptyString(v),
  optionalString: (v: unknown) => v === undefined || v === null || isString(v),
  requiredNumber: (v: unknown) => isNumber(v),
  optionalNumber: (v: unknown) => v === undefined || v === null || isNumber(v),
  requiredBoolean: (v: unknown) => isBoolean(v),
  optionalBoolean: (v: unknown) => v === undefined || v === null || isBoolean(v),
  requiredArray: (v: unknown) => isArray(v),
  optionalArray: (v: unknown) => v === undefined || v === null || isArray(v),
  requiredObject: (v: unknown) => isObject(v),
  optionalObject: (v: unknown) => v === undefined || v === null || isObject(v),
  requiredFunction: (v: unknown) => typeof v === 'function',
  optionalFunction: (v: unknown) => v === undefined || v === null || typeof v === 'function',
};

/**
 * Example usage for BUG-014:
 * 
 * const MyComponent = (props: MyProps) => {
 *   const validation = validateProps(props, {
 *     name: PropValidators.requiredString,
 *     age: PropValidators.optionalNumber,
 *     onPress: PropValidators.requiredFunction,
 *   });
 *   
 *   if (!validation.isValid) {
 *     console.error('Invalid props:', validation.errors);
 *   }
 *   
 *   // ... rest of component
 * };
 */
