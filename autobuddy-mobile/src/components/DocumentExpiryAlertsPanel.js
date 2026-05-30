import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { COLORS } from '../theme';
import { apiRequest } from '../lib/api';
import { GlassCard, PremiumEmptyState } from './PremiumUI';
import { formatToIST } from '../utils/time';

export default function DocumentExpiryAlertsPanel({ token, onDocumentExpiring = undefined }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [alerts, setAlerts] = useState([]);
  const [criticalCount, setCriticalCount] = useState(0);
  const [warningCount, setWarningCount] = useState(0);

  const fetchDocumentAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/document-expiry-alerts', { token });
      if (data && Array.isArray(data.alerts)) {
        setAlerts(data.alerts);
        const critical = data.alerts.filter(a => a.severity === 'critical').length;
        const warning = data.alerts.filter(a => a.severity === 'warning').length;
        setCriticalCount(critical);
        setWarningCount(warning);

        // Notify callback if there are critical alerts
        if (critical > 0 && onDocumentExpiring) {
          onDocumentExpiring({ critical, warning });
        }
      }
    } catch (err) {
      setError(err.message || 'Could not load document expiry alerts');
    } finally {
      setLoading(false);
    }
  }, [onDocumentExpiring, token]);

  useEffect(() => {
    const refresh = () => {
      fetchDocumentAlerts().catch(() => null);
    };
    const initialTimer = setTimeout(refresh, 0);
    const refreshTimer = setInterval(refresh, 6 * 60 * 60 * 1000);
    return () => {
      clearTimeout(initialTimer);
      clearInterval(refreshTimer);
    };
  }, [fetchDocumentAlerts]);

  const handleRenewDocument = async (documentId, alertId) => {
    try {
      setLoading(true);
      await apiRequest(`/drivers/documents/${documentId}/renew-request`, {
        method: 'POST',
        token,
        body: { alert_id: alertId },
      });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
      // Trigger refresh
      await fetchDocumentAlerts();
    } catch (err) {
      setError(err.message || 'Could not submit renewal request');
    } finally {
      setLoading(false);
    }
  };

  const handleDismissAlert = async (alertId) => {
    try {
      setLoading(true);
      await apiRequest(`/drivers/document-expiry-alerts/${alertId}/dismiss`, {
        method: 'POST',
        token,
      });
      setAlerts(prev => prev.filter(a => a.id !== alertId));
    } catch (err) {
      setError(err.message || 'Could not dismiss alert');
    } finally {
      setLoading(false);
    }
  };

  if (loading && alerts.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (error && alerts.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={fetchDocumentAlerts}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (alerts.length === 0) {
    return (
      <PremiumEmptyState
        title="All Documents Valid"
        subtitle="Your documents are up to date. No expiry alerts."
      />
    );
  }

  // Sort by severity (critical first)
  const sortedAlerts = [...alerts].sort((a, b) => {
    const severityOrder = { critical: 0, warning: 1, info: 2 };
    return (severityOrder[a.severity] || 3) - (severityOrder[b.severity] || 3);
  });

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Alert Summary */}
      {(criticalCount > 0 || warningCount > 0) && (
        <GlassCard style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Document Status Summary</Text>
          {criticalCount > 0 && (
            <View style={styles.summaryRow}>
              <View style={[styles.summaryBadge, styles.summaryBadgeCritical]}>
                <Text style={styles.summaryBadgeText}>{criticalCount}</Text>
              </View>
              <Text style={styles.summaryText}>
                {criticalCount === 1 ? 'Document' : 'Documents'} expiring soon
              </Text>
            </View>
          )}
          {warningCount > 0 && (
            <View style={styles.summaryRow}>
              <View style={[styles.summaryBadge, styles.summaryBadgeWarning]}>
                <Text style={styles.summaryBadgeText}>{warningCount}</Text>
              </View>
              <Text style={styles.summaryText}>
                {warningCount === 1 ? 'Document' : 'Documents'} requiring renewal
              </Text>
            </View>
          )}
        </GlassCard>
      )}

      {/* Individual Alerts */}
      {sortedAlerts.map(alert => (
        <GlassCard 
          key={alert.id}
          style={[
            styles.alertCard,
            alert.severity === 'critical' && styles.alertCardCritical,
            alert.severity === 'warning' && styles.alertCardWarning,
            alert.severity === 'info' && styles.alertCardInfo,
          ]}
        >
          <View style={styles.alertHeader}>
            <View style={styles.alertTitleContainer}>
              <View style={[
                styles.alertIcon,
                alert.severity === 'critical' && styles.alertIconCritical,
                alert.severity === 'warning' && styles.alertIconWarning,
                alert.severity === 'info' && styles.alertIconInfo,
              ]} />
              <View style={styles.alertTitleText}>
                <Text style={styles.alertTitle}>{alert.document_type || 'Document'}</Text>
                <Text style={styles.alertSubtitle}>
                  Expires: {formatDate(alert.expiry_date)}
                </Text>
              </View>
            </View>
            <Text style={[
              styles.alertBadge,
              alert.severity === 'critical' && styles.alertBadgeCritical,
              alert.severity === 'warning' && styles.alertBadgeWarning,
              alert.severity === 'info' && styles.alertBadgeInfo,
            ]}>
              {alert.severity.toUpperCase()}
            </Text>
          </View>

          {alert.message && (
            <Text style={styles.alertMessage}>{alert.message}</Text>
          )}

          {alert.days_until_expiry !== undefined && (
            <View style={styles.daysContainer}>
              <Text style={styles.daysText}>
                {alert.days_until_expiry === 0
                  ? 'Expires today'
                  : alert.days_until_expiry === 1
                    ? 'Expires tomorrow'
                    : `${alert.days_until_expiry} days remaining`}
              </Text>
            </View>
          )}

          <View style={styles.alertActions}>
            <TouchableOpacity 
              style={styles.renewButton}
              onPress={() => handleRenewDocument(alert.document_id, alert.id)}
            >
              <Text style={styles.renewButtonText}>Submit Renewal</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={styles.dismissButton}
              onPress={() => handleDismissAlert(alert.id)}
            >
              <Text style={styles.dismissButtonText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </GlassCard>
      ))}

      {/* Info section */}
      <GlassCard style={styles.infoCard}>
        <Text style={styles.infoTitle}>Why You See These Alerts</Text>
        <View style={styles.infoContent}>
          <Text style={styles.infoText}>
            • We proactively monitor your document expiry dates to keep you compliant
          </Text>
          <Text style={styles.infoText}>
            • Critical alerts appear when documents expire within 30 days
          </Text>
          <Text style={styles.infoText}>
            • Submit renewals well in advance to avoid service interruption
          </Text>
          <Text style={styles.infoText}>
            • Keep your profile updated with the latest document images
          </Text>
        </View>
      </GlassCard>
    </ScrollView>
  );
}

function formatDate(dateString) {
  if (!dateString) return 'N/A';
  try {
    return formatToIST(dateString, { year: 'numeric', month: 'short', day: 'numeric' });
  } catch {
    return dateString;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  summaryCard: {
    marginBottom: 16,
    padding: 16,
    backgroundColor: `${COLORS.primary}08`,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 6,
  },
  summaryBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  summaryBadgeCritical: {
    backgroundColor: '#FF3B30',
  },
  summaryBadgeWarning: {
    backgroundColor: '#FF9500',
  },
  summaryBadgeText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 12,
  },
  summaryText: {
    fontSize: 13,
    color: COLORS.text,
  },
  alertCard: {
    marginBottom: 12,
    padding: 14,
  },
  alertCardCritical: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF3B30',
    backgroundColor: '#FF3B3008',
  },
  alertCardWarning: {
    borderLeftWidth: 4,
    borderLeftColor: '#FF9500',
    backgroundColor: '#FF950008',
  },
  alertCardInfo: {
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    backgroundColor: `${COLORS.primary}08`,
  },
  alertHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  alertTitleContainer: {
    flexDirection: 'row',
    flex: 1,
  },
  alertIcon: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 10,
    marginTop: 2,
  },
  alertIconCritical: {
    backgroundColor: '#FF3B30',
  },
  alertIconWarning: {
    backgroundColor: '#FF9500',
  },
  alertIconInfo: {
    backgroundColor: COLORS.primary,
  },
  alertTitleText: {
    flex: 1,
  },
  alertTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  alertSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  alertBadge: {
    fontSize: 10,
    fontWeight: '700',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  alertBadgeCritical: {
    backgroundColor: '#FF3B30',
    color: '#fff',
  },
  alertBadgeWarning: {
    backgroundColor: '#FF9500',
    color: '#fff',
  },
  alertBadgeInfo: {
    backgroundColor: COLORS.primary,
    color: '#fff',
  },
  alertMessage: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 8,
    lineHeight: 16,
  },
  daysContainer: {
    marginVertical: 8,
    paddingVertical: 6,
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 4,
    paddingHorizontal: 8,
  },
  daysText: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    textAlign: 'center',
  },
  alertActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  renewButton: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  renewButtonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  dismissButton: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    borderRadius: 6,
  },
  dismissButtonText: {
    color: COLORS.text,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
  },
  infoCard: {
    marginTop: 8,
    padding: 12,
    backgroundColor: `${COLORS.primary}08`,
  },
  infoTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  infoContent: {
    gap: 6,
  },
  infoText: {
    fontSize: 11,
    color: COLORS.textSecondary,
    lineHeight: 15,
  },
  errorText: {
    color: COLORS.error,
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
});
