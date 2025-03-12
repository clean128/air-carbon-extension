document.addEventListener('DOMContentLoaded', function() {
    // Get UI elements
    const displayMode = document.getElementById('displayMode');
    const showDetails = document.getElementById('showDetails');
    const colorScale = document.getElementById('colorScale');
    const refreshInterval = document.getElementById('refreshInterval');
    const saveButton = document.getElementById('saveButton');
    const statusDiv = document.getElementById('status');
    
    // Load saved configuration
    chrome.storage.local.get(['config'], function(result) {
      if (result.config) {
        displayMode.value = result.config.displayMode || 'append';
        showDetails.checked = result.config.showDetails !== false;
        colorScale.checked = result.config.colorScale !== false;
        refreshInterval.value = result.config.refreshInterval || '3000';
      }
    });
    
    // Save configuration
    saveButton.addEventListener('click', function() {
      const config = {
        displayMode: displayMode.value,
        showDetails: showDetails.checked,
        colorScale: colorScale.checked,
        refreshInterval: parseInt(refreshInterval.value)
      };
      
      // Save to storage
      chrome.storage.local.set({config: config}, function() {
        // Show success message
        statusDiv.textContent = 'Configuration enregistrée!';
        statusDiv.className = 'status success';
        
        // Update active tabs
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs[0]) {
            chrome.tabs.sendMessage(tabs[0].id, {
              action: 'updateConfig',
              config: config
            }, function(response) {
              console.log('Configuration updated on active tab:', response);
            });
          }
        });
        
        // Hide message after a few seconds
        setTimeout(function() {
          statusDiv.className = 'status';
        }, 2000);
      });
    });
  });