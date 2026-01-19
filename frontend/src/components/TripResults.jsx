import React from 'react';
import FlightCard from './FlightCard';
import HotelCard from './HotelCard';
import VisaCard from './VisaCard';

const TripResults = ({ tripPlan, currency, strictBudget, onOpenItinerary }) => {
  if (!tripPlan) return null;

  return (
    <div className="flex-1 px-6 pb-12">
      <div className="max-w-5xl mx-auto">
        
        {/* Destination Hero Images */}
        {tripPlan.destination_images && tripPlan.destination_images.length > 0 && (
          <div className="grid grid-cols-3 gap-3 h-48 md:h-64 mb-8 animate-fade-in-up">
            {tripPlan.destination_images.map((img, idx) => (
              <div key={idx} className="relative rounded-2xl overflow-hidden">
                <img 
                  src={img}
                  alt={`${tripPlan.destination} ${idx + 1}`}
                  className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-transparent to-transparent opacity-60" />
              </div>
            ))}
          </div>
        )}

        {/* Total Budget Overview */}
        {tripPlan.total_budget && (
          <div className="glass rounded-2xl p-6 mb-8 border-[var(--color-accent)]/20 animate-fade-in-up bg-gradient-to-r from-[var(--color-accent)]/10 to-transparent">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="text-[var(--color-text-muted)] text-sm uppercase tracking-wider mb-1">Total Estimated Budget</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-serif text-[var(--color-accent)]">{tripPlan.total_budget}</span>
                  <span className="text-[var(--color-text-subtle)] text-sm">for {tripPlan.itinerary.length} days</span>
                </div>
              </div>
              <div className="flex items-center gap-4 bg-[var(--color-bg)]/40 p-3 rounded-xl border border-[var(--color-border)]">
                <div className="text-center px-4">
                  <p className="text-[var(--color-text-subtle)] text-xs mb-1">Currency</p>
                  <p className="font-medium">{tripPlan.preferred_currency}</p>
                </div>
                <div className="w-px h-8 bg-[var(--color-border)]" />
                <div className="text-center px-4">
                  <p className="text-[var(--color-text-subtle)] text-xs mb-1">Mode</p>
                  <p className="font-medium text-[var(--color-accent)]">{strictBudget ? 'Strict Budget' : 'Standard'}</p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Visa Notice */}
        {tripPlan.visa && (
          <VisaCard visa={tripPlan.visa} />
        )}

        {/* Flights */}
        <section className="mb-10 animate-fade-in-up delay-100" style={{ opacity: 0, animationFillMode: 'forwards' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif text-2xl text-[var(--color-text)]">Flights</h2>
            <span className="text-[var(--color-text-subtle)] text-sm">{tripPlan.flights.length} options</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tripPlan.flights.map((flight, idx) => (
              <FlightCard key={idx} flight={flight} currency={currency} />
            ))}
          </div>
        </section>

        {/* Hotels */}
        <section className="animate-fade-in-up delay-200" style={{ opacity: 0, animationFillMode: 'forwards' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif text-2xl text-[var(--color-text)]">Stays</h2>
            <span className="text-[var(--color-text-subtle)] text-sm">{tripPlan.hotels.length} options</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tripPlan.hotels.map((hotel, idx) => (
              <HotelCard key={idx} hotel={hotel} currency={currency} />
            ))}
          </div>
        </section>

        {/* Floating Itinerary Button */}
        <button
          onClick={onOpenItinerary}
          className="fixed bottom-6 right-6 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-bg)] font-semibold px-6 py-4 rounded-2xl shadow-2xl shadow-[var(--color-accent)]/20 flex items-center gap-3 transition-all duration-200 hover:scale-105 animate-fade-in-up"
          style={{ animationDelay: '400ms', opacity: 0, animationFillMode: 'forwards' }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="1"/>
            <path d="M9 12h6M9 16h6"/>
          </svg>
          <span>View Itinerary</span>
          <span className="bg-[var(--color-bg)]/20 px-2 py-0.5 rounded-lg text-sm">
            {tripPlan.itinerary.length} days
          </span>
        </button>
      </div>
    </div>
  );
};

export default TripResults;
