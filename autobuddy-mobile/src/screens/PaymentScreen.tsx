import React, { useState } from 'react';
import { View, Text, TextInput, Button, Alert, StyleSheet } from 'react-native';
import { CardField, useStripe } from '@stripe/stripe-react-native';
import { paymentAPI } from '../services/apiClient';

export default function PaymentScreen({ bookingId, onSuccess }: { bookingId: string; onSuccess?: () => void }) {
  const { confirmPayment } = useStripe();
  const [cardDetails, setCardDetails] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handlePay = async () => {
    if (!cardDetails?.complete) {
      Alert.alert('Invalid Card', 'Please enter complete card details.');
      return;
    }
    setLoading(true);
    try {
      // 1. Create payment intent on backend
      const amount = 100; // Replace with actual amount calculation
      const intentResp: any = await paymentAPI.createPaymentIntent(bookingId, amount);
      const clientSecret = intentResp.client_secret || intentResp.data?.client_secret;

      if (!clientSecret) {
        throw new Error('Unable to create payment intent');
      }

      // 2. Confirm payment with Stripe native SDK
      const { error, paymentIntent } = await confirmPayment(clientSecret, {
        paymentMethodType: 'Card',
        paymentMethodData: {
          billingDetails: {
            name: 'Passenger',
          },
        },
      } as any);

      if (error) {
        Alert.alert('Payment failed', error.message || 'Unknown error');
        setLoading(false);
        return;
      }

      // 3. Confirm server-side if required
      await paymentAPI.confirmPayment(paymentIntent?.id || paymentIntent?.client_secret);

      Alert.alert('Payment successful');
      onSuccess?.();
    } catch (err: any) {
      Alert.alert('Payment error', err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Payment</Text>
      <CardField
        postalCodeEnabled={true}
        placeholder={{ number: '4242 4242 4242 4242' }}
        cardStyle={{ backgroundColor: '#FFFFFF', textColor: '#000000' }}
        style={{ width: '100%', height: 50, marginVertical: 10 }}
        onCardChange={(details) => setCardDetails(details)}
      />
      <Button title={loading ? 'Processing...' : 'Pay'} onPress={handlePay} disabled={loading} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16 },
  title: { fontSize: 20, fontWeight: '600', marginBottom: 12 },
});
