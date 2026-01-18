import React from 'react';
import { CURRENCIES } from '../currencyUtils';

const TripSearchForm = ({
    destination,
    setDestination,
    origin,
    setOrigin,
    days,
    setDays,
    travelers,
    setTravelers,
    travelTime,
    setTravelTime,
    currency,
    setCurrency,
    strictBudget,
    setStrictBudget,
    loading,
    onSubmit,
}) => {
    return (
        <form onSubmit={onSubmit} className="relative">
            <div className="glass rounded-2xl p-4 md:p-5 glow">
                {/* Row 1: Where & When */}
                <div className="flex flex-col md:flex-row gap-3 mb-3">
                    {/* Destination */}
                    <div className="flex-1 relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                                <circle cx="12" cy="10" r="3"/>
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="Where to?"
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            className="w-full bg-[var(--color-surface)] rounded-xl pl-10 pr-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-subtle)] outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)]/50 transition-colors"
                            required
                        />
                    </div>

                    {/* Origin */}
                    <div className="md:w-40 relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="12" cy="12" r="10"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="From"
                            value={origin}
                            onChange={(e) => setOrigin(e.target.value)}
                            className="w-full bg-[var(--color-surface)] rounded-xl pl-10 pr-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-subtle)] outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)]/50 transition-colors"
                        />
                    </div>

                    {/* Travel Time */}
                    <div className="md:w-64 relative">
                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                                <line x1="16" y1="2" x2="16" y2="6"/>
                                <line x1="8" y1="2" x2="8" y2="6"/>
                                <line x1="3" y1="10" x2="21" y2="10"/>
                            </svg>
                        </div>
                        <input
                            type="text"
                            placeholder="When? (e.g., March 2026)"
                            value={travelTime}
                            onChange={(e) => setTravelTime(e.target.value)}
                            className="w-full bg-[var(--color-surface)] rounded-xl pl-10 pr-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-subtle)] outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)]/50 transition-colors text-sm"
                        />
                    </div>
                </div>

                {/* Row 2: Trip Details */}
                <div className="flex flex-wrap items-center justify-center gap-2 mb-4">
                    {/* Days */}
                    <div className="flex items-center gap-2 bg-[var(--color-surface)] rounded-xl px-3 py-2.5 border border-[var(--color-border)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        <select
                            value={days}
                            onChange={(e) => setDays(parseInt(e.target.value))}
                            className="bg-transparent text-[var(--color-text)] outline-none cursor-pointer text-sm"
                        >
                            {[...Array(14)].map((_, i) => (
                                <option key={i + 1} value={i + 1} className="bg-[var(--color-surface)]">
                                    {i + 1} {i === 0 ? 'day' : 'days'}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Travelers */}
                    <div className="flex items-center gap-2 bg-[var(--color-surface)] rounded-xl px-3 py-2.5 border border-[var(--color-border)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                            <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                        </svg>
                        <select
                            value={travelers}
                            onChange={(e) => setTravelers(parseInt(e.target.value))}
                            className="bg-transparent text-[var(--color-text)] outline-none cursor-pointer text-sm"
                        >
                            {[...Array(10)].map((_, i) => (
                                <option key={i + 1} value={i + 1} className="bg-[var(--color-surface)]">
                                    {i + 1} {i === 0 ? 'traveler' : 'travelers'}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Currency */}
                    <div className="flex items-center gap-2 bg-[var(--color-surface)] rounded-xl px-3 py-2.5 border border-[var(--color-border)]">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                            <circle cx="12" cy="12" r="10"/>
                            <path d="M12 6v12M9 9h6M9 15h6"/>
                        </svg>
                        <select
                            value={currency}
                            onChange={(e) => setCurrency(e.target.value)}
                            className="bg-transparent text-[var(--color-text)] outline-none cursor-pointer text-sm"
                        >
                            {Object.keys(CURRENCIES).map(code => (
                                <option key={code} value={code} className="bg-[var(--color-surface)]">
                                    {CURRENCIES[code].label}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Budget Toggle */}
                    <button
                        type="button"
                        onClick={() => setStrictBudget(!strictBudget)}
                        className={`flex items-center gap-2 rounded-xl px-3 py-2.5 border transition-all whitespace-nowrap ${
                            strictBudget 
                                ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-accent)]' 
                                : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30'
                        }`}
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                        </svg>
                        <span className="text-sm">Budget Mode</span>
                        {strictBudget && (
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <path d="M20 6L9 17l-5-5"/>
                            </svg>
                        )}
                    </button>
                </div>

                {/* Row 3: Submit Button - Centered */}
                <div className="flex justify-center">
                    <button
                        type="submit"
                        disabled={loading}
                        className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-bg)] font-semibold px-8 py-3 rounded-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2.5 min-w-[180px] hover:scale-[1.02] active:scale-[0.98]"
                    >
                        {loading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />
                                <span>Planning your trip...</span>
                            </>
                        ) : (
                            <>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M22 2L11 13"/>
                                    <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
                                </svg>
                                <span>Plan My Trip</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </form>
    );
};

export default TripSearchForm;
