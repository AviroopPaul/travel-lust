export const CURRENCIES = {
    USD: { symbol: '$', label: 'USD ($)' },
    CAD: { symbol: 'C$', label: 'CAD (C$)' },
    EUR: { symbol: '€', label: 'EUR (€)' },
    GBP: { symbol: '£', label: 'GBP (£)' },
    INR: { symbol: '₹', label: 'INR (₹)' },
};

/**
 * Format price for display. Backend already returns prices in the user's preferred currency,
 * so no conversion is needed - just ensure consistent formatting.
 */
export const convertPrice = (priceStr, currencyCode) => {
    if (!priceStr) return priceStr;
    
    // The backend already returns prices in the user's preferred currency
    // Just return the price as-is (already formatted by backend)
    return priceStr;
};
