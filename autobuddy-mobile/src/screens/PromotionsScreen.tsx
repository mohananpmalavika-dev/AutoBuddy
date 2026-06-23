import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  FlatList,
  Clipboard,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePromotionsAndCoupons } from '../hooks/usePromotionsAndCoupons';

interface Coupon {
  id?: string;
  code?: string;
  discount?: number;
  minRideAmount?: number;
  maxDiscount?: number;
  expiryDate?: string;
  [key: string]: unknown;
}

interface PromoScreenProps {
  token: string | null;
  userId: string;
  userType: 'passenger' | 'driver';
  currentRideAmount?: number;
  onCouponSelected?: (coupon: Coupon, discount: number) => void;
}

export const PromotionsScreen: React.FC<PromoScreenProps> = ({
  token,
  userId,
  userType,
  currentRideAmount = 0,
  onCouponSelected,
}) => {
  const {
    validateCoupon,
    applyCoupon,
    checkEligibility,
    getAvailableCouponsForUser,
    getUserCouponStats,
    activePromotions,
    loading,
    error,
  } = usePromotionsAndCoupons(token, userId);

  const [couponCode, setCouponCode] = useState('');
  const [availableCoupons, setAvailableCoupons] = useState([]);
  const [stats, setStats] = useState(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [validationError, setValidationError] = useState('');
  const [selectedCoupon, setSelectedCoupon] = useState(null);

  useEffect(() => {
    const coupons = getAvailableCouponsForUser(userType);
    const userStats = getUserCouponStats();
    setAvailableCoupons(coupons);
    setStats(userStats);
  }, [getAvailableCouponsForUser, getUserCouponStats, userType]);

  const handleValidateCoupon = async () => {
    setValidationError('');
    try {
      if (!couponCode.trim()) {
        setValidationError('Please enter a coupon code');
        return;
      }

      const coupon = await validateCoupon(couponCode, currentRideAmount, userType);

      if (coupon) {
        setSelectedCoupon(coupon);
        setCouponCode('');
        setShowCodeInput(false);

        if (onCouponSelected) {
          const discountedFare = applyCoupon(coupon, currentRideAmount);
          const discount = currentRideAmount - discountedFare;
          onCouponSelected(coupon, discount);
        }

        Alert.alert('Success', `Coupon "${coupon.code}" applied!`);
      }
    } catch (err) {
      setValidationError(`${err}`);
    }
  };

  const checkCouponEligibility = (coupon: Coupon) => {
    return checkEligibility(coupon.id, currentRideAmount, userType);
  };

  const copyCouponCode = (code: string) => {
    Clipboard.setString(code);
    Alert.alert('Copied', `"${code}" copied to clipboard`);
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Selected Coupon */}
        {selectedCoupon && (
          <View style={styles.selectedCouponCard}>
            <View style={styles.selectedCouponHeader}>
              <MaterialIcons name="check_circle" size={28} color="#4CAF50" />
              <Text style={styles.selectedCouponText}>Coupon Applied</Text>
              <Pressable onPress={() => setSelectedCoupon(null)}>
                <MaterialIcons name="close" size={20} color="#999" />
              </Pressable>
            </View>
            <Text style={styles.selectedCouponCode}>{selectedCoupon.code}</Text>
            <Text style={styles.selectedCouponDesc}>{selectedCoupon.description}</Text>
          </View>
        )}

        {/* Stats Section */}
        {stats && (
          <View style={styles.statsSection}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{stats.totalCouponsUsed}</Text>
              <Text style={styles.statLabel}>Coupons Used</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>₹{stats.totalSavings}</Text>
              <Text style={styles.statLabel}>Total Saved</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>₹{Math.round(stats.averageSavingsPerRide)}</Text>
              <Text style={styles.statLabel}>Avg Saving</Text>
            </View>
          </View>
        )}

        {/* Manual Code Input */}
        <Pressable
          onPress={() => setShowCodeInput(true)}
          style={styles.inputButton}
        >
          <MaterialIcons name="confirmation_number" size={20} color="white" />
          <Text style={styles.inputButtonText}>Enter Coupon Code</Text>
        </Pressable>

        {/* Active Promotions */}
        {activePromotions.length > 0 && (
          <View style={styles.promotionsSection}>
            <Text style={styles.sectionTitle}>Active Promotions</Text>

            <FlatList
              data={activePromotions}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.promotionCard}>
                  <View style={styles.promotionHeader}>
                    <MaterialIcons name="local_offer" size={28} color="#FF9800" />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.promotionName}>{item.name}</Text>
                      <Text style={styles.promotionDesc}>{item.description}</Text>
                    </View>
                  </View>

                  {item.coupons.length > 0 && (
                    <FlatList
                      data={item.coupons}
                      keyExtractor={coupon => coupon.id}
                      scrollEnabled={false}
                      renderItem={({ item: coupon }) => {
                        const eligibility = checkCouponEligibility(coupon);
                        return (
                          <View style={styles.couponItem}>
                            <View style={styles.couponCode}>
                              <Text style={styles.couponCodeText}>{coupon.code}</Text>
                              <Pressable onPress={() => copyCouponCode(coupon.code)}>
                                <MaterialIcons name="content_copy" size={16} color="#2196F3" />
                              </Pressable>
                            </View>

                            <View style={styles.couponDetails}>
                              <Text style={styles.couponValue}>
                                {coupon.type === 'percentage'
                                  ? `${coupon.value}% off`
                                  : coupon.type === 'fixed'
                                    ? `₹${coupon.value} off`
                                    : 'Free Ride'}
                              </Text>

                              {coupon.maxDiscount && (
                                <Text style={styles.couponLimit}>
                                  Max: ₹{coupon.maxDiscount}
                                </Text>
                              )}

                              {!eligibility.eligible && (
                                <Text style={styles.couponError}>
                                  {eligibility.eligibilityRules?.[0] || 'Not eligible'}
                                </Text>
                              )}
                            </View>

                            <Pressable
                              onPress={() => {
                                if (eligibility.eligible) {
                                  setSelectedCoupon(coupon);
                                  if (onCouponSelected) {
                                    const discount = applyCoupon(coupon, currentRideAmount);
                                    onCouponSelected(coupon, currentRideAmount - discount);
                                  }
                                  Alert.alert('Applied', `${coupon.code} applied!`);
                                } else {
                                  Alert.alert(
                                    'Not Eligible',
                                    eligibility.eligibilityRules.join('\n')
                                  );
                                }
                              }}
                              style={[
                                styles.applyButton,
                                { opacity: eligibility.eligible ? 1 : 0.5 },
                              ]}
                              disabled={!eligibility.eligible}
                            >
                              <Text style={styles.applyButtonText}>Apply</Text>
                            </Pressable>
                          </View>
                        );
                      }}
                    />
                  )}
                </View>
              )}
            />
          </View>
        )}

        {/* Available Coupons */}
        {availableCoupons.length > 0 && (
          <View style={styles.couponsSection}>
            <Text style={styles.sectionTitle}>Available Coupons</Text>

            <FlatList
              data={availableCoupons}
              keyExtractor={item => item.id}
              scrollEnabled={false}
              renderItem={({ item }) => (
                <View style={styles.couponCard}>
                  <View style={styles.couponCardLeft}>
                    <View
                      style={[
                        styles.couponBadge,
                        {
                          backgroundColor:
                            item.type === 'percentage'
                              ? '#FF9800'
                              : item.type === 'fixed'
                                ? '#2196F3'
                                : '#4CAF50',
                        },
                      ]}
                    >
                      <Text style={styles.couponBadgeText}>
                        {item.type === 'percentage'
                          ? `${item.value}%`
                          : item.type === 'fixed'
                            ? `₹${item.value}`
                            : 'FREE'}
                      </Text>
                    </View>
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={styles.couponCardCode}>{item.code}</Text>
                      <Text style={styles.couponCardDesc}>{item.description}</Text>
                      {item.minRideAmount && (
                        <Text style={styles.couponCardMeta}>
                          Min: ₹{item.minRideAmount}
                        </Text>
                      )}
                    </View>
                  </View>

                  <Pressable
                    onPress={() => {
                      setSelectedCoupon(item);
                      if (onCouponSelected) {
                        const discount = applyCoupon(item, currentRideAmount);
                        onCouponSelected(item, currentRideAmount - discount);
                      }
                    }}
                    style={styles.useButton}
                  >
                    <MaterialIcons name="arrow_forward" size={20} color="#2196F3" />
                  </Pressable>
                </View>
              )}
            />
          </View>
        )}
      </ScrollView>

      {/* Code Input Modal */}
      <Modal
        visible={showCodeInput}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowCodeInput(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Enter Coupon Code</Text>
              <Pressable onPress={() => setShowCodeInput(false)}>
                <MaterialIcons name="close" size={24} color="#333" />
              </Pressable>
            </View>

            <TextInput
              style={styles.codeInput}
              placeholder="e.g., WELCOME100"
              placeholderTextColor="#999"
              value={couponCode}
              onChangeText={setCouponCode}
              autoCapitalize="characters"
            />

            {validationError && (
              <Text style={styles.errorText}>{validationError}</Text>
            )}

            <Pressable
              onPress={handleValidateCoupon}
              style={styles.validateButton}
            >
              <Text style={styles.validateButtonText}>Validate Coupon</Text>
            </Pressable>

            <Pressable
              onPress={() => {
                setShowCodeInput(false);
                setCouponCode('');
                setValidationError('');
              }}
              style={styles.cancelButton}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedCouponCard: {
    backgroundColor: '#E8F5E9',
    margin: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  selectedCouponHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  selectedCouponText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2E7D32',
  },
  selectedCouponCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1B5E20',
    marginBottom: 4,
  },
  selectedCouponDesc: {
    fontSize: 12,
    color: '#2E7D32',
  },
  statsSection: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 16,
    gap: 8,
  },
  statBox: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  inputButton: {
    backgroundColor: '#2196F3',
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inputButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 12,
  },
  promotionsSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  promotionCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#FFE0B2',
  },
  promotionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  promotionName: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#333',
  },
  promotionDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  couponItem: {
    backgroundColor: '#FFF9C4',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FBC02D',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  couponCode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  couponCodeText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#F57F17',
  },
  couponDetails: {
    flex: 1,
    marginLeft: 12,
  },
  couponValue: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  couponLimit: {
    fontSize: 11,
    color: '#999',
    marginTop: 2,
  },
  couponError: {
    fontSize: 11,
    color: '#F44336',
    marginTop: 2,
  },
  applyButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  applyButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  couponsSection: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  couponCard: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  couponCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  couponBadge: {
    width: 56,
    height: 56,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  couponBadgeText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 12,
  },
  couponCardCode: {
    fontSize: 13,
    fontWeight: 'bold',
    color: '#333',
  },
  couponCardDesc: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
  },
  couponCardMeta: {
    fontSize: 11,
    color: '#2196F3',
    marginTop: 4,
  },
  useButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: 'white',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  codeInput: {
    borderWidth: 1,
    borderColor: '#2196F3',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    marginBottom: 12,
  },
  errorText: {
    color: '#F44336',
    fontSize: 12,
    marginBottom: 12,
  },
  validateButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  validateButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
