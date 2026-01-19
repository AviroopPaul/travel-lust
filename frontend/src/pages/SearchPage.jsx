import React from 'react';
import Logo from '../components/Logo';
import TripSearchForm from '../components/TripSearchForm';

const SearchPage = ({
  destination, setDestination,
  origin, setOrigin,
  days, setDays,
  travelers, setTravelers,
  travelTime, setTravelTime,
  currency, setCurrency,
  strictBudget, setStrictBudget,
  loading,
  onSubmit
}) => {
  return (
    <div className="flex-1 flex items-center justify-center py-12">
      <div className="w-full max-w-4xl mx-auto px-6">
        {/* Logo/Title */}
        <div className="text-center mb-8">
          <Logo className="text-5xl md:text-6xl mb-4" />
          <p className="text-[var(--color-text-muted)] text-lg">
            Where would you like to go?
          </p>
        </div>

        {/* Search Form */}
        <TripSearchForm
          destination={destination}
          setDestination={setDestination}
          origin={origin}
          setOrigin={setOrigin}
          days={days}
          setDays={setDays}
          travelers={travelers}
          setTravelers={setTravelers}
          travelTime={travelTime}
          setTravelTime={setTravelTime}
          currency={currency}
          setCurrency={setCurrency}
          strictBudget={strictBudget}
          setStrictBudget={setStrictBudget}
          loading={loading}
          onSubmit={onSubmit}
        />

        <div className="mt-12 text-center animate-fade-in" style={{ animationDelay: '600ms', opacity: 0, animationFillMode: 'forwards' }}>
          <p className="text-[var(--color-text-subtle)] text-sm">
            AI-powered travel planning • Flights • Hotels • Activities
          </p>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
