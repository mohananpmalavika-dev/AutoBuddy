import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';

import { apiRequest, API_BASE_URL } from '../lib/api';
import { normalizeAdminPaymentOptions, requiresUtrForPaymentMethod } from '../lib/paymentOptions';
import { COLORS } from '../theme';
import PremiumCard from '../components/PremiumCard';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';

const LAUNCH_BANNER_SOURCE = require('../../assets/images/autobuddy-logo.jpg');
const ROLE_OPTIONS = ['passenger', 'driver', 'operator'];
const GENDER_OPTIONS = ['male', 'female', 'other'];
const AUTH_METHODS = [
  { key: 'password', label: 'Password' },
  { key: 'google', label: 'Google' },
];
const REGISTER_AUTH_METHODS = [
  { key: 'google', label: 'Google' },
  { key: 'password', label: 'Password' },
];
const INDIAN_PHONE_REGEX = /^[6-9]\d{9}$/;

try {
  WebBrowser.maybeCompleteAuthSession({ skipRedirectCheck: true });
} catch (error) {
  console.warn('Google auth session completion skipped:', error?.message || error);
}

const toTitleCase = (value) => value.charAt(0).toUpperCase() + value.slice(1);
const hasStrongPassword = (value) => /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value);

function isTemporaryLoginFailure(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 503 ||
    message.includes('temporarily unavailable') ||
    message.includes('service unavailable')
  );
}

function shouldFallbackGoogleRequest(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 503 ||
    message.includes('database unavailable') ||
    message.includes('database temporarily unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('service unavailable') ||
    message.includes('network timeout') ||
    message.includes('network request failed') ||
    message.includes('failed to fetch')
  );
}

function isOperatorRoleSchemaMismatch(error, attemptedRole) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  const mentionsRoleField = message.includes('body.role') || message.includes('role');
  const mentionsOldRoleChoices =
    message.includes("input should be 'passenger', 'driver' or 'admin'") ||
    (message.includes('passenger') && message.includes('driver') && message.includes('admin'));
  return (
    attemptedRole === 'operator' &&
    status === 422 &&
    mentionsRoleField &&
    mentionsOldRoleChoices
  );
}

function shouldRetryGoogleAsLogin(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    message.includes('already registered') ||
    message.includes('database temporarily unavailable') ||
    message.includes('temporarily unavailable') ||
    status === 503
  );
}

function isRegistrationPendingVerification(error) {
  const status = Number(error?.status || 0);
  const message = String(error?.message || '').toLowerCase();
  return (
    status === 403 &&
    (message.includes('registration payment verification is in progress') ||
      message.includes('pending admin'))
  );
}

export default function AuthScreen({ onAuthenticated }) {
  const [authMethod, setAuthMethod] = useState('password');
  const [mode, setMode] = useState('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [registerEmailOtp, setRegisterEmailOtp] = useState('');
  const [registerReferralCode, setRegisterReferralCode] = useState('');
  const [registerEmailOtpSent, setRegisterEmailOtpSent] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState('');
  const [gender, setGender] = useState('');
  const [registrationFees, setRegistrationFees] = useState({
    passenger_registration_fee: 0,
    driver_registration_fee: 0,
    operator_registration_fee: 0,
    enable_qr: false,
    enable_razorpay: false,
    registration_qr_code_url: '',
    registration_upi_id: '',
    razorpay_payment_link: '',
  });
  const [registrationFeeAccepted, setRegistrationFeeAccepted] = useState(false);
  const [registrationPaymentMethod, setRegistrationPaymentMethod] = useState('');
  const [registrationPaymentUtr, setRegistrationPaymentUtr] = useState('');

  const GOOGLE_EXPO_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID;
  const GOOGLE_ANDROID_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const GOOGLE_IOS_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
  const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;

  const missingGoogleClientIdEnv = useMemo(() => {
    if (Platform.OS === 'web') {
      return GOOGLE_WEB_CLIENT_ID ? [] : ['EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID'];
    }

    const nativeClientId =
      Platform.OS === 'android'
        ? GOOGLE_ANDROID_CLIENT_ID
        : Platform.OS === 'ios'
          ? GOOGLE_IOS_CLIENT_ID
          : GOOGLE_EXPO_CLIENT_ID;

    if (nativeClientId) {
      return [];
    }

    return Platform.OS === 'android'
      ? ['EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID or EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID']
      : ['EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID or EXPO_PUBLIC_GOOGLE_EXPO_CLIENT_ID'];
  }, [GOOGLE_ANDROID_CLIENT_ID, GOOGLE_EXPO_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID]);

  const isGoogleConfiguredForPlatform = missingGoogleClientIdEnv.length === 0;
  const googleRedirectUri = useMemo(
    () => {
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.origin) {
        return `${window.location.origin}/app`;
      }
      return AuthSession.makeRedirectUri();
    },
    [],
  );

  const googleConfig = useMemo(() => {
    const config = { redirectUri: googleRedirectUri };
    if (GOOGLE_EXPO_CLIENT_ID) {
      config.expoClientId = GOOGLE_EXPO_CLIENT_ID;
    }
    if (GOOGLE_ANDROID_CLIENT_ID) {
      config.androidClientId = GOOGLE_ANDROID_CLIENT_ID;
    }
    if (GOOGLE_IOS_CLIENT_ID) {
      config.iosClientId = GOOGLE_IOS_CLIENT_ID;
    }
    if (GOOGLE_WEB_CLIENT_ID) {
      config.webClientId = GOOGLE_WEB_CLIENT_ID;
    }
    return config;
  }, [GOOGLE_ANDROID_CLIENT_ID, GOOGLE_EXPO_CLIENT_ID, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID, googleRedirectUri]);

  const [googleRequest, , promptGoogleAsync] = Google.useIdTokenAuthRequest(googleConfig);

  const isLogin = mode === 'login';
  const authMethodsForMode = isLogin ? AUTH_METHODS : REGISTER_AUTH_METHODS;
  const selectedRegistrationFee = useMemo(() => {
    if (!role) {
      return 0;
    }
    if (role === 'driver') {
      return Number(registrationFees.driver_registration_fee || 0);
    }
    if (role === 'operator') {
      return Number(registrationFees.operator_registration_fee || 0);
    }
    return Number(registrationFees.passenger_registration_fee || 0);
  }, [
    registrationFees.driver_registration_fee,
    registrationFees.operator_registration_fee,
    registrationFees.passenger_registration_fee,
    role,
  ]);
  const registrationPaymentConfig = useMemo(
    () => normalizeAdminPaymentOptions(registrationFees),
    [registrationFees],
  );

  const resetFeedback = () => {
    setError('');
    setSuccess('');
  };

  useEffect(() => {
    let isMounted = true;
    async function loadRegistrationFees() {
      try {
        const data = await apiRequest('/registration/fees');
        if (isMounted && data) {
          setRegistrationFees({
            passenger_registration_fee: Number(data.passenger_registration_fee || 0),
            driver_registration_fee: Number(data.driver_registration_fee || 0),
            operator_registration_fee: Number(data.operator_registration_fee || 0),
            enable_qr: Boolean(data.enable_qr),
            enable_razorpay: Boolean(data.enable_razorpay),
            registration_qr_code_url: String(data.registration_qr_code_url || ''),
            registration_upi_id: String(data.registration_upi_id || ''),
            razorpay_payment_link: String(data.razorpay_payment_link || ''),
          });
        }
      } catch {
        // Keep defaults if fee endpoint is unavailable.
      }
    }
    loadRegistrationFees();
    return () => {
      isMounted = false;
    };
  }, []);

  const authenticateAndEnter = (data) => {
    onAuthenticated?.({
      token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    });
  };

  const submitGoogleIdToken = async (googleIdToken, extraPayload = {}, options = {}) => {
    const { preserveFeedback = false } = options;
    try {
      setLoading(true);
      if (!preserveFeedback) {
        resetFeedback();
      }
      const payload = { google_id_token: googleIdToken, ...extraPayload };
      let data = null;
      try {
        data = await apiRequest('/auth/google', {
          method: 'POST',
          body: payload,
        });
      } catch (primaryError) {
        if (
          shouldFallbackGoogleRequest(primaryError) ||
          isOperatorRoleSchemaMismatch(primaryError, payload?.role)
        ) {
          data = await apiRequest('/auth/_legacy/google', {
            method: 'POST',
            body: payload,
          });
        } else {
          throw primaryError;
        }
      }
      authenticateAndEnter(data);
      return data;
    } catch (err) {
      if (!preserveFeedback) {
        setError(err.message || 'Google login failed.');
      }
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordAuth = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const normalizedPhone = String(phone || '').trim();
    const normalizedPassword = String(password || '').trim();
    const normalizedConfirmPassword = String(confirmPassword || '').trim();
    const normalizedEmailOtp = String(registerEmailOtp || '').trim();
    const normalizedReferralCode = String(registerReferralCode || '').trim().toUpperCase();
    if (!normalizedEmail || !normalizedPassword) {
      setError('Email and password are required.');
      return;
    }
    if (!isLogin) {
      if (!name.trim() || !normalizedPhone) {
        setError('Name, phone, email, and password are required for registration.');
        return;
      }
      if (!INDIAN_PHONE_REGEX.test(normalizedPhone)) {
        setError('Enter a valid 10-digit Indian mobile number (starts with 6-9).');
        return;
      }
      if (!role) {
        setError('Select a role to continue registration.');
        return;
      }
      if (!gender) {
        setError('Select gender to continue registration.');
        return;
      }
      if (normalizedPassword.length < 8) {
        setError('Password must be at least 8 characters.');
        return;
      }
      if (!hasStrongPassword(normalizedPassword)) {
        setError('Password must include uppercase, lowercase, and a number.');
        return;
      }
      if (!normalizedConfirmPassword) {
        setError('Please re-enter password.');
        return;
      }
      if (normalizedConfirmPassword !== normalizedPassword) {
        setError('Passwords do not match.');
        return;
      }
      if (!registerEmailOtpSent) {
        setError('Send email OTP first.');
        return;
      }
      if (!normalizedEmailOtp) {
        setError('Enter email OTP to complete registration.');
        return;
      }
      if (selectedRegistrationFee > 0 && !registrationPaymentMethod) {
        setError('Select a registration payment method.');
        return;
      }
      if (
        selectedRegistrationFee > 0 &&
        requiresUtrForPaymentMethod(registrationPaymentMethod) &&
        !registrationPaymentUtr.trim()
      ) {
        setError('Enter UTR for QR/UPI payment.');
        return;
      }
      if (selectedRegistrationFee > 0 && !registrationFeeAccepted) {
        setError(`Please confirm registration fee payment of Rs ${selectedRegistrationFee.toFixed(2)}.`);
        return;
      }
    }

    try {
      setLoading(true);
      resetFeedback();

      const path = isLogin ? '/auth/login' : '/auth/register';
      const payload = isLogin
        ? { email: normalizedEmail, password: normalizedPassword }
        : {
            email: normalizedEmail,
            password: normalizedPassword,
            name: name.trim(),
            phone: normalizedPhone,
            role,
            gender,
            email_otp: normalizedEmailOtp,
            referral_code: normalizedReferralCode || undefined,
            registration_fee_ack: selectedRegistrationFee <= 0 || registrationFeeAccepted,
            registration_payment_method: selectedRegistrationFee > 0 ? registrationPaymentMethod : undefined,
            registration_payment_utr:
              selectedRegistrationFee > 0 && requiresUtrForPaymentMethod(registrationPaymentMethod)
                ? registrationPaymentUtr.trim()
                : undefined,
          };

      let data = null;
      try {
        data = await apiRequest(path, { method: 'POST', body: payload });
      } catch (primaryError) {
        if (isLogin && isTemporaryLoginFailure(primaryError)) {
          data = await apiRequest('/auth/_legacy/login', { method: 'POST', body: payload });
        } else if (!isLogin && isOperatorRoleSchemaMismatch(primaryError, payload?.role)) {
          data = await apiRequest('/auth/_legacy/register', { method: 'POST', body: payload });
        } else {
          throw primaryError;
        }
      }
      authenticateAndEnter(data);
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      setError('Enter email address first.');
      return;
    }
    try {
      setLoading(true);
      resetFeedback();
      const data = await apiRequest('/auth/email-otp/send', {
        method: 'POST',
        body: { email: normalizedEmail },
      });
      setRegisterEmailOtpSent(true);
      const demoCodeHint = __DEV__ && data?.otp_demo ? ` Demo OTP: ${data.otp_demo}` : '';
      setSuccess(`Email OTP sent.${demoCodeHint}`);
    } catch (err) {
      setError(err.message || 'Could not send email OTP.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    if (!isGoogleConfiguredForPlatform) {
      setError(`Google login is not configured for this platform. Set ${missingGoogleClientIdEnv.join(', ')}.`);
      return;
    }
    if (!googleRequest) {
      setError('Google auth is not ready yet. Please try again.');
      return;
    }
    const normalizedName = String(name || '').trim();
    const normalizedPhone = String(phone || '').trim();
    const normalizedReferralCode = String(registerReferralCode || '').trim().toUpperCase();
    if (!isLogin) {
      if (!normalizedName || !normalizedPhone) {
        setError('Name and phone number are required for Google registration.');
        return;
      }
      if (!INDIAN_PHONE_REGEX.test(normalizedPhone)) {
        setError('Enter a valid 10-digit Indian mobile number (starts with 6-9).');
        return;
      }
      if (!role) {
        setError('Select a role to continue registration.');
        return;
      }
      if (!gender) {
        setError('Select gender to continue registration.');
        return;
      }
      if (selectedRegistrationFee > 0 && !registrationPaymentMethod) {
        setError('Select a registration payment method.');
        return;
      }
      if (
        selectedRegistrationFee > 0 &&
        requiresUtrForPaymentMethod(registrationPaymentMethod) &&
        !registrationPaymentUtr.trim()
      ) {
        setError('Enter UTR for QR/UPI payment.');
        return;
      }
      if (selectedRegistrationFee > 0 && !registrationFeeAccepted) {
        setError(`Please confirm registration fee payment of Rs ${selectedRegistrationFee.toFixed(2)}.`);
        return;
      }
    }

    try {
      resetFeedback();
      const result = await promptGoogleAsync(
        Platform.OS === 'web'
          ? { windowFeatures: { width: 520, height: 680 } }
          : undefined,
      );

      if (result.type === 'success') {
        const tokenFromParams = result.params?.id_token;
        const tokenFromAuth = result.authentication?.idToken;
        const idToken = tokenFromParams || tokenFromAuth;
        if (!idToken) {
          setError('Google login did not return an ID token.');
          return;
        }
        if (isLogin) {
          await submitGoogleIdToken(idToken, { mode: 'login' });
          return;
        }

        const registerPayload = {
          mode: 'register',
          name: normalizedName,
          phone: normalizedPhone,
          role,
          gender,
          referral_code: normalizedReferralCode || undefined,
          registration_fee_ack: selectedRegistrationFee <= 0 || registrationFeeAccepted,
          registration_payment_method: selectedRegistrationFee > 0 ? registrationPaymentMethod : undefined,
          registration_payment_utr:
            selectedRegistrationFee > 0 && requiresUtrForPaymentMethod(registrationPaymentMethod)
              ? registrationPaymentUtr.trim()
              : undefined,
        };

        try {
          await submitGoogleIdToken(idToken, registerPayload);
        } catch (registerError) {
          if (isRegistrationPendingVerification(registerError)) {
            resetFeedback();
            setMode('login');
            setAuthMethod('google');
            setSuccess('Registration submitted successfully. Await admin verification, then login with Google.');
            return;
          }

          if (shouldRetryGoogleAsLogin(registerError)) {
            resetFeedback();
            setSuccess('Account seems created already. Trying Google login...');
            try {
              await submitGoogleIdToken(idToken, { mode: 'login' }, { preserveFeedback: true });
              return;
            } catch (loginRetryError) {
              setError(loginRetryError.message || 'Google login failed after registration retry.');
              return;
            }
          }
          throw registerError;
        }
        return;
      }

      if (result.type === 'dismiss' || result.type === 'cancel') {
        setError('Google login was canceled.');
        return;
      }
      if (result.type === 'error') {
        const providerError =
          result?.params?.error_description ||
          result?.params?.error ||
          result?.errorCode ||
          'Google authentication returned an error.';
        setError(String(providerError));
        return;
      }

      setError('Google login failed.');
    } catch (err) {
      const raw = String(err?.message || '').toLowerCase();
      if (raw.includes('popup') || raw.includes('closed') || raw.includes('dismiss')) {
        setError('Google popup was blocked or closed. Please allow popups and try again.');
        return;
      }
      setError(err.message || 'Google login failed.');
    }
  };

  const openRazorpayLink = async () => {
    const link = String(registrationFees.razorpay_payment_link || '').trim();
    if (!link) {
      setError('Razorpay link is not configured by admin.');
      return;
    }
    try {
      await Linking.openURL(link);
    } catch {
      setError('Could not open Razorpay link.');
    }
  };

  const renderRegistrationFeeControls = () => {
    if (selectedRegistrationFee <= 0) {
      return null;
    }

    const noMethodEnabled = registrationPaymentConfig.methods.length === 0;

    return (
      <View style={styles.feeCard}>
        <Text style={styles.feeTitle}>Registration Fee</Text>
        <Text style={styles.feeAmount}>Rs {selectedRegistrationFee.toFixed(2)}</Text>
        {noMethodEnabled ? (
          <Text style={styles.hintText}>Payment method not configured by admin.</Text>
        ) : (
          <>
            <Text style={styles.inputLabel}>Payment Method</Text>
            <View style={styles.paymentMethodRow}>
              {registrationPaymentConfig.methods.map((method) => (
                <TouchableOpacity
                  key={method.key}
                  style={[
                    styles.paymentMethodChip,
                    registrationPaymentMethod === method.key && styles.paymentMethodChipActive,
                  ]}
                  onPress={() => {
                    setRegistrationPaymentMethod(method.key);
                    setRegistrationPaymentUtr('');
                    setRegistrationFeeAccepted(false);
                  }}>
                  <Text
                    style={[
                      styles.paymentMethodChipText,
                      registrationPaymentMethod === method.key && styles.paymentMethodChipTextActive,
                    ]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {registrationPaymentMethod === 'qr' && (
              <>
                {!!registrationPaymentConfig.qrCodeUrl && (
                  <Image
                    source={{ uri: registrationPaymentConfig.qrCodeUrl }}
                    style={styles.registrationQrImage}
                    resizeMode="contain"
                  />
                )}
                {!!registrationPaymentConfig.upiId && (
                  <Text style={styles.hintText}>UPI: {registrationPaymentConfig.upiId}</Text>
                )}
              </>
            )}

            {requiresUtrForPaymentMethod(registrationPaymentMethod) && (
              <>
                <Text style={styles.inputLabel}>UTR Number</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={registrationPaymentUtr}
                  onChangeText={setRegistrationPaymentUtr}
                  placeholder="Enter UTR after QR/UPI payment"
                  placeholderTextColor={COLORS.textMuted}
                />
              </>
            )}

            {registrationPaymentMethod === 'razorpay' && (
              <TouchableOpacity
                style={[styles.secondaryButton, loading && styles.primaryButtonDisabled]}
                onPress={openRazorpayLink}
                disabled={loading}>
                <Text style={styles.secondaryText}>Open Razorpay Payment Link</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        <TouchableOpacity
          style={[styles.secondaryButton, registrationFeeAccepted && styles.feeConfirmedBtn]}
          onPress={() => setRegistrationFeeAccepted((prev) => !prev)}
          disabled={loading || noMethodEnabled}>
          <Text style={[styles.secondaryText, registrationFeeAccepted && styles.feeConfirmedText]}>
            {registrationFeeAccepted ? 'Payment Submitted' : 'I Have Paid Registration Fee'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <PremiumCard style={styles.card}>
          <WebCommandBar showLanguageSelector />
          <View style={styles.brandHeader}>
            <Image
              source={LAUNCH_BANNER_SOURCE}
              style={[styles.launchBanner, Platform.OS === 'web' && styles.launchBannerWeb]}
              resizeMode="contain"
            />
            <View style={styles.brandCopy}>
              <Text style={styles.title}>{isLogin ? 'Welcome' : 'Create Account'}</Text>
              <Text style={styles.tagline}>Book your auto quickly, safely and easily</Text>
            </View>
          </View>
          <Text style={styles.subtitle}>Choose login or register, then select a method</Text>

          <View style={styles.modeRow}>
            <TouchableOpacity
              onPress={() => {
                setMode('login');
                setAuthMethod('password');
                setConfirmPassword('');
                setRegisterEmailOtp('');
                setRegisterReferralCode('');
                setRegisterEmailOtpSent(false);
                setGender('');
                setRegistrationFeeAccepted(false);
                setRegistrationPaymentMethod('');
                setRegistrationPaymentUtr('');
                resetFeedback();
              }}
              style={[styles.modeButton, isLogin && styles.modeButtonActive]}>
              <Text style={[styles.modeText, isLogin && styles.modeTextActive]}>Login</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setMode('register');
                setAuthMethod(isGoogleConfiguredForPlatform ? 'google' : 'password');
                setConfirmPassword('');
                setRegisterEmailOtp('');
                setRegisterReferralCode('');
                setRegisterEmailOtpSent(false);
                setGender('');
                setRegistrationFeeAccepted(false);
                setRegistrationPaymentMethod('');
                setRegistrationPaymentUtr('');
                resetFeedback();
              }}
              style={[styles.modeButton, !isLogin && styles.modeButtonActive]}>
              <Text style={[styles.modeText, !isLogin && styles.modeTextActive]}>Register</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.methodRow}>
            {authMethodsForMode.map((method) => {
              const methodUnavailable = method.key === 'google' && !isGoogleConfiguredForPlatform;
              return (
                <TouchableOpacity
                  key={method.key}
                  onPress={() => {
                    if (methodUnavailable) {
                      setError(`Google sign-in is not configured for this platform. Set ${missingGoogleClientIdEnv.join(', ')}.`);
                      return;
                    }
                    setAuthMethod(method.key);
                    resetFeedback();
                  }}
                  disabled={methodUnavailable}
                  style={[
                    styles.methodChip,
                    methodUnavailable && styles.methodChipDisabled,
                    authMethod === method.key && styles.methodChipActive,
                  ]}>
                  <Text style={[styles.methodChipText, authMethod === method.key && styles.methodChipTextActive]}>
                    {method.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {authMethod === 'password' && (
            <>
              {!isLogin && (
                <>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <VoiceTextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter full name" placeholderTextColor={COLORS.textMuted} />
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <VoiceTextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Enter phone number" keyboardType="phone-pad" placeholderTextColor={COLORS.textMuted} />
                  <View style={styles.roleRow}>
                    {ROLE_OPTIONS.map((candidate) => (
                      <TouchableOpacity
                        key={candidate}
                        style={[styles.roleChip, role === candidate && styles.roleChipActive]}
                        onPress={() => {
                          setRole(candidate);
                          setRegistrationFeeAccepted(false);
                          setRegistrationPaymentMethod('');
                          setRegistrationPaymentUtr('');
                        }}>
                        <Text style={[styles.roleChipText, role === candidate && styles.roleChipTextActive]}>
                          {toTitleCase(candidate)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.inputLabel}>Gender</Text>
                  <View style={styles.roleRow}>
                    {GENDER_OPTIONS.map((candidate) => (
                      <TouchableOpacity
                        key={candidate}
                        style={[styles.roleChip, gender === candidate && styles.roleChipActive]}
                        onPress={() => setGender(candidate)}>
                        <Text style={[styles.roleChipText, gender === candidate && styles.roleChipTextActive]}>
                          {toTitleCase(candidate)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.inputLabel}>Referral Code (Optional)</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={registerReferralCode}
                    onChangeText={setRegisterReferralCode}
                    placeholder="Enter referral code"
                    autoCapitalize="characters"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {renderRegistrationFeeControls()}
                </>
              )}

              <Text style={styles.inputLabel}>Email Address</Text>
              <VoiceTextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="Enter email address" keyboardType="email-address" autoCapitalize="none" placeholderTextColor={COLORS.textMuted} />
              <Text style={styles.inputLabel}>{isLogin ? 'Password' : 'Password (min 8 chars)'}</Text>
              {!isLogin && (
                <Text style={styles.hintText}>Use at least 8 chars with uppercase, lowercase, and a number.</Text>
              )}
              <VoiceTextInput
                style={styles.input}
                value={password}
                onChangeText={setPassword}
                placeholder={isLogin ? 'Enter password' : 'Enter password'}
                secureTextEntry
                keyboardType="default"
                maxLength={64}
                placeholderTextColor={COLORS.textMuted}
              />
              {!isLogin && (
                <>
                  <Text style={styles.inputLabel}>Confirm Password</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Re-enter password"
                    secureTextEntry
                    keyboardType="default"
                    maxLength={64}
                    placeholderTextColor={COLORS.textMuted}
                  />
                  <TouchableOpacity
                    style={[styles.secondaryButton, loading && styles.primaryButtonDisabled]}
                    onPress={handleSendEmailOtp}
                    disabled={loading}>
                    <Text style={styles.secondaryText}>
                      {registerEmailOtpSent ? 'Resend Email OTP' : 'Send Email OTP'}
                    </Text>
                  </TouchableOpacity>
                  <Text style={styles.inputLabel}>Email OTP</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={registerEmailOtp}
                    onChangeText={setRegisterEmailOtp}
                    placeholder="Enter OTP from email"
                    keyboardType="number-pad"
                    placeholderTextColor={COLORS.textMuted}
                  />
                </>
              )}

              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handlePasswordAuth}
                disabled={loading}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{isLogin ? 'Login' : 'Register'}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {authMethod === 'google' && (
            <>
              {!isLogin && (
                <>
                  <Text style={styles.inputLabel}>Full Name</Text>
                  <VoiceTextInput style={styles.input} value={name} onChangeText={setName} placeholder="Enter full name" placeholderTextColor={COLORS.textMuted} />
                  <Text style={styles.inputLabel}>Phone Number</Text>
                  <VoiceTextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Enter phone number" keyboardType="phone-pad" placeholderTextColor={COLORS.textMuted} />
                  <View style={styles.roleRow}>
                    {ROLE_OPTIONS.map((candidate) => (
                      <TouchableOpacity
                        key={candidate}
                        style={[styles.roleChip, role === candidate && styles.roleChipActive]}
                        onPress={() => {
                          setRole(candidate);
                          setRegistrationFeeAccepted(false);
                          setRegistrationPaymentMethod('');
                          setRegistrationPaymentUtr('');
                        }}>
                        <Text style={[styles.roleChipText, role === candidate && styles.roleChipTextActive]}>
                          {toTitleCase(candidate)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.inputLabel}>Gender</Text>
                  <View style={styles.roleRow}>
                    {GENDER_OPTIONS.map((candidate) => (
                      <TouchableOpacity
                        key={candidate}
                        style={[styles.roleChip, gender === candidate && styles.roleChipActive]}
                        onPress={() => setGender(candidate)}>
                        <Text style={[styles.roleChipText, gender === candidate && styles.roleChipTextActive]}>
                          {toTitleCase(candidate)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <Text style={styles.inputLabel}>Referral Code (Optional)</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={registerReferralCode}
                    onChangeText={setRegisterReferralCode}
                    placeholder="Enter referral code"
                    autoCapitalize="characters"
                    placeholderTextColor={COLORS.textMuted}
                  />
                  {renderRegistrationFeeControls()}
                </>
              )}
              <Text style={styles.hintText}>
                {isLogin
                  ? 'Tap Continue with Google to open the sign-in popup.'
                  : 'Name and phone are required for Google registration.'}
              </Text>
              <TouchableOpacity
                style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
                onPress={handleGoogleAuth}
                disabled={loading || !googleRequest || !isGoogleConfiguredForPlatform}>
                {loading ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>{isLogin ? 'Continue with Google' : 'Register with Google'}</Text>
                )}
              </TouchableOpacity>
            </>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!success && <Text style={styles.success}>{success}</Text>}

          {!!__DEV__ && <Text style={styles.apiText}>API: {API_BASE_URL}</Text>}
        </PremiumCard>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
    padding: 22,
    borderRadius: 26,
    borderColor: '#CCE0D2',
    backgroundColor: '#FFFFFF',
    shadowColor: '#0C4D2A',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  brandHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  launchBanner: {
    width: '100%',
    height: 260,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
  },
  launchBannerWeb: {
    objectPosition: 'center top',
  },
  brandCopy: {
    alignItems: 'center',
  },
  title: {
    color: '#10291B',
    fontSize: 30,
    lineHeight: 34,
    fontWeight: '900',
  },
  tagline: {
    marginTop: 4,
    color: '#6B7B70',
    fontSize: 15,
    lineHeight: 19,
    textAlign: 'center',
  },
  subtitle: {
    color: '#617368',
    marginTop: 4,
    marginBottom: 16,
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  methodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 18,
  },
  methodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CDDCD1',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F6FAF7',
  },
  methodChipDisabled: {
    opacity: 0.45,
  },
  methodChipActive: {
    backgroundColor: '#0D7A3A',
    borderColor: '#0B6A32',
    shadowColor: '#0B6A32',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  methodChipText: {
    color: '#5E6F64',
    fontWeight: '700',
    fontSize: 13,
  },
  methodChipTextActive: {
    color: '#FFFFFF',
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: '#ECF2EE',
    borderRadius: 14,
    padding: 4,
    marginBottom: 18,
  },
  modeButton: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: 'transparent' },
  modeButtonActive: {
    backgroundColor: '#0D7A3A',
    borderColor: '#095A2B',
    shadowColor: '#0C873F',
    shadowOpacity: 0.16,
    shadowRadius: 7,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  modeText: { color: '#5E6F64', fontWeight: '700', fontSize: 14 },
  modeTextActive: { color: '#fff' },
  inputLabel: {
    color: '#1E3126',
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
    marginLeft: 2,
  },
  input: {
    backgroundColor: '#FBFDFC',
    borderWidth: 1,
    borderColor: '#C9D9CE',
    borderRadius: 12,
    color: COLORS.text,
    paddingVertical: 12,
    paddingHorizontal: 13,
    marginBottom: 12,
    fontSize: 15,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  roleChip: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#CBD9D0',
    paddingVertical: 10,
    backgroundColor: '#F6FAF7',
  },
  roleChipActive: {
    backgroundColor: '#E3F2E8',
    borderColor: '#0D7A3A',
  },
  roleChipText: { color: COLORS.muted, textTransform: 'capitalize', fontWeight: '600', fontSize: 13 },
  roleChipTextActive: { color: '#0B5F2D' },
  feeCard: {
    borderWidth: 1,
    borderColor: '#C8D9CE',
    borderRadius: 12,
    backgroundColor: '#F8FCF9',
    padding: 12,
    marginBottom: 12,
  },
  feeTitle: {
    color: '#1E3126',
    fontWeight: '700',
    marginBottom: 4,
  },
  feeAmount: {
    color: '#0D7A3A',
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 8,
  },
  paymentMethodRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  paymentMethodChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F6FAF7',
  },
  paymentMethodChipActive: {
    borderColor: '#0D7A3A',
    backgroundColor: '#E3F2E8',
  },
  paymentMethodChipText: {
    color: '#496051',
    fontWeight: '700',
  },
  paymentMethodChipTextActive: {
    color: '#0D7A3A',
  },
  registrationQrImage: {
    width: '100%',
    height: 180,
    borderRadius: 10,
    marginBottom: 8,
    backgroundColor: '#FFFFFF',
  },
  feeConfirmedBtn: {
    backgroundColor: '#E3F2E8',
    borderColor: '#0D7A3A',
  },
  feeConfirmedText: {
    color: '#0D7A3A',
  },
  error: {
    color: '#8F1F1F',
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#FDEBEB',
    borderColor: '#F6C4C4',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  success: {
    color: '#145A32',
    marginTop: 6,
    marginBottom: 8,
    backgroundColor: '#EAF8EF',
    borderColor: '#BFE7CB',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
  },
  primaryButton: {
    marginTop: 10,
    backgroundColor: '#0D7A3A',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: '#0A5F2E',
    shadowColor: '#0A5F2E',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  primaryButtonDisabled: { opacity: 0.65 },
  primaryText: { color: '#fff', fontWeight: '800', fontSize: 15, letterSpacing: 0.2 },
  secondaryButton: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#CBD8CF',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 10,
    backgroundColor: '#F7FAF8',
  },
  secondaryText: { color: '#234232', fontWeight: '700', fontSize: 14 },
  hintText: {
    color: '#617368',
    marginBottom: 10,
    marginTop: -2,
    fontSize: 12,
  },
  apiText: { marginTop: 12, color: COLORS.muted, fontSize: 12 },
});
