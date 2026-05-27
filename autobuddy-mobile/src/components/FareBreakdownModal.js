import React from 'react';
import { Modal, View, Text, TouchableOpacity } from 'react-native';

export default function FareBreakdownModal({ visible, breakdown, onClose }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 320 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Fare Breakdown</Text>
          {breakdown ? (
            Object.entries(breakdown).map(([label, value]) => (
              <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color: '#333' }}>{label}</Text>
                <Text style={{ fontWeight: 'bold' }}>₹{value}</Text>
              </View>
            ))
          ) : (
            <Text>No breakdown data.</Text>
          )}
          <TouchableOpacity onPress={onClose} style={{ marginTop: 16, alignSelf: 'flex-end' }}>
            <Text style={{ color: '#2196F3' }}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
