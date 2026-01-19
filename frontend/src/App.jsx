import React, { useState, useEffect } from 'react';
import { planTripWithSession } from './api';
import FlightCard from './components/FlightCard';
import HotelCard from './components/HotelCard';
import ItineraryDrawer from './components/ItineraryDrawer';
import ChatSidebar from './components/ChatSidebar';
import TripSearchForm from './components/TripSearchForm';
import VisaCard from './components/VisaCard';
import Logo from './components/Logo';


const agentSteps = [
    { id: 'visa', label: 'Checking visa requirements', icon: '🛂' },
    { id: 'flights', label: 'Searching for flights', icon: '✈️' },
    { id: 'hotels', label: 'Finding accommodations', icon: '🏨' },
    { id: 'activities', label: 'Discovering activities', icon: '🎯' },
    { id: 'itinerary', label: 'Crafting your itinerary', icon: '📋' },
];

function App() {
    const [tripPlan, setTripPlan] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hasSearched, setHasSearched] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);
    const [destination, setDestination] = useState('');
    const [dates, setDates] = useState('');
    const [origin, setOrigin] = useState('');
    const [isItineraryOpen, setIsItineraryOpen] = useState(false);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [currentSessionId, setCurrentSessionId] = useState(null);
    const [currency, setCurrency] = useState('USD');
    const [days, setDays] = useState(3);
    const [travelers, setTravelers] = useState(1);
    const [travelTime, setTravelTime] = useState('');
    const [strictBudget, setStrictBudget] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [clientId] = useState(() => crypto.randomUUID());

    // WebSocket connection for status updates
    useEffect(() => {
        let ws = null;
        let reconnectTimer = null;

        const connect = () => {
            ws = new WebSocket(`ws://localhost:8000/ws/${clientId}`);

            ws.onopen = () => {
                console.log('Connected to status websocket');
            };

            ws.onmessage = (event) => {
                const data = JSON.parse(event.data);
                console.log('Status update:', data);
                
                if (data.status) {
                    setStatusMessage(data.status);
                }

                // Map specific steps to our agentSteps indices
                if (data.step) {
                    const stepMap = {
                        'visa': 0,
                        'flights': 1,
                        'hotels': 2,
                        'activities': 3,
                        'itinerary': 4,
                        'start': 0,
                        'post_process': 4
                    };
                    
                    if (stepMap[data.step] !== undefined) {
                        setCurrentStep(stepMap[data.step]);
                    }
                }
            };

            ws.onclose = () => {
                console.log('Disconnected from status websocket, retrying...');
                reconnectTimer = setTimeout(connect, 2000);
            };

            ws.onerror = (err) => {
                console.error('WebSocket error:', err);
                ws.close();
            };
        };

        connect();

        return () => {
            if (ws) ws.close();
            if (reconnectTimer) clearTimeout(reconnectTimer);
        };
    }, [clientId]);

    const handleSearch = async (e) => {
        e.preventDefault();
        if (!destination.trim()) return;

        setLoading(true);
        setError(null);
        setTripPlan(null);
        setHasSearched(true);
        setCurrentStep(0);
        setIsItineraryOpen(false);

        try {
            const result = await planTripWithSession({
                destination,
                dates,
                origin,
                days,
                travelers,
                travel_time: travelTime,
                currency,
                strict_budget: strictBudget,
                client_id: clientId,
                query: `Plan a trip to ${destination}`
            }, currentSessionId);
            
            setTripPlan(result.trip_plan);
            setCurrentSessionId(result.session_id);
        } catch {
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
            setCurrentStep(agentSteps.length);
        }
    };

    const handleSelectSession = (sessionData) => {
        // Find the latest message with a trip plan
        const messagesWithPlan = sessionData.messages.filter(m => m.trip_plan);
        if (messagesWithPlan.length > 0) {
            const latestPlan = messagesWithPlan[messagesWithPlan.length - 1].trip_plan;
            setTripPlan(latestPlan);
            setDestination(latestPlan.destination || '');
            setCurrentSessionId(sessionData.session.id);
            setHasSearched(true);
        }
    };

    const handleNewTrip = () => {
        setTripPlan(null);
        setHasSearched(false);
        setDestination('');
        setDates('');
        setOrigin('');
        setDays(3);
        setTravelers(1);
        setTravelTime('');
        setCurrency('USD');
        setStrictBudget(false);
        setCurrentSessionId(null);
        setError(null);
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            {/* Subtle background gradient */}
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/4 w-[600px] h-[600px] rounded-full bg-[#1a1520] blur-[150px] opacity-60" />
                <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] rounded-full bg-[#15181a] blur-[120px] opacity-50" />
            </div>

            {/* Header with menu button */}
            <header className="fixed top-0 left-0 right-0 z-30 px-6 py-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setIsSidebarOpen(true)}
                        className="w-10 h-10 rounded-xl bg-[var(--color-surface)] hover:bg-[var(--color-surface-2)] flex items-center justify-center transition-colors border border-[var(--color-border)]"
                    >
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 12h18M3 6h18M3 18h18" />
                        </svg>
                    </button>
                    {hasSearched && (
                        <Logo 
                            onClick={handleNewTrip} 
                            className="text-2xl animate-fade-in"
                        />
                    )}
                </div>
                
                {hasSearched && (
                    <button
                        onClick={handleNewTrip}
                        className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] text-sm flex items-center gap-2 transition-colors"
                    >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M12 5v14M5 12h14" />
                        </svg>
                        New Trip
                    </button>
                )}
            </header>

            {/* Main Content */}
            <div className="relative z-10 min-h-screen flex flex-col pt-16">
                
                {/* Search Section */}
                <div 
                    className={`transition-all duration-700 ease-out ${
                        hasSearched 
                            ? 'pt-4 pb-6' 
                            : 'flex-1 flex items-center justify-center'
                    }`}
                >
                    <div className={`w-full max-w-4xl mx-auto px-6 transition-all duration-700 ${hasSearched ? '' : 'translate-y-0'}`}>
                        
                        {/* Logo/Title */}
                        <div className={`text-center mb-8 transition-all duration-500 ${hasSearched ? 'opacity-0 h-0 mb-0 overflow-hidden' : 'opacity-100'}`}>
                            <Logo className="text-5xl md:text-6xl mb-4" />
                            <p className="text-[var(--color-text-muted)] text-lg">
                                Where would you like to go?
                            </p>
                        </div>

                        {/* Search Form */}
                        <TripSearchForm
                            destination={destination}
                            setDestination={setDestination}
                            origin={origin}
                            setOrigin={setOrigin}
                            days={days}
                            setDays={setDays}
                            travelers={travelers}
                            setTravelers={setTravelers}
                            travelTime={travelTime}
                            setTravelTime={setTravelTime}
                            currency={currency}
                            setCurrency={setCurrency}
                            strictBudget={strictBudget}
                            setStrictBudget={setStrictBudget}
                            loading={loading}
                            onSubmit={handleSearch}
                        />

                        {/* Destination Tag (shown after search) */}
                        {hasSearched && !loading && tripPlan && (
                            <div className="mt-4 flex items-center justify-center gap-4 text-[var(--color-text-muted)] animate-fade-in">
                                <span className="text-sm">Trip to</span>
                                <span className="font-serif text-[var(--color-text)] text-4xl">{tripPlan.destination}</span>
                            </div>
                        )}
                    </div>
                </div>

                {/* Agent Status - Shows during loading */}
                {loading && (
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
                )}

                {/* Error */}
                {error && (
                    <div className="px-6 pb-8 max-w-2xl mx-auto w-full animate-fade-in">
                        <div className="glass rounded-xl p-4 border-red-500/20 bg-red-500/5">
                            <p className="text-red-400 text-center">{error}</p>
                        </div>
                    </div>
                )}

                {/* Results */}
                {tripPlan && !loading && (
                    <div className="flex-1 px-6 pb-12">
                        <div className="max-w-5xl mx-auto">
                            
                            {/* Destination Hero Images */}
                            {tripPlan.destination_images && tripPlan.destination_images.length > 0 && (
                                <div className="grid grid-cols-3 gap-3 h-48 md:h-64 mb-8 animate-fade-in-up">
                                    {tripPlan.destination_images.map((img, idx) => (
                                        <div key={idx} className="relative rounded-2xl overflow-hidden">
                                            <img 
                                                src={img}
                                                alt={`${tripPlan.destination} ${idx + 1}`}
                                                className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                                            />
                                            <div className="absolute inset-0 bg-gradient-to-t from-[var(--color-bg)] via-transparent to-transparent opacity-60" />
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Total Budget Overview */}
                            {tripPlan.total_budget && (
                                <div className="glass rounded-2xl p-6 mb-8 border-[var(--color-accent)]/20 animate-fade-in-up bg-gradient-to-r from-[var(--color-accent)]/10 to-transparent">
                                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                        <div>
                                            <h3 className="text-[var(--color-text-muted)] text-sm uppercase tracking-wider mb-1">Total Estimated Budget</h3>
                                            <div className="flex items-baseline gap-2">
                                                <span className="text-4xl font-serif text-[var(--color-accent)]">{tripPlan.total_budget}</span>
                                                <span className="text-[var(--color-text-subtle)] text-sm">for {tripPlan.itinerary.length} days</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-4 bg-[var(--color-bg)]/40 p-3 rounded-xl border border-[var(--color-border)]">
                                            <div className="text-center px-4">
                                                <p className="text-[var(--color-text-subtle)] text-xs mb-1">Currency</p>
                                                <p className="font-medium">{tripPlan.preferred_currency}</p>
                                            </div>
                                            <div className="w-px h-8 bg-[var(--color-border)]" />
                                            <div className="text-center px-4">
                                                <p className="text-[var(--color-text-subtle)] text-xs mb-1">Mode</p>
                                                <p className="font-medium text-[var(--color-accent)]">{strictBudget ? 'Strict Budget' : 'Standard'}</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Visa Notice */}
                            {tripPlan.visa && (
                                <VisaCard visa={tripPlan.visa} />
                            )}

                            {/* Flights */}
                            <section className="mb-10 animate-fade-in-up delay-100" style={{ opacity: 0, animationFillMode: 'forwards' }}>
                                <div className="flex items-center justify-between mb-5">
                                    <h2 className="font-serif text-2xl text-[var(--color-text)]">Flights</h2>
                                    <span className="text-[var(--color-text-subtle)] text-sm">{tripPlan.flights.length} options</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {tripPlan.flights.map((flight, idx) => (
                                        <FlightCard key={idx} flight={flight} currency={currency} />
                                    ))}
                                </div>
                            </section>

                            {/* Hotels */}
                            <section className="animate-fade-in-up delay-200" style={{ opacity: 0, animationFillMode: 'forwards' }}>
                                <div className="flex items-center justify-between mb-5">
                                    <h2 className="font-serif text-2xl text-[var(--color-text)]">Stays</h2>
                                    <span className="text-[var(--color-text-subtle)] text-sm">{tripPlan.hotels.length} options</span>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {tripPlan.hotels.map((hotel, idx) => (
                                        <HotelCard key={idx} hotel={hotel} currency={currency} />
                                    ))}
                                </div>
                            </section>

                            {/* Floating Itinerary Button */}
                            <button
                                onClick={() => setIsItineraryOpen(true)}
                                className="fixed bottom-6 right-6 bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-[var(--color-bg)] font-semibold px-6 py-4 rounded-2xl shadow-2xl shadow-[var(--color-accent)]/20 flex items-center gap-3 transition-all duration-200 hover:scale-105 animate-fade-in-up"
                                style={{ animationDelay: '400ms', opacity: 0, animationFillMode: 'forwards' }}
                            >
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/>
                                    <rect x="9" y="3" width="6" height="4" rx="1"/>
                                    <path d="M9 12h6M9 16h6"/>
                                </svg>
                                <span>View Itinerary</span>
                                <span className="bg-[var(--color-bg)]/20 px-2 py-0.5 rounded-lg text-sm">
                                    {tripPlan.itinerary.length} days
                                </span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Footer hint (only before search) */}
                {!hasSearched && (
                    <div className="pb-12 text-center animate-fade-in" style={{ animationDelay: '600ms', opacity: 0, animationFillMode: 'forwards' }}>
                        <p className="text-[var(--color-text-subtle)] text-sm">
                            AI-powered travel planning • Flights • Hotels • Activities
                        </p>
                    </div>
                )}
            </div>

            {/* Itinerary Drawer */}
            <ItineraryDrawer 
                isOpen={isItineraryOpen}
                onClose={() => setIsItineraryOpen(false)}
                days={tripPlan?.itinerary || []}
                destination={tripPlan?.destination}
            />

            {/* Chat Sidebar */}
            <ChatSidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onSelectSession={handleSelectSession}
                currentSessionId={currentSessionId}
            />
        </div>
    );
}

export default App;
