# Passenger Login Feature Inventory

Code baseline: `6b0570a06c8e28ec57ac48bae122ebfbf46f6612`

This document lists the passenger experience that exists after a passenger logs in. It is based on the current code, not on a redesign mockup.

## Main Passenger Entry Points

- Web Expo Router `/app` uses `src/app/index.tsx`.
- After authentication, role `passenger` is rendered through `PassengerMap` from `src/screens/index.ts`.
- `PassengerMap.ts` chooses platform implementation:
  - Web: `src/screens/PassengerMap.web.js`
  - Native: `src/screens/PassengerMap.native.js`
- Older stack app `src/App.tsx` uses:
  - `PassengerOnboarding` for new passengers.
  - `PassengerDashboard` after onboarding.
  - `TravelIntentDashboard` as a separate route.

## Login, Session, Setup

- Auth screen opens when no valid session exists.
- Session is loaded from persistent storage and revalidated with `/auth/me`.
- Authenticated passenger session stores token and user details.
- Passenger role is gated through subscription-plan selection if required.
- Web setup supports:
  - PWA manifest injection.
  - Service worker registration.
  - Install app prompt.
  - Browser notification permission.
  - Web update polling and reload when a new web bundle is detected.
  - Web notification polling from `/users/notifications`.
  - Browser notification display and speech synthesis for visible-page alerts.
- Home button resets the current passenger screen by changing the screen key.

## Passenger Onboarding

Source: `src/components/PassengerSimplifiedOnboarding.tsx`

- Four-step passenger onboarding.
- Phone input.
- OTP send and verify state.
- Name and email capture.
- Default payment selection:
  - Wallet
  - UPI
  - Card
  - Cash
- Skip option.
- Completion posts onboarding data to `/api/passengers/onboarding/complete` in `src/App.tsx`.

## Main Passenger Map Dashboard

Source: `src/screens/PassengerMap.web.js`, `src/screens/PassengerMap.native.js`

### Core Dashboard State

- Pickup query and drop query.
- Pickup and drop suggestions.
- Pickup and drop selected locations.
- Web geolocation permission state.
- Active booking.
- Booking history with pagination.
- Fare estimate.
- Nearby drivers.
- Favorite driver IDs.
- Blocked driver IDs.
- Selected driver ID.
- Fare expectation filter.
- Driver opt-out list.
- Scheduled pickup details.
- Payment method and payment channel.
- Passenger preferences and accessibility settings.
- Applied promo code.
- Ride product availability by pickup district.
- Spin and win status.
- Passenger menu state.
- Interactive map visibility.
- Rating modal state after completed ride.

### Passenger Menu Features

The menu registry includes these passenger sections:

- Ride Booking
- Pool Ride
- Live Ride
- Family Booking
- Corporate Booking
- Travel Packages
- Scheduled Rides
- Drivers
- Favorite Drivers
- Safety
- Wallet
- Spin and Win
- Notifications
- Promo Codes
- Support
- Payment
- Ratings
- Preferences
- Saved Places
- Emergency
- Accessibility
- Ride History
- Profile
- KYC Verification
- Documents
- Receipts
- Subscription
- Ride Notes
- Location Sharing
- Ride Stats

Pinned quick menu items:

- Drivers
- Favorite Drivers

Secondary menu groups:

- Booking Modes: family, pooling, corporate, travel, scheduled rides.
- Trip: pooling, scheduled, history, stats, notes, ratings, receipts.
- Deals and Payment: wallet, spin, promo, payment, subscription.
- Account: profile, KYC, documents, preferences, places, accessibility, sharing.
- Help: notifications, support, emergency.

## Location and Map Features

Sources: `PassengerMap.web.js`, `PassengerMap.native.js`

- Current location can be requested for pickup.
- Web geolocation permission is tracked as prompt, granted, denied, or unsupported.
- Pickup and drop can be selected by:
  - Search input.
  - Saved places.
  - Map taps.
  - Current location.
- Reverse geocoding resolves map coordinates into readable addresses.
- Search suggestions are loaded for pickup and drop.
- Selecting pickup automatically moves the next selection target to drop.
- Selecting drop returns selection target to pickup.
- Pickup and drop can be cleared.
- Interactive map displays:
  - Pickup marker.
  - Drop marker.
  - Driver live marker when available.
  - Route/ETA visualization through web/native map components.
- Location validation blocks booking when pickup or drop is missing.

## Fare Calculation

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Fare refresh starts when pickup and drop are both selected.
- Fare endpoint: `POST /fare/estimate`.
- Fare request includes:
  - `pickup_location`
  - `drop_location`
  - `vehicle_type_id`
  - `vehicle_subtype_id`
  - `ride_type`
- Fare UI displays:
  - Total fare.
  - Distance in km.
  - Surge multiplier.
  - Pickup surcharge when present.
- If fare response does not include distance, direct distance is calculated from pickup/drop coordinates.
- Fare estimate is used by:
  - Driver projected fare.
  - Promo-code validation.
  - Booking payload distance fallback.

## Driver Discovery and Selection

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Nearby driver endpoint: `GET /drivers/nearby`.
- Nearby driver query includes:
  - Pickup latitude/longitude.
  - Drop latitude/longitude when selected.
  - `radius_km: 2`
  - `vehicle_type_id`
  - `vehicle_subtype_id`
  - `ride_type`
- Favorite driver endpoint: `GET /passengers/favorite-drivers`.
- Blocked driver endpoint: `GET /passengers/blocked-drivers`.
- Driver discovery merges:
  - Nearby drivers.
  - Favorite drivers.
  - Blocked driver filters.
- Driver list displays:
  - Driver name.
  - Distance from pickup.
  - Rating.
  - Projected fare.
  - Extra pickup charge.
  - Favorite fallback label when favorite is outside nearby radius.
- Passenger can:
  - Select a driver for booking.
  - Mark/unmark favorite driver.
  - Block/unblock driver.
  - Opt out a driver for the current search.
  - Reset opt-outs.
  - Set max fare expectation and filter visible drivers.
- Favorite/blocked updates refresh driver discovery.

## Favorite Driver Features

Sources: `PassengerMap.web.js`, `FavoriteDriversPanel.js`

- Favorite drivers are loaded from `/passengers/favorite-drivers`.
- Driver can be marked favorite with `PUT /passengers/favorite-drivers/{driverId}` and `is_favorite`.
- Driver can be removed from favorites from the Favorite Drivers panel.
- Favorite drivers can be shown as fallback even when outside nearby radius.
- Favorite status is also shown in ride history.
- Blocked drivers cannot be favorited until unblocked.

## Blocked Driver Features

Source: `PassengerMap.web.js`

- Blocked drivers are loaded from `/passengers/blocked-drivers`.
- Driver can be blocked/unblocked with `PUT /passengers/blocked-drivers/{driverId}` and `is_blocked`.
- Blocking a driver removes them from favorites.
- Blocked driver IDs are shown with an unblock action.
- Blocked drivers are filtered from visible driver results.

## Ride Product and Vehicle Selection

Sources: `PassengerMap.web.js`, `RideProductsGrid`, `useVehicleTypes`

- Vehicle type is selected from backend vehicle types.
- Vehicle subtype/model can be selected.
- Ride product is selected from ride-product availability.
- Ride product availability endpoint: `/ride-products/availability`.
- Ride product availability depends on pickup district.
- Vehicle/model/ride-product changes force fare and driver discovery refresh.
- Ride product labels include:
  - Normal / instant style ride.
  - Women Only.
  - School/Elderly.
  - Corporate.
  - Airport.
  - Intercity.
  - Tourism.
  - Rental/hourly.
  - Scheduled.

## Booking Creation

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Main booking endpoint: `POST /bookings/advanced`.
- Booking is blocked if pickup or drop is missing.
- Existing active booking is checked through `/bookings/active`.
- If an active booking exists, passenger can confirm whether to create another parallel booking.
- Booking payload includes:
  - Pickup location.
  - Drop location with distance.
  - Payment method.
  - Payment method ID.
  - Payment channel.
  - Promo details.
  - Ride product.
  - Passenger count.
  - Parallel booking flag.
  - Selected driver ID.
  - Scheduled time.
  - Vehicle type and subtype.
  - Vehicle model.
  - Notes.
- After booking:
  - Active booking state is updated.
  - Booking confirmation card appears.
  - Passenger history is refreshed.

## Women-Only Ride Features

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Ride product: `women_only`.
- Booking sets:
  - `women_only_required: true`
  - `passenger_gender: female`
  - `driver_gender_preference: female`
  - `women_only_female_driver_required`
  - `women_only_allow_trusted_male_driver`
  - `women_only_guardian_name`
  - `women_only_guardian_phone`
  - `women_only_share_guardian_tracking`
- UI fields support:
  - Female driver required.
  - Trusted fallback option.
  - Guardian name.
  - Guardian phone.
  - Guardian tracking share.
- Ride notes include women-only safety preference details.

## School/Elderly Assisted Ride Features

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Ride product: `school_elderly_safe`.
- Supported priorities:
  - School.
  - Elderly.
- Required fields:
  - Assisted passenger name.
  - Assisted passenger age.
  - Guardian name.
  - Guardian phone.
- Validation:
  - Age must be 1 to 120.
  - School assisted ride requires age 18 or below.
  - Elderly assisted ride requires age 55 or above.
- Optional assisted-ride flags:
  - Wheelchair required.
  - Door-to-door assistance required.
  - Female driver preferred.
  - Trusted driver required.
  - Guardian live tracking enabled.
  - Care notes.
- Booking payload includes:
  - `safe_ride_priority`
  - `guardian_name`
  - `guardian_phone`
  - `assisted_passenger_name`
  - `assisted_passenger_age`
  - `wheelchair_required`
  - `assistance_required`
  - `female_driver_preferred`
  - `trusted_driver_required`
  - `guardian_share_tracking`
- Ride notes include assisted passenger, guardian, wheelchair, assistance, driver, and care-note details.

## Scheduled Ride Features

Sources: `PassengerMap.web.js`, `PassengerScheduledRidesPanel`, `ScheduledPickupPicker`

- Scheduled ride product validates scheduled pickup date/time.
- Scheduled pickup supports local timezone handling.
- Scheduled driver gender preference can be selected:
  - Any
  - Female
  - Male
- Booking payload includes `scheduled_for`.
- Scheduled rides can be viewed from the Scheduled menu.
- Existing scheduled rides can be cancelled from the scheduled rides panel.
- Older dashboard hook also supports `/passengers/me/scheduled-rides`, `/passengers/rides/schedule`, and `/passengers/scheduled-rides/{rideId}/cancel`.

## Pool Ride Features

Sources: `PassengerMap.web.js`, `RidePoolingPanel`, `RidePoolingScreen`

- Pool Ride menu opens passenger pooling panel.
- Pool defaults use current pickup/drop addresses.
- Pool panel receives:
  - Passenger user ID.
  - Current location.
  - Create defaults.
  - Initial pickup/drop values.
- Pool screens support available pools, joining pools, split fare display, capacity, members, and route info.

## Corporate Ride Features

Source: `PassengerMap.web.js`

- Ride product can send corporate details in the advanced booking payload:
  - `corporate_code`
  - `corporate_purpose`
  - `corporate_cost_center_id`
- Corporate code is required for corporate ride product.
- Corporate menu action is mounted for users and opens the existing corporate ride flow with company code, purpose, and cost center fields.

## Airport Ride Features

Source: `PassengerMap.web.js`

- Ride product can send:
  - `airport_terminal`
  - `flight_number`
- Airport terminal and flight number are required for airport ride product.

## Intercity Ride Features

Source: `PassengerMap.web.js`

- Intercity options include:
  - Return trip.
  - Wait hours.
  - Tolls included toggle.
  - Route notes.
- Booking payload includes:
  - `intercity_return_trip`
  - `intercity_wait_hours`
  - `intercity_tolls_included`
  - `intercity_route_notes`
- Ride notes include one-way/return, wait hours, toll/parking handling, and route notes.

## Tourism Ride Features

Source: `PassengerMap.web.js`

- Tourism options include:
  - Package name.
  - Package ID.
  - Package type.
  - City.
  - Custom stops.
  - Language preference.
  - Guide required.
  - Photographer required.
  - Boat ride required.
  - Hotel booking requested.
  - Ticket booking requested.
- Tourism fare preview uses package price, vehicle multiplier, and add-ons.
- Booking payload sends tourism package and add-on fields.

## Rental Ride Features

Source: `PassengerMap.web.js`

- Rental/hourly ride supports rental hours.
- Rental hours are clamped between 1 and 12.
- Booking payload sends `rental_hours`.

## Promo Code Features

Source: `PassengerMap.web.js`, `PromoCodePanel`

- Promo panel receives current fare.
- Promo can be applied before booking.
- Booking payload can send:
  - `promo_code`
  - `promo_discount_type`
  - `promo_discount_value`
  - `promo_max_discount`
- Promo note is added to ride notes.
- Promo panel is disabled until fare is available.

## Payment Features

Sources: `PassengerMap.web.js`, `PaymentMethodsPanel`, `usePassengerBooking.ts`

- Passenger can select payment method.
- Payment method state includes:
  - Cash.
  - Payment method ID.
  - Payment channel.
- Booking payload sends payment details.
- Payment Methods panel can change default method.
- Older hook endpoints:
  - `GET /passengers/me/payment-methods`
  - `PUT /passengers/me/payment-methods/{methodId}/set-default`

## Wallet and Subscription Features

Source: `PassengerMap.web.js`

- Wallet menu opens wallet/payment surface.
- Subscription menu opens `SubscriptionPanel`.
- Plan gate can require passenger plan selection through `/subscriptions/config`, `/subscriptions/me`, and `/subscriptions/select`.

## Live Ride Tracking

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Active booking endpoint: `/bookings/active`.
- Live tracking statuses:
  - accepted
  - driver_arrived
  - in_progress
- Closed booking statuses:
  - completed
  - cancelled
  - rejected
  - no_driver_found
  - booking_failed
- Live ride screen displays:
  - Booking ID.
  - Status.
  - Driver name.
  - Pickup.
  - Drop.
  - Fare.
  - Pickup surcharge.
  - Driver live location.
  - ETA to pickup.
  - ETA to dropoff.
  - Driver network status.
  - Ride progress timeline.
  - Map visualization.
  - Start OTP when driver has arrived.
  - Completion OTP during trip.
  - Copy OTP action on web.
  - Driver/passenger communication card.

## Ride Cancellation

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- Cancellation is allowed for:
  - pending
  - scheduled
  - driver_arrived
- Cancellation is disabled after accepted/in-progress except the driver-arrived policy case.
- Driver-arrived cancellation warns that minimum fare may be payable.
- Cancel endpoint: `PUT /bookings/{bookingId}/cancel`.
- Cancel payload includes:
  - Reason code.
  - Reason text.
  - Policy acknowledged.
  - Policy version.
  - Passenger context.

## Ride History

Source: `PassengerMap.web.js`, `PassengerMap.native.js`

- History endpoint: `/bookings` with pagination.
- Initial query uses `limit` and `skip`.
- Load more fetches next page.
- History card displays:
  - Status.
  - Short booking ID.
  - Driver name.
  - Fare.
  - Pickup to drop route.
  - Favorite/unfavorite driver action.
  - Block/unblock driver action.

## Ratings

Sources: `PassengerMap.web.js`, `PassengerRatingsPanel`, `PostRideRatingModal`

- Ratings menu opens `PassengerRatingsPanel`.
- Post-ride rating modal can show after completed booking.
- Rating submit closes modal and thanks passenger.

## Notifications

Sources: `PassengerMap.web.js`, `NotificationCenter`, `NotificationBell`

- Notification center can open from passenger menu.
- Notification bell appears in the passenger header.
- Notifications can deep-link back to booking context when a booking ID is present.
- Web app additionally polls `/users/notifications` and can show browser alerts.

## Safety and Emergency

Sources: `PassengerMap.web.js`, `KeralaSafetyCard`, `EmergencyContactsPanel`, `PassengerSafetyScreen.tsx`

- Safety menu opens Kerala safety card.
- Emergency menu opens emergency contacts panel.
- Live ride screen has SOS quick access:
  - Confirm SOS.
  - Long-press immediate SOS.
  - Open emergency contacts.
- Passenger safety screen supports:
  - Safety tips.
  - Emergency contacts.
  - SOS trigger.
  - Incident report.
  - Trip sharing.

## Preferences and Accessibility

Sources: `PassengerMap.web.js`, `PreferencesPanel`, `AccessibilityPanel`

- Preferences loaded from `/v1/passengers/preferences`.
- Accessibility settings loaded from `/v1/passengers/accessibility`.
- Passenger preferences can change default driver gender preference.
- Accessibility settings can be updated and reflected in the passenger map.
- Accessibility quick access is present in web map.
- Voice/a11y feedback is triggered for several actions.

## Saved Places

Sources: `PassengerMap.web.js`, `SavedPlacesPanel`, `SavedPlacesQuickSelect`

- Saved Places menu opens saved places panel.
- Saved places can be used as pickup/drop selection.
- If pickup exists, selecting a saved place sets dropoff; otherwise it sets pickup.
- Place search/reverse lookup uses `src/lib/places`.

## Profile, KYC, Documents

Source: `PassengerMap.web.js`

- Profile menu opens `PassengerProfilePanel`.
- KYC menu opens `PassengerKYCPanel`.
- Documents menu opens:
  - `PassengerDocumentUpload`
  - `PassengerDocumentsPanel`
- Native booking checks document eligibility with `/passenger/documents/can-book-ride`.

## Receipts, Notes, Sharing, Stats

Source: `PassengerMap.web.js`

- Receipts menu opens `ReceiptsPanel`.
- Ride Notes menu opens `RideNotesPanel` for active booking.
- Location Sharing menu opens `LocationSharingPanel`.
- Ride Stats menu opens `RideStatsPanel`.

## Support

Source: `PassengerMap.web.js`, `SupportTicketsPanel`

- Support menu opens support ticket panel.
- Support categories include ride, payment, safety, account, driver access, and other in related support code.

## Spin and Win

Source: `PassengerMap.web.js`

- Spin status endpoint: `/spin-win/config`.
- Spin action endpoint: `POST /spin-win/spin`.
- Spin state tracks:
  - Config/status.
  - Loading.
  - Spinning state.
- Spin rewards and eligibility are refreshed with passenger dashboard polling.

## Voice Booking

Sources: `PassengerDashboard.tsx`, `useVoiceBooking.ts`, `VoiceBookingOverlay`

- Voice booking is exposed in the older passenger dashboard.
- Voice languages:
  - English India
  - Hindi
  - Malayalam
- Web voice uses browser speech recognition.
- Native voice uses `@react-native-voice/voice` when available.
- Parsed voice booking uses backend endpoint `POST /bookings/voice`.
- Voice payload includes:
  - Raw utterance.
  - Destination text.
  - Pickup text.
  - Preferred vehicle hint.
  - Preferred ride product.
  - Intent type.
  - Detected language.

## Smart Intent and AI Travel Intent

Sources: `PassengerDashboard.tsx`, `SmartIntentInput.tsx`, `TravelIntentDashboard.tsx`, `useTravelIntent.ts`

- Smart Intent input parses natural language booking text.
- Intent examples endpoint: `/api/intent/examples`.
- Intent parse endpoint: `/api/intent/parse`.
- Book-from-intent endpoint: `/api/intent/book-from-intent`.
- AI travel dashboard supports:
  - Search query.
  - Trending destinations.
  - Suggested destinations.
  - Passenger count.
  - Vehicle choice: auto, cab, premium.
  - Suggestion pricing.
  - Quick book through travel intent service.
- Travel intent service endpoints include:
  - `/api/intent/recognize`
  - `/api/intent/suggest`
  - `/api/intent/trending`
  - `/api/intent/quick-book`
  - `/api/intent/pricing/estimate`
  - `/api/intent/history`
  - `/api/intent/feedback`

## Predictive Booking

Sources: `PassengerDashboard.tsx`, `PredictiveBookingCard.tsx`, `PredictiveDestinationCard.tsx`, `usePredictiveBooking`

- Predictive morning booking card.
- Predictive destination card shows top AI-predicted destinations.
- Predictive destinations refresh every 30 minutes.
- Predictive destination endpoint: `/api/ai/predict-destination`.
- One-tap booking UI supports Auto/Cab options and booking result display.

## Guided Booking Navigator

Source: `PassengerBookingNavigator.js`

- Guided flow steps:
  - Route.
  - Service.
  - Confirm.
- Uses:
  - `ServiceSelectionScreen`
  - `BookingDetailsScreen`
- Supports edit route.
- Supports booking last repeatable ride again from recent bookings.
- Normalizes previous pickup/drop locations from multiple backend field shapes.

## Previously UI-Only Areas Now Mounted

These passenger menu cards now open real passenger flows instead of placeholder messages:

- Family Booking opens the minimal booking form with passenger count and notes available.
- Corporate Booking opens the corporate ride product with corporate code, purpose, and cost center fields.
- Travel Packages opens the tourism ride product with package, city, language, and add-on fields.
- Schedule Ride opens the scheduled ride product with future pickup time and driver gender preference.
- Voice Booking is mounted in the passenger quick booking surface on web and native, with English and Malayalam selection.

Important distinction:

- Family management exists as separate screens/components elsewhere in the app.
- School/Elderly assisted rides are fully modeled inside the advanced ride product flow.
- Women-only ride is fully modeled inside the advanced ride product flow.
- Favorite driver selection is functional through Drivers/Favorites/history and booking selected driver.

## Rebuild Checklist Must Preserve

Any passenger redesign must preserve these working behaviours:

- Login/session/subscription/web setup.
- Passenger role routing to `PassengerMap`.
- Current location permission and pickup selection.
- Map tap pickup/drop selection.
- Pickup/drop search suggestions.
- Reverse geocoding.
- Fare calculation from `/fare/estimate`.
- Nearby driver discovery from `/drivers/nearby`.
- Favorite drivers and blocked drivers.
- Selected driver booking.
- Fare expectation filtering and driver opt-out.
- Vehicle type/subtype selection.
- Ride product availability by district.
- Women-only ride fields and payload.
- School/elderly assisted ride validations and payload.
- Scheduled ride date/time and driver gender preference.
- Promo codes.
- Payment method/channel.
- Active booking and parallel-booking confirmation.
- Advanced booking payload to `/bookings/advanced`.
- Live ride status, map, ETA, OTP, SOS, communication.
- Cancellation policy and cancel endpoint.
- Ride history pagination and favorite/block actions.
- Notification center and web notifications.
- Wallet/payment/subscription surfaces.
- Preferences/accessibility/saved places.
- Profile/KYC/documents/receipts/notes/sharing/stats/support.
- Spin and Win.
- Pooling panel.
- Voice booking.
- Smart intent booking.
- Predictive booking.
- Guided booking navigator and repeat-last-ride.

## Driver Options Mount Audit

Sources: `DriverDashboard.ts`, `DriverCommandPage.web.js`, `DriverCommandPage.native.js`, `DriverTabBar.js`

- Driver role routing uses the live command page:
  - Web: `DriverCommandPage.web.js`
  - Native: `DriverCommandPage.native.js`
- Every visible driver tab from `DriverTabBar` has a mounted web and native render branch:
  - Ride Flow, Upcoming, Earnings, Support, History, Alerts.
  - Profile, Documents, Vehicle, Trust, Plan.
  - Fare, Analytics, Reviews, Targets, Payout, Pay Methods.
  - Blocked, Safety, Demand Map, Traffic, Photo Check, Passenger Safety.
  - Spin, Filters, Maintenance, Actions, Settings.
  - Pooling, Tax Reports, Favorites, Shifts, Badges, My Tier, Document Alerts, Appeals, Referrals.
- Driver quick actions are mounted through `runDriverQuickAction` and route to real flow handlers or tabs:
  - Go Online.
  - Resume Active Ride.
  - Navigate Active Ride.
  - Call Passenger.
  - SOS.
  - Withdraw Earnings.
  - Contact Support.
  - Subscription, profile, documents, vehicle, alerts, analytics, reviews, history, spin, fare, blocked passengers, trust, and safety.
- Fixed driver live command-page mount gap:
  - Targets now opens `EarningTargetWidget`.
  - Payout now opens `PayoutScheduleWidget`.
  - Pay Methods now opens `DriverPaymentMethodsPanel`.
