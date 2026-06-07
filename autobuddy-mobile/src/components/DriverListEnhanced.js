import React, { useMemo } from 'react';
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
  const visibleDrivers = useMemo(() => {
    const source = Array.isArray(drivers) ? drivers : [];
    let next = source;

    if (typeof filterBy === 'function') {
      next = next.filter(filterBy);
    } else if (filterBy && typeof filterBy === 'object') {
      next = next.filter((driver) =>
        Object.entries(filterBy).every(([key, value]) => {
          if (value === undefined || value === null || value === '') {
            return true;
          }
          const actual = driver?.[key];
          if (typeof value === 'string') {
            return String(actual ?? '').toLowerCase().includes(value.toLowerCase());
          }
          return actual === value;
        })
      );
    } else if (filterBy) {
      const query = String(filterBy).trim().toLowerCase();
      next = query
        ? next.filter((driver) =>
            [
              driver?.name,
              driver?.vehicle_make,
              driver?.vehicle_model,
              driver?.vehicle_plate,
              driver?.vehicle_type,
              driver?.vehicle_subtype,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(query))
          )
        : next;
    }

    const sorted = [...next];
    const numeric = (driver, keys) => {
      for (const key of keys) {
        const value = Number(driver?.[key]);
        if (Number.isFinite(value)) {
          return value;
        }
      }
      return 0;
    };

    switch (String(sortBy || '').toLowerCase()) {
      case 'rating':
        sorted.sort((a, b) => numeric(b, ['rating', 'avg_rating']) - numeric(a, ['rating', 'avg_rating']));
        break;
      case 'fare':
      case 'price':
        sorted.sort((a, b) => numeric(a, ['estimated_fare', 'fare', 'price']) - numeric(b, ['estimated_fare', 'fare', 'price']));
        break;
      case 'distance':
        sorted.sort((a, b) => numeric(a, ['distance_km', 'distance']) - numeric(b, ['distance_km', 'distance']));
        break;
      case 'rides':
      case 'experience':
        sorted.sort((a, b) => numeric(b, ['completed_rides', 'total_rides']) - numeric(a, ['completed_rides', 'total_rides']));
        break;
      case 'name':
        sorted.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || '')));
        break;
      default:
        break;
    }

    return sorted;
  }, [drivers, filterBy, sortBy]);

  return (
    <FlatList
      data={visibleDrivers}
      keyExtractor={(d, index) => String(d?.id || d?.user_id || d?._id || index)}
      renderItem={({ item }) => <DriverPreview driver={item} onSelect={onSelect} />}
      ListEmptyComponent={<Text style={{ textAlign: 'center', margin: 24 }}>No drivers found.</Text>}
    />
  );
}
