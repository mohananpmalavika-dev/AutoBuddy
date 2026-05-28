import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { usePaymentMethods } from '../hooks/usePaymentMethods';
import { theme } from '../theme';

const PayoutScheduleWidget = ({ token, driverId, isVisible, onClose }) => {
  const {
    paymentMethods,
    payoutSchedule,
    isLoading,
    error,
    SCHEDULE_TYPES,
    loadPaymentMethods,
    loadPayoutSchedule,
    updatePayoutSchedule,
  } = usePaymentMethods({ token, driverId });

  const [showConfigForm, setShowConfigForm] = useState(false);
  const [scheduleConfig, setScheduleConfig] = useState({
    payment_method_id: '',
    schedule_type: 'weekly',
    schedule_day: '1',
    schedule_time: '09:00',
    minimum_balance_threshold: '1000',
  });

  useEffect(() => {
    if (isVisible) {
      loadPaymentMethods();
    loadPayoutSchedule();
    }
  }, [isVisible, loadPaymentMethods, loadPayoutSchedule]);

  const getInitialScheduleConfig = () => {
    if (payoutSchedule) {
      return {
        payment_method_id: String(payoutSchedule.payment_method_id),
        schedule_type: payoutSchedule.schedule_type,
        schedule_day: String(payoutSchedule.schedule_day || '1'),
        schedule_time: payoutSchedule.schedule_time || '09:00',
        minimum_balance_threshold: String(payoutSchedule.minimum_balance_threshold),
      };
    }
    return {
      payment_method_id: paymentMethods.length > 0 ? String(paymentMethods[0].id) : '',
      schedule_type: 'weekly',
      schedule_day: '1',
      schedule_time: '09:00',
      minimum_balance_threshold: '1000',
    };
  };

  const openConfigForm = () => {
    setScheduleConfig(getInitialScheduleConfig());
    setShowConfigForm(true);
  };

  useEffect(() => {
    if (!payoutSchedule && paymentMethods.length > 0 && !scheduleConfig.payment_method_id) {
      const timer = setTimeout(() => {
        setScheduleConfig((prev) => ({
          ...prev,
          payment_method_id: String(paymentMethods[0].id),
        }));
      }, 0);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [payoutSchedule, paymentMethods, scheduleConfig.payment_method_id]);

  const handleSaveSchedule = async () => {
    if (!scheduleConfig.payment_method_id) {
      Alert.alert('Error', 'Please select a payment method');
      return;
    }

    const success = await updatePayoutSchedule(
      parseInt(scheduleConfig.payment_method_id),
      {
        schedule_type: scheduleConfig.schedule_type,
        schedule_day: parseInt(scheduleConfig.schedule_day),
        schedule_time: scheduleConfig.schedule_time,
        minimum_balance_threshold: parseFloat(scheduleConfig.minimum_balance_threshold),
      }
    );

    if (success) {
      Alert.alert('Success', 'Schedule configured');
      setShowConfigForm(false);
      loadPayoutSchedule();
    } else {
      Alert.alert('Error', error || 'Failed to save schedule');
    }
  };

  const getScheduleDescription = () => {
    if (!payoutSchedule) return 'Not configured';
    
    switch (payoutSchedule.schedule_type) {
      case 'daily':
        return `Daily at ${payoutSchedule.schedule_time}`;
      case 'weekly':
        const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        return `Every ${days[payoutSchedule.schedule_day || 0]} at ${payoutSchedule.schedule_time}`;
      case 'monthly':
        return `${payoutSchedule.schedule_day}th of month at ${payoutSchedule.schedule_time}`;
      case 'manual':
        return 'On demand only';
      default:
        return payoutSchedule.schedule_type;
    }
  };

  return (
    <Modal visible={isVisible} animationType="slide" transparent={false}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.headerButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payout Schedule</Text>
          <TouchableOpacity onPress={openConfigForm}>
            <Text style={[styles.headerButton, { color: theme.COLORS.primary }]}>Edit</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Current Schedule Info */}
          <View style={styles.infoCard}>
            <Text style={styles.infoLabel}>Current Schedule</Text>
            <Text style={styles.infoValue}>{getScheduleDescription()}</Text>
            
            {payoutSchedule && (
              <>
                <Text style={[styles.infoLabel, { marginTop: 12 }]}>
                  Minimum Balance
                </Text>
                <Text style={styles.infoValue}>
                  ₹{payoutSchedule.minimum_balance_threshold}
                </Text>
              </>
            )}
          </View>

          {/* Schedule Types Info */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Schedule Types</Text>
            
            {[
              { type: 'daily', icon: '📅', desc: 'Automatic payout every day' },
              { type: 'weekly', icon: '📊', desc: 'Payout once per week' },
              { type: 'monthly', icon: '📈', desc: 'Payout once per month' },
              { type: 'manual', icon: '👆', desc: 'Request payout on demand' },
            ].map((schedule) => (
              <View key={schedule.type} style={styles.scheduleOption}>
                <Text style={styles.scheduleIcon}>{schedule.icon}</Text>
                <View style={styles.scheduleInfo}>
                  <Text style={styles.scheduleType}>
                    {SCHEDULE_TYPES[schedule.type]}
                  </Text>
                  <Text style={styles.scheduleDesc}>{schedule.desc}</Text>
                </View>
              </View>
            ))}
          </View>

          {/* Tips */}
          <View style={styles.tipsCard}>
            <Text style={styles.tipsTitle}>💡 Pro Tips</Text>
            <Text style={styles.tipText}>• Set minimum balance to avoid transfers with low balances</Text>
            <Text style={styles.tipText}>• Daily payouts help with cash flow management</Text>
            <Text style={styles.tipText}>• Weekend transfers may take 1-2 extra business days</Text>
          </View>

          {error && <Text style={styles.error}>{error}</Text>}
        </ScrollView>

        {/* Configuration Modal */}
        <Modal visible={showConfigForm} animationType="fade" transparent>
          <View style={styles.formOverlay}>
            <View style={styles.formModal}>
              <Text style={styles.formTitle}>Configure Payout Schedule</Text>

              {/* Payment Method Selection */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Payment Method</Text>
                <View style={styles.methodList}>
                  {paymentMethods.map((method) => (
                    <TouchableOpacity
                      key={method.id}
                      style={[
                        styles.methodOption,
                        String(scheduleConfig.payment_method_id) === String(method.id) && 
                        styles.methodOptionActive
                      ]}
                      onPress={() => setScheduleConfig(prev => ({
                        ...prev,
                        payment_method_id: String(method.id)
                      }))}
                    >
                      <Text style={[
                        styles.methodOptionText,
                        String(scheduleConfig.payment_method_id) === String(method.id) && 
                        styles.methodOptionTextActive
                      ]}>
                        {method.account_holder_name} (...{method.account_number?.slice(-4)})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Schedule Type */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Schedule Type</Text>
                <View style={styles.scheduleTypeButtons}>
                  {['daily', 'weekly', 'monthly', 'manual'].map((type) => (
                    <TouchableOpacity
                      key={type}
                      style={[
                        styles.scheduleTypeBtn,
                        scheduleConfig.schedule_type === type && 
                        styles.scheduleTypeBtnActive
                      ]}
                      onPress={() => setScheduleConfig(prev => ({
                        ...prev,
                        schedule_type: type
                      }))}
                    >
                      <Text style={[
                        styles.scheduleTypeBtnText,
                        scheduleConfig.schedule_type === type && 
                        styles.scheduleTypeBtnTextActive
                      ]}>
                        {SCHEDULE_TYPES[type]}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Schedule Day/Time (if not manual) */}
              {scheduleConfig.schedule_type !== 'manual' && (
                <>
                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Day</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="Day (0-6 for weekly, 1-31 for monthly)"
                      value={scheduleConfig.schedule_day}
                      onChangeText={(text) => setScheduleConfig(prev => ({
                        ...prev,
                        schedule_day: text
                      }))}
                      keyboardType="numeric"
                    />
                  </View>

                  <View style={styles.formGroup}>
                    <Text style={styles.formLabel}>Time (HH:MM)</Text>
                    <TextInput
                      style={styles.formInput}
                      placeholder="09:00"
                      value={scheduleConfig.schedule_time}
                      onChangeText={(text) => setScheduleConfig(prev => ({
                        ...prev,
                        schedule_time: text
                      }))}
                    />
                  </View>
                </>
              )}

              {/* Minimum Balance */}
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>Minimum Balance (₹)</Text>
                <TextInput
                  style={styles.formInput}
                  placeholder="1000"
                  value={scheduleConfig.minimum_balance_threshold}
                  onChangeText={(text) => setScheduleConfig(prev => ({
                    ...prev,
                    minimum_balance_threshold: text
                  }))}
                  keyboardType="decimal-pad"
                />
              </View>

              <View style={styles.formButtons}>
                <TouchableOpacity
                  style={[styles.formButton, styles.cancelButton]}
                  onPress={() => setShowConfigForm(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.formButton, styles.submitButton]}
                  onPress={handleSaveSchedule}
                  disabled={isLoading}
                >
                  <Text style={styles.submitButtonText}>
                    {isLoading ? 'Saving...' : 'Save Schedule'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.COLORS.white,
    paddingTop: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.grey2,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.COLORS.black,
  },
  headerButton: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.grey5,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  infoCard: {
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 10,
    padding: 16,
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.COLORS.primary,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 12,
  },
  scheduleOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.COLORS.grey1,
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
  },
  scheduleIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  scheduleInfo: {
    flex: 1,
  },
  scheduleType: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 2,
  },
  scheduleDesc: {
    fontSize: 11,
    color: theme.COLORS.grey5,
  },
  tipsCard: {
    backgroundColor: '#F3E5F5',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
  },
  tipsTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6A1B9A',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 11,
    color: '#6A1B9A',
    marginBottom: 4,
  },
  error: {
    color: theme.COLORS.danger,
    fontSize: 13,
    marginTop: 12,
  },
  formOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  formModal: {
    backgroundColor: theme.COLORS.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
    paddingBottom: 30,
    maxHeight: '90%',
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.COLORS.black,
    marginBottom: 20,
  },
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.COLORS.black,
    marginBottom: 8,
  },
  methodList: {
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  methodOption: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.COLORS.grey2,
  },
  methodOptionActive: {
    backgroundColor: '#E3F2FD',
  },
  methodOptionText: {
    fontSize: 12,
    color: theme.COLORS.grey5,
  },
  methodOptionTextActive: {
    color: theme.COLORS.primary,
    fontWeight: '600',
  },
  scheduleTypeButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  scheduleTypeBtn: {
    width: '48%',
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 6,
    paddingVertical: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  scheduleTypeBtnActive: {
    backgroundColor: theme.COLORS.primary,
    borderColor: theme.COLORS.primary,
  },
  scheduleTypeBtnText: {
    fontSize: 12,
    color: theme.COLORS.grey5,
    fontWeight: '500',
  },
  scheduleTypeBtnTextActive: {
    color: theme.COLORS.white,
    fontWeight: '600',
  },
  formInput: {
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  formButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
  },
  formButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: theme.COLORS.grey3,
    marginRight: 8,
  },
  cancelButtonText: {
    color: theme.COLORS.grey5,
    fontWeight: '600',
  },
  submitButton: {
    backgroundColor: theme.COLORS.primary,
    marginLeft: 8,
  },
  submitButtonText: {
    color: theme.COLORS.white,
    fontWeight: '600',
  },
});

export default PayoutScheduleWidget;
