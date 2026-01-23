// API service for fetching airport data
// Using multiple API sources for reliability
const AIRPORTS_API_SOURCES = [
    'https://airportsapi.com/api/airports',
    'https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat'
];

const CACHE_KEY = 'airports_cache';
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

// Fallback list if API fails
const FALLBACK_AIRPORTS = [
    'New York (JFK)', 'New York (LGA)', 'New York (EWR)', 'Los Angeles (LAX)', 'Chicago (ORD)', 'Chicago (MDW)',
    'Dallas (DFW)', 'Denver (DEN)', 'San Francisco (SFO)', 'Seattle (SEA)', 'Las Vegas (LAS)', 'Miami (MIA)',
    'Atlanta (ATL)', 'Boston (BOS)', 'Washington (DCA)', 'Washington (IAD)', 'Phoenix (PHX)', 'Orlando (MCO)',
    'Houston (IAH)', 'Houston (HOU)', 'Philadelphia (PHL)', 'Minneapolis (MSP)', 'Detroit (DTW)', 'Charlotte (CLT)',
    'Fort Lauderdale (FLL)', 'San Diego (SAN)', 'Portland (PDX)', 'Tampa (TPA)', 'Nashville (BNA)', 'Austin (AUS)',
    'Toronto (YYZ)', 'Vancouver (YVR)', 'Montreal (YUL)', 'London (LHR)', 'London (LGW)', 'Paris (CDG)',
    'Amsterdam (AMS)', 'Frankfurt (FRA)', 'Tokyo (NRT)', 'Tokyo (HND)', 'Seoul (ICN)', 'Beijing (PEK)',
    'Shanghai (PVG)', 'Hong Kong (HKG)', 'Singapore (SIN)', 'Bangkok (BKK)', 'Dubai (DXB)', 'Sydney (SYD)'
];

// Format airport data from API response
const formatAirport = (airport) => {
    if (!airport) return null;
    
    const city = airport.city || airport.municipality || '';
    const code = airport.iata_code || airport.icao_code || '';
    const name = airport.name || '';
    
    if (code && city) {
        return `${city} (${code})`;
    } else if (code && name) {
        return `${name} (${code})`;
    } else if (code) {
        return code;
    } else if (name) {
        return name;
    }
    
    return null;
};

// Get cached airports
const getCachedAirports = () => {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const now = Date.now();
        
        // Check if cache is still valid
        if (now - timestamp < CACHE_DURATION) {
            return data;
        }
        
        // Cache expired
        localStorage.removeItem(CACHE_KEY);
        return null;
    } catch (error) {
        console.error('Error reading airports cache:', error);
        return null;
    }
};

// Save airports to cache
const saveCachedAirports = (airports) => {
    try {
        const cacheData = {
            data: airports,
            timestamp: Date.now()
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (error) {
        console.error('Error saving airports cache:', error);
    }
};

// Parse OpenFlights format (CSV-like)
const parseOpenFlightsData = (text) => {
    const lines = text.split('\n');
    const airports = [];
    
    for (const line of lines) {
        if (!line.trim()) continue;
        
        // OpenFlights format: Airport ID, Name, City, Country, IATA, ICAO, Latitude, Longitude, etc.
        const parts = line.split(',').map(p => p.replace(/^"|"$/g, '').trim());
        
        if (parts.length >= 5) {
            const name = parts[1] || '';
            const city = parts[2] || '';
            const iata = parts[4] || '';
            
            if (iata && iata.length === 3 && iata !== '\\N') {
                if (city) {
                    airports.push(`${city} (${iata})`);
                } else if (name) {
                    airports.push(`${name} (${iata})`);
                }
            }
        }
    }
    
    return [...new Set(airports)].sort(); // Remove duplicates and sort
};

// Fetch airports from API
export const fetchAirports = async () => {
    // Check cache first
    const cached = getCachedAirports();
    if (cached) {
        return cached;
    }
    
    // Try airportsapi.com first
    try {
        const response = await fetch(AIRPORTS_API_SOURCES[0], {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
            },
        });
        
        if (response.ok) {
            const responseData = await response.json();
            
            // Handle different response formats
            let data = null;
            
            // If response is already an array
            if (Array.isArray(responseData)) {
                data = responseData;
            }
            // If response has a data property, use that
            else if (responseData && responseData.data && Array.isArray(responseData.data)) {
                data = responseData.data;
            }
            // If response has a results property, use that
            else if (responseData && responseData.results && Array.isArray(responseData.results)) {
                data = responseData.results;
            }
            // If response is an object with array values, try to find the array
            else if (responseData && typeof responseData === 'object') {
                // Try common property names
                const possibleArrays = Object.values(responseData).filter(v => Array.isArray(v));
                if (possibleArrays.length > 0) {
                    data = possibleArrays[0];
                }
            }
            
            // Handle array response
            if (Array.isArray(data) && data.length > 0) {
                const formattedAirports = data
                    .map(formatAirport)
                    .filter(airport => airport !== null)
                    .filter((airport, index, self) => self.indexOf(airport) === index)
                    .sort();
                
                if (formattedAirports.length > 100) { // Reasonable threshold
                    saveCachedAirports(formattedAirports);
                    return formattedAirports;
                }
            } else {
                console.warn('Primary API returned invalid data format:', typeof responseData, Array.isArray(responseData));
            }
        } else {
            console.warn('Primary API returned non-OK status:', response.status);
        }
    } catch (error) {
        console.warn('Primary API failed, trying alternative:', error.message || error);
    }
    
    // Try OpenFlights GitHub data as fallback
    try {
        const response = await fetch(AIRPORTS_API_SOURCES[1]);
        
        if (response.ok) {
            const text = await response.text();
            const airports = parseOpenFlightsData(text);
            
            if (airports.length > 100) {
                saveCachedAirports(airports);
                return airports;
            }
        }
    } catch (error) {
        console.warn('Alternative API also failed:', error);
    }
    
    // If all APIs fail, use fallback
    console.warn('Using fallback airport list');
    // Ensure we always return an array
    return Array.isArray(FALLBACK_AIRPORTS) ? FALLBACK_AIRPORTS : [];
};

// Search airports
export const searchAirports = (airports, query) => {
    // Ensure airports is an array
    if (!Array.isArray(airports)) {
        console.warn('searchAirports received non-array:', airports);
        return [];
    }
    
    if (!query || query.trim() === '') {
        return airports;
    }
    const lowerQuery = query.toLowerCase();
    return airports.filter(airport => 
        airport && typeof airport === 'string' && airport.toLowerCase().includes(lowerQuery)
    );
};
