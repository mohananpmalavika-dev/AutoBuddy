import React from 'react';

export default function CancellationCostBanner({ cost, state }) {
  if (cost == null) return null;
  return (
    <div className="cancellation-cost-banner">
      {state === 'free' && <span>Free cancellation available</span>}
      {state === 'paid' && <span>Cancellation Fee: INR {cost}</span>}
      {state === 'none' && <span>No cancellation allowed at this stage</span>}
    </div>
  );
}
