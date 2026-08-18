import { supabase } from './supabase';

export interface CurrencyConfig {
  code: string;
  symbol: string;
  name: string;
  decimal_places: number;
  symbol_position: 'before' | 'after';
  thousand_separator: string;
  decimal_separator: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  MVR: {
    code: 'MVR',
    symbol: 'MVR',
    name: 'Maldivian Rufiyaa',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  USD: {
    code: 'USD',
    symbol: '$',
    name: 'US Dollar',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  EUR: {
    code: 'EUR',
    symbol: '€',
    name: 'Euro',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  GBP: {
    code: 'GBP',
    symbol: '£',
    name: 'British Pound',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  INR: {
    code: 'INR',
    symbol: '₹',
    name: 'Indian Rupee',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  AED: {
    code: 'AED',
    symbol: 'AED',
    name: 'UAE Dirham',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  SAR: {
    code: 'SAR',
    symbol: 'SAR',
    name: 'Saudi Riyal',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  JPY: {
    code: 'JPY',
    symbol: '¥',
    name: 'Japanese Yen',
    decimal_places: 0,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  CNY: {
    code: 'CNY',
    symbol: '¥',
    name: 'Chinese Yuan',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  AUD: {
    code: 'AUD',
    symbol: 'A$',
    name: 'Australian Dollar',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  SGD: {
    code: 'SGD',
    symbol: 'S$',
    name: 'Singapore Dollar',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  },
  CHF: {
    code: 'CHF',
    symbol: 'CHF',
    name: 'Swiss Franc',
    decimal_places: 2,
    symbol_position: 'before',
    thousand_separator: ',',
    decimal_separator: '.'
  }
};

let cachedCurrency: CurrencyConfig | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 60000;

export async function getSystemCurrency(): Promise<CurrencyConfig> {
  const now = Date.now();

  if (cachedCurrency && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedCurrency;
  }

  try {
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_value')
      .eq('setting_key', 'currency')
      .maybeSingle();

    if (error) {
      console.error('Error fetching currency settings:', error);
      return SUPPORTED_CURRENCIES.MVR;
    }

    if (data?.setting_value) {
      cachedCurrency = data.setting_value as CurrencyConfig;
      cacheTimestamp = now;
      return cachedCurrency;
    }

    return SUPPORTED_CURRENCIES.MVR;
  } catch (error) {
    console.error('Error in getSystemCurrency:', error);
    return SUPPORTED_CURRENCIES.MVR;
  }
}

export async function updateSystemCurrency(currencyCode: string): Promise<boolean> {
  const currency = SUPPORTED_CURRENCIES[currencyCode];

  if (!currency) {
    console.error('Unsupported currency code:', currencyCode);
    return false;
  }

  try {
    const { error } = await supabase
      .from('system_settings')
      .update({
        setting_value: currency
      })
      .eq('setting_key', 'currency');

    if (error) {
      console.error('Error updating currency:', error);
      return false;
    }

    cachedCurrency = currency;
    cacheTimestamp = Date.now();

    return true;
  } catch (error) {
    console.error('Error in updateSystemCurrency:', error);
    return false;
  }
}

export function formatCurrency(amount: number, currency?: CurrencyConfig): string {
  const config = currency || SUPPORTED_CURRENCIES.MVR;

  const parts = amount.toFixed(config.decimal_places).split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1];

  const formattedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, config.thousand_separator);

  let formattedAmount = formattedInteger;
  if (config.decimal_places > 0 && decimalPart) {
    formattedAmount += config.decimal_separator + decimalPart;
  }

  if (config.symbol_position === 'before') {
    return `${config.symbol} ${formattedAmount}`;
  } else {
    return `${formattedAmount} ${config.symbol}`;
  }
}

export function clearCurrencyCache(): void {
  cachedCurrency = null;
  cacheTimestamp = 0;
}

export function subscribeToCurrencyChanges(callback: (currency: CurrencyConfig) => void): () => void {
  const channel = supabase
    .channel('currency-changes')
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'system_settings',
        filter: 'setting_key=eq.currency'
      },
      (payload) => {
        if (payload.new && payload.new.setting_value) {
          cachedCurrency = payload.new.setting_value as CurrencyConfig;
          cacheTimestamp = Date.now();
          callback(cachedCurrency);
        }
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
}
