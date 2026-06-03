import React, { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ScrollView, ActivityIndicator, Alert } from 'react-native';
import { driverAPI } from '@/services/apiClient';

const DriverDebugPage: React.FC = () => {
  const [driverId, setDriverId] = useState('');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<any>(null);

  const run = async (fn: () => Promise<any>) => {
    try {
      setLoading(true);
      const res = await fn();
      setResponse(res);
    } catch (err: any) {
      console.error(err);
      setResponse({ error: err?.message || err });
      Alert.alert('Error', String(err?.message || err));
    } finally {
      setLoading(false);
    }
  };

  const handleLoadStatus = () => {
    if (!driverId) { Alert.alert('Driver ID required'); return; }
    run(() => driverAPI.getAvailability(driverId));
  };

  const handleToggleOnline = (value: boolean) => {
    if (!driverId) { Alert.alert('Driver ID required'); return; }
    run(() => driverAPI.setAvailability(driverId, { is_available: value }));
  };

  const handleStartShift = () => {
    if (!driverId) { Alert.alert('Driver ID required'); return; }
    run(() => driverAPI.startShift(driverId, { latitude: 0, longitude: 0 }));
  };

  const handleEndShift = () => {
    if (!driverId) { Alert.alert('Driver ID required'); return; }
    run(() => driverAPI.endShift(driverId, { earnings_today: 0, rides_completed: 0 }));
  };

  const handleUpdateAvailability = () => {
    if (!driverId) { Alert.alert('Driver ID required'); return; }
    run(() => driverAPI.updateAvailability({ driver_id: driverId, is_available: true }));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Driver Debug</Text>

      <TextInput
        placeholder="Driver ID (ObjectId)"
        value={driverId}
        onChangeText={setDriverId}
        style={styles.input}
        autoCapitalize="none"
      />

      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={handleLoadStatus}>
          <Text style={styles.buttonText}>Load Status</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => handleToggleOnline(true)}>
          <Text style={styles.buttonText}>Set Online</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => handleToggleOnline(false)}>
          <Text style={styles.buttonText}>Set Offline</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.button} onPress={handleStartShift}>
          <Text style={styles.buttonText}>Start Shift</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleEndShift}>
          <Text style={styles.buttonText}>End Shift</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={handleUpdateAvailability}>
          <Text style={styles.buttonText}>PUT /api/drivers/availability</Text>
        </TouchableOpacity>
      </View>

      {loading && <ActivityIndicator style={{ marginTop: 16 }} size="large" color="#4ECDC4" />}

      <View style={styles.output}>
        <Text style={styles.outputTitle}>Response</Text>
        <Text style={styles.outputText}>{response ? JSON.stringify(response, null, 2) : 'No response yet'}</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 16, backgroundColor: '#fff', minHeight: '100%' },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  button: { flex: 1, backgroundColor: '#4ECDC4', padding: 10, marginHorizontal: 4, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: 'white', fontWeight: '600' },
  output: { marginTop: 16, backgroundColor: '#f7f7f7', padding: 12, borderRadius: 6 },
  outputTitle: { fontWeight: '700', marginBottom: 8 },
  outputText: { fontFamily: 'monospace' },
});

export default DriverDebugPage;
