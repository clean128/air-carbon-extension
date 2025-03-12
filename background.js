console.log("✅ Background script is running!");

// Keep track of whether we've logged startup
let startupLogged = false;

// Cache for distance and aircraft data to reduce API calls
const distanceCache = {};
const aircraftCache = {};

// Aircraft data with fuel consumption and capacity
const aircraftData = {
  "A320": { fuelBurn: 2.5, capacity: 180 },
  "A321": { fuelBurn: 2.7, capacity: 220 },
  "A319": { fuelBurn: 2.3, capacity: 140 },
  "B737": { fuelBurn: 2.4, capacity: 160 },
  "B738": { fuelBurn: 2.6, capacity: 180 },
  "B739": { fuelBurn: 2.8, capacity: 190 },
  "A380": { fuelBurn: 4.7, capacity: 550 },
  "B777": { fuelBurn: 3.8, capacity: 350 },
  "B787": { fuelBurn: 3.2, capacity: 290 },
  "A350": { fuelBurn: 3.1, capacity: 330 },
  "E190": { fuelBurn: 2.0, capacity: 100 },
  "E195": { fuelBurn: 2.1, capacity: 120 },
  "CRJ9": { fuelBurn: 1.9, capacity: 90 },
  "AT72": { fuelBurn: 1.1, capacity: 70 }
};

// Hardcoded distance for common routes (in km)
const commonRoutes = {
  "CDG-LTN": 366, // Paris to London
  "CDG-LHR": 379, // Paris to London Heathrow
  "CDG-MAD": 1062, // Paris to Madrid
  "CDG-BCN": 831, // Paris to Barcelona
  "CDG-MRS": 661, // Paris to Marseille
  "CDG-AMS": 398, // Paris to Amsterdam
  "CDG-FRA": 450, // Paris to Frankfurt
  "CDG-FCO": 1107, // Paris to Rome
  "LHR-JFK": 5536, // London to New York
  "LHR-LAX": 8760, // London to Los Angeles
  "CDG-JFK": 5834, // Paris to New York
  "CDG-LAX": 9100, // Paris to Los Angeles
  "CDG-DXB": 5234, // Paris to Dubai
  "LHR-DXB": 5495, // London to Dubai
  "CDG-SIN": 10734, // Paris to Singapore
  "LHR-SIN": 10874  // London to Singapore
};

// Function to handle errors in fetch requests
function handleFetchError(error, sendResponse, errorMessage) {
  console.error(`❌ ${errorMessage}:`, error);
  sendResponse(null);
}

// Function to try multiple sources for distance data
async function fetchDistanceMultiSource(depart, arrivee) {
  const routeKey = `${depart}-${arrivee}`;
  
  // Check cache first
  if (distanceCache[routeKey]) {
    return distanceCache[routeKey];
  }
  
  // Check common routes
  if (commonRoutes[routeKey]) {
    distanceCache[routeKey] = commonRoutes[routeKey];
    return commonRoutes[routeKey];
  }
  
  // Try reverse route
  const reverseRouteKey = `${arrivee}-${depart}`;
  if (commonRoutes[reverseRouteKey]) {
    distanceCache[routeKey] = commonRoutes[reverseRouteKey];
    return commonRoutes[reverseRouteKey];
  }
  
  try {
    // Try to fetch from airmilescalculator.com
    const response = await fetch(`https://www.airmilescalculator.com/distance/${depart}-to-${arrivee}/`);
    const text = await response.text();
    const match = text.match(/(\d{2,5}) km/);
    
    if (match) {
      const distance = parseInt(match[1]) * 1.1; // +10% correction for non-direct routes
      distanceCache[routeKey] = distance;
      return distance;
    }
  } catch (error) {
    console.error("Failed to fetch from airmilescalculator:", error);
  }
  
  // If we still don't have a distance, try to estimate based on airport codes
  // This is a very rough estimate
  const defaultDistance = 800; // Default to 800km if no other source is available
  distanceCache[routeKey] = defaultDistance;
  return defaultDistance;
}

// Function to try multiple sources for aircraft data
async function fetchAircraftMultiSource(flightCode) {
  // Check cache first
  if (aircraftCache[flightCode]) {
    return aircraftCache[flightCode];
  }
  
  // If flight code is invalid or empty, return null
  if (!flightCode || flightCode.length < 3) {
    return null;
  }
  
  try {
    // Try to fetch from trip.com
    const response = await fetch(`https://fr.trip.com/flights/status-${flightCode}/`);
    const text = await response.text();
    const match = text.match(/([A-Z0-9\-]+)\s+Aircraft Type/);
    
    if (match) {
      const aircraftType = match[1];
      aircraftCache[flightCode] = aircraftType;
      return aircraftType;
    }
  } catch (error) {
    console.error("Failed to fetch from trip.com:", error);
  }
  
  try {
    // Try to fetch from flightradar24 as a fallback
    const response = await fetch(`https://www.flightradar24.com/data/flights/${flightCode.toLowerCase()}`);
    const text = await response.text();
    
    // Look for common aircraft types in the response
    for (const aircraft in aircraftData) {
      if (text.includes(aircraft)) {
        aircraftCache[flightCode] = aircraft;
        return aircraft;
      }
    }
  } catch (error) {
    console.error("Failed to fetch from flightradar24:", error);
  }
  
  return null;
}

// Handler for messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Log the first message we receive (to confirm the background script is running)
  if (!startupLogged) {
    console.log("📩 First message received, background script is active");
    startupLogged = true;
  }

  console.log(`📩 Received message: ${request.action}`);

  // Simple ping to check if background script is alive
  if (request.action === "ping") {
    sendResponse({ status: "ok" });
    return false;
  }

  // Handle distance calculation requests
  if (request.action === "fetchDistance") {
    console.log(`📩 Fetching distance for: ${request.depart} to ${request.arrivee}`);
    
    fetchDistanceMultiSource(request.depart, request.arrivee)
      .then(distance => {
        sendResponse({ distance: distance });
      })
      .catch(error => handleFetchError(error, sendResponse, "Failed to fetch distance"));
    
    return true; // Keep the message channel open for the async response
  }

  // Handle aircraft type requests
  if (request.action === "fetchAircraft") {
    console.log(`📩 Fetching aircraft type for flight: ${request.flightCode}`);
    
    fetchAircraftMultiSource(request.flightCode)
      .then(aircraftType => {
        sendResponse({ aircraftType: aircraftType });
      })
      .catch(error => handleFetchError(error, sendResponse, "Failed to fetch aircraft type"));
    
    return true; // Keep the message channel open for the async response
  }
  
  // Handle direct CO2 calculation requests
  if (request.action === "calculateCO2") {
    console.log(`📩 Calculating CO2 for: ${request.depart} to ${request.arrivee}, flight: ${request.flightCode}`);
    
    Promise.all([
      fetchDistanceMultiSource(request.depart, request.arrivee),
      fetchAircraftMultiSource(request.flightCode)
    ])
    .then(([distance, aircraftType]) => {
      // Default values
      let fuelBurn = 2.5;  // Default fuel burn in kg/km
      let capacity = 180;  // Default capacity in passengers
      
      // Use aircraft-specific data if available
      if (aircraftType) {
        for (const [type, data] of Object.entries(aircraftData)) {
          if (aircraftType.includes(type)) {
            fuelBurn = data.fuelBurn;
            capacity = data.capacity;
            break;
          }
        }
      }
      
      // Calculate CO2 emissions
      const co2 = ((distance * 1.1) * 3.7 * 3 * fuelBurn) / (capacity * 0.85);
      sendResponse({ 
        co2: co2.toFixed(1),
        distance: distance,
        aircraftType: aircraftType || "Unknown"
      });
    })
    .catch(error => handleFetchError(error, sendResponse, "Failed to calculate CO2"));
    
    return true; // Keep the message channel open for the async response
  }

  // If we don't recognize the action
  console.log(`❓ Unknown action: ${request.action}`);
  sendResponse(null);
  return false;
});

// Log when the background script starts
console.log("🚀 Background script started");