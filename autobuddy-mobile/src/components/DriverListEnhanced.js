import React from 'react';
// Use the web DriverPreview for web, native for mobile
import DriverPreviewWeb from './DriverPreview';
import { View, Text, FlatList, TouchableOpacity } from 'react-native';

/**
 * DriverPreview - Shows driver info in the list
 * Props: driver (object), onSelect (function)
 */
// Native DriverPreview for mobile, web DriverPreview for web
export function DriverPreview({ driver, onSelect }) {
  // If running in a web environment, use the web component
  if (typeof document !== 'undefined') {
    return <DriverPreviewWeb driver={driver} />;
  }
  // Otherwise, use the native version
  return (
    <TouchableOpacity onPress={() => onSelect(driver)} style={{ margin: 8, padding: 12, backgroundColor: '#fff', borderRadius: 8, elevation: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {/* Avatar */}
        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: '#eee', marginRight: 12, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ fontSize: 24 }}>{driver.photo ? '🧑' : '👤'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{driver.name}</Text>
          <Text style={{ color: '#888' }}>{driver.vehicle_make} {driver.vehicle_model} ({driver.vehicle_plate})</Text>
          <Text style={{ color: '#666', fontSize: 13 }}>Rating: {driver.rating || '--'} | {driver.completed_rides || 0} rides</Text>
        </View>
        <Text style={{ fontWeight: 'bold', color: '#2196F3' }}>₹{driver.estimated_fare}</Text>
      </View>
    </TouchableOpacity>
  );
}

/**
 * DriverListEnhanced - List of drivers with sorting/filtering/pagination
 * Props: drivers (array), onSelect (function), sortBy, filterBy
 */
export default function DriverListEnhanced({ drivers = [], onSelect, sortBy, filterBy }) {
  // TODO: Implement sorting/filtering logic
  return (
    <FlatList
      data={drivers}
      keyExtractor={d => d.id}
      renderItem={({ item }) => <DriverPreview driver={item} onSelect={onSelect} />}
      ListEmptyComponent={<Text style={{ textAlign: 'center', margin: 24 }}>No drivers found.</Text>}
    />
  );
}
