/**
 * DriverFareProposal.js
 * Allows drivers to propose custom fares requiring admin approval
 */

import React, { useState, useCallback, useEffect } from 'react';
import {
  View,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
} from 'react-native';
import { COLORS, SHADOWS, SPACING } from '../theme';
import { apiRequest } from '../lib/api';

const RIDE_TYPES = ['standard', 'premium', 'economy'];

// Tab Button Component
function ProposalTabButton({ tab, label, activeTab, onPress, loading }) {
  return (
    <TouchableOpacity
      style={[
        styles.tabButton,
        activeTab === tab && styles.tabButtonActive,
      ]}
      onPress={() => onPress(tab)}
      disabled={loading}
    >
      <Text
        style={[
          styles.tabButtonText,
          activeTab === tab && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// Form Field Component
function ProposalFormField({ label, value, onChange, placeholder, testID }) {
  return (
    <View style={styles.formField}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        placeholder={placeholder || label}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        testID={testID}
      />
    </View>
  );
}

// Proposal Status Badge Component
function ProposalStatusBadge({ status }) {
  const statusStyles = {
    pending: { backgroundColor: COLORS.warning, color: '#000' },
    approved: { backgroundColor: COLORS.success, color: '#fff' },
    rejected: { backgroundColor: COLORS.error, color: '#fff' },
  };

  const style = statusStyles[status] || statusStyles.pending;

  return (
    <View style={[styles.statusBadge, { backgroundColor: style.backgroundColor }]}>
      <Text style={[styles.statusBadgeText, { color: style.color }]}>
        {status.toUpperCase()}
      </Text>
    </View>
  );
}

// Proposal Card Component
function ProposalCard({ proposal, onWithdraw }) {
  const [details, setDetails] = useState(false);

  return (
    <View style={[styles.proposalCard, ...SHADOWS.small]}>
      <View style={styles.proposalCardHeader}>
        <View>
          <Text style={styles.proposalCardTitle}>
            {proposal.ride_type.charAt(0).toUpperCase() + proposal.ride_type.slice(1)}
          </Text>
          <Text style={styles.proposalCardDate}>
            {new Date(proposal.created_at).toLocaleDateString()}
          </Text>
        </View>
        <ProposalStatusBadge status={proposal.status} />
      </View>

      <View style={styles.proposalCardContent}>
        <Text style={styles.proposalReasonLabel}>Reason:</Text>
        <Text style={styles.proposalReason}>{proposal.reason}</Text>

        {details && (
          <>
            <View style={styles.fareDetailsGrid}>
              <View style={styles.fareDetail}>
                <Text style={styles.fareDetailLabel}>Base Fare</Text>
                <Text style={styles.fareDetailValue}>₹{proposal.base_fare.toFixed(2)}</Text>
              </View>
              <View style={styles.fareDetail}>
                <Text style={styles.fareDetailLabel}>Per KM</Text>
                <Text style={styles.fareDetailValue}>₹{proposal.per_km.toFixed(2)}</Text>
              </View>
              <View style={styles.fareDetail}>
                <Text style={styles.fareDetailLabel}>Per Min</Text>
                <Text style={styles.fareDetailValue}>₹{proposal.per_minute.toFixed(2)}</Text>
              </View>
              <View style={styles.fareDetail}>
                <Text style={styles.fareDetailLabel}>Minimum</Text>
                <Text style={styles.fareDetailValue}>₹{proposal.minimum_fare.toFixed(2)}</Text>
              </View>
            </View>

            {proposal.status === 'rejected' && proposal.rejection_reason && (
              <View style={styles.rejectionReasonBox}>
                <Text style={styles.rejectionReasonLabel}>Rejection Reason:</Text>
                <Text style={styles.rejectionReasonText}>{proposal.rejection_reason}</Text>
              </View>
            )}

            {proposal.status === 'approved' && proposal.reviewed_at && (
              <View style={styles.approvalInfoBox}>
                <Text style={styles.approvalInfoLabel}>
                  Approved on {new Date(proposal.reviewed_at).toLocaleDateString()}
                </Text>
              </View>
            )}
          </>
        )}

        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setDetails(!details)}
        >
          <Text style={styles.detailsToggleText}>
            {details ? 'Hide Details' : 'View Details'}
          </Text>
        </TouchableOpacity>

        {proposal.status === 'pending' && (
          <TouchableOpacity
            style={styles.withdrawButton}
            onPress={() => onWithdraw(proposal.id)}
          >
            <Text style={styles.withdrawButtonText}>Withdraw Proposal</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export default function DriverFareProposal() {
  const [activeTab, setActiveTab] = useState('submit');
  const [loading, setLoading] = useState(false);
  const [proposals, setProposals] = useState([]);
  const [filteredProposals, setFilteredProposals] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  const [formData, setFormData] = useState({
    ride_type: 'standard',
    base_fare: '',
    per_km: '',
    per_minute: '',
    minimum_fare: '',
    surge_multiplier: '1.0',
    reason: '',
  });

  // Apply status filter
  const applyStatusFilter = useCallback((allProposals, filter) => {
    if (filter === 'all') {
      setFilteredProposals(allProposals);
    } else {
      setFilteredProposals(allProposals.filter(p => p.status === filter));
    }
  }, []);

  // Fetch proposals
  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/driver/fares/proposals', { method: 'GET' });
      setProposals(response.proposals || []);
      applyStatusFilter(response.proposals || [], statusFilter);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      Alert.alert('Error', 'Unable to load your proposals');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, applyStatusFilter]);

  // Handle status filter change
  const handleStatusFilterChange = useCallback((filter) => {
    setStatusFilter(filter);
    applyStatusFilter(proposals, filter);
  }, [proposals, applyStatusFilter]);

  // Load proposals on mount and when activeTab changes
  useEffect(() => {
    if (activeTab === 'history') {
      const loadProposals = async () => {
        try {
          setLoading(true);
          const response = await apiRequest('/api/driver/fares/proposals', { method: 'GET' });
          setProposals(response.proposals || []);
          applyStatusFilter(response.proposals || [], statusFilter);
        } catch (error) {
          console.error('Error fetching proposals:', error);
          Alert.alert('Error', 'Unable to load your proposals');
        } finally {
          setLoading(false);
        }
      };
      loadProposals();
    }
  }, [activeTab, statusFilter, applyStatusFilter]);

  // Submit proposal
  const handleSubmitProposal = useCallback(async () => {
    // Validate form
    if (!formData.base_fare || !formData.per_km || !formData.per_minute || !formData.minimum_fare || !formData.reason) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    if (formData.reason.length < 10) {
      Alert.alert('Error', 'Reason must be at least 10 characters');
      return;
    }

    setLoading(true);
    try {
      await apiRequest('/api/driver/fares/propose', {
        method: 'POST',
        body: {
          ride_type: formData.ride_type,
          base_fare: parseFloat(formData.base_fare),
          per_km: parseFloat(formData.per_km),
          per_minute: parseFloat(formData.per_minute),
          minimum_fare: parseFloat(formData.minimum_fare),
          surge_multiplier: parseFloat(formData.surge_multiplier),
          reason: formData.reason,
        },
      });

      Alert.alert('Success', 'Your fare proposal has been submitted for admin review. You will be notified once reviewed.');

      // Reset form
      setFormData({
        ride_type: 'standard',
        base_fare: '',
        per_km: '',
        per_minute: '',
        minimum_fare: '',
        surge_multiplier: '1.0',
        reason: '',
      });

      // Switch to history tab and reload proposals
      setActiveTab('history');
    } catch (error) {
      Alert.alert('Error', error.message || 'Failed to submit proposal');
    } finally {
      setLoading(false);
    }
  }, [formData, setActiveTab]);

  // Withdraw proposal
  const handleWithdraw = useCallback(async (proposalId) => {
    Alert.alert(
      'Withdraw Proposal',
      'Are you sure you want to withdraw this proposal? This action cannot be undone.',
      [
        { text: 'Cancel', onPress: () => {} },
        {
          text: 'Withdraw',
          onPress: async () => {
            setLoading(true);
            try {
              await apiRequest(`/api/driver/fares/proposals/${proposalId}`, {
                method: 'DELETE',
              });

              Alert.alert('Success', 'Proposal withdrawn');
              await fetchProposals();
            } catch (error) {
              Alert.alert('Error', error.message || 'Failed to withdraw proposal');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  }, [fetchProposals]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fare Proposals</Text>
      </View>

      {/* Tabs */}
      <View style={styles.tabsContainer}>
        <ProposalTabButton
          tab="submit"
          label="Submit"
          activeTab={activeTab}
          onPress={setActiveTab}
          loading={loading}
        />
        <ProposalTabButton
          tab="history"
          label="History"
          activeTab={activeTab}
          onPress={setActiveTab}
          loading={loading}
        />
      </View>

      {loading && activeTab === 'submit' && (
        <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
      )}

      {/* Submit Tab */}
      {activeTab === 'submit' && !loading && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.infoBox}>
            <Text style={styles.infoTitle}>📋 Submit Fare Proposal</Text>
            <Text style={styles.infoText}>
              Propose custom fares for your rides. Your proposal will be reviewed by an admin. Once approved, your custom rates will be activated.
            </Text>
          </View>

          <View style={styles.formGroup}>
            <Text style={styles.sectionTitle}>Ride Type</Text>
            <View style={styles.rideTypeButtons}>
              {RIDE_TYPES.map(type => (
                <TouchableOpacity
                  key={type}
                  style={[
                    styles.rideTypeButton,
                    formData.ride_type === type && styles.rideTypeButtonActive,
                  ]}
                  onPress={() => setFormData({ ...formData, ride_type: type })}
                >
                  <Text
                    style={[
                      styles.rideTypeButtonText,
                      formData.ride_type === type && styles.rideTypeButtonTextActive,
                    ]}
                  >
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <ProposalFormField
              label="Base Fare (₹)"
              value={formData.base_fare}
              onChange={value => setFormData({ ...formData, base_fare: value })}
              testID="baseFare"
            />
            <ProposalFormField
              label="Per KM (₹)"
              value={formData.per_km}
              onChange={value => setFormData({ ...formData, per_km: value })}
              testID="perKm"
            />
            <ProposalFormField
              label="Per Minute (₹)"
              value={formData.per_minute}
              onChange={value => setFormData({ ...formData, per_minute: value })}
              testID="perMinute"
            />
            <ProposalFormField
              label="Minimum Fare (₹)"
              value={formData.minimum_fare}
              onChange={value => setFormData({ ...formData, minimum_fare: value })}
              testID="minimumFare"
            />

            <View style={styles.formField}>
              <Text style={styles.label}>Reason for Proposal *</Text>
              <TextInput
                style={[styles.input, styles.reasonInput]}
                placeholder="Explain why you're proposing these rates (e.g., high demand area, peak hours strategy)"
                value={formData.reason}
                onChangeText={value => setFormData({ ...formData, reason: value })}
                multiline={true}
                numberOfLines={4}
                testID="proposalReason"
              />
              <Text style={styles.characterCount}>
                {formData.reason.length} characters (minimum 10)
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, loading && styles.submitButtonDisabled]}
              onPress={handleSubmitProposal}
              disabled={loading}
            >
              <Text style={styles.submitButtonText}>
                {loading ? 'Submitting...' : 'Submit Proposal'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {proposals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📭</Text>
              <Text style={styles.emptyStateTitle}>No Proposals Yet</Text>
              <Text style={styles.emptyStateText}>Submit your first fare proposal to get started</Text>
            </View>
          ) : (
            <>
              <View style={styles.filterButtons}>
                {['all', 'pending', 'approved', 'rejected'].map(filter => (
                  <TouchableOpacity
                    key={filter}
                    style={[
                      styles.filterButton,
                      statusFilter === filter && styles.filterButtonActive,
                    ]}
                    onPress={() => handleStatusFilterChange(filter)}
                  >
                    <Text
                      style={[
                        styles.filterButtonText,
                        statusFilter === filter && styles.filterButtonTextActive,
                      ]}
                    >
                      {filter === 'all' ? 'All' : filter.charAt(0).toUpperCase() + filter.slice(1)} ({
                        filter === 'all'
                          ? proposals.length
                          : proposals.filter(p => p.status === filter).length
                      })
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {filteredProposals.map(proposal => (
                <ProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onWithdraw={handleWithdraw}
                />
              ))}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.large,
    paddingVertical: SPACING.large,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  tabsContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tabButton: {
    flex: 1,
    paddingVertical: SPACING.medium,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  tabButtonActive: {
    borderBottomColor: COLORS.primary,
  },
  tabButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  tabButtonTextActive: {
    color: COLORS.primary,
  },
  loader: {
    marginVertical: SPACING.xlarge,
  },
  content: {
    flex: 1,
    padding: SPACING.large,
  },
  infoBox: {
    backgroundColor: COLORS.primary + '15',
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    paddingHorizontal: SPACING.large,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    marginBottom: SPACING.xlarge,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.small,
  },
  infoText: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
  },
  formGroup: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    ...SHADOWS.small,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.medium,
  },
  rideTypeButtons: {
    flexDirection: 'row',
    marginBottom: SPACING.large,
    gap: SPACING.medium,
  },
  rideTypeButton: {
    flex: 1,
    paddingVertical: SPACING.medium,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    alignItems: 'center',
  },
  rideTypeButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  rideTypeButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  rideTypeButtonTextActive: {
    color: COLORS.primary,
  },
  formField: {
    marginBottom: SPACING.medium,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  input: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    fontSize: 14,
    color: COLORS.text,
  },
  reasonInput: {
    paddingTop: SPACING.medium,
    textAlignVertical: 'top',
  },
  characterCount: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.small,
  },
  submitButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: SPACING.large,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
  },
  filterButtons: {
    flexDirection: 'row',
    marginBottom: SPACING.large,
    gap: SPACING.small,
    flexWrap: 'wrap',
  },
  filterButton: {
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
  },
  filterButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  filterButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  filterButtonTextActive: {
    color: COLORS.primary,
  },
  proposalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    marginBottom: SPACING.medium,
  },
  proposalCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.medium,
  },
  proposalCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
  },
  proposalCardDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: SPACING.small,
  },
  statusBadge: {
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderRadius: 20,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  proposalCardContent: {
    marginTop: SPACING.medium,
  },
  proposalReasonLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    marginBottom: SPACING.small,
  },
  proposalReason: {
    fontSize: 14,
    color: COLORS.text,
    lineHeight: 20,
    marginBottom: SPACING.medium,
  },
  fareDetailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.small,
    marginBottom: SPACING.medium,
  },
  fareDetail: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.background,
    padding: SPACING.medium,
    borderRadius: 8,
  },
  fareDetailLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    marginBottom: SPACING.small,
  },
  fareDetailValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.primary,
  },
  rejectionReasonBox: {
    backgroundColor: COLORS.error + '15',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.error,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    marginBottom: SPACING.medium,
  },
  rejectionReasonLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.error,
    marginBottom: SPACING.small,
  },
  rejectionReasonText: {
    fontSize: 13,
    color: COLORS.text,
    lineHeight: 18,
  },
  approvalInfoBox: {
    backgroundColor: COLORS.success + '15',
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    marginBottom: SPACING.medium,
  },
  approvalInfoLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.success,
  },
  detailsToggle: {
    paddingVertical: SPACING.medium,
    alignItems: 'center',
  },
  detailsToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  withdrawButton: {
    marginTop: SPACING.medium,
    paddingVertical: SPACING.medium,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 8,
    alignItems: 'center',
  },
  withdrawButtonText: {
    color: COLORS.error,
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: SPACING.xlarge,
  },
  emptyStateIcon: {
    fontSize: 48,
    marginBottom: SPACING.medium,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
    textAlign: 'center',
  },
};
