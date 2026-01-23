import React, { useState, useRef, useEffect, useMemo } from 'react';
import { fetchAirports, searchAirports } from '../airports';

const CountryDropdown = ({ value, onChange, placeholder, required = false, icon }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState(value || '');
    const [airports, setAirports] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const dropdownRef = useRef(null);
    const inputRef = useRef(null);

    // Fetch airports on mount
    useEffect(() => {
        const loadAirports = async () => {
            setIsLoading(true);
            try {
                const airportList = await fetchAirports();
                // Ensure we always set an array
                if (Array.isArray(airportList)) {
                    setAirports(airportList);
                } else {
                    console.error('fetchAirports did not return an array:', airportList);
                    setAirports([]);
                }
            } catch (error) {
                console.error('Failed to load airports:', error);
                setAirports([]);
            } finally {
                setIsLoading(false);
            }
        };
        
        loadAirports();
    }, []);

    // Filter airports based on search query
    const filteredAirports = useMemo(() => {
        if (isLoading || airports.length === 0) {
            return [];
        }
        return searchAirports(airports, searchQuery);
    }, [searchQuery, airports, isLoading]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setIsOpen(false);
                // Reset search query when closing if no value is selected
                if (!value) {
                    setSearchQuery('');
                }
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [value]);

    // Update search query when value changes externally (only if different)
    // This is necessary to sync external prop changes to internal search state
    useEffect(() => {
        if (value && value !== searchQuery) {
            setSearchQuery(value);
        } else if (!value && searchQuery) {
            // Clear if value is cleared externally
            setSearchQuery('');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value]);

    const handleInputChange = (e) => {
        const query = e.target.value;
        setSearchQuery(query);
        setIsOpen(true);
        // Clear selection if user is typing
        if (value && query !== value) {
            onChange('');
        }
    };

    const handleSelectAirport = (airport) => {
        onChange(airport);
        setSearchQuery(airport);
        setIsOpen(false);
        inputRef.current?.blur();
    };

    const handleInputFocus = () => {
        setIsOpen(true);
        // If there's a value, allow editing it
        if (value) {
            setSearchQuery(value);
        }
    };

    const handleInputBlur = () => {
        // Don't close immediately - let click outside handler do it
        // This allows clicking on dropdown items
        setTimeout(() => {
            if (!value && !searchQuery) {
                setIsOpen(false);
            }
        }, 200);
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Icon */}
            {icon && (
                <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] z-10">
                    {icon}
                </div>
            )}

            {/* Input */}
            <input
                ref={inputRef}
                type="text"
                placeholder={placeholder}
                value={searchQuery}
                onChange={handleInputChange}
                onFocus={handleInputFocus}
                onBlur={handleInputBlur}
                className={`w-full bg-[var(--color-surface)] rounded-xl ${icon ? 'pl-10' : 'pl-4'} pr-4 py-3 text-[var(--color-text)] placeholder-[var(--color-text-subtle)] outline-none border border-[var(--color-border)] focus:border-[var(--color-accent)]/50 transition-colors`}
                required={required}
                autoComplete="off"
            />

            {/* Loading state */}
            {isOpen && isLoading && (
                <div className="absolute z-[9999] w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg p-4">
                    <p className="text-[var(--color-text-muted)] text-sm">Loading airports...</p>
                </div>
            )}

            {/* Dropdown */}
            {isOpen && !isLoading && filteredAirports.length > 0 && (
                <div className="absolute z-[9999] w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg max-h-60 overflow-auto">
                    {filteredAirports.map((airport) => (
                        <button
                            key={airport}
                            type="button"
                            onClick={() => handleSelectAirport(airport)}
                            className="w-full text-left px-4 py-2.5 hover:bg-[var(--color-accent)]/10 text-[var(--color-text)] transition-colors first:rounded-t-xl last:rounded-b-xl focus:outline-none focus:bg-[var(--color-accent)]/10"
                        >
                            {airport}
                        </button>
                    ))}
                </div>
            )}

            {/* No results message */}
            {isOpen && !isLoading && filteredAirports.length === 0 && searchQuery && (
                <div className="absolute z-[9999] w-full mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-lg p-4">
                    <p className="text-[var(--color-text-muted)] text-sm">No airports found</p>
                </div>
            )}
        </div>
    );
};

export default CountryDropdown;
