# AutoBuddy User Manual

This manual explains how to use AutoBuddy as a **Passenger**, **Driver**, or (for internal use) **Admin**.

> Screens and labels may vary depending on your app build and server configuration.

## 1) Before you start
- Ensure you have access to the app with the correct environment.
- Enable location permission if you want pickup/search to work reliably.
- If you experience payment/OTP issues, use the troubleshooting section near the end.

## 2) Sign up / Log in
### 2.1 Passenger or Driver account
You can typically create an account using one of these supported flows:
- **Phone OTP** (send OTP → verify OTP)
- **Email OTP** (send OTP → verify OTP) (if enabled)
- **Google login** (OAuth token; or a fallback dev mode may accept name/email inputs)

### 2.2 Log out
Log out behavior depends on client implementation. If your session expires, log in again using your credentials.

## 3) Passenger manual
### 3.1 Find nearby drivers
Use the “Find Nearby Drivers” / nearby search screen:
1. Provide your pickup location (usually via address search or current location).
2. (Optional) Provide a drop location to improve estimates.
3. Review available drivers (distance/vehicle/rating may be shown).

### 3.2 Estimate fare
To estimate before booking:
1. Enter pickup and drop.
2. Tap **Estimate Fare**.
3. Review total fare and breakdown (base fare, distance component, surge/time multiplier, minimum fare).

### 3.3 Create a booking
1. Select pickup and drop locations.
2. Choose payment method:
   - Cash
   - Online (UPI/Stripe if enabled)
3. Choose schedule:
   - **Immediate ride** or **scheduled** ride.
4. Choose a driver (optional) or let auto-matching select candidates.
5. Submit booking.

### 3.4 Booking status lifecycle
Your booking typically changes through statuses like:
- Pending → Accepted → Driver Arrived → In Progress → Completed (or Cancelled)

### 3.5 Driver arrives: start OTP
When the driver arrives:
- The app notifies you with a **ride start OTP**.
- Share the OTP with the driver so the trip can begin.

### 3.6 Start trip: in-app chat + call room
During active communication windows (as enabled by backend):
- Use **in-app chat** to send messages to the driver.
- For calls, the app can provide a **call room** link for ride communication.

### 3.7 In progress: completion OTP
When you reach your destination:
- You will receive a **ride end OTP**.
- Share the completion OTP with the driver to end the ride.

### 3.8 Cancel a booking
You may cancel certain bookings while they are still pending/allowed by rules.
- Cancellation may release the driver back to availability.

### 3.9 Pay for the ride
If the ride uses online payment:
1. Create a payment order for your booking.
2. Complete payment via your configured provider (UPI intent / Stripe if enabled).
3. Verify payment in the app (status changes to paid).

If paying by cash:
- Payment verification may not be required.

### 3.10 Rate your ride
After completion, rate the ride:
- Ratings are only available for **completed** bookings.
- You may optionally add a comment.

## 4) Driver manual
### 4.1 Sign up / Log in
Drivers create accounts similarly to passengers via OTP or login flows.

### 4.2 Complete KYC (if required)
If driver verification is enabled in your deployment:
1. Open the **Driver KYC** screen.
2. Submit required identity and document images/URLs and numbers.
3. Wait for admin review.

You may not receive ride requests until KYC is approved.

### 4.3 Update your profile & vehicle info
Update vehicle/profile information in the driver profile screen:
- Vehicle number/model/color

### 4.4 Set availability
To receive requests:
- Toggle **availability** ON.
When you accept a ride, the backend marks you **unavailable** until the ride completes or is cancelled.

### 4.5 Update live location
While you are available or during an active ride, update your location:
- The app periodically sends your latitude/longitude to keep tracking accurate.

### 4.6 Accept bookings
When you receive pending booking requests:
1. Review pickup and ride details.
2. Tap **Accept**.
3. After acceptance, you will be notified of status changes.

### 4.7 Fare multiplier
Depending on configuration:
- You can adjust your **fare multiplier** (within allowed constraints).
- Admin-approved custom fare calculator settings may also affect pricing.

### 4.8 Ride start OTP
When status becomes **Driver Arrived**:
- Receive the **ride start OTP** prompt.
- Request/share the OTP as per the in-app flow.

### 4.9 Ride completion OTP
When status becomes **In Progress** and you reach destination:
- Use the completion OTP verification step.
- Your app may offer an option to complete without OTP (only if allowed by policy/config) along with a reason.

### 4.10 Earnings
Check earnings and ride summaries:
- Total earnings
- Today’s earnings
- Total rides / today rides

### 4.11 SOS alerts & emergency handling
If you receive an SOS event or need emergency help:
- Use SOS controls in the app when available.
- SOS alerts include location coordinates and a severity/message.

### 4.12 Block lists
Drivers can block passengers:
- Block/unblock passengers from your settings.
- Blocked passengers are excluded from future matching.

## 5) Admin manual (operational overview)
> Admin endpoints are not meant for end-users.

Admins can typically:
- Review driver KYC submissions
- Configure pricing rules and registration fees
- Approve/reject driver KYC
- Monitor operational dashboards (counts of users/bookings)
- Manage subscription configs/activation and dues

## 6) Troubleshooting
### 6.1 OTP problems
- OTP expired: request a new OTP.
- OTP mismatch: verify you typed the OTP correctly.

### 6.2 “Selected driver is unavailable”
- Re-check driver live availability.
- Try accepting/booking as immediate instead of scheduled (if allowed).

### 6.3 Payment not confirmed
- Confirm that your provider completed successfully.
- Re-verify payment in the app.
- If online payment falls back, try cash payment if supported.

### 6.4 Booking stuck in Pending/Accepted
- Refresh app data and check booking status.
- If cancellation is allowed, cancel and re-create the booking once.

### 6.5 Real-time location not updating
- Confirm location permission and GPS is enabled.
- Ensure the app is allowed to run in background if required.

### 6.6 Call room issues
- Verify you are using the provided call room link.
- Avoid sharing the link publicly.

## 7) Safety notes
- Always share accurate pickup details.
- Do not share your OTPs with anyone except the intended party during the ride flow.
- In emergencies, use local emergency services.


