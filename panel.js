// ============================================================================
// CONFIGURATION & CONSTANTS
// ============================================================================

const CONFIG = {
  STORAGE_KEY: 'imgAuditLogs',
  POLL_INTERVAL: 500, // milliseconds
  MIN_SWIPE_DISTANCE: 50, // pixels
  API_BASE_URL: 'http://content-enricher.taboolasyndication.com:8400',
  API_ENDPOINTS: {
    QUALITY: '/api/images/analyze-quality',
    METRICS: '/api/images/metrics'
  },
  SELECTORS: {
    SWIPER: '[data-testid="swiper"]',
    ACTIVE_SLIDE_IMG: '.swiper-slide-active img'
  },
  ERROR_MESSAGES: {
    NO_EXTRACT: 'Could not extract original URL',
    NO_SLIDE: 'No active slide image found',
    NO_VALID_URL: 'No valid image URL to analyze',
    NO_LOGS: 'No logs to export'
  },
  CSV: {
    DECIMAL_PRECISION: 6,
    DATE_FORMAT: 'YYYY-MM-DD'
  }
};

const API_RESULT_FIELDS = {
  QUALITY: ['Thumbnail', 'Full Screen', 'Story'],
  METRICS: ['Width', 'Height', 'Laplacian Variance', 'Total Pixels']
};

const CSV_HEADERS = [
  'Timestamp',
  'Page URL',
  'Original Image URL',
  'Encoded Image URL',
  'QA Approved',
  ...API_RESULT_FIELDS.QUALITY,
  ...API_RESULT_FIELDS.METRICS
];

// ============================================================================
// DOM ELEMENTS
// ============================================================================

const logsContainer = document.getElementById('logsContainer');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');

// ============================================================================
// STATE
// ============================================================================

let lastLogIndex = 0;

// Log when the panel is opened
window.addEventListener('load', function() {
  console.log("Img Audit Extension panel opened and ready!");
  
  // Load logs from localStorage
  loadLogsFromStorage();
  
  // Listen for page navigation events
  chrome.devtools.network.onNavigated.addListener(function() {
    console.log("Page navigated, resetting and re-injecting...");
    lastLogIndex = 0;
    // Re-inject code after navigation
    setTimeout(() => {
      injectSwipeDetection();
    }, 500);
  });
  
  // Inject swipe detection code into the inspected page
  injectSwipeDetection();
  
  // Start polling for new logs
  pollForLogs();
  
  // Clear logs button
  clearBtn.addEventListener('click', function() {
    clearLogs();
  });
  
  // Download CSV button
  downloadBtn.addEventListener('click', function() {
    exportToCSV();
  });
});

// ============================================================================
// STORAGE UTILITIES
// ============================================================================

function getStoredLogs() {
  try {
    const stored = localStorage.getItem(CONFIG.STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error reading from localStorage:', e);
    return [];
  }
}

function saveLogsToStorage(logs) {
  if (!Array.isArray(logs)) {
    console.error('Invalid logs data: expected array');
    return;
  }
  
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(logs));
  } catch (e) {
    console.error('Error saving to localStorage:', e);
  }
}

function loadLogsFromStorage() {
  const storedLogs = getStoredLogs();
  if (storedLogs.length > 0) {
    // Clear empty state
    if (logsContainer.querySelector('.empty-state')) {
      logsContainer.innerHTML = '';
    }
    
    // Render all stored logs (newest first)
    storedLogs.reverse().forEach(function(logData) {
      renderLogEntry(logData, false); // false = don't save to storage (already saved)
    });
    
    lastLogIndex = storedLogs.length;
  }
}

function clearLogs() {
  logsContainer.innerHTML = '<div class="empty-state"><p>No logs yet</p><p style="font-size: 11px;">Swipe on elements to see logs</p></div>';
  lastLogIndex = 0;
  
  // Clear localStorage
  localStorage.removeItem(CONFIG.STORAGE_KEY);
  
  // Clear logs from the inspected page as well
  chrome.devtools.inspectedWindow.eval('if (window.__imgAuditLogs) { window.__imgAuditLogs = []; }');
}

// ============================================================================
// API RESULTS UTILITIES
// ============================================================================

function getDefaultApiResults() {
  const results = {};
  API_RESULT_FIELDS.QUALITY.forEach(field => {
    results[field] = 'N/A';
  });
  API_RESULT_FIELDS.METRICS.forEach(field => {
    results[field] = 'N/A';
  });
  return results;
}

// ============================================================================
// LOG ENTRY MANAGEMENT
// ============================================================================

function addLogEntry(logData, saveToStorage = true) {
  // Generate unique ID for this log entry
  const logId = logData.id || generateLogId();
  
  // Create complete log entry data
  const completeLogData = {
    id: logId,
    timestamp: logData.timestamp || new Date().toISOString(),
    pageUrl: logData.pageUrl || '',
    originalUrl: logData.originalUrl || '',
    encoded: logData.encoded || '',
    apiResults: logData.apiResults || getDefaultApiResults(),
    qaApproved: logData.qaApproved || false
  };
  
  // Save to localStorage if this is a new entry
  if (saveToStorage) {
    const storedLogs = getStoredLogs();
    storedLogs.push(completeLogData);
    saveLogsToStorage(storedLogs);
  }
  
  // Render the log entry
  renderLogEntry(completeLogData, false);
}

function renderLogEntry(logData, saveToStorage = false) {
  // Remove empty state if present
  if (logsContainer.querySelector('.empty-state')) {
    logsContainer.innerHTML = '';
  }
  
  const logEntry = document.createElement('div');
  logEntry.className = 'log-entry';
  logEntry.dataset.logId = logData.id;
  
  const timestamp = formatTimestamp(logData.timestamp);
  
  // Check if API results already exist and are loaded
  const hasApiResults = logData.apiResults && logData.apiResults !== null;
  const apiResultsHtml = hasApiResults ? renderApiResults(logData.apiResults) : '<span>Loading...</span>';
  
  // Initial HTML
  logEntry.innerHTML = `
    <div class="timestamp">${timestamp}</div>
    <div class="label">Page URL:</div>
    <div class="value">${escapeHtml(logData.pageUrl)}</div>
    <div class="label" style="margin-top: 12px;">Original Image URL:</div>
    <div class="value">${escapeHtml(logData.originalUrl)}</div>
    <div class="label" style="margin-top: 12px;">Encoded Image URL:</div>
    <div class="value">${escapeHtml(logData.encoded)}</div>
    <div class="label" style="margin-top: 12px;">API Results:</div>
    <div class="value" id="api-results-${logData.id}">${apiResultsHtml}</div>
    <div class="qa-checkbox-container">
      <label>
        <input type="checkbox" id="qa-checkbox-${logData.id}" ${logData.qaApproved ? 'checked' : ''} />
        QA Approved
      </label>
    </div>
  `;
  
  logsContainer.insertBefore(logEntry, logsContainer.firstChild);
  
  // Add checkbox change listener
  const checkbox = document.getElementById(`qa-checkbox-${logData.id}`);
  if (checkbox) {
    checkbox.addEventListener('change', function() {
      updateQaStatus(logData.id, checkbox.checked);
    });
  }
  
  // Make API calls if we have a valid original URL and results are still default (N/A)
  const hasDefaultResults = logData.apiResults && 
    typeof logData.apiResults === 'object' &&
    (logData.apiResults[API_RESULT_FIELDS.QUALITY[0]] === 'N/A' || 
     logData.apiResults[API_RESULT_FIELDS.METRICS[0]] === 'N/A');
  
  if (hasDefaultResults && isValidImageUrl(logData.originalUrl)) {
    fetchApiResults(logData.originalUrl, `api-results-${logData.id}`, logData.id);
  } else if (hasDefaultResults) {
    const resultsDiv = document.getElementById(`api-results-${logData.id}`);
    if (resultsDiv) {
      resultsDiv.innerHTML = `<span style="color: #999;">${CONFIG.ERROR_MESSAGES.NO_VALID_URL}</span>`;
    }
  }
}

function updateQaStatus(logId, qaApproved) {
  const storedLogs = getStoredLogs();
  const logIndex = storedLogs.findIndex(log => log.id === logId);
  if (logIndex !== -1) {
    storedLogs[logIndex].qaApproved = qaApproved;
    saveLogsToStorage(storedLogs);
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeCsvField(field) {
  if (field === null || field === undefined) {
    return '';
  }
  const str = String(field);
  // If field contains comma, newline, or quote, wrap in quotes and escape quotes
  if (str.includes(',') || str.includes('\n') || str.includes('"')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function generateLogId() {
  return Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
}

function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url !== CONFIG.ERROR_MESSAGES.NO_EXTRACT && 
         url !== CONFIG.ERROR_MESSAGES.NO_SLIDE && 
         !url.startsWith('Error:');
}

// ============================================================================
// URL DECODING UTILITIES
// ============================================================================

/**
 * Decodes a Taboola-encoded image URL
 * @param {string} encodedUrl - The encoded image URL
 * @returns {Object} - Object with originalUrl and error message if any
 */
function decodeTaboolaImageUrl(encodedUrl) {
  if (!encodedUrl || typeof encodedUrl !== 'string') {
    return {
      originalUrl: CONFIG.ERROR_MESSAGES.NO_EXTRACT,
      encoded: encodedUrl || ''
    };
  }
  
  try {
    // First decode the full Taboola URL
    const decodedOnce = decodeURI(encodedUrl);
    
    // Extract the original encoded image URL
    const parts = decodedOnce.split('/https');
    if (parts.length > 1) {
      const originalEncodedUrl = 'https' + parts[1];
      
      // Decode the original image URL
      const originalUrl = decodeURIComponent(originalEncodedUrl);
      
      return {
        originalUrl: originalUrl,
        encoded: encodedUrl
      };
    } else {
      return {
        originalUrl: CONFIG.ERROR_MESSAGES.NO_EXTRACT,
        encoded: encodedUrl
      };
    }
  } catch (error) {
    return {
      originalUrl: `Error: ${error.message}`,
      encoded: encodedUrl
    };
  }
}

// ============================================================================
// CSV EXPORT
// ============================================================================

function exportToCSV() {
  const storedLogs = getStoredLogs();
  
  if (storedLogs.length === 0) {
    alert(CONFIG.ERROR_MESSAGES.NO_LOGS);
    return;
  }
  
  // Build CSV rows
  const rows = [CSV_HEADERS.map(escapeCsvField).join(',')];
  
  // Collect Story values from QA-approved logs for average calculation
  const qaApprovedStoryValues = [];
  
  storedLogs.forEach(function(log) {
    const timestamp = formatTimestamp(log.timestamp);
    
    // Get API results (handle both object and old HTML string format)
    let apiResults = log.apiResults || {};
    if (typeof apiResults === 'string') {
      // Old format - create default object
      apiResults = getDefaultApiResults();
    }
    
    // Collect Story value if QA approved
    if (log.qaApproved) {
      const storyValue = apiResults['Story'] || 'N/A';
      // Try to parse as number, skip if N/A or invalid
      const storyNum = parseFloat(storyValue);
      if (!isNaN(storyNum)) {
        qaApprovedStoryValues.push(storyNum);
      }
    }
    
    const row = [
      escapeCsvField(timestamp),
      escapeCsvField(log.pageUrl || ''),
      escapeCsvField(log.originalUrl || ''),
      escapeCsvField(log.encoded || ''),
      escapeCsvField(log.qaApproved ? 'Yes' : 'No'),
      escapeCsvField(apiResults['Thumbnail'] || 'N/A'),
      escapeCsvField(apiResults['Full Screen'] || 'N/A'),
      escapeCsvField(apiResults['Story'] || 'N/A'),
      escapeCsvField(apiResults['Width'] || 'N/A'),
      escapeCsvField(apiResults['Height'] || 'N/A'),
      escapeCsvField(apiResults['Laplacian Variance'] || 'N/A'),
      escapeCsvField(apiResults['Total Pixels'] || 'N/A')
    ];
    
    rows.push(row.join(','));
  });
  
  // Calculate average Story value for QA-approved entries
  let storyAverage = 'N/A';
  if (qaApprovedStoryValues.length > 0) {
    const sum = qaApprovedStoryValues.reduce((a, b) => a + b, 0);
    storyAverage = (sum / qaApprovedStoryValues.length).toFixed(CONFIG.CSV.DECIMAL_PRECISION);
  }
  
  // Add summary row at the bottom
  const summaryRow = [
    '',
    '',
    '',
    '',
    'Story Average (QA Approved)',
    '',
    '',
    escapeCsvField(storyAverage),
    '',
    '',
    '',
    ''
  ];
  rows.push(summaryRow.join(','));
  
  // Create CSV content
  const csvContent = rows.join('\n');
  
  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `img-audit-logs-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  // Clean up the URL object
  URL.revokeObjectURL(url);
}

function renderApiResults(apiResults) {
  // Handle old format (HTML string) - migrate to object format
  if (typeof apiResults === 'string') {
    return apiResults; // Return old HTML as-is for backward compatibility
  }
  
  if (!apiResults || typeof apiResults !== 'object') {
    return '<span style="color: #999;">No API results available</span>';
  }
  
  let html = '';
  
  // Quality Analysis section
  html += `
    <div style="margin-bottom: 12px;">
      <div class="label" style="font-size: 11px; color: #4285f4;">Quality Analysis:</div>
      <div style="margin-left: 8px; margin-top: 4px;">
        <div><strong>Thumbnail:</strong> ${apiResults['Thumbnail'] || 'N/A'}</div>
        <div><strong>Full Screen:</strong> ${apiResults['Full Screen'] || 'N/A'}</div>
        <div><strong>Story:</strong> ${apiResults['Story'] || 'N/A'}</div>
      </div>
    </div>
  `;
  
  // Image Metrics section
  html += `
    <div>
      <div class="label" style="font-size: 11px; color: #4285f4;">Image Metrics:</div>
      <div style="margin-left: 8px; margin-top: 4px;">
        <div><strong>Width:</strong> ${apiResults['Width'] || 'N/A'}</div>
        <div><strong>Height:</strong> ${apiResults['Height'] || 'N/A'}</div>
        <div><strong>Laplacian Variance:</strong> ${apiResults['Laplacian Variance'] || 'N/A'}</div>
        <div><strong>Total Pixels:</strong> ${apiResults['Total Pixels'] || 'N/A'}</div>
      </div>
    </div>
  `;
  
  return html;
}

// ============================================================================
// API RESPONSE PARSING
// ============================================================================

/**
 * Maps JSON field names to display names
 */
const JSON_FIELD_MAPPING = {
  // Quality fields (JSON -> Display)
  'thumbnail': 'Thumbnail',
  'full_screen': 'Full Screen',
  'story': 'Story',
  // Metrics fields (JSON -> Display)
  'width': 'Width',
  'height': 'Height',
  'laplacianVariance': 'Laplacian Variance',
  'totalPixels': 'Total Pixels'
};

function parseJsonResponse(jsonString) {
  try {
    return JSON.parse(jsonString);
  } catch (e) {
    console.error('Error parsing JSON response:', e);
    return null;
  }
}

function mapJsonToDisplayFormat(jsonData) {
  const mapped = {};
  Object.keys(JSON_FIELD_MAPPING).forEach(jsonKey => {
    const displayKey = JSON_FIELD_MAPPING[jsonKey];
    mapped[displayKey] = jsonData[jsonKey] !== undefined ? jsonData[jsonKey] : 'N/A';
  });
  return mapped;
}

async function fetchApiResults(originalUrl, resultsId, logId) {
  const encodedUrl = encodeURIComponent(originalUrl);
  const resultsDiv = document.getElementById(resultsId);
  
  if (!resultsDiv) return;
  
  // Initialize API results object with default values
  const apiResults = getDefaultApiResults();
  
  try {
    // Call both APIs
    const [qualityResponse, metricsResponse] = await Promise.all([
      fetch(`${CONFIG.API_BASE_URL}${CONFIG.API_ENDPOINTS.QUALITY}?url=${encodedUrl}`),
      fetch(`${CONFIG.API_BASE_URL}${CONFIG.API_ENDPOINTS.METRICS}?url=${encodedUrl}`)
    ]);
    
    // Parse quality response (JSON)
    if (qualityResponse.ok) {
      const qualityText = await qualityResponse.text();
      const qualityJson = parseJsonResponse(qualityText);
      
      if (qualityJson) {
        const mappedQuality = mapJsonToDisplayFormat(qualityJson);
        // Only update quality fields
        API_RESULT_FIELDS.QUALITY.forEach(field => {
          if (mappedQuality[field] !== undefined) {
            apiResults[field] = mappedQuality[field];
          }
        });
      } else {
        // Set error for all quality fields if parsing failed
        API_RESULT_FIELDS.QUALITY.forEach(field => {
          apiResults[field] = `Error: Failed to parse response`;
        });
      }
    } else {
      // Set error for all quality fields
      API_RESULT_FIELDS.QUALITY.forEach(field => {
        apiResults[field] = `Error: ${qualityResponse.status}`;
      });
    }
    
    // Parse metrics response (JSON)
    if (metricsResponse.ok) {
      const metricsText = await metricsResponse.text();
      const metricsJson = parseJsonResponse(metricsText);
      
      if (metricsJson) {
        const mappedMetrics = mapJsonToDisplayFormat(metricsJson);
        // Only update metrics fields
        API_RESULT_FIELDS.METRICS.forEach(field => {
          if (mappedMetrics[field] !== undefined) {
            apiResults[field] = mappedMetrics[field];
          }
        });
      } else {
        // Set error for all metrics fields if parsing failed
        API_RESULT_FIELDS.METRICS.forEach(field => {
          apiResults[field] = `Error: Failed to parse response`;
        });
      }
    } else {
      // Set error for all metrics fields
      API_RESULT_FIELDS.METRICS.forEach(field => {
        apiResults[field] = `Error: ${metricsResponse.status}`;
      });
    }
    
    // Render and display results
    resultsDiv.innerHTML = renderApiResults(apiResults);
    
    // Save API results object to localStorage
    if (logId) {
      const storedLogs = getStoredLogs();
      const logIndex = storedLogs.findIndex(log => log.id === logId);
      if (logIndex !== -1) {
        storedLogs[logIndex].apiResults = apiResults;
        saveLogsToStorage(storedLogs);
      }
    }
    
  } catch (error) {
    // Update error in results object for all fields
    [...API_RESULT_FIELDS.QUALITY, ...API_RESULT_FIELDS.METRICS].forEach(field => {
      apiResults[field] = `Error: ${error.message}`;
    });
    
    if (resultsDiv) {
      resultsDiv.innerHTML = renderApiResults(apiResults);
    }
    
    // Save error to localStorage
    if (logId) {
      const storedLogs = getStoredLogs();
      const logIndex = storedLogs.findIndex(log => log.id === logId);
      if (logIndex !== -1) {
        storedLogs[logIndex].apiResults = apiResults;
        saveLogsToStorage(storedLogs);
      }
    }
  }
}


// ============================================================================
// POLLING & LOG DETECTION
// ============================================================================

function pollForLogs() {
  try {
    chrome.devtools.inspectedWindow.eval(
      `(function() {
        if (!window.__imgAuditLogs) return [];
        return window.__imgAuditLogs.slice(${lastLogIndex});
      })()`,
      function(result, exceptionInfo) {
        // Handle context errors (page navigation, reload, etc.)
        if (exceptionInfo) {
          // Check for context invalidation errors
          if (exceptionInfo.code === -32602 || 
              exceptionInfo.value && exceptionInfo.value.indexOf('uniqueContextId') !== -1) {
            // Context was invalidated (page navigated/reloaded)
            // Reset and re-inject code
            lastLogIndex = 0;
            setTimeout(() => {
              injectSwipeDetection();
              setTimeout(pollForLogs, CONFIG.POLL_INTERVAL);
            }, 1000); // Wait a bit for page to stabilize
            return;
          }
          
          // Other errors - continue polling with delay
          setTimeout(pollForLogs, CONFIG.POLL_INTERVAL);
          return;
        }
        
        if (result && Array.isArray(result) && result.length > 0) {
          result.forEach(function(logData) {
            // Add timestamp if not present
            if (!logData.timestamp) {
              logData.timestamp = new Date().toISOString();
            }
            addLogEntry(logData);
          });
          lastLogIndex += result.length;
        }
        
        // Continue polling
        setTimeout(pollForLogs, CONFIG.POLL_INTERVAL);
      }
    );
  } catch (error) {
    // Fallback error handling
    console.error('Error in pollForLogs:', error);
    setTimeout(pollForLogs, CONFIG.POLL_INTERVAL * 2); // Longer delay on error
  }
}

function injectSwipeDetection() {
  try {
    const code = `
    (function() {
      // Remove existing listeners if any
      if (window.__imgAuditSwipeListener) {
        return; // Already injected
      }
      
      window.__imgAuditSwipeListener = true;
      
      function decodeTaboolaImageUrl(encodedUrl) {
        if (!encodedUrl || typeof encodedUrl !== 'string') {
          return {
            originalUrl: "${CONFIG.ERROR_MESSAGES.NO_EXTRACT.replace(/"/g, '\\"')}",
            encoded: encodedUrl || ''
          };
        }
        
        try {
          const decodedOnce = decodeURI(encodedUrl);
          const parts = decodedOnce.split('/https');
          if (parts.length > 1) {
            const originalEncodedUrl = 'https' + parts[1];
            const originalUrl = decodeURIComponent(originalEncodedUrl);
            return { originalUrl: originalUrl, encoded: encodedUrl };
          } else {
            return {
              originalUrl: "${CONFIG.ERROR_MESSAGES.NO_EXTRACT.replace(/"/g, '\\"')}",
              encoded: encodedUrl
            };
          }
        } catch (error) {
          return {
            originalUrl: "Error: " + error.message,
            encoded: encodedUrl
          };
        }
      }
      
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
          
          // Check if it's a valid swipe (horizontal or vertical)
          const minSwipeDistance = ${CONFIG.MIN_SWIPE_DISTANCE};
          if (Math.abs(deltaX) > minSwipeDistance || Math.abs(deltaY) > minSwipeDistance) {
            try {
              // Initialize logs array if it doesn't exist
              if (!window.__imgAuditLogs) {
                window.__imgAuditLogs = [];
              }
              
              const pageUrl = window.location.href;
              const activeSlideImg = document.querySelector("${CONFIG.SELECTORS.ACTIVE_SLIDE_IMG.replace(/"/g, '\\"')}");
              
              let decodedResult;
              
              if (activeSlideImg && activeSlideImg.src) {
                const encoded = activeSlideImg.src;
                decodedResult = decodeTaboolaImageUrl(encoded);
              } else {
                decodedResult = {
                  originalUrl: "${CONFIG.ERROR_MESSAGES.NO_SLIDE.replace(/"/g, '\\"')}",
                  encoded: ""
                };
              }
              
              // Store log data
              window.__imgAuditLogs.push({
                pageUrl: pageUrl,
                originalUrl: decodedResult.originalUrl,
                encoded: decodedResult.encoded
              });
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
        const swiperElements = document.querySelectorAll("${CONFIG.SELECTORS.SWIPER.replace(/"/g, '\\"')}");
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
        // Handle context errors gracefully
        if (exceptionInfo.code === -32602 || 
            (exceptionInfo.value && exceptionInfo.value.indexOf('uniqueContextId') !== -1)) {
          // Context invalidated - page might be navigating
          console.warn("Context invalidated, will retry injection after delay");
          setTimeout(() => {
            injectSwipeDetection();
          }, 1000);
        } else {
          console.error("Error injecting swipe detection:", exceptionInfo);
        }
      } else {
        console.log("Swipe detection code injected successfully!");
      }
    });
  } catch (error) {
    console.error("Error in injectSwipeDetection:", error);
    // Retry after delay
    setTimeout(() => {
      injectSwipeDetection();
    }, 2000);
  }
}

