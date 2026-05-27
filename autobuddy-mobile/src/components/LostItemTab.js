import React, { useState } from 'react';
import { apiRequest } from '../lib/api';

export default function LostItemTab({ bookingId, token }) {
  const [itemType, setItemType] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);
    try {
      await apiRequest(`/v1/passengers/bookings/${bookingId}/lost-item`, {
        method: 'POST',
        token,
        body: {
          item_type: itemType,
          description,
          contact,
        },
      });
      setSuccess(true);
      setItemType('');
      setDescription('');
      setContact('');
    } catch (err) {
      setError(err.message || 'Failed to report lost item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="lost-item-tab" onSubmit={handleSubmit}>
      <label>
        Item Type:
        <select value={itemType} onChange={e => setItemType(e.target.value)} required>
          <option value="">Select</option>
          <option value="Phone">Phone</option>
          <option value="Wallet">Wallet</option>
          <option value="Keys">Keys</option>
          <option value="Bag">Bag</option>
          <option value="Other">Other</option>
        </select>
      </label>
      <label>
        Description:
        <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={500} required />
      </label>
      <label>
        Contact for Retrieval:
        <input value={contact} onChange={e => setContact(e.target.value)} required />
      </label>
      <button type="submit" disabled={loading}>{loading ? 'Reporting...' : 'Report Lost Item'}</button>
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">Lost item reported successfully!</div>}
    </form>
  );
}
