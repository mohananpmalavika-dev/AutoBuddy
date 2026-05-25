import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AccessibilityInfo,
  Alert,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';

import { apiRequest } from '../lib/api';
import { COLORS, SHADOWS } from '../theme';
import VoiceTextInput from './VoiceTextInput';

const ACTIVE_COMM_STATUSES = new Set(['accepted', 'driver_arrived', 'in_progress']);

function normalizeBookingStatus(statusValue) {
  const raw = String(statusValue || '').trim().toLowerCase();
  if (!raw) {
    return '';
  }
  if (raw.includes('.')) {
    return raw.split('.').pop() || raw;
  }
  return raw;
}

export default function RideCommunicationCard({
  token,
  booking,
  currentUserId,
  counterpartName,
}) {
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatError, setChatError] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [openingCall, setOpeningCall] = useState(false);
  const hasHydratedIncomingRef = useRef(false);
  const seenIncomingMessageIdsRef = useRef(new Set());

  const bookingId = booking?.id;
  const status = normalizeBookingStatus(booking?.status);
  const commEnabled = Boolean(bookingId) && ACTIVE_COMM_STATUSES.has(status);
  const sortedMessages = useMemo(
    () => [...chatMessages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [chatMessages],
  );
  const visibleMessages = useMemo(
    () => (commEnabled ? sortedMessages : []),
    [commEnabled, sortedMessages],
  );

  const announceIncomingMessage = useCallback((senderName, bodyText) => {
    const sender = String(senderName || counterpartName || 'New message').trim();
    const messageText = String(bodyText || '').trim();
    const spokenText = messageText
      ? `${sender} says: ${messageText}`
      : `${sender} sent a new message.`;

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        if (typeof Notification !== 'undefined') {
          if (Notification.permission === 'granted') {
            void new Notification(`Message from ${sender}`, { body: messageText || 'New message received.' });
          } else if (Notification.permission === 'default') {
            Notification.requestPermission().catch(() => null);
          }
        }
      } catch {
        // Ignore browser notification failures.
      }
      try {
        if (window.speechSynthesis) {
          const utterance = new SpeechSynthesisUtterance(spokenText);
          utterance.lang = 'en-IN';
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        }
      } catch {
        // Ignore browser speech synthesis failures.
      }
      return;
    }

    try {
      Alert.alert('New Message', messageText ? `${sender}: ${messageText}` : `${sender} sent a new message.`);
    } catch {
      // Ignore native alert failures.
    }
    try {
      AccessibilityInfo.announceForAccessibility(spokenText);
    } catch {
      // Ignore accessibility announcement failures.
    }
  }, [counterpartName]);

  const loadMessages = useCallback(async () => {
    if (!bookingId || !commEnabled) {
      return;
    }
    try {
      setChatLoading(true);
      setChatError('');
      const rows = await apiRequest(`/bookings/${bookingId}/chat`, { token });
      setChatMessages(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setChatError(err?.message || 'Could not load chat messages.');
    } finally {
      setChatLoading(false);
    }
  }, [bookingId, commEnabled, token]);

  useEffect(() => {
    if (!bookingId || !commEnabled) {
      hasHydratedIncomingRef.current = false;
      seenIncomingMessageIdsRef.current.clear();
      return undefined;
    }
    let cancelled = false;

    const tick = async () => {
      if (cancelled) {
        return;
      }
      await loadMessages();
    };

    tick();
    const timer = setInterval(tick, 5000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [bookingId, commEnabled, loadMessages]);

  useEffect(() => {
    if (!commEnabled) {
      return;
    }
    const incomingMessages = visibleMessages.filter((item) => item?.sender_id !== currentUserId);
    if (incomingMessages.length === 0) {
      return;
    }

    if (!hasHydratedIncomingRef.current) {
      incomingMessages.forEach((item) => {
        if (item?.id) {
          seenIncomingMessageIdsRef.current.add(String(item.id));
        }
      });
      hasHydratedIncomingRef.current = true;
      return;
    }

    const newIncoming = incomingMessages.filter((item) => {
      const id = String(item?.id || '');
      return id && !seenIncomingMessageIdsRef.current.has(id);
    });

    if (newIncoming.length === 0) {
      return;
    }

    newIncoming.forEach((item) => {
      if (item?.id) {
        seenIncomingMessageIdsRef.current.add(String(item.id));
      }
    });

    const latest = newIncoming[newIncoming.length - 1];
    announceIncomingMessage(latest?.sender_name || counterpartName || 'User', latest?.message || '');
  }, [announceIncomingMessage, commEnabled, counterpartName, currentUserId, visibleMessages]);

  const sendMessage = useCallback(async () => {
    const message = String(chatInput || '').trim();
    if (!message || !bookingId || !commEnabled) {
      return;
    }
    try {
      setSending(true);
      setChatError('');
      await apiRequest(`/bookings/${bookingId}/chat`, {
        method: 'POST',
        token,
        body: { message },
      });
      setChatInput('');
      await loadMessages();
    } catch (err) {
      setChatError(err?.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  }, [bookingId, chatInput, commEnabled, loadMessages, token]);

  const openWebCall = useCallback(async () => {
    if (!bookingId || !commEnabled) {
      return;
    }
    try {
      setOpeningCall(true);
      setChatError('');
      const payload = await apiRequest(`/bookings/${bookingId}/call-room`, { token });
      const roomUrl = String(payload?.room_url || '').trim();
      if (!roomUrl) {
        throw new Error('Call room URL unavailable.');
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.open === 'function') {
        window.open(roomUrl, '_blank', 'noopener,noreferrer');
      } else {
        try {
          await WebBrowser.openBrowserAsync(roomUrl);
        } catch {
          await Linking.openURL(roomUrl);
        }
      }
    } catch (err) {
      setChatError(err?.message || 'Could not open web call.');
    } finally {
      setOpeningCall(false);
    }
  }, [bookingId, commEnabled, token]);

  if (!bookingId) {
    return null;
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>In-App Call & Chat</Text>
      {!!counterpartName && <Text style={styles.subtitle}>Connected with {counterpartName}</Text>}
      {!commEnabled ? (
        <Text style={styles.hint}>Available from ride acceptance until trip completion.</Text>
      ) : (
        <>
          <TouchableOpacity style={styles.callButton} onPress={openWebCall} disabled={openingCall}>
            <Text style={styles.callText}>{openingCall ? 'Opening...' : 'Join Web Call'}</Text>
          </TouchableOpacity>
          {chatLoading && <ActivityIndicator color={COLORS.primary} style={styles.loader} />}
          <ScrollView style={styles.chatScroll} contentContainerStyle={styles.chatContent}>
            {visibleMessages.length === 0 ? (
              <Text style={styles.hint}>No messages yet. Send a message to start.</Text>
            ) : (
              visibleMessages.map((item) => {
                const isMine = item.sender_id === currentUserId;
                return (
                  <View
                    key={item.id}
                    style={[styles.bubble, isMine ? styles.myBubble : styles.otherBubble]}>
                    <Text style={styles.bubbleAuthor}>{isMine ? 'You' : item.sender_name || 'User'}</Text>
                    <Text style={styles.bubbleText}>{item.message}</Text>
                  </View>
                );
              })
            )}
          </ScrollView>
          <View style={styles.inputRow}>
            <VoiceTextInput
              value={chatInput}
              onChangeText={setChatInput}
              placeholder="Type message"
              placeholderTextColor={COLORS.textMuted}
              style={styles.input}
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={sending}>
              <Text style={styles.sendText}>{sending ? '...' : 'Send'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
      {!!chatError && <Text style={styles.error}>{chatError}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 10,
    ...SHADOWS.soft,
  },
  title: { color: COLORS.textMain, fontSize: 16, fontWeight: '800' },
  subtitle: { color: COLORS.textMuted, marginTop: 4, marginBottom: 8 },
  hint: { color: COLORS.textMuted, marginTop: 6 },
  callButton: {
    marginTop: 4,
    marginBottom: 8,
    alignSelf: 'flex-start',
    backgroundColor: COLORS.secondary,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  callText: { color: '#fff', fontWeight: '700' },
  loader: { marginVertical: 4 },
  chatScroll: {
    maxHeight: 170,
    backgroundColor: COLORS.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  chatContent: { padding: 8, gap: 8 },
  bubble: {
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    maxWidth: '92%',
  },
  myBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#DFF3E4',
  },
  otherBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0F3F7',
  },
  bubbleAuthor: { color: COLORS.textMuted, fontSize: 11, marginBottom: 3, fontWeight: '700' },
  bubbleText: { color: COLORS.textMain, fontSize: 14 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    backgroundColor: COLORS.surface,
    color: COLORS.textMain,
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 44,
  },
  sendButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 56,
    alignItems: 'center',
  },
  sendText: { color: '#fff', fontWeight: '700' },
  error: { color: COLORS.danger, marginTop: 8 },
});
