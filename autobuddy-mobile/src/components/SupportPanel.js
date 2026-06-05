import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
  FlatList,
} from 'react-native';
import { COLORS } from '../theme';
import { formatToIST } from '../utils/time';
import { useSupport } from '../contexts/SupportContext';

/**
 * SupportPanel - Access help, FAQs, and create support tickets
 */
export default function SupportPanel() {
  const { createSupportTicket, tickets, faqs, addMessage } = useSupport();
  const [activeTab, setActiveTab] = useState('faqs'); // 'faqs' or 'tickets'
  const [showCreateTicket, setShowCreateTicket] = useState(false);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [issue, setIssue] = useState('');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');

  const handleCreateTicket = () => {
    if (!issue.trim() || !description.trim()) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }
    createSupportTicket(issue, description);
    setIssue('');
    setDescription('');
    setShowCreateTicket(false);
    Alert.alert('Success', 'Support ticket created');
  };

  const handleSendMessage = () => {
    if (!message.trim()) {
      Alert.alert('Error', 'Please enter a message');
      return;
    }
    addMessage(selectedTicket.id, message);
    setMessage('');
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'faqs' && styles.activeTab]}
          onPress={() => setActiveTab('faqs')}
        >
          <Text style={[styles.tabText, activeTab === 'faqs' && styles.activeTabText]}>FAQs</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'tickets' && styles.activeTab]}
          onPress={() => setActiveTab('tickets')}
        >
          <Text style={[styles.tabText, activeTab === 'tickets' && styles.activeTabText]}>
            My Tickets
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.content}>
        {activeTab === 'faqs' ? (
          <>
            <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
            {faqs.map((faq) => (
              <View key={faq.id} style={styles.faqItem}>
                <Text style={styles.faqQuestion}>Q: {faq.question}</Text>
                <Text style={styles.faqAnswer}>A: {faq.answer}</Text>
              </View>
            ))}
          </>
        ) : selectedTicket ? (
          <>
            <View style={styles.ticketDetail}>
              <Text style={styles.ticketIssue}>{selectedTicket.issue}</Text>
              <Text style={styles.ticketStatus}>Status: {selectedTicket.status}</Text>
              <Text style={styles.ticketDescription}>{selectedTicket.description}</Text>
            </View>

            <View style={styles.messagesContainer}>
              <FlatList
                data={selectedTicket.messages}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <View
                    style={[
                      styles.messageItem,
                      item.sender === 'passenger' && styles.myMessage,
                    ]}
                  >
                    <Text style={styles.messageSender}>{item.sender === 'passenger' ? 'You' : 'Support'}</Text>
                    <Text style={styles.messageText}>{item.text}</Text>
                    <Text style={styles.messageTime}>
                      {formatToIST(item.timestamp, { timeStyle: 'short' })}
                    </Text>
                  </View>
                )}
                scrollEnabled={false}
              />
            </View>

            {selectedTicket.status === 'open' && (
              <View style={styles.messageInput}>
                <TextInput
                  style={styles.input}
                  placeholder="Type your message..."
                  value={message}
                  onChangeText={setMessage}
                  multiline
                />
                <TouchableOpacity style={styles.sendButton} onPress={handleSendMessage}>
                  <Text style={styles.sendButtonText}>Send</Text>
                </TouchableOpacity>
              </View>
            )}

            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setSelectedTicket(null)}
            >
              <Text style={styles.backButtonText}>← Back to Tickets</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.ticketsHeader}>
              <Text style={styles.sectionTitle}>Support Tickets</Text>
              <TouchableOpacity
                style={styles.newTicketBtn}
                onPress={() => setShowCreateTicket(true)}
              >
                <Text style={styles.newTicketBtnText}>+ New Ticket</Text>
              </TouchableOpacity>
            </View>

            {tickets.length === 0 ? (
              <Text style={styles.emptyText}>No support tickets yet</Text>
            ) : (
              <FlatList
                data={tickets}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.ticketItem}
                    onPress={() => setSelectedTicket(item)}
                  >
                    <View>
                      <Text style={styles.ticketItemIssue}>{item.issue}</Text>
                      <Text style={styles.ticketItemStatus}>Status: {item.status}</Text>
                    </View>
                    <Text style={styles.ticketItemArrow}>→</Text>
                  </TouchableOpacity>
                )}
                scrollEnabled={false}
              />
            )}
          </>
        )}
      </ScrollView>

      {/* Create Ticket Modal */}
      {showCreateTicket && (
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Create Support Ticket</Text>
            <TextInput
              style={styles.input}
              placeholder="Issue type"
              value={issue}
              onChangeText={setIssue}
            />
            <TextInput
              style={[styles.input, styles.descriptionInput]}
              placeholder="Describe your issue"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowCreateTicket(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleCreateTicket}
              >
                <Text style={styles.submitButtonText}>Submit</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  tabs: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 3,
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#999',
  },
  activeTabText: {
    color: COLORS.primary,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  faqItem: {
    backgroundColor: '#F5F5F5',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  faqQuestion: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMain,
    marginBottom: 6,
  },
  faqAnswer: {
    fontSize: 12,
    color: COLORS.textMuted,
    lineHeight: 18,
  },
  ticketsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  newTicketBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
  },
  newTicketBtnText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 12,
  },
  ticketItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 8,
  },
  ticketItemIssue: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMain,
  },
  ticketItemStatus: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 4,
  },
  ticketItemArrow: {
    fontSize: 18,
    color: COLORS.primary,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textMuted,
    paddingVertical: 20,
  },
  ticketDetail: {
    padding: 12,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    marginBottom: 16,
  },
  ticketIssue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.textMain,
  },
  ticketStatus: {
    fontSize: 12,
    color: COLORS.textMuted,
    marginTop: 6,
  },
  ticketDescription: {
    fontSize: 13,
    color: COLORS.textMain,
    marginTop: 8,
  },
  messagesContainer: {
    marginBottom: 16,
    maxHeight: 300,
  },
  messageItem: {
    backgroundColor: '#EEE',
    padding: 10,
    borderRadius: 8,
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.primary,
  },
  myMessage: {
    backgroundColor: COLORS.primary,
    borderLeftColor: COLORS.primary,
  },
  messageSender: {
    fontSize: 11,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  messageText: {
    fontSize: 12,
    color: COLORS.textMain,
    marginTop: 4,
  },
  messageTime: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
  },
  messageInput: {
    marginBottom: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  descriptionInput: {
    height: 80,
    textAlignVertical: 'top',
  },
  sendButton: {
    paddingVertical: 8,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    alignItems: 'center',
  },
  sendButtonText: {
    color: 'white',
    fontWeight: '600',
  },
  backButton: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  backButtonText: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  modalOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    width: '90%',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.textMain,
    marginBottom: 12,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 8,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: '#EEE',
    borderRadius: 6,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontWeight: '600',
    color: COLORS.textMain,
  },
  submitButton: {
    flex: 1,
    paddingVertical: 10,
    backgroundColor: COLORS.primary,
    borderRadius: 6,
    alignItems: 'center',
  },
  submitButtonText: {
    color: 'white',
    fontWeight: '600',
  },
});
