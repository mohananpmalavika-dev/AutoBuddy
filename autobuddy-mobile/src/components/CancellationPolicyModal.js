import React from 'react';
import { Modal, View, Text, Button } from 'react-native';

export function CancellationPolicyModal({ visible, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 320 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Cancellation Policy</Text>
          <Text style={{ marginBottom: 8 }}>FREE Cancellation: Before driver accepts (Full refund)</Text>
          <Text style={{ marginBottom: 8 }}>PAID Cancellation: After driver accepts (INR 50-100 fee)</Text>
          <Text style={{ marginBottom: 8 }}>NO Cancellation: After driver arrives or trip starts (see details)</Text>
          <Text style={{ marginBottom: 8 }}>Special Cases: Emergency, lost passenger, driver cancels</Text>
          <Button title="Acknowledge & Continue" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

export function CancellationCostBanner({ cost }) {
  return (
    <View style={{ backgroundColor: '#FFF3CD', padding: 10, borderRadius: 6, margin: 8 }}>
      <Text style={{ color: '#856404' }}>Current cancellation cost: <Text style={{ fontWeight: 'bold' }}>₹{cost}</Text></Text>
    </View>
  );
}
