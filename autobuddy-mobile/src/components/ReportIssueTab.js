import React from 'react';
import { View, Text, TextInput, Button } from 'react-native';

// Report Issue Tab
export function ReportIssueTab({ onSubmit }) {
  const [type, setType] = React.useState('');
  const [desc, setDesc] = React.useState('');
  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontWeight: 'bold' }}>Report an Issue</Text>
      <TextInput placeholder="Issue Type (e.g. Payment, Driver)" value={type} onChangeText={setType} style={{ marginVertical: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }} />
      <TextInput placeholder="Describe the issue" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 60, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }} />
      <Button title="Submit" onPress={() => onSubmit({ type, desc })} />
    </View>
  );
}

// Lost Item Tab
export function LostItemTab({ onSubmit }) {
  const [item, setItem] = React.useState('');
  const [desc, setDesc] = React.useState('');
  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontWeight: 'bold' }}>Report Lost Item</Text>
      <TextInput placeholder="Item Type (e.g. Phone, Wallet)" value={item} onChangeText={setItem} style={{ marginVertical: 8, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }} />
      <TextInput placeholder="Description" value={desc} onChangeText={setDesc} multiline style={{ minHeight: 60, borderWidth: 1, borderColor: '#ccc', borderRadius: 4, padding: 8 }} />
      <Button title="Submit" onPress={() => onSubmit({ item, desc })} />
    </View>
  );
}

// Receipt Tab
export function ReceiptTab({ receipt }) {
  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Receipt</Text>
      {receipt ? (
        <Text>{JSON.stringify(receipt, null, 2)}</Text>
      ) : (
        <Text>No receipt data.</Text>
      )}
    </View>
  );
}
