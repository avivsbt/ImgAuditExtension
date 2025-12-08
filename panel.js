// This script runs in the DevTools panel context
console.log("ImgAudit panel script loaded!");

const STORAGE_KEY = 'imgAuditLogs';
let lastLogIndex = 0;
const logsContainer = document.getElementById('logsContainer');
const clearBtn = document.getElementById('clearBtn');
const downloadBtn = document.getElementById('downloadBtn');

// Log when the panel is opened
window.addEventListener('load', function() {
  console.log("Img Audit Extension panel opened and ready!");
  
  // Load logs from localStorage
  loadLogsFromStorage();
  
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

function getStoredLogs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.error('Error reading from localStorage:', e);
    return [];
  }
}

function saveLogsToStorage(logs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(logs));
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
  localStorage.removeItem(STORAGE_KEY);
  
  // Clear logs from the inspected page as well
  chrome.devtools.inspectedWindow.eval('if (window.__imgAuditLogs) { window.__imgAuditLogs = []; }');
}

function getDefaultApiResults() {
  return {
    'Thumbnail': 'N/A',
    'Full Screen': 'N/A',
    'Story': 'N/A',
    'Width': 'N/A',
    'Height': 'N/A',
    'Laplacian Variance': 'N/A',
    'Total Pixels': 'N/A'
  };
}

function addLogEntry(logData, saveToStorage = true) {
  // Generate unique ID for this log entry
  const logId = logData.id || Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
  
  // Create complete log entry data
  const completeLogData = {
    id: logId,
    timestamp: logData.timestamp || new Date().toISOString(),
    pageUrl: logData.pageUrl,
    originalUrl: logData.originalUrl,
    encoded: logData.encoded,
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
  
  const date = new Date(logData.timestamp);
  const timestamp = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  
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
  // Check if apiResults is an object and has default N/A values
  const hasDefaultResults = logData.apiResults && 
    typeof logData.apiResults === 'object' &&
    (logData.apiResults['Thumbnail'] === 'N/A' || logData.apiResults['Width'] === 'N/A');
  
  if (hasDefaultResults && logData.originalUrl && logData.originalUrl !== "Could not extract original URL" && logData.originalUrl !== "No active slide image found" && !logData.originalUrl.startsWith("Error:")) {
    fetchApiResults(logData.originalUrl, `api-results-${logData.id}`, logData.id);
  } else if (hasDefaultResults) {
    const resultsDiv = document.getElementById(`api-results-${logData.id}`);
    if (resultsDiv) {
      resultsDiv.innerHTML = '<span style="color: #999;">No valid image URL to analyze</span>';
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

function exportToCSV() {
  const storedLogs = getStoredLogs();
  
  if (storedLogs.length === 0) {
    alert('No logs to export');
    return;
  }
  
  // CSV Headers
  const headers = [
    'Timestamp',
    'Page URL',
    'Original Image URL',
    'Encoded Image URL',
    'QA Approved',
    'Thumbnail',
    'Full Screen',
    'Story',
    'Width',
    'Height',
    'Laplacian Variance',
    'Total Pixels'
  ];
  
  // Build CSV rows
  const rows = [headers.map(escapeCsvField).join(',')];
  
  // Collect Story values from QA-approved logs for average calculation
  const qaApprovedStoryValues = [];
  
  storedLogs.forEach(function(log) {
    const date = new Date(log.timestamp);
    const timestamp = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    
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
    storyAverage = (sum / qaApprovedStoryValues.length).toFixed(6);
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

function parseXml(xmlString) {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlString, 'text/xml');
  return xmlDoc;
}

function getXmlValue(xmlDoc, tagName) {
  const element = xmlDoc.getElementsByTagName(tagName)[0];
  return element ? element.textContent : 'N/A';
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
      fetch(`http://content-enricher.taboolasyndication.com:8400/api/images/analyze-quality?url=${encodedUrl}`),
      fetch(`http://content-enricher.taboolasyndication.com:8400/api/images/metrics?url=${encodedUrl}`)
    ]);
    
    // Parse quality response
    if (qualityResponse.ok) {
      const qualityXml = await qualityResponse.text();
      const qualityDoc = parseXml(qualityXml);
      
      apiResults['Thumbnail'] = getXmlValue(qualityDoc, 'thumbnail');
      apiResults['Full Screen'] = getXmlValue(qualityDoc, 'full_screen');
      apiResults['Story'] = getXmlValue(qualityDoc, 'story');
    } else {
      apiResults['Thumbnail'] = `Error: ${qualityResponse.status}`;
      apiResults['Full Screen'] = `Error: ${qualityResponse.status}`;
      apiResults['Story'] = `Error: ${qualityResponse.status}`;
    }
    
    // Parse metrics response
    if (metricsResponse.ok) {
      const metricsXml = await metricsResponse.text();
      const metricsDoc = parseXml(metricsXml);
      
      apiResults['Width'] = getXmlValue(metricsDoc, 'width');
      apiResults['Height'] = getXmlValue(metricsDoc, 'height');
      apiResults['Laplacian Variance'] = getXmlValue(metricsDoc, 'laplacianVariance');
      apiResults['Total Pixels'] = getXmlValue(metricsDoc, 'totalPixels');
    } else {
      apiResults['Width'] = `Error: ${metricsResponse.status}`;
      apiResults['Height'] = `Error: ${metricsResponse.status}`;
      apiResults['Laplacian Variance'] = `Error: ${metricsResponse.status}`;
      apiResults['Total Pixels'] = `Error: ${metricsResponse.status}`;
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
    // Update error in results object
    apiResults['Thumbnail'] = `Error: ${error.message}`;
    apiResults['Full Screen'] = `Error: ${error.message}`;
    apiResults['Story'] = `Error: ${error.message}`;
    apiResults['Width'] = `Error: ${error.message}`;
    apiResults['Height'] = `Error: ${error.message}`;
    apiResults['Laplacian Variance'] = `Error: ${error.message}`;
    apiResults['Total Pixels'] = `Error: ${error.message}`;
    
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
          // Add timestamp if not present
          if (!logData.timestamp) {
            logData.timestamp = new Date().toISOString();
          }
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

