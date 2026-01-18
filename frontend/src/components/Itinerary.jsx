import React from 'react';
import ActivityCard from './ActivityCard';

const Itinerary = ({ days }) => {
    return (
        <div>
            <h2 className="font-serif text-xl text-[var(--color-text)] mb-6">Your Itinerary</h2>
            
            <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[7px] top-2 bottom-2 w-px bg-[var(--color-border)]" />
                
                <div className="space-y-6">
                    {days.map((day, index) => (
                        <div key={index} className="relative pl-7">
                            {/* Timeline dot */}
                            <div className="absolute left-0 top-1 w-[15px] h-[15px] rounded-full bg-[var(--color-accent)] border-4 border-[var(--color-surface)]" />
                            
                            <div className="mb-3">
                                <span className="text-sm font-medium text-[var(--color-accent)]">Day {day.day}</span>
                            </div>
                            
                            <div className="space-y-2">
                                {day.activities.map((activity, actIdx) => (
                                    <ActivityCard key={actIdx} activity={activity} />
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Itinerary;
