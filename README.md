# ImgAudit Extension

A Chrome DevTools extension for image auditing that captures image data, analyzes quality metrics, and exports results to CSV.

## Features

- **Swipe Detection**: Automatically detects swipe gestures on elements with `data-testid="swiper"`
- **Interstitial Filtering**: Automatically skips interstitial slides (slides with `data-type="interstitial"`)
- **Image URL Decoding**: Extracts and decodes Taboola image URLs from active swiper slides
- **Quality Analysis**: Calls API endpoints to analyze image quality metrics
- **Collage Detection**: Analyzes images to detect if they are collages with confidence scores
- **Image Thumbnails**: Displays thumbnail previews next to Original and Encoded Image URLs
- **Data Persistence**: Stores all logs in localStorage for persistence across sessions
- **QA Approval**: Track QA approval status for each image
- **CSV Export**: Export all logs with calculated thresholds to CSV format

## Installation

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (toggle in the top right)
3. Click "Load unpacked"
4. Select the `ImgAuditExtension` folder
5. The extension will now be available in Chrome DevTools

## Usage

1. Open Chrome DevTools on any webpage (F12)
2. Navigate to the "ImgAudit" tab in DevTools
3. Swipe on elements with `data-testid="swiper"` attribute
4. The extension will automatically:
   - Capture the page URL
   - Extract the active slide image URL
   - Decode Taboola image URLs
   - Call quality analysis APIs
   - Display results in the panel

## API Endpoints

The extension calls the following APIs for image analysis:

- `http://content-enricher.taboolasyndication.com:8400/api/images/analyze/quality?url={imageUrl}`
- `http://content-enricher.taboolasyndication.com:8400/api/images/metrics?url={imageUrl}`
- `http://content-enricher.taboolasyndication.com:8400/api/images/analyze/collage?url={imageUrl}`

### API Response Format

**Quality Analysis:**
- Thumbnail score
- Full Screen score
- Story score

**Image Metrics:**
- Width
- Height
- Laplacian Variance
- Total Pixels

**Collage Analysis:**
- Collage (boolean): Indicates if the image is a collage
- Confidence (number): Confidence score for the collage detection

## CSV Export

Click the "Download CSV" button to export all logs to a CSV file. The export includes:

- Timestamp
- Page URL
- Original Image URL
- Encoded Image URL
- QA Approved status
- All API result fields (Thumbnail, Full Screen, Story, Width, Height, Laplacian Variance, Total Pixels, Collage, Confidence)
- **Story Average** (calculated from QA-approved entries only) - shown in the bottom row

The CSV file is named with the current date: `img-audit-logs-YYYY-MM-DD.csv`

## Data Storage

All log data is stored in browser localStorage under the key `imgAuditLogs`. Data persists across:
- Browser sessions
- Page refreshes
- DevTools panel closes/reopens

Use the "Clear Logs" button to remove all stored data.

## File Structure

```
ImgAuditExtension/
├── manifest.json          # Extension manifest
├── devtools.html          # DevTools entry point
├── devtools.js            # DevTools panel creation
├── panel.html             # Panel UI
├── panel.js               # Panel logic and API calls
└── README.md              # This file
```

## Requirements

- Chrome browser (Manifest V3 compatible)
- Access to `content-enricher.taboolasyndication.com:8400` API endpoints

## Version

1.1.0

## Changelog

### v1.1.0
