import client from './client';

const WS_BASE_URL = typeof window !== 'undefined'
    ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
    : 'ws://localhost:8000';


export const planTripWithSession = async (queryData, sessionId = null) => {
    try {
        const url = sessionId 
            ? `/plan_trip_with_session?session_id=${sessionId}`
            : '/plan_trip_with_session';
        const response = await client.post(url, queryData);
        return response.data;
    } catch (error) {
        console.error("Error planning trip:", error);
        throw error;
    }
};

/**
 * Creates a WebSocket connection for real-time trip planning status updates.
 * @param {string} clientId - Unique client identifier
 * @param {object} callbacks - Callback functions for WebSocket events
 * @param {function} callbacks.onStatusUpdate - Called when status message is received
 * @param {function} callbacks.onStepChange - Called when step changes (receives step index)
 * @returns {function} Cleanup function to close the connection
 */
export const createStatusWebSocket = (clientId, { onStatusUpdate, onStepChange }) => {
    let ws = null;
    let reconnectTimer = null;

    const stepMap = {
        'visa': 0, 'flights': 1, 'hotels': 2, 'activities': 3,
        'itinerary': 4, 'start': 0, 'post_process': 4
    };

    const connect = () => {
        ws = new WebSocket(`${WS_BASE_URL}/ws/${clientId}`);

        ws.onopen = () => console.log('Connected to status websocket');

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.status && onStatusUpdate) {
                onStatusUpdate(data.status);
            }
            if (data.step && onStepChange && stepMap[data.step] !== undefined) {
                onStepChange(stepMap[data.step]);
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

    // Return cleanup function
    return () => {
        if (ws) ws.close();
        if (reconnectTimer) clearTimeout(reconnectTimer);
    };
};
