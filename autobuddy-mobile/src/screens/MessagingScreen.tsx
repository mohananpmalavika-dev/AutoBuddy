import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useConversations } from '../hooks/useMessaging';
import { ChatWindow, ConversationPreview } from '../components/MessagingComponents';

interface Conversation {
  id?: string;
  participantId?: string;
  participantName?: string;
  lastMessage?: string;
  lastMessageTime?: string;
  unreadCount?: number;
  [key: string]: unknown;
}

interface MessagingScreenProps {
  token: string | null;
  userId: string;
}

export const MessagingScreen: React.FC<MessagingScreenProps> = ({
  token,
  userId,
}) => {
  const {
    conversations,
    loading,
    error,
    fetchConversations,
    createConversation,
    markConversationAsRead,
    getTotalUnreadCount,
  } = useConversations(token, userId);

  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [showNewConversationModal, setShowNewConversationModal] = useState(false);
  const [newConversationUserId, setNewConversationUserId] = useState('');
  const [creating, setCreating] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchConversations();
    setRefreshing(false);
  };

  const handleSelectConversation = (conversation: Conversation) => {
    setSelectedConversation(conversation);
    markConversationAsRead(conversation.id);
  };

  const handleCreateNewConversation = async () => {
    if (!newConversationUserId.trim()) {
      Alert.alert('Error', 'Please enter a user ID');
      return;
    }

    setCreating(true);
    try {
      const newConversation = await createConversation(newConversationUserId);
      if (newConversation) {
        setNewConversationUserId('');
        setShowNewConversationModal(false);
        handleSelectConversation(newConversation);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to create conversation');
    } finally {
      setCreating(false);
    }
  };

  const filteredConversations = conversations.filter((conv) =>
    conv.otherUserName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const unreadCount = getTotalUnreadCount();

  // If a conversation is selected, show chat window
  if (selectedConversation) {
    return (
      <View style={styles.container}>
        <View style={styles.chatHeader}>
          <Pressable onPress={() => setSelectedConversation(null)}>
            <MaterialIcons name="arrow-back" size={24} color="#000" />
          </Pressable>
          <Text style={styles.chatHeaderTitle}>
            {selectedConversation.otherUserName}
          </Text>
          <View style={styles.chatHeaderActions}>
            <Pressable style={styles.headerActionButton}>
              <MaterialIcons name="call" size={20} color="#2196F3" />
            </Pressable>
            <Pressable style={styles.headerActionButton}>
              <MaterialIcons name="more-vert" size={20} color="#2196F3" />
            </Pressable>
          </View>
        </View>

        <ChatWindow
          token={token}
          userId={userId}
          conversationId={selectedConversation.id}
          otherUserName={selectedConversation.otherUserName}
          otherUserRating={selectedConversation.otherUserRating}
        />
      </View>
    );
  }

  // Show conversations list
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleSection}>
          <Text style={styles.title}>Messages</Text>
          {unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </View>
        <Pressable
          style={styles.newMessageButton}
          onPress={() => setShowNewConversationModal(true)}
        >
          <MaterialIcons name="edit" size={20} color="#2196F3" />
        </Pressable>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <MaterialIcons name="search" size={20} color="#999" />
        <TextInput
          style={styles.searchInput}
          placeholder="Search conversations..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholderTextColor="#999"
        />
        {searchQuery.length > 0 && (
          <Pressable onPress={() => setSearchQuery('')}>
            <MaterialIcons name="close" size={20} color="#999" />
          </Pressable>
        )}
      </View>

      {/* Conversations List */}
      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#2196F3" />
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConversationPreview
              conversation={item}
              onPress={() => handleSelectConversation(item)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <MaterialIcons name="mail-outline" size={48} color="#ddd" />
              <Text style={styles.emptyText}>
                {searchQuery
                  ? 'No conversations match your search'
                  : 'No conversations yet'}
              </Text>
              {!searchQuery && (
                <Pressable
                  style={styles.emptyActionButton}
                  onPress={() => setShowNewConversationModal(true)}
                >
                  <MaterialIcons name="message" size={18} color="#fff" />
                  <Text style={styles.emptyActionButtonText}>Start a chat</Text>
                </Pressable>
              )}
            </View>
          }
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        />
      )}

      {/* New Conversation Modal */}
      <Modal
        visible={showNewConversationModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowNewConversationModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Start a new chat</Text>
              <Pressable onPress={() => setShowNewConversationModal(false)}>
                <MaterialIcons name="close" size={24} color="#000" />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.modalLabel}>User ID or Phone Number</Text>
              <TextInput
                style={styles.modalInput}
                placeholder="Enter user ID or phone number"
                value={newConversationUserId}
                onChangeText={setNewConversationUserId}
                placeholderTextColor="#999"
                editable={!creating}
              />

              <Pressable
                style={styles.modalButton}
                onPress={handleCreateNewConversation}
                disabled={creating}
              >
                {creating ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <>
                    <MaterialIcons name="message" size={18} color="#fff" />
                    <Text style={styles.modalButtonText}>Start Chat</Text>
                  </>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Error Banner */}
      {error && (
        <View style={styles.errorBanner}>
          <MaterialIcons name="error-outline" size={18} color="#F44336" />
          <Text style={styles.errorText}>{error.message}</Text>
          <Pressable onPress={fetchConversations}>
            <MaterialIcons name="refresh" size={18} color="#F44336" />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitleSection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#000',
  },
  unreadBadge: {
    backgroundColor: '#F44336',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  newMessageButton: {
    padding: 8,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginVertical: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#000',
  },
  chatHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  chatHeaderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
    flex: 1,
    marginHorizontal: 12,
  },
  chatHeaderActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerActionButton: {
    padding: 8,
  },
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 8,
  },
  emptyActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#2196F3',
    borderRadius: 6,
  },
  emptyActionButtonText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#fff',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingTop: 16,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  modalBody: {
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  modalLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 8,
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
    marginBottom: 16,
  },
  modalButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 6,
    backgroundColor: '#2196F3',
  },
  modalButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#FFF3CD',
    borderRadius: 6,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    color: '#856404',
  },
});

export default MessagingScreen;
