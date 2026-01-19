import React from 'react';
import Logo from './Logo';

const Navbar = ({ hasSearched, onNewTrip, onOpenSidebar }) => {
  return (
    <header className="fixed top-0 left-0 right-0 z-30 px-6 py-4 flex items-center justify-between">
      <div className="flex items-center gap-4">
        <button
          onClick={onOpenSidebar}
          className="w-10 h-10 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors border border-[var(--color-border)]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 12h18M3 6h18M3 18h18" />
          </svg>
        </button>
        {hasSearched && (
          <Logo 
            onClick={onNewTrip} 
            className="text-2xl animate-fade-in"
          />
        )}
      </div>
      
      {hasSearched && (
        <button
          onClick={onNewTrip}
          className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm flex items-center gap-2 transition-colors"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New Trip
        </button>
      )}
    </header>
  );
};

export default Navbar;
