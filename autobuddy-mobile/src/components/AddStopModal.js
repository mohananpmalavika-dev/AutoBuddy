import React, { useState } from 'react';
import { apiRequest } from '../lib/api';

export default function AddStopModal({ isOpen, onClose, bookingId, token, onStopAdded }) {
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async () => {
    if (!location) return;
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      await apiRequest(`/bookings/${bookingId}/add-stop`, {
        method: 'POST',
        token,
        body: { stop: location }
      });
      setSuccess(true);
      setLocation('');
      if (onStopAdded) onStopAdded(location);
      setTimeout(() => {
        setSuccess(false);
        onClose && onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to add stop');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="add-stop-modal modal">
      <h3>Add Stop</h3>
      <input
        type="text"
        placeholder="Enter stop location"
        value={location}
        onChange={e => setLocation(e.target.value)}
        disabled={loading}
      />
      <button onClick={handleAdd} disabled={loading || !location}>Add Stop</button>
      <button onClick={onClose} disabled={loading}>Cancel</button>
      {loading && <div>Adding stop...</div>}
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Stop added!</div>}
    </div>
  );
}
