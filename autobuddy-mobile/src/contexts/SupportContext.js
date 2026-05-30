import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * SupportContext - Manage support tickets and help requests
 */

export const SupportContext = createContext(null);

export function SupportProvider({ children }) {
  const [tickets, setTickets] = useState([]);
  const [faqs, setFaqs] = useState([
    {
      id: 'faq-1',
      question: 'How do I cancel a ride?',
      answer: 'You can cancel from the active ride card if the driver hasn\'t started yet.',
    },
    {
      id: 'faq-2',
      question: 'What are the payment options?',
      answer: 'You can pay via wallet, card, or UPI. Set your default payment method in preferences.',
    },
    {
      id: 'faq-3',
      question: 'How do I report a safety issue?',
      answer: 'Use the SOS button in the safety tab to alert emergency contacts immediately.',
    },
  ]);

  const createSupportTicket = useCallback((issue, description) => {
    const ticket = {
      id: `ticket-${Date.now()}`,
      issue,
      description,
      status: 'open',
      createdAt: new Date(),
      messages: [],
    };
    setTickets((prev) => [...prev, ticket]);
    return ticket;
  }, []);

  const addTicket = useCallback((ticket) => {
    setTickets((prev) => [ticket, ...prev]);
    return ticket;
  }, []);

  const closeSupportTicket = useCallback((ticketId) => {
    setTickets((prev) =>
      prev.map((t) => (t.id === ticketId ? { ...t, status: 'closed' } : t))
    );
  }, []);

  const addMessage = useCallback((ticketId, message, sender = 'passenger') => {
    setTickets((prev) =>
      prev.map((t) =>
        t.id === ticketId
          ? {
              ...t,
              messages: [
                ...t.messages,
                { id: `msg-${Date.now()}`, text: message, sender, timestamp: new Date() },
              ],
            }
          : t
      )
    );
  }, []);

  const value = {
    tickets,
    faqs,
    addTicket,
    createSupportTicket,
    closeSupportTicket,
    addMessage,
    setTickets,
    setFaqs,
  };

  return (
    <SupportContext.Provider value={value}>
      {children}
    </SupportContext.Provider>
  );
}

export function useSupport() {
  const context = useContext(SupportContext);
  if (!context) {
    throw new Error('useSupport must be used within SupportProvider');
  }
  return context;
}
