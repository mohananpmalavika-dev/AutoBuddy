/**
 * Ride Product Selector Component
 * Location: autobuddy-mobile/src/screens/components/RideProductSelector.tsx
 *
 * Purpose: Allow users to select ride variants (Standard, Premium) with pricing
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  FlatList,
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator
} from 'react-native';
import { vehicleTypesAPI } from '../../services/apiClient';

interface RideProduct {
  id: number | string;
  vehicle_type_id?: number;
  product_name: string;
  product_code: string;
  description: string;
  price_multiplier: number;
  is_active: boolean;
}

interface RideProductSelectorProps {
  vehicleTypeId: number;
  onSelect: (product: RideProduct) => void;
  selectedId?: number | string;
  baseFare: number;
}

export const RideProductSelector: React.FC<RideProductSelectorProps> = ({
  vehicleTypeId,
  onSelect,
  selectedId,
  baseFare
}) => {
  const [products, setProducts] = useState<RideProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRideProducts = useCallback(async () => {
    if (!vehicleTypeId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await vehicleTypesAPI.getRideProducts(vehicleTypeId);
      const nextProducts = Array.isArray(response) ? response : response.products || response.data || [];

      setProducts(nextProducts);
    } catch (err) {
      setError('Failed to load ride products');
      console.error('Error fetching ride products:', err);
    } finally {
      setLoading(false);
    }
  }, [vehicleTypeId]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      fetchRideProducts();
    }, 0);
    return () => clearTimeout(timeout);
  }, [fetchRideProducts]);

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="small" color="#1F97D4" />
      </View>
    );
  }

  if (error || products.length === 0) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Select Ride Type</Text>

      <FlatList
        data={products}
        keyExtractor={(item) => item.id.toString()}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        renderItem={({ item }) => {
          const adjustedFare = baseFare * item.price_multiplier;

          return (
            <TouchableOpacity
              style={[
                styles.productCard,
                selectedId?.toString() === item.id.toString() && styles.selectedCard
              ]}
              onPress={() => onSelect(item)}
              activeOpacity={0.7}
            >
              <View style={styles.nameRow}>
                <Text style={styles.productName}>
                  {item.product_name}
                </Text>
                {item.price_multiplier > 1 && (
                  <View style={styles.premiumBadge}>
                    <Text style={styles.premiumBadgeText}>Premium</Text>
                  </View>
                )}
              </View>

              <Text style={styles.descriptionText}>
                {item.description}
              </Text>

              <View style={styles.priceSection}>
                <Text style={styles.priceLabel}>Est. Fare:</Text>
                <Text style={styles.priceValue}>
                  ₹{adjustedFare.toFixed(2)}
                </Text>
              </View>

              {item.price_multiplier > 1 && (
                <View style={styles.multiplierInfo}>
                  <Text style={styles.multiplierText}>
                    {item.price_multiplier}x multiplier
                  </Text>
                </View>
              )}

              {selectedId?.toString() === item.id.toString() && (
                <View style={styles.checkmark}>
                  <Text style={styles.checkmarkText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#2C3E50',
    marginBottom: 12,
  },
  scrollContent: {
    paddingHorizontal: 0,
  },
  productCard: {
    width: 160,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    borderWidth: 2,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
    justifyContent: 'space-between',
  },
  selectedCard: {
    borderColor: '#1F97D4',
    backgroundColor: '#F0F7FF',
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  productName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#2C3E50',
    flex: 1,
  },
  premiumBadge: {
    backgroundColor: '#F39C12',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 4,
  },
  premiumBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  descriptionText: {
    fontSize: 11,
    color: '#7F8C8D',
    marginBottom: 8,
  },
  priceSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECF0F1',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 11,
    color: '#95A5A6',
    fontWeight: '500',
  },
  priceValue: {
    fontSize: 14,
    fontWeight: '700',
    color: '#27AE60',
  },
  multiplierInfo: {
    backgroundColor: '#FEF5E7',
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    marginBottom: 8,
  },
  multiplierText: {
    fontSize: 10,
    color: '#D68910',
    fontWeight: '600',
    textAlign: 'center',
  },
  checkmark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    backgroundColor: '#27AE60',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkmarkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
