import { useState, useCallback } from 'react';
import { apiRequest } from '../lib/api-client';
import {
  createPaymentIntent,
  confirmPayment,
  processRefund,
  getSavedPaymentMethods,
} from '../lib/stripe-client';

export interface RidePayment {
  id: string;
  rideId: string;
  userId: string;
  driverId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  paymentMethod: string;
  transactionId?: string;
  timestamp: Date;
  receiptUrl?: string;
  failureReason?: string;
}

export interface RideFare {
  baseFare: number;
  distanceFare: number;
  timeFare: number;
  surgePricing: number;
  discount: number;
  tax: number;
  totalFare: number;
}

interface UseRidePaymentProcessingReturn {
  calculateFare: (distance: number, duration: number, surge: number) => Promise<RideFare>;
  processRidePayment: (
    rideId: string,
    amount: number,
    paymentMethodId: string,
    billingDetails: { name: string; email: string; phone: string }
  ) => Promise<RidePayment>;
  refundRidePayment: (rideId: string, paymentId: string, reason?: string) => Promise<boolean>;
  getRidePaymentStatus: (rideId: string) => Promise<RidePayment | null>;
  generatePaymentReceipt: (paymentId: string) => Promise<string>;
  capturePayment: (rideId: string, amount: number) => Promise<RidePayment>;
  authorizePayment: (rideId: string, amount: number, paymentMethodId: string) => Promise<string>;
  getPaymentHistory: (userId: string, limit: number) => Promise<RidePayment[]>;
  getDriverRevenue: (driverId: string, startDate: Date, endDate: Date) => Promise<number>;
  isProcessing: boolean;
  error: Error | null;
}

const FARE_CONFIG = {
  BASE_FARE: 50, // ₹50 base
  DISTANCE_RATE: 15, // ₹15 per km
  TIME_RATE: 2, // ₹2 per minute
  MIN_FARE: 75, // ₹75 minimum
  SURGE_THRESHOLD: 0.7, // 70% surge multiplier cap
  TAX_RATE: 0.05, // 5% tax
};

export const useRidePaymentProcessing = (
  token: string | null,
  userId: string
): UseRidePaymentProcessingReturn => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const calculateFare = useCallback(
    async (distance: number, duration: number, surge: number = 1): Promise<RideFare> => {
      try {
        const distanceFare = distance * FARE_CONFIG.DISTANCE_RATE;
        const timeFare = duration * FARE_CONFIG.TIME_RATE;
        const subtotal = Math.max(
          FARE_CONFIG.BASE_FARE + distanceFare + timeFare,
          FARE_CONFIG.MIN_FARE
        );

        const surgeFare = surge > 1 ? subtotal * Math.min(surge - 1, FARE_CONFIG.SURGE_THRESHOLD) : 0;
        const subtotalWithSurge = subtotal + surgeFare;

        const response = await apiRequest('/rides/calculate-fare', {
          method: 'POST',
          body: {
            distance,
            duration,
            surge,
            subtotal: subtotalWithSurge,
          },
        });

        const discount = response.discount || 0;
        const taxableAmount = subtotalWithSurge - discount;
        const tax = taxableAmount * FARE_CONFIG.TAX_RATE;
        const totalFare = taxableAmount + tax;

        return {
          baseFare: FARE_CONFIG.BASE_FARE,
          distanceFare,
          timeFare,
          surgePricing: surgeFare,
          discount,
          tax,
          totalFare,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Failed to calculate fare');
        setError(error);
        throw error;
      }
    },
    []
  );

  const authorizePayment = useCallback(
    async (rideId: string, amount: number, paymentMethodId: string): Promise<string> => {
      if (!token) throw new Error('Not authenticated');
      try {
        setIsProcessing(true);
        setError(null);

        const intent = await createPaymentIntent(
          amount,
          'INR',
          `Ride Payment - ${rideId}`,
          apiRequest
        );

        const authResponse = await apiRequest('/payments/authorize', {
          method: 'POST',
          body: {
            rideId,
            amount: Math.round(amount * 100),
            clientSecret: intent.clientSecret,
            paymentMethodId,
          },
        });

        return authResponse.authorizationId;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Authorization failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [token]
  );

  const capturePayment = useCallback(
    async (rideId: string, amount: number): Promise<RidePayment> => {
      if (!token) throw new Error('Not authenticated');
      try {
        setIsProcessing(true);
        setError(null);

        const response = await apiRequest('/payments/capture', {
          method: 'POST',
          body: {
            rideId,
            amount: Math.round(amount * 100),
          },
        });

        return {
          id: response.id,
          rideId,
          userId,
          driverId: response.driverId,
          amount,
          currency: 'INR',
          status: 'completed',
          paymentMethod: response.paymentMethod,
          transactionId: response.transactionId,
          timestamp: new Date(response.timestamp),
          receiptUrl: response.receiptUrl,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Payment capture failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [token, userId]
  );

  const processRidePayment = useCallback(
    async (
      rideId: string,
      amount: number,
      paymentMethodId: string,
      billingDetails: { name: string; email: string; phone: string }
    ): Promise<RidePayment> => {
      if (!token) throw new Error('Not authenticated');
      try {
        setIsProcessing(true);
        setError(null);

        const intent = await createPaymentIntent(
          amount,
          'INR',
          `Ride Payment - ${rideId}`,
          apiRequest
        );

        const methods = await getSavedPaymentMethods(apiRequest);
        const selectedMethod = methods.find((m) => m.id === paymentMethodId);

        if (!selectedMethod) {
          throw new Error('Payment method not found');
        }

        const paymentResponse = await apiRequest('/payments/process-ride', {
          method: 'POST',
          body: {
            rideId,
            amount: Math.round(amount * 100),
            clientSecret: intent.clientSecret,
            paymentMethodId,
            billingDetails,
            cardDetails: {
              number: selectedMethod.last4,
              brand: selectedMethod.brand,
            },
          },
        });

        if (paymentResponse.status !== 'succeeded') {
          throw new Error(paymentResponse.error || 'Payment processing failed');
        }

        return {
          id: paymentResponse.id,
          rideId,
          userId,
          driverId: paymentResponse.driverId,
          amount,
          currency: 'INR',
          status: 'completed',
          paymentMethod: paymentMethodId,
          transactionId: paymentResponse.transactionId,
          timestamp: new Date(),
          receiptUrl: paymentResponse.receiptUrl,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Payment processing failed');
        setError(error);

        await apiRequest('/payments/record-failure', {
          method: 'POST',
          body: {
            rideId,
            reason: error.message,
          },
        }).catch(() => null);

        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [token, userId]
  );

  const refundRidePayment = useCallback(
    async (rideId: string, paymentId: string, reason?: string): Promise<boolean> => {
      if (!token) throw new Error('Not authenticated');
      try {
        setIsProcessing(true);
        setError(null);

        const refundResponse = await apiRequest('/payments/refund-ride', {
          method: 'POST',
          body: {
            rideId,
            paymentId,
            reason: reason || 'user_request',
          },
        });

        if (refundResponse.status !== 'succeeded') {
          throw new Error(refundResponse.error || 'Refund failed');
        }

        await apiRequest('/rides/update-status', {
          method: 'PATCH',
          body: {
            rideId,
            status: 'refunded',
          },
        }).catch(() => null);

        return true;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Refund processing failed');
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [token]
  );

  const getRidePaymentStatus = useCallback(
    async (rideId: string): Promise<RidePayment | null> => {
      if (!token) return null;
      try {
        const response = await apiRequest(`/payments/ride/${rideId}`, {
          method: 'GET',
        });

        if (!response) return null;

        return {
          id: response.id,
          rideId,
          userId: response.userId,
          driverId: response.driverId,
          amount: response.amount / 100,
          currency: response.currency,
          status: response.status,
          paymentMethod: response.paymentMethod,
          transactionId: response.transactionId,
          timestamp: new Date(response.timestamp),
          receiptUrl: response.receiptUrl,
          failureReason: response.failureReason,
        };
      } catch (err) {
        console.error('[Payment] Failed to get ride payment status:', err);
        return null;
      }
    },
    [token]
  );

  const generatePaymentReceipt = useCallback(
    async (paymentId: string): Promise<string> => {
      if (!token) throw new Error('Not authenticated');
      try {
        const response = await apiRequest(`/payments/receipt/${paymentId}`, {
          method: 'GET',
        });

        return response.receiptUrl || response.url;
      } catch (err) {
        const error = err instanceof Error ? err : new Error('Receipt generation failed');
        setError(error);
        throw error;
      }
    },
    [token]
  );

  const getPaymentHistory = useCallback(
    async (userId: string, limit: number = 10): Promise<RidePayment[]> => {
      if (!token) return [];
      try {
        const response = await apiRequest(`/payments/history/${userId}?limit=${limit}`, {
          method: 'GET',
        });

        return (response.payments || []).map((p: any) => ({
          id: p.id,
          rideId: p.rideId,
          userId: p.userId,
          driverId: p.driverId,
          amount: p.amount / 100,
          currency: p.currency,
          status: p.status,
          paymentMethod: p.paymentMethod,
          transactionId: p.transactionId,
          timestamp: new Date(p.timestamp),
          receiptUrl: p.receiptUrl,
          failureReason: p.failureReason,
        }));
      } catch (err) {
        console.error('[Payment] Failed to get payment history:', err);
        return [];
      }
    },
    [token]
  );

  const getDriverRevenue = useCallback(
    async (driverId: string, startDate: Date, endDate: Date): Promise<number> => {
      if (!token) return 0;
      try {
        const response = await apiRequest('/payments/driver-revenue', {
          method: 'POST',
          body: {
            driverId,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        });

        return response.totalRevenue || 0;
      } catch (err) {
        console.error('[Payment] Failed to get driver revenue:', err);
        return 0;
      }
    },
    [token]
  );

  return {
    calculateFare,
    processRidePayment,
    refundRidePayment,
    getRidePaymentStatus,
    generatePaymentReceipt,
    capturePayment,
    authorizePayment,
    getPaymentHistory,
    getDriverRevenue,
    isProcessing,
    error,
  };
};

export default useRidePaymentProcessing;
