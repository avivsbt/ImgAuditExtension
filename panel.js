// This script runs in the DevTools panel context
console.log("ImgAudit panel script loaded!");

let lastLogIndex = 0;
const logsContainer = document.getElementById('logsContainer');
const clearBtn = document.getElementById('clearBtn');

// Log when the panel is opened
window.addEventListener('load', function() {
  console.log("ImgAudit panel opened and ready!");
  
  // Inject swipe detection code into the inspected page
  injectSwipeDetection();
  
  // Start polling for new logs
  pollForLogs();
  
  // Clear logs button
  clearBtn.addEventListener('click', function() {
    clearLogs();
  });
});

function clearLogs() {
  logsContainer.innerHTML = '<div class="empty-state"><p>No logs yet</p><p style="font-size: 11px;">Swipe on elements with data-testid="swiper" to see logs</p></div>';
  lastLogIndex = 0;
  
  // Clear logs from the inspected page as well
  chrome.devtools.inspectedWindow.eval('if (window.__imgAuditLogs) { window.__imgAuditLogs = []; }');
}

function addLogEntry(logData) {
  // Remove empty state if present
  if (logsContainer.querySelector('.empty-state')) {
    logsContainer.innerHTML = '';
  }
  
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  
  const timestamp = new Date().toLocaleTimeString();
  
  logEntry.innerHTML = `
    <div class="timestamp">${timestamp}</div>
    <div class="label">Page URL:</div>
    <div class="value">${escapeHtml(logData.pageUrl)}</div>
    <div class="label" style="margin-top: 12px;">Original Image URL:</div>
    <div class="value">${escapeHtml(logData.originalUrl)}</div>
    <div class="label" style="margin-top: 12px;">Encoded Image URL:</div>
    <div class="value">${escapeHtml(logData.encoded)}</div>
  `;
  
  logsContainer.insertBefore(logEntry, logsContainer.firstChild);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function pollForLogs() {
  // Check for new logs every 500ms
  chrome.devtools.inspectedWindow.eval(
    `(function() {
      if (!window.__imgAuditLogs) return [];
      return window.__imgAuditLogs.slice(${lastLogIndex});
    })()`,
    function(result, exceptionInfo) {
      if (exceptionInfo) {
        // Page might not be ready yet, continue polling
        setTimeout(pollForLogs, 500);
        return;
      }
      
      if (result && Array.isArray(result) && result.length > 0) {
        result.forEach(function(logData) {
          addLogEntry(logData);
        });
        lastLogIndex += result.length;
      }
      
      // Continue polling
      setTimeout(pollForLogs, 500);
    }
  );
}

function injectSwipeDetection() {
  const code = `
    (function() {
      // Remove existing listeners if any
      if (window.__imgAuditSwipeListener) {
        return; // Already injected
      }
      
      window.__imgAuditSwipeListener = true;
      
      function setupSwipeDetection(element) {
        let touchStartX = null;
        let touchStartY = null;
        let touchEndX = null;
        let touchEndY = null;
        
        element.addEventListener('touchstart', function(e) {
          touchStartX = e.changedTouches[0].screenX;
          touchStartY = e.changedTouches[0].screenY;
        }, { passive: true });
        
        element.addEventListener('touchend', function(e) {
          touchEndX = e.changedTouches[0].screenX;
          touchEndY = e.changedTouches[0].screenY;
          handleSwipe();
        }, { passive: true });
        
        function handleSwipe() {
          if (!touchStartX || !touchEndX) return;
          
          const deltaX = touchEndX - touchStartX;
          const deltaY = touchEndY - touchStartY;
          const minSwipeDistance = 50; // Minimum distance for a swipe
          
          // Check if it's a valid swipe (horizontal or vertical)
          if (Math.abs(deltaX) > minSwipeDistance || Math.abs(deltaY) > minSwipeDistance) {
            try {
              // Initialize logs array if it doesn't exist
              if (!window.__imgAuditLogs) {
                window.__imgAuditLogs = [];
              }
              
              const pageUrl = window.location.href;
              const activeSlideImg = document.querySelector(".swiper-slide-active img");
              
              if (activeSlideImg && activeSlideImg.src) {
                const encoded = activeSlideImg.src;
                
                // First decode the full Taboola URL
                const decodedOnce = decodeURI(encoded);
                
                // Extract the original encoded image URL
                const parts = decodedOnce.split("/https");
                if (parts.length > 1) {
                  const originalEncodedUrl = "https" + parts[1];
                  
                  // Decode the original image URL
                  const originalUrl = decodeURIComponent(originalEncodedUrl);
                  
                  // Store log data
                  window.__imgAuditLogs.push({
                    pageUrl: pageUrl,
                    originalUrl: originalUrl,
                    encoded: encoded
                  });
                } else {
                  window.__imgAuditLogs.push({
                    pageUrl: pageUrl,
                    originalUrl: "Could not extract original URL",
                    encoded: encoded
                  });
                }
              } else {
                window.__imgAuditLogs.push({
                  pageUrl: pageUrl,
                  originalUrl: "No active slide image found",
                  encoded: ""
                });
              }
            } catch (error) {
              if (!window.__imgAuditLogs) {
                window.__imgAuditLogs = [];
              }
              window.__imgAuditLogs.push({
                pageUrl: window.location.href,
                originalUrl: "Error: " + error.message,
                encoded: ""
              });
            }
            
            touchStartX = null;
            touchStartY = null;
            touchEndX = null;
            touchEndY = null;
          }
        }
      }
      
      // Find all elements with data-testid="swiper" and set up listeners
      function attachSwipeListeners() {
        const swiperElements = document.querySelectorAll('[data-testid="swiper"]');
        swiperElements.forEach(function(element) {
          if (!element.__imgAuditSwipeAttached) {
            setupSwipeDetection(element);
            element.__imgAuditSwipeAttached = true;
          }
        });
      }
      
      // Initial setup
      attachSwipeListeners();
      
      // Watch for new elements added dynamically
      const observer = new MutationObserver(function(mutations) {
        attachSwipeListeners();
      });
      
      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      
      console.log("ImgAudit: Swipe detection initialized for [data-testid='swiper'] elements");
    })();
  `;
  
  // Inject the code into the inspected page
  chrome.devtools.inspectedWindow.eval(code, function(result, exceptionInfo) {
    if (exceptionInfo) {
      console.error("Error injecting swipe detection:", exceptionInfo);
    } else {
      console.log("Swipe detection code injected successfully!");
    }
  });
}

