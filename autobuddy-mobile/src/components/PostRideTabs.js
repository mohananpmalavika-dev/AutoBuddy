import React from 'react';
import LostItemTab from './LostItemTab';
import ReceiptTab from './ReceiptTab';

export default function PostRideTabs({ activeTab, onTabChange, booking }) {
  return (
    <div className="post-ride-tabs">
      <div className="tab-header">
        <button onClick={() => onTabChange('rate')}>Rate Ride</button>
        <button onClick={() => onTabChange('report')}>Report Issue</button>
        <button onClick={() => onTabChange('lost')}>Lost Item</button>
        <button onClick={() => onTabChange('receipt')}>Receipt</button>
      </div>
      <div className="tab-content">
        {activeTab === 'rate' && <div>/* Rating UI here */</div>}
        {activeTab === 'report' && <div>/* Report Issue UI here */</div>}
        {activeTab === 'lost' && <LostItemTab bookingId={booking?.id} token={booking?.token} />}
        {activeTab === 'receipt' && <ReceiptTab bookingId={booking?.id} token={booking?.token} />}
      </div>
    </div>
  );
}
