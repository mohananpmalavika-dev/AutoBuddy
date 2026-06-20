import { useCallback, useState } from 'react';
import { apiRequest } from '../lib/api-client';

export interface PaymentCaptureResult {
  transactionId: string;
  chargeId: string;
  amount: number;
  receiptUrl: string;
  status: 'captured' | 'failed';
}

/**
 * Hook for capturing authorized payment when ride completes
 *
 * Usage:
 * const capture = useRidePaymentCapture(token);
 *
 * When ride completes:
 * const result = await capture.captureRidePayment(
 *   paymentSessionId,
 *   rideId,
 *   fareAmount
 * );
 */
export const useRidePaymentCapture = (token: string | null) => {
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const captureRidePayment = useCallback(
    async (
      paymentSessionId: string,
      rideId: string,
      fare: number
    ): Promise<PaymentCaptureResult> => {
      if (!token) throw new Error('Not authenticated');

      setIsCapturing(true);
      setError(null);

      try {
        // Generate idempotency key for retry safety
        const idempotencyKey = `${rideId}_${Date.now()}`;

        // Call capture endpoint with database-backed payment session
        const response = await apiRequest('/api/v3/payments/capture-ride', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            payment_session_id: paymentSessionId,
            payment_method_id: 'default', // Will use default or from session
            idempotency_key: idempotencyKey,
          }),
        });

        if (response.status !== 'captured') {
          throw new Error(`Payment capture failed: ${response.status}`);
        }

        return {
          transactionId: response.transaction_id,
          chargeId: response.stripe_charge_id,
          amount: fare,
          receiptUrl: response.receipt_url,
          status: 'captured',
        };
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Payment capture failed');
        setError(error);
        throw error;
      } finally {
        setIsCapturing(false);
      }
    },
    [token]
  );

  return {
    captureRidePayment,
    isCapturing,
    error,
  };
};
