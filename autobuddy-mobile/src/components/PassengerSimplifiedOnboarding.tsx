import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

export interface SignupData {
  phone: string;
  name: string;
  email?: string;
  paymentMethod?: 'wallet' | 'upi' | 'card' | 'cash';
}

interface SimplifiedOnboardingProps {
  loading?: boolean;
  onComplete: (data: SignupData) => void;
  onSkip?: () => void;
}

type OnboardingStep = 1 | 2 | 3 | 4;

export function SimplifiedOnboarding({
  loading = false,
  onComplete,
  onSkip,
}: SimplifiedOnboardingProps) {
  const [currentStep, setCurrentStep] = useState<OnboardingStep>(1);
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'wallet' | 'upi' | 'card' | 'cash'>('wallet');
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);

  const handleSendOtp = async () => {
    if (phone.length < 10) {
      Alert.alert('Invalid Phone', 'Please enter a valid 10-digit phone number');
      return;
    }

    // In real app, call API to send OTP
    // await apiRequest('/auth/send-otp', { phone });
    setOtpSent(true);
  };

  const handleVerifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert('Invalid OTP', 'Please enter a 6-digit OTP');
      return;
    }

    try {
      setVerifyingOtp(true);
      // In real app, call API to verify OTP
      // await apiRequest('/auth/verify-otp', { phone, otp });
      setPhoneVerified(true);
      setCurrentStep(2);
    } catch (error) {
      Alert.alert('Verification Failed', 'Invalid OTP. Please try again.');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleNext = () => {
    if (currentStep === 2) {
      if (!name.trim()) {
        Alert.alert('Name Required', 'Please enter your name');
        return;
      }
      setCurrentStep(3);
    } else if (currentStep === 3) {
      setCurrentStep(4);
    } else if (currentStep === 4) {
      onComplete({
        phone,
        name,
        email: email || undefined,
        paymentMethod,
      });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep((step) => (step - 1) as OnboardingStep);
    }
  };

  const getProgressPercent = (step / 4) * 100;

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Welcome to AutoBuddy</Text>
          <Text style={styles.subtitle}>Get rides in 4 quick steps</Text>
        </View>

        {/* Progress bar */}
        <View style={styles.progressContainer}>
          <View style={styles.progressBarBg}>
            <View
              style={[styles.progressBar, { width: `${getProgressPercent}%` }]}
            />
          </View>
          <Text style={styles.stepText}>
            Step {currentStep} of 4
          </Text>
        </View>

        {/* Step 1: Phone verification */}
        {currentStep === 1 && (
          <View style={styles.stepContent}>
            <MaterialIcons name="phone" size={48} color="#2196F3" />
            <Text style={styles.stepTitle}>Verify Your Phone</Text>
            <Text style={styles.stepDescription}>
              We'll send you an OTP to confirm your number
            </Text>

            {!otpSent ? (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Phone Number</Text>
                <View style={styles.phoneInput}>
                  <Text style={styles.countryCode}>+91</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="Enter 10-digit number"
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                    maxLength={10}
                    editable={!loading}
                  />
                </View>
                <Pressable
                  style={[styles.button, styles.primaryButton, loading && styles.buttonDisabled]}
                  onPress={handleSendOtp}
                  disabled={loading}
                >
                  {loading ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="mail" size={20} color="#fff" />
                      <Text style={styles.buttonText}>Send OTP</Text>
                    </>
                  )}
                </Pressable>
              </View>
            ) : (
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Enter OTP</Text>
                <Text style={styles.otpHint}>
                  We sent a code to +91 {phone}
                </Text>
                <TextInput
                  style={[styles.input, styles.otpInput]}
                  placeholder="000000"
                  keyboardType="number-pad"
                  value={otp}
                  onChangeText={setOtp}
                  maxLength={6}
                  editable={!verifyingOtp}
                />
                <Pressable
                  style={[styles.button, styles.primaryButton, verifyingOtp && styles.buttonDisabled]}
                  onPress={handleVerifyOtp}
                  disabled={verifyingOtp}
                >
                  {verifyingOtp ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <MaterialIcons name="check" size={20} color="#fff" />
                      <Text style={styles.buttonText}>Verify</Text>
                    </>
                  )}
                </Pressable>

                <Pressable onPress={() => setOtpSent(false)}>
                  <Text style={styles.changePhoneText}>Change phone number</Text>
                </Pressable>
              </View>
            )}
          </View>
        )}

        {/* Step 2: Name */}
        {currentStep === 2 && (
          <View style={styles.stepContent}>
            <MaterialIcons name="person" size={48} color="#2196F3" />
            <Text style={styles.stepTitle}>What's Your Name?</Text>
            <Text style={styles.stepDescription}>
              Help drivers know who to pick up
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Full Name</Text>
              <TextInput
                style={styles.input}
                placeholder="John Doe"
                value={name}
                onChangeText={setName}
                editable={!loading}
              />
              <Pressable
                style={[styles.button, styles.primaryButton, !name && styles.buttonDisabled]}
                onPress={handleNext}
                disabled={!name || loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Continue</Text>
                  </>
                )}
              </Pressable>
            </View>

            <Pressable onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={20} color="#2196F3" />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>
        )}

        {/* Step 3: Email (optional) */}
        {currentStep === 3 && (
          <View style={styles.stepContent}>
            <MaterialIcons name="mail-outline" size={48} color="#2196F3" />
            <Text style={styles.stepTitle}>Email Address</Text>
            <Text style={styles.stepDescription}>
              (Optional) For ride receipts and support
            </Text>

            <View style={styles.inputGroup}>
              <TextInput
                style={styles.input}
                placeholder="john@example.com"
                keyboardType="email-address"
                value={email}
                onChangeText={setEmail}
                editable={!loading}
              />
              <Pressable
                style={[styles.button, styles.primaryButton]}
                onPress={handleNext}
                disabled={loading}
              >
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="arrow-forward" size={20} color="#fff" />
                    <Text style={styles.buttonText}>Continue</Text>
                  </>
                )}
              </Pressable>
              <Pressable
                style={[styles.button, styles.secondaryButton]}
                onPress={handleNext}
                disabled={loading}
              >
                <Text style={styles.secondaryButtonText}>Skip for now</Text>
              </Pressable>
            </View>

            <Pressable onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={20} color="#2196F3" />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>
        )}

        {/* Step 4: Payment Method */}
        {currentStep === 4 && (
          <View style={styles.stepContent}>
            <MaterialIcons name="payment" size={48} color="#2196F3" />
            <Text style={styles.stepTitle}>How Do You Want to Pay?</Text>
            <Text style={styles.stepDescription}>
              You can change this anytime
            </Text>

            <View style={styles.paymentOptions}>
              <PaymentOption
                icon="account-balance-wallet"
                label="Wallet"
                description="Prepaid balance"
                selected={paymentMethod === 'wallet'}
                onSelect={() => setPaymentMethod('wallet')}
              />
              <PaymentOption
                icon="payment"
                label="UPI"
                description="Google Pay, PhonePe, Paytm"
                selected={paymentMethod === 'upi'}
                onSelect={() => setPaymentMethod('upi')}
              />
              <PaymentOption
                icon="credit-card"
                label="Card"
                description="Visa, Mastercard"
                selected={paymentMethod === 'card'}
                onSelect={() => setPaymentMethod('card')}
              />
              <PaymentOption
                icon="money"
                label="Cash"
                description="Pay driver directly"
                selected={paymentMethod === 'cash'}
                onSelect={() => setPaymentMethod('cash')}
              />
            </View>

            <Pressable
              style={[styles.button, styles.primaryButton]}
              onPress={handleNext}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <>
                  <MaterialIcons name="check-circle" size={20} color="#fff" />
                  <Text style={styles.buttonText}>You're All Set!</Text>
                </>
              )}
            </Pressable>

            <Pressable onPress={handleBack} style={styles.backButton}>
              <MaterialIcons name="arrow-back" size={20} color="#2196F3" />
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
          </View>
        )}

        {/* Bottom text */}
        {onSkip && currentStep > 1 && (
          <Pressable onPress={onSkip}>
            <Text style={styles.skipText}>Skip and book a ride later</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

interface PaymentOptionProps {
  icon: string;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
}

function PaymentOption({
  icon,
  label,
  description,
  selected,
  onSelect,
}: PaymentOptionProps) {
  return (
    <Pressable
      style={[styles.paymentOption, selected && styles.paymentOptionSelected]}
      onPress={onSelect}
    >
      <MaterialIcons
        name={icon as any}
        size={32}
        color={selected ? '#2196F3' : '#999'}
      />
      <View style={styles.paymentOptionContent}>
        <Text style={[styles.paymentLabel, selected && styles.paymentLabelSelected]}>
          {label}
        </Text>
        <Text style={styles.paymentDescription}>{description}</Text>
      </View>
      <View
        style={[
          styles.radioButton,
          selected && styles.radioButtonSelected,
        ]}
      >
        {selected && (
          <View style={styles.radioButtonInner} />
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    marginTop: 8,
  },
  progressContainer: {
    marginBottom: 32,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#2196F3',
    borderRadius: 3,
  },
  stepText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'right',
  },
  stepContent: {
    alignItems: 'center',
    marginBottom: 32,
  },
  stepTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000',
    marginTop: 16,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputGroup: {
    width: '100%',
    marginTop: 16,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginBottom: 8,
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    marginBottom: 16,
    backgroundColor: '#f9f9f9',
  },
  countryCode: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
    marginRight: 8,
  },
  input: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 14,
    color: '#000',
  },
  otpInput: {
    fontSize: 20,
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingVertical: 12,
    backgroundColor: '#f9f9f9',
  },
  otpHint: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 8,
    marginBottom: 12,
    gap: 8,
  },
  primaryButton: {
    backgroundColor: '#2196F3',
  },
  secondaryButton: {
    backgroundColor: '#f0f0f0',
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#666',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 16,
    gap: 8,
  },
  backButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2196F3',
  },
  changePhoneText: {
    fontSize: 13,
    color: '#2196F3',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 12,
  },
  paymentOptions: {
    width: '100%',
    marginBottom: 24,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderWidth: 2,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#fff',
  },
  paymentOptionSelected: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  paymentOptionContent: {
    flex: 1,
    marginLeft: 16,
  },
  paymentLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  paymentLabelSelected: {
    color: '#2196F3',
  },
  paymentDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
  },
  radioButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#e0e0e0',
  },
  radioButtonSelected: {
    borderColor: '#2196F3',
  },
  radioButtonInner: {
    flex: 1,
    borderRadius: 8,
    backgroundColor: '#2196F3',
    margin: 2,
  },
  skipText: {
    fontSize: 13,
    color: '#2196F3',
    textAlign: 'center',
    fontWeight: '600',
    marginTop: 16,
  },
});
