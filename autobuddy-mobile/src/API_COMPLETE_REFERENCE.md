/**
 * COMPLETE API REFERENCE - AutoBuddy Frontend Integration
 * 
 * This file documents all 82+ backend endpoints grouped by feature
 * with usage examples and expected responses.
 */

// ═══════════════════════════════════════════════════════════════════
// BOOKING & DISPATCH ENDPOINTS (6 endpoints)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/bookings
 * Create new booking
 * @request {
 *   pickup_latitude: number,
 *   pickup_longitude: number,
 *   pickup_location: string,
 *   dropoff_latitude: number,
 *   dropoff_longitude: number,
 *   dropoff_location: string,
 *   vehicle_type_id: string,
 *   ride_type: 'regular' | 'scheduled' | 'goods' | 'airport',
 *   passenger_count: number,
 *   scheduled_datetime?: string (ISO),
 *   promo_code?: string,
 *   goods_details?: { weight_kg, type, loading_help },
 *   airport_details?: { terminal, flight_number }
 * }
 * @response { booking_id, status, estimated_fare, driver_count }
 */
import { bookingAPI } from '@/services/apiClient';
const booking = await bookingAPI.createBooking({
  pickup_latitude: 12.9352,
  pickup_longitude: 77.6245,
  dropoff_latitude: 12.9698,
  dropoff_longitude: 77.5997,
  vehicle_type_id: 'sedan',
  ride_type: 'regular',
  passenger_count: 1
});

/**
 * GET /api/bookings?skip=0&limit=50
 * List user's bookings with pagination
 * @response { bookings: [], total, skip, limit }
 */
const bookingList = await bookingAPI.listBookings(0, 50);

/**
 * GET /api/bookings/{bookingId}
 * Get specific booking details
 * @response { booking_id, status, driver, fare, locations, receipt }
 */
const details = await bookingAPI.getBooking(bookingId);

/**
 * POST /api/bookings/{bookingId}/cancel
 * Cancel booking (passenger-side)
 * @request { reason?: string }
 * @response { status: 'cancelled', cancellation_fee }
 */
await bookingAPI.cancelBooking(bookingId, 'Driver is late');

/**
 * POST /api/dispatch/{bookingId}/match-drivers
 * Find matching drivers and send offers
 * @response {
 *   offers_sent: 5,
 *   candidates: [ { driver_id, score, eta, rating } ],
 *   expires_at: timestamp (2 minutes)
 * }
 */
const drivers = await bookingAPI.requestDrivers(bookingId);

/**
 * POST /api/dispatch/{bookingId}/auto-assign
 * Automatically assign best-scoring driver
 * @response { driver_id, assigned_at, eta }
 */
const assigned = await bookingAPI.autoAssignDriver(bookingId);

/**
 * GET /api/dispatch/{bookingId}/candidate-drivers
 * Admin view of all matching candidates
 * @response { candidates: [ { driver_id, name, score, location, rating } ] }
 */
const candidates = await bookingAPI.getCandidateDrivers(bookingId);

// ═══════════════════════════════════════════════════════════════════
// DRIVER AVAILABILITY & OPERATIONS (5 endpoints)
// ═══════════════════════════════════════════════════════════════════

/**
 * PUT /api/drivers/{driverId}/availability
 * Toggle driver online/offline with location
 * @request {
 *   availability_status: 'online' | 'offline',
 *   location: { latitude, longitude }
 * }
 * @response { status, availability_status, current_location }
 */
import { driverAPI } from '@/services/apiClient';
await driverAPI.setAvailability(driverId, 'online', {
  latitude: 12.9352,
  longitude: 77.6245
});

/**
 * GET /api/drivers/{driverId}/availability
 * Get current availability status
 * @response { availability_status, location, last_updated }
 */
const status = await driverAPI.getAvailability(driverId);

/**
 * GET /api/drivers/available/list?latitude=X&longitude=Y&radius_km=5
 * Get nearby available drivers (for admin dispatch)
 * @response {
 *   drivers: [
 *     { driver_id, name, location, rating, acceptance_rate, distance_km },
 *     ...
 *   ]
 * }
 */
const nearby = await driverAPI.getNearbyDrivers(12.9352, 77.6245, 5);

/**
 * POST /api/drivers/{driverId}/shift-start
 * Mark shift start time
 * @response { shift_started_at, earnings_today: 0 }
 */
await driverAPI.startShift(driverId);

/**
 * POST /api/drivers/{driverId}/shift-end
 * Mark shift end and log earnings
 * @response {
 *   shift_ended_at,
 *   total_earnings,
 *   ride_count,
 *   average_rating
 * }
 */
const shift = await driverAPI.endShift(driverId);

// ═══════════════════════════════════════════════════════════════════
// RIDE OPERATIONS (5 endpoints)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/rides/{bookingId}/start-ride
 * Driver confirms pickup and starts ride
 * @response { status: 'IN_PROGRESS', started_at, estimated_duration }
 */
import { rideAPI } from '@/services/apiClient';
await rideAPI.startRide(bookingId);

/**
 * POST /api/rides/{bookingId}/complete-ride
 * Complete ride and generate receipt
 * @response {
 *   status: 'COMPLETED',
 *   final_fare,
 *   receipt: {
 *     receipt_id,
 *     itemized: { base, distance, time, taxes },
 *     driver_earnings,
 *     payment_method
 *   }
 * }
 */
const receipt = await rideAPI.completeRide(bookingId);

/**
 * POST /api/rides/{bookingId}/cancel-ride
 * Cancel active ride (driver or passenger)
 * @request { reason?: string }
 * @response { status: 'CANCELLED', cancellation_fee }
 */
await rideAPI.cancelRide(bookingId, 'Driver needed to leave');

/**
 * POST /api/rides/{bookingId}/update-ride-location
 * Update GPS location (driver sends every 10-30s)
 * @request { latitude, longitude, timestamp }
 * @response { distance_accumulated_km, eta_minutes }
 */
await rideAPI.updateLocation(bookingId, 12.935, 77.624);

/**
 * GET /api/rides/{bookingId}/status
 * Get current ride status with all details
 * @response {
 *   booking_id,
 *   status: 'IN_PROGRESS',
 *   driver: { name, rating, vehicle },
 *   distance_accumulated_km,
 *   estimated_arrival_minutes,
 *   fare_breakdown: { base, distance, time, taxes, total },
 *   gps_tracking: [ { lat, lon, timestamp }, ... ]
 * }
 */
const rideStatus = await rideAPI.getRideStatus(bookingId);

// ═══════════════════════════════════════════════════════════════════
// PAYMENT & STRIPE WEBHOOKS (3 endpoints)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/webhooks/stripe/create-payment-intent
 * Create PaymentIntent for payment collection
 * @request { booking_id, amount }
 * @response { payment_intent_id, client_secret, amount, status }
 */
import { paymentAPI } from '@/services/apiClient';
const intent = await paymentAPI.createPaymentIntent(bookingId, 250.50);

/**
 * POST /api/webhooks/stripe/confirm-payment
 * Confirm payment after 3D Secure challenge
 * @request { payment_intent_id }
 * @response { status: 'succeeded', amount, receipt_id }
 */
await paymentAPI.confirmPayment(intent.payment_intent_id);

/**
 * POST /api/webhooks/stripe/refund
 * Refund booking payment and credit wallet
 * @request { booking_id }
 * @response { refund_id, amount, wallet_credit }
 */
await paymentAPI.refundPayment(bookingId);

// ═══════════════════════════════════════════════════════════════════
// NOTIFICATIONS (10 endpoints)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/notifications
 * Create notification
 * @request {
 *   type: 'booking' | 'payment' | 'message' | 'support' | 'safety',
 *   title: string,
 *   body: string,
 *   booking_id?: string,
 *   priority: 'low' | 'normal' | 'high' | 'critical'
 * }
 * @response { notification_id, created_at }
 */
import { notificationAPI } from '@/services/apiClient';
const notif = await notificationAPI.createNotification({
  type: 'booking',
  title: 'Driver Assigned',
  body: 'Your driver is arriving in 5 minutes',
  priority: 'high'
});

/**
 * GET /api/notifications?skip=0&limit=50&unread=true
 * List notifications with filters
 * @response { notifications: [], unread_count, total }
 */
const notifs = await notificationAPI.listNotifications({ unread: true }, 0, 50);

/**
 * GET /api/notifications/{notificationId}
 * Get single notification
 * @response { notification_id, type, title, body, read, timestamp }
 */
const notif = await notificationAPI.getNotification(notifId);

/**
 * PUT /api/notifications/{notificationId}/read
 * Mark notification as read
 * @response { read: true }
 */
await notificationAPI.markAsRead(notifId);

/**
 * PUT /api/notifications/read-all
 * Mark all as read
 * @response { updated_count }
 */
await notificationAPI.markAllAsRead();

/**
 * DELETE /api/notifications/{notificationId}
 * Delete notification
 * @response { deleted: true }
 */
await notificationAPI.deleteNotification(notifId);

/**
 * DELETE /api/notifications
 * Delete all notifications
 * @response { deleted_count }
 */
await notificationAPI.deleteAllNotifications();

/**
 * GET /api/notifications/stats/unread-count
 * Get unread count
 * @response { unread_count: 5 }
 */
const stats = await notificationAPI.getUnreadCount();

/**
 * GET /api/notifications/{userId}/preferences
 * Get notification preferences
 * @response {
 *   booking_notifications: true,
 *   payment_notifications: true,
 *   quiet_hours_enabled: true,
 *   quiet_hours_start: '22:00',
 *   quiet_hours_end: '08:00'
 * }
 */
const prefs = await notificationAPI.getPreferences(userId);

/**
 * PUT /api/notifications/{userId}/preferences
 * Update notification preferences
 * @request {
 *   booking_notifications: boolean,
 *   payment_notifications: boolean,
 *   quiet_hours_enabled: boolean,
 *   quiet_hours_start: 'HH:MM',
 *   quiet_hours_end: 'HH:MM'
 * }
 * @response { preferences: {...} }
 */
await notificationAPI.updatePreferences(userId, {
  quiet_hours_enabled: true,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00'
});

// ═══════════════════════════════════════════════════════════════════
// SUPPORT TICKETS (7 endpoints)
// ═══════════════════════════════════════════════════════════════════

/**
 * POST /api/support/tickets
 * Create support ticket
 * @request {
 *   subject: string,
 *   description: string,
 *   category: 'payment' | 'ride' | 'safety' | 'account' | 'other',
 *   booking_id?: string
 * }
 * @response { ticket_id, status: 'open', created_at }
 */
import { supportAPI } from '@/services/apiClient';
const ticket = await supportAPI.createTicket({
  subject: 'Driver behavior',
  description: 'Driver was rude and aggressive',
  category: 'safety'
});

/**
 * GET /api/support/tickets?skip=0&limit=50&status=open
 * List tickets with filters
 * @response { tickets: [], total }
 */
const tickets = await supportAPI.listTickets({ status: 'open' }, 0, 50);

/**
 * GET /api/support/tickets/{ticketId}
 * Get ticket with message history
 * @response {
 *   ticket_id,
 *   subject,
 *   status,
 *   messages: [ { author, text, timestamp } ],
 *   satisfaction_rating: 4
 * }
 */
const full = await supportAPI.getTicket(ticketId);

/**
 * POST /api/support/tickets/{ticketId}/messages
 * Add message to ticket
 * @request { message: string, attachments?: [] }
 * @response { message_id, timestamp }
 */
await supportAPI.addMessage(ticketId, 'This is urgent');

/**
 * PUT /api/support/tickets/{ticketId}/status
 * Admin: Update ticket status
 * @request {
 *   status: 'in_progress' | 'waiting_customer' | 'resolved',
 *   resolution_notes?: string
 * }
 * @response { ticket_id, status: 'resolved' }
 */
await supportAPI.updateTicketStatus(ticketId, 'resolved', 'Issue resolved with compensation');

/**
 * POST /api/support/tickets/{ticketId}/satisfaction
 * Submit satisfaction rating
 * @request { rating: 1-5 }
 * @response { ticket_id, rating, submitted_at }
 */
await supportAPI.submitSatisfaction(ticketId, 4);

/**
 * GET /api/admin/support/tickets/admin/stats/dashboard
 * Admin dashboard stats
 * @response {
 *   total_tickets: 450,
 *   status_breakdown: { open: 12, in_progress: 5, resolved: 420 },
 *   avg_satisfaction: 4.2,
 *   avg_resolution_time_hours: 24
 * }
 */
const adminStats = await supportAPI.getAdminStats();

// ═══════════════════════════════════════════════════════════════════
// ADDITIONAL MODULES (48+ endpoints)
// ═══════════════════════════════════════════════════════════════════

// Lost Items (5 endpoints)
import { lostItemsAPI } from '@/services/apiClient';
await lostItemsAPI.reportItem({ name: 'Phone', category: 'phone', location: 'Back seat' });

// Ride Pooling (5 endpoints)
import { ridePoolingAPI } from '@/services/apiClient';
await ridePoolingAPI.createPool({ pickup, dropoff, max_passengers: 4 });

// Promo Codes (4 endpoints)
import { promoAPI } from '@/services/apiClient';
const discount = await promoAPI.validateCode('PROMO20', 250);

// Accessibility (7 endpoints)
import { accessibilityAPI } from '@/services/apiClient';
await accessibilityAPI.updateRequirements(userId, { wheelchair: true });

// Scheduled Rides (6 endpoints)
import { scheduledRidesAPI } from '@/services/apiClient';
await scheduledRidesAPI.createScheduledRide({ ...bookingData, scheduled_datetime });

// Admin (5+ endpoints)
import { adminAPI } from '@/services/apiClient';
const analytics = await adminAPI.getDashboardAnalytics('week');

// User Profile (6 endpoints)
import { userAPI } from '@/services/apiClient';
const profile = await userAPI.getProfile();
await userAPI.getSavedPlaces();
await userAPI.addSavedPlace({ label: 'Home', latitude, longitude });

// ═══════════════════════════════════════════════════════════════════
// SOCKET.IO REAL-TIME EVENTS
// ═══════════════════════════════════════════════════════════════════

import { initializeSocket, registerPassengerListeners } from '@/services/socketClient';

const socket = initializeSocket(authToken);

registerPassengerListeners({
  onDriverLocation: (data) => {
    // { booking_id, latitude, longitude, heading }
    console.log('Driver at:', data.latitude, data.longitude);
  },
  
  onRideStatusChanged: (data) => {
    // { booking_id, status, driver, eta_minutes }
    console.log('Ride is now:', data.status);
  },
  
  onNotification: (data) => {
    // { type, title, body, booking_id }
    console.log('Notification:', data.title);
  },
  
  onSupportTicketMessage: (data) => {
    // { ticket_id, author, message, timestamp }
    console.log('Support reply:', data.message);
  },
  
  onLostItemReported: (data) => {
    // { item_id, name, category, booking_id }
    console.log('Lost item:', data.name);
  },
  
  onPoolCreated: (data) => {
    // { pool_id, initiator, passengers_count, pickup, dropoff }
    console.log('Pool created:', data.pool_id);
  },
  
  onAccessibilityNotification: (data) => {
    // { booking_id, requirements, driver_id }
    console.log('Accessibility info:', data);
  },
  
  onPaymentSucceeded: (data) => {
    // { booking_id, amount, payment_id }
    console.log('Payment succeeded:', data.amount);
  },
});

// ═══════════════════════════════════════════════════════════════════
// ERROR HANDLING
// ═══════════════════════════════════════════════════════════════════

try {
  await bookingAPI.createBooking(data);
} catch (error) {
  if (error.response?.status === 401) {
    // Unauthorized - token expired, redirect to login
    window.location.href = '/login';
  } else if (error.response?.status === 400) {
    // Validation error
    console.error('Validation:', error.response.data.detail);
  } else if (error.response?.status === 404) {
    // Not found
    Alert.alert('Not found');
  } else if (error.response?.status >= 500) {
    // Server error
    Alert.alert('Server error - try again later');
  } else {
    // Network error
    Alert.alert('Network error');
  }
}

// ═══════════════════════════════════════════════════════════════════
// AUTHENTICATION
// ═══════════════════════════════════════════════════════════════════

// 1. Login → get JWT token
const token = 'eyJhbGciOiJIUzI1NiIs...';

// 2. Store token
localStorage.setItem('authToken', token);

// 3. All requests automatically include: Authorization: Bearer {token}

// 4. On 401 response → auto logout + redirect to login

export const API_REFERENCE = 'See comments for all 82+ endpoint examples';
