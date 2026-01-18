import React, { useState } from 'react';

const Hero = ({ onSearch, loading }) => {
    const [destination, setDestination] = useState('');
    const [dates, setDates] = useState('');
    const [origin, setOrigin] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        onSearch({ destination, dates, origin, query: `Plan a trip to ${destination}` });
    };

    return (
        <div className="relative overflow-hidden bg-slate-900 text-white rounded-3xl p-8 mb-8 shadow-2xl">
            {/* Abstract Background */}
            <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
                <div className="absolute top-[-50%] left-[-20%] w-[800px] h-[800px] rounded-full bg-indigo-600 blur-[120px]"></div>
                <div className="absolute bottom-[-20%] right-[-20%] w-[600px] h-[600px] rounded-full bg-rose-600 blur-[100px]"></div>
            </div>

            <div className="relative z-10 max-w-2xl mx-auto text-center">
                <h1 className="text-4xl md:text-5xl font-extrabold mb-4 tracking-tight">
                    Where to next?
                </h1>
                <p className="text-slate-300 mb-8 text-lg">
                    AI-powered travel planning at your fingertips.
                </p>

                <form onSubmit={handleSubmit} className="bg-white/10 backdrop-blur-lg border border-white/20 p-2 rounded-2xl flex flex-col md:flex-row gap-2">
                    <input 
                        type="text" 
                        placeholder="Destination (e.g. Paris)" 
                        className="bg-transparent text-white placeholder-slate-400 px-4 py-3 outline-none flex-1 rounded-xl focus:bg-white/5 transition-all"
                        value={destination}
                        onChange={(e) => setDestination(e.target.value)}
                        required
                    />
                     <input 
                        type="text" 
                        placeholder="Origin (Optional)" 
                        className="bg-transparent text-white placeholder-slate-400 px-4 py-3 outline-none w-full md:w-32 hidden md:block border-l border-white/10"
                        value={origin}
                        onChange={(e) => setOrigin(e.target.value)}
                    />
                    <input 
                        type="text" 
                        placeholder="Dates (e.g. Next week)" 
                        className="bg-transparent text-white placeholder-slate-400 px-4 py-3 outline-none w-full md:w-48 border-l border-white/10"
                        value={dates}
                        onChange={(e) => setDates(e.target.value)}
                    />
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="bg-white text-slate-900 font-bold px-8 py-3 rounded-xl hover:bg-slate-100 transition-transform active:scale-95 disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        {loading ? 'Planning...' : 'Go'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Hero;
