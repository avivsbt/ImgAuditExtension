// This script runs in the DevTools panel context
console.log("ImgAudit panel script loaded!");

// Log when the panel is opened
window.addEventListener('load', function() {
  console.log("ImgAudit panel opened and ready!");
  
  // Inject swipe detection code into the inspected page
  injectSwipeDetection();
});

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
            console.log("hey :)");
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

