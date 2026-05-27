import React from 'react';

// A simple driver preview card for enhanced driver list
export default function DriverPreview({ driver }) {
  if (!driver) return null;
  return (
    <div className="driver-preview">
      <img src={driver.photoUrl} alt={driver.name} className="driver-photo" />
      <div className="driver-info">
        <div className="driver-name">{driver.name}</div>
        <div className="driver-rating">⭐ {driver.rating}</div>
        <div className="driver-vehicle">{driver.vehicle}</div>
        <div className="driver-completion">Completion: {driver.completionRate}%</div>
        <div className="driver-response">Response: {driver.responseTime}s</div>
        <div className="driver-type">{driver.type}</div>
      </div>
    </div>
  );
}
