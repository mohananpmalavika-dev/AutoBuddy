import { initStripe, CardFieldInput } from '@stripe/stripe-react-native';

/**
 * Initialize Stripe with publishable key
 */
export const initializeStripe = async () => {
  try {
    await initStripe({
      publishableKey: process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY || 'pk_test_xxxxx',
      merchantIdentifier: 'merchant.autobuddy',
      threeDSecureParams: {
        timeout: 5,
      },
    });

    console.log('[Stripe] Initialized successfully');
  } catch (error) {
    console.error('[Stripe] Initialization failed:', error);
    throw error;
  }
};

/**
 * Create payment intent on backend
 */
export const createPaymentIntent = async (
  amount: number,
  currency: string = 'INR',
  description: string,
  apiRequest: (path: string, options: any) => Promise<any>
) => {
  try {
    const response = await apiRequest('/payments/intent', {
      method: 'POST',
      body: {
        amount: Math.round(amount * 100), // Convert to smallest currency unit
        currency: currency.toLowerCase(),
        description,
      },
    });

    return {
      clientSecret: response.client_secret,
      amount: response.amount,
      currency: response.currency,
    };
  } catch (error) {
    console.error('[Stripe] Failed to create payment intent:', error);
    throw error;
  }
};

/**
 * Confirm payment with card details
 */
export const confirmPayment = async (
  clientSecret: string,
  cardDetails: any,
  billingDetails: {
    name: string;
    email: string;
    phone: string;
  },
  apiRequest: (path: string, options: any) => Promise<any>
) => {
  try {
    const response = await apiRequest('/payments/confirm', {
      method: 'POST',
      body: {
        client_secret: clientSecret,
        card: {
          number: cardDetails.number,
          exp_month: cardDetails.expMonth,
          exp_year: cardDetails.expYear,
          cvc: cardDetails.cvc,
        },
        billing_details: billingDetails,
      },
    });

    return {
      success: response.status === 'succeeded',
      paymentId: response.id,
      status: response.status,
      error: response.error,
    };
  } catch (error) {
    console.error('[Stripe] Payment confirmation failed:', error);
    throw error;
  }
};

/**
 * Save card for future payments
 */
export const saveCard = async (
  cardToken: string,
  cardName: string,
  apiRequest: (path: string, options: any) => Promise<any>
) => {
  try {
    const response = await apiRequest('/payments/save-card', {
      method: 'POST',
      body: {
        token: cardToken,
        name: cardName,
      },
    });

    return {
      cardId: response.id,
      last4: response.last4,
      brand: response.brand,
    };
  } catch (error) {
    console.error('[Stripe] Failed to save card:', error);
    throw error;
  }
};

/**
 * Get saved payment methods
 */
export const getSavedPaymentMethods = async (
  apiRequest: (path: string, options: any) => Promise<any>
) => {
  try {
    const response = await apiRequest('/payments/methods', {
      method: 'GET',
    });

    return response.methods || [];
  } catch (error) {
    console.error('[Stripe] Failed to get payment methods:', error);
    throw error;
  }
};

/**
 * Process refund
 */
export const processRefund = async (
  paymentId: string,
  amount?: number,
  reason?: string,
  apiRequest?: (path: string, options: any) => Promise<any>
) => {
  try {
    if (!apiRequest) {
      throw new Error('API request function required');
    }

    const response = await apiRequest('/payments/refund', {
      method: 'POST',
      body: {
        payment_id: paymentId,
        amount: amount ? Math.round(amount * 100) : undefined,
        reason: reason || 'customer_request',
      },
    });

    return {
      refundId: response.id,
      status: response.status,
      amount: response.amount / 100,
    };
  } catch (error) {
    console.error('[Stripe] Refund processing failed:', error);
    throw error;
  }
};

export default {
  initializeStripe,
  createPaymentIntent,
  confirmPayment,
  saveCard,
  getSavedPaymentMethods,
  processRefund,
};
