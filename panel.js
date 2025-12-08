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
  
  // Initial HTML with loading state
  logEntry.innerHTML = `
    <div class="timestamp">${timestamp}</div>
    <div class="label">Page URL:</div>
    <div class="value">${escapeHtml(logData.pageUrl)}</div>
    <div class="label" style="margin-top: 12px;">Original Image URL:</div>
    <div class="value">${escapeHtml(logData.originalUrl)}</div>
    <div class="label" style="margin-top: 12px;">Encoded Image URL:</div>
    <div class="value">${escapeHtml(logData.encoded)}</div>
    <div class="label" style="margin-top: 12px;">API Results:</div>
    <div class="value" id="api-results-${timestamp}">Loading...</div>
    <div class="qa-checkbox-container">
      <label>
        <input type="checkbox" id="qa-checkbox-${timestamp}" />
        QA Approved
      </label>
    </div>
  `;
  
  logsContainer.insertBefore(logEntry, logsContainer.firstChild);
  
  // Make API calls if we have a valid original URL
  if (logData.originalUrl && logData.originalUrl !== "Could not extract original URL" && logData.originalUrl !== "No active slide image found" && !logData.originalUrl.startsWith("Error:")) {
    fetchApiResults(logData.originalUrl, `api-results-${timestamp}`);
  } else {
    const resultsDiv = document.getElementById(`api-results-${timestamp}`);
    if (resultsDiv) {
      resultsDiv.innerHTML = '<span style="color: #999;">No valid image URL to analyze</span>';
    }
  }
}

function parseXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  return xmlDoc;
}

function getXmlValue(xmlDoc, tagName) {
  const element = xmlDoc.getElementsByTagName(tagName)[0];
  return element ? element.textContent : 'N/A';
}

async function fetchApiResults(originalUrl, resultsId) {
  const encodedUrl = encodeURIComponent(originalUrl);
  const resultsDiv = document.getElementById(resultsId);
  
  if (!resultsDiv) return;
  
  try {
    // Call both APIs
    const [qualityResponse, metricsResponse] = await Promise.all([
      fetch(`http://content-enricher.taboolasyndication.com:8400/api/images/analyze-quality?url=${encodedUrl}`),
      fetch(`http://content-enricher.taboolasyndication.com:8400/api/images/metrics?url=${encodedUrl}`)
    ]);
    
    let resultsHtml = '';
    
    // Parse quality response
    if (qualityResponse.ok) {
      const qualityXml = await qualityResponse.text();
      const qualityDoc = parseXml(qualityXml);
      
      const thumbnail = getXmlValue(qualityDoc, 'thumbnail');
      const fullScreen = getXmlValue(qualityDoc, 'full_screen');
      const story = getXmlValue(qualityDoc, 'story');
      
      resultsHtml += `
        <div style="margin-bottom: 12px;">
          <div class="label" style="font-size: 11px; color: #4285f4;">Quality Analysis:</div>
          <div style="margin-left: 8px; margin-top: 4px;">
            <div><strong>Thumbnail:</strong> ${thumbnail}</div>
            <div><strong>Full Screen:</strong> ${fullScreen}</div>
            <div><strong>Story:</strong> ${story}</div>
          </div>
        </div>
      `;
    } else {
      resultsHtml += `<div style="color: #d32f2f; margin-bottom: 8px;">Quality API Error: ${qualityResponse.status}</div>`;
    }
    
    // Parse metrics response
    if (metricsResponse.ok) {
      const metricsXml = await metricsResponse.text();
      const metricsDoc = parseXml(metricsXml);
      
      const width = getXmlValue(metricsDoc, 'width');
      const height = getXmlValue(metricsDoc, 'height');
      const laplacianVariance = getXmlValue(metricsDoc, 'laplacianVariance');
      const totalPixels = getXmlValue(metricsDoc, 'totalPixels');
      
      resultsHtml += `
        <div>
          <div class="label" style="font-size: 11px; color: #4285f4;">Image Metrics:</div>
          <div style="margin-left: 8px; margin-top: 4px;">
            <div><strong>Width:</strong> ${width}</div>
            <div><strong>Height:</strong> ${height}</div>
            <div><strong>Laplacian Variance:</strong> ${laplacianVariance}</div>
            <div><strong>Total Pixels:</strong> ${totalPixels}</div>
          </div>
        </div>
      `;
    } else {
      resultsHtml += `<div style="color: #d32f2f;">Metrics API Error: ${metricsResponse.status}</div>`;
    }
    
    resultsDiv.innerHTML = resultsHtml;
    
  } catch (error) {
    if (resultsDiv) {
      resultsDiv.innerHTML = `<span style="color: #d32f2f;">Error fetching API results: ${error.message}</span>`;
    }
  }
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

