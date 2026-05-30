import React, { useCallback, useState, useEffect, useContext } from 'react';
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
import { supportAPI } from '@/services/apiClient';
import { SupportContext } from '@/contexts/SupportContext';
import { getSocket } from '@/services/socketClient';

type SupportMessage = {
  id?: string;
  message?: string;
  text?: string;
  sender_type?: string;
  sender?: string;
  created_at?: string;
  timestamp?: string | Date;
};

type SupportTicket = {
  _id?: string;
  id?: string;
  subject: string;
  description?: string;
  category: string;
  status: string;
  created_at?: string;
  createdAt?: string | Date;
  messages?: SupportMessage[];
};

type SupportContextValue = {
  tickets: SupportTicket[];
  addTicket?: (ticket: SupportTicket) => void;
  addMessage?: (ticketId: string, message: SupportMessage) => void;
};

type SupportSocketMessageEvent = {
  ticket_id: string;
  message: SupportMessage;
};

type SupportSocketStatusEvent = {
  ticket_id: string;
  status: string;
};

const ICONS: Record<string, string> = {
  add: '+',
  close: 'x',
  send: 'Send',
  star: 'Star',
  'check-circle': 'Done',
  'chat-help-outline': '?',
};

const MaterialIcons = ({
  name,
  size = 16,
  color = '#333',
}: {
  name: string;
  size?: number;
  color?: string;
}) => (
  <Text style={{ color, fontSize: Math.max(11, Math.min(size, 18)), fontWeight: '700' }}>
    {ICONS[name] || name}
  </Text>
);

const MaterialCommunityIcons = MaterialIcons;

const getTicketId = (ticket: Pick<SupportTicket, '_id' | 'id'>) => ticket._id || ticket.id || '';
const formatTime = (value?: string | Date) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
      })
    : 'Unknown';
const formatDateTime = (value?: string | Date) =>
  value ? new Date(value).toLocaleString() : 'Unknown';

const SupportPanel: React.FC<{ userId: string }> = ({ userId }) => {
  const supportContext = useContext(SupportContext) as SupportContextValue | null;
  const contextTickets = supportContext?.tickets || [];
  const addTicket = supportContext?.addTicket;
  const addMessage = supportContext?.addMessage;
  const [tickets, setTickets] = useState<SupportTicket[]>(contextTickets || []);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [newMessage, setNewMessage] = useState('');
  const [messageSending, setMessageSending] = useState(false);

  // Form state for creating new ticket
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    category: 'other',
  });

  const categories = ['payment', 'ride', 'safety', 'account', 'driver_access', 'other'];

  const loadTickets = useCallback(async () => {
    try {
      setLoading(true);
      const result = await supportAPI.listTickets();
      setTickets(result.tickets || []);
    } catch (error) {
      console.error('Error loading tickets:', error);
      Alert.alert('Error', 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadTickets();
    setRefreshing(false);
  };

  const registerSocketListeners = useCallback(() => {
    const socket = getSocket();
    if (!socket) {return;}

    socket.on('support_ticket_message', (data: SupportSocketMessageEvent) => {
      if (selectedTicket && data.ticket_id === getTicketId(selectedTicket)) {
        // Update selected ticket with new message
        setSelectedTicket((prev) => ({
          ...(prev as SupportTicket),
          messages: [...(prev?.messages || []), data.message],
        }));
      }
      // Also update context
      addMessage?.(data.ticket_id, data.message);
    });

    socket.on('support_ticket_updated', (data: SupportSocketStatusEvent) => {
      // Update ticket status
      setTickets((prev) =>
        prev.map((t) => (getTicketId(t) === data.ticket_id ? { ...t, status: data.status } : t))
      );
      if (selectedTicket && getTicketId(selectedTicket) === data.ticket_id) {
        setSelectedTicket((prev) => ({
          ...(prev as SupportTicket),
          status: data.status,
        }));
      }
    });
  }, [addMessage, selectedTicket]);

  // Load tickets on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      loadTickets();
    }, 0);
    registerSocketListeners();

    return () => {
      clearTimeout(timer);
      const socket = getSocket();
      if (socket) {
        socket.off('support_ticket_message');
        socket.off('support_ticket_updated');
      }
    };
  }, [loadTickets, registerSocketListeners]);

  const handleCreateTicket = async () => {
    if (!formData.subject.trim() || !formData.description.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    try {
      setLoading(true);
      const newTicket = await supportAPI.createTicket({
        subject: formData.subject,
        description: formData.description,
        category: formData.category,
      });

      setTickets([newTicket, ...tickets]);
      addTicket?.(newTicket);
      setFormData({ subject: '', description: '', category: 'other' });
      setShowCreateForm(false);
      Alert.alert('Success', 'Support ticket created');
    } catch (error) {
      console.error('Error creating ticket:', error);
      Alert.alert('Error', 'Failed to create support ticket');
    } finally {
      setLoading(false);
    }
  };

  const handleAddMessage = async () => {
    if (!newMessage.trim() || !selectedTicket) {return;}

    try {
      setMessageSending(true);
      const ticketId = getTicketId(selectedTicket);
      const result = await supportAPI.addMessage(ticketId, {
        message: newMessage,
      });

      setSelectedTicket((prev) => ({
        ...(prev as SupportTicket),
        messages: [...(prev?.messages || []), result.message],
      }));
      addMessage?.(ticketId, result.message);
      setNewMessage('');
    } catch (error) {
      console.error('Error sending message:', error);
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setMessageSending(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!selectedTicket) {return;}

    Alert.alert('Close Ticket', 'Are you sure you want to close this ticket?', [
      { text: 'Cancel' },
      {
        text: 'Close',
        onPress: async () => {
          try {
            const ticketId = getTicketId(selectedTicket);
            await supportAPI.updateTicketStatus(ticketId, { status: 'closed' });
            setTickets((prev) =>
              prev.map((t) => (getTicketId(t) === ticketId ? { ...t, status: 'closed' } : t))
            );
            setSelectedTicket((prev) => ({ ...(prev as SupportTicket), status: 'closed' }));
          } catch {
            Alert.alert('Error', 'Failed to close ticket');
          }
        },
      },
    ]);
  };

  const handleRateTicket = async () => {
    if (!selectedTicket) {return;}

    const submitRating = async (rating: number) => {
      try {
        await supportAPI.submitSatisfaction(getTicketId(selectedTicket), {
          satisfaction_rating: rating,
        });
        Alert.alert('Success', 'Thank you for your feedback');
      } catch {
        Alert.alert('Error', 'Failed to submit rating');
      }
    };

    Alert.alert(
      'Rate Your Experience',
      'How satisfied are you with the resolution?',
      [
        { text: 'Cancel' },
        { text: '3', onPress: () => submitRating(3) },
        { text: '4', onPress: () => submitRating(4) },
        { text: '5', onPress: () => submitRating(5) },
      ]
    );
  };

  const getStatusBadgeColor = (status: string) => {
    const colors: Record<string, string> = {
      open: '#FF6B6B',
      in_progress: '#4ECDC4',
      waiting_customer: '#FFD93D',
      escalated: '#FF6B6B',
      resolved: '#51CF66',
      closed: '#95A5A6',
    };
    return colors[status] || '#95A5A6';
  };

  // Ticket list item component
  const TicketListItem = ({ ticket }: { ticket: SupportTicket }) => (
    <TouchableOpacity
      style={styles.ticketItem}
      onPress={() => {
        setSelectedTicket(ticket);
        setShowDetail(true);
      }}
    >
      <View style={styles.ticketItemHeader}>
        <Text style={styles.ticketSubject}>{ticket.subject}</Text>
        <View
          style={[
            styles.statusBadge,
            { backgroundColor: getStatusBadgeColor(ticket.status) },
          ]}
        >
          <Text style={styles.statusText}>{ticket.status.toUpperCase()}</Text>
        </View>
      </View>
      <Text style={styles.ticketCategory}>{ticket.category}</Text>
      <Text style={styles.ticketDate}>
        {new Date(ticket.created_at || ticket.createdAt || Date.now()).toLocaleDateString()}
      </Text>
      <Text style={styles.messageCount}>
        {ticket.messages?.length || 0} messages
      </Text>
    </TouchableOpacity>
  );

  // Message item component
  const MessageItem = ({ message, isUser }: { message: SupportMessage; isUser: boolean }) => (
    <View
      style={[
        styles.messageContainer,
        isUser ? styles.userMessage : styles.adminMessage,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          isUser ? styles.userMessageText : styles.adminMessageText,
        ]}
      >
        {message.message || message.text}
      </Text>
      <Text
        style={[
          styles.messageTime,
          isUser ? styles.userMessageTime : styles.adminMessageTime,
        ]}
      >
        {formatTime(message.created_at || message.timestamp)}
      </Text>
    </View>
  );

  if (loading && !refreshing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.centerContent}>
          <ActivityIndicator size="large" color="#4ECDC4" />
          <Text style={styles.loadingText}>Loading support tickets...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Support Tickets</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateForm(true)}
        >
          <MaterialIcons name="add" size={24} color="white" />
        </TouchableOpacity>
      </View>

      {/* Tickets list */}
      {tickets.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialCommunityIcons name="chat-help-outline" size={64} color="#ddd" />
          <Text style={styles.emptyText}>No support tickets yet</Text>
          <Text style={styles.emptySubText}>Create a new ticket if you need help</Text>
        </View>
      ) : (
        <FlatList
          data={tickets}
          renderItem={({ item }) => <TicketListItem ticket={item} />}
          keyExtractor={(item) => getTicketId(item)}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          contentContainerStyle={styles.listContent}
        />
      )}

      {/* Create ticket modal */}
      <Modal visible={showCreateForm} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowCreateForm(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Support Ticket</Text>
            <View style={{ width: 24 }} />
          </View>

          <ScrollView style={styles.modalContent}>
            <Text style={styles.formLabel}>Subject *</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Brief summary of your issue"
              value={formData.subject}
              onChangeText={(text) =>
                setFormData({ ...formData, subject: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Description *</Text>
            <TextInput
              style={[styles.textInput, styles.descriptionInput]}
              placeholder="Please provide details..."
              value={formData.description}
              onChangeText={(text) =>
                setFormData({ ...formData, description: text })
              }
              multiline
              numberOfLines={6}
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Category *</Text>
            <View style={styles.categoryContainer}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryOption,
                    formData.category === cat && styles.categoryOptionActive,
                  ]}
                  onPress={() => setFormData({ ...formData, category: cat })}
                >
                  <Text
                    style={[
                      styles.categoryOptionText,
                      formData.category === cat && styles.categoryOptionTextActive,
                    ]}
                  >
                    {cat.replace('_', ' ')}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.submitButton}
              onPress={handleCreateTicket}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="white" />
              ) : (
                <Text style={styles.submitButtonText}>Create Ticket</Text>
              )}
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* Ticket detail modal */}
      <Modal visible={showDetail} animationType="slide">
        <SafeAreaView style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowDetail(false)}>
              <MaterialIcons name="close" size={24} color="#333" />
            </TouchableOpacity>
            <Text style={styles.modalTitle}>Ticket Details</Text>
            <View style={{ width: 24 }} />
          </View>

          {selectedTicket && (
            <ScrollView style={styles.modalContent}>
              {/* Ticket info */}
              <View style={styles.ticketInfoSection}>
                <Text style={styles.infoLabel}>Subject</Text>
                <Text style={styles.infoValue}>{selectedTicket.subject}</Text>

                <Text style={[styles.infoLabel, { marginTop: 16 }]}>Category</Text>
                <Text style={styles.infoValue}>{selectedTicket.category}</Text>

                <Text style={[styles.infoLabel, { marginTop: 16 }]}>Status</Text>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusBadgeColor(selectedTicket.status) },
                  ]}
                >
                  <Text style={styles.statusText}>{selectedTicket.status.toUpperCase()}</Text>
                </View>

                <Text style={[styles.infoLabel, { marginTop: 16 }]}>Created</Text>
                <Text style={styles.infoValue}>
                  {formatDateTime(selectedTicket.created_at || selectedTicket.createdAt)}
                </Text>
              </View>

              {/* Messages */}
              <View style={styles.messagesSection}>
                <Text style={styles.sectionTitle}>Messages</Text>
                {selectedTicket.messages && selectedTicket.messages.length > 0 ? (
                  selectedTicket.messages.map((msg, index) => (
                    <MessageItem
                      key={index}
                      message={msg}
                      isUser={(msg.sender_type || msg.sender) !== 'admin'}
                    />
                  ))
                ) : (
                  <Text style={styles.noMessagesText}>No messages yet</Text>
                )}
              </View>

              {/* Action buttons */}
              {selectedTicket.status !== 'closed' && (
                <View style={styles.actionButtons}>
                  {selectedTicket.status === 'resolved' && (
                    <TouchableOpacity
                      style={[styles.actionButton, styles.rateButton]}
                      onPress={handleRateTicket}
                    >
                      <MaterialIcons name="star" size={20} color="white" />
                      <Text style={styles.actionButtonText}>Rate Experience</Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={[styles.actionButton, styles.closeButton]}
                    onPress={handleCloseTicket}
                  >
                    <MaterialIcons name="check-circle" size={20} color="white" />
                    <Text style={styles.actionButtonText}>Close Ticket</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          )}

          {/* Message input */}
          {selectedTicket && selectedTicket.status !== 'closed' && (
            <View style={styles.messageInputContainer}>
              <TextInput
                style={styles.messageInput}
                placeholder="Type your message..."
                value={newMessage}
                onChangeText={setNewMessage}
                multiline
                placeholderTextColor="#999"
              />
              <TouchableOpacity
                style={styles.sendButton}
                onPress={handleAddMessage}
                disabled={messageSending || !newMessage.trim()}
              >
                {messageSending ? (
                  <ActivityIndicator color="white" size="small" />
                ) : (
                  <MaterialIcons name="send" size={20} color="white" />
                )}
              </TouchableOpacity>
            </View>
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
  ticketItem: {
    backgroundColor: 'white',
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4ECDC4',
  },
  ticketItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    flex: 1,
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
  ticketCategory: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  ticketDate: {
    fontSize: 12,
    color: '#999',
    marginBottom: 4,
  },
  messageCount: {
    fontSize: 12,
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
    height: 120,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 16,
  },
  categoryOption: {
    backgroundColor: '#f5f5f5',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    margin: 4,
  },
  categoryOptionActive: {
    backgroundColor: '#4ECDC4',
  },
  categoryOptionText: {
    fontSize: 12,
    color: '#666',
    fontWeight: '500',
  },
  categoryOptionTextActive: {
    color: 'white',
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
  ticketInfoSection: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 16,
    marginBottom: 16,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
    marginBottom: 4,
  },
  infoValue: {
    fontSize: 14,
    color: '#333',
  },
  messagesSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  messageContainer: {
    marginBottom: 8,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
  },
  adminMessage: {
    alignSelf: 'flex-start',
  },
  messageText: {
    fontSize: 14,
    padding: 12,
    borderRadius: 12,
  },
  userMessageText: {
    backgroundColor: '#4ECDC4',
    color: 'white',
  },
  adminMessageText: {
    backgroundColor: '#f5f5f5',
    color: '#333',
  },
  messageTime: {
    fontSize: 11,
    marginTop: 4,
    marginHorizontal: 12,
  },
  userMessageTime: {
    color: '#4ECDC4',
  },
  adminMessageTime: {
    color: '#999',
  },
  noMessagesText: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    paddingVertical: 16,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    marginTop: 12,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 8,
    marginHorizontal: 4,
  },
  rateButton: {
    backgroundColor: '#FFD93D',
  },
  closeButton: {
    backgroundColor: '#51CF66',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: 'white',
    marginLeft: 8,
  },
  messageInputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  messageInput: {
    flex: 1,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: '#333',
    maxHeight: 100,
    marginRight: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4ECDC4',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default SupportPanel;
