import { useEffect, useState, useCallback, useRef } from 'react';
import { apiRequest } from '../lib/api-client';
import { useWebSocket } from './useWebSocket';

export interface Message {
  id: string;
  conversationId: string;
  fromUserId: string;
  toUserId: string;
  content: string;
  read: boolean;
  readAt?: Date;
  createdAt: Date;
  type: 'text' | 'location' | 'image';
  metadata?: Record<string, any>;
}

export interface Conversation {
  id: string;
  userId: string;
  otherUserId: string;
  otherUserName: string;
  otherUserPhoto?: string;
  otherUserRating?: number;
  lastMessage?: Message;
  lastMessageAt: Date;
  unreadCount: number;
  isArchived: boolean;
}

export interface TypingIndicator {
  conversationId: string;
  userId: string;
  userName: string;
  isTyping: boolean;
}

export interface MessagingError {
  message: string;
  code?: string;
}

/**
 * Core messaging hook for real-time chat functionality
 */
export function useMessaging(token: string | null, userId: string) {
  const { emit, on, off } = useWebSocket();
  const [isInitialized, setIsInitialized] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Map<string, TypingIndicator>>(new Map());
  const [error, setError] = useState<MessagingError | null>(null);
  const typingTimeoutRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Initialize messaging on mount
  useEffect(() => {
    if (!token || !userId) {return;}

    const initMessaging = async () => {
      try {
        // Setup WebSocket listeners for messaging events
        const unsubscribeMessage = on('messaging:receive_message', handleIncomingMessage);
        const unsubscribeTyping = on('messaging:typing_indicator', handleTypingIndicator);
        const unsubscribeRead = on('messaging:message_read', handleMessageRead);

        setIsInitialized(true);

        return () => {
          unsubscribeMessage?.();
          unsubscribeTyping?.();
          unsubscribeRead?.();
        };
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to initialize messaging',
          code: apiError?.code,
        });
      }
    };

    initMessaging();
  }, [token, userId, on]);

  // Handle incoming message
  const handleIncomingMessage = useCallback((payload: any) => {
    console.log('[Messaging] Incoming message:', payload);
    // Message is handled by useConversations hook
  }, []);

  // Handle typing indicator
  const handleTypingIndicator = useCallback((payload: any) => {
    const { conversationId, userId: typingUserId, userName, isTyping } = payload;

    setTypingUsers((prev) => {
      const updated = new Map(prev);

      if (isTyping) {
        updated.set(typingUserId, {
          conversationId,
          userId: typingUserId,
          userName,
          isTyping: true,
        });

        // Clear existing timeout for this user
        const existingTimeout = typingTimeoutRef.current.get(typingUserId);
        if (existingTimeout) {clearTimeout(existingTimeout);}

        // Auto-clear typing indicator after 3 seconds
        const timeout = setTimeout(() => {
          setTypingUsers((prev) => {
            const updated = new Map(prev);
            updated.delete(typingUserId);
            return updated;
          });
        }, 3000);

        typingTimeoutRef.current.set(typingUserId, timeout);
      } else {
        updated.delete(typingUserId);
        const timeout = typingTimeoutRef.current.get(typingUserId);
        if (timeout) {clearTimeout(timeout);}
        typingTimeoutRef.current.delete(typingUserId);
      }

      return updated;
    });
  }, []);

  // Handle message read receipt
  const handleMessageRead = useCallback((payload: any) => {
    console.log('[Messaging] Message read:', payload);
    // Handled by message state management
  }, []);

  // Send message
  const sendMessage = useCallback(
    async (conversationId: string, toUserId: string, content: string) => {
      try {
        setError(null);

        const response = await apiRequest('/messages', {
          method: 'POST',
          token,
          body: {
            conversation_id: conversationId,
            to_user_id: toUserId,
            content,
            type: 'text',
          },
        });

        // Emit via WebSocket for real-time delivery
        emit('messaging:send_message', {
          conversationId,
          toUserId,
          content,
          messageId: response?.id,
        });

        return response;
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to send message',
          code: apiError?.code,
        });
        throw err;
      }
    },
    [token, emit]
  );

  // Send typing indicator
  const sendTypingIndicator = useCallback(
    (conversationId: string, isTyping: boolean) => {
      emit('messaging:typing_indicator', {
        conversationId,
        userId,
        isTyping,
      });
    },
    [userId, emit]
  );

  // Mark message as read
  const markMessageAsRead = useCallback(
    async (messageId: string) => {
      try {
        await apiRequest(`/messages/${messageId}/read`, {
          method: 'POST',
          token,
        });

        // Emit read receipt via WebSocket
        emit('messaging:message_read', { messageId });
      } catch (err: unknown) {
        console.error('[Messaging] Failed to mark as read:', err);
      }
    },
    [token, emit]
  );

  // Mark conversation as read
  const markConversationAsRead = useCallback(
    async (conversationId: string) => {
      try {
        await apiRequest(`/conversations/${conversationId}/read`, {
          method: 'POST',
          token,
        });
      } catch (err: unknown) {
        console.error('[Messaging] Failed to mark conversation as read:', err);
      }
    },
    [token]
  );

  // Get typing users in conversation
  const getTypingUsersInConversation = useCallback(
    (conversationId: string) => {
      const users: TypingIndicator[] = [];
      typingUsers.forEach((indicator) => {
        if (indicator.conversationId === conversationId && indicator.isTyping) {
          users.push(indicator);
        }
      });
      return users;
    },
    [typingUsers]
  );

  return {
    isInitialized,
    error,
    sendMessage,
    sendTypingIndicator,
    markMessageAsRead,
    markConversationAsRead,
    getTypingUsersInConversation,
  };
}

/**
 * Hook to manage conversations list
 */
export function useConversations(token: string | null, userId: string) {
  const { on } = useWebSocket();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MessagingError | null>(null);

  // Fetch conversations
  const fetchConversations = useCallback(
    async (limit = 50) => {
      if (!token) {return;}

      try {
        setLoading(true);
        setError(null);

        const response = await apiRequest('/conversations', {
          method: 'GET',
          token,
          headers: {
            'X-Limit': limit.toString(),
          },
        });

        setConversations(response?.conversations || []);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch conversations',
          code: apiError?.code,
        });
        console.error('[Conversations] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    },
    [token]
  );

  // Setup WebSocket listeners
  useEffect(() => {
    if (!token) {return;}

    fetchConversations();

    // Listen for new messages to update unread count
    const unsubscribeNewMessage = on('messaging:receive_message', (payload: any) => {
      setConversations((prev) =>
        prev.map((conv) =>
          conv.id === payload.conversationId
            ? {
                ...conv,
                unreadCount: conv.unreadCount + 1,
                lastMessage: payload,
                lastMessageAt: new Date(),
              }
            : conv
        )
      );
    });

    return () => {
      unsubscribeNewMessage?.();
    };
  }, [token, on, fetchConversations]);

  // Create new conversation
  const createConversation = useCallback(
    async (otherUserId: string) => {
      if (!token) {return;}

      try {
        setError(null);

        const response = await apiRequest('/conversations', {
          method: 'POST',
          token,
          body: { other_user_id: otherUserId },
        });

        const newConversation = response as Conversation;

        // Add to conversations list if not exists
        setConversations((prev) => {
          const exists = prev.find((c) => c.id === newConversation.id);
          if (exists) {return prev;}
          return [newConversation, ...prev];
        });

        return newConversation;
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to create conversation',
          code: apiError?.code,
        });
        throw err;
      }
    },
    [token]
  );

  // Archive conversation
  const archiveConversation = useCallback(
    async (conversationId: string) => {
      if (!token) {return;}

      try {
        await apiRequest(`/conversations/${conversationId}/archive`, {
          method: 'POST',
          token,
        });

        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId ? { ...conv, isArchived: true } : conv
          )
        );
      } catch (err: unknown) {
        console.error('[Conversations] Archive error:', err);
      }
    },
    [token]
  );

  // Mark conversation as read
  const markConversationAsRead = useCallback(
    async (conversationId: string) => {
      if (!token) {return;}

      try {
        await apiRequest(`/conversations/${conversationId}/read`, {
          method: 'POST',
          token,
        });

        setConversations((prev) =>
          prev.map((conv) =>
            conv.id === conversationId ? { ...conv, unreadCount: 0 } : conv
          )
        );
      } catch (err: unknown) {
        console.error('[Conversations] Mark as read error:', err);
      }
    },
    [token]
  );

  // Get total unread count
  const getTotalUnreadCount = useCallback(() => {
    return conversations.reduce((sum, conv) => sum + conv.unreadCount, 0);
  }, [conversations]);

  // Sort conversations by last message time
  const sortedConversations = [...conversations].sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );

  return {
    conversations: sortedConversations,
    loading,
    error,
    fetchConversations,
    createConversation,
    archiveConversation,
    markConversationAsRead,
    getTotalUnreadCount,
  };
}

/**
 * Hook to manage message history with pagination
 */
export function useMessageHistory(token: string | null, conversationId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState<MessagingError | null>(null);
  const offsetRef = useRef(0);

  // Fetch messages with pagination
  const fetchMessages = useCallback(
    async (reset = false) => {
      if (!token || !conversationId) {return;}

      try {
        setLoading(true);
        setError(null);

        const offset = reset ? 0 : offsetRef.current;

        const response = await apiRequest(`/conversations/${conversationId}/messages`, {
          method: 'GET',
          token,
          headers: {
            'X-Limit': '30',
            'X-Offset': offset.toString(),
          },
        });

        const newMessages = response?.messages || [];

        if (reset) {
          setMessages(newMessages.reverse());
          offsetRef.current = newMessages.length;
        } else {
          setMessages((prev) => [...newMessages.reverse(), ...prev]);
          offsetRef.current += newMessages.length;
        }

        // Check if there are more messages
        setHasMore(newMessages.length === 30);
      } catch (err: unknown) {
        const apiError = err as any;
        setError({
          message: apiError?.message || 'Failed to fetch messages',
          code: apiError?.code,
        });
        console.error('[MessageHistory] Fetch error:', err);
      } finally {
        setLoading(false);
      }
    },
    [token, conversationId]
  );

  // Load initial messages
  useEffect(() => {
    fetchMessages(true);
  }, [conversationId, fetchMessages]);

  // Add new message to list
  const addMessage = useCallback((message: Message) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  // Load more messages (pagination)
  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchMessages(false);
    }
  }, [loading, hasMore, fetchMessages]);

  return {
    messages,
    loading,
    hasMore,
    error,
    addMessage,
    loadMore,
    refetch: () => fetchMessages(true),
  };
}

export default {
  useMessaging,
  useConversations,
  useMessageHistory,
};
