import { useEffect, useState, useCallback } from 'react';
import {
  initializeStripe,
  createPaymentIntent,
  confirmPayment,
  saveCard,
  getSavedPaymentMethods,
  processRefund,
} from '../lib/stripe-client';
import { apiRequest } from '../lib/api-client';

export interface PaymentMethod {
  id: string;
  type: 'card' | 'wallet' | 'upi' | 'cash';
  name: string;
  last4?: string;
  brand?: string;
  isDefault?: boolean;
}

export interface PaymentIntent {
  clientSecret: string;
  amount: number;
  currency: string;
}

/**
 * Hook for payment processing
 */
export function usePayment() {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [error, setError] = useState<Error | null>(null);

  // Initialize Stripe on mount
  useEffect(() => {
    const init = async () => {
      try {
        await initializeStripe();
        setIsInitialized(true);

        // Load saved payment methods
        await loadPaymentMethods();
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        console.error('[Payment] Initialization failed:', error);
      }
    };

    init();
  }, []);

  // Load saved payment methods
  const loadPaymentMethods = useCallback(async () => {
    try {
      const methods = await getSavedPaymentMethods(apiRequest);
      setPaymentMethods(methods);
    } catch (err) {
      console.error('[Payment] Failed to load payment methods:', err);
    }
  }, []);

  // Create payment
  const createPayment = useCallback(
    async (
      amount: number,
      description: string,
      currency: string = 'INR'
    ): Promise<PaymentIntent> => {
      try {
        setIsProcessing(true);
        setError(null);

        const intent = await createPaymentIntent(
          amount,
          currency,
          description,
          apiRequest
        );

        return intent;
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Process payment with card
  const processCardPayment = useCallback(
    async (
      amount: number,
      description: string,
      cardDetails: any,
      billingDetails: {
        name: string;
        email: string;
        phone: string;
      }
    ) => {
      try {
        setIsProcessing(true);
        setError(null);

        // Create payment intent
        const intent = await createPayment(amount, description);

        // Confirm payment
        const result = await confirmPayment(
          intent.clientSecret,
          cardDetails,
          billingDetails,
          apiRequest
        );

        if (!result.success) {
          throw new Error(result.error || 'Payment confirmation failed');
        }

        return {
          success: true,
          paymentId: result.paymentId,
          amount: amount,
          timestamp: new Date(),
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    [createPayment]
  );

  // Add payment method
  const addPaymentMethod = useCallback(
    async (
      type: 'card' | 'wallet' | 'upi' | 'cash',
      details: any
    ) => {
      try {
        setIsProcessing(true);

        if (type === 'card') {
          // Save card to Stripe
          const savedCard = await saveCard(
            details.token,
            details.name,
            apiRequest
          );

          const newMethod: PaymentMethod = {
            id: savedCard.cardId,
            type: 'card',
            name: details.name,
            last4: savedCard.last4,
            brand: savedCard.brand,
          };

          setPaymentMethods((prev) => [...prev, newMethod]);
          return newMethod;
        } else {
          // Handle other payment methods (wallet, UPI, cash)
          const newMethod: PaymentMethod = {
            id: `${type}_${Date.now()}`,
            type: type,
            name: details.name,
          };

          setPaymentMethods((prev) => [...prev, newMethod]);
          return newMethod;
        }
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Remove payment method
  const removePaymentMethod = useCallback((methodId: string) => {
    setPaymentMethods((prev) => prev.filter((m) => m.id !== methodId));
  }, []);

  // Set default payment method
  const setDefaultPaymentMethod = useCallback((methodId: string) => {
    setPaymentMethods((prev) =>
      prev.map((m) => ({
        ...m,
        isDefault: m.id === methodId,
      }))
    );
  }, []);

  // Process refund
  const refundPayment = useCallback(
    async (paymentId: string, amount?: number, reason?: string) => {
      try {
        setIsProcessing(true);
        setError(null);

        const result = await processRefund(
          paymentId,
          amount,
          reason,
          apiRequest
        );

        return {
          success: true,
          refundId: result.refundId,
          amount: result.amount,
        };
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        setError(error);
        throw error;
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  // Get default payment method
  const getDefaultPaymentMethod = useCallback(() => {
    return paymentMethods.find((m) => m.isDefault) || paymentMethods[0] || null;
  }, [paymentMethods]);

  return {
    isInitialized,
    isProcessing,
    paymentMethods,
    error,
    createPayment,
    processCardPayment,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
    refundPayment,
    getDefaultPaymentMethod,
    loadPaymentMethods,
  };
}

export default usePayment;
