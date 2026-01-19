import client from './client';

export const getSessions = async () => {
    try {
        const response = await client.get('/sessions');
        return response.data.sessions;
    } catch (error) {
        console.error("Error fetching sessions:", error);
        throw error;
    }
};

export const getSession = async (sessionId) => {
    try {
        const response = await client.get(`/sessions/${sessionId}`);
        return response.data;
    } catch (error) {
        console.error("Error fetching session:", error);
        throw error;
    }
};

export const createSession = async (title, destination = null) => {
    try {
        const response = await client.post('/sessions', { title, destination });
        return response.data;
    } catch (error) {
        console.error("Error creating session:", error);
        throw error;
    }
};

export const deleteSession = async (sessionId) => {
    try {
        await client.delete(`/sessions/${sessionId}`);
        return true;
    } catch (error) {
        console.error("Error deleting session:", error);
        throw error;
    }
};
