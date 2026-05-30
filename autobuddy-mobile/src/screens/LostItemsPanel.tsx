import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  FlatList,
  TouchableOpacity,
  TextInput,
  Modal,
  StyleSheet,
  SafeAreaView,
  Text,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Picker } from '@react-native-picker/picker';
import { lostItemsAPI } from '@/services/apiClient';
import { getSocket } from '@/services/socketClient';

type LostItem = {
  _id: string;
  id?: string;
  item_name: string;
  category: string;
  description?: string;
  location_lost: string;
  booking_id?: string | null;
  contact_preference: string;
  created_at: string;
  status: string;
  resolution_notes?: string;
};

const LostItemsPanel: React.FC<{ userId: string; userType: 'passenger' | 'driver' | 'admin' }> = ({
  userId,
  userType,
}) => {
  const [items, setItems] = useState<LostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<LostItem | null>(null);
  const [adminStatusUpdate, setAdminStatusUpdate] = useState('');

  const [formData, setFormData] = useState({
    item_name: '',
    category: 'other',
    description: '',
    location_lost: '',
    booking_id: '',
    contact_preference: 'in_app',
  });

  const categories = ['phone', 'wallet', 'bag', 'clothing', 'accessory', 'other'];
  const contactPreferences = ['in_app', 'sms', 'email'];
  const statusOptions = ['reported', 'found', 'returned', 'not_found', 'closed'];

  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const result = await lostItemsAPI.listItems();
      setItems((result.items || result || []) as LostItem[]);
    } catch (error) {
      console.error('Error loading lost items:', error);
      Alert.alert('Error', 'Failed to load lost items');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadItems();
    setRefreshing(false);
  };

  const registerSocketListeners = useCallback(() => {
    const socket = getSocket();
    if (!socket) {return;}

    socket.on('lost_item_reported', (data: LostItem) => {
      setItems((prev) => [data, ...prev]);
    });

    socket.on('lost_item_status_updated', (data: { item_id: string; status: string }) => {
      setItems((prev) =>
        prev.map((item) =>
          item._id === data.item_id ? { ...item, status: data.status } : item
        )
      );
      setSelectedItem((prev) =>
        prev && prev._id === data.item_id ? { ...prev, status: data.status } : prev
      );
    });
  }, []);

  useEffect(() => {
    void Promise.resolve().then(loadItems);
    registerSocketListeners();

    return () => {
      const socket = getSocket();
      if (socket) {
        socket.off('lost_item_reported');
        socket.off('lost_item_status_updated');
      }
    };
  }, [loadItems, registerSocketListeners, userId]);

  const handleReportItem = async () => {
    if (!formData.item_name.trim() || !formData.location_lost.trim()) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    try {
      setLoading(true);
      const newItem = await lostItemsAPI.reportItem({
        item_name: formData.item_name,
        category: formData.category,
        description: formData.description,
        location_lost: formData.location_lost,
        booking_id: formData.booking_id || null,
        contact_preference: formData.contact_preference,
      });

      setItems([newItem as LostItem, ...items]);
      setFormData({
        item_name: '',
        category: 'other',
        description: '',
        location_lost: '',
        booking_id: '',
        contact_preference: 'in_app',
      });
      setShowCreateModal(false);
      Alert.alert('Success', 'Lost item reported');
    } catch (error) {
      console.error('Error reporting item:', error);
      Alert.alert('Error', 'Failed to report lost item');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (newStatus: string) => {
    if (!selectedItem) {return;}

    try {
      const updated = await lostItemsAPI.updateItemStatus(selectedItem._id, {
        status: newStatus,
        resolution_notes: userType === 'admin' ? adminStatusUpdate : undefined,
      });

      setItems((prev) =>
        prev.map((item) => (item._id === selectedItem._id ? (updated as LostItem) : item))
      );
      setSelectedItem(updated as LostItem);
      setAdminStatusUpdate('');

      Alert.alert('Success', `Item status updated to ${newStatus}`);
    } catch {
      Alert.alert('Error', 'Failed to update item status');
    }
  };

  const handleDeleteItem = async () => {
    if (!selectedItem) {return;}

    Alert.alert('Delete Report', 'Are you sure you want to delete this report?', [
      { text: 'Cancel' },
      {
        text: 'Delete',
        onPress: async () => {
          try {
            await lostItemsAPI.deleteItem(selectedItem._id);
            setItems((prev) => prev.filter((i) => i._id !== selectedItem._id));
            setShowDetailModal(false);
            Alert.alert('Success', 'Report deleted');
          } catch {
            Alert.alert('Error', 'Failed to delete report');
          }
        },
      },
    ]);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      reported: '#FFD93D',
      found: '#4ECDC4',
      returned: '#51CF66',
      not_found: '#FF6B6B',
      closed: '#95A5A6',
    };
    return colors[status] || '#95A5A6';
  };

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, string> = {
      phone: '📱',
      wallet: '👛',
      bag: '🎒',
      clothing: '👕',
      accessory: '⌚',
      other: '📦',
    };
    return icons[category] || '📦';
  };

  const LostItemCard = ({ item }: { item: LostItem }) => (
    <TouchableOpacity
      style={styles.itemCard}
      onPress={() => {
        setSelectedItem(item);
        setShowDetailModal(true);
      }}
    >
      <View style={styles.itemHeader}>
        <View style={styles.itemTitleSection}>
          <Text style={styles.itemTitle}>
            {getCategoryIcon(item.category)} {item.item_name}
          </Text>
          <Text style={styles.itemCategory}>{item.category}</Text>
        </View>
        <View
          style={[styles.statusBadge, { backgroundColor: getStatusColor(item.status) }]}
        >
          <Text style={styles.statusText}>{item.status.toUpperCase()}</Text>
        </View>
      </View>

      <Text style={styles.itemLocation}>📍 {item.location_lost}</Text>

      {item.description && (
        <Text style={styles.itemDescription} numberOfLines={2}>
          {item.description}
        </Text>
      )}

      <View style={styles.itemMeta}>
        <Text style={styles.itemDate}>
          {new Date(item.created_at).toLocaleDateString()}
        </Text>
        {item.booking_id && <Text style={styles.bookingBadge}>Booking linked</Text>}
      </View>
    </TouchableOpacity>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>Loading lost items...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Lost Items</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateModal(true)}
        >
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Items list */}
      {items.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="folder-open" size={64} color="#ddd" />
          <Text style={styles.emptyText}>No lost items reported</Text>
          <Text style={styles.emptySubText}>Report a lost item if needed</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          renderItem={({ item }: { item: LostItem }) => <LostItemCard item={item} />}
          keyExtractor={(item) => item._id || String(item.id)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Create report modal */}
      <Modal visible={showCreateModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Report Lost Item</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.formLabel}>Item Name *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., iPhone 14 Pro"
              value={formData.item_name}
              onChangeText={(text) =>
                setFormData({ ...formData, item_name: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Category *</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.category}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, category: value })
                }
              >
                {categories.map((cat) => (
                  <Picker.Item key={cat} label={cat} value={cat} />
                ))}
              </Picker>
            </View>

            <Text style={styles.formLabel}>Location Lost *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Where was it lost?"
              value={formData.location_lost}
              onChangeText={(text) =>
                setFormData({ ...formData, location_lost: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.descriptionInput]}
              placeholder="Additional details (color, condition, etc.)"
              value={formData.description}
              onChangeText={(text) =>
                setFormData({ ...formData, description: text })
              }
              multiline
              numberOfLines={4}
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Booking ID (Optional)</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Link to a specific ride"
              value={formData.booking_id}
              onChangeText={(text) =>
                setFormData({ ...formData, booking_id: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Contact Preference</Text>
            <View style={styles.pickerContainer}>
              <Picker
                selectedValue={formData.contact_preference}
                onValueChange={(value: string) =>
                  setFormData({ ...formData, contact_preference: value })
                }
              >
                {contactPreferences.map((pref) => (
                  <Picker.Item key={pref} label={pref} value={pref} />
                ))}
              </Picker>
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleReportItem}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.submitButtonText}>Report Item</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Detail modal */}
      <Modal visible={showDetailModal} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetailModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Item Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedItem && (
            <ScrollView style={styles.modalContent}>
              <View style={styles.detailSection}>
                <Text style={styles.itemTitleDetail}>
                  {getCategoryIcon(selectedItem.category)} {selectedItem.item_name}
                </Text>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Category</Text>
                  <Text style={styles.detailValue}>{selectedItem.category}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: getStatusColor(selectedItem.status) },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {selectedItem.status.toUpperCase()}
                    </Text>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Location Lost</Text>
                  <Text style={styles.detailValue}>{selectedItem.location_lost}</Text>
                </View>

                {selectedItem.description && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Description</Text>
                    <Text style={styles.detailValue}>{selectedItem.description}</Text>
                  </View>
                )}

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Reported</Text>
                  <Text style={styles.detailValue}>
                    {new Date(selectedItem.created_at).toLocaleString()}
                  </Text>
                </View>

                {selectedItem.booking_id && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Booking ID</Text>
                    <Text style={styles.detailValue}>{selectedItem.booking_id}</Text>
                  </View>
                )}

                {selectedItem.resolution_notes && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Admin Notes</Text>
                    <Text style={styles.detailValue}>
                      {selectedItem.resolution_notes}
                    </Text>
                  </View>
                )}
              </View>

              {/* Admin controls */}
              {userType === 'admin' && (
                <View style={styles.adminSection}>
                  <Text style={styles.sectionTitle}>Admin Controls</Text>

                  <View style={styles.statusUpdateContainer}>
                    <Text style={styles.formLabel}>Update Status</Text>
                    <View style={styles.pickerContainer}>
                      <Picker
                        selectedValue={adminStatusUpdate || selectedItem.status}
                        onValueChange={(value: string) => setAdminStatusUpdate(value)}
                      >
                        {statusOptions.map((status) => (
                          <Picker.Item
                            key={status}
                            label={status}
                            value={status}
                          />
                        ))}
                      </Picker>
                    </View>
                  </View>

                  <TouchableOpacity
                    style={styles.updateButton}
                    onPress={() =>
                      handleUpdateStatus(adminStatusUpdate || selectedItem.status)
                    }
                  >
                    <Text style={styles.updateButtonText}>Update Status</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Action buttons */}
              {selectedItem.status !== 'closed' && (
                <View style={styles.actionButtons}>
                  {selectedItem.contact_preference === 'in_app' && (
                    <TouchableOpacity style={[styles.actionBtn, styles.contactBtn]}>
                      <MaterialIcons name="phone" size={20} color="white" />
                      <Text style={styles.actionBtnText}>Contact Driver</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    style={[styles.actionBtn, styles.deleteBtn]}
                    onPress={handleDeleteItem}
                  >
                    <MaterialIcons name="delete" size={20} color="white" />
                    <Text style={styles.actionBtnText}>Delete Report</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 12,
  },
  emptySubText: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  listContent: {
    padding: 8,
  },
  itemCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  itemTitleSection: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  itemCategory: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginLeft: 8,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'white',
  },
  itemLocation: {
    fontSize: 13,
    color: '#666',
    marginBottom: 6,
  },
  itemDescription: {
    fontSize: 12,
    color: '#999',
    marginBottom: 6,
  },
  itemMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemDate: {
    fontSize: 11,
    color: '#999',
  },
  bookingBadge: {
    fontSize: 10,
    color: '#4ECDC4',
    fontWeight: '500',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#fff',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  formLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  textInput: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    marginBottom: 16,
  },
  descriptionInput: {
    textAlignVertical: 'top',
    height: 100,
  },
  pickerContainer: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginBottom: 16,
  },
  submitButton: {
    backgroundColor: '#4ECDC4',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
  detailSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  itemTitleDetail: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  detailValue: {
    fontSize: 13,
    color: '#333',
  },
  adminSection: {
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFD93D',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  statusUpdateContainer: {
    marginBottom: 12,
  },
  updateButton: {
    backgroundColor: '#FFD93D',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
  },
  updateButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  actionButtons: {
    flexDirection: 'row',
    marginTop: 16,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  contactBtn: {
    backgroundColor: '#4ECDC4',
  },
  deleteBtn: {
    backgroundColor: '#FF6B6B',
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
});

export default LostItemsPanel;
