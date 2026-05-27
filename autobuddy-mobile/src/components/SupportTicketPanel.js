import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

/**
 * SupportTicketPanel - Driver support system
 * Create and manage support tickets
 */
export default function SupportTicketPanel({ token, loading: parentLoading = false }) {
  const [tickets, setTickets] = useState([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  // Create form
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    category: 'general',
    priority: 'normal',
  });

  const [replyText, setReplyText] = useState('');

  const categories = [
    { value: 'payment', label: '💰 Payment Issue' },
    { value: 'booking', label: '📅 Booking Issue' },
    { value: 'account', label: '👤 Account Issue' },
    { value: 'safety', label: '⚠️ Safety Concern' },
    { value: 'vehicle', label: '🚗 Vehicle Issue' },
    { value: 'document', label: '📄 Document Issue' },
    { value: 'general', label: '💬 General Inquiry' },
  ];

  const priorities = [
    { value: 'low', label: '🟢 Low' },
    { value: 'normal', label: '🔵 Normal' },
    { value: 'high', label: '🟠 High' },
    { value: 'urgent', label: '🔴 Urgent' },
  ];

  useEffect(() => {
    if (token) {
      fetchTickets();
    }
  }, [token]);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/support/tickets', { token });
      setTickets(Array.isArray(data?.tickets) ? data.tickets : Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  };

  const createTicket = async () => {
    if (!formData.subject || !formData.description) {
      setError('Please fill in subject and description');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await apiRequest('/drivers/support/tickets', {
        method: 'POST',
        token,
        body: {
          subject: formData.subject,
          description: formData.description,
          category: formData.category,
          priority: formData.priority,
        },
      });
      setMessage('Support ticket created! We will respond shortly.');
      setFormData({
        subject: '',
        description: '',
        category: 'general',
        priority: 'normal',
      });
      setShowCreateForm(false);
      await fetchTickets();
    } catch (err) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  };

  const addReply = async (ticketId) => {
    if (!replyText.trim()) {
      setError('Please enter a message');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await apiRequest(`/drivers/support/tickets/${ticketId}/reply`, {
        method: 'POST',
        token,
        body: { message: replyText },
      });
      setMessage('Reply added!');
      setReplyText('');
      await fetchTickets();
    } catch (err) {
      setError(err.message || 'Failed to add reply');
    } finally {
      setLoading(false);
    }
  };

  const closeTicket = async (ticketId) => {
    try {
      setLoading(true);
      setError('');
      await apiRequest(`/drivers/support/tickets/${ticketId}/close`, {
        method: 'PUT',
        token,
      });
      setMessage('Ticket closed');
      await fetchTickets();
      setSelectedTicket(null);
    } catch (err) {
      setError(err.message || 'Failed to close ticket');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return COLORS.warning;
      case 'in_progress':
        return COLORS.info;
      case 'resolved':
        return COLORS.success;
      case 'closed':
        return COLORS.textMuted;
      default:
        return COLORS.textMuted;
    }
  };

  const getCategoryLabel = (category) => {
    return categories.find((c) => c.value === category)?.label || category;
  };

  const getPriorityLabel = (priority) => {
    return priorities.find((p) => p.value === priority)?.label || priority;
  };

  if (selectedTicket) {
    const ticket = tickets.find((t) => t.id === selectedTicket);
    if (!ticket) {
      return (
        <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => setSelectedTicket(null)}>
            <Text style={styles.backButtonText}>Back to Tickets</Text>
          </TouchableOpacity>
          <Text style={styles.emptyStateText}>Ticket not found. Refresh and try again.</Text>
        </ScrollView>
      );
    }
    return (
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedTicket(null)}>
          <Text style={styles.backButtonText}>← Back to Tickets</Text>
        </TouchableOpacity>

        <View style={styles.ticketDetail}>
          <View style={styles.ticketHeader}>
            <View style={styles.ticketHeaderContent}>
              <Text style={styles.ticketSubject}>{ticket.subject}</Text>
              <Text style={[styles.ticketStatus, { color: getStatusColor(ticket.status) }]}>
                {ticket.status.toUpperCase()}
              </Text>
            </View>
            <Text style={styles.ticketId}>#{ticket.id?.toString()?.slice(-6) || 'N/A'}</Text>
          </View>

          <View style={styles.ticketMeta}>
            <Text style={styles.metaItem}>📁 {getCategoryLabel(ticket.category)}</Text>
            <Text style={styles.metaItem}>⚡ {getPriorityLabel(ticket.priority)}</Text>
            <Text style={styles.metaItem}>📅 {new Date(ticket.created_at).toLocaleDateString()}</Text>
          </View>

          <View style={styles.ticketDescription}>
            <Text style={styles.descriptionLabel}>Description:</Text>
            <Text style={styles.descriptionText}>{ticket.description}</Text>
          </View>

          {/* Messages/Replies */}
          {ticket.messages && ticket.messages.length > 0 && (
            <View style={styles.messagesSection}>
              <Text style={styles.messagesTitle}>Messages:</Text>
              {ticket.messages.map((msg, idx) => (
                <View key={idx} style={[styles.message, msg.from === 'support' && styles.supportMessage]}>
                  <Text style={styles.messageSender}>
                    {msg.from === 'support' ? '💬 Support Team' : '👤 You'}
                  </Text>
                  <Text style={styles.messageText}>{msg.text}</Text>
                  <Text style={styles.messageTime}>{new Date(msg.timestamp).toLocaleString()}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Reply Form */}
          {ticket.status !== 'closed' && (
            <View style={styles.replyForm}>
              <Text style={styles.replyLabel}>Add Reply:</Text>
              <VoiceTextInput
                style={[styles.input, styles.replyInput]}
                value={replyText}
                onChangeText={setReplyText}
                placeholder="Type your message..."
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
              {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
              {message && <Text style={[styles.message, styles.success]}>{message}</Text>}
              <View style={styles.replyButtons}>
                <TouchableOpacity
                  style={[styles.replyButton, parentLoading && styles.disabled]}
                  onPress={() => addReply(ticket.id)}
                  disabled={parentLoading}
                >
                  <Text style={styles.replyButtonText}>✓ Send Reply</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.closeButton, parentLoading && styles.disabled]}
                  onPress={() => closeTicket(ticket.id)}
                  disabled={parentLoading}
                >
                  <Text style={styles.closeButtonText}>✕ Close Ticket</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>
    );
  }

  if (loading && tickets.length === 0) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>💬 Support Tickets</Text>
      <Text style={styles.subtitle}>Get help from our support team</Text>

      {error && <Text style={[styles.message, styles.error]}>{error}</Text>}
      {message && <Text style={[styles.message, styles.success]}>{message}</Text>}

      {/* Create Form */}
      {showCreateForm ? (
        <View style={styles.createForm}>
          <Text style={styles.formTitle}>Create New Ticket</Text>

          <Text style={styles.fieldLabel}>Subject*</Text>
          <VoiceTextInput
            style={styles.input}
            value={formData.subject}
            onChangeText={(value) => setFormData({ ...formData, subject: value })}
            placeholder="Brief summary of your issue"
            placeholderTextColor={COLORS.textMuted}
          />

          <Text style={styles.fieldLabel}>Description*</Text>
          <VoiceTextInput
            style={[styles.input, styles.descInput]}
            value={formData.description}
            onChangeText={(value) => setFormData({ ...formData, description: value })}
            placeholder="Describe your issue in detail..."
            placeholderTextColor={COLORS.textMuted}
            multiline
          />

          <Text style={styles.fieldLabel}>Category</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.value}
                style={[
                  styles.categoryButton,
                  formData.category === cat.value && styles.categoryButtonActive,
                ]}
                onPress={() => setFormData({ ...formData, category: cat.value })}
              >
                <Text
                  style={[
                    styles.categoryButtonText,
                    formData.category === cat.value && styles.categoryButtonTextActive,
                  ]}
                >
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <Text style={styles.fieldLabel}>Priority</Text>
          <View style={styles.priorityButtons}>
            {priorities.map((pri) => (
              <TouchableOpacity
                key={pri.value}
                style={[
                  styles.priorityButton,
                  formData.priority === pri.value && styles.priorityButtonActive,
                ]}
                onPress={() => setFormData({ ...formData, priority: pri.value })}
              >
                <Text
                  style={[
                    styles.priorityButtonText,
                    formData.priority === pri.value && styles.priorityButtonTextActive,
                  ]}
                >
                  {pri.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.formButtons}>
            <TouchableOpacity
              style={[styles.submitButton, parentLoading && styles.disabled]}
              onPress={createTicket}
              disabled={parentLoading}
            >
              <Text style={styles.submitButtonText}>✓ Create Ticket</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setShowCreateForm(false)}
              disabled={parentLoading}
            >
              <Text style={styles.cancelButtonText}>✕ Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => setShowCreateForm(true)}
          disabled={parentLoading}
        >
          <Text style={styles.createButtonText}>+ Create New Ticket</Text>
        </TouchableOpacity>
      )}

      {/* Tickets List */}
      {tickets.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No support tickets yet</Text>
        </View>
      ) : (
        <View style={styles.ticketsList}>
          {tickets.map((ticket) => (
            <TouchableOpacity
              key={ticket.id}
              style={styles.ticketCard}
              onPress={() => setSelectedTicket(ticket.id)}
            >
              <View style={styles.ticketCardHeader}>
                <View style={styles.ticketCardTitle}>
                  <Text style={styles.ticketCardSubject}>{ticket.subject}</Text>
                  <Text style={styles.ticketCardId}>#{ticket.id?.toString()?.slice(-6) || 'N/A'}</Text>
                </View>
                <Text style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                  {ticket.status}
                </Text>
              </View>
              <View style={styles.ticketCardMeta}>
                <Text style={styles.metaText}>{getCategoryLabel(ticket.category)}</Text>
                <Text style={styles.metaText}>•</Text>
                <Text style={styles.metaText}>{getPriorityLabel(ticket.priority)}</Text>
                <Text style={styles.metaText}>•</Text>
                <Text style={styles.metaText}>{new Date(ticket.created_at).toLocaleDateString()}</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.helpSection}>
        <Text style={styles.helpTitle}>❓ Frequently Asked Questions</Text>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>How long does it take to get a response?</Text>
          <Text style={styles.faqAnswer}>
            Most tickets are addressed within 24 hours. Urgent issues are handled first.
          </Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>Can I reopen a closed ticket?</Text>
          <Text style={styles.faqAnswer}>Yes, create a new ticket and reference the previous one.</Text>
        </View>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>What if I'm not satisfied with the response?</Text>
          <Text style={styles.faqAnswer}>
            You can escalate to our senior support team in the ticket details.
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: COLORS.background,
  },
  title: {
    fontSize: 20,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.textMuted,
    marginBottom: 16,
  },
  message: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    fontSize: 13,
  },
  error: {
    backgroundColor: '#FFEBEE',
    color: COLORS.error,
  },
  success: {
    backgroundColor: '#E8F5E9',
    color: COLORS.success,
  },
  createButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 20,
    ...SHADOWS.soft,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
  createForm: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    ...SHADOWS.soft,
  },
  formTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
    marginTop: 10,
  },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    color: COLORS.textMain,
    backgroundColor: COLORS.background,
  },
  descInput: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  categoryScroll: {
    marginBottom: 14,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  priorityButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  priorityButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  priorityButtonActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  priorityButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  priorityButtonTextActive: {
    color: '#fff',
  },
  formButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  submitButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButton: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingVertical: 10,
    alignItems: 'center',
  },
  cancelButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '700',
  },
  submitButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  disabled: {
    opacity: 0.5,
  },
  emptyState: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  emptyStateText: {
    fontSize: 14,
    color: COLORS.textMuted,
  },
  ticketsList: {
    marginBottom: 20,
  },
  ticketCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 14,
    marginBottom: 12,
    ...SHADOWS.soft,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  ticketCardTitle: {
    flex: 1,
  },
  ticketCardSubject: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  ticketCardId: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  ticketCardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  // Ticket Detail View
  backButton: {
    paddingVertical: 10,
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.primary,
  },
  ticketDetail: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    ...SHADOWS.soft,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  ticketHeaderContent: {
    flex: 1,
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  ticketStatus: {
    fontSize: 12,
    fontWeight: '700',
  },
  ticketId: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ticketMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    marginBottom: 14,
  },
  metaItem: {
    fontSize: 12,
    color: COLORS.textMain,
    fontWeight: '600',
  },
  ticketDescription: {
    marginBottom: 14,
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  descriptionText: {
    fontSize: 13,
    color: COLORS.textMain,
    lineHeight: 18,
  },
  messagesSection: {
    marginBottom: 14,
  },
  messagesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 10,
  },
  message: {
    backgroundColor: COLORS.background,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  supportMessage: {
    borderLeftColor: COLORS.success,
    backgroundColor: '#F1F8E9',
  },
  messageSender: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  messageText: {
    fontSize: 13,
    color: COLORS.textMain,
    lineHeight: 18,
    marginBottom: 4,
  },
  messageTime: {
    fontSize: 11,
    color: COLORS.textMuted,
  },
  replyForm: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  replyLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  replyInput: {
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 10,
  },
  replyButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  replyButton: {
    flex: 1,
    backgroundColor: COLORS.success,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  replyButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  closeButton: {
    flex: 1,
    backgroundColor: COLORS.error,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  helpSection: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 14,
    marginTop: 20,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.info,
  },
  helpTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 10,
  },
  faqItem: {
    marginBottom: 10,
  },
  faqQuestion: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 4,
  },
  faqAnswer: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 16,
  },
});
