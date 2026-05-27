import React, { useMemo } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { COLORS } from '../theme';

/**
 * FareBreakdown - Detailed fare breakdown component
 * 
 * Shows:
 * - Base fare
 * - Distance charge
 * - Time charge
 * - Surge multiplier with explanation
 * - Taxes
 * - Promotions
 * - Final total
 */

// Sub-component: Surge Explanation Box
function SurgeExplanation({ surgeMultiplier, surgeLongText }) {
  if (surgeMultiplier <= 1) return null;
  
  return (
    <View style={styles.surgeBox}>
      <Text style={styles.surgeIcon}>📈</Text>
      <View style={styles.surgeContent}>
        <Text style={styles.surgeTitle}>Dynamic Pricing Active</Text>
        <Text style={styles.surgeText}>
          {surgeLongText || 'High demand in this area increases the fare'}
        </Text>
        <Text style={styles.surgeMultiplier}>{surgeMultiplier}x multiplier</Text>
      </View>
    </View>
  );
}

// Sub-component: Promotions Section
function PromoSection({ promos }) {
  if (promos.length === 0) return null;
  
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Promotions Applied</Text>
      {promos.map((promo, idx) => (
        <View key={idx} style={styles.itemRow}>
          <Text style={styles.itemLabel}>
            {promo.label || promo.code || `Promo ${idx + 1}`}
          </Text>
          <Text style={[styles.itemValue, styles.promoValue]}>
            -₹{Number(promo.discount || 0).toFixed(2)}
          </Text>
        </View>
      ))}
    </View>
  );
}

export default function FareBreakdown({
  booking = {},
  estimatedFare = 0,
  finalFare = 0,
  distance = 0,
  duration = 0,
  surgeMultiplier = 1,
  surgeLongText = '',
  promos = [],
  taxes = 0,
  modal = false,
  onClose,
}) {
  // Typical rates (these should ideally come from backend config)
  const RATES = useMemo(() => ({
    baseFare: 25,
    perKmRate: 12,
    perMinRate: 2,
  }), []);

  // Calculate breakdown
  const breakdown = useMemo(() => {
    const baseFare = RATES.baseFare;
    const distanceCharge = distance * RATES.perKmRate;
    const timeCharge = duration * RATES.perMinRate;
    const subtotal = baseFare + distanceCharge + timeCharge;
    const surgeAmount = (subtotal * (surgeMultiplier - 1));
    const promoDiscount = promos.reduce((sum, p) => sum + (Number(p.discount || 0) || 0), 0);
    
    return {
      baseFare: Number(baseFare || 0).toFixed(2),
      distanceCharge: Number(distanceCharge || 0).toFixed(2),
      timeCharge: Number(timeCharge || 0).toFixed(2),
      subtotal: Number(subtotal || 0).toFixed(2),
      surgeMultiplier,
      surgeAmount: Number(surgeAmount || 0).toFixed(2),
      beforeTax: Number(subtotal + surgeAmount || 0).toFixed(2),
      promoDiscount: Number(promoDiscount || 0).toFixed(2),
      taxes: Number(taxes || 0).toFixed(2),
      total: Number(finalFare || estimatedFare || 0).toFixed(2),
    };
  }, [distance, duration, surgeMultiplier, promos, taxes, finalFare, estimatedFare, RATES]);

  const content = (
    <ScrollView
      style={styles.content}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.contentContainer}>
      {/* Ride Details */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Trip Details</Text>
        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>Distance</Text>
          <Text style={styles.itemValue}>{Number(distance).toFixed(1)} km</Text>
        </View>
        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>Duration</Text>
          <Text style={styles.itemValue}>{Math.round(duration)} mins</Text>
        </View>
      </View>

      {/* Base Breakdown */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Fare Calculation</Text>
        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>
            Base Fare
            <Text style={styles.hint}> (Starting charge)</Text>
          </Text>
          <Text style={styles.itemValue}>₹{breakdown.baseFare}</Text>
        </View>

        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>
            Distance Charge
            <Text style={styles.hint}> ({Number(distance).toFixed(1)} km × ₹{RATES.perKmRate}/km)</Text>
          </Text>
          <Text style={styles.itemValue}>₹{breakdown.distanceCharge}</Text>
        </View>

        <View style={styles.itemRow}>
          <Text style={styles.itemLabel}>
            Time Charge
            <Text style={styles.hint}> ({Math.round(duration)} min × ₹{RATES.perMinRate}/min)</Text>
          </Text>
          <Text style={styles.itemValue}>₹{breakdown.timeCharge}</Text>
        </View>

        <View style={[styles.itemRow, styles.subtotalRow]}>
          <Text style={styles.subtotalLabel}>Subtotal</Text>
          <Text style={styles.subtotalValue}>₹{breakdown.subtotal}</Text>
        </View>
      </View>

      {/* Surge Pricing */}
      {surgeMultiplier > 1 && (
        <>
          <SurgeExplanation surgeMultiplier={surgeMultiplier} surgeLongText={surgeLongText} />
          <View style={styles.section}>
            <View style={styles.itemRow}>
              <Text style={styles.itemLabel}>
                Surge Charge ({surgeMultiplier}x)
                <Text style={styles.hint}> (Additional fee)</Text>
              </Text>
              <Text style={[styles.itemValue, styles.surgeValue]}>₹{breakdown.surgeAmount}</Text>
            </View>
            <View style={[styles.itemRow, styles.subtotalRow]}>
              <Text style={styles.subtotalLabel}>After Surge</Text>
              <Text style={styles.subtotalValue}>₹{breakdown.beforeTax}</Text>
            </View>
          </View>
        </>
      )}

      {/* Promotions */}
      <PromoSection promos={promos} />

      {/* Taxes */}
      {Number(breakdown.taxes) > 0 && (
        <View style={styles.section}>
          <View style={styles.itemRow}>
            <Text style={styles.itemLabel}>
              Taxes (GST)
              <Text style={styles.hint}> (18%)</Text>
            </Text>
            <Text style={styles.itemValue}>₹{breakdown.taxes}</Text>
          </View>
        </View>
      )}

      {/* Final Total */}
      <View style={[styles.section, styles.totalSection]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>
            {finalFare > estimatedFare ? 'Final Fare' : 'Estimated Fare'}
          </Text>
          <Text style={styles.totalValue}>₹{breakdown.total}</Text>
        </View>
        {finalFare > estimatedFare && (
          <Text style={styles.fareNote}>
            Final amount based on actual distance and time
          </Text>
        )}
      </View>

      {/* Disclaimer */}
      <View style={styles.disclaimerBox}>
        <Text style={styles.disclaimerIcon}>ℹ️</Text>
        <Text style={styles.disclaimerText}>
          Estimated fare is calculated at booking. Final fare may vary based on actual route, traffic, and time taken.
        </Text>
      </View>

      <View style={{ height: 16 }} />
    </ScrollView>
  );

  if (modal) {
    return (
      <Modal
        visible={modal}
        transparent
        animationType="slide"
        onRequestClose={onClose}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Fare Breakdown</Text>
              <TouchableOpacity onPress={onClose}>
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>
            {content}
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <View style={styles.container}>
      {content}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    overflow: 'hidden',
  },

  content: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 12,
    paddingVertical: 12,
  },

  // Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    flex: 0.9,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EFEFEF',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  modalCloseIcon: {
    fontSize: 20,
    color: COLORS.textMuted,
  },

  // Sections
  section: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMuted,
    textTransform: 'uppercase',
    marginBottom: 10,
    letterSpacing: 0.5,
  },

  // Items
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 6,
  },
  itemLabel: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '500',
    flex: 1,
  },
  hint: {
    fontSize: 10,
    color: COLORS.textMuted,
    fontWeight: '400',
  },
  itemValue: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  promoValue: {
    color: '#4CAF50',
  },
  surgeValue: {
    color: '#FF9800',
  },

  // Subtotal
  subtotalRow: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
    backgroundColor: '#FAFAFA',
    paddingHorizontal: 8,
  },
  subtotalLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  subtotalValue: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
  },

  // Total
  totalSection: {
    borderTopWidth: 2,
    borderTopColor: COLORS.primary,
    backgroundColor: '#E3F2FD',
    marginHorizontal: -12,
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  totalValue: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.primary,
  },
  fareNote: {
    fontSize: 10,
    color: COLORS.textMuted,
    marginTop: 8,
    fontStyle: 'italic',
  },

  // Surge Box
  surgeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: '#FFF3E0',
    borderLeftWidth: 3,
    borderLeftColor: '#FF9800',
    borderRadius: 6,
  },
  surgeIcon: {
    fontSize: 16,
    marginRight: 10,
    marginTop: 2,
  },
  surgeContent: {
    flex: 1,
  },
  surgeTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#F57C00',
    marginBottom: 4,
  },
  surgeText: {
    fontSize: 11,
    color: '#E65100',
    lineHeight: 15,
    marginBottom: 6,
  },
  surgeMultiplier: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FF9800',
  },

  // Disclaimer
  disclaimerBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginHorizontal: -12,
    marginBottom: -12,
    backgroundColor: '#E3F2FD',
    borderTopWidth: 1,
    borderTopColor: '#EFEFEF',
  },
  disclaimerIcon: {
    fontSize: 14,
    marginRight: 8,
    marginTop: 2,
  },
  disclaimerText: {
    fontSize: 10,
    color: '#1976D2',
    lineHeight: 14,
    flex: 1,
  },
});
