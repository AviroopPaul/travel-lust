import React from 'react';
import AgentStatus from '../components/AgentStatus';
import TripResults from '../components/TripResults';
import { CURRENCIES } from '../currencyUtils';
import CountryDropdown from '../components/CountryDropdown';

const ResultsPage = ({
  tripPlan,
  loading,
  error,
  agentSteps,
  currentStep,
  statusMessage,
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
  setIsItineraryOpen,
  onRefetch
}) => {
  return (
    <div className="flex-1 flex flex-col">
      {/* Compact Search Form - Above Destination Tag */}
      {!loading && tripPlan && (
        <div className="pt-4 pb-2 w-full max-w-5xl mx-auto px-6 relative z-20">
          <div className="glass rounded-2xl p-3 border border-[var(--color-border)]">
            {/* Compact Single Row Form */}
            <form onSubmit={onRefetch}>
              <div className="flex flex-wrap items-center gap-2 mb-3">
                {/* Destination */}
                <div className="flex-1 min-w-[200px]">
                  <CountryDropdown
                    value={destination}
                    onChange={setDestination}
                    placeholder="Where to?"
                    required
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
                        <circle cx="12" cy="10" r="3"/>
                      </svg>
                    }
                  />
                </div>

                {/* Origin */}
                <div className="w-32">
                  <CountryDropdown
                    value={origin}
                    onChange={setOrigin}
                    placeholder="From"
                    icon={
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <circle cx="12" cy="12" r="3"/>
                      </svg>
                    }
                  />
                </div>

                {/* Travel Time */}
                <div className="w-40 relative">
                  <div className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                      <line x1="16" y1="2" x2="16" y2="6"/>
                      <line x1="8" y1="2" x2="8" y2="6"/>
                      <line x1="3" y1="10" x2="21" y2="10"/>
                    </svg>
                  </div>
                  <input
                    type="text"
                    placeholder="When?"
                    value={travelTime}
                    onChange={(e) => setTravelTime(e.target.value)}
                    className="w-full bg-[var(--color-surface)] rounded-lg pl-8 pr-3 py-2 text-[var(--color-text)] placeholder-[var(--color-text-subtle)] outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)]/50 transition-colors text-sm"
                  />
                </div>

                {/* Days */}
                <div className="flex items-center gap-1.5 bg-[var(--color-surface)] rounded-lg px-2.5 py-2 border border-[var(--color-border)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                  <select
                    value={days}
                    onChange={(e) => setDays(parseInt(e.target.value))}
                    className="bg-transparent text-[var(--color-text)] outline-none cursor-pointer text-xs w-16"
                  >
                    {[...Array(14)].map((_, i) => (
                      <option key={i + 1} value={i + 1} className="bg-[var(--color-surface)]">
                        {i + 1}d
                      </option>
                    ))}
                  </select>
                </div>

                {/* Travelers */}
                <div className="flex items-center gap-1.5 bg-[var(--color-surface)] rounded-lg px-2.5 py-2 border border-[var(--color-border)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                    <circle cx="9" cy="7" r="4"/>
                  </svg>
                  <select
                    value={travelers}
                    onChange={(e) => setTravelers(parseInt(e.target.value))}
                    className="bg-transparent text-[var(--color-text)] outline-none cursor-pointer text-xs w-12"
                  >
                    {[...Array(10)].map((_, i) => (
                      <option key={i + 1} value={i + 1} className="bg-[var(--color-surface)]">
                        {i + 1}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Currency */}
                <div className="flex items-center gap-1.5 bg-[var(--color-surface)] rounded-lg px-2.5 py-2 border border-[var(--color-border)]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-muted)" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <path d="M12 6v12M9 9h6M9 15h6"/>
                  </svg>
                  <select
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                    className="bg-transparent text-[var(--color-text)] outline-none cursor-pointer text-xs w-16"
                  >
                    {Object.keys(CURRENCIES).map(code => (
                      <option key={code} value={code} className="bg-[var(--color-surface)]">
                        {code}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Budget Toggle */}
                <button
                  type="button"
                  onClick={() => setStrictBudget(!strictBudget)}
                  className={`flex items-center gap-1.5 rounded-lg px-2.5 py-2 border transition-all text-xs ${
                    strictBudget 
                      ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-accent)]' 
                      : 'bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)]/30'
                  }`}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                  <span>Budget</span>
                </button>
              </div>

              {/* Plan Again Button - Centered */}
              <div className="flex justify-center">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-bg)] font-semibold px-6 py-2.5 rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-sm hover:scale-[1.02] active:scale-[0.98]"
                >
                  {loading ? (
                    <>
                      <span className="w-3 h-3 border-2 border-[var(--color-bg)] border-t-transparent rounded-full animate-spin" />
                      <span>Planning...</span>
                    </>
                  ) : (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0118.8-4.3M22 12.5a10 10 0 01-18.8 4.2"/>
                      </svg>
                      <span>Plan Again</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Destination Tag (shown after search) */}
      {!loading && tripPlan && (
        <div className="pt-2 pb-6 w-full max-w-4xl mx-auto px-6">
          <div className="flex items-center justify-center gap-4 text-[var(--color-text-muted)] animate-fade-in">
            <span className="text-sm">Trip to</span>
            <span className="font-serif text-[var(--color-text)] text-4xl">{tripPlan.destination}</span>
          </div>
        </div>
      )}

      {/* Agent Status - Shows during loading */}
      {loading && (
        <AgentStatus 
          agentSteps={agentSteps}
          currentStep={currentStep}
          statusMessage={statusMessage}
          destination={destination}
        />
      )}

      {/* Error */}
      {error && (
        <div className="px-6 pb-8 max-w-2xl mx-auto w-full animate-fade-in">
          <div className="glass rounded-xl p-4 border-red-500/20 bg-red-500/5">
            <p className="text-red-400 text-center">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {!loading && tripPlan && (
        <TripResults 
          tripPlan={tripPlan}
          currency={currency}
          strictBudget={strictBudget}
          onOpenItinerary={() => setIsItineraryOpen(true)}
        />
      )}
    </div>
  );
};

export default ResultsPage;
