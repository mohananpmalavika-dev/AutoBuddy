/**
 * FRONTEND INTEGRATION GUIDE
 * 
 * This document outlines how to integrate all 82+ new backend endpoints
 * into the React Native frontend.
 * 
 * ===========================================================================
 * STEP 1: API CLIENT SETUP
 * ===========================================================================
 * 
 * Location: src/services/apiClient.ts (CREATED)
 * - Centralized axios instance with automatic Bearer token injection
 * - All 82+ endpoints organized into logical API object groups
 * - Response/error handling with automatic redirects on 401
 * 
 * Usage Example:
 * ```
 * import { bookingAPI, driverAPI, notificationAPI } from '@/services/apiClient';
 * 
 * // Create booking
 * const booking = await bookingAPI.createBooking(bookingData);
 * 
 * // Get available drivers
 * const drivers = await driverAPI.getNearbyDrivers(lat, lon, radiusKm);
 * 
 * // List notifications
 * const notif = await notificationAPI.listNotifications(filters, skip, limit);
 * ```
 * 
 * ===========================================================================
 * STEP 2: SOCKET.IO SETUP
 * ===========================================================================
 * 
 * Location: src/services/socketClient.ts (CREATED)
 * - Real-time event handlers for driver location, ride status, notifications
 * - Room-based event routing (user_{id}, driver_{id}, admin, ticket_{id})
 * - Automatic reconnection with exponential backoff
 * 
 * Usage Example:
 * ```
 * import { initializeSocket, registerPassengerListeners } from '@/services/socketClient';
 * 
 * useEffect(() => {
 *   const socket = initializeSocket(authToken);
 *   
 *   registerPassengerListeners({
 *     onDriverLocation: (data) => updateMapLocation(data),
 *     onRideStatusChanged: (data) => updateRideStatus(data),
 *     onNotification: (data) => addNotificationToContext(data),
 *   });
 *   
 *   return () => socket.disconnect();
 * }, [authToken]);
 * ```
 * 
 * ===========================================================================
 * STEP 3: CUSTOM HOOKS FOR INTEGRATION
 * ===========================================================================
 * 
 * Location: src/hooks/useBackendIntegration.ts (CREATED)
 * - Hooks that combine API calls with Context state management
 * - Automatic Socket.IO listener registration
 * - Error handling and loading states
 * 
 * Available Hooks:
 * - useNotifications(context, userId) - Fetch + Socket integration
 * - useSupportTickets(context) - Support ticket operations
 * - useScheduledRides(context) - Scheduled ride management
 * - usePromoCode(context) - Promo code validation
 * - useAccessibility(userId) - Accessibility features
 * 
 * Usage Example:
 * ```
 * import { useNotifications } from '@/hooks/useBackendIntegration';
 * 
 * function MyComponent() {
 *   const notifContext = useNotifications();
 *   const { markAsRead, deleteNotification } = useNotifications(notifContext, userId);
 *   
 *   return (
 *     <FlatList
 *       data={notifContext.notifications}
 *       renderItem={({ item }) => (
 *         <TouchableOpacity onPress={() => markAsRead(item.id)}>
 *           <Text>{item.title}</Text>
 *         </TouchableOpacity>
 *       )}
 *     />
 *   );
 * }
 * ```
 * 
 * ===========================================================================
 * STEP 4: INTEGRATION PATTERNS BY FEATURE
 * ===========================================================================
 * 
 * A. BOOKING FLOW INTEGRATION
 * ──────────────────────────
 * 
 * File: src/screens/BookingDetailsScreen.js
 * 
 * Current API call:
 *   await apiRequest('/api/bookings/create', { method: 'POST', body: bookingData })
 * 
 * Updated to use new service:
 *   import { bookingAPI } from '@/services/apiClient';
 *   const booking = await bookingAPI.createBooking(bookingData);
 *   const drivers = await bookingAPI.requestDrivers(booking.booking_id);
 * 
 * Additional integrations needed:
 *   - POST /api/dispatch/{booking_id}/match-drivers → Display candidate drivers
 *   - POST /api/dispatch/{booking_id}/auto-assign → Auto-assign best driver
 *   - GET /api/rides/{booking_id}/status → Real-time status updates via Socket.IO
 * 
 * 
 * B. REAL-TIME LOCATION TRACKING
 * ──────────────────────────────
 * 
 * File: src/screens/DriverDashboard.js (or similar)
 * 
 * Pattern:
 *   1. Driver starts ride → POST /api/rides/{booking_id}/start-ride
 *   2. On every location update → POST /api/rides/{booking_id}/update-ride-location
 *   3. Passenger receives updates via Socket.IO event: 'driver_location_updated'
 *   4. Driver ends ride → POST /api/rides/{booking_id}/complete-ride
 *   5. Receipt generated automatically from backend
 * 
 * Code Example:
 *   ```
 *   const socket = getSocket();
 *   socket.on('driver_location_updated', (location) => {
 *     mapRef.current.setCenter({
 *       latitude: location.latitude,
 *       longitude: location.longitude,
 *     });
 *   });
 *   ```
 * 
 * 
 * C. NOTIFICATIONS INTEGRATION
 * ──────────────────────────
 * 
 * File: src/screens/NotificationCenter.js (if exists)
 * 
 * Pattern:
 *   1. On app start → notificationAPI.listNotifications()
 *   2. Listen to Socket.IO 'notification' event for real-time updates
 *   3. User clicks notification → markAsRead() + update context
 *   4. Socket.IO room: user_{userId} for targeted notifications
 * 
 * Code Example:
 *   ```
 *   import { useNotifications } from '@/hooks/useBackendIntegration';
 *   
 *   const NotificationCenter = () => {
 *     const notifCtx = useContext(NotificationContext);
 *     const { markAsRead, deleteNotification } = useNotifications(notifCtx, userId);
 *     
 *     return (
 *       <FlatList
 *         data={notifCtx.notifications}
 *         renderItem={({ item }) => (
 *           <TouchableOpacity 
 *             onPress={() => markAsRead(item.id)}
 *             style={{ opacity: item.read ? 0.5 : 1 }}
 *           >
 *             <Text>{item.title}</Text>
 *             <Text>{item.body}</Text>
 *           </TouchableOpacity>
 *         )}
 *       />
 *     );
 *   };
 *   ```
 * 
 * 
 * D. SUPPORT TICKETS INTEGRATION
 * ──────────────────────────────
 * 
 * File: src/screens/SupportPanel.js (if exists)
 * 
 * Pattern:
 *   1. Create ticket → supportAPI.createTicket({ issue, description, category })
 *   2. Get ticket list → supportAPI.listTickets(filters, skip, limit)
 *   3. Add message → supportAPI.addMessage(ticketId, message)
 *   4. Real-time updates via Socket.IO 'support_ticket_message' event
 *   5. Close ticket → supportAPI.updateTicketStatus(ticketId, 'closed')
 * 
 * Code Example:
 *   ```
 *   const [ticketId, setTicketId] = useState(null);
 *   
 *   const handleCreateTicket = async () => {
 *     const ticket = await supportAPI.createTicket({
 *       subject: 'Driver was rude',
 *       description: 'Long description here',
 *       category: 'safety',
 *     });
 *     setTicketId(ticket._id);
 *   };
 *   
 *   const handleAddMessage = async (message) => {
 *     await supportAPI.addMessage(ticketId, message);
 *   };
 *   ```
 * 
 * 
 * E. PROMO CODE INTEGRATION
 * ────────────────────────
 * 
 * File: src/screens/BookingDetailsScreen.js
 * 
 * Pattern:
 *   1. User enters promo code in booking form
 *   2. On validation → promoAPI.validateCode(code, fare)
 *   3. Show discount amount and final fare
 *   4. Include promo_code in booking creation
 * 
 * Code Example:
 *   ```
 *   const handleValidatePromo = async () => {
 *     try {
 *       const result = await promoAPI.validateCode(promoCode, estimatedFare);
 *       setPromoDiscount(result.discount_amount);
 *       setFinalFare(result.final_fare);
 *     } catch (error) {
 *       Alert.alert('Invalid Promo Code');
 *     }
 *   };
 *   ```
 * 
 * 
 * F. ACCESSIBILITY INTEGRATION
 * ───────────────────────────
 * 
 * File: src/screens/PreferencesScreen.js (or settings)
 * 
 * Pattern:
 *   1. Get requirements → accessibilityAPI.getRequirements(userId)
 *   2. Update requirements → accessibilityAPI.updateRequirements(userId, reqs)
 *   3. Get text size → accessibilityAPI.getTextSizeSettings()
 *   4. Update text size → accessibilityAPI.updateTextSizeSettings(settings)
 * 
 * Code Example:
 *   ```
 *   const { requirements, updateRequirements } = useAccessibility(userId);
 *   
 *   <Switch
 *     value={requirements?.wheelchair}
 *     onValueChange={(val) => updateRequirements({ ...requirements, wheelchair: val })}
 *   />
 *   ```
 * 
 * 
 * G. SCHEDULED RIDES INTEGRATION
 * ──────────────────────────────
 * 
 * File: src/screens/ScheduledRidesPanel.tsx (if exists)
 * 
 * Pattern:
 *   1. Create scheduled ride → scheduledRidesAPI.createScheduledRide(rideData)
 *   2. List upcoming rides → scheduledRidesAPI.listScheduledRides()
 *   3. Update/reschedule → scheduledRidesAPI.updateScheduledRide(rideId, updates)
 *   4. Cancel → scheduledRidesAPI.cancelScheduledRide(rideId)
 *   5. Auto-confirm when time comes (backend handles)
 * 
 * 
 * ===========================================================================
 * STEP 5: MISSING SCREENS TO CREATE/UPDATE
 * ===========================================================================
 * 
 * 1. NotificationCenter.tsx - Display all notifications with filters
 * 2. SupportPanel.tsx - Create tickets, view messages, close tickets
 * 3. ScheduledRidesPanel.tsx - View/manage scheduled rides
 * 4. LiveRideTracking.tsx - Real-time driver location map
 * 5. LostItemsPanel.tsx - Report lost items
 * 6. RidePoolingPanel.tsx - Join/create pool rides
 * 7. AccessibilitySettings.tsx - Configure accessibility features
 * 8. DriverAvailabilityToggle.tsx - Online/offline status
 * 9. AdminAnalyticsDashboard.tsx - Already created, needs data binding
 * 10. AdminUserManagement.tsx - Already created, needs data binding
 * 
 * 
 * ===========================================================================
 * STEP 6: AUTHENTICATION & TOKEN STORAGE
 * ===========================================================================
 * 
 * All API calls require Bearer token in header.
 * Pattern:
 *   1. Login → receive JWT token
 *   2. Store in localStorage/secure storage: localStorage.setItem('authToken', token)
 *   3. axios interceptor automatically includes in all requests
 *   4. If 401 → auto logout and redirect to login
 * 
 * 
 * ===========================================================================
 * STEP 7: ERROR HANDLING & OFFLINE SUPPORT
 * ===========================================================================
 * 
 * Recommendation: Add Redux Persist or MobX for offline queue
 * - Queue failed API calls
 * - Retry when connection restored
 * - Show "offline mode" indicator
 * 
 * 
 * ===========================================================================
 * CHECKLIST
 * ===========================================================================
 * 
 * ☐ Copy apiClient.ts to src/services/
 * ☐ Copy socketClient.ts to src/services/
 * ☐ Copy useBackendIntegration.ts to src/hooks/
 * ☐ Update BookingDetailsScreen.js to use bookingAPI
 * ☐ Create NotificationCenter.tsx
 * ☐ Create SupportPanel.tsx
 * ☐ Create ScheduledRidesPanel.tsx
 * ☐ Create LiveRideTracking.tsx
 * ☐ Initialize Socket.IO on app startup
 * ☐ Test all API endpoints with real backend
 * ☐ Implement offline queue/caching
 * ☐ Add loading skeletons
 * ☐ Add error boundaries
 * ☐ Implement analytics tracking
 * ☐ Test on real devices (Android + iOS)
 * 
 */

export const FRONTEND_INTEGRATION_GUIDE = 'See comments in this file';
