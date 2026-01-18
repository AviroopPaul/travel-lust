import React from 'react';
import ActivityCard from './ActivityCard';

const ItineraryDrawer = ({ isOpen, onClose, days, destination }) => {
    return (
        <>
            {/* Backdrop */}
            <div 
                className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-40 transition-opacity duration-300 ${
                    isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
                }`}
                onClick={onClose}
            />
            
            {/* Drawer */}
            <div 
                className={`fixed right-0 top-0 h-full w-full max-w-lg bg-[var(--color-bg)] border-l border-[var(--color-border)] z-50 transform transition-transform duration-300 ease-out ${
                    isOpen ? 'translate-x-0' : 'translate-x-full'
                }`}
            >
                {/* Header */}
                <div className="sticky top-0 bg-[var(--color-bg)]/95 backdrop-blur-md border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between">
                    <div>
                        <h2 className="font-serif text-2xl text-[var(--color-text)]">Your Itinerary</h2>
                        {destination && (
                            <p className="text-[var(--color-text-muted)] text-sm mt-1">{destination}</p>
                        )}
                    </div>
                    <button 
                        onClick={onClose}
                        className="w-10 h-10 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors"
                    >
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 4L4 12M4 4l8 8" />
                        </svg>
                    </button>
                </div>
                
                {/* Content */}
                <div className="overflow-y-auto h-[calc(100%-80px)] px-6 py-6">
                    {days && days.length > 0 ? (
                        <div className="relative">
                            {/* Timeline line */}
                            <div className="absolute left-[11px] top-4 bottom-4 w-px bg-gradient-to-b from-[var(--color-accent)] via-[var(--color-border)] to-transparent" />
                            
                            <div className="space-y-8">
                                {days.map((day, index) => (
                                    <div 
                                        key={index} 
                                        className="relative pl-10 animate-fade-in-up"
                                        style={{ animationDelay: `${index * 100}ms`, opacity: 0, animationFillMode: 'forwards' }}
                                    >
                                        {/* Timeline dot */}
                                        <div className="absolute left-0 top-1 w-[23px] h-[23px] rounded-full bg-[var(--color-accent)] border-4 border-[var(--color-bg)] shadow-lg shadow-[var(--color-accent)]/20" />
                                        
                                        {/* Day header */}
                                        <div className="mb-4">
                                            <span className="inline-block px-3 py-1 rounded-full bg-[var(--color-accent)]/10 text-[var(--color-accent)] text-sm font-medium">
                                                Day {day.day}
                                            </span>
                                        </div>
                                        
                                        {/* Activities */}
                                        <div className="space-y-3">
                                            {day.activities.map((activity, actIdx) => (
                                                <ActivityCard key={actIdx} activity={activity} />
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-[var(--color-text-muted)] py-12">
                            No itinerary available
                        </div>
                    )}
                </div>
            </div>
        </>
    );
};

export default ItineraryDrawer;

