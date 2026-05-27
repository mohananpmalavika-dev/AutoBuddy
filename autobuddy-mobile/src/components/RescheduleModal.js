import React from 'react';
import { Modal, View, Text, Button, TextInput } from 'react-native';

export function RescheduleModal({ visible, onReschedule, onClose }) {
  const [newTime, setNewTime] = React.useState('');
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 320 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Reschedule Ride</Text>
          <TextInput placeholder="New time (e.g. 18:30)" value={newTime} onChangeText={setNewTime} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 12 }} />
          <Button title="Reschedule" onPress={() => onReschedule(newTime)} />
          <Button title="Cancel" onPress={onClose} color="#888" />
        </View>
      </View>
    </Modal>
  );
}

export function AddStopModal({ visible, onAddStop, onClose }) {
  const [location, setLocation] = React.useState('');
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 320 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Add Stop</Text>
          <TextInput placeholder="Stop location" value={location} onChangeText={setLocation} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 12 }} />
          <Button title="Add Stop" onPress={() => onAddStop(location)} />
          <Button title="Cancel" onPress={onClose} color="#888" />
        </View>
      </View>
    </Modal>
  );
}

export function EditDestinationModal({ visible, onEdit, onClose }) {
  const [destination, setDestination] = React.useState('');
  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 24, width: 320 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 12 }}>Edit Destination</Text>
          <TextInput placeholder="New destination" value={destination} onChangeText={setDestination} style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8, marginBottom: 12 }} />
          <Button title="Update Destination" onPress={() => onEdit(destination)} />
          <Button title="Cancel" onPress={onClose} color="#888" />
        </View>
      </View>
    </Modal>
  );
}
