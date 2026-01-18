import React, { useState } from 'react';
import { convertPrice } from '../currencyUtils';

const HotelCard = ({ hotel, currency }) => {
    const [imageError, setImageError] = useState(false);

    return (
        <div className="glass rounded-xl overflow-hidden hover:bg-[var(--color-surface-2)] transition-all duration-200 group">
            {/* Image */}
            {hotel.image_url && !imageError && (
                <div className="relative h-36 overflow-hidden">
                    <img 
                        src={hotel.image_url}
                        alt={hotel.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        onError={() => setImageError(true)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] to-transparent opacity-60" />
                    <div className="absolute bottom-2 left-3 flex items-center gap-1 text-amber-400 text-sm">
                        <span>★</span>
                        <span className="text-white">{hotel.rating}</span>
                    </div>
                </div>
            )}
            
            {/* Content */}
            <div className="p-4">
                <div className="flex justify-between items-start mb-2">
                    <h3 className="font-medium text-[var(--color-text)] leading-tight pr-2">{hotel.name}</h3>
                    <span className="text-[var(--color-accent)] font-semibold text-sm whitespace-nowrap">
                        {convertPrice(hotel.price_per_night, currency)}
                    </span>
                </div>
                
                {(imageError || !hotel.image_url) && (
                    <div className="flex items-center gap-1 text-amber-400 text-sm mb-2">
                        <span>★</span>
                        <span className="text-[var(--color-text-muted)]">{hotel.rating}</span>
                    </div>
                )}
                
                <p className="text-sm text-[var(--color-text-muted)] line-clamp-2 mb-3">{hotel.description}</p>
                
                <div className="flex flex-wrap gap-1.5 mb-3">
                    {hotel.amenities.slice(0, 3).map((amenity, idx) => (
                        <span 
                            key={idx} 
                            className="text-xs bg-[var(--color-surface-2)] text-[var(--color-text-subtle)] px-2 py-1 rounded-md"
                        >
                            {amenity}
                        </span>
                    ))}
                    {hotel.amenities.length > 3 && (
                        <span className="text-xs text-[var(--color-text-subtle)] px-2 py-1">
                            +{hotel.amenities.length - 3}
                        </span>
                    )}
                </div>

                {hotel.booking_url && (
                    <a 
                        href={hotel.booking_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-full text-center py-2 px-4 rounded-lg bg-[var(--color-surface-2)] hover:bg-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm transition-all duration-200"
                    >
                        Book {hotel.name} →
                    </a>
                )}
            </div>
        </div>
    );
};

export default HotelCard;
