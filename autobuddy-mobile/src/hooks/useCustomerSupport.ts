import { useState, useCallback } from 'react';
import axios from 'axios';

export interface SupportTicket {
  id: string;
  userId: string;
  category: 'technical' | 'payment' | 'safety' | 'account' | 'other';
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'resolved' | 'closed';
  attachments: string[];
  createdAt: Date;
  updatedAt: Date;
  resolvedAt?: Date;
  resolution?: string;
}

export interface SupportMessage {
  id: string;
  ticketId: string;
  userId: string;
  message: string;
  isSupport: boolean;
  timestamp: Date;
  attachments: string[];
}

export interface FAQItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  helpfulCount: number;
  viewCount: number;
}

interface UseCustomerSupportReturn {
  tickets: SupportTicket[];
  faqItems: FAQItem[];
  loading: boolean;
  error: Error | null;
  fetchTickets: (status?: string) => Promise<void>;
  createTicket: (category: string, subject: string, description: string, attachments?: string[]) => Promise<boolean>;
  updateTicketStatus: (ticketId: string, status: string) => Promise<boolean>;
  addMessage: (ticketId: string, message: string, attachments?: string[]) => Promise<boolean>;
  getTicketMessages: (ticketId: string) => Promise<SupportMessage[]>;
  closeTicket: (ticketId: string, resolution: string) => Promise<boolean>;
  fetchFAQ: (category?: string) => Promise<void>;
  searchFAQ: (query: string) => FAQItem[];
  markFAQHelpful: (faqId: string) => Promise<boolean>;
  uploadAttachment: (filePath: string) => Promise<string>;
}

export const useCustomerSupport = (token: string | null, userId: string): UseCustomerSupportReturn => {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [faqItems, setFaqItems] = useState<FAQItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

  const fetchTickets = useCallback(
    async (status?: string) => {
      if (!token) {return;}
      setLoading(true);
      try {
        const params = status ? { status } : {};
        const response = await axios.get(
          `${API_BASE_URL}/support/tickets/${userId}`,
          {
            params,
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        setTickets(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch tickets'));
      } finally {
        setLoading(false);
      }
    },
    [token, userId, API_BASE_URL]
  );

  const createTicket = useCallback(
    async (
      category: string,
      subject: string,
      description: string,
      attachments?: string[]
    ): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/support/tickets`,
          { userId, category, subject, description, attachments: attachments || [] },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTickets((prev) => [response.data, ...prev]);
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to create ticket'));
        return false;
      }
    },
    [token, userId, API_BASE_URL]
  );

  const updateTicketStatus = useCallback(
    async (ticketId: string, status: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.patch(
          `${API_BASE_URL}/support/tickets/${ticketId}`,
          { status },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? response.data : t))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to update ticket'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const addMessage = useCallback(
    async (
      ticketId: string,
      message: string,
      attachments?: string[]
    ): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/support/tickets/${ticketId}/messages`,
          { message, attachments: attachments || [] },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to add message'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const getTicketMessages = useCallback(
    async (ticketId: string): Promise<SupportMessage[]> => {
      if (!token) {return [];}
      try {
        const response = await axios.get(
          `${API_BASE_URL}/support/tickets/${ticketId}/messages`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        return response.data || [];
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch messages'));
        return [];
      }
    },
    [token, API_BASE_URL]
  );

  const closeTicket = useCallback(
    async (ticketId: string, resolution: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        const response = await axios.post(
          `${API_BASE_URL}/support/tickets/${ticketId}/close`,
          { resolution },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setTickets((prev) =>
          prev.map((t) => (t.id === ticketId ? response.data : t))
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to close ticket'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const fetchFAQ = useCallback(
    async (category?: string) => {
      if (!token) {return;}
      try {
        const params = category ? { category } : {};
        const response = await axios.get(`${API_BASE_URL}/faq`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        setFaqItems(response.data || []);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to fetch FAQ'));
      }
    },
    [token, API_BASE_URL]
  );

  const searchFAQ = useCallback(
    (query: string): FAQItem[] => {
      const lowerQuery = query.toLowerCase();
      return faqItems.filter(
        (item) =>
          item.question.toLowerCase().includes(lowerQuery) ||
          item.answer.toLowerCase().includes(lowerQuery)
      );
    },
    [faqItems]
  );

  const markFAQHelpful = useCallback(
    async (faqId: string): Promise<boolean> => {
      if (!token) {return false;}
      try {
        await axios.post(
          `${API_BASE_URL}/faq/${faqId}/helpful`,
          {},
          { headers: { Authorization: `Bearer ${token}` } }
        );
        setFaqItems((prev) =>
          prev.map((item) =>
            item.id === faqId ? { ...item, helpfulCount: item.helpfulCount + 1 } : item
          )
        );
        return true;
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to mark FAQ helpful'));
        return false;
      }
    },
    [token, API_BASE_URL]
  );

  const uploadAttachment = useCallback(
    async (filePath: string): Promise<string> => {
      if (!token) {return '';}
      try {
        const formData = new FormData();
        formData.append('file', {
          uri: filePath,
          type: 'application/octet-stream',
          name: `attachment_${Date.now()}`,
        } as any);

        const response = await axios.post(
          `${API_BASE_URL}/support/upload`,
          formData,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'multipart/form-data',
            },
          }
        );
        return response.data.url || '';
      } catch (err) {
        setError(err instanceof Error ? err : new Error('Failed to upload attachment'));
        return '';
      }
    },
    [token, API_BASE_URL]
  );

  return {
    tickets,
    faqItems,
    loading,
    error,
    fetchTickets,
    createTicket,
    updateTicketStatus,
    addMessage,
    getTicketMessages,
    closeTicket,
    fetchFAQ,
    searchFAQ,
    markFAQHelpful,
    uploadAttachment,
  };
};
