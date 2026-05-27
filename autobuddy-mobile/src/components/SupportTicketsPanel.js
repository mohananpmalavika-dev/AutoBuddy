import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

export default function SupportTicketsPanel({ token }) {
  const [loading, setLoading] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [messageAttachmentUrl, setMessageAttachmentUrl] = useState('');
  const [error, setError] = useState('');

  // Form state
  const [category, setCategory] = useState('other');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [createAttachmentUrl, setCreateAttachmentUrl] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);

  const categories = useMemo(
    () => [
      { key: 'driver_behavior', label: 'Driver Behavior' },
      { key: 'pricing', label: 'Pricing Issue' },
      { key: 'lost_item', label: 'Lost Item' },
      { key: 'safety', label: 'Safety Concern' },
      { key: 'app_bug', label: 'App Bug' },
      { key: 'other', label: 'Other' },
    ],
    []
  );

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/v1/passengers/support/tickets', { token });
      setTickets(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []);
    } catch (err) {
      setError(err.message || 'Failed to load tickets');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const timer = setTimeout(() => {
      fetchTickets().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [token, fetchTickets]);

  const fetchTicketMessages = useCallback(
    async (ticketId) => {
      try {
        setLoading(true);
        const response = await apiRequest(`/v1/passengers/support/tickets/${ticketId}/messages`, { token });
        setMessages(Array.isArray(response?.data) ? response.data : Array.isArray(response) ? response : []);
      } catch (err) {
        setError(err.message || 'Failed to load ticket messages');
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  const createTicket = useCallback(async () => {
    if (!subject.trim() || !description.trim()) {
      setError('Subject and description are required');
      return;
    }

    try {
      setError('');
      setLoading(true);
      const response = await apiRequest('/v1/passengers/support/tickets', {
        method: 'POST',
        token,
        body: {
          category,
          subject: subject.trim(),
          description: description.trim(),
          priority: priority === 'medium' ? 'normal' : priority,
        },
      });

      const newTicket = response?.data || response;
      if (newTicket) {
        if (createAttachmentUrl.trim()) {
          await apiRequest(`/v1/passengers/support/tickets/${newTicket.id}/messages`, {
            method: 'POST',
            token,
            body: {
              message_text: 'Attachment shared',
              attachment_url: createAttachmentUrl.trim(),
            },
          }).catch(() => null);
        }
        setTickets((prev) => [newTicket, ...prev]);
        setShowCreateForm(false);
        setSubject('');
        setDescription('');
        setCategory('other');
        setPriority('medium');
        setCreateAttachmentUrl('');
        setError('');
      }
    } catch (err) {
      setError(err.message || 'Failed to create ticket');
    } finally {
      setLoading(false);
    }
  }, [token, category, subject, description, priority, createAttachmentUrl]);

  const addMessage = useCallback(async () => {
    if (!newMessage.trim() || !selectedTicket) {
      return;
    }

    try {
      setLoading(true);
      const response = await apiRequest(`/v1/passengers/support/tickets/${selectedTicket.id}/messages`, {
        method: 'POST',
        token,
        body: {
          message_text: newMessage.trim(),
          attachment_url: messageAttachmentUrl.trim() || null,
        },
      });

      const addedMessage = response?.data || response;
      if (addedMessage) {
        setMessages((prev) => [...prev, addedMessage]);
        setNewMessage('');
        setMessageAttachmentUrl('');
      }
    } catch (err) {
      setError(err.message || 'Failed to add message');
    } finally {
      setLoading(false);
    }
  }, [token, selectedTicket, newMessage, messageAttachmentUrl]);

  const uploadAttachment = useCallback(
    async (target) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['image/*', 'application/pdf', 'text/plain'],
        });
        if (result.canceled) {
          return;
        }
        const asset = result.assets?.[0];
        if (!asset) {
          return;
        }
        if (asset.size > 5 * 1024 * 1024) {
          Alert.alert('File too large', 'Attachment must be less than 5MB.');
          return;
        }
        setUploadingAttachment(true);
        const formData = new FormData();
        formData.append('file', {
          uri: asset.uri,
          type: asset.mimeType || 'application/octet-stream',
          name: asset.name || `attachment-${Date.now()}`,
        });
        const response = await apiRequest('/passengers/support/attachments', {
          token,
          method: 'POST',
          body: formData,
          isFormData: true,
        });
        if (target === 'create') {
          setCreateAttachmentUrl(response?.attachment_url || '');
        } else {
          setMessageAttachmentUrl(response?.attachment_url || '');
        }
      } catch (err) {
        setError(err.message || 'Failed to upload attachment');
      } finally {
        setUploadingAttachment(false);
      }
    },
    [token],
  );

  const updateTicketStatus = useCallback(
    async (status) => {
      if (!selectedTicket) {
        return;
      }
      try {
        setLoading(true);
        const response = await apiRequest(`/v1/passengers/support/tickets/${selectedTicket.id}/status`, {
          method: 'PATCH',
          token,
          body: { status },
        });
        const updatedTicket = response?.data || response || { ...selectedTicket, status };
        setSelectedTicket(updatedTicket);
        setTickets((prev) => prev.map((ticket) => (ticket.id === selectedTicket.id ? updatedTicket : ticket)));
      } catch (err) {
        setError(err.message || 'Failed to update ticket');
      } finally {
        setLoading(false);
      }
    },
    [selectedTicket, token],
  );

  const getStatusColor = (status) => {
    switch (status) {
      case 'open':
        return '#FFC107';
      case 'in_progress':
        return '#2196F3';
      case 'resolved':
        return '#4CAF50';
      case 'closed':
        return '#757575';
      default:
        return COLORS.textMuted;
    }
  };

  if (selectedTicket) {
    return (
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.ticketHeader}>
          <TouchableOpacity onPress={() => setSelectedTicket(null)}>
            <Text style={styles.backButton}>Back</Text>
          </TouchableOpacity>
          <Text style={styles.ticketId}>#{String(selectedTicket.id || '').substring(0, 8)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: getStatusColor(selectedTicket.status) }]}>
            <Text style={styles.statusText}>{selectedTicket.status.toUpperCase()}</Text>
          </View>
        </View>

        {/* Ticket Details */}
        <ScrollView style={styles.detailsSection} showsVerticalScrollIndicator={false}>
          <Text style={styles.ticketSubject}>{selectedTicket.subject}</Text>
          <Text style={styles.ticketCategory}>{selectedTicket.category}</Text>
          <Text style={styles.ticketDescription}>{selectedTicket.description}</Text>
          <Text style={styles.createdDate}>
            Created: {new Date(selectedTicket.created_at).toLocaleString()}
          </Text>
          <TouchableOpacity
            style={styles.statusActionButton}
            onPress={() => updateTicketStatus(selectedTicket.status === 'closed' ? 'open' : 'closed')}
            disabled={loading}>
            <Text style={styles.statusActionText}>
              {selectedTicket.status === 'closed' ? 'Reopen ticket' : 'Close ticket'}
            </Text>
          </TouchableOpacity>

          {/* Messages */}
          <View style={styles.messagesSection}>
            <Text style={styles.messagesTitle}>Messages</Text>
            {messages.length === 0 ? (
              <Text style={styles.noMessagesText}>No messages yet</Text>
            ) : (
              messages.map((msg, idx) => (
                <View
                  key={idx}
                  style={[
                    styles.messageBox,
                    msg.sender_type === 'passenger' && styles.passengerMessage,
                  ]}>
                  <Text style={styles.messageText}>{msg.message_text || msg.message}</Text>
                  {!!msg.attachment_url && (
                    <Text style={styles.messageAttachment}>Attachment: {msg.attachment_url}</Text>
                  )}
                  <Text style={styles.messageTime}>
                    {new Date(msg.created_at).toLocaleString()}
                  </Text>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        {/* Message Input */}
        {selectedTicket.status !== 'closed' && (
          <View style={styles.messageInputSection}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.messageInput}
                value={newMessage}
                onChangeText={setNewMessage}
                placeholder="Add message..."
                placeholderTextColor={COLORS.textMuted}
                multiline
                maxHeight={80}
              />
              <TextInput
                style={styles.attachmentInput}
                value={messageAttachmentUrl}
                onChangeText={setMessageAttachmentUrl}
                placeholder="Attachment URL (optional)"
                placeholderTextColor={COLORS.textMuted}
              />
              <TouchableOpacity
                style={styles.attachButton}
                onPress={() => uploadAttachment('message')}
                disabled={uploadingAttachment}>
                <Text style={styles.attachButtonText}>{uploadingAttachment ? '...' : 'Attach'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sendButton} onPress={addMessage} disabled={loading}>
                <Text style={styles.sendButtonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {error && <Text style={styles.errorText}>{error}</Text>}

      {!showCreateForm ? (
        <>
          {/* Create Button */}
          <TouchableOpacity
            style={styles.createButton}
            onPress={() => setShowCreateForm(true)}
            disabled={loading}>
            <Text style={styles.createButtonText}>+ Create Support Ticket</Text>
          </TouchableOpacity>

          {/* Tickets List */}
          {loading && tickets.length === 0 ? (
            <ActivityIndicator size="large" color={COLORS.primary} style={styles.loader} />
          ) : tickets.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>No support tickets yet</Text>
              <Text style={styles.emptyStateSubtext}>Create one to get help</Text>
            </View>
          ) : (
            <View style={styles.ticketsList}>
              {tickets.map((ticket) => (
                <TouchableOpacity
                  key={ticket.id}
                  style={styles.ticketCard}
                  onPress={() => {
                    setSelectedTicket(ticket);
                    fetchTicketMessages(ticket.id);
                  }}>
                  <View style={styles.ticketCardHeader}>
                    <Text style={styles.ticketCardSubject}>{ticket.subject}</Text>
                    <View style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                      <Text style={styles.statusText}>{ticket.status.toUpperCase()}</Text>
                    </View>
                  </View>
                  <Text style={styles.ticketCardCategory}>{ticket.category}</Text>
                  <Text style={styles.ticketCardDate}>
                    {new Date(ticket.created_at).toLocaleDateString()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </>
      ) : (
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Create Support Ticket</Text>

          {/* Category */}
          <Text style={styles.fieldLabel}>Category</Text>
          <View style={styles.categoryRow}>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat.key}
                style={[styles.categoryChip, category === cat.key && styles.categoryChipActive]}
                onPress={() => setCategory(cat.key)}>
                <Text
                  style={[
                    styles.categoryChipText,
                    category === cat.key && styles.categoryChipTextActive,
                  ]}>
                  {cat.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Subject */}
          <Text style={styles.fieldLabel}>Subject</Text>
          <VoiceTextInput
            style={styles.input}
            value={subject}
            onChangeText={setSubject}
            placeholder="Brief subject"
            placeholderTextColor={COLORS.textMuted}
          />

          {/* Description */}
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            value={description}
            onChangeText={setDescription}
            placeholder="Detailed description"
            placeholderTextColor={COLORS.textMuted}
            multiline
            numberOfLines={4}
          />
          <Text style={styles.fieldLabel}>Attachment URL (Optional)</Text>
          <TextInput
            style={styles.input}
            value={createAttachmentUrl}
            onChangeText={setCreateAttachmentUrl}
            placeholder="Upload a file or paste a URL"
            placeholderTextColor={COLORS.textMuted}
          />
          <TouchableOpacity
            style={styles.uploadButton}
            onPress={() => uploadAttachment('create')}
            disabled={uploadingAttachment}>
            <Text style={styles.uploadButtonText}>
              {uploadingAttachment ? 'Uploading...' : 'Upload Attachment'}
            </Text>
          </TouchableOpacity>

          {/* Priority */}
          <Text style={styles.fieldLabel}>Priority</Text>
          <View style={styles.priorityRow}>
            {['low', 'medium', 'high'].map((p) => (
              <TouchableOpacity
                key={p}
                style={[styles.priorityChip, priority === p && styles.priorityChipActive]}
                onPress={() => setPriority(p)}>
                <Text
                  style={[
                    styles.priorityChipText,
                    priority === p && styles.priorityChipTextActive,
                  ]}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Actions */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={() => {
                setShowCreateForm(false);
                setSubject('');
                setDescription('');
                setCategory('other');
                setError('');
              }}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.submitButton]}
              onPress={createTicket}
              disabled={loading}>
              <Text style={styles.submitButtonText}>
                {loading ? 'Creating...' : 'Create Ticket'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  createButton: {
    margin: 12,
    padding: 12,
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  createButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  errorText: { color: '#D32F2F', fontSize: 12, margin: 12 },
  loader: { marginVertical: 40 },
  emptyState: { alignItems: 'center', marginVertical: 40 },
  emptyStateText: { fontSize: 14, fontWeight: '700', color: COLORS.textMain },
  emptyStateSubtext: { fontSize: 12, color: COLORS.textMuted, marginTop: 6 },
  ticketsList: { padding: 12 },
  ticketCard: {
    padding: 12,
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary,
    ...SHADOWS.soft,
  },
  ticketCardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  ticketCardSubject: { flex: 1, fontSize: 13, fontWeight: '700', color: COLORS.textMain },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 4 },
  statusText: { color: '#FFFFFF', fontSize: 10, fontWeight: '700' },
  ticketCardCategory: { fontSize: 11, color: COLORS.textMuted, marginBottom: 4 },
  ticketCardDate: { fontSize: 10, color: COLORS.textMuted },
  ticketHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  ticketId: { fontSize: 12, color: COLORS.textMuted, flex: 1, textAlign: 'center' },
  detailsSection: { flex: 1, padding: 12 },
  ticketSubject: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 6 },
  ticketCategory: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginBottom: 10,
    textTransform: 'capitalize',
  },
  ticketDescription: { fontSize: 13, color: COLORS.textMain, lineHeight: 18, marginBottom: 12 },
  createdDate: { fontSize: 11, color: COLORS.textMuted, marginBottom: 20 },
  statusActionButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    marginBottom: 12,
  },
  statusActionText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  messagesSection: { marginTop: 20 },
  messagesTitle: { fontSize: 13, fontWeight: '700', color: COLORS.textMain, marginBottom: 10 },
  noMessagesText: { fontSize: 12, color: COLORS.textMuted, textAlign: 'center', paddingVertical: 20 },
  messageBox: {
    marginBottom: 10,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  passengerMessage: { backgroundColor: '#E3F2FD', borderLeftColor: COLORS.primary },
  messageText: { fontSize: 12, color: COLORS.textMain, marginBottom: 4 },
  messageAttachment: { fontSize: 11, color: COLORS.primary, marginBottom: 4 },
  messageTime: { fontSize: 10, color: COLORS.textMuted },
  messageInputSection: { padding: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: COLORS.border },
  inputRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  messageInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 12,
    color: COLORS.textMain,
    maxHeight: 80,
  },
  attachmentInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 11,
    color: COLORS.textMain,
    minHeight: 40,
  },
  attachButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    paddingHorizontal: 10,
    minHeight: 40,
    borderRadius: 8,
    justifyContent: 'center',
  },
  attachButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: 11 },
  sendButton: { backgroundColor: COLORS.primary, paddingHorizontal: 16, borderRadius: 8, justifyContent: 'center' },
  sendButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
  formSection: { padding: 12, backgroundColor: '#FFFFFF', margin: 12, borderRadius: 10, ...SHADOWS.soft },
  formTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textMain, marginBottom: 16 },
  fieldLabel: { fontSize: 12, fontWeight: '700', color: COLORS.textMain, marginBottom: 8 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  categoryChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: '#FFFFFF',
  },
  categoryChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  categoryChipText: { fontSize: 11, color: COLORS.textMain, fontWeight: '600' },
  categoryChipTextActive: { color: '#FFFFFF' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.textMain,
    marginBottom: 14,
  },
  uploadButton: {
    borderWidth: 1,
    borderColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: -6,
    marginBottom: 14,
  },
  uploadButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: 12 },
  textArea: { height: 80, textAlignVertical: 'top' },
  priorityRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  priorityChip: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    alignItems: 'center',
  },
  priorityChipActive: { backgroundColor: COLORS.primary, borderColor: COLORS.primary },
  priorityChipText: { fontSize: 12, color: COLORS.textMain, fontWeight: '600' },
  priorityChipTextActive: { color: '#FFFFFF' },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  button: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  cancelButton: { backgroundColor: COLORS.bg, borderWidth: 1, borderColor: COLORS.border },
  cancelButtonText: { color: COLORS.textMain, fontWeight: '700', fontSize: 12 },
  submitButton: { backgroundColor: COLORS.primary },
  submitButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 12 },
});
