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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useEnhancedMessaging } from '../hooks/useEnhancedMessaging';

interface EnhancedMessagingUIProps {
  token: string | null;
  userId: string;
  conversationId?: string;
  onBlockUser?: (userId: string) => void;
  onArchiveConversation?: (conversationId: string) => void;
}

export const EnhancedMessagingUI: React.FC<EnhancedMessagingUIProps> = ({
  token,
  userId,
  conversationId,
  onBlockUser,
  onArchiveConversation,
}) => {
  const {
    loading,
    getBlockedUsers,
    getArchivedConversations,
    searchMessages,
    blockUser,
    unblockUser,
    isUserBlocked,
  } = useEnhancedMessaging(token, userId);

  const [activeTab, setActiveTab] = useState<'chat' | 'blocked' | 'archived' | 'search'>('chat');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockingUserId, setBlockingUserId] = useState('');
  const [blockReason, setBlockReason] = useState('');
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [archivedConversations, setArchivedConversations] = useState([]);

  useEffect(() => {
    const blocked = getBlockedUsers();
    const archived = getArchivedConversations();
    setBlockedUsers(blocked);
    setArchivedConversations(archived);
  }, [getBlockedUsers, getArchivedConversations]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {return;}
    try {
      const results = await searchMessages(searchQuery, conversationId);
      setSearchResults(results);
    } catch (error) {
      Alert.alert('Search Error', 'Failed to search messages');
    }
  };

  const handleBlockUser = async () => {
    if (!blockingUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }

    try {
      await blockUser(blockingUserId, blockingUserId, blockReason);
      Alert.alert('Success', 'User blocked successfully');
      setShowBlockModal(false);
      setBlockingUserId('');
      setBlockReason('');
      if (onBlockUser) {onBlockUser(blockingUserId);}
    } catch (error) {
      Alert.alert('Error', 'Failed to block user');
    }
  };

  const handleUnblockUser = async (blockedUserId: string) => {
    try {
      await unblockUser(blockedUserId);
      Alert.alert('Success', 'User unblocked');
      const updated = blockedUsers.filter(u => u.blockedUserId !== blockedUserId);
      setBlockedUsers(updated);
    } catch (error) {
      Alert.alert('Error', 'Failed to unblock user');
    }
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
      {/* Tabs */}
      <View style={styles.tabContainer}>
        <Pressable
          onPress={() => setActiveTab('chat')}
          style={[styles.tab, activeTab === 'chat' && styles.activeTab]}
        >
          <MaterialIcons name="chat" size={20} color={activeTab === 'chat' ? '#2196F3' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTabText]}>Chat</Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('search')}
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
        >
          <MaterialIcons name="search" size={20} color={activeTab === 'search' ? '#2196F3' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'search' && styles.activeTabText]}>Search</Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('archived')}
          style={[styles.tab, activeTab === 'archived' && styles.activeTab]}
        >
          <MaterialIcons name="archive" size={20} color={activeTab === 'archived' ? '#2196F3' : '#999'} />
          <Text style={[styles.tabText, activeTab === 'archived' && styles.activeTabText]}>
            Archived ({archivedConversations.length})
          </Text>
        </Pressable>

        <Pressable
          onPress={() => setActiveTab('blocked')}
          style={[styles.tab, activeTab === 'blocked' && styles.activeTab]}
        >
          <MaterialIcons
            name="block"
            size={20}
            color={activeTab === 'blocked' ? '#2196F3' : '#999'}
          />
          <Text style={[styles.tabText, activeTab === 'blocked' && styles.activeTabText]}>
            Blocked ({blockedUsers.length})
          </Text>
        </Pressable>
      </View>

      <ScrollView style={styles.content}>
        {/* Search Tab */}
        {activeTab === 'search' && (
          <View>
            <View style={styles.searchContainer}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search messages..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#999"
              />
              <Pressable onPress={handleSearch} style={styles.searchButton}>
                <MaterialIcons name="search" size={24} color="white" />
              </Pressable>
            </View>

            {searchResults.length > 0 ? (
              <FlatList
                data={searchResults}
                keyExtractor={(item) => item.messageId}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.searchResultCard}>
                    <View style={styles.resultHeader}>
                      <Text style={styles.resultUser}>{item.otherUserName}</Text>
                      <Text style={styles.resultTime}>
                        {new Date(item.timestamp).toLocaleDateString()}
                      </Text>
                    </View>
                    <Text style={styles.resultContent} numberOfLines={2}>
                      {item.content}
                    </Text>
                  </View>
                )}
              />
            ) : searchQuery ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="search_off" size={48} color="#CCC" />
                <Text style={styles.emptyStateText}>No messages found</Text>
              </View>
            ) : null}
          </View>
        )}

        {/* Blocked Users Tab */}
        {activeTab === 'blocked' && (
          <View>
            <Pressable
              onPress={() => setShowBlockModal(true)}
              style={styles.blockUserButton}
            >
              <MaterialIcons name="person_add" size={20} color="white" />
              <Text style={styles.blockUserButtonText}>Block User</Text>
            </Pressable>

            {blockedUsers.length > 0 ? (
              <FlatList
                data={blockedUsers}
                keyExtractor={(item) => item.blockedUserId}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.blockedUserCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.blockedUserName}>{item.blockedUserName}</Text>
                      {item.reason && (
                        <Text style={styles.blockedUserReason}>{item.reason}</Text>
                      )}
                      <Text style={styles.blockedUserDate}>
                        Blocked: {new Date(item.blockedAt).toLocaleDateString()}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleUnblockUser(item.blockedUserId)}
                      style={styles.unblockButton}
                    >
                      <MaterialIcons name="close" size={20} color="#F44336" />
                    </Pressable>
                  </View>
                )}
              />
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="check_circle" size={48} color="#4CAF50" />
                <Text style={styles.emptyStateText}>No blocked users</Text>
              </View>
            )}
          </View>
        )}

        {/* Archived Conversations Tab */}
        {activeTab === 'archived' && (
          <View>
            {archivedConversations.length > 0 ? (
              <FlatList
                data={archivedConversations}
                keyExtractor={(item) => item.id}
                scrollEnabled={false}
                renderItem={({ item }) => (
                  <View style={styles.archivedConversationCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.archivedUserName}>{item.otherUserName}</Text>
                      <Text style={styles.archivedMessageCount}>
                        {item.messageCount} messages
                      </Text>
                      <Text style={styles.archivedDate}>
                        Archived: {new Date(item.archivedAt).toLocaleDateString()}
                      </Text>
                    </View>
                  </View>
                )}
              />
            ) : (
              <View style={styles.emptyState}>
                <MaterialIcons name="archive" size={48} color="#999" />
                <Text style={styles.emptyStateText}>No archived conversations</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Block User Modal */}
      <Modal visible={showBlockModal} animationType="slide" transparent={false}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setShowBlockModal(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </Pressable>
            <Text style={styles.modalTitle}>Block User</Text>
            <View style={{ width: 24 }} />
          </View>

          <View style={styles.modalContent}>
            <TextInput
              style={styles.modalInput}
              placeholder="User ID"
              value={blockingUserId}
              onChangeText={setBlockingUserId}
              placeholderTextColor="#999"
            />

            <TextInput
              style={[styles.modalInput, { height: 100 }]}
              placeholder="Reason (optional)"
              value={blockReason}
              onChangeText={setBlockReason}
              multiline
              placeholderTextColor="#999"
            />

            <Pressable onPress={handleBlockUser} style={styles.blockConfirmButton}>
              <Text style={styles.blockConfirmButtonText}>Block User</Text>
            </Pressable>

            <Pressable
              onPress={() => setShowBlockModal(false)}
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
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingHorizontal: 8,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: 'transparent',
  },
  activeTab: {
    borderBottomColor: '#2196F3',
  },
  tabText: {
    marginLeft: 6,
    fontSize: 11,
    color: '#999',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#2196F3',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  searchContainer: {
    flexDirection: 'row',
    marginBottom: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  searchButton: {
    backgroundColor: '#2196F3',
    borderRadius: 8,
    width: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  resultUser: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  resultTime: {
    fontSize: 12,
    color: '#999',
  },
  resultContent: {
    fontSize: 13,
    color: '#666',
    lineHeight: 18,
  },
  blockUserButton: {
    backgroundColor: '#F44336',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  blockUserButtonText: {
    color: 'white',
    fontWeight: '600',
    marginLeft: 8,
  },
  blockedUserCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  blockedUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  blockedUserReason: {
    fontSize: 12,
    color: '#F44336',
    marginTop: 4,
  },
  blockedUserDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  unblockButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFE0E0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  archivedConversationCard: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#FF9800',
    flexDirection: 'row',
    alignItems: 'center',
  },
  archivedUserName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  archivedMessageCount: {
    fontSize: 12,
    color: '#FF9800',
    marginTop: 4,
  },
  archivedDate: {
    fontSize: 11,
    color: '#999',
    marginTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginTop: 12,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  modalContent: {
    padding: 16,
  },
  modalInput: {
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 14,
    marginBottom: 12,
  },
  blockConfirmButton: {
    backgroundColor: '#F44336',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
    marginBottom: 8,
  },
  blockConfirmButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  cancelButton: {
    backgroundColor: '#E0E0E0',
    borderRadius: 8,
    padding: 14,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#333',
    fontWeight: '600',
    fontSize: 14,
  },
});
