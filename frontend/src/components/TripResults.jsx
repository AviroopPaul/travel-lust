import React, { useState } from 'react';
import FlightCard from './FlightCard';
import HotelCard from './HotelCard';
import VisaCard from './VisaCard';

// Placeholder component for missing/failed destination images
const DestinationImagePlaceholder = ({ destination }) => (
  <div className="relative rounded-2xl overflow-hidden bg-[var(--color-surface-2)] flex flex-col items-center justify-center h-full">
    <svg 
      width="48" 
      height="48" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="1.5" 
      className="text-[var(--color-text-subtle)] mb-2"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <polyline points="21 15 16 10 5 21"/>
    </svg>
    <span className="text-xs text-[var(--color-text-subtle)]">No image available</span>
  </div>
);

const TripResults = ({ tripPlan, currency, strictBudget, onOpenItinerary }) => {
  const [imageErrors, setImageErrors] = useState({});
  
  if (!tripPlan) return null;
  
  const handleImageError = (idx) => {
    setImageErrors(prev => ({ ...prev, [idx]: true }));
  };
  
  // Check if we have any valid destination images (either images exist or we should show placeholders)
  const hasDestinationImages = tripPlan.destination_images && tripPlan.destination_images.length > 0;
  const destinationSlots = hasDestinationImages ? tripPlan.destination_images : [null, null, null];

  return (
    <div className="flex-1 px-6 pb-12">
      <div className="max-w-5xl mx-auto">
        
        {/* Destination Hero Images */}
        <div className="grid grid-cols-3 gap-3 h-48 md:h-64 mb-8 animate-fade-in-up">
          {destinationSlots.map((img, idx) => (
            <div key={idx} className="relative rounded-2xl overflow-hidden">
              {img && !imageErrors[idx] ? (
                <>
                  <img 
                    src={img}
                    alt={`${tripPlan.destination} ${idx + 1}`}
                    className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                    onError={() => handleImageError(idx)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-transparent to-transparent opacity-60" />
                </>
              ) : (
                <DestinationImagePlaceholder destination={tripPlan.destination} />
              )}
            </div>
          ))}
        </div>

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

        {/* Flights - Two Column Layout */}
        <section className="mb-10 animate-fade-in-up delay-100" style={{ opacity: 0, animationFillMode: 'forwards' }}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif text-2xl text-[var(--color-text)]">Flights</h2>
            <span className="text-[var(--color-text-subtle)] text-sm">
              {(tripPlan.outbound_flights?.length || 0) + (tripPlan.return_flights?.length || 0)} options
            </span>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Outbound Flights Column */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                  <span className="text-[var(--color-accent)]">→</span>
                </div>
                <h3 className="font-medium text-[var(--color-text)]">Outbound Flights</h3>
              </div>
              <div className="space-y-4">
                {tripPlan.outbound_flights?.map((flight, idx) => (
                  <FlightCard key={`outbound-${idx}`} flight={flight} currency={currency} />
                ))}
                {(!tripPlan.outbound_flights || tripPlan.outbound_flights.length === 0) && (
                  <div className="glass rounded-xl p-4 text-center text-[var(--color-text-subtle)]">
                    No outbound flights found
                  </div>
                )}
              </div>
            </div>
            
            {/* Return Flights Column */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/10 flex items-center justify-center">
                  <span className="text-[var(--color-accent)]">←</span>
                </div>
                <h3 className="font-medium text-[var(--color-text)]">Return Flights</h3>
              </div>
              <div className="space-y-4">
                {tripPlan.return_flights?.map((flight, idx) => (
                  <FlightCard key={`return-${idx}`} flight={flight} currency={currency} />
                ))}
                {(!tripPlan.return_flights || tripPlan.return_flights.length === 0) && (
                  <div className="glass rounded-xl p-4 text-center text-[var(--color-text-subtle)]">
                    No return flights found
                  </div>
                )}
              </div>
            </div>
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
