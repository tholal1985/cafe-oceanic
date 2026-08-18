// Time constants (in milliseconds)
export const TIME = {
  CACHE_DURATION: 60000, // 1 minute
  TRANSACTION_TIMEOUT: 30 * 60 * 1000, // 30 minutes
  IDLE_TIMEOUT: 5 * 60 * 1000, // 5 minutes
  NOTIFICATION_DURATION: 5000, // 5 seconds
} as const;

// Payment constants
export const PAYMENT = {
  MAX_AMOUNT: 100000,
  MIN_AMOUNT: 0.01,
  ALLOWED_CURRENCIES: ['USD', 'MVR', 'EUR', 'GBP', 'INR', 'AED', 'SAR', 'JPY', 'CNY', 'AUD', 'SGD', 'CHF'],
  METHODS: {
    CARD: 'card',
    CASH: 'cash',
    WALLET: 'wallet',
    CREDIT: 'credit',
    STAFF: 'staff',
  },
} as const;

// User roles
export const ROLES = {
  ADMIN: 'admin',
  KITCHEN_STAFF: 'kitchen_staff',
  CASHIER: 'cashier',
  WAITER: 'waiter',
} as const;

// Permissions
export const PERMISSIONS = {
  SETTINGS_EDIT: 'settings.edit',
  SETTINGS_VIEW: 'settings.view',
  POS_ACCESS: 'pos_access',
  KITCHEN_ACCESS: 'kitchen_access',
  ORDERS_MANAGE: 'orders.manage',
  PRODUCTS_MANAGE: 'products.manage',
} as const;

// Order statuses
export const ORDER_STATUS = {
  PENDING: 'pending',
  PREPARING: 'preparing',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
} as const;

// Order types
export const ORDER_TYPE = {
  DINE_IN: 'dine-in',
  TAKEAWAY: 'takeaway',
  POS: 'pos',
} as const;

// Media types
export const MEDIA_TYPE = {
  IMAGE: 'image',
  GIF: 'gif',
  VIDEO: 'video',
} as const;

// Suggestion types
export const SUGGESTION_TYPE = {
  POPULAR: 'popular',
  RECOMMENDED: 'recommended',
  TRENDING: 'trending',
} as const;

// Gateway types
export const GATEWAY_TYPE = {
  BML: 'bml',
  PAYPAL: 'paypal',
  SKRILL: 'skrill',
} as const;

// URL patterns
export const URL_PATTERNS = {
  UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const;

// Validation constants
export const VALIDATION = {
  MIN_PASSWORD_LENGTH: 6,
  MIN_PHONE_LENGTH: 7,
  MAX_PHONE_LENGTH: 15,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
} as const;

// UI constants
export const UI = {
  ITEMS_PER_PAGE: 20,
  MAX_TOAST_COUNT: 3,
  ANIMATION_DURATION: 300,
} as const;

export type PaymentMethod = typeof PAYMENT.METHODS[keyof typeof PAYMENT.METHODS];
export type UserRole = typeof ROLES[keyof typeof ROLES];
export type OrderStatus = typeof ORDER_STATUS[keyof typeof ORDER_STATUS];
export type OrderType = typeof ORDER_TYPE[keyof typeof ORDER_TYPE];
export type MediaType = typeof MEDIA_TYPE[keyof typeof MEDIA_TYPE];
export type SuggestionType = typeof SUGGESTION_TYPE[keyof typeof SUGGESTION_TYPE];
export type GatewayType = typeof GATEWAY_TYPE[keyof typeof GATEWAY_TYPE];
