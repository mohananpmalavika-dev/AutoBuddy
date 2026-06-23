import React, { useState, useCallback } from 'react';
import { useFamilyAssistantWeb } from '../hooks/useFamilyAssistantWeb';

interface FamilyAssistantDashboardProps {
  userId: string;
  token?: string;
}

export const FamilyAssistantDashboard: React.FC<FamilyAssistantDashboardProps> = ({
  userId,
  token,
}) => {
  const {
    familyMembers,
    upcomingAppointments,
    notifications,
    unreadCount,
    dashboardData,
    loading,
    error,
    addFamilyMember,
    refreshAll,
    markAllRead,
  } = useFamilyAssistantWeb(userId, token);

  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showNotificationsPanel, setShowNotificationsPanel] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    relation: 'parent' as const,
  });

  const relations: ('parent' | 'child' | 'spouse' | 'sibling' | 'friend')[] = [
    'parent',
    'child',
    'spouse',
    'sibling',
    'friend',
  ];

  const handleAddMember = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.email.trim() || !formData.phone.trim()) {
      alert('Please fill in all fields');
      return;
    }

    try {
      await addFamilyMember({
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
        relation: formData.relation,
        is_active: true,
        calendar_synced: false,
        emergency_contact: false,
      });
      setFormData({ name: '', email: '', phone: '', relation: 'parent' });
      setShowAddMemberModal(false);
      alert('Family member added successfully');
    } catch (err) {
      alert('Failed to add family member');
    }
  }, [formData, addFamilyMember]);

  const getAppointmentIcon = (type: string) => {
    switch (type) {
      case 'medical':
        return '🏥';
      case 'education':
        return '🎓';
      case 'work':
        return '💼';
      case 'personal':
        return '📝';
      default:
        return '📅';
    }
  };

  const getPriorityClass = (priority: string) => {
    return `priority-${priority}`;
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const dashboardStyle: React.CSSProperties = {
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#f5f5f5',
    minHeight: '100vh',
    padding: '20px',
  };

  const headerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const statsContainerStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '15px',
    marginBottom: '20px',
  };

  const statCardStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    textAlign: 'center',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const sectionStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    padding: '20px',
    borderRadius: '12px',
    marginBottom: '20px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
  };

  const appointmentCardStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '15px',
    padding: '15px',
    borderLeft: '4px solid #4CAF50',
    backgroundColor: '#f9f9f9',
    borderRadius: '8px',
    marginBottom: '12px',
  };

  const memberGridStyle: React.CSSProperties = {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: '15px',
  };

  const memberCardStyle: React.CSSProperties = {
    backgroundColor: '#f9f9f9',
    padding: '15px',
    borderRadius: '8px',
    border: '1px solid #eee',
  };

  const notificationItemStyle: (read: boolean) => React.CSSProperties = (read) => ({
    padding: '12px',
    borderLeft: '4px solid #2196F3',
    backgroundColor: read ? '#fff' : '#F3F7FF',
    borderRadius: '8px',
    marginBottom: '10px',
  });

  const modalOverlayStyle: React.CSSProperties = {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalContentStyle: React.CSSProperties = {
    backgroundColor: '#fff',
    borderRadius: '12px',
    padding: '30px',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 4px 20px rgba(0,0,0,0.2)',
  };

  const buttonStyle: React.CSSProperties = {
    padding: '10px 16px',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  };

  const primaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#4CAF50',
    color: '#fff',
  };

  const secondaryButtonStyle: React.CSSProperties = {
    ...buttonStyle,
    backgroundColor: '#f0f0f0',
    color: '#1a1a1a',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    marginBottom: '15px',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '14px',
    boxSizing: 'border-box',
  };

  return (
    <div style={dashboardStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <div>
          <h1 style={{ margin: '0 0 5px 0', fontSize: '28px' }}>Family Assistant</h1>
          <p style={{ margin: 0, color: '#666', fontSize: '14px' }}>
            Manage your family's rides & appointments
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowNotificationsPanel(!showNotificationsPanel)}
            style={{
              position: 'relative',
              ...buttonStyle,
              backgroundColor: '#2196F3',
              color: '#fff',
            }}
          >
            🔔
            {unreadCount > 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: '-8px',
                  right: '-8px',
                  backgroundColor: '#FF6B6B',
                  color: '#fff',
                  borderRadius: '50%',
                  width: '24px',
                  height: '24px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                {unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={refreshAll}
            disabled={loading}
            style={{
              ...primaryButtonStyle,
              opacity: loading ? 0.6 : 1,
            }}
          >
            {loading ? '⟳ Loading...' : '⟳ Refresh'}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div
          style={{
            backgroundColor: '#FFE5E5',
            color: '#CC0000',
            padding: '12px',
            borderRadius: '8px',
            marginBottom: '20px',
            borderLeft: '4px solid #FF6B6B',
          }}
        >
          {error}
        </div>
      )}

      {/* Dashboard Stats */}
      {dashboardData && (
        <div style={statsContainerStyle}>
          <div style={statCardStyle}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#4CAF50' }}>
              {dashboardData.bookingSummary.upcomingRides}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
              Upcoming Rides
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#2196F3' }}>
              {upcomingAppointments.length}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
              Appointments
            </div>
          </div>
          <div style={statCardStyle}>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#FF9800' }}>
              {familyMembers.length}
            </div>
            <div style={{ fontSize: '13px', color: '#666', marginTop: '5px' }}>
              Family Members
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '20px' }}>
        <div style={{ flex: 1 }}>
          {/* Upcoming Appointments Section */}
          {upcomingAppointments.length > 0 && (
            <div style={sectionStyle}>
              <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>
                Upcoming Appointments
              </h2>
              {upcomingAppointments.slice(0, 5).map((appointment) => (
                <div key={appointment.id} style={appointmentCardStyle}>
                  <div style={{ fontSize: '24px' }}>
                    {getAppointmentIcon(appointment.appointment_type)}
                  </div>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 5px 0' }}>{appointment.title}</h3>
                    <p style={{ margin: '3px 0', color: '#666', fontSize: '13px' }}>
                      ⏰ {formatDateTime(appointment.start_time)}
                    </p>
                    <p style={{ margin: '3px 0', color: '#666', fontSize: '13px' }}>
                      📍 {appointment.location}
                    </p>
                  </div>
                  <div
                    style={{
                      padding: '6px 10px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: 'bold',
                      color: '#fff',
                      backgroundColor:
                        appointment.priority === 'high'
                          ? '#FF6B6B'
                          : appointment.priority === 'medium'
                          ? '#FFC93C'
                          : '#52A552',
                    }}
                  >
                    {appointment.priority}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Family Members Section */}
          <div style={sectionStyle}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h2 style={{ margin: 0, fontSize: '18px' }}>Family Members</h2>
              <button
                onClick={() => setShowAddMemberModal(true)}
                style={primaryButtonStyle}
              >
                + Add Member
              </button>
            </div>

            {familyMembers.length > 0 ? (
              <div style={memberGridStyle}>
                {familyMembers.map((member) => (
                  <div key={member.id} style={memberCardStyle}>
                    <h3 style={{ margin: '0 0 5px 0' }}>{member.name}</h3>
                    <p style={{ margin: '3px 0', color: '#666', fontSize: '13px' }}>
                      {member.relation}
                    </p>
                    <p style={{ margin: '3px 0', color: '#999', fontSize: '13px' }}>
                      📞 {member.phone}
                    </p>
                    {member.calendar_synced && (
                      <p
                        style={{
                          margin: '8px 0 0 0',
                          color: '#4CAF50',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}
                      >
                        ✓ Calendar Synced
                      </p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '30px 20px' }}>
                <p style={{ color: '#666', marginBottom: '15px' }}>
                  No family members added yet
                </p>
                <button
                  onClick={() => setShowAddMemberModal(true)}
                  style={primaryButtonStyle}
                >
                  Add First Member
                </button>
              </div>
            )}
          </div>

          {/* Recent Notifications */}
          {notifications.length > 0 && (
            <div style={sectionStyle}>
              <h2 style={{ margin: '0 0 15px 0', fontSize: '18px' }}>
                Recent Notifications
              </h2>
              {notifications.slice(0, 3).map((notification) => (
                <div
                  key={notification.id}
                  style={notificationItemStyle(!notification.read)}
                >
                  <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}>
                    {notification.message}
                  </p>
                  <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>
                    {formatDateTime(notification.created_at)}
                  </p>
                </div>
              ))}
              {notifications.length > 3 && (
                <button
                  onClick={() => setShowNotificationsPanel(true)}
                  style={{
                    ...buttonStyle,
                    backgroundColor: 'transparent',
                    color: '#2196F3',
                    padding: '10px 0',
                  }}
                >
                  View All ({notifications.length})
                </button>
              )}
            </div>
          )}
        </div>

        {/* Sidebar - Notifications Panel */}
        {showNotificationsPanel && (
          <aside
            style={{
              backgroundColor: '#fff',
              borderRadius: '12px',
              padding: '20px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              minWidth: '300px',
              maxHeight: '80vh',
              overflow: 'auto',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>Notifications</h3>
              <button
                onClick={() => setShowNotificationsPanel(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                style={{ ...secondaryButtonStyle, width: '100%', marginBottom: '15px' }}
              >
                Mark All as Read
              </button>
            )}
            {notifications.length > 0 ? (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  style={notificationItemStyle(!notification.read)}
                >
                  <p style={{ margin: '0 0 5px 0', fontSize: '14px' }}>
                    {notification.message}
                  </p>
                  <p style={{ margin: 0, color: '#999', fontSize: '12px' }}>
                    {formatDateTime(notification.created_at)}
                  </p>
                </div>
              ))
            ) : (
              <p style={{ textAlign: 'center', color: '#999' }}>No notifications</p>
            )}
          </aside>
        )}
      </div>

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div
          style={modalOverlayStyle}
          onClick={() => setShowAddMemberModal(false)}
        >
          <div
            style={modalContentStyle}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '20px',
              }}
            >
              <h2 style={{ margin: 0 }}>Add Family Member</h2>
              <button
                onClick={() => setShowAddMemberModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '20px',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMember}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Name *
                </label>
                <input
                  type="text"
                  placeholder="Full Name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Email *
                </label>
                <input
                  type="email"
                  placeholder="Email Address"
                  value={formData.email}
                  onChange={(e) =>
                    setFormData({ ...formData, email: e.target.value })
                  }
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Phone *
                </label>
                <input
                  type="tel"
                  placeholder="Phone Number"
                  value={formData.phone}
                  onChange={(e) =>
                    setFormData({ ...formData, phone: e.target.value })
                  }
                  style={inputStyle}
                  required
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  Relation *
                </label>
                <select
                  value={formData.relation}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      relation: e.target.value as typeof formData.relation,
                    })
                  }
                  style={inputStyle}
                >
                  {relations.map((rel) => (
                    <option key={rel} value={rel}>
                      {rel.charAt(0).toUpperCase() + rel.slice(1)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  style={secondaryButtonStyle}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    ...primaryButtonStyle,
                    opacity: loading ? 0.6 : 1,
                  }}
                >
                  {loading ? 'Adding...' : 'Add Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
