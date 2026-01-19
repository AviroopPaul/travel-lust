import React from 'react';
import AgentStatus from '../components/AgentStatus';
import TripResults from '../components/TripResults';

const ResultsPage = ({
  tripPlan,
  loading,
  error,
  agentSteps,
  currentStep,
  statusMessage,
  destination,
  currency,
  strictBudget,
  setIsItineraryOpen
}) => {
  return (
    <div className="flex-1 flex flex-col">
      {/* Destination Tag (shown after search) */}
      {!loading && tripPlan && (
        <div className="pt-4 pb-6 w-full max-w-4xl mx-auto px-6">
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
