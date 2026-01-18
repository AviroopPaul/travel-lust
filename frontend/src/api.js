import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000';

const api = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
});

// Trip Planning
export const planTrip = async (queryData) => {
    try {
        const response = await api.post('/plan_trip', queryData);
        return response.data;
    } catch (error) {
        console.error("Error planning trip:", error);
        throw error;
    }
};

export const planTripWithSession = async (queryData, sessionId = null) => {
    try {
        const url = sessionId 
            ? `/plan_trip_with_session?session_id=${sessionId}`
            : '/plan_trip_with_session';
        const response = await api.post(url, queryData);
        return response.data;
    } catch (error) {
        console.error("Error planning trip:", error);
        throw error;
    }
};

// Sessions
export const getSessions = async () => {
    try {
        const response = await api.get('/sessions');
        return response.data.sessions;
    } catch (error) {
        console.error("Error fetching sessions:", error);
        throw error;
    }
};

export const getSession = async (sessionId) => {
    try {
        const response = await api.get(`/sessions/${sessionId}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching session:", error);
        throw error;
    }
};

export const createSession = async (title, destination = null) => {
    try {
        const response = await api.post('/sessions', { title, destination });
        return response.data;
    } catch (error) {
        console.error("Error creating session:", error);
        throw error;
    }
};

export const deleteSession = async (sessionId) => {
    try {
        await api.delete(`/sessions/${sessionId}`);
        return true;
    } catch (error) {
        console.error("Error deleting session:", error);
        throw error;
    }
};

// Memories
export const getMemories = async (memoryType = null) => {
    try {
        const url = memoryType ? `/memories?memory_type=${memoryType}` : '/memories';
        const response = await api.get(url);
        return response.data.memories;
    } catch (error) {
        console.error("Error fetching memories:", error);
        throw error;
    }
};

export const deleteMemory = async (memoryId) => {
    try {
        await api.delete(`/memories/${memoryId}`);
        return true;
    } catch (error) {
        console.error("Error deleting memory:", error);
        throw error;
    }
};

export const clearMemories = async () => {
    try {
        await api.delete('/memories');
        return true;
    } catch (error) {
        console.error("Error clearing memories:", error);
        throw error;
    }
};

export default api;
