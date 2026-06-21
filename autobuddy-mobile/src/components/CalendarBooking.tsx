/**
 * Calendar Booking Component
 * Frontend for Google Calendar integration and automatic ride booking
 */

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './CalendarBooking.css';

interface AutoBookingPreference {
  enabled: boolean;
  auto_book_threshold: number;
  preferred_ride_type: 'instant' | 'scheduled';
  advance_booking_minutes: number;
  include_return_trip: boolean;
  max_daily_auto_bookings: number;
  preferred_vehicle?: string;
  payment_method: string;
  special_requirements: string[];
}

interface CalendarEvent {
  _id: string;
  title: string;
  location: string;
  event_start_time: string;
  event_end_time: string;
  auto_booked: boolean;
  booking_status: string;
  transportation_confidence: number;
  ride_type: string;
}

interface MeetingReminder {
  _id: string;
  title: string;
  start_time: string;
  location: string;
  ride_booked: boolean;
  booking_id?: string;
  pickup_time?: string;
  driver_eta?: number;
}

const CalendarBooking: React.FC = () => {
  const API_BASE = process.env.REACT_APP_API_BASE || 'http://localhost:8000';

  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [preferences, setPreferences] = useState<AutoBookingPreference>({
    enabled: false,
    auto_book_threshold: 0.7,
    preferred_ride_type: 'instant',
    advance_booking_minutes: 30,
    include_return_trip: false,
    max_daily_auto_bookings: 5,
    payment_method: 'wallet',
    special_requirements: [],
  });

  const [bookings, setBookings] = useState<CalendarEvent[]>([]);
  const [reminders, setReminders] = useState<MeetingReminder[]>([]);
  const [stats, setStats] = useState({ total: 0, by_status: {} });
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [showPreferenceModal, setShowPreferenceModal] = useState(false);

  // Initialize on component mount
  useEffect(() => {
    checkCalendarConnection();
    fetchPreferences();
    fetchBookings();
    fetchReminders();
    fetchStats();

    // Poll for updates every 5 minutes
    const interval = setInterval(() => {
      fetchReminders();
      fetchStats();
    }, 5 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  // Check if Google Calendar is connected
  const checkCalendarConnection = async () => {
    try {
      const response = await axios.post(
        `${API_BASE}/api/calendar/check-calendar-connected`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
      );
      setConnected(response.data.connected);
    } catch (error) {
      console.error('Failed to check calendar connection:', error);
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  // Fetch user preferences
  const fetchPreferences = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/calendar/preferences`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });
      setPreferences(response.data);
    } catch (error) {
      console.error('Failed to fetch preferences:', error);
    }
  };

  // Fetch calendar bookings
  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/calendar/bookings`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });
      setBookings(response.data.bookings || []);
    } catch (error) {
      console.error('Failed to fetch bookings:', error);
    }
  };

  // Fetch upcoming meeting reminders
  const fetchReminders = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/calendar/reminders`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });
      setReminders(response.data.reminders || []);
    } catch (error) {
      console.error('Failed to fetch reminders:', error);
    }
  };

  // Fetch calendar booking statistics
  const fetchStats = async () => {
    try {
      const response = await axios.get(`${API_BASE}/api/calendar/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });
      setStats(response.data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  // Connect Google Calendar
  const handleConnectCalendar = async () => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${API_BASE}/api/calendar/oauth/authorize`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
      );

      // Redirect to Google OAuth
      window.location.href = response.data.authorization_url;
    } catch (error) {
      console.error('Failed to initiate calendar connection:', error);
      setMessage('Failed to connect Google Calendar');
    } finally {
      setLoading(false);
    }
  };

  // Disconnect Google Calendar
  const handleDisconnectCalendar = async () => {
    if (!window.confirm('Are you sure you want to disconnect Google Calendar?')) {
      return;
    }

    try {
      await axios.post(
        `${API_BASE}/api/calendar/disconnect-calendar`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
      );

      setConnected(false);
      setMessage('Google Calendar disconnected');
      setTimeout(() => setMessage(''), 3000);
    } catch (error) {
      console.error('Failed to disconnect calendar:', error);
      setMessage('Failed to disconnect Google Calendar');
    }
  };

  // Sync calendar and book rides
  const handleSyncAndBook = async () => {
    try {
      setSyncing(true);
      const response = await axios.post(
        `${API_BASE}/api/calendar/sync-and-book`,
        {},
        { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } }
      );

      setMessage(`Successfully synced ${response.data.synced_events} events and booked ${response.data.auto_booked_count} rides`);
      setTimeout(() => setMessage(''), 5000);

      // Refresh bookings and reminders
      fetchBookings();
      fetchReminders();
      fetchStats();
    } catch (error: any) {
      console.error('Failed to sync calendar:', error);
      const errorMsg = error.response?.data?.detail || 'Failed to sync calendar';
      setMessage(errorMsg);
    } finally {
      setSyncing(false);
    }
  };

  // Save preferences
  const handleSavePreferences = async () => {
    try {
      await axios.post(`${API_BASE}/api/calendar/preferences`, preferences, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });

      setMessage('Preferences saved successfully');
      setTimeout(() => setMessage(''), 3000);
      setShowPreferenceModal(false);
    } catch (error) {
      console.error('Failed to save preferences:', error);
      setMessage('Failed to save preferences');
    }
  };

  // Cancel booking
  const handleCancelBooking = async (bookingId: string) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      await axios.delete(`${API_BASE}/api/calendar/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` },
      });

      setMessage('Booking cancelled');
      setTimeout(() => setMessage(''), 3000);
      fetchBookings();
      fetchStats();
    } catch (error) {
      console.error('Failed to cancel booking:', error);
      setMessage('Failed to cancel booking');
    }
  };

  if (loading && !connected) {
    return <div className="calendar-booking-loading">Loading calendar booking...</div>;
  }

  return (
    <div className="calendar-booking-container">
      <div className="calendar-booking-header">
        <h1>📅 Calendar Booking</h1>
        <p>Automatically book rides for your calendar meetings</p>
      </div>

      {message && <div className="calendar-booking-message">{message}</div>}

      {/* Connection Status */}
      <div className={`calendar-connection-card ${connected ? 'connected' : 'disconnected'}`}>
        <div className="connection-status">
          <div className="status-icon">{connected ? '✓' : '✕'}</div>
          <div className="status-info">
            <h3>{connected ? 'Google Calendar Connected' : 'Google Calendar Not Connected'}</h3>
            <p>
              {connected
                ? 'Your calendar is connected and auto-booking is ready to use'
                : 'Connect your Google Calendar to enable automatic ride booking for meetings'}
            </p>
          </div>
        </div>

        <div className="connection-actions">
          {connected ? (
            <>
              <button
                className="btn btn-primary"
                onClick={handleSyncAndBook}
                disabled={syncing || !preferences.enabled}
              >
                {syncing ? 'Syncing...' : '🔄 Sync & Book'}
              </button>
              <button className="btn btn-secondary" onClick={handleDisconnectCalendar}>
                🔗 Disconnect
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={handleConnectCalendar}>
              Connect Google Calendar
            </button>
          )}
        </div>
      </div>

      {connected && (
        <>
          {/* Quick Stats */}
          <div className="calendar-stats">
            <div className="stat-card">
              <div className="stat-number">{stats.total}</div>
              <div className="stat-label">Total Bookings</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.by_status?.confirmed || 0}</div>
              <div className="stat-label">Confirmed</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.by_status?.pending || 0}</div>
              <div className="stat-label">Pending</div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{stats.by_status?.cancelled || 0}</div>
              <div className="stat-label">Cancelled</div>
            </div>
          </div>

          {/* Auto-Booking Settings */}
          <div className="calendar-preferences-card">
            <div className="preferences-header">
              <h3>Auto-Booking Settings</h3>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={preferences.enabled}
                  onChange={(e) => setPreferences({ ...preferences, enabled: e.target.checked })}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>

            {preferences.enabled && (
              <div className="preferences-summary">
                <p>✓ Auto-booking enabled</p>
                <p>• Advance booking: {preferences.advance_booking_minutes} minutes</p>
                <p>• Ride type: {preferences.preferred_ride_type}</p>
                <p>• Max daily bookings: {preferences.max_daily_auto_bookings}</p>
                <button
                  className="btn btn-outline"
                  onClick={() => setShowPreferenceModal(true)}
                >
                  Edit Settings
                </button>
              </div>
            )}

            {!preferences.enabled && (
              <div className="preferences-disabled">
                <p>Enable auto-booking to automatically reserve rides for your calendar meetings</p>
                <button
                  className="btn btn-primary"
                  onClick={() => setPreferences({ ...preferences, enabled: true })}
                >
                  Enable Auto-Booking
                </button>
              </div>
            )}
          </div>

          {/* Upcoming Meeting Reminders */}
          {reminders.length > 0 && (
            <div className="calendar-reminders-card">
              <h3>📌 Upcoming Meetings (Next 24h)</h3>
              <div className="reminders-list">
                {reminders.map((reminder) => (
                  <div key={reminder._id} className="reminder-item">
                    <div className="reminder-icon">
                      {reminder.ride_booked ? '✓' : '⚠'}
                    </div>
                    <div className="reminder-details">
                      <h4>{reminder.title}</h4>
                      <p>📍 {reminder.location}</p>
                      <p>🕐 {new Date(reminder.start_time).toLocaleString()}</p>
                      {reminder.ride_booked && reminder.pickup_time && (
                        <p className="booking-confirmed">
                          ✓ Ride booked | Pickup: {new Date(reminder.pickup_time).toLocaleTimeString()}
                          {reminder.driver_eta && ` | ETA: ${reminder.driver_eta} min`}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Bookings */}
          <div className="calendar-bookings-card">
            <h3>📋 Recent Calendar Bookings</h3>
            {bookings.length === 0 ? (
              <p className="empty-state">No calendar bookings yet. Sync your calendar to get started!</p>
            ) : (
              <div className="bookings-list">
                {bookings.slice(0, 10).map((booking) => (
                  <div key={booking._id} className={`booking-item status-${booking.booking_status}`}>
                    <div className="booking-header">
                      <h4>{booking.title}</h4>
                      <span className={`status-badge ${booking.booking_status}`}>
                        {booking.booking_status}
                      </span>
                    </div>
                    <p>📍 {booking.location}</p>
                    <p>🚗 {booking.ride_type}</p>
                    <p className="booking-time">
                      {new Date(booking.event_start_time).toLocaleString()}
                    </p>
                    <p className="confidence">
                      Confidence: {(booking.transportation_confidence * 100).toFixed(0)}%
                    </p>
                    {booking.booking_status === 'pending' && (
                      <button
                        className="btn btn-sm btn-danger"
                        onClick={() => handleCancelBooking(booking._id)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Preferences Modal */}
      {showPreferenceModal && (
        <div className="modal-overlay" onClick={() => setShowPreferenceModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Auto-Booking Preferences</h2>

            <div className="form-group">
              <label>Preferred Ride Type</label>
              <select
                value={preferences.preferred_ride_type}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    preferred_ride_type: e.target.value as 'instant' | 'scheduled',
                  })
                }
              >
                <option value="instant">Instant Booking</option>
                <option value="scheduled">Scheduled Booking</option>
              </select>
            </div>

            <div className="form-group">
              <label>Advance Booking (minutes before meeting)</label>
              <input
                type="number"
                min="5"
                max="120"
                value={preferences.advance_booking_minutes}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    advance_booking_minutes: parseInt(e.target.value),
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Max Daily Auto-Bookings</label>
              <input
                type="number"
                min="1"
                max="20"
                value={preferences.max_daily_auto_bookings}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    max_daily_auto_bookings: parseInt(e.target.value),
                  })
                }
              />
            </div>

            <div className="form-group">
              <label>Auto-Book Confidence Threshold</label>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                value={preferences.auto_book_threshold}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    auto_book_threshold: parseFloat(e.target.value),
                  })
                }
              />
              <p className="threshold-value">{(preferences.auto_book_threshold * 100).toFixed(0)}% confidence</p>
            </div>

            <div className="form-group checkbox">
              <label>
                <input
                  type="checkbox"
                  checked={preferences.include_return_trip}
                  onChange={(e) =>
                    setPreferences({ ...preferences, include_return_trip: e.target.checked })
                  }
                />
                Auto-book return trip
              </label>
            </div>

            <div className="form-group">
              <label>Payment Method</label>
              <select
                value={preferences.payment_method}
                onChange={(e) =>
                  setPreferences({ ...preferences, payment_method: e.target.value })
                }
              >
                <option value="wallet">Wallet</option>
                <option value="credit_card">Credit Card</option>
              </select>
            </div>

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={handleSavePreferences}>
                Save Preferences
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setShowPreferenceModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CalendarBooking;
