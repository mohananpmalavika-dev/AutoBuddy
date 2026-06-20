import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
  Switch,
  Dimensions
} from 'react-native';
import { useSafety } from '../hooks/useSafety';

const { width, height } = Dimensions.get('window');

// ==================== SOS BUTTON SCREEN ====================

export const SOSButtonScreen: React.FC<{
  userId: string;
  authToken: string;
  latitude: number;
  longitude: number;
  address: string;
  rideId?: string;
  onSOSTriggered: () => void;
}> = ({ userId, authToken, latitude, longitude, address, rideId, onSOSTriggered }) => {
  const { triggerSOS, cancelSOS, isLoading, sosAlert } = useSafety(userId, authToken);
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [showReasons, setShowReasons] = useState(false);

  const sosReasons = [
    { label: 'Accident', value: 'accident' },
    { label: 'Safety Threat', value: 'threat' },
    { label: 'Medical Emergency', value: 'medical' },
    { label: 'Technical Issue', value: 'technical' }
  ];

  const handleSOSPress = async (reason: string) => {
    const result = await triggerSOS(reason, latitude, longitude, address, false);
    if (result) {
      Alert.alert(
        'SOS Triggered',
        'Emergency services and your emergency contacts have been notified of your location.',
        [{ text: 'OK', onPress: onSOSTriggered }]
      );
    }
  };

  if (sosAlert && sosAlert.status === 'active') {
    return (
      <View style={styles.sosActiveContainer}>
        <View style={styles.sosActiveHeader}>
          <Text style={styles.sosActiveTitle}>SOS Active</Text>
          <Text style={styles.sosActiveSubtitle}>
            Emergency services notified
          </Text>
        </View>

        <View style={styles.sosStatusBox}>
          <View style={styles.statusIndicator}>
            <Text style={styles.blinkingDot}>●</Text>
          </View>
          <View style={styles.statusContent}>
            <Text style={styles.statusLabel}>Reason</Text>
            <Text style={styles.statusValue}>{sosAlert.reason.toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.sosLocationBox}>
          <Text style={styles.sosLocationLabel}>Your Location</Text>
          <Text style={styles.sosLocationAddress}>{sosAlert.location.address}</Text>
          <Text style={styles.sosLocationCoords}>
            {sosAlert.location.latitude.toFixed(4)}, {sosAlert.location.longitude.toFixed(4)}
          </Text>
        </View>

        <View style={styles.sosNotificationBox}>
          <View style={styles.notificationItem}>
            <Text style={styles.notificationCheck}>✓</Text>
            <View>
              <Text style={styles.notificationTitle}>Emergency Services</Text>
              <Text style={styles.notificationStatus}>
                {sosAlert.emergency_services_notified ? 'Notified' : 'Notifying...'}
              </Text>
            </View>
          </View>
          <View style={styles.notificationItem}>
            <Text style={styles.notificationCheck}>✓</Text>
            <View>
              <Text style={styles.notificationTitle}>Emergency Contacts</Text>
              <Text style={styles.notificationStatus}>
                {sosAlert.emergency_contacts_notified ? 'Notified' : 'Notifying...'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.button, styles.buttonCancel]}
          onPress={() => cancelSOS(sosAlert.sos_id)}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.buttonCancelText}>Cancel SOS</Text>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.sosButtonContainer}>
      <View style={styles.sosWarning}>
        <Text style={styles.sosWarningTitle}>⚠ Safety Alert System</Text>
        <Text style={styles.sosWarningText}>
          Only press SOS in genuine emergency. False alarms may result in penalties.
        </Text>
      </View>

      <View style={styles.sosButtonWrapper}>
        <TouchableOpacity
          style={styles.sosButtonLarge}
          onPress={() => setShowReasons(true)}
        >
          <Text style={styles.sosButtonText}>SOS</Text>
          <Text style={styles.sosButtonSubtext}>Press for help</Text>
        </TouchableOpacity>
      </View>

      <Modal visible={showReasons} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.sosReasonModal}>
            <Text style={styles.modalTitle}>Select Reason for SOS</Text>

            {sosReasons.map((reason) => (
              <TouchableOpacity
                key={reason.value}
                style={styles.reasonOption}
                onPress={() => {
                  setShowReasons(false);
                  handleSOSPress(reason.value);
                }}
              >
                <Text style={styles.reasonLabel}>{reason.label}</Text>
              </TouchableOpacity>
            ))}

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowReasons(false)}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==================== EMERGENCY CONTACTS SCREEN ====================

export const EmergencyContactsScreen: React.FC<{
  userId: string;
  authToken: string;
}> = ({ userId, authToken }) => {
  const {
    emergencyContacts,
    isLoading,
    addEmergencyContact,
    deleteEmergencyContact,
    fetchEmergencyContacts
  } = useSafety(userId, authToken);

  const [showModal, setShowModal] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [relationship, setRelationship] = useState('family');

  const handleAddContact = async () => {
    if (!name.trim() || !phone.trim()) {
      Alert.alert('Error', 'Please enter name and phone number');
      return;
    }

    const success = await addEmergencyContact(name, phone, relationship, email);
    if (success) {
      Alert.alert('Success', 'Emergency contact added');
      setName('');
      setPhone('');
      setEmail('');
      setRelationship('family');
      setShowModal(false);
    }
  };

  const handleDeleteContact = (contactId: string) => {
    Alert.alert(
      'Delete Contact?',
      'Are you sure you want to delete this emergency contact?',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Delete',
          onPress: async () => {
            await deleteEmergencyContact(contactId);
          },
          style: 'destructive'
        }
      ]
    );
  };

  const renderContact = ({ item }: { item: any }) => (
    <View style={styles.contactCard}>
      <View style={styles.contactInfo}>
        <View style={styles.contactAvatar}>
          <Text style={styles.avatarText}>{item.name.charAt(0).toUpperCase()}</Text>
        </View>
        <View style={styles.contactDetails}>
          <Text style={styles.contactName}>{item.name}</Text>
          <Text style={styles.contactPhone}>{item.phone}</Text>
          <Text style={styles.contactRelation}>{item.relationship}</Text>
        </View>
        {item.is_primary && (
          <View style={styles.primaryBadge}>
            <Text style={styles.primaryBadgeText}>Primary</Text>
          </View>
        )}
      </View>
      <TouchableOpacity
        style={styles.contactDeleteBtn}
        onPress={() => handleDeleteContact(item.contact_id)}
      >
        <Text style={styles.deleteIcon}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Emergency Contacts</Text>
        <Text style={styles.headerSubtitle}>
          {emergencyContacts.length} contact{emergencyContacts.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {emergencyContacts.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateIcon}>📞</Text>
          <Text style={styles.emptyStateTitle}>No Emergency Contacts</Text>
          <Text style={styles.emptyStateText}>
            Add contacts who should be notified in case of emergency
          </Text>
        </View>
      ) : (
        <FlatList
          data={emergencyContacts}
          renderItem={renderContact}
          keyExtractor={(item) => item.contact_id}
          scrollEnabled={false}
          contentContainerStyle={styles.contactList}
        />
      )}

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary, styles.fab]}
        onPress={() => setShowModal(true)}
      >
        <Text style={styles.fabText}>+ Add Contact</Text>
      </TouchableOpacity>

      <Modal visible={showModal} transparent={true} animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.addContactModal}>
            <Text style={styles.modalTitle}>Add Emergency Contact</Text>

            <TextInput
              style={styles.input}
              placeholder="Full Name"
              value={name}
              onChangeText={setName}
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="Phone Number"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              placeholderTextColor="#999"
            />

            <TextInput
              style={styles.input}
              placeholder="Email (optional)"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              placeholderTextColor="#999"
            />

            <View style={styles.relationshipSelect}>
              <Text style={styles.label}>Relationship</Text>
              {['family', 'friend', 'colleague'].map((rel) => (
                <TouchableOpacity
                  key={rel}
                  style={[
                    styles.relationshipOption,
                    relationship === rel && styles.relationshipOptionSelected
                  ]}
                  onPress={() => setRelationship(rel)}
                >
                  <Text
                    style={[
                      styles.relationshipText,
                      relationship === rel && styles.relationshipTextSelected
                    ]}
                  >
                    {rel.charAt(0).toUpperCase() + rel.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.button, styles.buttonPrimary]}
              onPress={handleAddContact}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <Text style={styles.buttonText}>Add Contact</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setShowModal(false)}
            >
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ==================== INCIDENT REPORTING SCREEN ====================

export const IncidentReportingScreen: React.FC<{
  userId: string;
  authToken: string;
  latitude: number;
  longitude: number;
  address: string;
  rideId?: string;
  onReported: () => void;
}> = ({ userId, authToken, latitude, longitude, address, rideId, onReported }) => {
  const { reportIncident, isLoading, incidents } = useSafety(userId, authToken);

  const [incidentType, setIncidentType] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [showForm, setShowForm] = useState(false);

  const incidentTypes = [
    { label: 'Accident', value: 'accident' },
    { label: 'Threat/Safety', value: 'threat' },
    { label: 'Harassment', value: 'harassment' },
    { label: 'Property Damage', value: 'property_damage' },
    { label: 'Other', value: 'other' }
  ];

  const severityLevels = [
    { label: 'Low', value: 'low' },
    { label: 'Medium', value: 'medium' },
    { label: 'High', value: 'high' },
    { label: 'Critical', value: 'critical' }
  ];

  const handleReportIncident = async () => {
    if (!description.trim()) {
      Alert.alert('Error', 'Please describe what happened');
      return;
    }

    const result = await reportIncident(
      incidentType,
      severity,
      description,
      latitude,
      longitude,
      address,
      undefined,
      undefined,
      rideId
    );

    if (result) {
      Alert.alert(
        'Incident Reported',
        'Thank you for reporting. Our support team will review this shortly.',
        [
          {
            text: 'OK',
            onPress: () => {
              setIncidentType('other');
              setSeverity('medium');
              setDescription('');
              setShowForm(false);
              onReported();
            }
          }
        ]
      );
    }
  };

  if (!showForm) {
    return (
      <View style={styles.container}>
        <View style={styles.incidentHeader}>
          <Text style={styles.incidentHeaderTitle}>Report an Incident</Text>
          <Text style={styles.incidentHeaderSubtitle}>
            Help us make rides safer for everyone
          </Text>
        </View>

        <View style={styles.recentIncidents}>
          <Text style={styles.recentIncidentsTitle}>Recent Reports</Text>
          {incidents.length === 0 ? (
            <Text style={styles.noRecentIncidents}>No incidents reported</Text>
          ) : (
            incidents.slice(0, 3).map((incident) => (
              <View key={incident.incident_id} style={styles.incidentItem}>
                <View
                  style={[
                    styles.severityIndicator,
                    {
                      backgroundColor:
                        incident.severity === 'critical'
                          ? '#E53E3E'
                          : incident.severity === 'high'
                          ? '#F59E0B'
                          : '#10B981'
                    }
                  ]}
                />
                <View style={styles.incidentItemContent}>
                  <Text style={styles.incidentItemType}>{incident.type}</Text>
                  <Text style={styles.incidentItemDate}>
                    {new Date(incident.reported_at).toLocaleDateString()}
                  </Text>
                </View>
              </View>
            ))
          )}
        </View>

        <TouchableOpacity
          style={[styles.button, styles.buttonPrimary]}
          onPress={() => setShowForm(true)}
        >
          <Text style={styles.buttonText}>+ Report New Incident</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.formHeader}>
        <TouchableOpacity onPress={() => setShowForm(false)}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.formTitle}>Report Incident</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Incident Type</Text>
        {incidentTypes.map((type) => (
          <TouchableOpacity
            key={type.value}
            style={[
              styles.typeOption,
              incidentType === type.value && styles.typeOptionSelected
            ]}
            onPress={() => setIncidentType(type.value)}
          >
            <Text
              style={[
                styles.typeOptionText,
                incidentType === type.value && styles.typeOptionTextSelected
              ]}
            >
              {type.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Severity</Text>
        <View style={styles.severityGrid}>
          {severityLevels.map((level) => (
            <TouchableOpacity
              key={level.value}
              style={[
                styles.severityButton,
                severity === level.value && styles.severityButtonSelected
              ]}
              onPress={() => setSeverity(level.value)}
            >
              <Text
                style={[
                  styles.severityButtonText,
                  severity === level.value && styles.severityButtonTextSelected
                ]}
              >
                {level.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Description</Text>
        <TextInput
          style={styles.descriptionInput}
          placeholder="Please describe what happened in detail..."
          value={description}
          onChangeText={setDescription}
          multiline
          numberOfLines={6}
          placeholderTextColor="#999"
        />
      </View>

      <TouchableOpacity
        style={[styles.button, styles.buttonPrimary]}
        onPress={handleReportIncident}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#FFF" />
        ) : (
          <Text style={styles.buttonText}>Submit Report</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
};

// ==================== SAFETY PROFILE SCREEN ====================

export const SafetyProfileScreen: React.FC<{
  userId: string;
  authToken: string;
}> = ({ userId, authToken }) => {
  const { safetyProfile, isLoading } = useSafety(userId, authToken);

  const getSafetyColor = (level: string) => {
    switch (level) {
      case 'high':
        return '#10B981';
      case 'medium':
        return '#F59E0B';
      default:
        return '#E53E3E';
    }
  };

  if (isLoading || !safetyProfile) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FF6B35" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.safetyScoreCard}>
        <View
          style={[
            styles.scoreCircle,
            { borderColor: getSafetyColor(safetyProfile.safety_level) }
          ]}
        >
          <Text style={styles.scoreValue}>{safetyProfile.safety_score}</Text>
          <Text style={styles.scoreLabel}>Safety Score</Text>
        </View>
        <View style={styles.scoreBadge}>
          <Text
            style={[
              styles.badgeText,
              { color: getSafetyColor(safetyProfile.safety_level) }
            ]}
          >
            {safetyProfile.safety_level.toUpperCase()}
          </Text>
        </View>
      </View>

      <View style={styles.statsGrid}>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{safetyProfile.total_ratings}</Text>
          <Text style={styles.statLabel}>Ratings</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{safetyProfile.safe_rides_percent}%</Text>
          <Text style={styles.statLabel}>Safe Rides</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{safetyProfile.incidents_reported}</Text>
          <Text style={styles.statLabel}>Incidents</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statValue}>{safetyProfile.sos_alerts_triggered}</Text>
          <Text style={styles.statLabel}>SOS Alerts</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Recent Incidents</Text>
        {safetyProfile.recent_incidents.length === 0 ? (
          <Text style={styles.noData}>No recent incidents</Text>
        ) : (
          safetyProfile.recent_incidents.map((incident) => (
            <View key={incident.incident_id} style={styles.incidentListItem}>
              <Text style={styles.incidentListType}>{incident.type}</Text>
              <Text style={styles.incidentListDate}>
                {new Date(incident.reported_at).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
};

// ==================== STYLES ====================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5'
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },

  // SOS Button Styles
  sosButtonContainer: {
    flex: 1,
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 40
  },
  sosWarning: {
    backgroundColor: '#FEE',
    borderLeftWidth: 4,
    borderLeftColor: '#E53E3E',
    padding: 12,
    borderRadius: 8
  },
  sosWarningTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#E53E3E',
    marginBottom: 4
  },
  sosWarningText: {
    fontSize: 12,
    color: '#C53030',
    lineHeight: 16
  },
  sosButtonWrapper: {
    alignItems: 'center'
  },
  sosButtonLarge: {
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: '#E53E3E',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 40
  },
  sosButtonText: {
    fontSize: 64,
    fontWeight: 'bold',
    color: '#FFF'
  },
  sosButtonSubtext: {
    fontSize: 14,
    color: '#FFF',
    marginTop: 8
  },
  sosActiveContainer: {
    flex: 1,
    backgroundColor: '#FEE',
    paddingTop: 40
  },
  sosActiveHeader: {
    padding: 16,
    backgroundColor: '#E53E3E',
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16
  },
  sosActiveTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF',
    marginBottom: 4
  },
  sosActiveSubtitle: {
    fontSize: 14,
    color: '#FFE0E0'
  },
  sosStatusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 16,
    backgroundColor: '#FFF',
    padding: 16,
    borderRadius: 8
  },
  statusIndicator: {
    marginRight: 12
  },
  blinkingDot: {
    fontSize: 24,
    color: '#E53E3E'
  },
  statusContent: {
    flex: 1
  },
  statusLabel: {
    fontSize: 12,
    color: '#999'
  },
  statusValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333'
  },
  sosLocationBox: {
    margin: 16,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8
  },
  sosLocationLabel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500'
  },
  sosLocationAddress: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginTop: 4
  },
  sosLocationCoords: {
    fontSize: 11,
    color: '#999',
    marginTop: 4
  },
  sosNotificationBox: {
    margin: 16,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  notificationCheck: {
    fontSize: 20,
    color: '#10B981',
    marginRight: 12,
    fontWeight: 'bold'
  },
  notificationTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333'
  },
  notificationStatus: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 2
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end'
  },
  sosReasonModal: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40
  },
  addContactModal: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 40
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16
  },
  reasonOption: {
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  reasonLabel: {
    fontSize: 14,
    color: '#333',
    fontWeight: '500'
  },

  // Emergency Contacts Styles
  header: {
    padding: 20,
    backgroundColor: '#FF6B35',
    paddingTop: 40
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF'
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#FFE0CC',
    marginTop: 4
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60
  },
  emptyStateIcon: {
    fontSize: 60,
    marginBottom: 16
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  emptyStateText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingHorizontal: 20
  },
  contactList: {
    padding: 16
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    elevation: 2
  },
  contactInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1
  },
  contactAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FF6B35',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF'
  },
  contactDetails: {
    flex: 1
  },
  contactName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333'
  },
  contactPhone: {
    fontSize: 12,
    color: '#666',
    marginTop: 2
  },
  contactRelation: {
    fontSize: 11,
    color: '#999'
  },
  primaryBadge: {
    backgroundColor: '#E8F5E9',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 4
  },
  primaryBadgeText: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#2E7D32'
  },
  contactDeleteBtn: {
    padding: 8
  },
  deleteIcon: {
    fontSize: 20,
    color: '#E53E3E'
  },
  fab: {
    marginHorizontal: 16,
    marginBottom: 20,
    marginTop: 16
  },
  fabText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14
  },
  input: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 12,
    fontSize: 14
  },
  relationshipSelect: {
    marginBottom: 16
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8
  },
  relationshipOption: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    marginBottom: 8
  },
  relationshipOptionSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  relationshipText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500'
  },
  relationshipTextSelected: {
    color: '#FFF'
  },

  // Incident Reporting Styles
  incidentHeader: {
    padding: 20,
    backgroundColor: '#FF6B35',
    paddingTop: 40
  },
  incidentHeaderTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFF'
  },
  incidentHeaderSubtitle: {
    fontSize: 13,
    color: '#FFE0CC',
    marginTop: 4
  },
  recentIncidents: {
    margin: 16,
    backgroundColor: '#FFF',
    padding: 12,
    borderRadius: 8
  },
  recentIncidentsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10
  },
  noRecentIncidents: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic'
  },
  incidentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  severityIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 12
  },
  incidentItemContent: {
    flex: 1
  },
  incidentItemType: {
    fontSize: 12,
    fontWeight: '600',
    color: '#333'
  },
  incidentItemDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FF6B35',
    paddingTop: 40
  },
  backButton: {
    fontSize: 14,
    color: '#FFF',
    fontWeight: '600',
    marginRight: 16
  },
  formTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFF'
  },
  section: {
    padding: 16
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10
  },
  typeOption: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    marginBottom: 8,
    backgroundColor: '#FFF'
  },
  typeOptionSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  typeOptionText: {
    fontSize: 13,
    color: '#333',
    fontWeight: '500'
  },
  typeOptionTextSelected: {
    color: '#FFF'
  },
  severityGrid: {
    flexDirection: 'row',
    gap: 8
  },
  severityButton: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 6,
    alignItems: 'center',
    backgroundColor: '#FFF'
  },
  severityButtonSelected: {
    backgroundColor: '#FF6B35',
    borderColor: '#FF6B35'
  },
  severityButtonText: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500'
  },
  severityButtonTextSelected: {
    color: '#FFF'
  },
  descriptionInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
    backgroundColor: '#FFF'
  },

  // Safety Profile Styles
  safetyScoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    margin: 16,
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 12,
    elevation: 3
  },
  scoreCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  scoreValue: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#333'
  },
  scoreLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4
  },
  scoreBadge: {
    flex: 1,
    marginLeft: 20
  },
  badgeText: {
    fontSize: 28,
    fontWeight: 'bold'
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginBottom: 16
  },
  statCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginBottom: 12
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FF6B35'
  },
  statLabel: {
    fontSize: 12,
    color: '#999',
    marginTop: 4
  },
  noData: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic'
  },
  incidentListItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEE'
  },
  incidentListType: {
    fontSize: 13,
    fontWeight: '600',
    color: '#333'
  },
  incidentListDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 2
  },

  // Button Styles
  button: {
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 16,
    marginBottom: 12
  },
  buttonPrimary: {
    backgroundColor: '#FF6B35'
  },
  buttonSecondary: {
    backgroundColor: '#E0E0E0'
  },
  buttonCancel: {
    backgroundColor: '#E53E3E',
    marginBottom: 20
  },
  buttonText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 14
  },
  buttonSecondaryText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14
  },
  buttonCancelText: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16
  }
});
