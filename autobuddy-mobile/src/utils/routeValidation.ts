import { OptimizedRoute, NavigationStep, Stop } from '../hooks/useRouteOptimization';

const LOG_VALIDATION = true;
const logValidation = (message: string, data?: any) => {
  if (LOG_VALIDATION && typeof console !== 'undefined') {
    console.log(`[routeValidation] ${message}`, data || '');
  }
};

const logValidationError = (message: string, data?: any) => {
  if (typeof console !== 'undefined') {
    console.error(`[routeValidation ERROR] ${message}`, data || '');
  }
};

export interface ValidationResult<T> {
  valid: boolean;
  data?: T;
  errors: string[];
}

export class RouteValidator {
  static validateOptimizedRoute(route: any): ValidationResult<OptimizedRoute> {
    const errors: string[] = [];

    if (!route || typeof route !== 'object') {
      errors.push('Route is not an object');
      return { valid: false, errors };
    }

    const requiredFields = ['id', 'stops', 'totalDistance', 'estimatedDuration', 'traffic'];
    for (const field of requiredFields) {
      if (!(field in route)) {
        errors.push(`Missing required field: '${field}'`);
      }
    }

    if (typeof route.id !== 'string' || !route.id.trim()) {
      errors.push('Route id must be a non-empty string');
    }

    if (!Array.isArray(route.stops)) {
      errors.push('Route stops must be an array');
    } else {
      if (route.stops.length === 0) {
        errors.push('Route must have at least one stop');
      }
      for (let i = 0; i < route.stops.length; i++) {
        const stop = route.stops[i];
        if (!stop.id || !stop.type || !stop.location || !stop.status) {
          errors.push(
            `Stop ${i}: missing required fields (id, type, location, status)`
          );
        }
        if (stop.type && !['pickup', 'dropoff'].includes(stop.type)) {
          errors.push(`Stop ${i}: invalid type '${stop.type}'`);
        }
        if (stop.location && (typeof stop.location.lat !== 'number' || typeof stop.location.lng !== 'number')) {
          errors.push(`Stop ${i}: location must have valid lat/lng coordinates`);
        }
        if (stop.status && !['pending', 'completed', 'cancelled'].includes(stop.status)) {
          errors.push(`Stop ${i}: invalid status '${stop.status}'`);
        }
      }
    }

    if (typeof route.totalDistance !== 'number' || route.totalDistance < 0) {
      errors.push('Route totalDistance must be a non-negative number');
    }

    if (typeof route.estimatedDuration !== 'number' || route.estimatedDuration < 0) {
      errors.push('Route estimatedDuration must be a non-negative number');
    }

    if (route.traffic) {
      if (!route.traffic.level || !['low', 'moderate', 'high', 'severe'].includes(route.traffic.level)) {
        errors.push(`Route traffic.level must be one of: low, moderate, high, severe (got '${route.traffic.level}')`);
      }
      if (typeof route.traffic.delay !== 'number' || route.traffic.delay < 0) {
        errors.push('Route traffic.delay must be a non-negative number');
      }
    } else {
      errors.push('Route traffic data is missing');
    }

    if (route.optimization) {
      if (typeof route.optimization.originalDistance !== 'number') {
        errors.push('Route optimization.originalDistance must be a number');
      }
      if (typeof route.optimization.savedDistance !== 'number') {
        errors.push('Route optimization.savedDistance must be a number');
      }
      if (typeof route.optimization.percentageOptimized !== 'number') {
        errors.push('Route optimization.percentageOptimized must be a number');
      }
    }

    if (route.polyline && typeof route.polyline !== 'string') {
      errors.push('Route polyline must be a string if provided');
    }

    if (route.estimatedFare && typeof route.estimatedFare !== 'number') {
      errors.push('Route estimatedFare must be a number if provided');
    }

    if (errors.length > 0) {
      logValidationError('OptimizedRoute validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('OptimizedRoute validation passed');
    return { valid: true, data: route as OptimizedRoute, errors: [] };
  }

  static validateNavigationStep(step: any): ValidationResult<NavigationStep> {
    const errors: string[] = [];

    if (!step || typeof step !== 'object') {
      errors.push('Navigation step is not an object');
      return { valid: false, errors };
    }

    if (typeof step.instruction !== 'string' || !step.instruction.trim()) {
      errors.push('Navigation step instruction must be a non-empty string');
    }

    if (typeof step.distance !== 'number' || step.distance < 0) {
      errors.push('Navigation step distance must be a non-negative number');
    }

    if (typeof step.duration !== 'number' || step.duration < 0) {
      errors.push('Navigation step duration must be a non-negative number');
    }

    if (step.maneuver && typeof step.maneuver !== 'string') {
      errors.push('Navigation step maneuver must be a string if provided');
    }

    if (errors.length > 0) {
      logValidationError('NavigationStep validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('NavigationStep validation passed');
    return { valid: true, data: step as NavigationStep, errors: [] };
  }

  static validateNavigationSteps(steps: any): ValidationResult<NavigationStep[]> {
    const errors: string[] = [];

    if (!Array.isArray(steps)) {
      errors.push('Navigation steps must be an array');
      return { valid: false, errors };
    }

    if (steps.length === 0) {
      errors.push('Navigation steps array must not be empty');
      return { valid: false, errors };
    }

    const validSteps: NavigationStep[] = [];
    for (let i = 0; i < steps.length; i++) {
      const result = this.validateNavigationStep(steps[i]);
      if (!result.valid) {
        errors.push(`Step ${i}: ${result.errors.join('; ')}`);
      } else {
        validSteps.push(result.data!);
      }
    }

    if (errors.length > 0) {
      logValidationError('NavigationSteps validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('NavigationSteps validation passed', { count: validSteps.length });
    return { valid: true, data: validSteps, errors: [] };
  }

  static validateTrafficData(traffic: any): ValidationResult<{ level: string; delay: number }> {
    const errors: string[] = [];

    if (!traffic || typeof traffic !== 'object') {
      errors.push('Traffic data is not an object');
      return { valid: false, errors };
    }

    if (!traffic.level || !['low', 'moderate', 'high', 'severe'].includes(traffic.level)) {
      errors.push(`Traffic level must be one of: low, moderate, high, severe (got '${traffic.level}')`);
    }

    if (typeof traffic.delay !== 'number' || traffic.delay < 0) {
      errors.push('Traffic delay must be a non-negative number');
    }

    if (errors.length > 0) {
      logValidationError('TrafficData validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('TrafficData validation passed');
    return { valid: true, data: traffic as { level: string; delay: number }, errors: [] };
  }

  static validateStop(stop: any): ValidationResult<Stop> {
    const errors: string[] = [];

    if (!stop || typeof stop !== 'object') {
      errors.push('Stop is not an object');
      return { valid: false, errors };
    }

    if (!stop.id || typeof stop.id !== 'string') {
      errors.push('Stop id must be a non-empty string');
    }

    if (!stop.type || !['pickup', 'dropoff'].includes(stop.type)) {
      errors.push(`Stop type must be one of: pickup, dropoff (got '${stop.type}')`);
    }

    if (!stop.location || typeof stop.location.lat !== 'number' || typeof stop.location.lng !== 'number') {
      errors.push('Stop location must have valid lat/lng coordinates');
    }

    if (!stop.status || !['pending', 'completed', 'cancelled'].includes(stop.status)) {
      errors.push(`Stop status must be one of: pending, completed, cancelled (got '${stop.status}')`);
    }

    if (stop.address && typeof stop.address !== 'string') {
      errors.push('Stop address must be a string if provided');
    }

    if (stop.passengerName && typeof stop.passengerName !== 'string') {
      errors.push('Stop passengerName must be a string if provided');
    }

    if (stop.passengerPhone && typeof stop.passengerPhone !== 'string') {
      errors.push('Stop passengerPhone must be a string if provided');
    }

    if (errors.length > 0) {
      logValidationError('Stop validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('Stop validation passed');
    return { valid: true, data: stop as Stop, errors: [] };
  }

  static validateStops(stops: any): ValidationResult<Stop[]> {
    const errors: string[] = [];

    if (!Array.isArray(stops)) {
      errors.push('Stops must be an array');
      return { valid: false, errors };
    }

    if (stops.length === 0) {
      errors.push('Stops array must contain at least one stop');
      return { valid: false, errors };
    }

    const validStops: Stop[] = [];
    for (let i = 0; i < stops.length; i++) {
      const result = this.validateStop(stops[i]);
      if (!result.valid) {
        errors.push(`Stop ${i}: ${result.errors.join('; ')}`);
      } else {
        validStops.push(result.data!);
      }
    }

    if (errors.length > 0) {
      logValidationError('Stops validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('Stops validation passed', { count: validStops.length });
    return { valid: true, data: validStops, errors: [] };
  }

  static validateFare(fare: any): ValidationResult<number> {
    const errors: string[] = [];

    if (typeof fare !== 'number') {
      errors.push('Fare must be a number');
    }

    if (fare < 0) {
      errors.push('Fare must be non-negative');
    }

    if (errors.length > 0) {
      logValidationError('Fare validation failed', errors);
      return { valid: false, errors };
    }

    logValidation('Fare validation passed', { fare });
    return { valid: true, data: fare, errors: [] };
  }
}
