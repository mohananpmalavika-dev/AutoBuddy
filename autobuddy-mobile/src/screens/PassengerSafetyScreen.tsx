import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafetyFeatures, EmergencyContact } from '../hooks/useSafetyFeatures';

interface PassengerSafetyScreenProps {
  token: string | null;
  userId: string;
  currentRideId?: string;
}

export const PassengerSafetyScreen: React.FC<PassengerSafetyScreenProps> = ({
  token,
  userId,
  currentRideId,
}) => {
  const {
    emergencyContacts,
    incidents,
    loading,
    error,
    fetchEmergencyContacts,
    addEmergencyContact,
    removeEmergencyContact,
    triggerSOS,
    reportIncident,
    shareTrip,
    callEmergency,
    getSafetyTips,
  } = useSafetyFeatures(token, userId);

  const [safetyTips, setSafetyTips] = useState<string[]>([]);
  const [showAddContact, setShowAddContact] = useState(false);
  const [showReportIncident, setShowReportIncident] = useState(false);
  const [showShareTrip, setShowShareTrip] = useState(false);
  const [sosTriggered, setSosTriggered] = useState(false);

  const [newContact, setNewContact] = useState({
    name: '',
    phone: '',
    relationship: '',
  });

  const [incidentData, setIncidentData] = useState({
    type: 'safety_concern' as const,
    description: '',
  });

  const [sharePhones, setSharePhones] = useState('');

  useEffect(() => {
    fetchEmergencyContacts();
    loadSafetyTips();
  }, []);

  const loadSafetyTips = async () => {
    const tips = await getSafetyTips();
    setSafetyTips(tips);
  };

  const handleAddContact = async () => {
    if (!newContact.name.trim() || !newContact.phone.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const contact = await addEmergencyContact({
      name: newContact.name,
      phone: newContact.phone,
      relationship: newContact.relationship,
    });

    if (contact) {
      setNewContact({ name: '', phone: '', relationship: '' });
      setShowAddContact(false);
      Alert.alert('Success', 'Emergency contact added');
    }
  };

  const handleRemoveContact = (contactId: string) => {
    Alert.alert('Remove Contact', 'Remove this emergency contact?', [
      { text: 'Cancel' },
      {
        text: 'Remove',
        onPress: async () => {
          await removeEmergencyContact(contactId);
          Alert.alert('Success', 'Contact removed');
        },
        style: 'destructive',
      },
    ]);
  };

  const handleTriggerSOS = async () => {
    if (!currentRideId) {
      Alert.alert('Error', 'No active ride to send SOS');
      return;
    }

    Alert.alert(
      'Emergency SOS',
      'This will alert all your emergency contacts and emergency services. Continue?',
      [
        { text: 'Cancel' },
        {
          text: 'Send SOS',
          onPress: async () => {
            setSosTriggered(true);
            const success = await triggerSOS(currentRideId, {
              lat: 0,
              lng: 0,
            });
            if (success) {
              Alert.alert(
                'SOS Sent',
                'Emergency contacts have been notified. Help is on the way.'
              );
            }
            setSosTriggered(false);
          },
          style: 'destructive',
        },
      ]
    );
  };

  const handleReportIncident = async () => {
    if (!incidentData.description.trim()) {
      Alert.alert('Error', 'Please describe the incident');
      return;
    }

    const incident = await reportIncident({
      type: incidentData.type,
      description: incidentData.description,
      rideId: currentRideId || '',
    });

    if (incident) {
      setIncidentData({ type: 'safety_concern', description: '' });
      setShowReportIncident(false);
      Alert.alert('Success', 'Incident reported. Our team will review it.');
    }
  };

  const handleShareTrip = async () => {
    if (!currentRideId) {
      Alert.alert('Error', 'No active ride to share');
      return;
    }

    if (!sharePhones.trim()) {
      Alert.alert('Error', 'Please enter at least one phone number');
      return;
    }

    const phoneNumbers = (sharePhones ?? '')
      .split(',')
      .map((p) => (p ?? '').trim())
      .filter((p) => (p ?? '').length > 0);

    const share = await shareTrip(currentRideId, phoneNumbers);
    if (share) {
      setSharePhones('');
      setShowShareTrip(false);
      Alert.alert('Success', 'Trip shared. Recipients can track your location in real-time.');
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Emergency SOS Section */}
      <View style={styles.sosSection}>
        <Pressable
          style={[styles.sosButton, sosTriggered && styles.sosButtonTriggered]}
          onPress={handleTriggerSOS}
          disabled={sosTriggered}
        >
          {sosTriggered ? (
            <ActivityIndicator size="large" color="#fff" />
          ) : (
            <>
              <MaterialIcons name="emergency" size={48} color="#fff" />
              <Text style={styles.sosButtonText}>Emergency SOS</Text>
              <Text style={styles.sosButtonSubtext}>
                Alerts emergency contacts instantly
              </Text>
            </>
          )}
        </Pressable>

        {emergencyContacts.length === 0 && (
          <View style={styles.warning}>
            <MaterialIcons name="warning" size={18} color="#FF6F00" />
            <Text style={styles.warningText}>
              No emergency contacts added. Add contacts for SOS alerts.
            </Text>
          </View>
        )}
      </View>

      {/* Quick Actions */}
      <View style={styles.quickActions}>
        <Pressable
          style={styles.quickActionButton}
          onPress={() => setShowReportIncident(true)}
        >
          <MaterialIcons name="report-problem" size={24} color="#F44336" />
          <Text style={styles.quickActionText}>Report Incident</Text>
        </Pressable>

        <Pressable
          style={styles.quickActionButton}
          onPress={() => setShowShareTrip(true)}
          disabled={!currentRideId}
        >
          <MaterialIcons name="share-location" size={24} color="#2196F3" />
          <Text style={styles.quickActionText}>Share Trip</Text>
        </Pressable>
      </View>

      {/* Emergency Contacts */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Emergency Contacts</Text>
          <Pressable onPress={() => setShowAddContact(true)}>
            <MaterialIcons name="add" size={24} color="#2196F3" />
          </Pressable>
        </View>

        {loading && emergencyContacts.length === 0 ? (
          <ActivityIndicator size="large" color="#2196F3" style={{ marginVertical: 20 }} />
        ) : emergencyContacts.length === 0 ? (
          <View style={styles.emptyState}>
            <MaterialIcons name="person-off" size={40} color="#ddd" />
            <Text style={styles.emptyText}>No emergency contacts</Text>
            <Pressable
              style={styles.emptyActionButton}
              onPress={() => setShowAddContact(true)}
            >
              <MaterialIcons name="add" size={18} color="#fff" />
              <Text style={styles.emptyActionText}>Add Contact</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.contactsList}>
            {emergencyContacts.map((contact) => (
              <View key={contact.id} style={styles.contactCard}>
                <View style={styles.contactInfo}>
                  <Text style={styles.contactName}>{contact.name}</Text>
                  <Text style={styles.contactPhone}>{contact.phone}</Text>
                  <Text style={styles.contactRelation}>{contact.relationship}</Text>
                </View>
                <Pressable
                  onPress={() => handleRemoveContact(contact.id)}
                  style={styles.contactRemove}
                >
                  <MaterialIcons name="close" size={20} color="#F44336" />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Recent Incidents */}
      {incidents.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Reports</Text>
          {incidents.slice(0, 3).map((incident) => (
            <View key={incident.id} style={styles.incidentCard}>
              <View
                style={[
                  styles.incidentStatusIndicator,
                  {
                    backgroundColor:
                      incident.status === 'resolved'
                        ? '#4CAF50'
                        : incident.status === 'investigating'
                        ? '#FFC107'
                        : '#2196F3',
                  },
                ]}
              />
              <View style={styles.incidentContent}>
                <Text style={styles.incidentType}>
                  {(incident?.type ?? 'unknown').replace(/_/g, ' ').toUpperCase()}
                </Text>
                <Text style={styles.incidentDescription}>{incident?.description ?? 'No description'}</Text>
                <Text style={styles.incidentDate}>
                  {incident?.createdAt && !isNaN(new Date(incident.createdAt).getTime()) 
                    ? new Date(incident.createdAt).toLocaleDateString() 
                    : 'Date unknown'}
                </Text>
              </View>
              <Text
                style={[
                  styles.incidentStatusText,
                  {
                    color:
                      (incident?.status ?? 'unknown') === 'resolved'
                        ? '#4CAF50'
                        : (incident?.status ?? 'unknown') === 'investigating'
                        ? '#FFC107'
                        : '#2196F3',
                  },
                ]}
              >
                {((incident?.status ?? 'unknown').toUpperCase())}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Safety Tips */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Safety Tips</Text>
        <View style={styles.tipsList}>
          {safetyTips.map((tip, index) => (
            <View key={index} style={styles.tipItem}>
              <MaterialIcons name="lightbulb" size={16} color="#FFC107" />
              <Text style={styles.tipText}>{tip}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>
            {error instanceof Error ? error.message : typeof error === 'string' ? error : 'An error occurred'}
          </Text>
        </View>
      )}

      {/* Add Contact Modal */}
      <Modal visible={showAddContact} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Emergency Contact</Text>
              <Pressable onPress={() => setShowAddContact(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Name</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter name"
                value={newContact.name}
                onChangeText={(text) => setNewContact({ ...newContact, name: text })}
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Phone Number</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter phone number"
                value={newContact.phone}
                onChangeText={(text) => setNewContact({ ...newContact, phone: text })}
                keyboardType="phone-pad"
                placeholderTextColor="#999"
              />

              <Text style={styles.inputLabel}>Relationship</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g., Mother, Father, Friend"
                value={newContact.relationship}
                onChangeText={(text) => setNewContact({ ...newContact, relationship: text })}
                placeholderTextColor="#999"
              />

              <Pressable style={styles.submitButton} onPress={handleAddContact}>
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Add Contact</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Report Incident Modal */}
      <Modal visible={showReportIncident} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Report Incident</Text>
              <Pressable onPress={() => setShowReportIncident(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Incident Type</Text>
              <View style={styles.typeButtons}>
                {(['safety_concern', 'harassment', 'vehicle_issue', 'accident', 'other'] as const).map(
                  (type) => (
                    <Pressable
                      key={type}
                      style={[
                        styles.typeButton,
                        incidentData.type === type && styles.typeButtonActive,
                      ]}
                      onPress={() => setIncidentData({ ...incidentData, type })}
                    >
                      <Text
                        style={[
                          styles.typeButtonText,
                          incidentData.type === type && styles.typeButtonTextActive,
                        ]}
                      >
                        {type.replace(/_/g, ' ')}
                      </Text>
                    </Pressable>
                  )
                )}
              </View>

              <Text style={styles.inputLabel}>Description</Text>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                placeholder="Describe what happened..."
                value={incidentData.description}
                onChangeText={(text) => setIncidentData({ ...incidentData, description: text })}
                multiline
                numberOfLines={4}
                textAlignVertical="top"
                placeholderTextColor="#999"
              />

              <Pressable style={styles.submitButton} onPress={handleReportIncident}>
                <MaterialIcons name="send" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Submit Report</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Share Trip Modal */}
      <Modal visible={showShareTrip} transparent animationType="slide">
        <View style={styles.modal}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Share Trip Location</Text>
              <Pressable onPress={() => setShowShareTrip(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.inputLabel}>Phone Numbers</Text>
              <Text style={styles.inputSubtext}>
                Separate multiple numbers with commas
              </Text>
              <TextInput
                style={[styles.input, styles.descriptionInput]}
                placeholder="e.g., +1234567890, +0987654321"
                value={sharePhones}
                onChangeText={setSharePhones}
                keyboardType="phone-pad"
                multiline
                placeholderTextColor="#999"
              />

              <View style={styles.shareInfo}>
                <MaterialIcons name="info" size={16} color="#2196F3" />
                <Text style={styles.shareInfoText}>
                  Recipients will receive your real-time location for the duration of this trip
                </Text>
              </View>

              <Pressable style={styles.submitButton} onPress={handleShareTrip}>
                <MaterialIcons name="share-location" size={18} color="#fff" />
                <Text style={styles.submitButtonText}>Share Location</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  sosSection: {
    paddingHorizontal: 16,
    paddingVertical: 20,
  },
  sosButton: {
    backgroundColor: '#F44336',
    paddingVertical: 32,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sosButtonTriggered: {
    backgroundColor: '#FF5722',
  },
  sosButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginTop: 12,
  },
  sosButtonSubtext: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 4,
  },
  warning: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3E0',
    borderRadius: 6,
  },
  warningText: {
    flex: 1,
    fontSize: 12,
    color: '#E65100',
  },
  quickActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  quickActionButton: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
  },
  quickActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#000',
  },
  section: {
    marginHorizontal: 16,
    marginBottom: 20,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#000',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 13,
    color: '#999',
    marginTop: 8,
    marginBottom: 12,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  emptyActionText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  contactsList: {
    gap: 8,
  },
  contactCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  contactPhone: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  contactRelation: {
    fontSize: 10,
    color: '#999',
    marginTop: 1,
  },
  contactRemove: {
    padding: 4,
  },
  incidentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
    marginBottom: 8,
  },
  incidentStatusIndicator: {
    width: 4,
    height: 60,
    borderRadius: 2,
  },
  incidentContent: {
    flex: 1,
  },
  incidentType: {
    fontSize: 11,
    fontWeight: '700',
    color: '#000',
  },
  incidentDescription: {
    fontSize: 11,
    color: '#666',
    marginTop: 2,
  },
  incidentDate: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  incidentStatusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  tipsList: {
    gap: 8,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f9f9f9',
    borderRadius: 6,
  },
  tipText: {
    flex: 1,
    fontSize: 12,
    color: '#333',
    lineHeight: 16,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 6,
    marginTop: 12,
  },
  inputSubtext: {
    fontSize: 11,
    color: '#999',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
  },
  descriptionInput: {
    textAlignVertical: 'top',
  },
  typeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  typeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#f0f0f0',
    borderRadius: 16,
  },
  typeButtonActive: {
    backgroundColor: '#2196F3',
  },
  typeButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  shareInfo: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#E3F2FD',
    borderRadius: 6,
  },
  shareInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#1565C0',
    lineHeight: 14,
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
});

export default PassengerSafetyScreen;
