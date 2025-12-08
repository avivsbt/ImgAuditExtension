// Create a DevTools panel
chrome.devtools.panels.create(
  "ImgAudit",
  null,
  "panel.html",
  function(panel) {
    console.log("ImgAudit DevTools panel created!");
    
    // Log when the panel is shown
    panel.onShown.addListener(function(window) {
      console.log("ImgAudit panel opened!");
    });
    
    // Log when the panel is hidden
    panel.onHidden.addListener(function() {
      console.log("ImgAudit panel closed!");
    });
  }
);

