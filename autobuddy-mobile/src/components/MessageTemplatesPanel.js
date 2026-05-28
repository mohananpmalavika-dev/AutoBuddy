import React, { useState, useCallback } from 'react';
import { View, Text, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS } from '../theme';

/**
 * Message Templates Panel for Ride Communication
 * Provides pre-set messages for common driver-passenger scenarios
 * 
 * Props:
 *   - onSelectTemplate: (template) => void - Callback when template selected
 *   - onCustomMessage: (text) => void - Callback for custom message
 */
export default function MessageTemplatesPanel({
  onSelectTemplate = () => null,
  onCustomMessage = () => null,
}) {
  const [customMessage, setCustomMessage] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('general');

  const templates = {
    general: [
      { id: 'hello', text: 'Hi! I\'m on my way to pick you up.' },
      { id: 'confirm', text: 'Confirmed! See you soon.' },
      { id: 'thanks', text: 'Thank you for riding with us!' },
    ],
    pickup: [
      { id: 'arriving', text: 'I\'m arriving at your pickup location.' },
      { id: 'nearby', text: 'I\'m 2 minutes away.' },
      { id: 'here', text: 'I\'ve arrived. I\'m in a white car.' },
      { id: 'wait', text: 'Please come downstairs, I\'m waiting outside.' },
    ],
    dropoff: [
      { id: 'almost', text: 'We\'re almost there!' },
      { id: 'arriving_drop', text: 'Arriving at your destination.' },
      { id: 'reached', text: 'We\'ve reached your destination.' },
    ],
    issue: [
      { id: 'issue_traffic', text: 'I\'m stuck in traffic, will be a few minutes late.' },
      { id: 'issue_wrong_location', text: 'Could you confirm your exact location?' },
      { id: 'issue_cancel_request', text: 'I apologize, I need to cancel this ride.' },
      { id: 'issue_contact_support', text: 'Let me connect you with support for this issue.' },
    ],
    rating: [
      { id: 'rate_safe', text: 'Please rate my driving and give feedback!' },
      { id: 'rate_service', text: 'Hope you had a pleasant trip. Your feedback helps!' },
    ],
  };

  const categories = [
    { key: 'general', label: 'General' },
    { key: 'pickup', label: 'Pickup' },
    { key: 'dropoff', label: 'Dropoff' },
    { key: 'issue', label: 'Issues' },
    { key: 'rating', label: 'Rating' },
  ];

  const currentTemplates = templates[selectedCategory] || [];

  const handleSelectTemplate = useCallback(
    (template) => {
      setCustomMessage(template.text);
      onSelectTemplate(template);
    },
    [onSelectTemplate],
  );

  const handleSendCustom = useCallback(() => {
    if (customMessage.trim()) {
      onCustomMessage(customMessage.trim());
      setCustomMessage('');
    }
  }, [customMessage, onCustomMessage]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Message Templates</Text>

      {/* Category Selector */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.categoriesScroll}
      >
        <View style={styles.categories}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.key}
              style={[
                styles.categoryButton,
                selectedCategory === category.key && styles.categoryButtonActive,
              ]}
              onPress={() => setSelectedCategory(category.key)}
            >
              <Text
                style={[
                  styles.categoryText,
                  selectedCategory === category.key && styles.categoryTextActive,
                ]}
              >
                {category.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Templates Grid */}
      <ScrollView style={styles.templatesScroll} showsVerticalScrollIndicator={false}>
        <View style={styles.templatesGrid}>
          {currentTemplates.map((template) => (
            <TouchableOpacity
              key={template.id}
              style={styles.templateCard}
              onPress={() => handleSelectTemplate(template)}
            >
              <Text style={styles.templateText}>{template.text}</Text>
              <Text style={styles.templateSend}>Send →</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {/* Custom Message Input */}
      <View style={styles.customMessageSection}>
        <Text style={styles.customLabel}>Or type a message:</Text>
        <View style={styles.inputContainer}>
          <View style={styles.textInputWrapper}>
            <Text style={styles.inputPlaceholder} numberOfLines={2}>
              {customMessage || 'Type your custom message...'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.sendButton, !customMessage.trim() && styles.sendButtonDisabled]}
            onPress={handleSendCustom}
            disabled={!customMessage.trim()}
          >
            <Text style={styles.sendButtonText}>Send</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Tips Section */}
      <View style={styles.tipsSection}>
        <Text style={styles.tipsTitle}>💡 Tips:</Text>
        <Text style={styles.tip}>• Be professional and courteous</Text>
        <Text style={styles.tip}>• Keep messages brief and clear</Text>
        <Text style={styles.tip}>• Avoid sensitive or personal information</Text>
      </View>
    </View>
  );
}

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 16,
    color: '#212121',
  },
  categoriesScroll: {
    marginBottom: 16,
    marginHorizontal: -16,
    paddingHorizontal: 16,
  },
  categories: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E0E0E0',
    borderWidth: 1,
    borderColor: '#BDBDBD',
  },
  categoryButtonActive: {
    backgroundColor: COLORS.primary || '#1976D2',
    borderColor: COLORS.primary || '#1976D2',
  },
  categoryText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#666',
  },
  categoryTextActive: {
    color: '#FFF',
  },
  templatesScroll: {
    maxHeight: 200,
    marginBottom: 16,
  },
  templatesGrid: {
    gap: 8,
  },
  templateCard: {
    backgroundColor: '#FFF',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.primary || '#1976D2',
    minHeight: 50,
    justifyContent: 'space-between',
  },
  templateText: {
    fontSize: 13,
    color: '#212121',
    fontWeight: '500',
    marginBottom: 8,
  },
  templateSend: {
    fontSize: 11,
    color: COLORS.primary || '#1976D2',
    fontWeight: '700',
    alignSelf: 'flex-end',
  },
  customMessageSection: {
    marginBottom: 16,
  },
  customLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 8,
    color: '#666',
  },
  inputContainer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  textInputWrapper: {
    flex: 1,
    backgroundColor: '#FFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 10,
    minHeight: 50,
    justifyContent: 'center',
  },
  inputPlaceholder: {
    fontSize: 13,
    color: '#999',
  },
  sendButton: {
    backgroundColor: COLORS.primary || '#1976D2',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 12,
  },
  tipsSection: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#FFA500',
  },
  tipsTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B26A00',
    marginBottom: 8,
  },
  tip: {
    fontSize: 11,
    color: '#666',
    marginBottom: 4,
  },
};
