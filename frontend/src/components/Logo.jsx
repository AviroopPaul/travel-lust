import React from 'react';

const Logo = ({ onClick, className = "" }) => {
    return (
        <div 
            onClick={onClick}
            className={`cursor-pointer transition-opacity hover:opacity-80 ${className}`}
        >
            <h1 className="font-serif font-medium tracking-tight">
                <span className="gradient-text">Wanderlust</span>
            </h1>
        </div>
    );
};

export default Logo;
