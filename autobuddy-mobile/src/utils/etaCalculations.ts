import { OptimizedRoute, Stop } from '../hooks/useRouteOptimization';

const LOG_ETA = true;
const logETA = (message: string, data?: any) => {
  if (LOG_ETA && typeof console !== 'undefined') {
    console.log(`[etaCalculations] ${message}`, data || '');
  }
};

interface ETACalculationInput {
  distance: number;
  duration: number;
  trafficLevel: 'low' | 'moderate' | 'high' | 'severe';
  trafficDelay: number;
  hasToll: boolean;
  stopCount: number;
}

interface ETAResult {
  baseETA: number;
  trafficAdjustment: number;
  tollAdjustment: number;
  totalETA: number;
  confidence: 'high' | 'medium' | 'low';
}

const TRAFFIC_MULTIPLIERS = {
  low: 1.0,
  moderate: 1.3,
  high: 1.8,
  severe: 2.5,
};

const AVERAGE_STOP_TIME_SECONDS = 90;
const TOLL_TIME_SAVINGS = 300;

export class ETACalculator {
  static calculateETA(input: ETACalculationInput): ETAResult {
    const {
      distance,
      duration,
      trafficLevel,
      trafficDelay,
      hasToll,
      stopCount,
    } = input;

    const baseETA = duration + stopCount * AVERAGE_STOP_TIME_SECONDS;

    const trafficMultiplier = TRAFFIC_MULTIPLIERS[trafficLevel] || 1.0;
    const trafficAdjustment =
      trafficDelay + (baseETA - duration) * (trafficMultiplier - 1);

    const tollAdjustment = hasToll ? -TOLL_TIME_SAVINGS : 0;

    const totalETA = baseETA + trafficAdjustment + tollAdjustment;

    const confidence = this.calculateConfidence(trafficLevel, stopCount);

    const result: ETAResult = {
      baseETA,
      trafficAdjustment,
      tollAdjustment,
      totalETA: Math.max(0, totalETA),
      confidence,
    };

    logETA('ETA calculated', result);
    return result;
  }

  static calculateFromRoute(route: OptimizedRoute): ETAResult {
    const input: ETACalculationInput = {
      distance: route.totalDistance,
      duration: route.estimatedDuration,
      trafficLevel: route.traffic.level as any,
      trafficDelay: route.traffic.delay,
      hasToll: (route as any).hasToll || false,
      stopCount: route.stops.length,
    };

    return this.calculateETA(input);
  }

  static formatETADisplay(etaSeconds: number): string {
    const minutes = Math.round(etaSeconds / 60);
    if (minutes < 1) {return '<1 min';}
    if (minutes === 1) {return '1 min';}
    return `${minutes} min`;
  }

  static formatETAWithConfidence(etaSeconds: number, confidence: string): string {
    const formatted = this.formatETADisplay(etaSeconds);
    if (confidence === 'high') {return `~${formatted}`;}
    if (confidence === 'medium') {return `~${formatted} (±5 min)`;}
    return `~${formatted} (±10 min)`;
  }

  static getTrafficImpactText(trafficAdjustment: number): string {
    const minutes = Math.round(trafficAdjustment / 60);
    if (minutes === 0) {return 'No traffic delay';}
    if (minutes < 0) {return `${Math.abs(minutes)} min faster`;}
    return `${minutes} min slower`;
  }

  static calculateConfidence(
    trafficLevel: string,
    stopCount: number
  ): 'high' | 'medium' | 'low' {
    if (trafficLevel === 'low' && stopCount <= 3) {return 'high';}
    if (trafficLevel === 'moderate' && stopCount <= 5) {return 'medium';}
    if (trafficLevel === 'severe' || stopCount > 8) {return 'low';}
    return 'medium';
  }

  static calculateETARange(
    eta: number,
    confidence: string
  ): { min: number; max: number } {
    const variance =
      confidence === 'high' ? 120 : confidence === 'medium' ? 300 : 600;
    return {
      min: Math.max(0, eta - variance),
      max: eta + variance,
    };
  }

  static predictETAWithTrendAnalysis(
    currentETA: number,
    trafficTrend: 'worsening' | 'stable' | 'improving'
  ): number {
    if (trafficTrend === 'worsening') {
      return currentETA * 1.15;
    }
    if (trafficTrend === 'improving') {
      return currentETA * 0.85;
    }
    return currentETA;
  }

  static compareRouteETAs(
    routes: OptimizedRoute[]
  ): { route: OptimizedRoute; eta: number; fastestDelta: number }[] {
    const calculations = routes.map((route) => ({
      route,
      eta: this.calculateFromRoute(route).totalETA,
    }));

    const fastestETA = Math.min(...calculations.map((c) => c.eta));

    return calculations.map((calc) => ({
      route: calc.route,
      eta: calc.eta,
      fastestDelta: calc.eta - fastestETA,
    }));
  }
}

export default ETACalculator;
