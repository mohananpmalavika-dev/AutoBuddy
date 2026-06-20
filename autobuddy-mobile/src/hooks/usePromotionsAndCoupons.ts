import { useState, useCallback, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface Coupon {
  id: string;
  code: string;
  type: 'percentage' | 'fixed' | 'freeRide';
  value: number;
  description: string;
  minRideAmount?: number;
  maxDiscount?: number;
  validFrom: Date;
  validUntil: Date;
  usageLimit: number;
  usageCount: number;
  applicableTo: 'passenger' | 'driver' | 'both';
  category?: string;
  icon?: string;
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  type: 'coupon' | 'campaign' | 'seasonal';
  coupons: Coupon[];
  startDate: Date;
  endDate: Date;
  active: boolean;
  targetAudience: string[];
  icon?: string;
}

export interface CouponUsage {
  id: string;
  userId: string;
  couponId: string;
  coupon: Coupon;
  rideId: string;
  discountApplied: number;
  originalFare: number;
  finalFare: number;
  usedAt: Date;
}

export interface PromotionEligibility {
  couponId: string;
  eligible: boolean;
  reason?: string;
  eligibilityRules: string[];
}

const COUPONS_STORAGE = 'promotions_coupons';
const USAGE_HISTORY_STORAGE = 'promotions_usage_history';
const ACTIVE_PROMOTIONS_STORAGE = 'promotions_active';

/**
 * Hook for managing promotions and coupons
 */
export const usePromotionsAndCoupons = (token: string | null, userId: string) => {
  const [availableCoupons, setAvailableCoupons] = useState<Coupon[]>([]);
  const [usageHistory, setUsageHistory] = useState<CouponUsage[]>([]);
  const [activePromotions, setActivePromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize
  useEffect(() => {
    const initialize = async () => {
      try {
        setLoading(true);
        const coupons = await loadCoupons();
        const history = await loadUsageHistory();
        const promotions = await loadActivePromotions();

        setAvailableCoupons(coupons);
        setUsageHistory(history);
        setActivePromotions(promotions);

        // Initialize default promotions
        await initializeDefaultPromotions();
      } catch (err) {
        setError(`Init failed: ${err}`);
      } finally {
        setLoading(false);
      }
    };

    if (token && userId) initialize();
  }, [token, userId]);

  // Validate coupon code
  const validateCoupon = useCallback(
    async (couponCode: string, rideAmount: number, userType: 'passenger' | 'driver'): Promise<Coupon | null> => {
      try {
        const coupon = availableCoupons.find(
          c => c.code.toUpperCase() === couponCode.toUpperCase()
        );

        if (!coupon) {
          throw new Error('Coupon code not found');
        }

        // Check if applicable
        if (coupon.applicableTo !== 'both' && coupon.applicableTo !== userType) {
          throw new Error(`Coupon not applicable to ${userType}s`);
        }

        // Check if expired
        if (new Date() > new Date(coupon.validUntil)) {
          throw new Error('Coupon has expired');
        }

        // Check if not yet valid
        if (new Date() < new Date(coupon.validFrom)) {
          throw new Error('Coupon not yet valid');
        }

        // Check usage limit
        if (coupon.usageCount >= coupon.usageLimit) {
          throw new Error('Coupon usage limit exceeded');
        }

        // Check minimum ride amount
        if (coupon.minRideAmount && rideAmount < coupon.minRideAmount) {
          throw new Error(
            `Minimum ride amount of ₹${coupon.minRideAmount} required`
          );
        }

        return coupon;
      } catch (err) {
        setError(`Validation failed: ${err}`);
        throw err;
      }
    },
    [availableCoupons]
  );

  // Apply coupon to fare
  const applyCoupon = useCallback(
    (coupon: Coupon, originalFare: number): number => {
      let discount = 0;

      if (coupon.type === 'percentage') {
        discount = (originalFare * coupon.value) / 100;
      } else if (coupon.type === 'fixed') {
        discount = coupon.value;
      } else if (coupon.type === 'freeRide') {
        discount = originalFare;
      }

      // Apply max discount limit if exists
      if (coupon.maxDiscount) {
        discount = Math.min(discount, coupon.maxDiscount);
      }

      return Math.max(0, originalFare - discount);
    },
    []
  );

  // Record coupon usage
  const recordCouponUsage = useCallback(
    async (
      couponId: string,
      rideId: string,
      originalFare: number,
      finalFare: number
    ): Promise<CouponUsage> => {
      try {
        const coupon = availableCoupons.find(c => c.id === couponId);
        if (!coupon) throw new Error('Coupon not found');

        const usage: CouponUsage = {
          id: `usage_${Date.now()}`,
          userId,
          couponId,
          coupon,
          rideId,
          discountApplied: originalFare - finalFare,
          originalFare,
          finalFare,
          usedAt: new Date(),
        };

        // Update history
        const updatedHistory = [usage, ...usageHistory];
        setUsageHistory(updatedHistory);

        // Increment coupon usage
        const updatedCoupons = availableCoupons.map(c =>
          c.id === couponId ? { ...c, usageCount: c.usageCount + 1 } : c
        );
        setAvailableCoupons(updatedCoupons);

        // Save to storage
        await AsyncStorage.setItem(COUPONS_STORAGE, JSON.stringify(updatedCoupons));
        await AsyncStorage.setItem(USAGE_HISTORY_STORAGE, JSON.stringify(updatedHistory));

        return usage;
      } catch (err) {
        setError(`Failed to record usage: ${err}`);
        throw err;
      }
    },
    [userId, availableCoupons, usageHistory]
  );

  // Check coupon eligibility
  const checkEligibility = useCallback(
    (couponId: string, rideAmount: number, userType: 'passenger' | 'driver'): PromotionEligibility => {
      const coupon = availableCoupons.find(c => c.id === couponId);

      if (!coupon) {
        return {
          couponId,
          eligible: false,
          reason: 'Coupon not found',
          eligibilityRules: [],
        };
      }

      const rules: string[] = [];
      let eligible = true;

      // Check applicability
      if (coupon.applicableTo !== 'both' && coupon.applicableTo !== userType) {
        eligible = false;
        rules.push(`Only for ${coupon.applicableTo}s`);
      }

      // Check expiration
      if (new Date() > new Date(coupon.validUntil)) {
        eligible = false;
        rules.push('Coupon expired');
      }

      // Check minimum
      if (coupon.minRideAmount && rideAmount < coupon.minRideAmount) {
        eligible = false;
        rules.push(`Min ride: ₹${coupon.minRideAmount}`);
      }

      // Check usage
      if (coupon.usageCount >= coupon.usageLimit) {
        eligible = false;
        rules.push('Usage limit exceeded');
      }

      return { couponId, eligible, eligibilityRules: rules };
    },
    [availableCoupons]
  );

  // Get available coupons for user
  const getAvailableCouponsForUser = useCallback(
    (userType: 'passenger' | 'driver'): Coupon[] => {
      return availableCoupons.filter(c => {
        const now = new Date();
        const isValid =
          now >= new Date(c.validFrom) &&
          now <= new Date(c.validUntil) &&
          c.usageCount < c.usageLimit;

        const isApplicable = c.applicableTo === 'both' || c.applicableTo === userType;

        return isValid && isApplicable;
      });
    },
    [availableCoupons]
  );

  // Get user's coupon usage stats
  const getUserCouponStats = useCallback(() => {
    return {
      totalCouponsUsed: usageHistory.length,
      totalSavings: usageHistory.reduce((sum, u) => sum + u.discountApplied, 0),
      averageSavingsPerRide:
        usageHistory.length > 0
          ? usageHistory.reduce((sum, u) => sum + u.discountApplied, 0) / usageHistory.length
          : 0,
      mostUsedCoupon: usageHistory.length > 0
        ? usageHistory[0]
        : null,
    };
  }, [usageHistory]);

  // Initialize default promotions
  const initializeDefaultPromotions = useCallback(async () => {
    try {
      const defaultPromotions: Promotion[] = [
        {
          id: 'promo_1',
          name: 'Welcome Offer',
          description: 'Get ₹100 off on your first ride',
          type: 'campaign',
          coupons: [{
            id: 'coup_1',
            code: 'WELCOME100',
            type: 'fixed',
            value: 100,
            description: '₹100 off',
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
            usageLimit: 1000,
            usageCount: 0,
            applicableTo: 'passenger',
          }],
          startDate: new Date(),
          endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          active: true,
          targetAudience: ['new_users'],
        },
        {
          id: 'promo_2',
          name: 'Weekend Special',
          description: '20% off on all rides',
          type: 'campaign',
          coupons: [{
            id: 'coup_2',
            code: 'WEEKEND20',
            type: 'percentage',
            value: 20,
            description: '20% off',
            maxDiscount: 200,
            validFrom: new Date(),
            validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            usageLimit: 5000,
            usageCount: 0,
            applicableTo: 'both',
          }],
          startDate: new Date(),
          endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          active: true,
          targetAudience: ['all_users'],
        },
      ];

      setActivePromotions(defaultPromotions);
      await AsyncStorage.setItem(ACTIVE_PROMOTIONS_STORAGE, JSON.stringify(defaultPromotions));
    } catch (err) {
      console.error('Failed to initialize promotions:', err);
    }
  }, []);

  // Load helpers
  const loadCoupons = useCallback(async (): Promise<Coupon[]> => {
    try {
      const data = await AsyncStorage.getItem(COUPONS_STORAGE);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Load coupons error:', err);
      return [];
    }
  }, []);

  const loadUsageHistory = useCallback(async (): Promise<CouponUsage[]> => {
    try {
      const data = await AsyncStorage.getItem(USAGE_HISTORY_STORAGE);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Load usage history error:', err);
      return [];
    }
  }, []);

  const loadActivePromotions = useCallback(async (): Promise<Promotion[]> => {
    try {
      const data = await AsyncStorage.getItem(ACTIVE_PROMOTIONS_STORAGE);
      return data ? JSON.parse(data) : [];
    } catch (err) {
      console.error('Load promotions error:', err);
      return [];
    }
  }, []);

  return {
    // Main functions
    validateCoupon,
    applyCoupon,
    recordCouponUsage,
    checkEligibility,

    // Getters
    getAvailableCouponsForUser,
    getUserCouponStats,

    // Data
    availableCoupons,
    usageHistory,
    activePromotions,

    // State
    loading,
    error,
  };
};
