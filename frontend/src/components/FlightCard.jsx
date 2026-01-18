import React from 'react';
import { convertPrice } from '../currencyUtils';

/**
 * Format datetime string to readable format
 * Handles ISO format (2026-01-20T15:00:00) and plain time strings
 */
const formatDateTime = (dateTimeStr) => {
    if (!dateTimeStr) return '';
    
    // Check if it's an ISO datetime string
    if (dateTimeStr.includes('T') || dateTimeStr.match(/^\d{4}-\d{2}-\d{2}/)) {
        try {
            const date = new Date(dateTimeStr);
            if (!isNaN(date.getTime())) {
                // Format: "Jan 20, 3:00 PM"
                return date.toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                }) + ', ' + date.toLocaleTimeString('en-US', {
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true
                });
            }
        } catch {
            // Fall through to return original
        }
    }
    
    // Return as-is if not ISO format or parsing failed
    return dateTimeStr;
};

const FlightCard = ({ flight, currency }) => {
    const formattedDeparture = formatDateTime(flight.departure);
    const formattedArrival = formatDateTime(flight.arrival);
    
    return (
        <div className="glass rounded-xl p-4 hover:bg-[var(--color-surface-2)] transition-all duration-200 group">
            <div className="flex justify-between items-start mb-4">
                <span className="text-[var(--color-accent)] font-medium text-sm">{flight.airline}</span>
                <span className="font-semibold text-[var(--color-text)]">
                    {convertPrice(flight.price, currency)}
                </span>
            </div>
            
            <div className="flex items-center justify-between mb-4">
                <div className="text-left">
                    <div className="text-lg font-medium text-[var(--color-text)]">{formattedDeparture}</div>
                    <div className="text-xs text-[var(--color-text-subtle)]">Departure</div>
                </div>
                
                <div className="flex-1 mx-4 flex items-center">
                    <div className="flex-1 h-px bg-[var(--color-border)]" />
                    <div className="px-3 py-1">
                        <div className="text-xs text-[var(--color-text-muted)] text-center">{flight.duration}</div>
                        <div className="text-[var(--color-accent)] text-center text-sm mt-0.5">✈</div>
                    </div>
                    <div className="flex-1 h-px bg-[var(--color-border)]" />
                </div>
                
                <div className="text-right">
                    <div className="text-lg font-medium text-[var(--color-text)]">{formattedArrival}</div>
                    <div className="text-xs text-[var(--color-text-subtle)]">Arrival</div>
                </div>
            </div>

            {flight.booking_url && (
                <a 
                    href={flight.booking_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center py-2 px-4 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm transition-all duration-200"
                >
                    View on Google Flights →
                </a>
            )}
        </div>
    );
};

export default FlightCard;
