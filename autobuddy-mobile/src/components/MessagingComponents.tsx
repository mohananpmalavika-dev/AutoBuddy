import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Animated,
  Dimensions,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  useMessaging,
  useMessageHistory,
  Message,
} from '../hooks/useMessaging';

interface ChatWindowProps {
  token: string | null;
  userId: string;
  conversationId: string;
  otherUserName: string;
  otherUserRating?: number;
}

export const ChatWindow: React.FC<ChatWindowProps> = ({
  token,
  userId,
  conversationId,
  otherUserName,
  otherUserRating,
}) => {
  const {
    sendMessage,
    sendTypingIndicator,
    markMessageAsRead,
    getTypingUsersInConversation,
  } = useMessaging(token, userId);

  const {
    messages,
    loading,
    hasMore,
    addMessage,
    loadMore,
  } = useMessageHistory(token, conversationId);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [sending, setSending] = useState(false);
  const flatListRef = useRef<FlatList>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

  const typingUsers = getTypingUsersInConversation(conversationId);

  // Mark messages as read when they come into view
  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: any) => {
      viewableItems.forEach((item: any) => {
        const message = item.item as Message;
        if (!message.read && message.toUserId === userId) {
          markMessageAsRead(message.id);
        }
      });
    },
    [userId, markMessageAsRead]
  );

  // Handle typing indicator with debounce
  const handleTextChange = useCallback(
    (text: string) => {
      setInputText(text);

      // Send typing indicator if not already sent
      if (text.length > 0 && !isTyping) {
        setIsTyping(true);
        sendTypingIndicator(conversationId, true);
      }

      // Debounce typing stop indicator
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (text.length === 0) {
        setIsTyping(false);
        sendTypingIndicator(conversationId, false);
      } else {
        typingTimeoutRef.current = setTimeout(() => {
          setIsTyping(false);
          sendTypingIndicator(conversationId, false);
        }, 3000);
      }
    },
    [conversationId, isTyping, sendTypingIndicator]
  );

  // Send message handler
  const handleSendMessage = useCallback(async () => {
    if (!inputText.trim()) {return;}

    setSending(true);
    try {
      const response = await sendMessage(
        conversationId,
        conversationId.split('_').find((id) => id !== userId) || '',
        inputText.trim()
      );

      if (response) {
        // Add message to local list
        const newMessage: Message = {
          id: response.id,
          conversationId,
          fromUserId: userId,
          toUserId: response.toUserId,
          content: inputText.trim(),
          read: false,
          createdAt: new Date(),
          type: 'text',
        };

        addMessage(newMessage);
        setInputText('');

        // Stop typing indicator
        setIsTyping(false);
        sendTypingIndicator(conversationId, false);

        // Scroll to bottom
        setTimeout(() => {
          flatListRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    } catch (error) {
      console.error('Failed to send message:', error);
    } finally {
      setSending(false);
    }
  }, [inputText, conversationId, userId, sendMessage, addMessage, sendTypingIndicator]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Text style={styles.otherUserName}>{otherUserName}</Text>
          {otherUserRating && (
            <View style={styles.ratingBadge}>
              <MaterialIcons name="star" size={12} color="#FFB800" />
              <Text style={styles.ratingText}>{otherUserRating}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Messages List */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <MessageBubble
            message={item}
            isOwn={item.fromUserId === userId}
            onMarkAsRead={() => markMessageAsRead(item.id)}
          />
        )}
        ListHeaderComponent={
          loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color="#2196F3" />
            </View>
          ) : null
        }
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
        onEndReached={hasMore ? loadMore : undefined}
        onEndReachedThreshold={0.5}
        contentContainerStyle={styles.messagesList}
        scrollIndicatorInsets={{ right: 1 }}
      />

      {/* Typing Indicator */}
      {typingUsers.length > 0 && <TypingIndicator users={typingUsers} />}

      {/* Message Input */}
      <View style={styles.inputContainer}>
        <View style={styles.inputWrapper}>
          <TextInput
            style={styles.input}
            placeholder="Type a message..."
            value={inputText}
            onChangeText={handleTextChange}
            multiline
            maxLength={500}
            editable={!sending}
            placeholderTextColor="#999"
          />

          <Pressable
            style={[
              styles.sendButton,
              (!inputText.trim() || sending) && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={!inputText.trim() || sending}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <MaterialIcons name="send" size={20} color="#fff" />
            )}
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

interface MessageBubbleProps {
  message: Message;
  isOwn: boolean;
  onMarkAsRead?: () => void;
}

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isOwn,
  onMarkAsRead,
}) => {
  useEffect(() => {
    if (!isOwn && !message.read && onMarkAsRead) {
      onMarkAsRead();
    }
  }, [isOwn, message.read, onMarkAsRead]);

  return (
    <View
      style={[
        styles.messageBubbleContainer,
        isOwn && styles.messageBubbleContainerOwn,
      ]}
    >
      <View
        style={[
          styles.messageBubble,
          isOwn && styles.messageBubbleOwn,
        ]}
      >
        <Text
          style={[
            styles.messageText,
            isOwn && styles.messageTextOwn,
          ]}
        >
          {message.content}
        </Text>

        <View
          style={[
            styles.messageFooter,
            isOwn && styles.messageFooterOwn,
          ]}
        >
          <Text
            style={[
              styles.messageTime,
              isOwn && styles.messageTimeOwn,
            ]}
          >
            {new Date(message.createdAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </Text>

          {isOwn && (
            <MaterialIcons
              name={message.read ? 'done-all' : 'done'}
              size={14}
              color={message.read ? '#2196F3' : '#999'}
              style={styles.readIcon}
            />
          )}
        </View>
      </View>
    </View>
  );
};

interface TypingIndicatorProps {
  users: { userName: string; isTyping: boolean }[];
}

const TypingIndicator: React.FC<TypingIndicatorProps> = ({ users }) => {
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(animatedValue, {
          toValue: 1,
          duration: 600,
          useNativeDriver: false,
        }),
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 600,
          useNativeDriver: false,
        }),
      ])
    ).start();
  }, [animatedValue]);

  const dot1Opacity = animatedValue.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0.4, 1, 0.4, 0.4],
  });

  const dot2Opacity = animatedValue.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0.4, 0.4, 1, 0.4],
  });

  const dot3Opacity = animatedValue.interpolate({
    inputRange: [0, 0.33, 0.66, 1],
    outputRange: [0.4, 0.4, 0.4, 1],
  });

  return (
    <View style={styles.typingContainer}>
      <Text style={styles.typingText}>
        {users.length === 1
          ? `${users[0].userName} is typing`
          : `${users.length} people typing`}
      </Text>
      <View style={styles.typingDots}>
        <Animated.View style={[styles.typingDot, { opacity: dot1Opacity }]} />
        <Animated.View style={[styles.typingDot, { opacity: dot2Opacity }]} />
        <Animated.View style={[styles.typingDot, { opacity: dot3Opacity }]} />
      </View>
    </View>
  );
};

interface ConversationPreviewProps {
  conversation: any;
  isSelected?: boolean;
  onPress?: () => void;
}

export const ConversationPreview: React.FC<ConversationPreviewProps> = ({
  conversation,
  isSelected,
  onPress,
}) => {
  return (
    <Pressable
      style={[
        styles.conversationCard,
        isSelected && styles.conversationCardSelected,
      ]}
      onPress={onPress}
    >
      <View
        style={[
          styles.conversationAvatar,
          { backgroundColor: getAvatarColor(conversation.otherUserName) },
        ]}
      >
        <Text style={styles.conversationAvatarText}>
          {conversation.otherUserName.charAt(0).toUpperCase()}
        </Text>
      </View>

      <View style={styles.conversationContent}>
        <View style={styles.conversationHeader}>
          <Text style={styles.conversationName} numberOfLines={1}>
            {conversation.otherUserName}
          </Text>
          <Text style={styles.conversationTime}>
            {formatTime(conversation.lastMessageAt)}
          </Text>
        </View>

        <View style={styles.conversationPreview}>
          <Text
            style={[
              styles.conversationPreviewText,
              conversation.unreadCount > 0 && styles.conversationPreviewUnread,
            ]}
            numberOfLines={1}
          >
            {conversation.lastMessage?.content || 'No messages yet'}
          </Text>

          {conversation.unreadCount > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {conversation.unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
};

const getAvatarColor = (name: string): string => {
  const colors = ['#2196F3', '#4CAF50', '#FF9800', '#F44336', '#9C27B0', '#00BCD4'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
};

const formatTime = (date: Date | string): string => {
  const now = new Date();
  const messageDate = new Date(date);
  const diff = now.getTime() - messageDate.getTime();

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 60) {return `${minutes}m ago`;}
  if (hours < 24) {return `${hours}h ago`;}
  if (days < 7) {return `${days}d ago`;}

  return messageDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  otherUserName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#000',
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: '#FFB80020',
    borderRadius: 3,
  },
  ratingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#FFB800',
  },
  messagesList: {
    flexGrow: 1,
    paddingVertical: 12,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 16,
  },
  messageBubbleContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 6,
  },
  messageBubbleContainerOwn: {
    justifyContent: 'flex-end',
  },
  messageBubble: {
    maxWidth: '85%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#E3F2FD',
  },
  messageBubbleOwn: {
    backgroundColor: '#2196F3',
  },
  messageText: {
    fontSize: 13,
    color: '#000',
    lineHeight: 18,
  },
  messageTextOwn: {
    color: '#fff',
  },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 4,
    gap: 2,
  },
  messageFooterOwn: {
    justifyContent: 'flex-end',
  },
  messageTime: {
    fontSize: 10,
    color: '#666',
  },
  messageTimeOwn: {
    color: 'rgba(255,255,255,0.7)',
  },
  readIcon: {
    marginLeft: 2,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 8,
  },
  typingText: {
    fontSize: 12,
    color: '#999',
  },
  typingDots: {
    flexDirection: 'row',
    gap: 4,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2196F3',
  },
  inputContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    backgroundColor: '#fff',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 13,
    color: '#000',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#2196F3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  conversationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  conversationCardSelected: {
    backgroundColor: '#f5f5f5',
  },
  conversationAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  conversationAvatarText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  conversationContent: {
    flex: 1,
  },
  conversationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  conversationName: {
    fontSize: 13,
    fontWeight: '600',
    color: '#000',
    flex: 1,
  },
  conversationTime: {
    fontSize: 11,
    color: '#999',
  },
  conversationPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  conversationPreviewText: {
    fontSize: 12,
    color: '#999',
    flex: 1,
  },
  conversationPreviewUnread: {
    color: '#000',
    fontWeight: '600',
  },
  unreadBadge: {
    backgroundColor: '#2196F3',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  unreadBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
});

export default {
  ChatWindow,
  MessageBubble,
  ConversationPreview,
  TypingIndicator,
};
