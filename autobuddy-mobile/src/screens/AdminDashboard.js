import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { apiRequest } from '../lib/api';
import { adminAPI } from '../services/apiClient';
import { getSocket } from '../services/socketClient';
import { COLORS, SHADOWS } from '../theme';
import AdminAnalyticsPanel from '../components/AdminAnalyticsPanel';
import WebCommandBar from '../components/WebCommandBar';
import VoiceTextInput from '../components/VoiceTextInput';
import AdminAuditLogger, { ACTION_TYPES } from '../utils/AdminAuditLogger';
import PaginationControls from '../components/PaginationControls';
import ConfirmationDialog from '../components/ConfirmationDialog';
import AdminSearchBar from '../components/AdminSearchBar';
import KycDocumentPreview from '../components/KycDocumentPreview';
import AdminRateLimitConfig from '../components/AdminRateLimitConfig';
import AdminDocumentRequirements from '../components/AdminDocumentRequirements';
import AdminFareConfiguration from '../components/AdminFareConfiguration';
import AdminFareProposals from '../components/AdminFareProposals';
import AdminVehicleManagementScreen from './AdminVehicleManagementScreen';
import { formatToIST } from '../utils/time';

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
const RIDE_PRODUCT_LABELS = {
  normal: 'Normal',
  pool: 'Pool',
  scheduled: 'Scheduled',
  corporate: 'Corporate',
  airport: 'Airport',
  intercity: 'Intercity',
  ev_auto: 'EV Auto',
  tourism: 'Tourism',
  women_only: 'Women Only',
  rental_hourly: 'Rental Hourly',
  school_elderly_safe: 'School/Elderly Safe',
};
const KERALA_DISTRICTS = [
  'Thiruvananthapuram',
  'Kollam',
  'Pathanamthitta',
  'Alappuzha',
  'Kottayam',
  'Idukki',
  'Ernakulam',
  'Thrissur',
  'Palakkad',
  'Malappuram',
  'Kozhikode',
  'Wayanad',
  'Kannur',
  'Kasaragod',
];
const AIRPORT_ALLOWED_DISTRICTS = ['Thiruvananthapuram', 'Ernakulam', 'Kozhikode'];
const ADMIN_MENU_OPTIONS = [
  { key: 'analytics', label: 'Overview' },
  { key: 'trips', label: 'Ongoing Trips' },
  { key: 'users', label: 'Users & Live' },
  { key: 'role_report', label: 'Role Report' },
  { key: 'launch_visits', label: 'Launch Visitors' },
  { key: 'spin', label: 'Spin & Win' },
  { key: 'subscriptions', label: 'Subscriptions' },
  { key: 'phone', label: 'Phone Requests' },
  { key: 'account_deletions', label: 'Account Deletions' },
  { key: 'ride_products', label: 'Ride Products' },
  { key: 'vehicle_types', label: 'Vehicle Types' },
  { key: 'pricing', label: 'Pricing & Fare' },
  { key: 'fares', label: 'Fare Configuration' },
  { key: 'fare_proposals', label: 'Driver Fare Proposals' },
  { key: 'registration', label: 'Registration' },
  { key: 'wallet', label: 'Wallet Top-ups' },
  { key: 'kyc', label: 'KYC' },
  { key: 'rate_limits', label: 'Rate Limits' },
  { key: 'documents', label: 'Documents' },
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

function defaultLaunchVisitReportState() {
  return {
    days: 30,
    summary: {
      total_clicks: 0,
      unique_ips: 0,
      unique_visitors: 0,
      known_visitors: 0,
    },
    daily: [],
    recent_clicks: [],
    visitors: [],
  };
}

function defaultRolewiseUserReportState() {
  return {
    passengers: [],
    drivers: [],
    operators: [],
    counts: {
      passengers: 0,
      drivers: 0,
      operators: 0,
      total: 0,
    },
    generated_at: null,
  };
}

function normalizeListResponse(payload, keys = []) {
  if (Array.isArray(payload)) {
    return payload;
  }
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidateKeys = [...keys, 'data', 'items', 'results'];
  const containers = [payload];
  if (payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
    containers.push(payload.data);
  }

  for (const container of containers) {
    for (const key of candidateKeys) {
      if (Array.isArray(container[key])) {
        return container[key];
      }
    }
  }
  return [];
}

function normalizeRoleReportRows(primaryRows, fallbackRows, role) {
  const rows = primaryRows.length > 0 ? primaryRows : fallbackRows;
  return rows.map((user) => {
    const joiningDate = user.joining_date || user.created_at || user.joined_at || user.createdAt || null;
    return {
      ...user,
      role: user.role || role,
      joining_date: joiningDate,
      created_at: user.created_at || joiningDate,
    };
  });
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

function normalizeDistrictKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ district/gi, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function parseRideProductList(rawValue) {
  const parsed = String(rawValue || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item && RIDE_PRODUCT_KEYS.includes(item));
  return Array.from(new Set(parsed));
}

function parseDistrictRulesText(rawText) {
  const map = {};
  String(rawText || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const separatorIndex = line.indexOf(':');
      if (separatorIndex < 1) {
        return;
      }
      const district = line.slice(0, separatorIndex).trim();
      const districtKey = normalizeDistrictKey(district);
      const productsText = line.slice(separatorIndex + 1).trim();
      const products = parseRideProductList(productsText);
      if (!districtKey || products.length === 0) {
        return;
      }
      map[districtKey] = { district, products };
    });
  return map;
}

function serializeDistrictRulesText(ruleMap) {
  const districtOrder = KERALA_DISTRICTS.map((name) => normalizeDistrictKey(name));
  const keys = Object.keys(ruleMap || {}).sort((a, b) => {
    const indexA = districtOrder.indexOf(a);
    const indexB = districtOrder.indexOf(b);
    if (indexA >= 0 && indexB >= 0) {
      return indexA - indexB;
    }
    if (indexA >= 0) {
      return -1;
    }
    if (indexB >= 0) {
      return 1;
    }
    return a.localeCompare(b);
  });
  return keys
    .map((key) => {
      const row = ruleMap[key];
      if (!row?.district || !Array.isArray(row?.products) || row.products.length === 0) {
        return '';
      }
      return `${row.district}: ${row.products.join(',')}`;
    })
    .filter(Boolean)
    .join('\n');
}

export default function AdminDashboard({ token, user, onLogout }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [stats, setStats] = useState({
    total_users: 0,
    total_drivers: 0,
    total_passengers: 0,
    total_operators: 0,
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
    operator_registration_fee: '0',
    scheme_start_at: '',
    scheme_end_at: '',
    enable_qr: false,
    enable_razorpay: false,
    registration_qr_code_url: '',
    registration_upi_id: '',
    razorpay_payment_link: '',
  });
  const [uploadedQrFilename, setUploadedQrFilename] = useState('');
  const qrUploadInputRef = useRef(null);
  const [pendingRegistrationPayments, setPendingRegistrationPayments] = useState([]);
  const [pendingWalletTopups, setPendingWalletTopups] = useState([]);
  const [subscriptionConfig, setSubscriptionConfig] = useState({
    passenger: emptyRoleSubscriptionConfig(),
    driver: emptyRoleSubscriptionConfig(),
    operator: emptyRoleSubscriptionConfig(),
  });
  const [pendingSubscriptionActivations, setPendingSubscriptionActivations] = useState([]);
  const [pendingSubscriptionPayments, setPendingSubscriptionPayments] = useState([]);
  const [pendingPhoneChangeRequests, setPendingPhoneChangeRequests] = useState([]);
  const [pendingAccountDeletionRequests, setPendingAccountDeletionRequests] = useState([]);
  const [pendingDriverFareRequests, setPendingDriverFareRequests] = useState([]);
  const [approvedDriverFareConfigs, setApprovedDriverFareConfigs] = useState([]);
  const [, setPassengerKycRequests] = useState([]);
  const [ongoingTrips, setOngoingTrips] = useState([]);
  const [tripCancelReasons, setTripCancelReasons] = useState({});
  const [activeAdminMenu, setActiveAdminMenu] = useState(PRIMARY_ADMIN_MENU_KEY);
  const [showAdminMenus, setShowAdminMenus] = useState(false);
  const [driverUsers, setDriverUsers] = useState([]);
  const [passengerUsers, setPassengerUsers] = useState([]);
  const [operatorUsers, setOperatorUsers] = useState([]);
  const [liveCounts, setLiveCounts] = useState({
    drivers_live: 0,
    passengers_live: 0,
    operators_total: 0,
    total_live: 0,
  });
  const [launchVisitReport, setLaunchVisitReport] = useState(defaultLaunchVisitReportState());
  const [rolewiseUserReport, setRolewiseUserReport] = useState(defaultRolewiseUserReportState());
  const [spinWinConfig, setSpinWinConfig] = useState(defaultSpinWinConfigState());
  const [spinWinWinners, setSpinWinWinners] = useState([]);
  const [rideProductDistrictConfig, setRideProductDistrictConfig] = useState(
    normalizeRideProductDistrictConfig(null),
  );
  const [selectedDistrictForProducts, setSelectedDistrictForProducts] = useState(KERALA_DISTRICTS[0]);
  const [copySourceDistrictForProducts, setCopySourceDistrictForProducts] = useState(KERALA_DISTRICTS[1] || KERALA_DISTRICTS[0]);

  // PHASE 1: PAGINATION & SEARCH STATE
  // Trips pagination & search
  const [tripsPage, setTripsPage] = useState(1);
  const [tripsPageSize, setTripsPageSize] = useState(25);
  const [tripsSearchTerm, setTripsSearchTerm] = useState('');
  const [tripsFilterStatus, setTripsFilterStatus] = useState('all');

  // Users pagination & search
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(50);
  const [usersSearchTerm, setUsersSearchTerm] = useState('');
  const [usersFilterRole, setUsersFilterRole] = useState('all');

  // KYC pagination & search
  const [kycPage, setKycPage] = useState(1);
  const [kycPageSize, setKycPageSize] = useState(25);
  const [kycSearchTerm, setKycSearchTerm] = useState('');
  const [kycFilterStatus, setKycFilterStatus] = useState('all');
  const [showKycPreview, setShowKycPreview] = useState(false);
  const [selectedKycForPreview, setSelectedKycForPreview] = useState(null);

  // Confirmations
  const [showConfirmTripsModal, setShowConfirmTripsModal] = useState(false);
  const [confirmTripAction, setConfirmTripAction] = useState({ tripId: null, reason: '' });
  const [showConfirmKycModal, setShowConfirmKycModal] = useState(false);
  const [confirmKycAction, setConfirmKycAction] = useState({ kycId: null, decision: 'approve' });

  // PHASE 2: PAGINATION & SEARCH STATE
  // Phone Requests
  const [phonePage, setPhonePage] = useState(1);
  const [phonePageSize, setPhonePageSize] = useState(25);
  const [phoneSearchTerm, setPhoneSearchTerm] = useState('');

  // Account Deletions
  const [deletionPage, setDeletionPage] = useState(1);
  const [deletionPageSize, setDeletionPageSize] = useState(25);
  const [deletionSearchTerm, setDeletionSearchTerm] = useState('');

  // Wallet Top-ups
  const [walletPage, setWalletPage] = useState(1);
  const [walletPageSize, setWalletPageSize] = useState(25);
  const [walletSearchTerm, setWalletSearchTerm] = useState('');

  // Subscriptions
  const [subscriptionPage, setSubscriptionPage] = useState(1);
  const [subscriptionPageSize, setSubscriptionPageSize] = useState(25);
  const [subscriptionSearchTerm, setSubscriptionSearchTerm] = useState('');

  // Audit logging state
  const [auditLogging, setAuditLogging] = useState(false);

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
    const dashboard = await runAction(() => adminAPI.getDashboard());
    const pending = await adminAPI.getKycPending().catch(() => []);
    const pendingPassengerKyc = await adminAPI.getPassengerKycPending().catch(() => []);
    const pricingSettings = await adminAPI.getPricingRules().catch(() => null);
    const feeSettings = await adminAPI.getRegistrationFeeConfig().catch(() => null);
    const pendingRegistrations = await adminAPI.getPendingRegistrations().catch(() => []);
    const pendingWalletTopupRows = await adminAPI.getPendingWalletTopups().catch(() => []);
    const subscriptionSettings = await adminAPI.getSubscriptionConfig().catch(() => null);
    const pendingSubscriptions = await adminAPI.getPendingSubscriptions().catch(() => []);
    const pendingSubscriptionPaymentRows = await adminAPI.getPendingSubscriptionPayments().catch(() => []);
    const pendingPhoneChanges = await adminAPI.getPendingPhoneChanges().catch(() => []);
    const pendingAccountDeletions = await adminAPI.getPendingAccountDeletions().catch(() => []);
    const pendingDriverFare = await adminAPI.getPendingDriverFareRequests().catch(() => []);
    const approvedDriverFare = await adminAPI.getApprovedDriverFareConfigs().catch(() => []);
    const activeTrips = await adminAPI.getOngoingTrips().catch(() => []);
    const usersLiveStatus = await adminAPI.getUsersLiveStatus().catch(() => null);
    const roleReport = await adminAPI.getRolewiseUserReport().catch(() => null);
    const launchVisits = await adminAPI.getLaunchVisitReport({ days: 30, limit: 120 }).catch(() => null);
    const spinWinSettings = await adminAPI.getSpinWinConfig().catch(() => null);
    const spinWinWinnerRows = await adminAPI.getSpinWinWinners({ limit: 50 }).catch(() => []);
    const rideProductsDistrictSettings = await adminAPI.getRideProductsDistrictConfig().catch(() => null);
    
    // Emit real-time Socket.IO event for metrics updates
    const socket = getSocket();
    socket.emit('admin_dashboard_refreshed', {
      timestamp: new Date().toISOString(),
      data_loaded: !!dashboard
    });

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
    setKycRequests(normalizeListResponse(pending, ['pending', 'requests', 'kyc_requests']));
    setPassengerKycRequests(normalizeListResponse(pendingPassengerKyc, ['pending', 'requests', 'kyc_requests']));
    if (feeSettings) {
      setRegistrationFees({
        passenger_registration_fee: String(feeSettings.passenger_registration_fee ?? 0),
        driver_registration_fee: String(feeSettings.driver_registration_fee ?? 0),
        operator_registration_fee: String(feeSettings.operator_registration_fee ?? 0),
        scheme_start_at: normalizeDateTimeText(feeSettings.scheme_start_at),
        scheme_end_at: normalizeDateTimeText(feeSettings.scheme_end_at),
        enable_qr: Boolean(feeSettings.enable_qr),
        enable_razorpay: Boolean(feeSettings.enable_razorpay),
        registration_qr_code_url: String(feeSettings.registration_qr_code_url || ''),
        registration_upi_id: String(feeSettings.registration_upi_id || ''),
        razorpay_payment_link: String(feeSettings.razorpay_payment_link || ''),
      });
    }
    setPendingRegistrationPayments(normalizeListResponse(pendingRegistrations, ['payments', 'pending_payments']));
    setPendingWalletTopups(normalizeListResponse(pendingWalletTopupRows, ['topups', 'pending_topups']));
    if (subscriptionSettings) {
      setSubscriptionConfig({
        passenger: normalizeRoleSubscriptionConfig(subscriptionSettings.passenger || {}),
        driver: normalizeRoleSubscriptionConfig(subscriptionSettings.driver || {}),
        operator: normalizeRoleSubscriptionConfig(subscriptionSettings.operator || {}),
      });
    }
    setPendingSubscriptionActivations(normalizeListResponse(pendingSubscriptions, ['subscriptions', 'pending_subscriptions']));
    setPendingSubscriptionPayments(normalizeListResponse(pendingSubscriptionPaymentRows, ['payments', 'pending_payments']));
    setPendingPhoneChangeRequests(normalizeListResponse(pendingPhoneChanges, ['requests', 'phone_changes']));
    setPendingAccountDeletionRequests(normalizeListResponse(pendingAccountDeletions, ['requests', 'account_deletions']));
    setPendingDriverFareRequests(normalizeListResponse(pendingDriverFare, ['requests', 'fare_requests']));
    setApprovedDriverFareConfigs(normalizeListResponse(approvedDriverFare, ['configs', 'fare_configs']));
    setOngoingTrips(normalizeListResponse(activeTrips, ['bookings', 'trips']));
    const liveDrivers = normalizeListResponse(usersLiveStatus?.drivers);
    const livePassengers = normalizeListResponse(usersLiveStatus?.passengers);
    const liveOperators = normalizeListResponse(usersLiveStatus?.operators);
    setDriverUsers(liveDrivers);
    setPassengerUsers(livePassengers);
    setOperatorUsers(liveOperators);
    setLiveCounts({
      drivers_live: Number(usersLiveStatus?.live_counts?.drivers_live || 0),
      passengers_live: Number(usersLiveStatus?.live_counts?.passengers_live || 0),
      operators_total: Number(usersLiveStatus?.live_counts?.operators_total || 0),
      total_live: Number(usersLiveStatus?.live_counts?.total_live || 0),
    });
    const reportPassengers = normalizeRoleReportRows(
      normalizeListResponse(roleReport?.passengers),
      livePassengers,
      'passenger',
    );
    const reportDrivers = normalizeRoleReportRows(
      normalizeListResponse(roleReport?.drivers),
      liveDrivers,
      'driver',
    );
    const reportOperators = normalizeRoleReportRows(
      normalizeListResponse(roleReport?.operators),
      liveOperators,
      'operator',
    );
    const reportTotal = reportPassengers.length + reportDrivers.length + reportOperators.length;
    setRolewiseUserReport({
      passengers: reportPassengers,
      drivers: reportDrivers,
      operators: reportOperators,
      counts: {
        passengers: reportPassengers.length,
        drivers: reportDrivers.length,
        operators: reportOperators.length,
        total: reportTotal,
      },
      generated_at: roleReport?.generated_at || usersLiveStatus?.generated_at || new Date().toISOString(),
    });
    if (launchVisits) {
      setLaunchVisitReport({
        ...defaultLaunchVisitReportState(),
        ...launchVisits,
        summary: {
          ...defaultLaunchVisitReportState().summary,
          ...(launchVisits.summary || {}),
        },
        daily: Array.isArray(launchVisits.daily) ? launchVisits.daily : [],
        recent_clicks: Array.isArray(launchVisits.recent_clicks) ? launchVisits.recent_clicks : [],
        visitors: Array.isArray(launchVisits.visitors) ? launchVisits.visitors : [],
      });
    }
    if (spinWinSettings) {
      setSpinWinConfig(normalizeSpinWinConfig(spinWinSettings));
    }
    setSpinWinWinners(normalizeListResponse(spinWinWinnerRows, ['winners']));
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

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') {
      return undefined;
    }

    let lastRefreshAt = 0;
    const refreshVisibleAdminData = () => {
      const now = Date.now();
      if (now - lastRefreshAt < 1000) {
        return;
      }
      lastRefreshAt = now;
      refreshAdminData().catch(() => null);
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshVisibleAdminData();
      }
    };

    window.addEventListener('pageshow', refreshVisibleAdminData);
    window.addEventListener('focus', refreshVisibleAdminData);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', refreshVisibleAdminData);
      window.removeEventListener('focus', refreshVisibleAdminData);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // PHASE 1: FILTERING & PAGINATION FUNCTIONS
  // Filter trips (without pagination)
  const filterAndPaginateTrips = useCallback(() => {
    const filtered = (ongoingTrips || []).filter((trip) => {
      // Search filter
      if (tripsSearchTerm.trim()) {
        const search = tripsSearchTerm.toLowerCase();
        const matchesSearch =
          trip.id?.toLowerCase().includes(search) ||
          trip.passenger_name?.toLowerCase().includes(search) ||
          trip.passenger_phone?.includes(search) ||
          trip.driver_name?.toLowerCase().includes(search) ||
          trip.driver_phone?.includes(search);
        if (!matchesSearch) return false;
      }
      // Status filter
      if (tripsFilterStatus !== 'all' && trip.status !== tripsFilterStatus) {
        return false;
      }
      return true;
    });
    return filtered;
  }, [ongoingTrips, tripsSearchTerm, tripsFilterStatus]);

  const filteredTrips = useMemo(() => {
    const filtered = filterAndPaginateTrips();
    const start = (tripsPage - 1) * tripsPageSize;
    const end = start + tripsPageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginateTrips, tripsPage, tripsPageSize]);

  // Filter users (without pagination)
  const filterAndPaginateUsers = useCallback(() => {
    const allUsers = [
      ...(driverUsers || []).map((u) => ({ ...u, role: 'driver' })),
      ...(passengerUsers || []).map((u) => ({ ...u, role: 'passenger' })),
      ...(operatorUsers || []).map((u) => ({ ...u, role: 'operator' })),
    ];

    const search = usersSearchTerm.toLowerCase();
    const filtered = allUsers.filter((user) => {
      // Search filter
      if (search.trim()) {
        const matchesSearch =
          user.id?.toLowerCase().includes(search) ||
          user.name?.toLowerCase().includes(search) ||
          user.email?.toLowerCase().includes(search) ||
          user.phone?.includes(search);
        if (!matchesSearch) return false;
      }
      // Role filter
      if (usersFilterRole !== 'all' && user.role !== usersFilterRole) {
        return false;
      }
      return true;
    });
    return filtered;
  }, [driverUsers, operatorUsers, passengerUsers, usersSearchTerm, usersFilterRole]);

  const filteredUsers = useMemo(() => {
    const filtered = filterAndPaginateUsers();
    const start = (usersPage - 1) * usersPageSize;
    const end = start + usersPageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginateUsers, usersPage, usersPageSize]);

  const filteredRoleReportSections = useMemo(() => {
    const search = usersSearchTerm.toLowerCase().trim();
    const sections = [
      { key: 'passenger', title: 'Passengers', rows: rolewiseUserReport.passengers || [] },
      { key: 'driver', title: 'Drivers', rows: rolewiseUserReport.drivers || [] },
      { key: 'operator', title: 'Operators', rows: rolewiseUserReport.operators || [] },
    ];

    return sections
      .filter((section) => usersFilterRole === 'all' || usersFilterRole === section.key)
      .map((section) => ({
        ...section,
        rows: section.rows.filter((user) => {
          if (!search) {
            return true;
          }
          return [user.id, user.name, user.email, user.phone]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(search));
        }),
      }));
  }, [rolewiseUserReport, usersFilterRole, usersSearchTerm]);

  // Filter KYC (without pagination)
  const filterAndPaginateKyc = useCallback(() => {
    const search = kycSearchTerm.toLowerCase();
    const filtered = (kycRequests || []).filter((kyc) => {
      // Search filter
      if (search.trim()) {
        const matchesSearch =
          kyc.driver_id?.toLowerCase().includes(search) ||
          kyc.driver_name?.toLowerCase().includes(search) ||
          kyc.driver_phone?.includes(search) ||
          kyc.driver_email?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      // Status filter
      if (kycFilterStatus !== 'all' && kyc.status !== kycFilterStatus) {
        return false;
      }
      return true;
    });
    return filtered;
  }, [kycRequests, kycSearchTerm, kycFilterStatus]);

  const filteredKyc = useMemo(() => {
    const filtered = filterAndPaginateKyc();
    const start = (kycPage - 1) * kycPageSize;
    const end = start + kycPageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginateKyc, kycPage, kycPageSize]);

  // PHASE 2: FILTERING FUNCTIONS FOR REMAINING SECTIONS
  // Filter phone change requests
  const filterAndPaginatePhone = useCallback(() => {
    const filtered = (pendingPhoneChangeRequests || []).filter((item) => {
      if (phoneSearchTerm.trim()) {
        const search = phoneSearchTerm.toLowerCase();
        const matchesSearch =
          item.name?.toLowerCase().includes(search) ||
          item.email?.toLowerCase().includes(search) ||
          item.current_phone?.includes(search) ||
          item.new_phone?.includes(search) ||
          item.user_id?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      return true;
    });
    return filtered;
  }, [pendingPhoneChangeRequests, phoneSearchTerm]);

  const filteredPhone = useMemo(() => {
    const filtered = filterAndPaginatePhone();
    const start = (phonePage - 1) * phonePageSize;
    const end = start + phonePageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginatePhone, phonePage, phonePageSize]);

  // Filter account deletion requests
  const filterAndPaginateDeletion = useCallback(() => {
    const filtered = (pendingAccountDeletionRequests || []).filter((item) => {
      if (deletionSearchTerm.trim()) {
        const search = deletionSearchTerm.toLowerCase();
        const matchesSearch =
          item.name?.toLowerCase().includes(search) ||
          item.email?.toLowerCase().includes(search) ||
          item.phone?.includes(search) ||
          item.user_id?.toLowerCase().includes(search) ||
          item.role?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      return true;
    });
    return filtered;
  }, [pendingAccountDeletionRequests, deletionSearchTerm]);

  const filteredDeletion = useMemo(() => {
    const filtered = filterAndPaginateDeletion();
    const start = (deletionPage - 1) * deletionPageSize;
    const end = start + deletionPageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginateDeletion, deletionPage, deletionPageSize]);

  // Filter wallet top-ups
  const filterAndPaginateWallet = useCallback(() => {
    const filtered = (pendingWalletTopups || []).filter((item) => {
      if (walletSearchTerm.trim()) {
        const search = walletSearchTerm.toLowerCase();
        const matchesSearch =
          item.name?.toLowerCase().includes(search) ||
          item.email?.toLowerCase().includes(search) ||
          item.phone?.includes(search) ||
          item.order_id?.toLowerCase().includes(search) ||
          item.provider?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      return true;
    });
    return filtered;
  }, [pendingWalletTopups, walletSearchTerm]);

  const filteredWallet = useMemo(() => {
    const filtered = filterAndPaginateWallet();
    const start = (walletPage - 1) * walletPageSize;
    const end = start + walletPageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginateWallet, walletPage, walletPageSize]);

  // Filter subscriptions
  const filterAndPaginateSubscription = useCallback(() => {
    const filtered = (pendingSubscriptionActivations || []).filter((item) => {
      if (subscriptionSearchTerm.trim()) {
        const search = subscriptionSearchTerm.toLowerCase();
        const matchesSearch =
          item.user_name?.toLowerCase().includes(search) ||
          item.email?.toLowerCase().includes(search) ||
          item.phone?.includes(search) ||
          item.user_id?.toLowerCase().includes(search) ||
          item.plan_name?.toLowerCase().includes(search);
        if (!matchesSearch) return false;
      }
      return true;
    });
    return filtered;
  }, [pendingSubscriptionActivations, subscriptionSearchTerm]);

  const filteredSubscription = useMemo(() => {
    const filtered = filterAndPaginateSubscription();
    const start = (subscriptionPage - 1) * subscriptionPageSize;
    const end = start + subscriptionPageSize;
    return filtered.slice(start, end);
  }, [filterAndPaginateSubscription, subscriptionPage, subscriptionPageSize]);

  // PHASE 1: AUDIT LOGGING HANDLERS
  const handleCancelTripWithConfirm = async (tripId) => {
    const trip = (ongoingTrips || []).find((t) => t.id === tripId);
    const reason = tripCancelReasons[tripId] || 'Cancelled by admin';

    setShowConfirmTripsModal(false);
    setAuditLogging(true);

    try {
      // Log to audit trail
      await AdminAuditLogger.logAction(ACTION_TYPES.TRIP_CANCELLED, {
        trip_id: tripId,
        passenger_id: trip?.passenger_id,
        driver_id: trip?.driver_id,
        reason: reason,
        cancelled_at: new Date().toISOString(),
      });

      // Cancel the trip
      await cancelOngoingTripByAdmin(tripId);
      setMessage('✓ Trip cancelled and logged to audit trail');
    } catch (err) {
      setError('Failed to cancel trip: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

  const handleApproveKyc = async (kycId) => {
    const kyc = (kycRequests || []).find((k) => k.id === kycId);
    setShowConfirmKycModal(false);
    setAuditLogging(true);

    try {
      await AdminAuditLogger.logAction(ACTION_TYPES.KYC_APPROVED, {
        kyc_id: kycId,
        driver_id: kyc?.driver_id,
        driver_name: kyc?.driver_name,
        approved_at: new Date().toISOString(),
      });

      // Approve KYC
      const result = await apiRequest('/admin/kyc/approve', {
        method: 'POST',
        token,
        body: { kyc_id: kycId },
      });

      if (result?.success) {
        setMessage('✓ KYC approved and logged');
        await refreshAdminData();
      } else {
        setError(result?.error || 'Failed to approve KYC');
      }
    } catch (err) {
      setError('Failed to approve KYC: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

  const handleRejectKyc = async (kycId, reason) => {
    const kyc = (kycRequests || []).find((k) => k.id === kycId);
    setShowConfirmKycModal(false);
    setAuditLogging(true);

    try {
      await AdminAuditLogger.logAction(ACTION_TYPES.KYC_REJECTED, {
        kyc_id: kycId,
        driver_id: kyc?.driver_id,
        driver_name: kyc?.driver_name,
        rejection_reason: reason,
        rejected_at: new Date().toISOString(),
      });

      // Reject KYC
      const result = await apiRequest('/admin/kyc/reject', {
        method: 'POST',
        token,
        body: { kyc_id: kycId, reason },
      });

      if (result?.success) {
        setMessage('✓ KYC rejected and logged');
        await refreshAdminData();
      } else {
        setError(result?.error || 'Failed to reject KYC');
      }
    } catch (err) {
      setError('Failed to reject KYC: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

  // PHASE 2: AUDIT LOGGING HANDLERS FOR ADDITIONAL ACTIONS
  const handlePhoneChangeApproval = async (userId, status) => {
    setAuditLogging(true);
    try {
      const user = (pendingPhoneChangeRequests || []).find((item) => item.user_id === userId);
      await AdminAuditLogger.logAction(ACTION_TYPES.PHONE_CHANGE_APPROVED, {
        user_id: userId,
        user_name: user?.name,
        old_phone: user?.current_phone,
        new_phone: user?.new_phone,
        status: status,
        approved_at: new Date().toISOString(),
      });
      await reviewPhoneChange(userId, status);
    } catch (err) {
      setError('Failed to process phone change: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

  const handleAccountDeletionApproval = async (requestId, status) => {
    setAuditLogging(true);
    try {
      const request = (pendingAccountDeletionRequests || []).find((item) => item.id === requestId);
      await AdminAuditLogger.logAction(ACTION_TYPES.ACCOUNT_DELETION_APPROVED, {
        deletion_request_id: requestId,
        user_id: request?.user_id,
        user_name: request?.name,
        user_role: request?.role,
        status: status,
        approved_at: new Date().toISOString(),
      });
      await reviewAccountDeletion(requestId, status);
    } catch (err) {
      setError('Failed to process account deletion: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

  const handleWalletTopupApproval = async (orderId, status) => {
    setAuditLogging(true);
    try {
      const item = (pendingWalletTopups || []).find((w) => w.order_id === orderId);
      await AdminAuditLogger.logAction(ACTION_TYPES.WALLET_TOP_UP_APPROVED, {
        order_id: orderId,
        user_id: item?.user_id,
        user_name: item?.name,
        amount: item?.amount,
        provider: item?.provider,
        status: status,
        verified_at: new Date().toISOString(),
      });
      await reviewWalletTopup(orderId, status);
    } catch (err) {
      setError('Failed to process wallet top-up: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

  const handleSubscriptionApproval = async (subscriptionId, status) => {
    setAuditLogging(true);
    try {
      const sub = (pendingSubscriptionActivations || []).find((s) => s.id === subscriptionId);
      await AdminAuditLogger.logAction(ACTION_TYPES.SUBSCRIPTION_UPDATED, {
        subscription_id: subscriptionId,
        user_id: sub?.user_id,
        user_name: sub?.user_name,
        plan_name: sub?.plan_name,
        status: status,
        updated_at: new Date().toISOString(),
      });
      // Add API call for subscription approval when available
      setMessage(`✓ Subscription ${status} and logged`);
      await refreshAdminData();
    } catch (err) {
      setError('Failed to process subscription: ' + err.message);
    } finally {
      setAuditLogging(false);
    }
  };

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
    const serializeRoleConfig = (roleConfig) => ({
      monthly: {
        amount: parseAmount(roleConfig.monthly.amount),
        active: Boolean(roleConfig.monthly.active),
        scheme_start_at: normalizeDatePayload(roleConfig.monthly.scheme_start_at),
        scheme_end_at: normalizeDatePayload(roleConfig.monthly.scheme_end_at),
      },
      quarterly: {
        amount: parseAmount(roleConfig.quarterly.amount),
        active: Boolean(roleConfig.quarterly.active),
        scheme_start_at: normalizeDatePayload(roleConfig.quarterly.scheme_start_at),
        scheme_end_at: normalizeDatePayload(roleConfig.quarterly.scheme_end_at),
      },
      annually: {
        amount: parseAmount(roleConfig.annually.amount),
        active: Boolean(roleConfig.annually.active),
        scheme_start_at: normalizeDatePayload(roleConfig.annually.scheme_start_at),
        scheme_end_at: normalizeDatePayload(roleConfig.annually.scheme_end_at),
      },
      per_trip: {
        amount: parseAmount(roleConfig.per_trip.amount),
        active: Boolean(roleConfig.per_trip.active),
        ride_threshold: parseThreshold(roleConfig.per_trip.ride_threshold),
        scheme_start_at: normalizeDatePayload(roleConfig.per_trip.scheme_start_at),
        scheme_end_at: normalizeDatePayload(roleConfig.per_trip.scheme_end_at),
      },
    });
    const payload = {
      passenger: serializeRoleConfig(subscriptionConfig.passenger),
      driver: serializeRoleConfig(subscriptionConfig.driver),
      operator: serializeRoleConfig(subscriptionConfig.operator),
    };
    const roleSubscriptionPayloads = Object.values(payload);

    const invalidAmount = roleSubscriptionPayloads
      .flatMap((roleConfig) => SUBSCRIPTION_PERIOD_OPTIONS.map((plan) => roleConfig[plan].amount))
      .some((amount) => Number.isNaN(amount) || amount < 0);

    const invalidThreshold = roleSubscriptionPayloads
      .map((roleConfig) => roleConfig.per_trip.ride_threshold)
      .some((threshold) => Number.isNaN(threshold) || threshold < 1);

    if (invalidAmount) {
      setError('Subscription amounts must be non-negative numbers.');
      return;
    }
    if (invalidThreshold) {
      setError('Per-trip ride threshold must be at least 1.');
      return;
    }

    const plansToValidate = roleSubscriptionPayloads.flatMap((roleConfig) =>
      SUBSCRIPTION_PERIOD_OPTIONS.map((plan) => roleConfig[plan]),
    );
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
        operator: normalizeRoleSubscriptionConfig(saved.operator || {}),
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
    const operator = Number(registrationFees.operator_registration_fee || 0);
    const normalizeDatePayload = (value) => {
      const trimmed = String(value || '').trim();
      if (!trimmed) {
        return null;
      }
      return trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
    };
    const schemeStartAt = normalizeDatePayload(registrationFees.scheme_start_at);
    const schemeEndAt = normalizeDatePayload(registrationFees.scheme_end_at);
    if (
      Number.isNaN(passenger) ||
      passenger < 0 ||
      Number.isNaN(driver) ||
      driver < 0 ||
      Number.isNaN(operator) ||
      operator < 0
    ) {
      setError('Registration fees must be valid non-negative numbers.');
      return;
    }
    if ((passenger > 0 || driver > 0 || operator > 0) && (!schemeStartAt || !schemeEndAt)) {
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
            operator_registration_fee: operator,
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
        operator_registration_fee: String(result.operator_registration_fee ?? 0),
        scheme_start_at: normalizeDateTimeText(result.scheme_start_at),
        scheme_end_at: normalizeDateTimeText(result.scheme_end_at),
        enable_qr: Boolean(result.enable_qr),
        enable_razorpay: Boolean(result.enable_razorpay),
        registration_qr_code_url: String(result.registration_qr_code_url || ''),
        registration_upi_id: String(result.registration_upi_id || ''),
        razorpay_payment_link: String(result.razorpay_payment_link || ''),
      });
      setUploadedQrFilename('');
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

    const allowedRoles = ['passenger', 'driver', 'operator'];
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
      setSpinWinWinners(normalizeListResponse(winners, ['winners']));
    }
  };

  const updateRideProductDistrictField = (field, value) => {
    setRideProductDistrictConfig((prev) => ({ ...prev, [field]: value }));
  };

  const updateSelectedDistrictProducts = (district, updater) => {
    const districtKey = normalizeDistrictKey(district);
    if (!districtKey) {
      return;
    }
    const currentRulesMap = parseDistrictRulesText(rideProductDistrictConfig.district_rules_text);
    const current = currentRulesMap[districtKey] || { district, products: [] };
    const nextProducts = Array.from(new Set((updater(current.products) || []).filter((key) => RIDE_PRODUCT_KEYS.includes(key))));
    if (nextProducts.length === 0) {
      delete currentRulesMap[districtKey];
    } else {
      currentRulesMap[districtKey] = { district: current.district || district, products: nextProducts };
    }
    updateRideProductDistrictField('district_rules_text', serializeDistrictRulesText(currentRulesMap));
  };

  const getSelectedDistrictProducts = () => {
    const districtKey = normalizeDistrictKey(selectedDistrictForProducts);
    const rulesMap = parseDistrictRulesText(rideProductDistrictConfig.district_rules_text);
    return rulesMap[districtKey]?.products || [];
  };

  const toggleDistrictProduct = (district, productKey) => {
    updateSelectedDistrictProducts(district, (currentProducts) => (
      currentProducts.includes(productKey)
        ? currentProducts.filter((key) => key !== productKey)
        : [...currentProducts, productKey]
    ));
  };

  const applyAirportDistrictPreset = () => {
    const rulesMap = parseDistrictRulesText(rideProductDistrictConfig.district_rules_text);
    KERALA_DISTRICTS.forEach((district) => {
      const districtKey = normalizeDistrictKey(district);
      const current = rulesMap[districtKey] || { district, products: ['normal'] };
      const next = new Set(current.products);
      if (AIRPORT_ALLOWED_DISTRICTS.includes(district)) {
        next.add('airport');
      } else {
        next.delete('airport');
      }
      next.add('normal');
      rulesMap[districtKey] = { district, products: Array.from(next) };
    });
    updateRideProductDistrictField('district_rules_text', serializeDistrictRulesText(rulesMap));
    setMessage('Airport product preset applied for Trivandrum, Kochi (Ernakulam), and Kozhikode.');
  };

  const copyDistrictProductRules = () => {
    const sourceDistrict = String(copySourceDistrictForProducts || '').trim();
    const targetDistrict = String(selectedDistrictForProducts || '').trim();
    if (!sourceDistrict || !targetDistrict) {
      setError('Choose source and target districts.');
      return;
    }
    if (normalizeDistrictKey(sourceDistrict) === normalizeDistrictKey(targetDistrict)) {
      setError('Source and target districts must be different.');
      return;
    }
    const rulesMap = parseDistrictRulesText(rideProductDistrictConfig.district_rules_text);
    const sourceProducts = rulesMap[normalizeDistrictKey(sourceDistrict)]?.products || [];
    if (sourceProducts.length === 0) {
      setError(`No product rules found in ${sourceDistrict} to copy.`);
      return;
    }
    updateSelectedDistrictProducts(targetDistrict, () => [...sourceProducts]);
    setMessage(`Copied ride products from ${sourceDistrict} to ${targetDistrict}.`);
  };

  const saveRideProductDistrictConfig = async () => {
    const defaultEnabledProducts = parseRideProductList(rideProductDistrictConfig.default_enabled_products_text);
    if (defaultEnabledProducts.length === 0) {
      setError('Default enabled products cannot be empty.');
      return;
    }

    const districtRules = Object.values(parseDistrictRulesText(rideProductDistrictConfig.district_rules_text))
      .map((row) => ({
        district: row.district,
        enabled_products: row.products,
      }))
      .filter((row) => row.district && row.enabled_products.length > 0);

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
  const selectedDistrictProducts = getSelectedDistrictProducts();

  const reviewWalletTopup = async (orderId, status) => {
    const reviewed = await runAction(
      () =>
        apiRequest(`/admin/wallet/topups/${orderId}`, {
          method: 'PUT',
          token,
          body: {
            status,
            reject_reason: status === 'rejected' ? 'Rejected by admin review.' : undefined,
          },
        }),
      `Wallet top-up ${status}.`,
    );
    if (reviewed) {
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

  const reviewAccountDeletion = async (requestId, status) => {
    const reviewed = await runAction(
      () =>
        apiRequest(`/admin/account-deletions/${requestId}`, {
          method: 'PUT',
          token,
          body: {
            status,
            reject_reason: status === 'rejected' ? 'Rejected by admin review.' : undefined,
          },
        }),
      `Account deletion ${status}.`,
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
    try {
      return formatToIST(value, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return String(value);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
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
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Operators</Text>
              <Text style={styles.statValue}>{stats.total_operators || 0}</Text>
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
          <Text style={styles.sectionTitle}>All Ongoing Trips ({ongoingTrips.length})</Text>

          <AdminSearchBar
            placeholder="Search by trip ID, passenger, or driver..."
            value={tripsSearchTerm}
            onSearch={setTripsSearchTerm}
            filterOptions={[
              { label: 'All Status', value: 'all' },
              { label: 'Active', value: 'active' },
              { label: 'Waiting', value: 'waiting' },
              { label: 'Pickup', value: 'pickup' },
              { label: 'In Transit', value: 'in_transit' },
            ]}
            selectedFilter={tripsFilterStatus}
            onFilterChange={setTripsFilterStatus}
          />

          {filteredTrips.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {ongoingTrips.length === 0 ? 'No ongoing trips.' : 'No trips match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredTrips.map((trip) => (
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
                    Fare: Rs {Number(trip.estimated_fare || 0).toFixed(2)} | Distance: {Number(trip.distance_km || 0).toFixed(2)} km
                  </Text>
                  <Text style={styles.kycDate}>Created: {formatDateTime(trip.created_at)}</Text>
                  <Text style={styles.inputLabel}>Cancel reason</Text>
                  <VoiceTextInput
                    style={styles.input}
                    value={tripCancelReasons[trip.id] || ''}
                    onChangeText={(value) => updateTripCancelReason(trip.id, value)}
                    placeholder="Reason for cancellation..."
                    placeholderTextColor="#9AA7A0"
                  />
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnReject]}
                      onPress={() => {
                        setConfirmTripAction({ tripId: trip.id, reason: tripCancelReasons[trip.id] || '' });
                        setShowConfirmTripsModal(true);
                      }}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Cancel Trip</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <PaginationControls
                currentPage={tripsPage}
                pageSize={tripsPageSize}
                totalItems={ongoingTrips.length}
                onPageChange={setTripsPage}
                onPageSizeChange={setTripsPageSize}
                disabled={loading}
              />
            </>
          )}

          <ConfirmationDialog
            visible={showConfirmTripsModal}
            title="Cancel Trip?"
            message="Are you sure you want to cancel this trip?"
            details={confirmTripAction.reason ? `Reason: ${confirmTripAction.reason}` : 'No reason provided'}
            confirmText="YES, CANCEL"
            confirmButtonColor="#FF3B30"
            cancelText="NO, KEEP"
            onConfirm={() => handleCancelTripWithConfirm(confirmTripAction.tripId)}
            onCancel={() => setShowConfirmTripsModal(false)}
            isLoading={auditLogging}
            dangerous={true}
          />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'users' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>
            Users ({driverUsers.length + passengerUsers.length + operatorUsers.length})
          </Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Drivers Live</Text>
              <Text style={styles.statValue}>{liveCounts.drivers_live}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Passengers Live</Text>
              <Text style={styles.statValue}>{liveCounts.passengers_live}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Operators</Text>
              <Text style={styles.statValue}>{liveCounts.operators_total}</Text>
            </View>
            <View style={[styles.statCard, styles.fullWidthCard]}>
              <Text style={styles.statLabel}>Total Live Users</Text>
              <Text style={styles.statValue}>{liveCounts.total_live}</Text>
            </View>
          </View>

          <AdminSearchBar
            placeholder="Search by name, email, phone, or ID..."
            value={usersSearchTerm}
            onSearch={setUsersSearchTerm}
            filterOptions={[
              { label: 'All Users', value: 'all' },
              { label: 'Drivers Only', value: 'driver' },
              { label: 'Passengers Only', value: 'passenger' },
              { label: 'Operators Only', value: 'operator' },
            ]}
            selectedFilter={usersFilterRole}
            onFilterChange={setUsersFilterRole}
          />

          {filteredUsers.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {driverUsers.length + passengerUsers.length + operatorUsers.length === 0
                  ? 'No users found.'
                  : 'No users match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredUsers.map((user) => (
                <View key={user.id} style={styles.kycCard}>
                  <View style={styles.userRowHeader}>
                    <View>
                      <Text style={styles.driverName}>{user.name || 'Unknown User'}</Text>
                      <Text style={styles.kycDate}>
                        {user.role === 'driver' ? 'Driver' : user.role === 'operator' ? 'Operator' : 'Passenger'}
                      </Text>
                    </View>
                    <Text style={[styles.liveBadge, user.is_live ? styles.liveBadgeOn : styles.liveBadgeOff]}>
                      {user.is_live ? 'LIVE' : 'OFFLINE'}
                    </Text>
                  </View>
                  <Text style={styles.kycDate}>{user.email} | {user.phone}</Text>
                  <Text style={styles.kycDate}>ID: {user.id}</Text>
                  {user.role === 'driver' && (
                    <>
                      <Text style={styles.kycDate}>Available: {user.is_available ? 'Yes' : 'No'}</Text>
                      <Text style={styles.kycDate}>KYC: {user.kyc_status || 'pending'}</Text>
                      {!!user.active_booking_id && (
                        <Text style={styles.kycDate}>Active Trip: {user.active_booking_id}</Text>
                      )}
                      {!!user.live_location_updated_at && (
                        <Text style={styles.kycDate}>Live Updated: {formatDateTime(user.live_location_updated_at)}</Text>
                      )}
                    </>
                  )}
                  {user.role === 'passenger' && (
                    <>
                      {!!user.active_booking_id && (
                        <Text style={styles.kycDate}>Active Trip: {user.active_booking_id}</Text>
                      )}
                    </>
                  )}
                </View>
              ))}
              <PaginationControls
                currentPage={usersPage}
                pageSize={usersPageSize}
                totalItems={driverUsers.length + passengerUsers.length + operatorUsers.length}
                onPageChange={setUsersPage}
                onPageSizeChange={setUsersPageSize}
                disabled={loading}
              />
            </>
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'role_report' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Role-wise User Report</Text>
          <Text style={styles.kycDate}>
            Passenger, driver, and operator accounts with name, email, phone, and joining date.
          </Text>
          <Text style={styles.kycDate}>Generated: {formatDateTime(rolewiseUserReport.generated_at)}</Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Passengers</Text>
              <Text style={styles.statValue}>{rolewiseUserReport.counts.passengers}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Drivers</Text>
              <Text style={styles.statValue}>{rolewiseUserReport.counts.drivers}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Operators</Text>
              <Text style={styles.statValue}>{rolewiseUserReport.counts.operators}</Text>
            </View>
            <View style={[styles.statCard, styles.fullWidthCard]}>
              <Text style={styles.statLabel}>Total Report Users</Text>
              <Text style={styles.statValue}>{rolewiseUserReport.counts.total}</Text>
            </View>
          </View>

          <AdminSearchBar
            placeholder="Search report by name, email, phone, or ID..."
            value={usersSearchTerm}
            onSearch={setUsersSearchTerm}
            filterOptions={[
              { label: 'All Roles', value: 'all' },
              { label: 'Drivers', value: 'driver' },
              { label: 'Passengers', value: 'passenger' },
              { label: 'Operators', value: 'operator' },
            ]}
            selectedFilter={usersFilterRole}
            onFilterChange={setUsersFilterRole}
          />

          {filteredRoleReportSections.every((section) => section.rows.length === 0) ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No report users match your search.</Text>
            </View>
          ) : (
            filteredRoleReportSections.map((section) => (
              <View key={section.key} style={styles.kycCard}>
                <Text style={styles.sectionSubtitle}>
                  {section.title} ({section.rows.length})
                </Text>
                {section.rows.length === 0 ? (
                  <Text style={styles.kycDate}>No {section.title.toLowerCase()} found.</Text>
                ) : (
                  section.rows.map((reportUser) => (
                    <View key={reportUser.id || `${section.key}-${reportUser.email}`} style={styles.roleReportRow}>
                      <Text style={styles.driverName}>{reportUser.name || 'Unknown User'}</Text>
                      <Text style={styles.kycDate}>Email: {reportUser.email || 'N/A'}</Text>
                      <Text style={styles.kycDate}>Phone: {reportUser.phone || 'N/A'}</Text>
                      <Text style={styles.kycDate}>Joining Date: {formatDateTime(reportUser.joining_date || reportUser.created_at)}</Text>
                      <Text style={styles.kycDate}>User ID: {reportUser.id || 'N/A'}</Text>
                    </View>
                  ))
                )}
              </View>
            ))
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'launch_visits' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Launch Page Visitor Report</Text>
          <Text style={styles.kycDate}>
            Auto-tracked whenever the public launch page opens. Range: last {launchVisitReport.days || 30} days.
          </Text>

          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Total Clicks</Text>
              <Text style={styles.statValue}>{Number(launchVisitReport.summary?.total_clicks || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Unique Visitors</Text>
              <Text style={styles.statValue}>{Number(launchVisitReport.summary?.unique_visitors || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Known Visitors</Text>
              <Text style={styles.statValue}>{Number(launchVisitReport.summary?.known_visitors || 0)}</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statLabel}>Unique IPs</Text>
              <Text style={styles.statValue}>{Number(launchVisitReport.summary?.unique_ips || 0)}</Text>
            </View>
          </View>

          <Text style={styles.sectionSubtitle}>Daily Click Trend</Text>
          {Array.isArray(launchVisitReport.daily) && launchVisitReport.daily.length > 0 ? (
            launchVisitReport.daily.map((row) => (
              <View key={String(row.date)} style={styles.kycCard}>
                <Text style={styles.driverName}>{row.date}</Text>
                <Text style={styles.kycDate}>Clicks: {Number(row.clicks || 0)}</Text>
                <Text style={styles.kycDate}>Unique Visitors: {Number(row.unique_visitors || 0)}</Text>
                <Text style={styles.kycDate}>Unique IPs: {Number(row.unique_ips || 0)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No launch visits recorded yet.</Text>
            </View>
          )}

          <Text style={styles.sectionSubtitle}>Visitors (Who Opened the Launch Page)</Text>
          {Array.isArray(launchVisitReport.visitors) && launchVisitReport.visitors.length > 0 ? (
            launchVisitReport.visitors.map((visitor, idx) => (
              <View key={`${visitor.identity_key || 'visitor'}-${idx}`} style={styles.kycCard}>
                <Text style={styles.driverName}>
                  {visitor.name || visitor.phone || visitor.email || visitor.identity_key || 'Anonymous visitor'}
                </Text>
                <Text style={styles.kycDate}>Phone: {visitor.phone || 'N/A'}</Text>
                <Text style={styles.kycDate}>Email: {visitor.email || 'N/A'}</Text>
                <Text style={styles.kycDate}>Role: {visitor.role || 'Unknown'}</Text>
                <Text style={styles.kycDate}>IP: {visitor.ip_address || 'N/A'}</Text>
                <Text style={styles.kycDate}>
                  Location: {[visitor.city, visitor.region, visitor.country].filter(Boolean).join(', ') || 'Unknown'}
                </Text>
                <Text style={styles.kycDate}>Visits: {Number(visitor.visit_count || 0)}</Text>
                <Text style={styles.kycDate}>Last Seen: {formatDateTime(visitor.last_seen_at)}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No visitor identities available yet.</Text>
            </View>
          )}

          <Text style={styles.sectionSubtitle}>Recent Launch Clicks</Text>
          {Array.isArray(launchVisitReport.recent_clicks) && launchVisitReport.recent_clicks.length > 0 ? (
            launchVisitReport.recent_clicks.map((click, idx) => (
              <View key={`${click.id || 'click'}-${idx}`} style={styles.kycCard}>
                <Text style={styles.driverName}>{formatDateTime(click.created_at)}</Text>
                <Text style={styles.kycDate}>
                  Visitor: {click.name || click.phone || click.email || click.identity_key || 'Anonymous'}
                </Text>
                <Text style={styles.kycDate}>Phone: {click.phone || 'N/A'}</Text>
                <Text style={styles.kycDate}>IP: {click.ip_address || 'N/A'}</Text>
                <Text style={styles.kycDate}>
                  Location: {[click.city, click.region, click.country].filter(Boolean).join(', ') || 'Unknown'}
                </Text>
                <Text style={styles.kycDate}>Page: {click.page_url || 'N/A'}</Text>
                <Text style={styles.kycDate}>Referrer: {click.referrer || 'Direct'}</Text>
              </View>
            ))
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No recent click records found.</Text>
            </View>
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
              {['passenger', 'driver', 'operator'].map((role) => {
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
                      {role === 'passenger' ? 'Passengers' : role === 'driver' ? 'Drivers' : 'Operators'}
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
          {['passenger', 'driver', 'operator'].map((roleKey) => (
            <View key={roleKey} style={styles.kycCard}>
              <Text style={styles.driverName}>
                {roleKey === 'driver' ? 'Driver Plans' : roleKey === 'operator' ? 'Operator Plans' : 'Passenger Plans'}
              </Text>
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
          <Text style={styles.sectionTitle}>Pending Subscription Activations ({pendingSubscriptionActivations.length})</Text>

          <AdminSearchBar
            placeholder="Search by name, email, phone, or ID..."
            value={subscriptionSearchTerm}
            onSearch={setSubscriptionSearchTerm}
          />

          {filteredSubscription.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {pendingSubscriptionActivations.length === 0 ? 'No pending subscription activations.' : 'No results match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredSubscription.map((item) => (
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
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Deactivate</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnApprove]}
                      onPress={() => {
                        handleSubscriptionApproval(item.id, 'approved');
                        activateSubscriptionForUser(item.id, item.subscription?.plan_type, true);
                      }}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Activate</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <PaginationControls
                currentPage={subscriptionPage}
                pageSize={subscriptionPageSize}
                totalItems={pendingSubscriptionActivations.length}
                onPageChange={setSubscriptionPage}
                onPageSizeChange={setSubscriptionPageSize}
                disabled={loading}
              />
            </>
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
          <Text style={styles.sectionTitle}>Pending Phone Change Requests ({pendingPhoneChangeRequests.length})</Text>

          <AdminSearchBar
            placeholder="Search by name, email, phone, or ID..."
            value={phoneSearchTerm}
            onSearch={setPhoneSearchTerm}
          />

          {filteredPhone.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {pendingPhoneChangeRequests.length === 0 ? 'No pending phone change requests.' : 'No results match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredPhone.map((item) => (
                <View key={`${item.user_id}-${item.new_phone}`} style={styles.kycCard}>
                  <Text style={styles.driverName}>{item.name}</Text>
                  <Text style={styles.kycDate}>{item.email} | {item.current_phone}</Text>
                  <Text style={styles.kycDate}>Role: {item.role}</Text>
                  <Text style={styles.kycDate}>Requested new phone: {item.new_phone}</Text>
                  <Text style={styles.kycDate}>OTP verified: {item.verified ? 'Yes' : 'No'}</Text>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnReject]}
                      onPress={() => handlePhoneChangeApproval(item.user_id, 'rejected')}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnApprove]}
                      onPress={() => handlePhoneChangeApproval(item.user_id, 'approved')}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <PaginationControls
                currentPage={phonePage}
                pageSize={phonePageSize}
                totalItems={pendingPhoneChangeRequests.length}
                onPageChange={setPhonePage}
                onPageSizeChange={setPhonePageSize}
                disabled={loading}
              />
            </>
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'account_deletions' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Pending Account Deletion Requests ({pendingAccountDeletionRequests.length})</Text>

          <AdminSearchBar
            placeholder="Search by name, email, phone, or ID..."
            value={deletionSearchTerm}
            onSearch={setDeletionSearchTerm}
          />

          {filteredDeletion.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {pendingAccountDeletionRequests.length === 0 ? 'No pending account deletion requests.' : 'No results match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredDeletion.map((item) => (
                <View key={item.id} style={styles.kycCard}>
                  <Text style={styles.driverName}>{item.name || 'Passenger'}</Text>
                  <Text style={styles.kycDate}>{item.email || 'N/A'} | {item.phone || 'N/A'}</Text>
                  <Text style={styles.kycDate}>User ID: {item.user_id}</Text>
                  <Text style={styles.kycDate}>Role: {item.role || 'passenger'}</Text>
                  <Text style={styles.kycDate}>Account status: {item.account_status || 'deletion_pending'}</Text>
                  <Text style={styles.kycDate}>Requested: {String(item.created_at || '')}</Text>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnReject]}
                      onPress={() => handleAccountDeletionApproval(item.id, 'rejected')}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnApprove]}
                      onPress={() => handleAccountDeletionApproval(item.id, 'approved')}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Approve & Block</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <PaginationControls
                currentPage={deletionPage}
                pageSize={deletionPageSize}
                totalItems={pendingAccountDeletionRequests.length}
                onPageChange={setDeletionPage}
                onPageSizeChange={setDeletionPageSize}
                disabled={loading}
              />
            </>
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

        <View style={[styles.section, activeAdminMenu !== 'ride_products' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>District Ride Product Assignment</Text>
          <View style={styles.kycCard}>
            <Text style={styles.sectionSubtitle}>Quick District Editor</Text>
            <Text style={styles.kycDate}>
              Select a district and enable only the ride products you want to allow there.
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.districtChipRow}>
              {KERALA_DISTRICTS.map((district) => (
                <TouchableOpacity
                  key={district}
                  style={[
                    styles.districtChip,
                    selectedDistrictForProducts === district && styles.districtChipActive,
                  ]}
                  onPress={() => setSelectedDistrictForProducts(district)}>
                  <Text
                    style={[
                      styles.districtChipText,
                      selectedDistrictForProducts === district && styles.districtChipTextActive,
                    ]}>
                    {district}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>

            <Text style={styles.inputLabel}>
              Enabled In {selectedDistrictForProducts}
            </Text>
            <Text style={styles.inputLabel}>Copy From District</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.districtChipRow}>
              {KERALA_DISTRICTS.map((district) => (
                <TouchableOpacity
                  key={`copy-${district}`}
                  style={[
                    styles.districtChip,
                    copySourceDistrictForProducts === district && styles.districtChipActive,
                  ]}
                  onPress={() => setCopySourceDistrictForProducts(district)}>
                  <Text
                    style={[
                      styles.districtChipText,
                      copySourceDistrictForProducts === district && styles.districtChipTextActive,
                    ]}>
                    {district}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <View style={styles.productChipGrid}>
              {RIDE_PRODUCT_KEYS.map((productKey) => {
                const enabled = selectedDistrictProducts.includes(productKey);
                return (
                  <TouchableOpacity
                    key={productKey}
                    style={[styles.productChip, enabled && styles.productChipActive]}
                    onPress={() => toggleDistrictProduct(selectedDistrictForProducts, productKey)}>
                    <Text style={[styles.productChipText, enabled && styles.productChipTextActive]}>
                      {RIDE_PRODUCT_LABELS[productKey] || productKey}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.btn, styles.btnApprove]}
                onPress={copyDistrictProductRules}
                disabled={loading}>
                <Text style={styles.btnText}>Copy To {selectedDistrictForProducts}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, styles.btnApprove]}
                onPress={applyAirportDistrictPreset}
                disabled={loading}>
                <Text style={styles.btnText}>Apply Airport Preset</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionSubtitle}>Advanced Rule Text (Optional)</Text>
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
            <Text style={styles.inputLabel}>Operator Registration Fee (Rs)</Text>
            <VoiceTextInput
              style={styles.input}
              value={registrationFees.operator_registration_fee}
              onChangeText={(value) =>
                setRegistrationFees((prev) => ({ ...prev, operator_registration_fee: value }))
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
            {Platform.OS === 'web' && (
              <>
                <Text style={styles.inputLabel}>Upload QR Image</Text>
                <View style={styles.uploadRow}>
                  <input
                    ref={qrUploadInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: 'none' }}
                    onChange={async (event) => {
                      const file = event.target?.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = () => {
                        const result = reader.result;
                        if (typeof result === 'string') {
                          setRegistrationFees((prev) => ({
                            ...prev,
                            registration_qr_code_url: result,
                          }));
                          setUploadedQrFilename(file.name);
                        }
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                  <TouchableOpacity
                    style={[styles.secondaryButton, styles.uploadButton]}
                    onPress={() => qrUploadInputRef.current?.click()}>
                    <Text style={styles.secondaryText}>Upload QR Image</Text>
                  </TouchableOpacity>
                  {!!uploadedQrFilename && (
                    <Text style={styles.uploadHint}>{uploadedQrFilename}</Text>
                  )}
                </View>
              </>
            )}
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

        <View style={[styles.section, activeAdminMenu !== 'wallet' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>Pending Wallet Top-up Verifications ({pendingWalletTopups.length})</Text>

          <AdminSearchBar
            placeholder="Search by name, email, phone, or order ID..."
            value={walletSearchTerm}
            onSearch={setWalletSearchTerm}
          />

          {filteredWallet.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {pendingWalletTopups.length === 0 ? 'No pending wallet top-up verifications.' : 'No results match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredWallet.map((item) => (
                <View key={item.order_id} style={styles.kycCard}>
                  <Text style={styles.driverName}>{item.name || 'User'}</Text>
                  <Text style={styles.kycDate}>{item.email} | {item.phone}</Text>
                  <Text style={styles.kycDate}>Role: {item.role || 'N/A'}</Text>
                  <Text style={styles.kycDate}>Order: {item.order_id}</Text>
                  <Text style={styles.kycDate}>Amount: Rs {Number(item.amount || 0).toFixed(2)}</Text>
                  <Text style={styles.kycDate}>Provider: {item.provider || 'N/A'}</Text>
                  {!!item.transaction_ref && <Text style={styles.kycDate}>Reference: {item.transaction_ref}</Text>}
                  <Text style={styles.kycDate}>Submitted: {String(item.submitted_at || '')}</Text>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnReject]}
                      onPress={() => handleWalletTopupApproval(item.order_id, 'rejected')}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnApprove]}
                      onPress={() => handleWalletTopupApproval(item.order_id, 'verified')}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Verify & Credit</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <PaginationControls
                currentPage={walletPage}
                pageSize={walletPageSize}
                totalItems={pendingWalletTopups.length}
                onPageChange={setWalletPage}
                onPageSizeChange={setWalletPageSize}
                disabled={loading}
              />
            </>
          )}
        </View>

        <View style={[styles.section, activeAdminMenu !== 'kyc' && styles.hiddenSection]}>
          <Text style={styles.sectionTitle}>KYC Verification ({kycRequests.length})</Text>

          <AdminSearchBar
            placeholder="Search by driver name, phone, or ID..."
            value={kycSearchTerm}
            onSearch={setKycSearchTerm}
            filterOptions={[
              { label: 'All Status', value: 'all' },
              { label: 'Pending', value: 'pending' },
              { label: 'Approved', value: 'approved' },
              { label: 'Rejected', value: 'rejected' },
            ]}
            selectedFilter={kycFilterStatus}
            onFilterChange={setKycFilterStatus}
          />

          {filteredKyc.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {kycRequests.length === 0 ? 'No KYC requests.' : 'No KYC requests match your search.'}
              </Text>
            </View>
          ) : (
            <>
              {filteredKyc.map((kyc) => (
                <View key={kyc.driver_id || kyc.id} style={styles.kycCard}>
                  <Text style={styles.driverName}>{kyc.driver_name}</Text>
                  <Text style={styles.kycDate}>Driver ID: {kyc.driver_id}</Text>
                  <Text style={styles.kycDate}>Phone: {kyc.driver_phone}</Text>
                  <Text style={styles.kycDate}>Status: {kyc.status || 'Pending'}</Text>
                  <Text style={styles.kycDate}>Submitted: {kyc.submitted_at}</Text>
                  <View style={styles.actionButtons}>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnInfo]}
                      onPress={() => {
                        setSelectedKycForPreview(kyc);
                        setShowKycPreview(true);
                      }}>
                      <Text style={styles.btnText}>👁 Documents</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnReject]}
                      onPress={() => {
                        setConfirmKycAction({ kycId: kyc.driver_id || kyc.id, decision: 'reject' });
                        setShowConfirmKycModal(true);
                      }}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.btn, styles.btnApprove]}
                      onPress={() => {
                        setConfirmKycAction({ kycId: kyc.driver_id || kyc.id, decision: 'approve' });
                        setShowConfirmKycModal(true);
                      }}
                      disabled={loading || auditLogging}>
                      <Text style={styles.btnText}>✓ Approve</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              <PaginationControls
                currentPage={kycPage}
                pageSize={kycPageSize}
                totalItems={kycRequests.length}
                onPageChange={setKycPage}
                onPageSizeChange={setKycPageSize}
                disabled={loading}
              />
            </>
          )}

          <KycDocumentPreview
            visible={showKycPreview}
            documents={{
              id_proof: selectedKycForPreview?.id_proof_url,
              driving_license: selectedKycForPreview?.driving_license_url,
              vehicle_rc: selectedKycForPreview?.vehicle_rc_url,
              insurance: selectedKycForPreview?.insurance_url,
              pollution_cert: selectedKycForPreview?.pollution_certificate_url,
              badge_photo: selectedKycForPreview?.badge_photo_url,
            }}
            driverName={selectedKycForPreview?.driver_name}
            onClose={() => setShowKycPreview(false)}
            onApprove={(docType) => {
              if (docType === 'all') {
                handleApproveKyc(selectedKycForPreview?.driver_id || selectedKycForPreview?.id);
                setShowKycPreview(false);
              }
            }}
            onReject={(docType, reason) => {
              if (docType === 'all') {
                handleRejectKyc(selectedKycForPreview?.driver_id || selectedKycForPreview?.id, reason || 'Unclear documents');
                setShowKycPreview(false);
              }
            }}
          />

          <ConfirmationDialog
            visible={showConfirmKycModal}
            title={confirmKycAction.decision === 'approve' ? 'Approve KYC?' : 'Reject KYC?'}
            message={`Are you sure you want to ${confirmKycAction.decision} this driver's KYC?`}
            confirmText={confirmKycAction.decision === 'approve' ? 'YES, APPROVE' : 'YES, REJECT'}
            confirmButtonColor={confirmKycAction.decision === 'approve' ? '#4CAF50' : '#FF9800'}
            cancelText="NO, CANCEL"
            onConfirm={() => {
              if (confirmKycAction.decision === 'approve') {
                handleApproveKyc(confirmKycAction.kycId);
              } else {
                handleRejectKyc(confirmKycAction.kycId, 'Rejected by admin');
              }
            }}
            onCancel={() => setShowConfirmKycModal(false)}
            isLoading={auditLogging}
          />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'rate_limits' && styles.hiddenSection]}>
          <AdminRateLimitConfig
            token={token}
            isActive={activeAdminMenu === 'rate_limits'}
            onClose={() => setActiveAdminMenu(PRIMARY_ADMIN_MENU_KEY)}
          />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'documents' && styles.hiddenSection]}>
          <AdminDocumentRequirements
            isActive={activeAdminMenu === 'documents'}
            onClose={() => setActiveAdminMenu(PRIMARY_ADMIN_MENU_KEY)}
          />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'fares' && styles.hiddenSection]}>
          <AdminFareConfiguration
            isActive={activeAdminMenu === 'fares'}
            onClose={() => setActiveAdminMenu(PRIMARY_ADMIN_MENU_KEY)}
          />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'fare_proposals' && styles.hiddenSection]}>
          <AdminFareProposals
            isActive={activeAdminMenu === 'fare_proposals'}
            onClose={() => setActiveAdminMenu(PRIMARY_ADMIN_MENU_KEY)}
          />
        </View>

        <View style={[styles.section, activeAdminMenu !== 'vehicle_types' && styles.hiddenSection]}>
          <AdminVehicleManagementScreen
            embedded
            token={token}
          />
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
  districtChipRow: { gap: 8, paddingRight: 8, marginBottom: 12 },
  districtChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 20,
    backgroundColor: '#F6FAF7',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  districtChipActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E7F3EC',
  },
  districtChipText: { color: '#355243', fontWeight: '700' },
  districtChipTextActive: { color: '#2E7D32' },
  productChipGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  productChip: {
    borderWidth: 1,
    borderColor: '#CBD9D0',
    borderRadius: 10,
    backgroundColor: '#F6FAF7',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  productChipActive: {
    borderColor: '#2E7D32',
    backgroundColor: '#E7F3EC',
  },
  productChipText: { color: '#355243', fontWeight: '700', fontSize: 12 },
  productChipTextActive: { color: '#2E7D32' },
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
  uploadRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 },
  uploadHint: { color: COLORS.textMuted, fontSize: 12, flexShrink: 1 },
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
  roleReportRow: {
    borderTopWidth: 1,
    borderTopColor: '#E7EEE9',
    paddingTop: 12,
    marginTop: 12,
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
