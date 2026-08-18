import { useState, useEffect } from 'react';
import { getSystemCurrency, subscribeToCurrencyChanges, formatCurrency as formatCurrencyUtil, CurrencyConfig } from '../lib/currencyService';

export function useCurrency() {
  const [currency, setCurrency] = useState<CurrencyConfig | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCurrency();

    const unsubscribe = subscribeToCurrencyChanges((newCurrency) => {
      setCurrency(newCurrency);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const loadCurrency = async () => {
    try {
      const currencyConfig = await getSystemCurrency();
      setCurrency(currencyConfig);
    } catch (error) {
      console.error('Error loading currency:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number): string => {
    if (!currency) return `${amount.toFixed(2)}`;
    return formatCurrencyUtil(amount, currency);
  };

  return {
    currency,
    loading,
    formatCurrency
  };
}
