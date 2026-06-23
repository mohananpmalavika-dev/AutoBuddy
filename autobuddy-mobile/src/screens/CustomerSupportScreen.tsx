import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useCustomerSupport, SupportTicket, FAQItem } from '../hooks/useCustomerSupport';

type DateLike = string | number | Date | null | undefined;

const formatDateSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleDateString() : 'Unknown';
};

const formatDateTimeSafely = (date: DateLike): string => {
  if (!date) return 'Unknown';
  const dateObj = new Date(date);
  return !isNaN(dateObj.getTime()) ? dateObj.toLocaleString() : 'Unknown';
};

interface CustomerSupportScreenProps {
  token: string | null;
  userId: string;
}

export const CustomerSupportScreen: React.FC<CustomerSupportScreenProps> = ({
  token,
  userId,
}) => {
  const {
    tickets,
    faqItems,
    loading,
    fetchTickets,
    fetchFAQ,
    createTicket,
    searchFAQ,
    markFAQHelpful,
  } = useCustomerSupport(token, userId);

  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<'tickets' | 'faq' | 'create'>('tickets');
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [showTicketDetail, setShowTicketDetail] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [faqSearch, setFaqSearch] = useState('');
  const [newTicket, setNewTicket] = useState({ category: 'other', subject: '', description: '' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    await fetchTickets();
    await fetchFAQ();
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const handleCreateTicket = async () => {
    if (!newTicket.subject.trim() || !newTicket.description.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    const success = await createTicket(
      newTicket.category,
      newTicket.subject,
      newTicket.description
    );

    if (success) {
      Alert.alert('Success', 'Support ticket created');
      setNewTicket({ category: 'other', subject: '', description: '' });
      setShowCreateModal(false);
      await loadData();
    } else {
      Alert.alert('Error', 'Failed to create ticket');
    }
  };

  const filteredFAQ = faqSearch ? searchFAQ(faqSearch) : faqItems;
  const openTickets = tickets.filter((t) => t.status === 'open' || t.status === 'in_progress');
  const resolvedTickets = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      {/* Stats */}
      <View style={styles.statsContainer}>
        <StatCard
          icon="assignment"
          label="Open Tickets"
          value={openTickets.length.toString()}
          color="#FF9800"
        />
        <StatCard
          icon="check-circle"
          label="Resolved"
          value={resolvedTickets.length.toString()}
          color="#4CAF50"
        />
        <StatCard
          icon="help"
          label="FAQs"
          value={faqItems.length.toString()}
          color="#2196F3"
        />
      </View>

      {/* Tab Navigation */}
      <View style={styles.tabContainer}>
        <TabButton
          label="My Tickets"
          active={activeTab === 'tickets'}
          onPress={() => setActiveTab('tickets')}
        />
        <TabButton
          label="FAQ"
          active={activeTab === 'faq'}
          onPress={() => setActiveTab('faq')}
        />
        <TabButton
          label="Create Ticket"
          active={activeTab === 'create'}
          onPress={() => setActiveTab('create')}
        />
      </View>

      {/* My Tickets */}
      {activeTab === 'tickets' && (
        <View style={styles.section}>
          {openTickets.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>Open Tickets</Text>
              {openTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onPress={() => {
                    setSelectedTicket(ticket);
                    setShowTicketDetail(true);
                  }}
                />
              ))}
            </>
          )}

          {resolvedTickets.length > 0 && (
            <>
              <Text style={styles.subsectionTitle}>Resolved Tickets</Text>
              {resolvedTickets.map((ticket) => (
                <TicketCard
                  key={ticket.id}
                  ticket={ticket}
                  onPress={() => {
                    setSelectedTicket(ticket);
                    setShowTicketDetail(true);
                  }}
                />
              ))}
            </>
          )}

          {tickets.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialIcons name="assignment" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No support tickets yet</Text>
              <Pressable
                style={styles.createButton}
                onPress={() => setActiveTab('create')}
              >
                <MaterialIcons name="add" size={18} color="#fff" />
                <Text style={styles.createButtonText}>Create Ticket</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* FAQ */}
      {activeTab === 'faq' && (
        <View style={styles.section}>
          <View style={styles.searchContainer}>
            <MaterialIcons name="search" size={20} color="#999" />
            <TextInput
              style={styles.searchInput}
              placeholder="Search FAQ..."
              value={faqSearch}
              onChangeText={setFaqSearch}
              placeholderTextColor="#999"
            />
            {faqSearch.length > 0 && (
              <Pressable onPress={() => setFaqSearch('')}>
                <MaterialIcons name="close" size={20} color="#999" />
              </Pressable>
            )}
          </View>

          {filteredFAQ.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="search-off" size={48} color="#ddd" />
              <Text style={styles.emptyText}>No FAQs found</Text>
            </View>
          ) : (
            filteredFAQ.map((item) => (
              <FAQCard
                key={item.id}
                item={item}
                onMarkHelpful={() => markFAQHelpful(item.id)}
              />
            ))
          )}
        </View>
      )}

      {/* Create Ticket */}
      {activeTab === 'create' && (
        <View style={styles.section}>
          <View style={styles.formCard}>
            <Text style={styles.formLabel}>Category</Text>
            <View style={styles.categoryButtons}>
              {['technical', 'payment', 'safety', 'account', 'other'].map((cat) => (
                <Pressable
                  key={cat}
                  style={[
                    styles.categoryButton,
                    newTicket.category === cat && styles.categoryButtonActive,
                  ]}
                  onPress={() =>
                    setNewTicket({ ...newTicket, category: cat })
                  }
                >
                  <Text
                    style={[
                      styles.categoryButtonText,
                      newTicket.category === cat &&
                        styles.categoryButtonTextActive,
                    ]}
                  >
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.formLabel}>Subject</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter subject"
              value={newTicket.subject}
              onChangeText={(text) =>
                setNewTicket({ ...newTicket, subject: text })
              }
              placeholderTextColor="#999"
            />

            <Text style={styles.formLabel}>Description</Text>
            <TextInput
              style={[styles.textInput, styles.textAreaInput]}
              placeholder="Describe your issue..."
              value={newTicket.description}
              onChangeText={(text) =>
                setNewTicket({ ...newTicket, description: text })
              }
              multiline
              numberOfLines={5}
              placeholderTextColor="#999"
            />

            <Pressable
              style={styles.submitButton}
              onPress={handleCreateTicket}
            >
              <MaterialIcons name="send" size={18} color="#fff" />
              <Text style={styles.submitButtonText}>Submit Ticket</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Ticket Detail Modal */}
      <Modal visible={showTicketDetail} transparent animationType="slide">
        {selectedTicket && (
          <View style={styles.modal}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Pressable onPress={() => setShowTicketDetail(false)}>
                  <MaterialIcons name="close" size={24} color="#000" />
                </Pressable>
                <Text style={styles.modalTitle}>Ticket Details</Text>
                <View style={{ width: 24 }} />
              </View>

              <ScrollView style={styles.modalBody}>
                <View style={styles.detailCard}>
                  <View style={styles.detailRow}>
                    <MaterialIcons name="assignment" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Ticket ID</Text>
                      <Text style={styles.detailValue}>
                        {selectedTicket.id.slice(0, 12)}...
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="info" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Category</Text>
                      <Text style={styles.detailValue}>
                        {selectedTicket.category
                          .charAt(0)
                          .toUpperCase() + selectedTicket.category.slice(1)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons
                      name={
                        selectedTicket.status === 'open'
                          ? 'schedule'
                          : selectedTicket.status === 'in_progress'
                          ? 'pending'
                          : 'check-circle'
                      }
                      size={20}
                      color={
                        selectedTicket.status === 'open'
                          ? '#FF9800'
                          : selectedTicket.status === 'in_progress'
                          ? '#2196F3'
                          : '#4CAF50'
                      }
                    />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Status</Text>
                      <Text style={styles.detailValue}>
                        {selectedTicket.status
                          .charAt(0)
                          .toUpperCase() + selectedTicket.status.slice(1)}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="subject" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Subject</Text>
                      <Text style={styles.detailValue}>
                        {selectedTicket.subject}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.divider} />

                  <View style={styles.detailRow}>
                    <MaterialIcons name="description" size={20} color="#2196F3" />
                    <View style={styles.detailContent}>
                      <Text style={styles.detailLabel}>Description</Text>
                      <Text style={styles.detailValue}>
                        {selectedTicket.description}
                      </Text>
                    </View>
                  </View>

                  {selectedTicket.resolution && (
                    <>
                      <View style={styles.divider} />
                      <View style={styles.detailRow}>
                        <MaterialIcons name="check" size={20} color="#4CAF50" />
                        <View style={styles.detailContent}>
                          <Text style={styles.detailLabel}>Resolution</Text>
                          <Text style={styles.detailValue}>
                            {selectedTicket.resolution}
                          </Text>
                        </View>
                      </View>
                    </>
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        )}
      </Modal>
    </ScrollView>
  );
};

const StatCard: React.FC<{
  icon: string;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  return (
    <View style={[styles.statCard, { borderLeftColor: color, borderLeftWidth: 4 }]}>
      <MaterialIcons name={icon as any} size={20} color={color} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
};

const TabButton: React.FC<{
  label: string;
  active: boolean;
  onPress: () => void;
}> = ({ label, active, onPress }) => {
  return (
    <Pressable
      style={[styles.tabButton, active && styles.tabButtonActive]}
      onPress={onPress}
    >
      <Text
        style={[
          styles.tabButtonText,
          active && styles.tabButtonTextActive,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const TicketCard: React.FC<{
  ticket: SupportTicket;
  onPress: () => void;
}> = ({ ticket, onPress }) => {
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'open':
        return '#FF9800';
      case 'in_progress':
        return '#2196F3';
      case 'resolved':
      case 'closed':
        return '#4CAF50';
      default:
        return '#999';
    }
  };

  return (
    <Pressable style={styles.ticketCard} onPress={onPress}>
      <View style={styles.ticketCardHeader}>
        <View style={styles.ticketInfo}>
          <Text style={styles.ticketSubject}>{ticket.subject}</Text>
          <Text style={styles.ticketCategory}>
            {ticket.category.charAt(0).toUpperCase() + ticket.category.slice(1)}
          </Text>
        </View>
        <View
          style={[
            styles.ticketStatusBadge,
            { backgroundColor: getStatusColor(ticket.status) + '20' },
          ]}
        >
          <Text
            style={[
              styles.ticketStatusText,
              { color: getStatusColor(ticket.status) },
            ]}
          >
            {ticket.status.toUpperCase()}
          </Text>
        </View>
      </View>
      <Text style={styles.ticketDate}>
        {formatDateSafely(ticket.createdAt)}
      </Text>
    </Pressable>
  );
};

const FAQCard: React.FC<{
  item: FAQItem;
  onMarkHelpful: () => void;
}> = ({ item, onMarkHelpful }) => {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.faqCard}>
      <Pressable
        style={styles.faqQuestion}
        onPress={() => setExpanded(!expanded)}
      >
        <MaterialIcons
          name={expanded ? 'expand-less' : 'expand-more'}
          size={20}
          color="#2196F3"
        />
        <Text style={styles.faqQuestionText} numberOfLines={expanded ? 0 : 2}>
          {item.question}
        </Text>
      </Pressable>

      {expanded && (
        <>
          <View style={styles.divider} />
          <View style={styles.faqAnswer}>
            <Text style={styles.faqAnswerText}>{item.answer}</Text>
          </View>

          <View style={styles.faqFooter}>
            <Pressable
              style={styles.helpfulButton}
              onPress={onMarkHelpful}
            >
              <MaterialIcons name="thumb-up" size={16} color="#2196F3" />
              <Text style={styles.helpfulText}>Helpful ({item.helpfulCount})</Text>
            </Pressable>
            <Text style={styles.viewCount}>{item.viewCount} views</Text>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 8,
    paddingVertical: 12,
    gap: 8,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  statLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 6,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  tabContainer: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    alignItems: 'center',
  },
  tabButtonActive: {
    borderBottomColor: '#2196F3',
  },
  tabButtonText: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  tabButtonTextActive: {
    color: '#2196F3',
  },
  section: {
    marginHorizontal: 16,
    marginVertical: 12,
  },
  subsectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  ticketCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    marginBottom: 8,
  },
  ticketCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  ticketInfo: {
    flex: 1,
  },
  ticketSubject: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
  },
  ticketCategory: {
    fontSize: 10,
    color: '#999',
    marginTop: 2,
  },
  ticketStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  ticketStatusText: {
    fontSize: 9,
    fontWeight: '700',
  },
  ticketDate: {
    fontSize: 9,
    color: '#999',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderRadius: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#000',
  },
  faqCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 8,
  },
  faqQuestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  faqQuestionText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
    color: '#000',
    lineHeight: 16,
  },
  faqAnswer: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  faqAnswerText: {
    fontSize: 11,
    color: '#666',
    lineHeight: 16,
  },
  faqFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f5f5f5',
  },
  helpfulButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  helpfulText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#2196F3',
  },
  viewCount: {
    fontSize: 9,
    color: '#999',
  },
  formCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#000',
    marginBottom: 8,
    marginTop: 12,
  },
  categoryButtons: {
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 6,
  },
  categoryButtonActive: {
    backgroundColor: '#2196F3',
  },
  categoryButtonText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#666',
  },
  categoryButtonTextActive: {
    color: '#fff',
  },
  textInput: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: '#000',
    marginBottom: 12,
  },
  textAreaInput: {
    minHeight: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    backgroundColor: '#2196F3',
    borderRadius: 6,
    marginTop: 12,
  },
  submitButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#fff',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: '#2196F3',
    borderRadius: 6,
    marginTop: 12,
  },
  createButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyText: {
    fontSize: 14,
    color: '#999',
    marginTop: 12,
  },
  modal: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
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
  detailCard: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#666',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    marginTop: 2,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 10,
  },
});

export default CustomerSupportScreen;
