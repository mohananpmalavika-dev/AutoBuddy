import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import ConfirmationDialog from './ConfirmationDialog';

const AdminRateLimitConfig = ({ token, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [rateLimits, setRateLimits] = useState([]);
  const [endpointLimits, setEndpointLimits] = useState([]);
  const [activeTab, setActiveTab] = useState('global');
  const [editingLimit, setEditingLimit] = useState(null);
  const [editingEndpoint, setEditingEndpoint] = useState(null);
  const [confirmDialog, setConfirmDialog] = useState(null);
  const [formData, setFormData] = useState({
    limit_type: '',
    max_requests: '',
    window_seconds: '',
    description: '',
    enabled: true,
  });
  const [endpointFormData, setEndpointFormData] = useState({
    endpoint: '',
    limit_type: 'moderate',
    max_requests: '',
    window_seconds: '',
    description: '',
    enabled: true,
  });

  const fetchRateLimits = useCallback(async () => {
    try {
      setLoading(true);
      const response = await apiRequest('/admin/config/rate-limits', { token });
      setRateLimits(response.limits || []);
    } catch (error) {
      console.error('Error fetching rate limits:', error);
      Alert.alert('Error', 'Failed to fetch rate limits');
    } finally {
      setLoading(false);
    }
  }, [token]);

  const fetchEndpointLimits = useCallback(async () => {
    try {
      const response = await apiRequest('/admin/config/rate-limits/endpoints', { token });
      setEndpointLimits(response.endpoints || []);
    } catch (error) {
      console.error('Error fetching endpoint limits:', error);
    }
  }, [token]);

  // Fetch rate limits on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchRateLimits();
    fetchEndpointLimits();
  }, [fetchEndpointLimits, fetchRateLimits]);

  const handleEditLimit = (limit) => {
    setEditingLimit(limit.limit_type);
    setFormData({
      limit_type: limit.limit_type,
      max_requests: limit.max_requests.toString(),
      window_seconds: limit.window_seconds.toString(),
      description: limit.description || '',
      enabled: limit.enabled,
    });
  };

  const handleEditEndpoint = (endpoint) => {
    setEditingEndpoint(endpoint.config_id);
    setEndpointFormData({
      endpoint: endpoint.endpoint,
      limit_type: endpoint.limit_type,
      max_requests: endpoint.max_requests.toString(),
      window_seconds: endpoint.window_seconds.toString(),
      description: endpoint.description || '',
      enabled: endpoint.enabled,
    });
  };

  const handleSaveLimit = async () => {
    if (!formData.limit_type || !formData.max_requests || !formData.window_seconds) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      await apiRequest(`/admin/config/rate-limits/${formData.limit_type}`, {
        method: 'PUT',
        token,
        body: {
          limit_type: formData.limit_type,
          max_requests: Number.parseInt(formData.max_requests, 10),
          window_seconds: Number.parseInt(formData.window_seconds, 10),
          description: formData.description,
          enabled: formData.enabled,
        },
      });

      Alert.alert('Success', 'Rate limit updated successfully');
      setEditingLimit(null);
      await fetchRateLimits();
    } catch (error) {
      console.error('Error saving rate limit:', error);
      Alert.alert('Error', error.message || 'Failed to save rate limit');
    } finally {
      setLoading(false);
    }
  };

  const resetEndpointForm = () => {
    setEndpointFormData({
      endpoint: '',
      limit_type: 'moderate',
      max_requests: '',
      window_seconds: '',
      description: '',
      enabled: true,
    });
  };

  const handleAddEndpoint = () => {
    setEditingEndpoint('');
    resetEndpointForm();
  };

  const handleSaveEndpoint = async () => {
    if (!endpointFormData.endpoint || !endpointFormData.max_requests || !endpointFormData.window_seconds) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      if (editingEndpoint) {
        await apiRequest(`/admin/config/rate-limits/endpoints/${editingEndpoint}`, {
          method: 'PUT',
          token,
          body: {
            endpoint: endpointFormData.endpoint,
            limit_type: endpointFormData.limit_type,
            max_requests: Number.parseInt(endpointFormData.max_requests, 10),
            window_seconds: Number.parseInt(endpointFormData.window_seconds, 10),
            description: endpointFormData.description,
            enabled: endpointFormData.enabled,
          },
        });
        Alert.alert('Success', 'Endpoint rate limit updated successfully');
      } else {
        await apiRequest('/admin/config/rate-limits/endpoints/add', {
          method: 'POST',
          token,
          body: {
            endpoint: endpointFormData.endpoint,
            limit_type: endpointFormData.limit_type,
            max_requests: Number.parseInt(endpointFormData.max_requests, 10),
            window_seconds: Number.parseInt(endpointFormData.window_seconds, 10),
            description: endpointFormData.description,
            enabled: endpointFormData.enabled,
          },
        });
        Alert.alert('Success', 'Endpoint rate limit created successfully');
      }
      setEditingEndpoint(null);
      resetEndpointForm();
      await fetchEndpointLimits();
    } catch (error) {
      console.error('Error saving endpoint rate limit:', error);
      Alert.alert('Error', error.message || 'Failed to save endpoint rate limit');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteEndpoint = async (config_id) => {
    try {
      setLoading(true);
      await apiRequest(`/admin/config/rate-limits/endpoints/${config_id}`, {
        method: 'DELETE',
        token,
      });
      Alert.alert('Success', 'Endpoint rate limit deleted successfully');
      await fetchEndpointLimits();
    } catch (error) {
      console.error('Error deleting endpoint rate limit:', error);
      Alert.alert('Error', error.message || 'Failed to delete endpoint rate limit');
    } finally {
      setLoading(false);
    }
  };

  const renderLimitCard = (limit) => (
    <View key={limit.limit_id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={styles.cardTitle}>{limit.limit_type.toUpperCase()}</Text>
          {limit.is_default && <Text style={styles.badgeDefault}>Default</Text>}
        </View>
        <TouchableOpacity
          onPress={() => handleEditLimit(limit)}
          disabled={loading}
          style={styles.editBtn}
        >
          <Text style={styles.editBtnText}>Edit</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Max Requests:</Text>
          <Text style={styles.value}>{limit.max_requests}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Window:</Text>
          <Text style={styles.value}>{limit.window_seconds}s</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[styles.value, { color: limit.enabled ? COLORS.success : COLORS.danger }]}>
            {limit.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
        {limit.description && (
          <View style={styles.cardRow}>
            <Text style={styles.label}>Description:</Text>
            <Text style={styles.description}>{limit.description}</Text>
          </View>
        )}
      </View>
    </View>
  );

  const renderEndpointCard = (endpoint) => (
    <View key={endpoint.config_id} style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{endpoint.endpoint}</Text>
          <Text style={styles.cardSubtitle}>{endpoint.limit_type}</Text>
        </View>
        <View style={styles.cardActions}>
          <TouchableOpacity
            onPress={() => handleEditEndpoint(endpoint)}
            disabled={loading}
            style={[styles.actionBtn, styles.editBtn]}
          >
            <Text style={styles.actionBtnText}>✎</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() =>
              setConfirmDialog({
                title: 'Delete Endpoint Limit',
                message: `Are you sure you want to delete the rate limit for ${endpoint.endpoint}?`,
                onConfirm: () => {
                  handleDeleteEndpoint(endpoint.config_id);
                  setConfirmDialog(null);
                },
              })
            }
            disabled={loading}
            style={[styles.actionBtn, styles.deleteBtn]}
          >
            <Text style={styles.actionBtnText}>🗑</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.cardContent}>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Max Requests:</Text>
          <Text style={styles.value}>{endpoint.max_requests}</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Window:</Text>
          <Text style={styles.value}>{endpoint.window_seconds}s</Text>
        </View>
        <View style={styles.cardRow}>
          <Text style={styles.label}>Status:</Text>
          <Text style={[styles.value, { color: endpoint.enabled ? COLORS.success : COLORS.danger }]}>
            {endpoint.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>
    </View>
  );

  if (loading && rateLimits.length === 0) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading rate limit configurations...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Rate Limit Configuration</Text>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'global' && styles.activeTab]}
          onPress={() => {
            setActiveTab('global');
            setEditingLimit(null);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'global' && styles.activeTabText]}>
            Global Limits
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'endpoints' && styles.activeTab]}
          onPress={() => {
            setActiveTab('endpoints');
            setEditingEndpoint(null);
          }}
        >
          <Text style={[styles.tabText, activeTab === 'endpoints' && styles.activeTabText]}>
            Endpoint Limits
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {activeTab === 'global' && (
          <View>
            {editingLimit && (
              <View style={[styles.card, styles.formCard]}>
                <Text style={styles.formTitle}>Edit Rate Limit: {editingLimit.toUpperCase()}</Text>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Max Requests *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 5"
                    value={formData.max_requests}
                    onChangeText={(text) =>
                      setFormData({ ...formData, max_requests: text })
                    }
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Window (seconds) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 60"
                    value={formData.window_seconds}
                    onChangeText={(text) =>
                      setFormData({ ...formData, window_seconds: text })
                    }
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    placeholder="Enter description"
                    value={formData.description}
                    onChangeText={(text) =>
                      setFormData({ ...formData, description: text })
                    }
                    multiline
                    numberOfLines={3}
                    editable={!loading}
                  />
                </View>

                <View style={styles.checkboxGroup}>
                  <TouchableOpacity
                    onPress={() =>
                      setFormData({ ...formData, enabled: !formData.enabled })
                    }
                    style={styles.checkbox}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        formData.enabled && styles.checkboxBoxChecked,
                      ]}
                    >
                      {formData.enabled && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Enabled</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingLimit(null);
                      setFormData({
                        limit_type: '',
                        max_requests: '',
                        window_seconds: '',
                        description: '',
                        enabled: true,
                      });
                    }}
                    style={[styles.btn, styles.cancelBtn]}
                    disabled={loading}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveLimit}
                    style={[styles.btn, styles.saveBtn]}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {rateLimits.map((limit) => renderLimitCard(limit))}

            {rateLimits.length === 0 && !editingLimit && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No rate limits configured</Text>
              </View>
            )}
          </View>
        )}

        {activeTab === 'endpoints' && (
          <View>
            {editingEndpoint !== null && (
              <View style={[styles.card, styles.formCard]}>
                <Text style={styles.formTitle}>
                  {editingEndpoint ? 'Edit' : 'Add'} Endpoint Rate Limit
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Endpoint Path *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., /api/bookings"
                    value={endpointFormData.endpoint}
                    onChangeText={(text) =>
                      setEndpointFormData({ ...endpointFormData, endpoint: text })
                    }
                    editable={!loading && !editingEndpoint}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Limit Type *</Text>
                  <View style={styles.pickContainer}>
                    {['strict', 'moderate', 'normal'].map((type) => (
                      <TouchableOpacity
                        key={type}
                        onPress={() =>
                          setEndpointFormData({ ...endpointFormData, limit_type: type })
                        }
                        style={[
                          styles.pickOption,
                          endpointFormData.limit_type === type && styles.pickOptionActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.pickOptionText,
                            endpointFormData.limit_type === type && styles.pickOptionTextActive,
                          ]}
                        >
                          {type}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Max Requests *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 30"
                    value={endpointFormData.max_requests}
                    onChangeText={(text) =>
                      setEndpointFormData({ ...endpointFormData, max_requests: text })
                    }
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Window (seconds) *</Text>
                  <TextInput
                    style={styles.input}
                    placeholder="e.g., 60"
                    value={endpointFormData.window_seconds}
                    onChangeText={(text) =>
                      setEndpointFormData({ ...endpointFormData, window_seconds: text })
                    }
                    keyboardType="number-pad"
                    editable={!loading}
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.inputLabel}>Description</Text>
                  <TextInput
                    style={[styles.input, styles.multilineInput]}
                    placeholder="Enter description"
                    value={endpointFormData.description}
                    onChangeText={(text) =>
                      setEndpointFormData({ ...endpointFormData, description: text })
                    }
                    multiline
                    numberOfLines={3}
                    editable={!loading}
                  />
                </View>

                <View style={styles.checkboxGroup}>
                  <TouchableOpacity
                    onPress={() =>
                      setEndpointFormData({
                        ...endpointFormData,
                        enabled: !endpointFormData.enabled,
                      })
                    }
                    style={styles.checkbox}
                  >
                    <View
                      style={[
                        styles.checkboxBox,
                        endpointFormData.enabled && styles.checkboxBoxChecked,
                      ]}
                    >
                      {endpointFormData.enabled && <Text style={styles.checkmark}>✓</Text>}
                    </View>
                    <Text style={styles.checkboxLabel}>Enabled</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formActions}>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingEndpoint(null);
                      resetEndpointForm();
                    }}
                    style={[styles.btn, styles.cancelBtn]}
                    disabled={loading}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleSaveEndpoint}
                    style={[styles.btn, styles.saveBtn]}
                    disabled={loading}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            <TouchableOpacity
              onPress={handleAddEndpoint}
              style={[styles.addBtn, editingEndpoint !== null && { opacity: 0.6 }]}
              disabled={editingEndpoint !== null}
            >
              <Text style={styles.addBtnText}>+ Add Endpoint Limit</Text>
            </TouchableOpacity>

            {endpointLimits.map((endpoint) => renderEndpointCard(endpoint))}

            {endpointLimits.length === 0 && editingEndpoint === null && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateText}>No endpoint limits configured</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {confirmDialog && (
        <ConfirmationDialog
          title={confirmDialog.title}
          message={confirmDialog.message}
          onConfirm={confirmDialog.onConfirm}
          onCancel={() => setConfirmDialog(null)}
        />
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    color: COLORS.text,
  },
  closeBtn: {
    padding: 8,
  },
  closeBtnText: {
    fontSize: 20,
    color: COLORS.textSecondary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.primary,
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    ...SHADOWS.default,
  },
  formCard: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  cardSubtitle: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  badgeDefault: {
    fontSize: 10,
    color: COLORS.success,
    fontWeight: '600',
    marginTop: 4,
  },
  cardContent: {
    gap: 8,
  },
  cardRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  value: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    color: COLORS.textSecondary,
    maxWidth: '60%',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionBtn: {
    padding: 8,
    borderRadius: 8,
    minWidth: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteBtn: {
    backgroundColor: COLORS.danger,
  },
  actionBtnText: {
    color: '#fff',
    fontSize: 16,
  },
  formTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  formGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: COLORS.text,
    backgroundColor: COLORS.background,
  },
  multilineInput: {
    textAlignVertical: 'top',
    paddingVertical: 12,
  },
  pickContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  pickOption: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  pickOptionActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pickOptionText: {
    fontSize: 13,
    color: COLORS.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  pickOptionTextActive: {
    color: '#fff',
  },
  checkboxGroup: {
    marginBottom: 16,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: COLORS.border,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxBoxChecked: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  checkmark: {
    color: '#fff',
    fontWeight: 'bold',
  },
  checkboxLabel: {
    fontSize: 14,
    color: COLORS.text,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtn: {
    backgroundColor: COLORS.primary,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  cancelBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.text,
    fontSize: 14,
    fontWeight: '600',
  },
  addBtn: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  addBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  editBtn: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
  },
  editBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
});

export default AdminRateLimitConfig;
