import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * PaymentMethodsContext - Manage payment methods
 */

const PaymentMethodsContext = createContext(null);

export function PaymentMethodsProvider({ children }) {
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [walletBalance, setWalletBalance] = useState(0);

  const addPaymentMethod = useCallback((method) => {
    const paymentMethod = {
      id: `method-${Date.now()}`,
      ...method,
      isDefault: paymentMethods.length === 0,
      addedAt: new Date(),
    };
    setPaymentMethods((prev) => [...prev, paymentMethod]);
    return paymentMethod;
  }, [paymentMethods.length]);

  const removePaymentMethod = useCallback((methodId) => {
    setPaymentMethods((prev) => prev.filter((m) => m.id !== methodId));
  }, []);

  const setDefaultPaymentMethod = useCallback((methodId) => {
    setPaymentMethods((prev) =>
      prev.map((m) => ({ ...m, isDefault: m.id === methodId }))
    );
  }, []);

  const addWalletBalance = useCallback((amount) => {
    setWalletBalance((prev) => prev + amount);
  }, []);

  const deductWalletBalance = useCallback((amount) => {
    setWalletBalance((prev) => Math.max(0, prev - amount));
  }, []);

  const value = {
    paymentMethods,
    walletBalance,
    addPaymentMethod,
    removePaymentMethod,
    setDefaultPaymentMethod,
    addWalletBalance,
    deductWalletBalance,
    setPaymentMethods,
    setWalletBalance,
  };

  return (
    <PaymentMethodsContext.Provider value={value}>
      {children}
    </PaymentMethodsContext.Provider>
  );
}

export function usePaymentMethods() {
  const context = useContext(PaymentMethodsContext);
  if (!context) {
    throw new Error('usePaymentMethods must be used within PaymentMethodsProvider');
  }
  return context;
}
