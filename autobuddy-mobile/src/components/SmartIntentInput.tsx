/**
 * Smart Intent Booking - Natural language intent input
 * Location: src/components/SmartIntentInput.tsx
 * 
 * Features:
 * - Text input for natural language intents
 * - Voice input integration
 * - Real-time intent parsing and preview
 * - One-tap booking from parsed intent
 * - Example suggestions for guidance
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import { apiRequest } from '../lib/api-client';
import { useNotifications } from '../contexts/NotificationContext';
// BUG-005 FIX: Import safe async utilities
import { useSafeAsync } from '../hooks/useSafeAsync';

interface ParsedIntent {
  type: string;
  confidence: number;
  urgency: string;
  destination: {
    latitude: number;
    longitude: number;
    type: string;
  };
  vehicle_type: string;
  estimated_fare: number;
  time_constraint: {
    target_time: string;
    buffer_minutes: number;
  } | null;
  special_requirements: Record<string, boolean>;
  summary: string;
  parsed_text: string;
}

interface SmartIntentInputProps {
  token: string;
  userId: string;
  onIntentParsed?: (intent: ParsedIntent) => void;
  onBook?: (intent: ParsedIntent) => void;
}

const SmartIntentInput: React.FC<SmartIntentInputProps> = ({
  token,
  userId,
  onIntentParsed,
  onBook,
}) => {
  const notificationContext = useNotifications() as any;
  const addNotification = notificationContext?.addNotification || (() => {});

  const [intentText, setIntentText] = useState('');
  const [parsedIntent, setParsedIntent] = useState<ParsedIntent | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [showExamples, setShowExamples] = useState(false);
  const [examples, setExamples] = useState<any[]>([]);
  const [fadeAnim] = useState(new Animated.Value(0));
  const urgencyStyleMap = {
    critical: styles.urgency_critical,
    high: styles.urgency_high,
    medium: styles.urgency_medium,
    low: styles.urgency_low,
  } as const;

  // BUG-005 FIX: Wrap async operations with useSafeAsync for automatic error handling
  const { execute: executeLoadExamples } = useSafeAsync(
    async () => {
      const response = await apiRequest('/api/intent/examples', { token });
      if ((response as any).ok) {
        setExamples((response as any).examples || []);
      }
    },
    { 
      showAlert: false, // Don't alert on examples load failure
      onError: (error) => {
        console.error('Error loading examples:', error);
      }
    }
  );

  const { execute: executeParseIntent, loading: parsingIntent } = useSafeAsync(
    async (text: string) => {
      const response = await apiRequest('/api/intent/parse', {
        method: 'POST',
        token,
        body: { text },
      });

      if ((response as any).ok) {
        const intent = (response as any).intent;
        setParsedIntent(intent);
        setShowExamples(false);

        // Animate in
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }).start();

        // Callback
        if (onIntentParsed) {
          onIntentParsed(intent);
        }

      }
    },
    { 
      errorMessage: 'Could not understand your request. Please try again.',
      onError: (error) => {
        console.error('Error parsing intent:', error);
      }
    }
  );

  const { execute: executeBooking, loading: bookingInProgress } = useSafeAsync(
    async (intent: ParsedIntent) => {
      const response = await apiRequest('/api/intent/book-from-intent', {
        method: 'POST',
        token,
        body: {
          intent_type: intent.type,
          destination_latitude: intent.destination.latitude,
          destination_longitude: intent.destination.longitude,
          vehicle_type: intent.vehicle_type,
          special_requirements: intent.special_requirements,
          time_constraint: intent.time_constraint,
          summary: intent.summary,
        },
      });

      if ((response as any).ok) {
        addNotification({
          title: 'Booking Confirmed! 🎉',
          message: (response as any).message || 'Driver will be assigned shortly',
          type: 'success',
        });

        if (onBook) {
          onBook(intent);
        }

        // Reset
        setIntentText('');
        setParsedIntent(null);
      }
    },
    { 
      errorMessage: 'Could not complete booking. Please try again.',
      onError: (error) => {
        console.error('Booking error:', error);
      }
    }
  );

  // Combine loading states
  const loading = parsingIntent || bookingInProgress;

  // Load example intents on mount
  useEffect(() => {
    executeLoadExamples();
  }, []);

  const parseIntent = async (text: string) => {
    if (!text.trim()) {
      addNotification({
        title: 'Input Required',
        message: 'Please describe what you need (e.g., "Airport before 8pm")',
        type: 'info',
      });
      return;
    }

    // BUG-005 FIX: Use safe async wrapper instead of try-catch
    await executeParseIntent(text);
  };

  const handleVoiceInput = async () => {
    if (!isListening) {
      setIsListening(true);
      try {
        // Use Speech Recognition (would need expo-speech-recognition or similar)
        // For now, prompt user to type
        Alert.prompt(
          'Speak Your Intent',
          'What do you need? (e.g., "Need to reach airport before 8")',
          [
            { text: 'Cancel', onPress: () => setIsListening(false) },
            {
              text: 'Parse',
              onPress: (text?: string) => {
                if (text) {
                  setIntentText(text);
                  parseIntent(text);
                }
                setIsListening(false);
              },
            },
          ],
          'plain-text'
        );
      } catch (error) {
        console.error('Voice input error:', error);
        setIsListening(false);
      }
    }
  };

  const handleBookFromIntent = async () => {
    if (!parsedIntent) return;

    // BUG-005 FIX: Use safe async wrapper instead of try-catch
    await executeBooking(parsedIntent);
  };

  const handleExampleSelect = (exampleText: string) => {
    setIntentText(exampleText);
    setShowExamples(false);
    parseIntent(exampleText);
  };

  return (
    <View style={styles.container}>
      {/* Input Section */}
      <View style={styles.inputSection}>
        <Text style={styles.title}>What do you need? 🚗</Text>
        <Text style={styles.subtitle}>
          Describe your trip naturally - AI handles the rest
        </Text>

        {/* Text Input */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            placeholder='e.g., "Need to reach airport before 8pm"'
            placeholderTextColor="#A3A3A3"
            value={intentText}
            onChangeText={setIntentText}
            editable={!loading}
            multiline
            maxLength={200}
          />

          {/* Action Buttons */}
          <View style={styles.inputActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.voiceButton]}
              onPress={handleVoiceInput}
              disabled={loading}
            >
              <MaterialCommunityIcons
                name={isListening ? 'microphone' : 'microphone-outline'}
                size={20}
                color="#4338CA"
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.clearButton]}
              onPress={() => {
                setIntentText('');
                setParsedIntent(null);
              }}
              disabled={!intentText || loading}
            >
              <MaterialCommunityIcons name="close" size={20} color="#9CA3AF" />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionButton, styles.parseButton, !intentText && styles.parseButtonDisabled]}
              onPress={() => parseIntent(intentText)}
              disabled={!intentText || loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <Ionicons name="arrow-forward" size={20} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>

          {/* Character count */}
          <Text style={styles.charCount}>{intentText.length}/200</Text>
        </View>

        {/* Examples Toggle */}
        {!parsedIntent && (
          <TouchableOpacity
            style={styles.examplesToggle}
            onPress={() => setShowExamples(!showExamples)}
          >
            <MaterialCommunityIcons name="lightbulb" size={16} color="#F59E0B" />
            <Text style={styles.examplesToggleText}>
              {showExamples ? 'Hide' : 'Show'} examples
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Examples Section */}
      {showExamples && examples.length > 0 && (
        <ScrollView
          style={styles.examplesSection}
          showsVerticalScrollIndicator={false}
          scrollEnabled={true}
        >
          <Text style={styles.examplesTitle}>Quick suggestions:</Text>
          {examples.map((example, index) => (
            <TouchableOpacity
              key={index}
              style={styles.exampleCard}
              onPress={() => handleExampleSelect(example.text)}
            >
              <Text style={styles.exampleText}>{example.text}</Text>
              <View style={styles.exampleMeta}>
                <Text style={styles.exampleType}>{example.intent_type}</Text>
                {example.expected_vehicle && (
                  <Text style={styles.exampleVehicle}>{example.expected_vehicle}</Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Parsed Intent Preview */}
      {parsedIntent && (
        <Animated.View style={[styles.intentPreview, { opacity: fadeAnim }]}>
          {/* Confidence Badge */}
          <View style={styles.previewHeader}>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>
                {Math.round(parsedIntent.confidence * 100)}% match
              </Text>
            </View>
            <View
              style={[
                styles.urgencyBadge,
                urgencyStyleMap[parsedIntent.urgency as keyof typeof urgencyStyleMap] || styles.urgency_medium,
              ]}>
              <Text style={styles.urgencyText}>{parsedIntent.urgency}</Text>
            </View>
          </View>

          {/* Summary */}
          <Text style={styles.summaryText}>{parsedIntent.summary}</Text>

          {/* Details Grid */}
          <View style={styles.detailsGrid}>
            {/* Destination */}
            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="map-marker" size={20} color="#4338CA" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Destination</Text>
                <Text style={styles.detailValue}>
                  {parsedIntent.type.replace(/_/g, ' ').toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Vehicle */}
            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="car" size={20} color="#4338CA" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Vehicle</Text>
                <Text style={styles.detailValue}>{parsedIntent.vehicle_type}</Text>
              </View>
            </View>

            {/* Fare */}
            <View style={styles.detailItem}>
              <MaterialCommunityIcons name="currency-inr" size={20} color="#4338CA" />
              <View style={styles.detailContent}>
                <Text style={styles.detailLabel}>Est. Fare</Text>
                <Text style={styles.detailValue}>₹{parsedIntent.estimated_fare}</Text>
              </View>
            </View>

            {/* Time */}
            {parsedIntent.time_constraint && (
              <View style={styles.detailItem}>
                <MaterialCommunityIcons name="clock" size={20} color="#4338CA" />
                <View style={styles.detailContent}>
                  <Text style={styles.detailLabel}>Target Time</Text>
                  <Text style={styles.detailValue}>
                    {new Date(parsedIntent.time_constraint.target_time).toLocaleTimeString()}
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Special Requirements */}
          {Object.values(parsedIntent.special_requirements).some((v) => v) && (
            <View style={styles.requirementsSection}>
              <Text style={styles.requirementsTitle}>Special requirements detected:</Text>
              <View style={styles.requirementsTags}>
                {Object.entries(parsedIntent.special_requirements)
                  .filter(([_, v]) => v)
                  .map(([key]) => (
                    <View key={key} style={styles.requirementTag}>
                      <Text style={styles.requirementTagText}>{key}</Text>
                    </View>
                  ))}
              </View>
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setIntentText('');
                setParsedIntent(null);
              }}
            >
              <Text style={styles.cancelButtonText}>Edit</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.bookButton, loading && styles.bookButtonDisabled]}
              onPress={handleBookFromIntent}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#FFF" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="#FFF" />
                  <Text style={styles.bookButtonText}>Confirm & Book</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </View>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: '#FFF',
    borderRadius: 16,
  },
  inputSection: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: '#1F2937',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    color: '#6B7280',
    marginBottom: 16,
  },
  inputContainer: {
    borderWidth: 2,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 12,
    backgroundColor: '#F9FAFB',
  },
  textInput: {
    fontSize: 15,
    color: '#1F2937',
    marginBottom: 10,
    maxHeight: 80,
  },
  inputActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'flex-end',
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  voiceButton: {
    backgroundColor: '#EEF2FF',
  },
  clearButton: {
    backgroundColor: '#F3F4F6',
  },
  parseButton: {
    backgroundColor: '#4338CA',
  },
  parseButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  charCount: {
    fontSize: 11,
    color: '#9CA3AF',
    textAlign: 'right',
  },
  examplesToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  examplesToggleText: {
    fontSize: 13,
    color: '#F59E0B',
    fontWeight: '600',
  },
  examplesSection: {
    maxHeight: 200,
    marginBottom: 16,
    paddingHorizontal: 0,
  },
  examplesTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6B7280',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  exampleCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F0F9FF',
    borderLeftWidth: 3,
    borderLeftColor: '#0EA5E9',
    borderRadius: 8,
  },
  exampleText: {
    fontSize: 13,
    color: '#1F2937',
    fontWeight: '500',
    marginBottom: 6,
  },
  exampleMeta: {
    flexDirection: 'row',
    gap: 8,
  },
  exampleType: {
    fontSize: 11,
    color: '#0EA5E9',
    fontWeight: '600',
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  exampleVehicle: {
    fontSize: 11,
    color: '#7C3AED',
    fontWeight: '600',
    backgroundColor: '#F3E8FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  intentPreview: {
    backgroundColor: '#F8F9FA',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  confidenceBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  confidenceText: {
    fontSize: 12,
    color: '#047857',
    fontWeight: '700',
  },
  urgencyBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  urgency_critical: {
    backgroundColor: '#FEE2E2',
  },
  urgency_high: {
    backgroundColor: '#FEF3C7',
  },
  urgency_medium: {
    backgroundColor: '#DBEAFE',
  },
  urgency_low: {
    backgroundColor: '#ECFDF5',
  },
  urgencyText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2937',
  },
  summaryText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  detailsGrid: {
    marginBottom: 16,
    gap: 10,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    gap: 10,
  },
  detailContent: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    color: '#9CA3AF',
    fontWeight: '600',
  },
  detailValue: {
    fontSize: 14,
    color: '#1F2937',
    fontWeight: '700',
  },
  requirementsSection: {
    marginBottom: 16,
  },
  requirementsTitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: '600',
    marginBottom: 8,
  },
  requirementsTags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  requirementTag: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  requirementTagText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '600',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#6B7280',
  },
  bookButton: {
    flex: 1.5,
    backgroundColor: '#4338CA',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  bookButtonDisabled: {
    backgroundColor: '#D1D5DB',
  },
  bookButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFF',
  },
});

export default SmartIntentInput;
