import React, { createContext, useContext, useState, useCallback } from 'react';

/**
 * PromoCodesContext - Manage promotional codes and coupons
 */

const PromoCodesContext = createContext(null);

export function PromoCodesProvider({ children }) {
  const [promoCodes, setPromoCodes] = useState([]);
  const [appliedCodes, setAppliedCodes] = useState([]);

  const applyPromoCode = useCallback((code, amount) => {
    const applied = {
      id: `promo-${Date.now()}`,
      code,
      amount,
      appliedAt: new Date(),
      status: 'applied',
    };
    setAppliedCodes((prev) => [...prev, applied]);
    return applied;
  }, []);

  const removePromoCode = useCallback((codeId) => {
    setAppliedCodes((prev) => prev.filter((c) => c.id !== codeId));
  }, []);

  const validatePromoCode = useCallback((code) => {
    // Stub validation - backend will handle real validation
    return code && code.length > 0;
  }, []);

  const getActiveCodes = useCallback(
    () => appliedCodes.filter((c) => c.status === 'applied'),
    [appliedCodes]
  );

  const getTotalDiscount = useCallback(
    () => appliedCodes.reduce((sum, c) => sum + (c.amount || 0), 0),
    [appliedCodes]
  );

  const value = {
    promoCodes,
    appliedCodes,
    applyPromoCode,
    removePromoCode,
    validatePromoCode,
    getActiveCodes,
    getTotalDiscount,
    setPromoCodes,
    setAppliedCodes,
  };

  return (
    <PromoCodesContext.Provider value={value}>
      {children}
    </PromoCodesContext.Provider>
  );
}

export function usePromoCodes() {
  const context = useContext(PromoCodesContext);
  if (!context) {
    throw new Error('usePromoCodes must be used within PromoCodesProvider');
  }
  return context;
}
