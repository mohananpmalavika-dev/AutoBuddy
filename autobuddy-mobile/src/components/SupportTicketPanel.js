import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { apiRequest } from '../lib/api';
import { appendPickerAssetToFormData } from '../lib/uploadFormData';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';
import { formatToIST } from '../utils/time';

const CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'payment', label: 'Payment' },
  { value: 'booking', label: 'Booking' },
  { value: 'account', label: 'Account' },
  { value: 'safety', label: 'Safety' },
  { value: 'vehicle', label: 'Vehicle' },
  { value: 'document', label: 'Document' },
  { value: 'general', label: 'General' },
];

const TICKET_CATEGORIES = CATEGORIES.filter((item) => item.value !== 'all');

const PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'normal', label: 'Normal' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
];

const STATUSES = [
  { value: 'all', label: 'All' },
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'closed', label: 'Closed' },
];

// Validation constants for support tickets
const VALID_CATEGORIES = ['payment', 'booking', 'account', 'safety', 'vehicle', 'document', 'general'];
const VALID_PRIORITIES = ['low', 'normal', 'high', 'urgent'];

/**
 * Validate support ticket input
 * @returns {string[]} Array of validation error messages
 */
function validateTicketInput(subject, description, category, priority) {
  const errors = [];

  if (!subject || subject.trim().length === 0) {
    errors.push('Subject is required');
  } else if (subject.trim().length < 3) {
    errors.push('Subject must be at least 3 characters');
  } else if (subject.trim().length > 100) {
    errors.push('Subject must be less than 100 characters');
  }

  if (!description || description.trim().length === 0) {
    errors.push('Description is required');
  } else if (description.trim().length < 10) {
    errors.push('Description must be at least 10 characters');
  } else if (description.trim().length > 5000) {
    errors.push('Description must be less than 5000 characters');
  }

  if (!VALID_CATEGORIES.includes(String(category || '').trim().toLowerCase())) {
    errors.push('Invalid category selected');
  }

  if (!VALID_PRIORITIES.includes(String(priority || '').trim().toLowerCase())) {
    errors.push('Invalid priority selected');
  }

  return errors;
}

function formatDate(value) {
  if (!value) return 'Not available';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return formatToIST(value);
  } catch {
    return new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata' }).format(date);
  }
}

function getStatusColor(status) {
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
}

function getLabel(options, value) {
  return options.find((item) => item.value === value)?.label || value || 'Unknown';
}

function FilterChip({ label, active, onPress }) {
  return (
    <TouchableOpacity style={[styles.filterChip, active && styles.filterChipActive]} onPress={onPress}>
      <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function AttachmentList({ attachments = [] }) {
  if (!attachments.length) return null;
  return (
    <View style={styles.attachmentsList}>
      {attachments.map((url, index) => (
        <TouchableOpacity key={`${url}-${index}`} style={styles.attachmentPill} onPress={() => Linking.openURL(url)}>
          <Text style={styles.attachmentPillText}>Attachment {index + 1}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function SupportTicketPanel({
  token,
  loading: parentLoading = false,
  initialAction = 'help',
  onDataChanged,
}) {
  const normalizedInitialAction =
    initialAction === 'contact' ? 'contact' : initialAction === 'tickets' ? 'tickets' : 'help';
  const [activeTab, setActiveTab] = useState(normalizedInitialAction === 'help' ? 'help' : 'tickets');
  const [tickets, setTickets] = useState([]);
  const [faqs, setFaqs] = useState([]);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(normalizedInitialAction === 'contact');
  const [loading, setLoading] = useState(false);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState({ status: 'all', category: 'all', priority: 'all' });
  const [faqCategory, setFaqCategory] = useState('all');
  const [faqSearch, setFaqSearch] = useState('');
  const [formData, setFormData] = useState({
    subject: '',
    description: '',
    category: 'general',
    priority: 'normal',
    attachment_urls: [],
  });
  const [replyText, setReplyText] = useState('');
  const [replyAttachments, setReplyAttachments] = useState([]);
  const [escalationReason, setEscalationReason] = useState('');

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedTicketId) || null,
    [selectedTicketId, tickets],
  );

  const setTimedMessage = useCallback((nextMessage) => {
    setMessage(nextMessage);
    setTimeout(() => setMessage(''), 3000);
  }, []);

  const fetchTickets = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const data = await apiRequest('/drivers/support/tickets', {
        token,
        query: {
          status_filter: filters.status === 'all' ? undefined : filters.status,
          category: filters.category === 'all' ? undefined : filters.category,
          priority: filters.priority === 'all' ? undefined : filters.priority,
          q: searchQuery.trim() || undefined,
        },
      });
      setTickets(Array.isArray(data?.tickets) ? data.tickets : Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Failed to load support tickets');
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.priority, filters.status, searchQuery, token]);

  const fetchFaqs = useCallback(async () => {
    try {
      const data = await apiRequest('/drivers/support/faqs', {
        token,
        query: {
          category: faqCategory === 'all' ? undefined : faqCategory,
          q: faqSearch.trim() || undefined,
        },
      });
      setFaqs(Array.isArray(data?.faqs) ? data.faqs : []);
    } catch (err) {
      setError(err.message || 'Failed to load help-center FAQs');
    }
  }, [faqCategory, faqSearch, token]);

  useEffect(() => {
    if (!token) return undefined;
    const timer = setTimeout(() => {
      fetchTickets().catch(() => null);
      fetchFaqs().catch(() => null);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchFaqs, fetchTickets, token]);

  const uploadAttachment = useCallback(
    async (target) => {
      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ['application/pdf', 'image/*'],
          copyToCacheDirectory: true,
        });
        if (result.canceled || !result.assets?.length) return;

        const asset = result.assets[0];
        if (asset.size && asset.size > 5 * 1024 * 1024) {
          Alert.alert('File too large', 'Attachment must be less than 5MB.');
          return;
        }

        setUploadingAttachment(true);
        setError('');
        const formDataPayload = new FormData();
        await appendPickerAssetToFormData(
          formDataPayload,
          'file',
          asset,
          asset.name || `support-${Date.now()}`,
          asset.mimeType || 'application/octet-stream',
        );
        const response = await apiRequest('/drivers/support/attachments', {
          token,
          method: 'POST',
          body: formDataPayload,
          isFormData: true,
        });
        const attachmentUrl = response?.attachment_url || response?.url;
        if (!attachmentUrl) return;

        if (target === 'reply') {
          setReplyAttachments((previous) => [...previous, attachmentUrl].slice(0, 5));
        } else {
          setFormData((previous) => ({
            ...previous,
            attachment_urls: [...previous.attachment_urls, attachmentUrl].slice(0, 5),
          }));
        }
        setTimedMessage('Attachment uploaded.');
      } catch (err) {
        setError(err.message || 'Failed to upload attachment');
      } finally {
        setUploadingAttachment(false);
      }
    },
    [setTimedMessage, token],
  );

  const createTicket = async () => {
    // Validate input
    const validationErrors = validateTicketInput(
      formData.subject,
      formData.description,
      formData.category,
      formData.priority,
    );

    if (validationErrors.length > 0) {
      setError(validationErrors.join(' / '));
      return;
    }

    try {
      setLoading(true);
      setError('');
      const response = await apiRequest('/drivers/support/tickets', {
        method: 'POST',
        token,
        body: {
          subject: formData.subject.trim(),
          description: formData.description.trim(),
          category: String(formData.category || 'general').trim().toLowerCase(),
          priority: String(formData.priority || 'normal').trim().toLowerCase(),
          attachment_urls: formData.attachment_urls || [],
        },
      });
      setTimedMessage('Support ticket created. We will respond shortly.');
      setFormData({
        subject: '',
        description: '',
        category: 'general',
        priority: 'normal',
        attachment_urls: [],
      });
      setShowCreateForm(false);
      setActiveTab('tickets');
      await fetchTickets();
      onDataChanged?.();
      if (response?.ticket?.id) {
        setSelectedTicketId(response.ticket.id);
      }
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
        body: { message: replyText.trim(), attachment_urls: replyAttachments },
      });
      setTimedMessage('Reply added. Support has been notified.');
      setReplyText('');
      setReplyAttachments([]);
      await fetchTickets();
      onDataChanged?.();
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
      setTimedMessage('Ticket closed.');
      await fetchTickets();
      onDataChanged?.();
      setSelectedTicketId(null);
    } catch (err) {
      setError(err.message || 'Failed to close ticket');
    } finally {
      setLoading(false);
    }
  };

  const escalateTicket = async (ticketId) => {
    if (!escalationReason.trim()) {
      setError('Please enter an escalation reason');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await apiRequest(`/drivers/support/tickets/${ticketId}/escalate`, {
        method: 'PUT',
        token,
        body: { reason: escalationReason.trim() },
      });
      setTimedMessage('Ticket escalated to senior support.');
      setEscalationReason('');
      await fetchTickets();
      onDataChanged?.();
    } catch (err) {
      setError(err.message || 'Failed to escalate ticket');
    } finally {
      setLoading(false);
    }
  };

  const startContactSupport = useCallback((source = {}) => {
    setFormData((previous) => ({
      ...previous,
      subject: source.subject || previous.subject,
      description: source.description || previous.description,
      category: source.category || previous.category || 'general',
      priority: source.priority || previous.priority || 'normal',
    }));
    setShowCreateForm(true);
    setActiveTab('tickets');
    setSelectedTicketId(null);
  }, []);

  const renderCreateForm = () => (
    <View style={styles.createForm}>
      <Text style={styles.formTitle}>Create New Ticket</Text>

      <Text style={styles.fieldLabel}>Subject</Text>
      <VoiceTextInput
        style={styles.input}
        value={formData.subject}
        onChangeText={(value) => setFormData({ ...formData, subject: value })}
        placeholder="Brief summary of your issue"
        placeholderTextColor={COLORS.textMuted}
      />

      <Text style={styles.fieldLabel}>Description</Text>
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
        {TICKET_CATEGORIES.map((category) => (
          <FilterChip
            key={category.value}
            label={category.label}
            active={formData.category === category.value}
            onPress={() => setFormData({ ...formData, category: category.value })}
          />
        ))}
      </ScrollView>

      <Text style={styles.fieldLabel}>Priority</Text>
      <View style={styles.priorityButtons}>
        {PRIORITIES.map((priority) => (
          <FilterChip
            key={priority.value}
            label={priority.label}
            active={formData.priority === priority.value}
            onPress={() => setFormData({ ...formData, priority: priority.value })}
          />
        ))}
      </View>

      <View style={styles.attachmentRow}>
        <TouchableOpacity
          style={[styles.secondaryButton, uploadingAttachment && styles.disabled]}
          onPress={() => uploadAttachment('create')}
          disabled={uploadingAttachment}
        >
          <Text style={styles.secondaryButtonText}>{uploadingAttachment ? 'Uploading...' : 'Add attachment'}</Text>
        </TouchableOpacity>
        <Text style={styles.attachmentCount}>{formData.attachment_urls.length}/5 files</Text>
      </View>
      <AttachmentList attachments={formData.attachment_urls} />

      <View style={styles.formButtons}>
        <TouchableOpacity
          style={[styles.submitButton, (parentLoading || loading) && styles.disabled]}
          onPress={createTicket}
          disabled={parentLoading || loading}
        >
          <Text style={styles.submitButtonText}>Create Ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.cancelButton}
          onPress={() => setShowCreateForm(false)}
          disabled={parentLoading}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderTicketDetail = () => {
    if (!selectedTicket) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>Ticket not found. Refresh and try again.</Text>
        </View>
      );
    }

    return (
      <View style={styles.ticketDetail}>
        <TouchableOpacity style={styles.backButton} onPress={() => setSelectedTicketId(null)}>
          <Text style={styles.backButtonText}>Back to Tickets</Text>
        </TouchableOpacity>

        <View style={styles.ticketHeader}>
          <View style={styles.ticketHeaderContent}>
            <Text style={styles.ticketSubject}>{selectedTicket.subject}</Text>
            <Text style={[styles.ticketStatus, { color: getStatusColor(selectedTicket.status) }]}>
              {String(selectedTicket.status || '').toUpperCase()}
            </Text>
          </View>
          <Text style={styles.ticketId}>#{selectedTicket.id?.toString()?.slice(-6) || 'N/A'}</Text>
        </View>

        <View style={styles.ticketMeta}>
          <Text style={styles.metaItem}>{getLabel(TICKET_CATEGORIES, selectedTicket.category)}</Text>
          <Text style={styles.metaItem}>{getLabel(PRIORITIES, selectedTicket.priority)}</Text>
          <Text style={styles.metaItem}>{formatDate(selectedTicket.created_at)}</Text>
          {selectedTicket.escalated ? <Text style={[styles.metaItem, styles.escalatedText]}>Escalated</Text> : null}
        </View>

        <View style={styles.ticketDescription}>
          <Text style={styles.descriptionLabel}>Description</Text>
          <Text style={styles.descriptionText}>{selectedTicket.description}</Text>
          <AttachmentList attachments={selectedTicket.attachment_urls || []} />
        </View>

        {selectedTicket.messages?.length ? (
          <View style={styles.messagesSection}>
            <Text style={styles.messagesTitle}>Conversation</Text>
            {selectedTicket.messages.map((msg) => (
              <View key={msg.id || msg.timestamp} style={[styles.threadMessage, msg.from === 'support' && styles.supportMessage]}>
                <Text style={styles.messageSender}>{msg.from === 'support' ? 'Support Team' : 'You'}</Text>
                <Text style={styles.messageText}>{msg.text || msg.message_text}</Text>
                <AttachmentList attachments={msg.attachment_urls || []} />
                <Text style={styles.messageTime}>{formatDate(msg.timestamp || msg.created_at)}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {selectedTicket.status !== 'closed' ? (
          <View style={styles.replyForm}>
            <Text style={styles.replyLabel}>Add Reply</Text>
            <VoiceTextInput
              style={[styles.input, styles.replyInput]}
              value={replyText}
              onChangeText={setReplyText}
              placeholder="Type your message..."
              placeholderTextColor={COLORS.textMuted}
              multiline
            />
            <View style={styles.attachmentRow}>
              <TouchableOpacity
                style={[styles.secondaryButton, uploadingAttachment && styles.disabled]}
                onPress={() => uploadAttachment('reply')}
                disabled={uploadingAttachment}
              >
                <Text style={styles.secondaryButtonText}>{uploadingAttachment ? 'Uploading...' : 'Attach file'}</Text>
              </TouchableOpacity>
              <Text style={styles.attachmentCount}>{replyAttachments.length}/5 files</Text>
            </View>
            <AttachmentList attachments={replyAttachments} />

            <View style={styles.replyButtons}>
              <TouchableOpacity
                style={[styles.replyButton, (parentLoading || loading) && styles.disabled]}
                onPress={() => addReply(selectedTicket.id)}
                disabled={parentLoading || loading}
              >
                <Text style={styles.replyButtonText}>Send Reply</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.closeButton, (parentLoading || loading) && styles.disabled]}
                onPress={() => closeTicket(selectedTicket.id)}
                disabled={parentLoading || loading}
              >
                <Text style={styles.closeButtonText}>Close Ticket</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.escalationBox}>
              <Text style={styles.replyLabel}>Escalate to senior support</Text>
              <VoiceTextInput
                style={styles.input}
                value={escalationReason}
                onChangeText={setEscalationReason}
                placeholder="Explain why this needs escalation"
                placeholderTextColor={COLORS.textMuted}
                multiline
              />
              <TouchableOpacity
                style={[styles.escalateButton, (parentLoading || loading) && styles.disabled]}
                onPress={() => escalateTicket(selectedTicket.id)}
                disabled={parentLoading || loading}
              >
                <Text style={styles.escalateButtonText}>Escalate Ticket</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}
      </View>
    );
  };

  const renderTickets = () => (
    <>
      <View style={styles.searchBlock}>
        <Text style={styles.fieldLabel}>Search tickets</Text>
        <VoiceTextInput
          style={styles.input}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="Search by subject, ID, or description"
          placeholderTextColor={COLORS.textMuted}
        />
      </View>

      <Text style={styles.filterTitle}>Status</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {STATUSES.map((status) => (
          <FilterChip
            key={status.value}
            label={status.label}
            active={filters.status === status.value}
            onPress={() => setFilters((previous) => ({ ...previous, status: status.value }))}
          />
        ))}
      </ScrollView>

      <Text style={styles.filterTitle}>Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((category) => (
          <FilterChip
            key={category.value}
            label={category.label}
            active={filters.category === category.value}
            onPress={() => setFilters((previous) => ({ ...previous, category: category.value }))}
          />
        ))}
      </ScrollView>

      <Text style={styles.filterTitle}>Priority</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {[{ value: 'all', label: 'All' }, ...PRIORITIES].map((priority) => (
          <FilterChip
            key={priority.value}
            label={priority.label}
            active={filters.priority === priority.value}
            onPress={() => setFilters((previous) => ({ ...previous, priority: priority.value }))}
          />
        ))}
      </ScrollView>

      <View style={styles.topActions}>
        <TouchableOpacity style={styles.createButton} onPress={() => setShowCreateForm(true)} disabled={parentLoading}>
          <Text style={styles.createButtonText}>Create New Ticket</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={fetchTickets} disabled={loading}>
          <Text style={styles.secondaryButtonText}>Refresh</Text>
        </TouchableOpacity>
      </View>

      {showCreateForm ? renderCreateForm() : null}

      {loading && tickets.length === 0 ? (
        <ActivityIndicator size="large" color={COLORS.primary} />
      ) : tickets.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>No matching support tickets.</Text>
        </View>
      ) : (
        <View style={styles.ticketsList}>
          {tickets.map((ticket) => (
            <TouchableOpacity key={ticket.id} style={styles.ticketCard} onPress={() => setSelectedTicketId(ticket.id)}>
              <View style={styles.ticketCardHeader}>
                <View style={styles.ticketCardTitle}>
                  <Text style={styles.ticketCardSubject}>{ticket.subject}</Text>
                  <Text style={styles.ticketCardId}>#{ticket.id?.toString()?.slice(-6) || 'N/A'}</Text>
                </View>
                <Text style={[styles.statusBadge, { backgroundColor: getStatusColor(ticket.status) }]}>
                  {String(ticket.status || '').replace(/_/g, ' ')}
                </Text>
              </View>
              <View style={styles.ticketCardMeta}>
                <Text style={styles.metaText}>{getLabel(TICKET_CATEGORIES, ticket.category)}</Text>
                <Text style={styles.metaText}>{getLabel(PRIORITIES, ticket.priority)}</Text>
                <Text style={styles.metaText}>{formatDate(ticket.updated_at || ticket.created_at)}</Text>
              </View>
              {ticket.message_count ? <Text style={styles.ticketHint}>{ticket.message_count} messages</Text> : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
    </>
  );

  const renderHelpCenter = () => (
    <>
      <View style={styles.helpHero}>
        <Text style={styles.helpTitle}>Help Center</Text>
        <Text style={styles.helpText}>Find answers first, then open or escalate a support ticket when you need the team.</Text>
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => startContactSupport({ subject: '', description: '', category: 'general' })}
        >
          <Text style={styles.createButtonText}>Contact Support</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.fieldLabel}>Search FAQs</Text>
      <VoiceTextInput
        style={styles.input}
        value={faqSearch}
        onChangeText={setFaqSearch}
        placeholder="Search help topics"
        placeholderTextColor={COLORS.textMuted}
      />

      <Text style={styles.filterTitle}>FAQ Category</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
        {CATEGORIES.map((category) => (
          <FilterChip
            key={category.value}
            label={category.label}
            active={faqCategory === category.value}
            onPress={() => setFaqCategory(category.value)}
          />
        ))}
      </ScrollView>

      <View style={styles.helpSection}>
        {faqs.length ? (
          faqs.map((faq) => (
            <View key={faq.id || faq.question} style={styles.faqItem}>
              <Text style={styles.faqQuestion}>{faq.question}</Text>
              <Text style={styles.faqAnswer}>{faq.answer}</Text>
              <TouchableOpacity
                style={styles.inlineAction}
                onPress={() =>
                  startContactSupport({
                    subject: `Help with: ${faq.question}`,
                    description: `I read this FAQ but still need help:\n\n${faq.question}`,
                    category: faq.category || 'general',
                  })
                }
              >
                <Text style={styles.inlineActionText}>Still need help?</Text>
              </TouchableOpacity>
            </View>
          ))
        ) : (
          <Text style={styles.emptyStateText}>No FAQs matched your search.</Text>
        )}
      </View>
    </>
  );

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <Text style={styles.title}>Driver Support</Text>
      <Text style={styles.subtitle}>FAQs, tickets, attachments, and escalation in one place.</Text>

      {error ? <Text style={[styles.notice, styles.error]}>{error}</Text> : null}
      {message ? <Text style={[styles.notice, styles.success]}>{message}</Text> : null}

      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, activeTab === 'help' && styles.tabActive]} onPress={() => setActiveTab('help')}>
          <Text style={[styles.tabText, activeTab === 'help' && styles.tabTextActive]}>Help Center</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, activeTab === 'tickets' && styles.tabActive]} onPress={() => setActiveTab('tickets')}>
          <Text style={[styles.tabText, activeTab === 'tickets' && styles.tabTextActive]}>Tickets</Text>
        </TouchableOpacity>
      </View>

      {selectedTicketId ? renderTicketDetail() : activeTab === 'help' ? renderHelpCenter() : renderTickets()}
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
  notice: {
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
  tabs: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    padding: 4,
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: {
    backgroundColor: COLORS.primary,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  tabTextActive: {
    color: '#fff',
  },
  helpHero: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    ...SHADOWS.soft,
  },
  helpTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  helpText: {
    color: COLORS.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 6,
    marginTop: 8,
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
  filterTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMuted,
    marginTop: 12,
    marginBottom: 8,
  },
  categoryScroll: {
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    marginRight: 8,
  },
  filterChipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.textMain,
  },
  filterChipTextActive: {
    color: '#fff',
  },
  helpSection: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 14,
    marginTop: 8,
    marginBottom: 20,
    ...SHADOWS.soft,
  },
  faqItem: {
    paddingBottom: 14,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  faqQuestion: {
    fontSize: 13,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 12,
    color: COLORS.textMain,
    lineHeight: 17,
  },
  inlineAction: {
    marginTop: 8,
  },
  inlineActionText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  searchBlock: {
    marginBottom: 6,
  },
  topActions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  createButton: {
    flex: 1,
    backgroundColor: COLORS.primary,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    ...SHADOWS.soft,
  },
  createButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  secondaryButtonText: {
    color: COLORS.textMain,
    fontSize: 13,
    fontWeight: '800',
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
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 8,
  },
  priorityButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  attachmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginTop: 10,
  },
  attachmentCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontWeight: '700',
  },
  attachmentsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  attachmentPill: {
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  attachmentPillText: {
    color: COLORS.primary,
    fontSize: 12,
    fontWeight: '800',
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
  submitButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
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
    fontWeight: '800',
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
    paddingRight: 10,
  },
  ticketCardSubject: {
    fontSize: 14,
    fontWeight: '800',
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
    fontWeight: '800',
    overflow: 'hidden',
    textTransform: 'capitalize',
  },
  ticketCardMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metaText: {
    fontSize: 12,
    color: COLORS.textMuted,
  },
  ticketHint: {
    marginTop: 8,
    fontSize: 12,
    color: COLORS.textMuted,
  },
  backButton: {
    paddingVertical: 10,
    marginBottom: 10,
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.primary,
  },
  ticketDetail: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
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
    paddingRight: 12,
  },
  ticketSubject: {
    fontSize: 16,
    fontWeight: '900',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  ticketStatus: {
    fontSize: 12,
    fontWeight: '800',
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
    fontWeight: '700',
  },
  escalatedText: {
    color: COLORS.error,
  },
  ticketDescription: {
    marginBottom: 14,
  },
  descriptionLabel: {
    fontSize: 13,
    fontWeight: '800',
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
    fontWeight: '800',
    color: COLORS.textMain,
    marginBottom: 10,
  },
  threadMessage: {
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
    fontWeight: '800',
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
    fontWeight: '800',
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
    marginTop: 12,
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
    fontWeight: '800',
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
    fontWeight: '800',
  },
  escalationBox: {
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  escalateButton: {
    backgroundColor: COLORS.warning,
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 10,
  },
  escalateButtonText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '800',
  },
});
