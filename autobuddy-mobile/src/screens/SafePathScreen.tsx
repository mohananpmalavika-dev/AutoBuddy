import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, TextInput, Platform } from 'react-native';
import WebLeafletMap from '../components/WebLeafletMap';
import SafePathReportModal from '../components/SafePathReportModal';
import { apiRequest } from '../lib/api';

export default function SafePathScreen({ onClose }) {
  const [mode, setMode] = useState<'walking'|'cycling'|'driving'>('walking');
  const [originLat, setOriginLat] = useState('13.0827');
  const [originLng, setOriginLng] = useState('80.2707');
  const [destLat, setDestLat] = useState('13.0850');
  const [destLng, setDestLng] = useState('80.2700');
  const [routes, setRoutes] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportLocation, setReportLocation] = useState({ latitude: Number(originLat), longitude: Number(originLng) });
  const [userId, setUserId] = useState('passenger_user'); // In real app, get from auth context

  const performRoute = async () => {
    const payload = {
      origin: { latitude: Number(originLat), longitude: Number(originLng) },
      destination: { latitude: Number(destLat), longitude: Number(destLng) },
      mode,
      alternatives: 2,
    };
    try {
      setLoading(true);
      const res = await apiRequest('/api/safepath/route', { method: 'POST', body: JSON.stringify(payload) });
      setRoutes(res.routes || []);
    } catch (e) {
      console.error('SafeRoute error', e);
      alert('Failed to compute safe routes');
    } finally {
      setLoading(false);
    }
  };

  const hazardMarkers = [];
  // Optionally add route geometries as markers
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>SafePath — Walking & Cycling</Text>
        <TouchableOpacity onPress={onClose}><Text style={styles.close}>Close</Text></TouchableOpacity>
      </View>
      <View style={styles.controls}>
        <View style={styles.modeRow}>
          <TouchableOpacity onPress={() => setMode('walking')} style={[styles.modeButton, mode==='walking' && styles.modeActive]}><Text>Walking</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('cycling')} style={[styles.modeButton, mode==='cycling' && styles.modeActive]}><Text>Cycling</Text></TouchableOpacity>
          <TouchableOpacity onPress={() => setMode('driving')} style={[styles.modeButton, mode==='driving' && styles.modeActive]}><Text>Driving</Text></TouchableOpacity>
        </View>
        <View style={styles.row}>
          <TextInput value={originLat} onChangeText={setOriginLat} style={styles.input} keyboardType='numeric' />
          <TextInput value={originLng} onChangeText={setOriginLng} style={styles.input} keyboardType='numeric' />
          <Text style={styles.hint}>Origin</Text>
        </View>
        <View style={styles.row}>
          <TextInput value={destLat} onChangeText={setDestLat} style={styles.input} keyboardType='numeric' />
          <TextInput value={destLng} onChangeText={setDestLng} style={styles.input} keyboardType='numeric' />
          <Text style={styles.hint}>Destination</Text>
        </View>
        <TouchableOpacity onPress={performRoute} style={styles.computeButton} disabled={loading}><Text style={{color:'#fff'}}>{loading ? 'Computing...' : 'Compute Safe Routes'}</Text></TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <WebLeafletMap
          defaultCenter={{ latitude: Number(originLat), longitude: Number(originLng) }}
          pickupLocation={{ latitude: Number(originLat), longitude: Number(originLng) }}
          dropoffLocation={{ latitude: Number(destLat), longitude: Number(destLng) }}
          hazardMarkers={hazardMarkers}
          showReportButton={true}
          onReportPress={() => {
            setReportLocation({ latitude: Number(originLat), longitude: Number(originLng) });
            setShowReportModal(true);
          }}
        />
      </View>

      <View style={styles.routesPanel}>
        {routes.map((r) => (
          <View key={r.id} style={styles.routeRow}>
            <Text style={styles.routeName}>{r.name}</Text>
            <Text style={styles.routeMeta}>{r.distance_km} km — Risk {r.risk_score} ({r.risk_level})</Text>
          </View>
        ))}
      </View>

      <SafePathReportModal
        visible={showReportModal}
        onClose={() => setShowReportModal(false)}
        location={reportLocation}
        userId={userId}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', height: '100%' },
  header: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, alignItems: 'center' },
  title: { fontWeight: '900' },
  close: { color: '#0078FF' },
  controls: { padding: 8, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  modeButton: { padding: 8, borderRadius: 6, backgroundColor: '#F3F3F3' },
  modeActive: { backgroundColor: '#DFF0E0' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  input: { borderWidth: 1, borderColor: '#DDD', padding: 6, borderRadius: 6, width: 120 },
  hint: { marginLeft: 8, color: '#666' },
  computeButton: { backgroundColor: '#0B8F3A', padding: 10, borderRadius: 8, alignItems: 'center', width: 200 },
  routesPanel: { padding: 8, borderTopWidth: 1, borderTopColor: '#EEE' },
  routeRow: { paddingVertical: 6 },
  routeName: { fontWeight: '700' },
  routeMeta: { color: '#666', fontSize: 12 },
});
