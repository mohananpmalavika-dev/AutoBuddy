import { OptimizedRoute } from '../hooks/useRouteOptimization';

const LOG_TRAFFIC = true;
const logTraffic = (message: string, data?: any) => {
  if (LOG_TRAFFIC && typeof console !== 'undefined') {
    console.log(`[trafficPrediction] ${message}`, data || '');
  }
};

export interface TrafficReading {
  timestamp: number;
  level: 'low' | 'moderate' | 'high' | 'severe';
  delay: number;
}

export type TrafficTrend = 'worsening' | 'stable' | 'improving';

export interface TrafficPrediction {
  currentTrend: TrafficTrend;
  trendDirection: number;
  predictedETA: number;
  etaImpactMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  historicalPattern?: string;
}

const TRAFFIC_WEIGHTS = {
  low: 1.0,
  moderate: 1.3,
  high: 1.8,
  severe: 2.5,
};

const TREND_THRESHOLD = 0.1;
const HISTORICAL_WINDOW_MS = 3600000;

export class TrafficPredictor {
  private readings: TrafficReading[] = [];
  private maxReadings: number = 20;

  addReading(reading: TrafficReading): void {
    this.readings.push(reading);
    if (this.readings.length > this.maxReadings) {
      this.readings.shift();
    }
    logTraffic('Traffic reading recorded', { level: reading.level, delay: reading.delay });
  }

  addReadingFromRoute(route: OptimizedRoute): void {
    this.addReading({
      timestamp: Date.now(),
      level: route.traffic.level as any,
      delay: route.traffic.delay,
    });
  }

  getCurrentTrend(): TrafficTrend {
    if (this.readings.length < 2) {
      return 'stable';
    }

    const trend = this.calculateTrendDerivative();

    if (trend > TREND_THRESHOLD) {
      return 'worsening';
    } else if (trend < -TREND_THRESHOLD) {
      return 'improving';
    }

    return 'stable';
  }

  calculateTrendDerivative(): number {
    if (this.readings.length < 2) return 0;

    const recent = this.readings.slice(-5);
    let weightedSum = 0;
    let weights = 0;

    for (let i = 1; i < recent.length; i++) {
      const current = this.getTrafficWeight(recent[i].level);
      const previous = this.getTrafficWeight(recent[i - 1].level);
      const delta = current - previous;
      const weight = i;

      weightedSum += delta * weight;
      weights += weight;
    }

    return weights > 0 ? weightedSum / weights : 0;
  }

  predictETAImpact(baseETA: number, currentRoute: OptimizedRoute): TrafficPrediction {
    const trend = this.getCurrentTrend();
    const trendDerivative = this.calculateTrendDerivative();

    let etaMultiplier = 1.0;
    let confidence: 'high' | 'medium' | 'low' = 'medium';

    if (trend === 'worsening') {
      etaMultiplier = 1.15;
      confidence = this.readings.length > 10 ? 'high' : 'medium';
    } else if (trend === 'improving') {
      etaMultiplier = 0.85;
      confidence = this.readings.length > 10 ? 'high' : 'medium';
    } else {
      confidence = this.readings.length > 15 ? 'high' : 'low';
    }

    const predictedETA = Math.round(baseETA * etaMultiplier);
    const etaImpactMinutes = Math.round((predictedETA - baseETA) / 60);

    const historicalPattern = this.suggestHistoricalPattern(currentRoute);

    logTraffic('ETA impact predicted', {
      trend,
      multiplier: etaMultiplier.toFixed(2),
      predictedMinutes: Math.round(predictedETA / 60),
    });

    return {
      currentTrend: trend,
      trendDirection: trendDerivative,
      predictedETA,
      etaImpactMinutes,
      confidence,
      historicalPattern,
    };
  }

  getTrendIcon(): string {
    const trend = this.getCurrentTrend();
    switch (trend) {
      case 'worsening':
        return '📈';
      case 'improving':
        return '📉';
      default:
        return '→';
    }
  }

  getTrendDescription(trend: TrafficTrend): string {
    switch (trend) {
      case 'worsening':
        return 'Traffic is getting heavier';
      case 'improving':
        return 'Traffic is clearing up';
      default:
        return 'Traffic is stable';
    }
  }

  private getTrafficWeight(level: 'low' | 'moderate' | 'high' | 'severe'): number {
    return TRAFFIC_WEIGHTS[level] || 1.0;
  }

  private suggestHistoricalPattern(route: OptimizedRoute): string | undefined {
    if (this.readings.length < 5) return undefined;

    const currentHour = new Date().getHours();
    const isRushHour = (currentHour >= 7 && currentHour <= 9) || (currentHour >= 17 && currentHour <= 19);
    const isNightTime = currentHour >= 22 || currentHour <= 6;

    if (isRushHour && this.getCurrentTrend() === 'worsening') {
      return 'Usually heavy during rush hour';
    }

    if (isNightTime && this.getCurrentTrend() === 'improving') {
      return 'Typically light traffic at night';
    }

    const avgDelay = this.readings.reduce((sum, r) => sum + r.delay, 0) / this.readings.length;
    if (avgDelay > 600000) {
      return 'Persistently congested corridor';
    }

    return undefined;
  }

  clearHistory(): void {
    this.readings = [];
    logTraffic('Traffic history cleared');
  }

  getReadingCount(): number {
    return this.readings.length;
  }

  getAverageDelay(): number {
    if (this.readings.length === 0) return 0;
    return this.readings.reduce((sum, r) => sum + r.delay, 0) / this.readings.length;
  }

  getLatestReading(): TrafficReading | null {
    return this.readings.length > 0 ? this.readings[this.readings.length - 1] : null;
  }
}

export function compareTrafficTrends(
  predictor1: TrafficPredictor,
  predictor2: TrafficPredictor
): { faster: number; slower: number; significantly_different: boolean } {
  const trend1 = predictor1.getCurrentTrend();
  const trend2 = predictor2.getCurrentTrend();
  const avg1 = predictor1.getAverageDelay();
  const avg2 = predictor2.getAverageDelay();

  const delaydiff = Math.abs(avg1 - avg2);
  const isSignificant = delaydiff > 180000;

  return {
    faster: avg1 < avg2 ? predictor1.getReadingCount() : predictor2.getReadingCount(),
    slower: avg1 > avg2 ? predictor1.getReadingCount() : predictor2.getReadingCount(),
    significantly_different: isSignificant,
  };
}

export function createTrafficPredictorForRoute(route: OptimizedRoute): TrafficPredictor {
  const predictor = new TrafficPredictor();
  predictor.addReadingFromRoute(route);
  return predictor;
}

export default TrafficPredictor;
