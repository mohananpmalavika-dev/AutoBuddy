import React, { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';

export default function ReceiptTab({ bookingId, token }) {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!bookingId || !token) return;
    setLoading(true);
    setError('');
    apiRequest(`/bookings/${bookingId}/receipt`, { token })
      .then(data => setReceipt(data))
      .catch(err => setError(err.message || 'Failed to load receipt'))
      .finally(() => setLoading(false));
  }, [bookingId, token]);

  if (loading) return <div>Loading receipt...</div>;
  if (error) return <div className="error-message">{error}</div>;
  if (!receipt) return <div>No receipt data available.</div>;

  return (
    <div className="receipt-tab">
      <h3>Receipt</h3>
      <div>Booking ID: {receipt.booking_id || receipt.bookingId}</div>
      <div>Date: {receipt.date}</div>
      <div>Status: {receipt.status}</div>
      <div>Fare Breakdown:</div>
      <ul>
        {receipt.breakdown && receipt.breakdown.map((item, idx) => (
          <li key={idx}>{item.label}: {item.amount}</li>
        ))}
      </ul>
      <div>Total: {receipt.total}</div>
      <button onClick={() => window.print()}>Print/Export</button>
    </div>
  );
}
