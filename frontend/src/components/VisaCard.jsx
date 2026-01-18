import React, { useState } from 'react';

const VisaCard = ({ visa }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    
    const hasApplicationInfo = visa.application_url || (visa.application_steps && visa.application_steps.length > 0);

    return (
        <div 
            className={`glass rounded-xl p-5 mb-8 animate-fade-in-up ${
                visa.required 
                    ? 'border-amber-500/20 bg-amber-500/5' 
                    : 'border-emerald-500/20 bg-emerald-500/5'
            }`}
        >
            <div className="flex items-start gap-3">
                <span className="text-xl">{visa.required ? '🛂' : '✓'}</span>
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className={`font-medium mb-1 ${visa.required ? 'text-amber-400' : 'text-emerald-400'}`}>
                            {visa.required ? 'Visa Required' : 'No Visa Required'}
                        </h3>
                        {visa.required && hasApplicationInfo && (
                            <button
                                onClick={() => setIsExpanded(!isExpanded)}
                                className="text-xs bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] px-3 py-1.5 rounded-lg transition-all duration-200 flex items-center gap-1.5"
                            >
                                <span>How to Apply</span>
                                <svg 
                                    width="12" 
                                    height="12" 
                                    viewBox="0 0 24 24" 
                                    fill="none" 
                                    stroke="currentColor" 
                                    strokeWidth="2"
                                    className={`transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                                >
                                    <path d="M6 9l6 6 6-6"/>
                                </svg>
                            </button>
                        )}
                    </div>
                    <p className="text-[var(--color-text-muted)] text-sm">
                        {visa.requirements.join(' • ')}
                    </p>
                    {visa.processing_time !== 'N/A' && visa.processing_time !== 'Unknown' && (
                        <p className="text-[var(--color-text-subtle)] text-xs mt-2">
                            Processing: {visa.processing_time}
                        </p>
                    )}
                    
                    {/* Expandable Application Section */}
                    {isExpanded && hasApplicationInfo && (
                        <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
                            <h4 className="text-sm font-medium text-[var(--color-text)] mb-3">
                                How to Apply
                            </h4>
                            
                            {visa.application_steps && visa.application_steps.length > 0 && (
                                <ol className="space-y-2 mb-4">
                                    {visa.application_steps.map((step, idx) => (
                                        <li key={idx} className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]">
                                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-[var(--color-accent)]/20 text-[var(--color-accent)] text-xs flex items-center justify-center mt-0.5">
                                                {idx + 1}
                                            </span>
                                            <span>{step.replace(/^\d+\.\s*/, '')}</span>
                                        </li>
                                    ))}
                                </ol>
                            )}
                            
                            {visa.application_url && (
                                <a
                                    href={visa.application_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-bg)] font-medium px-4 py-2 rounded-lg text-sm transition-colors duration-200"
                                >
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                                        <polyline points="15,3 21,3 21,9"/>
                                        <line x1="10" y1="14" x2="21" y2="3"/>
                                    </svg>
                                    Apply Online
                                </a>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default VisaCard;

