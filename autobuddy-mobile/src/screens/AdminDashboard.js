import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import AutoBuddyBrand from '../components/AutoBuddyBrand';
import AdminAnalyticsPanel from '../components/AdminAnalyticsPanel';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';

const SUBSCRIPTION_PERIOD_OPTIONS = ['monthly', 'quarterly', 'annually', 'per_trip'];
const RIDE_PRODUCT_KEYS = [
  'normal',
  'pool',
  'scheduled',
  'corporate',
  'airport',
  'intercity',
  'ev_auto',
  'tourism',
  'women_only',
  'rental_hourly',
  'school_elderly_safe',
];
const ADMIN_MENU_OPTIONS = [
  { key: 'analytics', label: 'Overview' },
  { key: 'trips', label: 'Ongoing Trips' },
  { key: 'users', label: 'Users & Live' },
  { key: 'spin', label: 'Spin & Win' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'phone', label: 'Phone Requests' },
  { key: 'pricing', label: 'Pricing & Fare' },
  { key: 'registration', label: 'Registration' },
  { key: 'kyc', label: 'KYC' },
];
const PRIMARY_ADMIN_MENU_KEY = 'analytics';
const SECONDARY_ADMIN_MENU_OPTIONS = ADMIN_MENU_OPTIONS.filter(
  (menu) => menu.key !== PRIMARY_ADMIN_MENU_KEY,
);

function emptyRoleSubscriptionConfig() {
  return {
    monthly: { amount: '0', active: false, scheme_start_at: '', scheme_end_at: '' },
    quarterly: { amount: '0', active: false, scheme_start_at: '', scheme_end_at: '' },
    annually: { amount: '0', active: false, scheme_start_at: '', scheme_end_at: '' },
    per_trip: { amount: '0', active: false, ride_threshold: '10', scheme_start_at: '', scheme_end_at: '' },
  };
}

function normalizeDateTimeText(value) {
  if (!value) {
    return '';
  }
  const stringValue = String(value).trim();
  if (!stringValue) {
    return '';
  }
  const normalized = stringValue.replace('T', ' ');
  return normalized.length > 16 ? normalized.slice(0, 16) : normalized;
}

function normalizeRoleSubscriptionConfig(roleConfig = {}) {
  return {
    monthly: {
      amount: String(roleConfig?.monthly?.amount ?? 0),
      active: Boolean(roleConfig?.monthly?.active),
      scheme_start_at: normalizeDateTimeText(roleConfig?.monthly?.scheme_start_at),
      scheme_end_at: normalizeDateTimeText(roleConfig?.monthly?.scheme_end_at),
    },
    quarterly: {
      amount: String(roleConfig?.quarterly?.amount ?? 0),
      active: Boolean(roleConfig?.quarterly?.active),
      scheme_start_at: normalizeDateTimeText(roleConfig?.quarterly?.scheme_start_at),
      scheme_end_at: normalizeDateTimeText(roleConfig?.quarterly?.scheme_end_at),
    },
    annually: {
      amount: String(roleConfig?.annually?.amount ?? 0),
      active: Boolean(roleConfig?.annually?.active),
      scheme_start_at: normalizeDateTimeText(roleConfig?.annually?.scheme_start_at),
      scheme_end_at: normalizeDateTimeText(roleConfig?.annually?.scheme_end_at),
    },
    per_trip: {
      amount: String(roleConfig?.per_trip?.amount ?? 0),
      active: Boolean(roleConfig?.per_trip?.active),
      ride_threshold: String(roleConfig?.per_trip?.ride_threshold ?? 10),
      scheme_start_at: normalizeDateTimeText(roleConfig?.per_trip?.scheme_start_at),
      scheme_end_at: normalizeDateTimeText(roleConfig?.per_trip?.scheme_end_at),
    },
  };
}

function defaultSpinWinPrizeState() {
  return {
    id: '',
    label: '',
    reward_type: 'cash',
    reward_value: '0',
    currency: 'INR',
    weight: '1',
    daily_stock: '',
    description: '',
    active: true,
  };
}

function defaultSpinWinConfigState() {
  return {
    enabled: false,
    daily_spin_limit: '1',
    eligible_roles: ['passenger'],
    included_user_ids: '',
    excluded_user_ids: '',
    starts_at: '',
    ends_at: '',
    prizes: [defaultSpinWinPrizeState()],
  };
}

function normalizeSpinWinConfig(config = null) {
  if (!config || typeof config !== 'object') {
    return defaultSpinWinConfigState();
  }
  const normalizedPrizes = Array.isArray(config.prizes) && config.prizes.length > 0
    ? config.prizes.map((prize) => ({
      id: String(prize?.id || ''),
      label: String(prize?.label || ''),
      reward_type: String(prize?.reward_type || 'cash'),
      reward_value: String(prize?.reward_value ?? 0),
      currency: String(prize?.currency || 'INR'),
      weight: String(prize?.weight ?? 1),
      daily_stock: prize?.daily_stock === null || prize?.daily_stock === undefined ? '' : String(prize.daily_stock),
      description: String(prize?.description || ''),
      active: Boolean(prize?.active ?? true),
    }))
    : [defaultSpinWinPrizeState()];
  return {
    enabled: Boolean(config.enabled),
    daily_spin_limit: String(config.daily_spin_limit ?? 1),
    eligible_roles: Array.isArray(config.eligible_roles) && config.eligible_roles.length > 0
      ? config.eligible_roles.map((role) => String(role).toLowerCase())
      : ['passenger'],
    included_user_ids: Array.isArray(config.included_user_ids) ? config.included_user_ids.join(', ') : '',
    excluded_user_ids: Array.isArray(config.excluded_user_ids) ? config.excluded_user_ids.join(', ') : '',
    starts_at: normalizeDateTimeText(config.starts_at),
    ends_at: normalizeDateTimeText(config.ends_at),
    prizes: normalizedPrizes,
  };
}

function normalizeRideProductDistrictConfig(config = null) {
  const defaultEnabledProducts = Array.isArray(config?.default_enabled_products)
    ? config.default_enabled_products
    : RIDE_PRODUCT_KEYS;
  const districtRules = Array.isArray(config?.district_rules) ? config.district_rules : [];
  return {
    default_enabled_products_text: defaultEnabledProducts.join(', '),
    district_rules_text: districtRules
      .map((rule) => {
        const district = String(rule?.district || '').trim();
        const products = Array.isArray(rule?.enabled_products) ? rule.enabled_products.join(',') : '';
        if (!district || !products) {
          return '';
        }
        return `${district}: ${products}`;
      })
      .filter(Boolean)
      .join('\n'),
  };
}

export default function AdminDashboard({ token, user, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({
    total_users: 0,
    total_drivers: 0,
    total_passengers: 0,
    active_bookings: 0,
    total_revenue: 0,
  });
  const [kycRequests, setKycRequests] = useState([]);
  const [pricingRules, setPricingRules] = useState({
    base_fare: '25',
    per_km_rate: '12',
    surge_multiplier: '1.5',
    night_multiplier: '1.3',
    minimum_fare: '30',
    driver_base_search_radius_km: '5',
    driver_long_distance_search_radius_km: '12',
    scheduled_booking_driver_radius_km: '10',
    driver_pickup_surcharge_per_km: '12',
    peak_hours: '8,9,17,18,19',
  });
  const [registrationFees, setRegistrationFees] = useState({
    passenger_registration_fee: '0',
    driver_registration_fee: '0',
    scheme_start_at: '',
    scheme_end_at: '',
    enable_qr: false,
    enable_razorpay: false,
    registration_qr_code_url: '',
    registration_upi_id: '',
    razorpay_payment_link: '',
  });
  const [pendingRegistrationPayments, setPendingRegistrationPayments] = useState([]);
  const [subscriptionConfig, setSubscriptionConfig] = useState({
    passenger: emptyRoleSubscriptionConfig(),
    driver: emptyRoleSubscriptionConfig(),
  });
  const [pendingSubscriptionActivations, setPendingSubscriptionActivations] = useState([]);
  const [pendingSubscriptionPayments, setPendingSubscriptionPayments] = useState([]);
  const [pendingPhoneChangeRequests, setPendingPhoneChangeRequests] = useState([]);
  const [pendingDriverFareRequests, setPendingDriverFareRequests] = useState([]);
  const [approvedDriverFareConfigs, setApprovedDriverFareConfigs] = useState([]);
  const [ongoingTrips, setOngoingTrips] = useState([]);
  const [tripCancelReasons, setTripCancelReasons] = useState({});
  const [activeAdminMenu, setActiveAdminMenu] = useState(PRIMARY_ADMIN_MENU_KEY);
  const [showAdminMenus, setShowAdminMenus] = useState(false);
  const [driverUsers, setDriverUsers] = useState([]);
  const [passengerUsers, setPassengerUsers] = useState([]);
  const [liveCounts, setLiveCounts] = useState({
    drivers_live: 0,
    passengers_live: 0,
    total_live: 0,
  });
  const [spinWinConfig, setSpinWinConfig] = useState(defaultSpinWinConfigState());
  const [spinWinWinners, setSpinWinWinners] = useState([]);
  const [rideProductDistrictConfig, setRideProductDistrictConfig] = useState(
    normalizeRideProductDistrictConfig(null),
  );

  const runAction = async (fn, successText) => {
    try {
      setLoading(true);
      setError('');
      if (successText) {
        setMessage('');
      }
      const result = await fn();
      if (successText) {
        setMessage(successText);
      }
      return result;
    } catch (err) {
      setError(err.message || 'Request failed.');
      return null;
    } finally {
      setLoading(false);
    }
  };

  const refreshAdminData = async () => {
    const dashboard = await runAction(() => apiRequest('/admin/dashboard', { token }));
    const pending = await apiRequest('/admin/kyc/pending', { token }).catch(() => []);
    const pricingSettings = await apiRequest('/pricing/rules', { token }).catch(() => null);
    const feeSettings = await apiRequest('/admin/registration-fees/config', { token }).catch(() => null);
    const pendingRegistrations = await apiRequest('/admin/registration-payments/pending', { token }).catch(() => []);
    const subscriptionSettings = await apiRequest('/subscriptions/config', { token }).catch(() => null);
    const pendingSubscriptions = await apiRequest('/admin/subscriptions/pending', { token }).catch(() => []);
    const pendingSubscriptionPaymentRows = await apiRequest('/admin/subscriptions/payments/pending', { token }).catch(() => []);
    const pendingPhoneChanges = await apiRequest('/admin/phone-changes/pending', { token }).catch(() => []);
    const pendingDriverFare = await apiRequest('/admin/driver-fare-calculator/pending', { token }).catch(() => []);
    const approvedDriverFare = await apiRequest('/admin/driver-fare-calculator/approved', { token }).catch(() => []);
    const activeTrips = await apiRequest('/admin/bookings/ongoing', { token }).catch(() => []);
    const usersLiveStatus = await apiRequest('/admin/users/live-status', { token }).catch(() => null);
    const spinWinSettings = await apiRequest('/admin/spin-win/config', { token }).catch(() => null);
    const spinWinWinnerRows = await apiRequest('/admin/spin-win/winners', { token, query: { limit: 50 } }).catch(() => []);
    const rideProductsDistrictSettings = await apiRequest('/admin/ride-products/district-config', { token }).catch(() => null);

    if (dashboard) {
      setStats(dashboard);
    }
    if (pricingSettings) {
      setPricingRules({
        base_fare: String(pricingSettings.base_fare ?? 25),
        per_km_rate: String(pricingSettings.per_km_rate ?? 12),
        surge_multiplier: String(pricingSettings.surge_multiplier ?? 1.5),
        night_multiplier: String(pricingSettings.night_multiplier ?? 1.3),
        minimum_fare: String(pricingSettings.minimum_fare ?? 30),
        driver_base_search_radius_km: String(pricingSettings.driver_base_search_radius_km ?? 5),
        driver_long_distance_search_radius_km: String(pricingSettings.driver_long_distance_search_radius_km ?? 12),
        scheduled_booking_driver_radius_km: String(pricingSettings.scheduled_booking_driver_radius_km ?? 10),
        driver_pickup_surcharge_per_km: String(pricingSettings.driver_pickup_surcharge_per_km ?? pricingSettings.per_km_rate ?? 12),
        peak_hours: Array.isArray(pricingSettings.peak_hours) ? pricingSettings.peak_hours.join(',') : '8,9,17,18,19',
      });
    }
    setKycRequests(pending || []);
    if (feeSettings) {
      setRegistrationFees({
        passenger_registration_fee: String(feeSettings.passenger_registration_fee ?? 0),
        driver_registration_fee: String(feeSettings.driver_registration_fee ?? 0),
        scheme_start_at: normalizeDateTimeText(feeSettings.scheme_start_at),
        scheme_end_at: normalizeDateTimeText(feeSettings.scheme_end_at),
        enable_qr: Boolean(feeSettings.enable_qr),
        enable_razorpay: Boolean(feeSettings.enable_razorpay),
        registration_qr_code_url: String(feeSettings.registration_qr_code_url || ''),
        registration_upi_id: String(feeSettings.registration_upi_id || ''),
        razorpay_payment_link: String(feeSettings.razorpay_payment_link || ''),
      });
    }
    setPendingRegistrationPayments(Array.isArray(pendingRegistrations) ? pendingRegistrations : []);
    if (subscriptionSettings) {
      setSubscriptionConfig({
        passenger: normalizeRoleSubscriptionConfig(subscriptionSettings.passenger || {}),
        driver: normalizeRoleSubscriptionConfig(subscriptionSettings.driver || {}),
      });
    }
    setPendingSubscriptionActivations(Array.isArray(pendingSubscriptions) ? pendingSubscriptions : []);
    setPendingSubscriptionPayments(Array.isArray(pendingSubscriptionPaymentRows) ? pendingSubscriptionPaymentRows : []);
    setPendingPhoneChangeRequests(Array.isArray(pendingPhoneChanges) ? pendingPhoneChanges : []);
    setPendingDriverFareRequests(Array.isArray(pendingDriverFare) ? pendingDriverFare : []);
    setApprovedDriverFareConfigs(Array.isArray(approvedDriverFare) ? approvedDriverFare : []);
    setOngoingTrips(Array.isArray(activeTrips) ? activeTrips : []);
    setDriverUsers(Array.isArray(usersLiveStatus?.drivers) ? usersLiveStatus.drivers : []);
    setPassengerUsers(Array.isArray(usersLiveStatus?.passengers) ? usersLiveStatus.passengers : []);
    setLiveCounts({
      drivers_live: Number(usersLiveStatus?.live_counts?.drivers_live || 0),
      passengers_live: Number(usersLiveStatus?.live_counts?.passengers_live || 0),
      total_live: Number(usersLiveStatus?.live_counts?.total_live || 0),
    });
    if (spinWinSettings) {
      setSpinWinConfig(normalizeSpinWinConfig(spinWinSettings));
    }
    setSpinWinWinners(Array.isArray(spinWinWinnerRows) ? spinWinWinnerRows : []);
    if (rideProductsDistrictSettings) {
      setRideProductDistrictConfig(normalizeRideProductDistrictConfig(rideProductsDistrictSettings));
    }
    setMessage('Admin dashboard refreshed.');
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      refreshAdminData().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const updatePricingField = (key, value) => {
    setPricingRules((prev) => ({ ...prev, [key]: value }));
  };

  const savePricingRules = async () => {
    const baseFare = Number(pricingRules.base_fare || 0);
    const perKmRate = Number(pricingRules.per_km_rate || 0);
    const surgeMultiplier = Number(pricingRules.surge_multiplier || 1);
    const nightMultiplier = Number(pricingRules.night_multiplier || 1);
    const minimumFare = Number(pricingRules.minimum_fare || 0);
    const baseRadius = Number(pricingRules.driver_base_search_radius_km || 5);
    const longRadius = Number(pricingRules.driver_long_distance_search_radius_km || 12);
    const scheduledRadius = Number(pricingRules.scheduled_booking_driver_radius_km || 10);
    const pickupSurchargeRate = Number(pricingRules.driver_pickup_surcharge_per_km || perKmRate || 0);
    const peakHours = String(pricingRules.peak_hours || '')
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isInteger(value) && value >= 0 && value <= 23);

    if (
      [baseFare, perKmRate, surgeMultiplier, nightMultiplier, minimumFare, baseRadius, longRadius, scheduledRadius, pickupSurchargeRate]
        .some((value) => Number.isNaN(value) || value < 0)
    ) {
      setError('Pricing fields must be valid non-negative numbers.');
      return;
    }
    if (baseRadius < 0.5) {
      setError('Radius A must be at least 0.5 km.');
      return;
    }
    if (longRadius < baseRadius) {
      setError('Radius B must be greater than or equal to radius A.');
      return;
    }
    if (scheduledRadius < 0.5) {
      setError('Scheduled radius must be at least 0.5 km.');
      return;
    }

    const saved = await runAction(
      () =>
        apiRequest('/admin/pricing', {
          method: 'PUT',
          token,
          body: {
            base_fare: baseFare,
            per_km_rate: perKmRate,
            surge_multiplier: surgeMultiplier,
            night_multiplier: nightMultiplier,
            minimum_fare: minimumFare,
            driver_base_search_radius_km: baseRadius,
            driver_long_distance_search_radius_km: longRadius,
            scheduled_booking_driver_radius_km: scheduledRadius,
            driver_pickup_surcharge_per_km: pickupSurchargeRate,
            peak_hours: peakHours.length > 0 ? peakHours : [8, 9, 17, 18, 19],
          },
        }),
      'Pricing and driver radius rules updated.',
    );
    if (saved) {
      await refreshAdminData();
    }
  };

  const getFareLogicPreview = () => {
    const baseFare = Number(pricingRules.base_fare || 0);
    const perKmRate = Number(pricingRules.per_km_rate || 0);
    const minFare = Number(pricingRules.minimum_fare || 0);
    const surgeMultiplier = Number(pricingRules.surge_multiplier || 1);
    const radiusA = Number(pricingRules.driver_base_search_radius_km || 5);
    const pickupRate = Number(pricingRules.driver_pickup_surcharge_per_km || perKmRate || 0);

    const sampleTripDistanceKm = 6;
    const sampleDriverDistanceKm = radiusA + 3;
    const tripSubtotal = baseFare + (sampleTripDistanceKm * perKmRate);
    const tripFare = Math.max(minFare, tripSubtotal * surgeMultiplier);
    const extraPickupDistance = Math.max(0, sampleDriverDistanceKm - radiusA);
    const pickupSurcharge = extraPickupDistance * pickupRate;
    const totalFare = tripFare + pickupSurcharge;

    return {
      sampleTripDistanceKm,
      sampleDriverDistanceKm,
      extraPickupDistance,
      tripFare,
      pickupSurcharge,
      totalFare,
    };
  };

  const updateSubscriptionPlanField = (role, plan, field, value) => {
    setSubscriptionConfig((prev) => ({
      ...prev,
      [role]: {
        ...prev[role],
        [plan]: {
          ...prev[role][plan],
          [field]: value,
        },
      },
    }));
  };

  const saveSubscriptionConfig = async () => {
    const parseAmount = (value) => Number(value || 0);
    const parseThreshold = (value) => Number(value || 10);
    const normalizeDatePayload = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    };
    const payload = {
      passenger: {
        monthly: {
          amount: parseAmount(subscriptionConfig.passenger.monthly.amount),
          active: Boolean(subscriptionConfig.passenger.monthly.active),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.passenger.monthly.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.passenger.monthly.scheme_end_at),
        },
        quarterly: {
          amount: parseAmount(subscriptionConfig.passenger.quarterly.amount),
          active: Boolean(subscriptionConfig.passenger.quarterly.active),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.passenger.quarterly.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.passenger.quarterly.scheme_end_at),
        },
        annually: {
          amount: parseAmount(subscriptionConfig.passenger.annually.amount),
          active: Boolean(subscriptionConfig.passenger.annually.active),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.passenger.annually.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.passenger.annually.scheme_end_at),
        },
        per_trip: {
          amount: parseAmount(subscriptionConfig.passenger.per_trip.amount),
          active: Boolean(subscriptionConfig.passenger.per_trip.active),
          ride_threshold: parseThreshold(subscriptionConfig.passenger.per_trip.ride_threshold),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.passenger.per_trip.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.passenger.per_trip.scheme_end_at),
        },
      },
      driver: {
        monthly: {
          amount: parseAmount(subscriptionConfig.driver.monthly.amount),
          active: Boolean(subscriptionConfig.driver.monthly.active),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.driver.monthly.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.driver.monthly.scheme_end_at),
        },
        quarterly: {
          amount: parseAmount(subscriptionConfig.driver.quarterly.amount),
          active: Boolean(subscriptionConfig.driver.quarterly.active),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.driver.quarterly.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.driver.quarterly.scheme_end_at),
        },
        annually: {
          amount: parseAmount(subscriptionConfig.driver.annually.amount),
          active: Boolean(subscriptionConfig.driver.annually.active),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.driver.annually.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.driver.annually.scheme_end_at),
        },
        per_trip: {
          amount: parseAmount(subscriptionConfig.driver.per_trip.amount),
          active: Boolean(subscriptionConfig.driver.per_trip.active),
          ride_threshold: parseThreshold(subscriptionConfig.driver.per_trip.ride_threshold),
          scheme_start_at: normalizeDatePayload(subscriptionConfig.driver.per_trip.scheme_start_at),
          scheme_end_at: normalizeDatePayload(subscriptionConfig.driver.per_trip.scheme_end_at),
        },
      },
    };

    const invalidAmount = [
      payload.passenger.monthly.amount,
      payload.passenger.quarterly.amount,
      payload.passenger.annually.amount,
      payload.passenger.per_trip.amount,
      payload.driver.monthly.amount,
      payload.driver.quarterly.amount,
      payload.driver.annually.amount,
      payload.driver.per_trip.amount,
    ].some((amount) => Number.isNaN(amount) || amount < 0);

    const invalidThreshold = [payload.passenger.per_trip.ride_threshold, payload.driver.per_trip.ride_threshold].some(
      (threshold) => Number.isNaN(threshold) || threshold < 1,
    );

    if (invalidAmount) {
      setError('Subscription amounts must be non-negative numbers.');
      return;
    }
    if (invalidThreshold) {
      setError('Per-trip ride threshold must be at least 1.');
      return;
    }

    const plansToValidate = [
      payload.passenger.monthly,
      payload.passenger.quarterly,
      payload.passenger.annually,
      payload.passenger.per_trip,
      payload.driver.monthly,
      payload.driver.quarterly,
      payload.driver.annually,
      payload.driver.per_trip,
    ];
    for (const plan of plansToValidate) {
      const amount = Number(plan.amount || 0);
      if (amount > 0 && (!plan.scheme_start_at || !plan.scheme_end_at)) {
        setError('Scheme start and end date are required when subscription amount is greater than zero.');
        return;
      }
      if (plan.scheme_start_at && plan.scheme_end_at) {
        const startAt = new Date(plan.scheme_start_at);
        const endAt = new Date(plan.scheme_end_at);
        if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
          setError('Each scheme end date must be after start date.');
          return;
        }
      }
    }

    const saved = await runAction(
      () =>
        apiRequest('/admin/subscriptions/config', {
          method: 'PUT',
          token,
          body: payload,
        }),
      'Subscription plans updated.',
    );
    if (saved) {
      setSubscriptionConfig({
        passenger: normalizeRoleSubscriptionConfig(saved.passenger || {}),
        driver: normalizeRoleSubscriptionConfig(saved.driver || {}),
      });
    }
  };

  const activateSubscriptionForUser = async (userId, planType, activate = true) => {
    if (!planType) {
      setError('User has not selected a subscription plan yet.');
      return;
    }
    const done = await runAction(
      () =>
        apiRequest(`/admin/subscriptions/users/${userId}`, {
          method: 'PUT',
          token,
          body: {
            plan_type: planType,
            activate,
          },
        }),
      activate ? 'Subscription activated for user.' : 'Subscription deactivated for user.',
    );
    if (done) {
      await refreshAdminData();
    }
  };

  const reviewSubscriptionPayment = async (paymentSubmissionId, status) => {
    const done = await runAction(
      () =>
        apiRequest(`/admin/subscriptions/payments/${paymentSubmissionId}`, {
          method: 'PUT',
          token,
          body: {
            status,
            reject_reason: status === 'rejected' ? 'Rejected by admin review.' : undefined,
          },
        }),
      status === 'verified' ? 'Subscription payment verified.' : 'Subscription payment rejected.',
    );
    if (done) {
      await refreshAdminData();
    }
  };

  const saveRegistrationFees = async () => {
    const passenger = Number(registrationFees.passenger_registration_fee || 0);
    const driver = Number(registrationFees.driver_registration_fee || 0);
    const normalizeDatePayload = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    };
    const schemeStartAt = normalizeDatePayload(registrationFees.scheme_start_at);
    const schemeEndAt = normalizeDatePayload(registrationFees.scheme_end_at);
    if (Number.isNaN(passenger) || passenger < 0 || Number.isNaN(driver) || driver < 0) {
      setError('Registration fees must be valid non-negative numbers.');
      return;
    }
    if ((passenger > 0 || driver > 0) && (!schemeStartAt || !schemeEndAt)) {
      setError('Registration scheme start and end date are required when fee is greater than zero.');
      return;
    }
    if (schemeStartAt && schemeEndAt) {
      const startAt = new Date(schemeStartAt);
      const endAt = new Date(schemeEndAt);
      if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime()) || endAt <= startAt) {
        setError('Registration scheme end date must be after start date.');
        return;
      }
    }
    const result = await runAction(
      () =>
        apiRequest('/admin/registration-fees', {
          method: 'PUT',
          token,
          body: {
            passenger_registration_fee: passenger,
            driver_registration_fee: driver,
            scheme_start_at: schemeStartAt,
            scheme_end_at: schemeEndAt,
            enable_qr: registrationFees.enable_qr,
            enable_razorpay: registrationFees.enable_razorpay,
            registration_qr_code_url: registrationFees.registration_qr_code_url || null,
            registration_upi_id: registrationFees.registration_upi_id || null,
            razorpay_payment_link: registrationFees.razorpay_payment_link || null,
          },
        }),
      'Registration fees updated.',
    );
    if (result) {
      setRegistrationFees({
        passenger_registration_fee: String(result.passenger_registration_fee ?? 0),
        driver_registration_fee: String(result.driver_registration_fee ?? 0),
        scheme_start_at: normalizeDateTimeText(result.scheme_start_at),
        scheme_end_at: normalizeDateTimeText(result.scheme_end_at),
        enable_qr: Boolean(result.enable_qr),
        enable_razorpay: Boolean(result.enable_razorpay),
        registration_qr_code_url: String(result.registration_qr_code_url || ''),
        registration_upi_id: String(result.registration_upi_id || ''),
        razorpay_payment_link: String(result.razorpay_payment_link || ''),
      });
    }
  };

  const reviewRegistrationPayment = async (userId, status) => {
    const reviewed = await runAction(
      () =>
        apiRequest(`/admin/registration-payments/${userId}`, {
          method: 'PUT',
          token,
          body: {
            status,
            reject_reason: status === 'rejected' ? 'Rejected by admin review.' : undefined,
          },
        }),
      `Registration payment ${status}.`,
    );
    if (reviewed) {
      await refreshAdminData();
    }
  };

  const updateSpinWinField = (field, value) => {
    setSpinWinConfig((prev) => ({ ...prev, [field]: value }));
  };

  const updateSpinWinPrizeField = (index, field, value) => {
    setSpinWinConfig((prev) => ({
      ...prev,
      prizes: prev.prizes.map((prize, prizeIndex) =>
        prizeIndex === index ? { ...prize, [field]: value } : prize,
      ),
    }));
  };

  const addSpinWinPrize = () => {
    setSpinWinConfig((prev) => ({
      ...prev,
      prizes: [...prev.prizes, defaultSpinWinPrizeState()],
    }));
  };

  const removeSpinWinPrize = (index) => {
    setSpinWinConfig((prev) => {
      const nextPrizes = prev.prizes.filter((_, prizeIndex) => prizeIndex !== index);
      return {
        ...prev,
        prizes: nextPrizes.length > 0 ? nextPrizes : [defaultSpinWinPrizeState()],
      };
    });
  };

  const saveSpinWinConfig = async () => {
    const normalizeDatePayload = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    };
    const parseUserIdCsv = (value) =>
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    const allowedRoles = ['passenger', 'driver'];
    const selectedRoles = Array.isArray(spinWinConfig.eligible_roles)
      ? spinWinConfig.eligible_roles.filter((role) => allowedRoles.includes(String(role).toLowerCase()))
      : [];
    const dailyLimit = Number(spinWinConfig.daily_spin_limit || 0);
    if (Number.isNaN(dailyLimit) || dailyLimit < 0) {
      setError('Daily spin limit must be a valid non-negative number.');
      return;
    }
    if (spinWinConfig.enabled && dailyLimit < 1) {
      setError('Daily spin limit must be at least 1 when Spin & Win is enabled.');
      return;
    }

    const startsAt = normalizeDatePayload(spinWinConfig.starts_at);
    const endsAt = normalizeDatePayload(spinWinConfig.ends_at);
    if (startsAt && endsAt) {
      const startDate = new Date(startsAt);
      const endDate = new Date(endsAt);
      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate <= startDate) {
        setError('Spin & Win end date must be after start date.');
        return;
      }
    }

    const allowedRewardTypes = ['cash', 'coupon', 'points', 'gift', 'none'];
    const parsedPrizes = spinWinConfig.prizes
      .map((prize) => {
        const label = String(prize.label || '').trim();
        const rewardValue = Number(prize.reward_value || 0);
        const weight = Number(prize.weight || 0);
        const dailyStockRaw = String(prize.daily_stock || '').trim();
        const parsedDailyStock = dailyStockRaw ? Number(dailyStockRaw) : null;
        return {
          id: String(prize.id || '').trim() || undefined,
          label,
          reward_type: allowedRewardTypes.includes(String(prize.reward_type || '').toLowerCase())
            ? String(prize.reward_type || '').toLowerCase()
            : 'cash',
          reward_value: Number.isNaN(rewardValue) ? NaN : rewardValue,
          currency: String(prize.currency || 'INR').trim().toUpperCase() || 'INR',
          weight: Number.isNaN(weight) ? NaN : weight,
          daily_stock: parsedDailyStock === null ? null : (Number.isNaN(parsedDailyStock) ? NaN : parsedDailyStock),
          description: String(prize.description || '').trim() || null,
          active: Boolean(prize.active),
        };
      })
      .filter((prize) => prize.label.length > 0);

    if (parsedPrizes.length === 0) {
      setError('Add at least one prize with a label.');
      return;
    }
    const hasInvalidPrize = parsedPrizes.some((prize) =>
      Number.isNaN(prize.reward_value)
      || prize.reward_value < 0
      || Number.isNaN(prize.weight)
      || prize.weight <= 0
      || (prize.daily_stock !== null && (Number.isNaN(prize.daily_stock) || prize.daily_stock < 0)),
    );
    if (hasInvalidPrize) {
      setError('Prize values must be valid. Weight must be > 0 and stock cannot be negative.');
      return;
    }

    const saved = await runAction(
      () =>
        apiRequest('/admin/spin-win/config', {
          method: 'PUT',
          token,
          body: {
            enabled: Boolean(spinWinConfig.enabled),
            daily_spin_limit: Math.floor(dailyLimit),
            eligible_roles: selectedRoles.length > 0 ? selectedRoles : ['passenger'],
            included_user_ids: parseUserIdCsv(spinWinConfig.included_user_ids),
            excluded_user_ids: parseUserIdCsv(spinWinConfig.excluded_user_ids),
            starts_at: startsAt,
            ends_at: endsAt,
            prizes: parsedPrizes,
          },
        }),
      'Spin & Win settings updated.',
    );
    if (saved) {
      setSpinWinConfig(normalizeSpinWinConfig(saved));
      const winners = await apiRequest('/admin/spin-win/winners', { token, query: { limit: 50 } }).catch(() => []);
      setSpinWinWinners(Array.isArray(winners) ? winners : []);
    }
  };

  const updateRideProductDistrictField = (field, value) => {
    setRideProductDistrictConfig((prev) => ({ ...prev, [field]: value }));
  };

  const saveRideProductDistrictConfig = async () => {
    const parseProductList = (value) =>
      String(value || '')
        .split(',')
        .map((item) => item.trim().toLowerCase())
        .filter((item) => item && RIDE_PRODUCT_KEYS.includes(item));

    const defaultEnabledProducts = parseProductList(rideProductDistrictConfig.default_enabled_products_text);
    if (defaultEnabledProducts.length === 0) {
      setError('Default enabled products cannot be empty.');
      return;
    }

    const districtRules = String(rideProductDistrictConfig.district_rules_text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const separatorIndex = line.indexOf(':');
        if (separatorIndex < 1) {
          return null;
        }
        const district = line.slice(0, separatorIndex).trim();
        const productsText = line.slice(separatorIndex + 1).trim();
        const enabledProducts = parseProductList(productsText);
        if (!district || enabledProducts.length === 0) {
          return null;
        }
        return { district, enabled_products: enabledProducts };
      })
      .filter(Boolean);

    const saved = await runAction(
      () =>
        apiRequest('/admin/ride-products/district-config', {
          method: 'PUT',
          token,
          body: {
            default_enabled_products: defaultEnabledProducts,
            district_rules: districtRules,
          },
        }),
      'District-wise ride products updated.',
    );
    if (saved) {
      setRideProductDistrictConfig(normalizeRideProductDistrictConfig(saved));
    }
  };

  const farePreview = getFareLogicPreview();

  const reviewKyc = async (driverId, status) => {
    const payload = { status, reject_reason: status === 'rejected' ? 'Rejected by admin review.' : null };
    const reviewed = await runAction(() =>
      apiRequest(`/admin/kyc/${driverId}`, {
        method: 'PUT',
        token,
        body: payload,
      }),
    );
    if (reviewed) {
      setMessage(`KYC ${status} for driver ${driverId}.`);
      await refreshAdminData();
    }
  };

  const reviewDriverFareRequest = async (driverId, status) => {
    const reviewed = await runAction(
      () =>
        apiRequest(`/admin/driver-fare-calculator/${driverId}`, {
          method: 'PUT',
          token,
          body: {
            status,
            reject_reason: status === 'rejected' ? 'Rejected by admin review.' : undefined,
          },
        }),
      `Driver fare calculator ${status}.`,
    );
    if (reviewed) {
      await refreshAdminData();
    }
  };

  const reviewPhoneChange = async (userId, status) => {
    const reviewed = await runAction(
      () =>
        apiRequest(`/admin/phone-changes/${userId}`, {
          method: 'PUT',
          token,
          body: {
            status,
            reject_reason: status === 'rejected' ? 'Rejected by admin review.' : undefined,
          },
        }),
      `Phone change ${status}.`,
    );
    if (reviewed) {
      await refreshAdminData();
    }
  };

  const updateTripCancelReason = (bookingId, value) => {
    setTripCancelReasons((prev) => ({ ...prev, [bookingId]: value }));
  };

  const cancelOngoingTripByAdmin = async (bookingId) => {
    const reason = String(tripCancelReasons[bookingId] || '').trim() || 'Cancelled by admin on user request.';
    const cancelled = await runAction(
      () =>
        apiRequest(`/admin/bookings/${bookingId}/cancel`, {
          method: 'PUT',
          token,
          body: { reason },
        }),
      'Trip cancelled from admin dashboard.',
    );
    if (cancelled) {
      await refreshAdminData();
    }
  };

  const formatDateTime = (value) => {
    if (!value) {
      return '-';
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }
    return date.toLocaleString();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <AutoBuddyBrand compact subtitle="Admin Dashboard" />
        <WebCommandBar />
        <View style={styles.header}>
          <View>
            <Text style={styles.headerTitle}>Admin Control</Text>
            <Text style={styles.headerSub}>Welcome, {user?.name || 'Admin'}</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.headerBtn} onPress={refreshAdminData} disabled={loading}>
              <Text style={styles.headerBtnText}>Refresh</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.headerBtn} onPress={onLogout}>
              <Text style={styles.headerBtnText}>Logout</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!!error && <Text style={styles.error}>{error}</Text>}
        {!!message && <Text style={styles.message}>{message}</Text>}
        {loading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}

        <View style={styles.dashboardTopRow}>
          <TouchableOpacity
            style={[
              styles.primaryMenuButton,
              activeAdminMenu === PRIMARY_ADMIN_MENU_KEY && styles.primaryMenuButtonActive,
            ]}
            onPress={() => {
              setActiveAdminMenu(PRIMARY_ADMIN_MENU_KEY);
              setShowAdminMenus(false);
            }}>
            <Text style={styles.primaryMenuButtonText}>Overview</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.menuToggleButton}
            onPress={() => setShowAdminMenus((prev) => !prev)}>
            <Text style={styles.menuToggleButtonText}>{showAdminMenus ? 'Hide Menus' : 'Other Menus'}</Text>
          </TouchableOpacity>
        </View>

        {showAdminMenus && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.menuBar}
            contentContainerStyle={styles.menuBarContent}>
            {SECONDARY_ADMIN_MENU_OPTIONS.map((menu) => (
              <TouchableOpacity
                key={menu.key}
                style={[styles.menuChip, activeAdminMenu === menu.key && styles.menuChipActive]}
                onPress={() => {
                  setActiveAdminMenu(menu.key);
                  setShowAdminMenus(false);
                }}>
                <Text style={[styles.menuChipText, activeAdminMenu === menu.key && styles.menuChipTextActive]}>
                  {menu.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {activeAdminMenu !== PRIMARY_ADMIN_MENU_KEY && (
          <View style={styles.activeMenuInfoRow}>
            <Text style={styles.activeMenuInfoText}>
              {ADMIN_MENU_OPTIONS.find((menu) => menu.key === activeAdminMenu)?.label || 'Menu'}
            </Text>
            <TouchableOpacity
              style={styles.menuToggleButton}
              onPress={() => {
                setActiveAdminMenu(PRIMARY_ADMIN_MENU_KEY);
                setShowAdminMenus(false);
              }}>
              <Text style={styles.menuToggleButtonText}>Back to Overview</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={[styles.section, activeAdminMenu !== 'analytics' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Overview</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Users</Text>
              <Text style={styles.statValue}>{stats.total_users}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Active Rides</Text>
              <Text style={styles.statValue}>{stats.active_bookings}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Drivers</Text>
              <Text style={styles.statValue}>{stats.total_drivers}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Passengers</Text>
              <Text style={styles.statValue}>{stats.total_passengers}</Text>
            </View>
            <View style={[styles.statCard, styles.fullWidthCard]}>
              <Text style={styles.statLabel}>Total Revenue</Text>
              <Text style={styles.statValue}>INR {stats.total_revenue}</Text>
            </View>
          </View>
          <Text style={styles.sectionTitle}>Investor Analytics Visibility</Text>
          <AdminAnalyticsPanel token={token} />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'trips' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>All Ongoing Trips</Text>
          {ongoingTrips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No ongoing trips right now.</Text>
            </View>
          ) : (
            ongoingTrips.map((trip) => (
              <View key={trip.id} style={styles.kycCard}>
                <Text style={styles.driverName}>Trip ID: {trip.id}</Text>
                <Text style={styles.kycDate}>Status: {String(trip.status || '').replace('_', ' ')}</Text>
                <Text style={styles.kycDate}>
                  Passenger: {trip.passenger_name || 'Unknown'} | {trip.passenger_phone || 'N/A'}
                </Text>
                <Text style={styles.kycDate}>
                  Driver: {trip.driver_name || 'Not assigned'} | {trip.driver_phone || 'N/A'}
                </Text>
                <Text style={styles.kycDate}>
                  Pickup: {trip.pickup_location?.address || `${trip.pickup_location?.latitude || ''}, ${trip.pickup_location?.longitude || ''}`}
                </Text>
                <Text style={styles.kycDate}>
                  Drop: {trip.drop_location?.address || `${trip.drop_location?.latitude || ''}, ${trip.drop_location?.longitude || ''}`}
                </Text>
                <Text style={styles.kycDate}>
                  Fare: Rs {Number(trip.estimated_fare || 0).toFixed(2)} | Distance: {Number(trip.distance_km || 0).toFixed(2)} km
                </Text>
                <Text style={styles.kycDate}>Created: {formatDateTime(trip.created_at)}</Text>
                <Text style={styles.kycDate}>Updated: {formatDateTime(trip.updated_at)}</Text>
                <Text style={styles.inputLabel}>Cancel reason (visible in audit trail)</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={tripCancelReasons[trip.id] || ''}
                  onChangeText={(value) => updateTripCancelReason(trip.id, value)}
                  placeholder="Cancelled by admin on user request."
                  placeholderTextColor="#9AA7A0"
                />
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => cancelOngoingTripByAdmin(trip.id)}
                    disabled={loading}>
                    <Text style={styles.btnText}>Cancel Trip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'users' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Drivers & Passengers</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Drivers Live</Text>
              <Text style={styles.statValue}>{liveCounts.drivers_live}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Passengers Live</Text>
              <Text style={styles.statValue}>{liveCounts.passengers_live}</Text>
            </View>
            <View style={[styles.statCard, styles.fullWidthCard]}>
              <Text style={styles.statLabel}>Total Live Users</Text>
              <Text style={styles.statValue}>{liveCounts.total_live}</Text>
            </View>
          </View>

          <Text style={styles.sectionSubtitle}>Drivers ({driverUsers.length})</Text>
          {driverUsers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No drivers found.</Text>
            </View>
          ) : (
            driverUsers.map((driver) => (
              <View key={driver.id} style={styles.kycCard}>
                <View style={styles.userRowHeader}>
                  <Text style={styles.driverName}>{driver.name || 'Unknown Driver'}</Text>
                  <Text style={[styles.liveBadge, driver.is_live ? styles.liveBadgeOn : styles.liveBadgeOff]}>
                    {driver.is_live ? 'LIVE' : 'OFFLINE'}
                  </Text>
                </View>
                <Text style={styles.kycDate}>{driver.email} | {driver.phone}</Text>
                <Text style={styles.kycDate}>Driver ID: {driver.id}</Text>
                <Text style={styles.kycDate}>Available: {driver.is_available ? 'Yes' : 'No'}</Text>
                <Text style={styles.kycDate}>KYC: {driver.kyc_status || 'pending'}</Text>
                {!!driver.active_booking_id && (
                  <Text style={styles.kycDate}>Active Trip: {driver.active_booking_id}</Text>
                )}
                {!!driver.live_location_updated_at && (
                  <Text style={styles.kycDate}>Live Updated: {formatDateTime(driver.live_location_updated_at)}</Text>
                )}
              </View>
            ))
          )}

          <Text style={styles.sectionSubtitle}>Passengers ({passengerUsers.length})</Text>
          {passengerUsers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No passengers found.</Text>
            </View>
          ) : (
            passengerUsers.map((passenger) => (
              <View key={passenger.id} style={styles.kycCard}>
                <View style={styles.userRowHeader}>
                  <Text style={styles.driverName}>{passenger.name || 'Unknown Passenger'}</Text>
                  <Text style={[styles.liveBadge, passenger.is_live ? styles.liveBadgeOn : styles.liveBadgeOff]}>
                    {passenger.is_live ? 'LIVE' : 'OFFLINE'}
                  </Text>
                </View>
                <Text style={styles.kycDate}>{passenger.email} | {passenger.phone}</Text>
                <Text style={styles.kycDate}>Passenger ID: {passenger.id}</Text>
                {!!passenger.active_booking_id && (
                  <Text style={styles.kycDate}>Active Trip: {passenger.active_booking_id}</Text>
                )}
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'spin' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Spin & Win Configuration</Text>
          <View style={styles.kycCard}>
            <Text style={styles.inputLabel}>Campaign Status</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optionChip, spinWinConfig.enabled && styles.optionChipActive]}
                onPress={() => updateSpinWinField('enabled', true)}>
                <Text style={[styles.optionChipText, spinWinConfig.enabled && styles.optionChipTextActive]}>
                  Enabled
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionChip, !spinWinConfig.enabled && styles.optionChipActive]}
                onPress={() => updateSpinWinField('enabled', false)}>
                <Text style={[styles.optionChipText, !spinWinConfig.enabled && styles.optionChipTextActive]}>
                  Disabled
                </Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.inputLabel}>Daily Spin Limit</Text>
            <VoiceTextInput
              style={styles.input}
              value={spinWinConfig.daily_spin_limit}
              onChangeText={(value) => updateSpinWinField('daily_spin_limit', value)}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor="#9AA7A0"
            />

            <Text style={styles.inputLabel}>Eligible Roles</Text>
            <View style={styles.optionRow}>
              {['passenger', 'driver'].map((role) => {
                const enabled = spinWinConfig.eligible_roles.includes(role);
                return (
                  <TouchableOpacity
                    key={role}
                    style={[styles.optionChip, enabled && styles.optionChipActive]}
                    onPress={() => {
                      updateSpinWinField(
                        'eligible_roles',
                        enabled
                          ? spinWinConfig.eligible_roles.filter((item) => item !== role)
                          : [...spinWinConfig.eligible_roles, role],
                      );
                    }}>
                    <Text style={[styles.optionChipText, enabled && styles.optionChipTextActive]}>
                      {role === 'passenger' ? 'Passengers' : 'Drivers'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Only These Customer IDs (comma separated, optional)</Text>
            <VoiceTextInput
              style={styles.input}
              value={spinWinConfig.included_user_ids}
              onChangeText={(value) => updateSpinWinField('included_user_ids', value)}
              placeholder="user-id-1, user-id-2"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Exclude Customer IDs (comma separated, optional)</Text>
            <VoiceTextInput
              style={styles.input}
              value={spinWinConfig.excluded_user_ids}
              onChangeText={(value) => updateSpinWinField('excluded_user_ids', value)}
              placeholder="user-id-3"
              placeholderTextColor="#9AA7A0"
            />

            <Text style={styles.inputLabel}>Campaign Start (YYYY-MM-DD HH:mm)</Text>
            <VoiceTextInput
              style={styles.input}
              value={spinWinConfig.starts_at}
              onChangeText={(value) => updateSpinWinField('starts_at', value)}
              placeholder="2026-06-01 00:00"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Campaign End (YYYY-MM-DD HH:mm)</Text>
            <VoiceTextInput
              style={styles.input}
              value={spinWinConfig.ends_at}
              onChangeText={(value) => updateSpinWinField('ends_at', value)}
              placeholder="2026-06-30 23:59"
              placeholderTextColor="#9AA7A0"
            />

            <Text style={styles.sectionSubtitle}>Prize Rules</Text>
            {spinWinConfig.prizes.map((prize, index) => (
              <View key={`spin-prize-${index}`} style={styles.subscriptionPlanCard}>
                <Text style={styles.inputLabel}>Prize Label</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.label}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'label', value)}
                  placeholder="INR 10 Wallet Cash"
                  placeholderTextColor="#9AA7A0"
                />
                <Text style={styles.inputLabel}>Prize Type (cash/coupon/points/gift/none)</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.reward_type}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'reward_type', value)}
                  placeholder="cash"
                  placeholderTextColor="#9AA7A0"
                />
                <Text style={styles.inputLabel}>Prize Value</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.reward_value}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'reward_value', value)}
                  keyboardType="decimal-pad"
                  placeholder="10"
                  placeholderTextColor="#9AA7A0"
                />
                <Text style={styles.inputLabel}>Currency</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.currency}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'currency', value)}
                  placeholder="INR"
                  placeholderTextColor="#9AA7A0"
                />
                <Text style={styles.inputLabel}>Weight (chance)</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.weight}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'weight', value)}
                  keyboardType="decimal-pad"
                  placeholder="1"
                  placeholderTextColor="#9AA7A0"
                />
                <Text style={styles.inputLabel}>Daily Stock (optional)</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.daily_stock}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'daily_stock', value)}
                  keyboardType="number-pad"
                  placeholder="100"
                  placeholderTextColor="#9AA7A0"
                />
                <Text style={styles.inputLabel}>Description</Text>
                <VoiceTextInput
                  style={styles.input}
                  value={prize.description}
                  onChangeText={(value) => updateSpinWinPrizeField(index, 'description', value)}
                  placeholder="Wallet top-up credit."
                  placeholderTextColor="#9AA7A0"
                />
                <View style={styles.optionRow}>
                  <TouchableOpacity
                    style={[styles.optionChip, prize.active && styles.optionChipActive]}
                    onPress={() => updateSpinWinPrizeField(index, 'active', !prize.active)}>
                    <Text style={[styles.optionChipText, prize.active && styles.optionChipTextActive]}>
                      {prize.active ? 'Prize Active' : 'Prize Inactive'}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.optionChip]}
                    onPress={() => removeSpinWinPrize(index)}>
                    <Text style={styles.optionChipText}>Remove Prize</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <View style={styles.actionButtons}>
              <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={addSpinWinPrize}>
                <Text style={styles.btnText}>Add Prize</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={saveSpinWinConfig} disabled={loading}>
                <Text style={styles.btnText}>Save Spin & Win</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={[styles.section, activeAdminMenu !== 'spin' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Recent Winners</Text>
          {spinWinWinners.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No spins recorded yet.</Text>
            </View>
          ) : (
            spinWinWinners.map((winner) => (
              <View key={winner.id || `${winner.user_id}-${winner.created_at}`} style={styles.kycCard}>
                <Text style={styles.driverName}>{winner.user_name || winner.user_id || 'Customer'}</Text>
                <Text style={styles.kycDate}>Role: {winner.user_role || '-'}</Text>
                <Text style={styles.kycDate}>Prize: {winner.prize_label || 'Unknown'}</Text>
                <Text style={styles.kycDate}>
                  Reward: {winner.reward_type || '-'} {Number(winner.reward_value || 0).toFixed(2)} {winner.currency || 'INR'}
                </Text>
                {!!winner.wallet_credit_amount && (
                  <Text style={styles.kycDate}>Wallet Credit: INR {Number(winner.wallet_credit_amount || 0).toFixed(2)}</Text>
                )}
                <Text style={styles.kycDate}>Date: {winner.date_key || '-'}</Text>
                <Text style={styles.kycDate}>Time: {formatDateTime(winner.created_at)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'subscriptions' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Subscription Plans</Text>
          {['passenger', 'driver'].map((roleKey) => (
            <View key={roleKey} style={styles.kycCard}>
              <Text style={styles.driverName}>{roleKey === 'driver' ? 'Driver Plans' : 'Passenger Plans'}</Text>
              {SUBSCRIPTION_PERIOD_OPTIONS.map((plan) => (
                <View key={`${roleKey}-${plan}`} style={styles.subscriptionPlanCard}>
                  <Text style={styles.inputLabel}>{plan.replace('_', ' ').toUpperCase()}</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={subscriptionConfig[roleKey][plan].amount}
                    onChangeText={(value) => updateSubscriptionPlanField(roleKey, plan, 'amount', value)}
                    keyboardType="decimal-pad"
                    placeholder="Amount"
                    placeholderTextColor="#9AA7A0"
                  />
                  <Text style={styles.inputLabel}>Scheme Start (YYYY-MM-DD HH:mm)</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={subscriptionConfig[roleKey][plan].scheme_start_at}
                    onChangeText={(value) => updateSubscriptionPlanField(roleKey, plan, 'scheme_start_at', value)}
                    placeholder="2026-06-01 00:00"
                    placeholderTextColor="#9AA7A0"
                  />
                  <Text style={styles.inputLabel}>Scheme End (YYYY-MM-DD HH:mm)</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={subscriptionConfig[roleKey][plan].scheme_end_at}
                    onChangeText={(value) => updateSubscriptionPlanField(roleKey, plan, 'scheme_end_at', value)}
                    placeholder="2026-06-30 23:59"
                    placeholderTextColor="#9AA7A0"
                  />
                  <View style={styles.optionRow}>
                    <TouchableOpacity
                      style={[
                        styles.optionChip,
                        subscriptionConfig[roleKey][plan].active && styles.optionChipActive,
                      ]}
                      onPress={() =>
                        updateSubscriptionPlanField(roleKey, plan, 'active', !subscriptionConfig[roleKey][plan].active)
                      }>
                      <Text
                        style={[
                          styles.optionChipText,
                          subscriptionConfig[roleKey][plan].active && styles.optionChipTextActive,
                        ]}>
                        {subscriptionConfig[roleKey][plan].active ? 'Active' : 'Inactive'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {plan === 'per_trip' && (
                    <>
                      <Text style={styles.inputLabel}>Ride Threshold</Text>
                      <VoiceTextInput
                        style={styles.input}
                        value={subscriptionConfig[roleKey].per_trip.ride_threshold}
                        onChangeText={(value) => updateSubscriptionPlanField(roleKey, 'per_trip', 'ride_threshold', value)}
                        keyboardType="number-pad"
                        placeholder="10"
                        placeholderTextColor="#9AA7A0"
                      />
                    </>
                  )}
                </View>
              ))}
            </View>
          ))}
          <View style={styles.kycCard}>
            <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={saveSubscriptionConfig} disabled={loading}>
              <Text style={styles.btnText}>Save Subscription Plans</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, activeAdminMenu !== 'subscriptions' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Pending Subscription Activations</Text>
          {pendingSubscriptionActivations.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending subscription activations.</Text>
            </View>
          ) : (
            pendingSubscriptionActivations.map((item) => (
              <View key={item.id} style={styles.kycCard}>
                <Text style={styles.driverName}>{item.name}</Text>
                <Text style={styles.kycDate}>{item.email} | {item.phone}</Text>
                <Text style={styles.kycDate}>Role: {item.role}</Text>
                <Text style={styles.kycDate}>Plan: {item.subscription?.plan_type || 'Not selected'}</Text>
                <Text style={styles.kycDate}>
                  Admin Activated: {item.subscription?.activated_by_admin ? 'Yes' : 'No'}
                </Text>
                <Text style={styles.kycDate}>
                  Due Amount: Rs {Number(item.subscription?.outstanding_amount || 0).toFixed(2)}
                </Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => activateSubscriptionForUser(item.id, item.subscription?.plan_type, false)}
                    disabled={loading}>
                    <Text style={styles.btnText}>Deactivate</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => activateSubscriptionForUser(item.id, item.subscription?.plan_type, true)}
                    disabled={loading}>
                    <Text style={styles.btnText}>Activate</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'subscriptions' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Per-Trip Payment Verifications</Text>
          {pendingSubscriptionPayments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending subscription payment verifications.</Text>
            </View>
          ) : (
            pendingSubscriptionPayments.map((item) => (
              <View key={item.payment_submission_id} style={styles.kycCard}>
                <Text style={styles.driverName}>{item.name || 'User'}</Text>
                <Text style={styles.kycDate}>{item.email} | {item.phone}</Text>
                <Text style={styles.kycDate}>Role: {item.role}</Text>
                <Text style={styles.kycDate}>Submission: {item.payment_submission_id}</Text>
                <Text style={styles.kycDate}>Method: {item.payment_method || 'N/A'}</Text>
                {!!item.payment_utr && <Text style={styles.kycDate}>UTR: {item.payment_utr}</Text>}
                {!!item.payment_ref && <Text style={styles.kycDate}>Ref: {item.payment_ref}</Text>}
                <Text style={styles.kycDate}>Cycles: {Number(item.due_count || 0)}</Text>
                <Text style={styles.kycDate}>Amount: Rs {Number(item.total_amount || 0).toFixed(2)}</Text>
                <Text style={styles.kycDate}>Submitted: {String(item.submitted_at || '')}</Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => reviewSubscriptionPayment(item.payment_submission_id, 'rejected')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => reviewSubscriptionPayment(item.payment_submission_id, 'verified')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Verify</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'phone' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Pending Phone Change Requests</Text>
          {pendingPhoneChangeRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending phone change requests.</Text>
            </View>
          ) : (
            pendingPhoneChangeRequests.map((item) => (
              <View key={`${item.user_id}-${item.new_phone}`} style={styles.kycCard}>
                <Text style={styles.driverName}>{item.name}</Text>
                <Text style={styles.kycDate}>{item.email} | {item.current_phone}</Text>
                <Text style={styles.kycDate}>Role: {item.role}</Text>
                <Text style={styles.kycDate}>Requested new phone: {item.new_phone}</Text>
                <Text style={styles.kycDate}>OTP verified: {item.verified ? 'Yes' : 'No'}</Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => reviewPhoneChange(item.user_id, 'rejected')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => reviewPhoneChange(item.user_id, 'approved')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'pricing' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Trip Pricing & Driver Radius</Text>
          <View style={styles.kycCard}>
            <Text style={styles.inputLabel}>Base Fare (Rs)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.base_fare}
              onChangeText={(value) => updatePricingField('base_fare', value)}
              keyboardType="decimal-pad"
              placeholder="25"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Per KM Rate (Rs)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.per_km_rate}
              onChangeText={(value) => updatePricingField('per_km_rate', value)}
              keyboardType="decimal-pad"
              placeholder="12"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Minimum Fare (Rs)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.minimum_fare}
              onChangeText={(value) => updatePricingField('minimum_fare', value)}
              keyboardType="decimal-pad"
              placeholder="30"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Surge Multiplier</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.surge_multiplier}
              onChangeText={(value) => updatePricingField('surge_multiplier', value)}
              keyboardType="decimal-pad"
              placeholder="1.5"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Night Multiplier</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.night_multiplier}
              onChangeText={(value) => updatePricingField('night_multiplier', value)}
              keyboardType="decimal-pad"
              placeholder="1.3"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Peak Hours (comma separated)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.peak_hours}
              onChangeText={(value) => updatePricingField('peak_hours', value)}
              placeholder="8,9,17,18,19"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Radius A (Normal Search KM)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.driver_base_search_radius_km}
              onChangeText={(value) => updatePricingField('driver_base_search_radius_km', value)}
              keyboardType="decimal-pad"
              placeholder="5"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Radius B (Long Distance Search KM)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.driver_long_distance_search_radius_km}
              onChangeText={(value) => updatePricingField('driver_long_distance_search_radius_km', value)}
              keyboardType="decimal-pad"
              placeholder="12"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Scheduled Ride Driver Radius (KM)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.scheduled_booking_driver_radius_km}
              onChangeText={(value) => updatePricingField('scheduled_booking_driver_radius_km', value)}
              keyboardType="decimal-pad"
              placeholder="10"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Extra Pickup Charge Per KM (beyond Radius A)</Text>
            <VoiceTextInput
              style={styles.input}
              value={pricingRules.driver_pickup_surcharge_per_km}
              onChangeText={(value) => updatePricingField('driver_pickup_surcharge_per_km', value)}
              keyboardType="decimal-pad"
              placeholder="12"
              placeholderTextColor="#9AA7A0"
            />
            <View style={styles.logicCard}>
              <Text style={styles.logicTitle}>Fare Calculator Logic</Text>
              <Text style={styles.logicText}>
                Trip Fare = max(Min Fare, (Base Fare + Distance x Per KM) x Time Multiplier)
              </Text>
              <Text style={styles.logicText}>
                Pickup Extra = max(0, DriverToPickupKM - RadiusA) x PickupSurchargePerKM
              </Text>
              <Text style={styles.logicText}>
                Final Fare = (Trip Fare x Driver Fare Multiplier) + Pickup Extra
              </Text>
              <Text style={styles.logicText}>
                Fallback Search: first inside Radius A, if none then search up to Radius B.
              </Text>
              <Text style={styles.logicText}>
                Example with current rules: trip {farePreview.sampleTripDistanceKm} km, driver {farePreview.sampleDriverDistanceKm.toFixed(1)} km from pickup,
                extra pickup {farePreview.extraPickupDistance.toFixed(1)} km, trip fare INR {farePreview.tripFare.toFixed(2)},
                pickup extra INR {farePreview.pickupSurcharge.toFixed(2)}, total INR {farePreview.totalFare.toFixed(2)}.
              </Text>
            </View>
            <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={savePricingRules} disabled={loading}>
              <Text style={styles.btnText}>Save Pricing & Radius Rules</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, activeAdminMenu !== 'pricing' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Driver Fare Calculator Requests</Text>
          {pendingDriverFareRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending driver fare calculator requests.</Text>
            </View>
          ) : (
            pendingDriverFareRequests.map((item) => (
              <View key={item.driver_id} style={styles.kycCard}>
                <Text style={styles.driverName}>{item.driver_name}</Text>
                <Text style={styles.kycDate}>{item.driver_email} | {item.driver_phone}</Text>
                <Text style={styles.kycDate}>Driver ID: {item.driver_id}</Text>
                <Text style={styles.kycDate}>Submitted: {String(item.submitted_at || '')}</Text>
                <Text style={styles.kycDate}>Type: {item.request_type === 'reset' ? 'Reset To Admin Default' : 'Custom Fare Update'}</Text>
                {item.request_type === 'reset' ? (
                  <Text style={styles.kycDate}>
                    Note: {item.note || 'Driver requested to reset to admin default fare calculator.'}
                  </Text>
                ) : (
                  <>
                    <Text style={styles.kycDate}>
                      Base {item.payload?.base_fare} | Per KM {item.payload?.per_km_rate} | Min {item.payload?.minimum_fare}
                    </Text>
                    <Text style={styles.kycDate}>
                      Surge {item.payload?.surge_multiplier}x | Night {item.payload?.night_multiplier}x
                    </Text>
                    <Text style={styles.kycDate}>
                      Radius A {item.payload?.driver_base_search_radius_km} km | Radius B {item.payload?.driver_long_distance_search_radius_km} km
                    </Text>
                    <Text style={styles.kycDate}>
                      Pickup Extra/KM INR {item.payload?.driver_pickup_surcharge_per_km}
                    </Text>
                  </>
                )}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => reviewDriverFareRequest(item.driver_id, 'rejected')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => reviewDriverFareRequest(item.driver_id, 'approved')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'pricing' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>District Ride Product Activation</Text>
          <View style={styles.kycCard}>
            <Text style={styles.inputLabel}>Default Enabled Products (comma separated)</Text>
            <VoiceTextInput
              style={styles.input}
              value={rideProductDistrictConfig.default_enabled_products_text}
              onChangeText={(value) => updateRideProductDistrictField('default_enabled_products_text', value)}
              placeholder="normal,pool,scheduled,women_only"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>
              District Rules (one per line)
            </Text>
            <Text style={styles.kycDate}>
              Format: `District Name: product1,product2` (example: `Kollam: normal,women_only,airport`)
            </Text>
            <VoiceTextInput
              style={[styles.input, styles.multilineInput]}
              value={rideProductDistrictConfig.district_rules_text}
              onChangeText={(value) => updateRideProductDistrictField('district_rules_text', value)}
              placeholder={`Kollam: normal,women_only,airport\nErnakulam: normal,pool,ev_auto`}
              placeholderTextColor="#9AA7A0"
              multiline
            />
            <TouchableOpacity
              style={[styles.btn, styles.btnApprove]}
              onPress={saveRideProductDistrictConfig}
              disabled={loading}>
              <Text style={styles.btnText}>Save District Product Rules</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, activeAdminMenu !== 'pricing' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Approved Driver Fare Calculators</Text>
          {approvedDriverFareConfigs.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No approved custom fare calculators yet.</Text>
            </View>
          ) : (
            approvedDriverFareConfigs.map((item) => (
              <View key={item.driver_id} style={styles.kycCard}>
                <Text style={styles.driverName}>{item.driver_name}</Text>
                <Text style={styles.kycDate}>{item.driver_email} | {item.driver_phone}</Text>
                <Text style={styles.kycDate}>Driver ID: {item.driver_id}</Text>
                <Text style={styles.kycDate}>Approved: {String(item.approved_at || '')}</Text>
                <Text style={styles.kycDate}>
                  Base {item.pricing?.base_fare} | Per KM {item.pricing?.per_km_rate} | Min {item.pricing?.minimum_fare}
                </Text>
                <Text style={styles.kycDate}>
                  Surge {item.pricing?.surge_multiplier}x | Night {item.pricing?.night_multiplier}x
                </Text>
                <Text style={styles.kycDate}>
                  Radius A {item.pricing?.driver_base_search_radius_km} km | Radius B {item.pricing?.driver_long_distance_search_radius_km} km
                </Text>
                <Text style={styles.kycDate}>
                  Pickup Extra/KM INR {item.pricing?.driver_pickup_surcharge_per_km}
                </Text>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'registration' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Registration Fees</Text>
          <View style={styles.kycCard}>
            <Text style={styles.inputLabel}>Passenger Registration Fee (Rs)</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.passenger_registration_fee}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, passenger_registration_fee: value }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Driver Registration Fee (Rs)</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.driver_registration_fee}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, driver_registration_fee: value }))
              }
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Scheme Start (YYYY-MM-DD HH:mm)</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.scheme_start_at}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, scheme_start_at: value }))
              }
              placeholder="2026-06-01 00:00"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Scheme End (YYYY-MM-DD HH:mm)</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.scheme_end_at}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, scheme_end_at: value }))
              }
              placeholder="2026-06-30 23:59"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Payment Options</Text>
            <View style={styles.optionRow}>
              <TouchableOpacity
                style={[styles.optionChip, registrationFees.enable_qr && styles.optionChipActive]}
                onPress={() =>
                  setRegistrationFees((prev) => ({ ...prev, enable_qr: !prev.enable_qr }))
                }>
                <Text style={[styles.optionChipText, registrationFees.enable_qr && styles.optionChipTextActive]}>
                  QR
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.optionChip, registrationFees.enable_razorpay && styles.optionChipActive]}
                onPress={() =>
                  setRegistrationFees((prev) => ({ ...prev, enable_razorpay: !prev.enable_razorpay }))
                }>
                <Text
                  style={[
                    styles.optionChipText,
                    registrationFees.enable_razorpay && styles.optionChipTextActive,
                  ]}>
                  Razorpay
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.inputLabel}>QR Image URL</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.registration_qr_code_url}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, registration_qr_code_url: value }))
              }
              placeholder="https://.../registration-qr.png"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>UPI ID (for QR)</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.registration_upi_id}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, registration_upi_id: value }))
              }
              placeholder="autobuddy@upi"
              placeholderTextColor="#9AA7A0"
            />
            <Text style={styles.inputLabel}>Razorpay Payment Link</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.razorpay_payment_link}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, razorpay_payment_link: value }))
              }
              placeholder="https://rzp.io/..."
              placeholderTextColor="#9AA7A0"
            />
            <TouchableOpacity style={[styles.btn, styles.btnApprove]} onPress={saveRegistrationFees} disabled={loading}>
              <Text style={styles.btnText}>Save Fees</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={[styles.section, activeAdminMenu !== 'registration' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Pending Registration Payments</Text>
          {pendingRegistrationPayments.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending registration payment verifications.</Text>
            </View>
          ) : (
            pendingRegistrationPayments.map((item) => (
              <View key={item.id} style={styles.kycCard}>
                <Text style={styles.driverName}>{item.name}</Text>
                <Text style={styles.kycDate}>{item.email} | {item.phone}</Text>
                <Text style={styles.kycDate}>Role: {item.role}</Text>
                <Text style={styles.kycDate}>Fee: Rs {Number(item.registration_fee_amount || 0).toFixed(2)}</Text>
                <Text style={styles.kycDate}>Method: {item.registration_payment_method || 'N/A'}</Text>
                {!!item.registration_payment_utr && (
                  <Text style={styles.kycDate}>UTR: {item.registration_payment_utr}</Text>
                )}
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => reviewRegistrationPayment(item.id, 'rejected')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => reviewRegistrationPayment(item.id, 'verified')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Verify</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'kyc' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Pending KYC Approvals</Text>
          {kycRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No pending KYC requests right now.</Text>
            </View>
          ) : (
            kycRequests.map((req) => (
              <View key={req.driver_id} style={styles.kycCard}>
                <Text style={styles.driverName}>{req.driver_name}</Text>
                <Text style={styles.kycDate}>Driver ID: {req.driver_id}</Text>
                <Text style={styles.kycDate}>Submitted: {req.submitted_at}</Text>
                <View style={styles.actionButtons}>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnReject]}
                    onPress={() => reviewKyc(req.driver_id, 'rejected')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btn, styles.btnApprove]}
                    onPress={() => reviewKyc(req.driver_id, 'approved')}
                    disabled={loading}>
                    <Text style={styles.btnText}>Approve</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: COLORS.background },
  container: { flex: 1, padding: 18 },
  header: {
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerTitle: { fontSize: 30, fontWeight: '900', color: COLORS.textMain },
  headerSub: { fontSize: 15, color: COLORS.textMuted },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FBF9',
    borderWidth: 1,
    borderColor: '#D2DED6',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    ...SHADOWS.soft,
  },
  headerBtnText: { color: COLORS.textMain, fontWeight: '700' },
  error: { color: COLORS.danger, marginBottom: 10 },
  message: { color: '#1B5E20', marginBottom: 10 },
  loader: { marginBottom: 10 },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 24,
    gap: 10,
  },
  menuBar: { marginBottom: 14 },
  menuBarContent: { gap: 8, paddingRight: 10 },
  dashboardTopRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  primaryMenuButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#2E7D32',
    borderRadius: 12,
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 14,
    paddingVertical: 10,
    ...SHADOWS.soft,
  },
  primaryMenuButtonActive: {
    borderColor: '#1B5E20',
    backgroundColor: '#D5ECD8',
  },
  primaryMenuButtonText: { color: '#1B5E20', fontWeight: '800', textAlign: 'center' },
  menuToggleButton: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 12,
    backgroundColor: '#F6FAF7',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuToggleButtonText: { color: '#355243', fontWeight: '700' },
  activeMenuInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  activeMenuInfoText: { color: '#1E3126', fontWeight: '800', fontSize: 14 },
  menuChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 18,
    backgroundColor: '#F6FAF7',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  menuChipActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E7F3EC',
  },
  menuChipText: { color: '#355243', fontWeight: '700' },
  menuChipTextActive: { color: '#2E7D32' },
  statCard: {
    width: '48%',
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    ...SHADOWS.card,
  },
  fullWidthCard: { width: '100%' },
  statLabel: { fontSize: 14, color: '#666666', marginBottom: 8 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#2E7D32' },
  hiddenSection: { display: 'none' },
  section: { marginBottom: 30 },
  sectionTitle: { fontSize: 21, fontWeight: '800', color: COLORS.textMain, marginBottom: 12 },
  sectionSubtitle: { fontSize: 16, fontWeight: '800', color: '#274335', marginBottom: 10, marginTop: 4 },
  inputLabel: { fontSize: 14, color: '#303A33', fontWeight: '700', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#CDDCD1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    color: '#1E3126',
    backgroundColor: '#FBFDFC',
  },
  multilineInput: {
    minHeight: 110,
    textAlignVertical: 'top',
  },
  optionRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  optionChip: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: '#F6FAF7',
  },
  optionChipActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E7F3EC',
  },
  optionChipText: { color: '#355243', fontWeight: '700' },
  optionChipTextActive: { color: '#2E7D32' },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    padding: 16,
    ...SHADOWS.soft,
  },
  emptyText: { color: '#666666' },
  kycCard: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#D7E2DA',
    ...SHADOWS.card,
  },
  subscriptionPlanCard: {
    borderWidth: 1,
    borderColor: '#DFE6E0',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
    backgroundColor: '#FBFDFC',
  },
  logicCard: {
    borderWidth: 1,
    borderColor: '#DFE6E0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    backgroundColor: '#F6FAF7',
  },
  logicTitle: { color: '#1E3126', fontWeight: '800', marginBottom: 6 },
  logicText: { color: '#355243', marginBottom: 4, lineHeight: 18 },
  driverName: { fontSize: 18, fontWeight: '600', color: '#202020' },
  userRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  liveBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
    fontSize: 12,
    fontWeight: '800',
  },
  liveBadgeOn: { backgroundColor: '#E7F3EC', color: '#1B5E20' },
  liveBadgeOff: { backgroundColor: '#F1F3F2', color: '#61746A' },
  kycDate: { fontSize: 14, color: '#666666', marginTop: 4 },
  actionButtons: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 12 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  btnReject: { backgroundColor: '#C62828' },
  btnApprove: { backgroundColor: '#2E7D32' },
  btnText: { color: '#fff', fontWeight: '600' },
});

