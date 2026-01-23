import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { planTripWithSession, createStatusWebSocket } from './api';
import { getSession } from './api/sessions';
import ItineraryDrawer from './components/ItineraryDrawer';
import ChatSidebar from './components/ChatSidebar';
import PageBackground from './components/PageBackground';
import Navbar from './components/Navbar';
import SearchPage from './pages/SearchPage';
import ResultsPage from './pages/ResultsPage';

const agentSteps = [
    { id: 'visa', label: 'Checking visa requirements', icon: '🛂' },
    { id: 'flights', label: 'Searching for flights', icon: '✈️' },
    { id: 'hotels', label: 'Finding accommodations', icon: '🏨' },
    { id: 'activities', label: 'Discovering activities', icon: '🎯' },
    { id: 'itinerary', label: 'Crafting your itinerary', icon: '📋' },
];

function AppContent() {
    const navigate = useNavigate();
    const location = useLocation();
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
    // Initialize currentSessionId from localStorage if available
    const [currentSessionId, setCurrentSessionId] = useState(() => {
        try {
            return localStorage.getItem('currentSessionId') || null;
        } catch {
            return null;
        }
    });

    // Store session ID in localStorage whenever it changes
    useEffect(() => {
        if (currentSessionId) {
            try {
                localStorage.setItem('currentSessionId', currentSessionId);
            } catch (error) {
                console.error('Failed to save session ID to localStorage:', error);
            }
        } else {
            try {
                localStorage.removeItem('currentSessionId');
            } catch (error) {
                console.error('Failed to remove session ID from localStorage:', error);
            }
        }
    }, [currentSessionId]);
    const [currency, setCurrency] = useState('USD');
    const [days, setDays] = useState(3);
    const [travelers, setTravelers] = useState(1);
    const [travelTime, setTravelTime] = useState('');
    const [strictBudget, setStrictBudget] = useState(false);
    const [statusMessage, setStatusMessage] = useState('');
    const [clientId] = useState(() => crypto.randomUUID());
    const hasAttemptedRestore = useRef(false);

    // WebSocket connection for status updates
    useEffect(() => {
        const cleanup = createStatusWebSocket(clientId, {
            onStatusUpdate: setStatusMessage,
            onStepChange: setCurrentStep
        });
        return cleanup;
    }, [clientId]);

    // Handle page reload on /trip route - try to restore trip data from session
    useEffect(() => {
        // If we're on /trip route but have no tripPlan and we're not loading,
        // try to restore from the session stored in localStorage
        // Only attempt restoration once per mount
        if (location.pathname === '/trip' && !tripPlan && !loading && !error && !hasAttemptedRestore.current) {
            hasAttemptedRestore.current = true;
            
            const restoreTripFromSession = async () => {
                const savedSessionId = currentSessionId || (() => {
                    try {
                        return localStorage.getItem('currentSessionId');
                    } catch {
                        return null;
                    }
                })();

                if (savedSessionId) {
                    try {
                        setLoading(true);
                        const sessionData = await getSession(savedSessionId);
                        const messagesWithPlan = sessionData.messages?.filter(m => m.trip_plan) || [];
                        
                        if (messagesWithPlan.length > 0) {
                            // Restore the latest trip plan
                            const latestPlan = messagesWithPlan[messagesWithPlan.length - 1].trip_plan;
                            setTripPlan(latestPlan);
                            
                            // Find the corresponding user message with user_query to restore all search parameters
                            const userMessages = sessionData.messages?.filter(m => m.role === 'user' && m.user_query) || [];
                            if (userMessages.length > 0) {
                                // Get the latest user query (should correspond to the latest trip plan)
                                const latestUserQuery = userMessages[userMessages.length - 1].user_query;
                                if (latestUserQuery) {
                                    setDestination(latestUserQuery.destination || '');
                                    setOrigin(latestUserQuery.origin || '');
                                    setDates(latestUserQuery.dates || '');
                                    setDays(latestUserQuery.days || 3);
                                    setTravelers(latestUserQuery.travelers || 1);
                                    setTravelTime(latestUserQuery.travel_time || '');
                                    setCurrency(latestUserQuery.currency || 'USD');
                                    setStrictBudget(latestUserQuery.strict_budget || false);
                                } else {
                                    // Fallback to trip plan destination if no user_query
                                    setDestination(latestPlan.destination || '');
                                }
                            } else {
                                // Fallback to trip plan destination if no user_query found
                                setDestination(latestPlan.destination || '');
                            }
                            
                            setCurrentSessionId(savedSessionId);
                            setHasSearched(true);
                        } else {
                            // Session exists but has no trip plan - redirect to search
                            navigate('/search', { replace: true });
                        }
                    } catch (error) {
                        console.error('Failed to restore session:', error);
                        // Session doesn't exist or failed to load - redirect to search
                        navigate('/search', { replace: true });
                    } finally {
                        setLoading(false);
                    }
                } else {
                    // No session ID found - redirect to search
                    navigate('/search', { replace: true });
                }
            };

            restoreTripFromSession();
        }
        
        // Reset the flag when navigating away from /trip
        if (location.pathname !== '/trip') {
            hasAttemptedRestore.current = false;
        }
    }, [location.pathname, tripPlan, loading, error, navigate, currentSessionId]);

    const handleSearch = async (e) => {
        e?.preventDefault();
        if (!destination.trim()) return;

        setLoading(true);
        setError(null);
        setTripPlan(null);
        setHasSearched(true);
        setCurrentStep(0);
        setIsItineraryOpen(false);

        navigate('/trip');

        try {
            const result = await planTripWithSession({
                destination, dates, origin, days, travelers,
                travel_time: travelTime, currency,
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
        const messagesWithPlan = sessionData.messages.filter(m => m.trip_plan);
        if (messagesWithPlan.length > 0) {
            const latestPlan = messagesWithPlan[messagesWithPlan.length - 1].trip_plan;
            setTripPlan(latestPlan);
            
            // Find the corresponding user message with user_query to restore all search parameters
            const userMessages = sessionData.messages.filter(m => m.role === 'user' && m.user_query);
            if (userMessages.length > 0) {
                // Get the latest user query (should correspond to the latest trip plan)
                const latestUserQuery = userMessages[userMessages.length - 1].user_query;
                if (latestUserQuery) {
                    setDestination(latestUserQuery.destination || '');
                    setOrigin(latestUserQuery.origin || '');
                    setDates(latestUserQuery.dates || '');
                    setDays(latestUserQuery.days || 3);
                    setTravelers(latestUserQuery.travelers || 1);
                    setTravelTime(latestUserQuery.travel_time || '');
                    setCurrency(latestUserQuery.currency || 'USD');
                    setStrictBudget(latestUserQuery.strict_budget || false);
                } else {
                    // Fallback to trip plan destination if no user_query
                    setDestination(latestPlan.destination || '');
                }
            } else {
                // Fallback to trip plan destination if no user_query found
                setDestination(latestPlan.destination || '');
            }
            
            setCurrentSessionId(sessionData.session.id);
            setHasSearched(true);
            navigate('/trip');
        }
        setIsSidebarOpen(false);
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
        // Clear localStorage when starting a new trip
        try {
            localStorage.removeItem('currentSessionId');
        } catch (error) {
            console.error('Failed to clear session ID from localStorage:', error);
        }
        navigate('/search');
    };

    return (
        <div className="min-h-screen relative overflow-hidden">
            <PageBackground />

            <Navbar 
                hasSearched={hasSearched} 
                onNewTrip={handleNewTrip} 
                onOpenSidebar={() => setIsSidebarOpen(true)} 
            />

            <main className="relative z-10 min-h-screen flex flex-col pt-16">
                <Routes>
                    <Route path="/search" element={
                        <SearchPage 
                            destination={destination} setDestination={setDestination}
                            origin={origin} setOrigin={setOrigin}
                            days={days} setDays={setDays}
                            travelers={travelers} setTravelers={setTravelers}
                            travelTime={travelTime} setTravelTime={setTravelTime}
                            currency={currency} setCurrency={setCurrency}
                            strictBudget={strictBudget} setStrictBudget={setStrictBudget}
                            loading={loading}
                            onSubmit={handleSearch}
                        />
                    } />
                    <Route path="/trip" element={
                        <ResultsPage 
                            tripPlan={tripPlan}
                            loading={loading}
                            error={error}
                            agentSteps={agentSteps}
                            currentStep={currentStep}
                            statusMessage={statusMessage}
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
                            setIsItineraryOpen={setIsItineraryOpen}
                            onRefetch={handleSearch}
                        />
                    } />
                    <Route path="/" element={<Navigate to="/search" replace />} />
                </Routes>
            </main>

            <ItineraryDrawer 
                isOpen={isItineraryOpen}
                onClose={() => setIsItineraryOpen(false)}
                days={tripPlan?.itinerary || []}
                destination={tripPlan?.destination}
            />

            <ChatSidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
                onSelectSession={handleSelectSession}
                currentSessionId={currentSessionId}
            />
        </div>
    );
}

function App() {
    return (
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    );
}

export default App;
