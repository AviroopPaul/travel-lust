import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, Navigate } from 'react-router-dom';
import { planTripWithSession, createStatusWebSocket } from './api';
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
        const cleanup = createStatusWebSocket(clientId, {
            onStatusUpdate: setStatusMessage,
            onStepChange: setCurrentStep
        });
        return cleanup;
    }, [clientId]);

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
            setDestination(latestPlan.destination || '');
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
                            currency={currency}
                            strictBudget={strictBudget}
                            setIsItineraryOpen={setIsItineraryOpen}
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
