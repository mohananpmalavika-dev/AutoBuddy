import React, { useState } from 'react';
import { apiRequest } from '../lib/api';

export default function EditDestinationModal({ isOpen, bookingId, token, currentDestination, onDestinationSaved, onClose }) {
  const [destination, setDestination] = useState(currentDestination || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!destination) return;
    setLoading(true);
    setError('');
    setSuccess(false);
    try {
      await apiRequest(`/bookings/${bookingId}/destination`, {
        method: 'POST',
        token,
        body: { destination }
      });
      setSuccess(true);
      if (onDestinationSaved) onDestinationSaved(destination);
      setTimeout(() => {
        setSuccess(false);
        onClose && onClose();
      }, 1200);
    } catch (err) {
      setError(err.message || 'Failed to update destination');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="edit-destination-modal modal">
      <h3>Edit Destination</h3>
      <input
        type="text"
        placeholder="Enter new destination"
        value={destination}
        onChange={e => setDestination(e.target.value)}
        disabled={loading}
      />
      <button onClick={handleSave} disabled={loading || !destination}>Save</button>
      <button onClick={onClose} disabled={loading}>Cancel</button>
      {loading && <div>Saving...</div>}
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Destination updated!</div>}
    </div>
  );
}
