console.log("✅ Content script loaded!");

// Check if background connection is working
chrome.runtime.sendMessage({action: "ping"}, function(response) {
    if (chrome.runtime.lastError) {
      console.error("Background connection error:", chrome.runtime.lastError.message);
    } else if (response && response.status === "ok") {
      console.log("✅ Background connection successful");
    } else {
      console.error("Background connection failed with response:", response);
    }
  });

// Configuration options with default values
let config = {
  displayMode: "append", // "append" or "replace"
  refreshInterval: 3000, // milliseconds
  showDetails: true,     // show distance and aircraft info
  colorScale: true       // use color scale for CO2 values
};

// Load configuration from storage
chrome.storage.local.get(['config'], function(result) {
  if (result.config) {
    config = {...config, ...result.config};
    console.log("Loaded configuration:", config);
  }
});

// Function to safely execute Chrome API calls
function safelyExecute(callback) {
  try {
    if (chrome && chrome.runtime && chrome.runtime.id) {
      return callback();
    } else {
      console.log("Chrome API not available at this moment");
      return null;
    }
  } catch (error) {
    console.error("Error executing Chrome API:", error);
    return null;
  }
}

// Function to safely send messages to the background script
function safeSendMessage(message) {
  return safelyExecute(() => {
    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage(message, (response) => {
          // Check for extension context error
          if (chrome.runtime.lastError) {
            console.log("Extension context error:", chrome.runtime.lastError);
            resolve(null);
            return;
          }
          resolve(response);
        });
      } catch (error) {
        console.error("Send message error:", error);
        resolve(null);
      }
    });
  });
}

// Function to get CO2 color based on value
function getCO2Color(co2Value) {
  if (!config.colorScale) return "green";
  
  // Convert CO2 value to a color from green (low) to red (high)
  const value = parseFloat(co2Value);
  
  if (value < 50) return "#00AA00"; // Very low - dark green
  if (value < 100) return "#55AA00"; // Low - green
  if (value < 150) return "#AAAA00"; // Medium-low - yellow-green
  if (value < 200) return "#DDAA00"; // Medium - yellow
  if (value < 300) return "#FF8800"; // Medium-high - orange
  if (value < 400) return "#FF4400"; // High - orange-red
  return "#FF0000"; // Very high - red
}

// Function to get site-specific selectors
function getSiteSelectors() {
    const url = window.location.href;
    
    if (url.includes('opodo')) {
      return {
        // More comprehensive selectors for Opodo
        flightElements: '.flight-card, .flight-item, .css-gzf2z3, .css-kkzho4, [data-testid="flight-card"], [data-test-id="flight-card"], .flight-result-item, div[class*="flight"], div[class*="Flight"]',
        priceElements: '.price-display, .price, [data-test-id="price"], .price-value, span[class*="price"], div[class*="price"]',
        airportPattern: /\b([A-Z]{3})\b/,
        flightCodePattern: /\b([A-Z]{2}[0-9]{1,4})\b/
      };
    } else if (url.includes('kayak')) {
      return {
        // More comprehensive selectors for Kayak
        flightElements: '.nrc6-inner, .nrc6-main, .Flights-Results-FlightResultItem, [data-test="flight-card"], div[class*="flight-result"], div[class*="Flight"], div[id*="flight"], div[class*="nrc"]',
        priceElements: '.price-text, .booking-price, [data-test="price-text"], span[class*="price"], div[class*="price"]',
        airportPattern: /\b([A-Z]{3})\b/,
        flightCodePattern: /\b([A-Z]{2}[0-9]{1,4})\b/
      };
    }
    
    // Default selectors as fallback
    return {
      flightElements: '.flight-card, .flight-result, .flight-item, div[class*="flight"], div[class*="Flight"]',
      priceElements: '.price, .price-display, .price-value, span[class*="price"], div[class*="price"]',
      airportPattern: /\b([A-Z]{3})\b/,
      flightCodePattern: /\b([A-Z]{2}[0-9]{1,4})\b/
    };
  }

// Function to extract flight details from an element
function extractFlightDetails(flightElement) {
    const selectors = getSiteSelectors();
    const airportTexts = flightElement.querySelectorAll('span, div, p');
    let depart = null;
    let arrivee = null;
    let flightCode = null;
  
    // Try to find airport codes in the text content
    for (const element of airportTexts) {
      const text = element.textContent.trim();
      
      // Check for airport code pattern (3 uppercase letters)
      const airportCodeMatch = text.match(selectors.airportPattern);
      if (airportCodeMatch) {
        if (!depart) {
          depart = airportCodeMatch[1];
        } else if (!arrivee) {
          arrivee = airportCodeMatch[1];
        }
      }
      
      // Look for flight code (like AF1234, BA789)
      const flightCodeMatch = text.match(selectors.flightCodePattern);
      if (flightCodeMatch && !flightCode) {
        flightCode = flightCodeMatch[1];
      }
      
      // If we found everything, break early
      if (depart && arrivee && flightCode) break;
    }
  
    return { 
      depart, 
      arrivee, 
      flightCode,
      complete: !!(depart && arrivee) // Mark as complete if we have both airports
    };
  }
  
  // Function to directly calculate CO2 using the background script
  async function calculateCO2(depart, arrivee, flightCode) {
    const response = await safeSendMessage({
      action: "calculateCO2",
      depart,
      arrivee,
      flightCode: flightCode || ""
    });
    
    return response || { co2: null, distance: null, aircraftType: null };
  }
  
  // Function to create or update the pollution info element
  function createPollutionElement(co2, distance, aircraftType) {
    const pollutionElement = document.createElement("div");
    pollutionElement.classList.add("pollution-info");
    
    // Set basic styles
    pollutionElement.style.fontSize = "14px";
    pollutionElement.style.marginTop = "10px";
    pollutionElement.style.padding = "6px";
    pollutionElement.style.borderRadius = "4px";
    pollutionElement.style.backgroundColor = "#f9f9f9";
    pollutionElement.style.border = "1px solid #ccc";
    pollutionElement.style.fontWeight = "bold";
    
    // Add CO2 information
    const co2Element = document.createElement("div");
    co2Element.textContent = `🌍 CO₂: ${co2} kg/passager`;
    co2Element.style.color = getCO2Color(co2);
    pollutionElement.appendChild(co2Element);
    
    // Add details if enabled
    if (config.showDetails) {
      const detailsElement = document.createElement("div");
      detailsElement.style.fontSize = "12px";
      detailsElement.style.marginTop = "4px";
      detailsElement.style.color = "#666";
      
      if (distance) {
        detailsElement.textContent = `Distance: ~${Math.round(distance)} km`;
      }
      
      if (aircraftType && aircraftType !== "Unknown") {
        detailsElement.textContent += detailsElement.textContent ? ` | Avion: ${aircraftType}` : `Avion: ${aircraftType}`;
      }
      
      pollutionElement.appendChild(detailsElement);
    }
    
    return pollutionElement;
  }
  
  // Function to replace price with CO2 information
  function replacePriceWithCO2(flightElement, co2) {
    const selectors = getSiteSelectors();
    const priceElements = flightElement.querySelectorAll(selectors.priceElements);
    
    // If we found price elements, replace their content
    if (priceElements.length > 0) {
      priceElements.forEach(priceElement => {
        // Store original price for toggling if not already stored
        if (!priceElement.dataset.originalPrice) {
          priceElement.dataset.originalPrice = priceElement.textContent;
        }
        
        // Replace with CO2 info
        priceElement.textContent = `🌍 ${co2} kg CO₂`;
        priceElement.style.color = getCO2Color(co2);
      });
      return true;
    }
    
    return false;
  }
  
  // Function to add or update the CO2 information on the page
  async function addPollutionInfo() {
    console.log("Looking for flight elements...");
    
    // Get site-specific selectors
    const selectors = getSiteSelectors();
    const flightElements = document.querySelectorAll(selectors.flightElements);
    
    console.log(`Found ${flightElements.length} flight elements`);
    
    for (const flightElement of flightElements) {
      try {
        // Skip if we already processed this element recently
        if (flightElement.dataset.co2Processed === "true" && 
            Date.now() - parseInt(flightElement.dataset.co2ProcessedTime || 0) < 30000) {
          continue;
        }
        
        // Extract flight details
        const details = extractFlightDetails(flightElement);
        
        // If we found both airport codes
        if (details.complete) {
          console.log(`Found flight from ${details.depart} to ${details.arrivee}${details.flightCode ? `, flight ${details.flightCode}` : ''}`);
          
          // Calculate CO2 emissions
          const { co2, distance, aircraftType } = await calculateCO2(
            details.depart, 
            details.arrivee, 
            details.flightCode
          );
          
          if (co2) {
            console.log(`Adding CO2 info: ${co2} kg/passenger (${distance} km, ${aircraftType || 'unknown aircraft'})`);
            
            // Remove existing pollution info if any
            const existingInfo = flightElement.querySelector(".pollution-info");
            if (existingInfo) {
              existingInfo.remove();
            }
            
            // Create new pollution element
            const pollutionElement = createPollutionElement(co2, distance, aircraftType);
            
            // Add or replace based on configuration
            if (config.displayMode === "replace") {
              // Try to replace price with CO2 info
              const replaced = replacePriceWithCO2(flightElement, co2);
              
              // If we couldn't replace, fall back to append mode
              if (!replaced) {
                flightElement.appendChild(pollutionElement);
              }
            } else {
              // Append mode - just add the pollution element
              flightElement.appendChild(pollutionElement);
            }
            
            // Mark this element as processed with timestamp
            flightElement.dataset.co2Processed = "true";
            flightElement.dataset.co2ProcessedTime = Date.now().toString();
          }
        }
      } catch (error) {
        console.error("Error processing flight element:", error);
      }
    }

    if (flightElements.length === 0) {
        console.log("No flight elements found with normal selectors, trying manual search");
        const manualElements = findFlightElementsManually();
        if (manualElements.length > 0) {
          console.log(`Found ${manualElements.length} potential flight elements manually`);
          // Process these elements similarly
          // ...
        }
      }
  }
  
  // Function to handle messages from the popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "updateConfig") {
      config = {...config, ...message.config};
      console.log("Updated configuration:", config);
      
      // Re-process all elements with new configuration
      document.querySelectorAll('[data-co2-processed="true"]').forEach(element => {
        element.dataset.co2Processed = "false";
      });
      
      addPollutionInfo();
      sendResponse({status: "ok"});
    }
    return false;
  });

  function findFlightElementsManually() {
    // This is a more aggressive approach to find flight elements
    console.log("Attempting to find flight elements manually");
    
    const allElements = document.querySelectorAll('div');
    const flightElements = [];
    
    allElements.forEach(el => {
      const text = el.textContent;
      
      // Check if this div contains both airport codes and a price-like text
      const hasAirportCodes = (text.match(/\b[A-Z]{3}\b/g) || []).length >= 2;
      const hasPricePattern = text.match(/(\$|\€|\£)\s*\d+/);
      const hasTimePattern = text.match(/\d{1,2}:\d{2}/);
      
      // If this element seems to contain flight information
      if (hasAirportCodes && (hasPricePattern || hasTimePattern) && el.offsetHeight > 50) {
        flightElements.push(el);
        console.log("Found potential flight element:", el);
      }
    });
    
    return flightElements;
  }

  
function debugSelectors() {
    console.log("Debugging page structure for flight elements");
    const url = window.location.href;
    
    // Log what site we're on
    console.log("Current URL:", url);
    
    // Try various common selectors and log results
    const possibleSelectors = [
      '.flight-card', '.flight-item', '.css-gzf2z3', '.css-kkzho4', 
      '[data-testid="flight-card"]', '[data-test-id="flight-card"]',
      '.flight-result-item', 'div[class*="flight"]', 'div[class*="Flight"]',
      '.nrc6-inner', '.nrc6-main', '.Flights-Results-FlightResultItem'
    ];
    
    possibleSelectors.forEach(selector => {
      const elements = document.querySelectorAll(selector);
      console.log(`Selector "${selector}" found ${elements.length} elements`);
    });
    
    // Log some structural information
    console.log("Page contains airport codes:", document.body.textContent.match(/\b([A-Z]{3})\b/g));
    console.log("Page contains flight codes:", document.body.textContent.match(/\b([A-Z]{2}[0-9]{1,4})\b/g));
  }
  
  
  // Run the function initially with a delay
  setTimeout(addPollutionInfo, 1500);
  
  // Set up a repeating check every few seconds
  setInterval(() => {
    try {
      addPollutionInfo();
    } catch (error) {
      console.error("Error in interval:", error);
    }
  }, config.refreshInterval);
  
  // Also watch for DOM changes
  const observer = new MutationObserver(() => {
    setTimeout(() => {
      try {
        addPollutionInfo();
      } catch (error) {
        console.error("Error in observer:", error);
      }
    }, 500);
  });
  
  // Start observing once the page is fully loaded
  if (document.readyState === "complete") {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    window.addEventListener("load", () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
  
  // Call this after page load
  setTimeout(debugSelectors, 2000);