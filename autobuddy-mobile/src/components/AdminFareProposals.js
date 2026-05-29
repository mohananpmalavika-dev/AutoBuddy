/**
 * AdminFareProposals.js
 * Admin interface for reviewing and approving/rejecting driver fare proposals
 */

import React, { useState, useCallback, useEffect, useMemo } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Text,
  TextInput,
} from 'react-native';
import { COLORS, SHADOWS, SPACING } from '../theme';
import { apiRequest } from '../lib/api';

// Proposal Card Component with approval/rejection
function AdminProposalCard({ proposal, onApprove, onReject, loading }) {
  const [details, setDetails] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await onApprove(proposal.id);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = () => {
    Alert.prompt(
      'Reject Proposal',
      'Provide a reason for rejection:',
      [
        {
          text: 'Cancel',
          onPress: () => {},
        },
        {
          text: 'Reject',
          onPress: async (reason) => {
            if (!reason || reason.trim().length === 0) {
              Alert.alert('Error', 'Reason is required');
              return;
            }
            setActionLoading(true);
            try {
              await onReject(proposal.id, reason);
            } finally {
              setActionLoading(false);
            }
          },
        },
      ],
      'plain-text'
    );
  };

  return (
    <View style={[styles.proposalCard, ...SHADOWS.small]}>
      <View style={styles.proposalCardHeader}>
        <View style={styles.proposalCardTitleSection}>
          <Text style={styles.proposalCardDriver}>👤 {proposal.driver_name}</Text>
          <Text style={styles.proposalCardEmail}>{proposal.driver_email}</Text>
          <Text style={styles.proposalCardRideType}>
            {proposal.ride_type.charAt(0).toUpperCase() + proposal.ride_type.slice(1)} Ride
          </Text>
          <Text style={styles.proposalCardDate}>
            Submitted: {new Date(proposal.created_at).toLocaleDateString()}
          </Text>
        </View>
      </View>

      <View style={styles.proposalCardContent}>
        <Text style={styles.proposalReasonLabel}>Reason:</Text>
        <Text style={styles.proposalReason}>{proposal.reason}</Text>

        {details && (
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
            <View style={styles.fareDetail}>
              <Text style={styles.fareDetailLabel}>Surge</Text>
              <Text style={styles.fareDetailValue}>{proposal.surge_multiplier.toFixed(1)}x</Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={styles.detailsToggle}
          onPress={() => setDetails(!details)}
        >
          <Text style={styles.detailsToggleText}>
            {details ? '▼ Hide Fare Details' : '▶ Show Fare Details'}
          </Text>
        </TouchableOpacity>

        {proposal.status === 'pending' && (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={[styles.approveButton, actionLoading && styles.buttonDisabled]}
              onPress={handleApprove}
              disabled={actionLoading || loading}
            >
              <Text style={styles.approveButtonText}>
                {actionLoading ? '⏳' : '✓'} Approve
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.rejectButton, actionLoading && styles.buttonDisabled]}
              onPress={handleReject}
              disabled={actionLoading || loading}
            >
              <Text style={styles.rejectButtonText}>
                {actionLoading ? '⏳' : '✕'} Reject
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {proposal.status !== 'pending' && (
          <View style={styles.statusInfoBox}>
            <Text style={[styles.statusLabel, { color: getStatusColor(proposal.status) }]}>
              {proposal.status === 'approved' ? '✓ APPROVED' : '✕ REJECTED'}
            </Text>
            {proposal.reviewed_at && (
              <Text style={styles.statusDate}>
                {new Date(proposal.reviewed_at).toLocaleDateString()}
              </Text>
            )}
          </View>
        )}
      </View>
    </View>
  );
}

function getStatusColor(status) {
  if (status === 'approved') return COLORS.success;
  if (status === 'rejected') return COLORS.error;
  return COLORS.warning;
}

export default function AdminFareProposals() {
  const [proposals, setProposals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [driverFilterId, setDriverFilterId] = useState('');
  const [stats, setStats] = useState(null);

  // Fetch proposals
  const fetchProposals = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/api/admin/fares/proposals/all', {
        method: 'GET',
      });
      setProposals(response.proposals || []);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      Alert.alert('Error', 'Unable to load proposals');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch statistics
  const fetchStats = useCallback(async () => {
    try {
      const response = await apiRequest('/api/admin/fares/proposals/stats/summary', {
        method: 'GET',
      });
      setStats(response);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, []);

  // Load data on mount
  useEffect(() => {
    const loadData = async () => {
      await fetchProposals();
      await fetchStats();
    };
    loadData();
  }, [fetchProposals, fetchStats]);

  // Apply filters whenever proposals or filters change (using useMemo instead of useEffect)
  const filteredProposals = useMemo(() => {
    let filtered = proposals;

    if (statusFilter !== 'all') {
      filtered = filtered.filter(p => p.status === statusFilter);
    }

    if (driverFilterId) {
      filtered = filtered.filter(p => p.driver_id.includes(driverFilterId));
    }

    return filtered;
  }, [statusFilter, driverFilterId, proposals]);

  // Approve proposal
  const handleApprove = useCallback(
    async (proposalId) => {
      try {
        await apiRequest(`/api/admin/fares/proposals/${proposalId}/approve`, {
          method: 'POST',
          body: {
            action: 'approve',
            reason: 'Approved by admin',
          },
        });

        Alert.alert('Success', 'Proposal approved and fare override activated');
        await fetchProposals();
        await fetchStats();
      } catch (error) {
        Alert.alert('Error', error.message || 'Failed to approve proposal');
      }
    },
    [fetchProposals, fetchStats]
  );

  // Reject proposal
  const handleReject = useCallback(
    async (proposalId, reason) => {
      try {
        await apiRequest(`/api/admin/fares/proposals/${proposalId}/reject`, {
          method: 'POST',
          body: {
            action: 'reject',
            reason: reason,
          },
        });

        Alert.alert('Success', 'Proposal rejected. Driver will be notified.');
        await fetchProposals();
        await fetchStats();
      } catch (error) {
        Alert.alert('Error', error.message || 'Failed to reject proposal');
      }
    },
    [fetchProposals, fetchStats]
  );

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Fare Proposals Review</Text>
        {stats && (
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.pending}</Text>
              <Text style={styles.statLabel}>Pending</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.approved}</Text>
              <Text style={styles.statLabel}>Approved</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.rejected}</Text>
              <Text style={styles.statLabel}>Rejected</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statNumber}>{stats.approval_rate}%</Text>
              <Text style={styles.statLabel}>Rate</Text>
            </View>
          </View>
        )}
      </View>

      {loading && <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />}

      {!loading && (
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Filters */}
          <View style={styles.filterSection}>
            <View style={styles.statusFilterButtons}>
              {['pending', 'approved', 'rejected', 'all'].map(status => (
                <TouchableOpacity
                  key={status}
                  style={[
                    styles.statusFilterButton,
                    statusFilter === status && styles.statusFilterButtonActive,
                  ]}
                  onPress={() => setStatusFilter(status)}
                >
                  <Text
                    style={[
                      styles.statusFilterButtonText,
                      statusFilter === status && styles.statusFilterButtonTextActive,
                    ]}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.formField}>
              <Text style={styles.label}>Filter by Driver ID</Text>
              <TextInput
                style={styles.input}
                placeholder="Enter driver ID (optional)"
                value={driverFilterId}
                onChangeText={setDriverFilterId}
              />
            </View>
          </View>

          {/* Proposals List */}
          {filteredProposals.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateIcon}>📭</Text>
              <Text style={styles.emptyStateTitle}>
                {statusFilter === 'pending' ? 'No Pending Proposals' : 'No Proposals Found'}
              </Text>
              <Text style={styles.emptyStateText}>
                {statusFilter === 'pending'
                  ? 'All proposals have been reviewed'
                  : 'No proposals match your filters'}
              </Text>
            </View>
          ) : (
            <View>
              <Text style={styles.resultCount}>
                Showing {filteredProposals.length} proposal{filteredProposals.length !== 1 ? 's' : ''}
              </Text>
              {filteredProposals.map(proposal => (
                <AdminProposalCard
                  key={proposal.id}
                  proposal={proposal}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  loading={loading}
                />
              ))}
            </View>
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
    marginBottom: SPACING.large,
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.small,
    justifyContent: 'space-between',
  },
  statBox: {
    flex: 1,
    backgroundColor: COLORS.surface,
    paddingVertical: SPACING.medium,
    paddingHorizontal: SPACING.small,
    borderRadius: 8,
    alignItems: 'center',
    ...SHADOWS.small,
  },
  statNumber: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.primary,
    marginBottom: SPACING.small,
  },
  statLabel: {
    fontSize: 11,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  loader: {
    marginVertical: SPACING.xlarge,
  },
  content: {
    flex: 1,
    padding: SPACING.large,
  },
  filterSection: {
    marginBottom: SPACING.xlarge,
  },
  statusFilterButtons: {
    flexDirection: 'row',
    gap: SPACING.small,
    marginBottom: SPACING.large,
    flexWrap: 'wrap',
  },
  statusFilterButton: {
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
  },
  statusFilterButtonActive: {
    borderColor: COLORS.primary,
    backgroundColor: COLORS.primary + '15',
  },
  statusFilterButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  statusFilterButtonTextActive: {
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
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: SPACING.medium,
    paddingVertical: SPACING.small,
    fontSize: 14,
    color: COLORS.text,
  },
  resultCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.medium,
  },
  proposalCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: SPACING.large,
    marginBottom: SPACING.medium,
  },
  proposalCardHeader: {
    marginBottom: SPACING.medium,
  },
  proposalCardTitleSection: {
    marginBottom: SPACING.small,
  },
  proposalCardDriver: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: SPACING.small,
  },
  proposalCardEmail: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginBottom: SPACING.small,
  },
  proposalCardRideType: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
    marginBottom: SPACING.small,
  },
  proposalCardDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
  detailsToggle: {
    paddingVertical: SPACING.medium,
  },
  detailsToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.medium,
    marginTop: SPACING.medium,
  },
  approveButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    alignItems: 'center',
  },
  approveButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  rejectButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    paddingVertical: SPACING.medium,
    borderRadius: 8,
    alignItems: 'center',
  },
  rejectButtonText: {
    color: COLORS.white,
    fontSize: 14,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  statusInfoBox: {
    marginTop: SPACING.medium,
    paddingVertical: SPACING.medium,
    alignItems: 'center',
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: SPACING.small,
  },
  statusDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
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
