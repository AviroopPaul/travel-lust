import client from './client';

export const getMemories = async (memoryType = null) => {
    try {
        const url = memoryType ? `/memories?memory_type=${memoryType}` : '/memories';
        const response = await client.get(url);
        return response.data.memories;
    } catch (error) {
        console.error("Error fetching memories:", error);
        throw error;
    }
};

export const deleteMemory = async (memoryId) => {
    try {
        await client.delete(`/memories/${memoryId}`);
        return true;
    } catch (error) {
        console.error("Error deleting memory:", error);
        throw error;
    }
};

export const clearMemories = async () => {
    try {
        await client.delete('/memories');
        return true;
    } catch (error) {
        console.error("Error clearing memories:", error);
        throw error;
    }
};
