import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Text, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useInsuranceCoverage } from '../hooks/useInsuranceCoverage';
import { MaterialIcons } from '@expo/vector-icons';

interface Props {
  token: string | null;
  userId: string;
  userType: string;
}

export const InsuranceCoverageScreen: React.FC<Props> = ({ token, userId }) => {
  const { coverage, claims, getCoverageDetails, getActiveClaims, fileInsuranceClaim, getPendingClaimsCount } = useInsuranceCoverage(token, userId);
  const [tab, setTab] = useState('coverage');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ rideId: '', type: '', description: '', amount: '' });

  useEffect(() => {
    getCoverageDetails();
    getActiveClaims();
  }, []);

  const submit = async () => {
    if (!form.rideId || !form.type || !form.amount) {
      Alert.alert('Error', 'Fill all fields');
      return;
    }
    const ok = await fileInsuranceClaim(form.rideId, form.type, form.description, parseFloat(form.amount));
    if (ok) {
      Alert.alert('Success', 'Claim filed');
      setModal(false);
      setForm({ rideId: '', type: '', description: '', amount: '' });
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Insurance</Text>
      </View>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, tab === 'coverage' && styles.activeTab]} onPress={() => setTab('coverage')}>
          <Text style={tab === 'coverage' ? styles.activeText : styles.text}>Coverage</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, tab === 'claims' && styles.activeTab]} onPress={() => setTab('claims')}>
          <Text style={tab === 'claims' ? styles.activeText : styles.text}>Claims</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={styles.content}>
        {tab === 'coverage' && coverage && (
          <>
            <View style={styles.card}>
              <Text style={styles.label}>Policy #{coverage.policyNumber}</Text>
              <Text style={styles.value}>{coverage.provider}</Text>
              <Text style={[styles.status, { color: coverage.status === 'active' ? '#4caf50' : '#f44336' }]}>
                {coverage.status}
              </Text>
            </View>
            {coverage.coverages.map(c => (
              <View key={c.id} style={styles.card}>
                <Text style={styles.cardTitle}>{c.name}</Text>
                <Text style={styles.cardText}>Limit: ${c.limit}</Text>
                <Text style={styles.cardText}>Deductible: ${c.deductible}</Text>
              </View>
            ))}
          </>
        )}
        {tab === 'claims' && (
          <>
            <View style={styles.statsCard}>
              <Text style={styles.statValue}>{getPendingClaimsCount()}</Text>
              <Text style={styles.statLabel}>Pending Claims</Text>
            </View>
            <TouchableOpacity style={styles.btn} onPress={() => setModal(true)}>
              <MaterialIcons name="add" size={20} color="#fff" />
              <Text style={styles.btnText}>File New Claim</Text>
            </TouchableOpacity>
            {claims.map(c => (
              <View key={c.id} style={styles.card}>
                <Text style={styles.cardTitle}>{c.claimType}</Text>
                <Text style={styles.cardText}>Amount: ${c.amount}</Text>
                <Text style={styles.cardText}>Status: {c.status}</Text>
              </View>
            ))}
          </>
        )}
      </ScrollView>
      <Modal visible={modal} transparent onRequestClose={() => setModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>File Insurance Claim</Text>
            <TextInput style={styles.input} placeholder="Ride ID" value={form.rideId} onChangeText={v => setForm({ ...form, rideId: v })} />
            <TextInput style={styles.input} placeholder="Claim Type" value={form.type} onChangeText={v => setForm({ ...form, type: v })} />
            <TextInput style={[styles.input, { height: 80 }]} placeholder="Description" multiline value={form.description} onChangeText={v => setForm({ ...form, description: v })} />
            <TextInput style={styles.input} placeholder="Amount" keyboardType="decimal-pad" value={form.amount} onChangeText={v => setForm({ ...form, amount: v })} />
            <View style={styles.actions}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setModal(false)}>
                <Text style={styles.btnText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnOk} onPress={submit}>
                <Text style={styles.btnText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  header: { backgroundColor: '#2196F3', paddingTop: 40, paddingBottom: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  tabs: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#eee' },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  activeTab: { borderBottomColor: '#2196F3' },
  text: { fontSize: 14, color: '#999' },
  activeText: { fontSize: 14, color: '#2196F3', fontWeight: '600' },
  content: { flex: 1, padding: 12 },
  card: { backgroundColor: '#fff', padding: 12, marginBottom: 8, borderRadius: 8 },
  label: { fontSize: 12, color: '#999' },
  value: { fontSize: 16, fontWeight: 'bold', color: '#333', marginTop: 4 },
  status: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  cardTitle: { fontSize: 14, fontWeight: 'bold', color: '#333' },
  cardText: { fontSize: 12, color: '#666', marginTop: 4 },
  statsCard: { backgroundColor: '#fff', padding: 16, marginBottom: 12, borderRadius: 8, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: 'bold', color: '#2196F3' },
  statLabel: { fontSize: 14, color: '#666', marginTop: 4 },
  btn: { backgroundColor: '#2196F3', flexDirection: 'row', padding: 12, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  btnText: { color: '#fff', fontWeight: '600', marginLeft: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 8, padding: 16, width: '90%', maxHeight: '80%' },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#333' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 12, marginBottom: 12, fontSize: 14 },
  actions: { flexDirection: 'row', gap: 8 },
  btnCancel: { flex: 1, backgroundColor: '#999', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
  btnOk: { flex: 1, backgroundColor: '#2196F3', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
});
