import React from 'react';

const ActivityCard = ({ activity }) => {
    return (
        <div className="bg-[var(--color-surface-2)] rounded-lg overflow-hidden hover:bg-[var(--color-border)] transition-colors duration-200 p-3">
            <div className="flex justify-between items-start gap-2 mb-1">
                <h4 className="text-sm font-medium text-[var(--color-text)]">{activity.name}</h4>
                <span className="text-xs text-[var(--color-accent)] whitespace-nowrap">{activity.price}</span>
            </div>
            <p className="text-xs text-[var(--color-text-muted)] line-clamp-2 mb-1">{activity.description}</p>
            <span className="text-[10px] text-[var(--color-text-subtle)]">{activity.duration}</span>
        </div>
    );
};

export default ActivityCard;
