import React from 'react';

const AgentStatus = ({ agentSteps, currentStep, statusMessage, destination }) => {
  return (
    <div className="flex-1 flex items-start justify-center px-6 py-8">
      <div className="w-full max-w-md">
        <div className="glass rounded-2xl p-8">
          <h3 className="text-[var(--color-text-muted)] text-sm uppercase tracking-wider mb-2 text-center">
            Planning your trip to <span className="text-[var(--color-accent)]">{destination}</span>
          </h3>
          <p className="text-[var(--color-text)] text-sm mb-6 text-center animate-pulse">
            {statusMessage || 'Connecting to agents...'}
          </p>
          <div className="space-y-4">
            {agentSteps.map((step, index) => (
              <div
                key={step.id}
                className={`flex items-center gap-4 transition-all duration-500 ${
                  index < currentStep
                    ? 'opacity-100'
                    : index === currentStep
                    ? 'opacity-100'
                    : 'opacity-30'
                }`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg transition-all duration-300 ${
                  index < currentStep
                    ? 'bg-[var(--color-accent)]/20'
                    : index === currentStep
                    ? 'bg-[var(--color-surface-2)]'
                    : 'bg-[var(--color-surface)]'
                }`}>
                  {index < currentStep ? (
                    <span className="text-[var(--color-accent)]">✓</span>
                  ) : (
                    <span>{step.icon}</span>
                  )}
                </div>
                <div className="flex-1">
                  <span className={`text-sm ${
                    index <= currentStep ? 'text-[var(--color-text)]' : 'text-[var(--color-text-subtle)]'
                  }`}>
                    {step.label}
                  </span>
                  {index === currentStep && (
                    <div className="flex gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ animationDelay: '200ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)] animate-pulse" style={{ animationDelay: '400ms' }} />
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgentStatus;
