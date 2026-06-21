import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Text, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { useReceiptGeneration, Receipt } from '../hooks/useReceiptGeneration';
import { MaterialIcons } from '@expo/vector-icons';

interface ReceiptDetailScreenProps {
  token: string | null;
  userId: string;
  userType: string;
}

export const ReceiptDetailScreen: React.FC<ReceiptDetailScreenProps> = ({ token, userId }) => {
  const { receipts, loading, error, getReceiptHistory, downloadReceipt, emailReceipt } = useReceiptGeneration(token, userId);
  const [selectedReceipt, setSelectedReceipt] = useState<Receipt | null>(null);
  const [emailModalVisible, setEmailModalVisible] = useState(false);
  const [emailAddress, setEmailAddress] = useState('');

  useEffect(() => {
    getReceiptHistory();
  }, []);

  const handleDownload = async (receipt: Receipt) => {
    const success = await downloadReceipt(receipt);
    Alert.alert(success ? 'Success' : 'Error', success ? 'Downloaded' : 'Failed');
  };

  const handleEmailReceipt = async () => {
    if (!selectedReceipt || !emailAddress.trim()) {
      Alert.alert('Error', 'Enter email');
      return;
    }
    const success = await emailReceipt(selectedReceipt, emailAddress);
    setEmailModalVisible(false);
    Alert.alert(success ? 'Sent' : 'Error', success ? 'Receipt sent' : 'Failed');
    setEmailAddress('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Receipts</Text>
      </View>

      {loading && !receipts.length ? (
        <View style={styles.center}>
          <Text>Loading...</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={{ color: '#d32f2f' }}>{error}</Text>
        </View>
      ) : receipts.length === 0 ? (
        <View style={styles.center}>
          <Text>No receipts yet</Text>
        </View>
      ) : (
        <ScrollView style={styles.content}>
          {receipts.map((receipt) => (
            <TouchableOpacity key={receipt.id} style={styles.card} onPress={() => setSelectedReceipt(receipt)}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 'bold' }}>#{receipt.receiptNumber}</Text>
                <Text style={{ color: '#999' }}>{receipt.date}</Text>
              </View>
              <Text style={{ fontSize: 12, color: '#666', marginVertical: 8 }}>{receipt.pickup}</Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#2196F3' }}>${receipt.total.toFixed(2)}</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity onPress={() => handleDownload(receipt)}>
                    <MaterialIcons name="download" size={20} color="#2196F3" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setSelectedReceipt(receipt); setEmailModalVisible(true); }}>
                    <MaterialIcons name="email" size={20} color="#FF6F00" />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <Modal visible={selectedReceipt !== null && !emailModalVisible} transparent onRequestClose={() => setSelectedReceipt(null)}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <TouchableOpacity onPress={() => setSelectedReceipt(null)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            {selectedReceipt && (
              <ScrollView>
                <Text style={{ fontSize: 18, fontWeight: 'bold', marginTop: 8 }}>Receipt</Text>
                <Text style={{ marginTop: 16, color: '#666' }}>From: {selectedReceipt.pickup}</Text>
                <Text style={{ marginTop: 8, color: '#666' }}>To: {selectedReceipt.dropoff}</Text>
                <Text style={{ marginTop: 8, color: '#666' }}>Distance: {selectedReceipt.distance} mi</Text>
                <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12 }}>
                  <Text style={{ color: '#666' }}>Fare: ${selectedReceipt.baseFare.toFixed(2)}</Text>
                  <Text style={{ color: '#666', marginTop: 4 }}>Tolls: ${selectedReceipt.tolls.toFixed(2)}</Text>
                  <Text style={{ color: '#666', marginTop: 4 }}>Tips: ${selectedReceipt.tips.toFixed(2)}</Text>
                  <Text style={{ fontSize: 16, fontWeight: 'bold', marginTop: 12, color: '#2196F3' }}>Total: ${selectedReceipt.total.toFixed(2)}</Text>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={emailModalVisible} transparent onRequestClose={() => setEmailModalVisible(false)}>
        <View style={styles.overlay}>
          <View style={styles.emailModal}>
            <Text style={{ fontSize: 18, fontWeight: 'bold' }}>Email Receipt</Text>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              value={emailAddress}
              onChangeText={setEmailAddress}
              keyboardType="email-address"
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={styles.btnCancel} onPress={() => setEmailModalVisible(false)}>
                <Text style={{ color: '#fff' }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.btnSend} onPress={handleEmailReceipt}>
                <Text style={{ color: '#fff' }}>Send</Text>
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
  header: { backgroundColor: '#2196F3', paddingTop: 40, paddingBottom: 20, paddingHorizontal: 16 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff' },
  content: { flex: 1, padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: { backgroundColor: '#fff', padding: 12, marginBottom: 8, borderRadius: 8 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  modal: { backgroundColor: '#fff', borderRadius: 8, padding: 16, width: '85%', maxHeight: '70%' },
  emailModal: { backgroundColor: '#fff', borderRadius: 8, padding: 16, width: '85%' },
  input: { borderWidth: 1, borderColor: '#ddd', borderRadius: 4, padding: 12, marginVertical: 12 },
  btnCancel: { flex: 1, backgroundColor: '#999', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
  btnSend: { flex: 1, backgroundColor: '#2196F3', paddingVertical: 10, borderRadius: 4, alignItems: 'center' },
});
