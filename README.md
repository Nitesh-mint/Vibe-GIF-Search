# AI Vibe GIF Search

AI Vibe GIF Search is a browser extension designed to find the most contextually relevant GIFs based on natural language queries. By leveraging the Gemini AI model to interpret "vibes" and the Giphy API for content retrieval, it provides a more nuanced search experience than traditional keyword-based systems.

## Prerequisites

Before installing the extension, you must obtain API keys for both Google Gemini and Giphy.

### 1. Obtain a Gemini API Key

1. Visit the [Google AI Studio](https://aistudio.google.com/) website.
2. Sign in with your Google account.
3. Click on the "Get API key" button in the sidebar.
4. Select "Create API key in new project" or choose an existing project.
5. Copy the generated API key and save it for later use.

### 2. Obtain a Giphy API Key

1. Visit the [Giphy Developers](https://developers.giphy.com/) portal.
2. Sign in or create a Giphy account.
3. Click on "Create an App".
4. Select "API" (not SDK) and click "Next Step".
5. Provide an App Name (e.g., "VibeGIF") and a brief description.
6. Once the app is created, copy the "API Key" from the dashboard.

## Installation

### Chromium-based Browsers (Chrome, Edge, Brave, Opera)

1. Clone or download this repository to your local machine.
2. Open your browser and navigate to `chrome://extensions/`.
3. Enable "Developer mode" using the toggle in the top right corner.
4. Click the "Load unpacked" button.
5. Select the directory containing the extension files (the folder where `manifest.json` is located).
6. The extension will now appear in your toolbar.

### Firefox

1. Clone or download this repository to your local machine.
2. Open Firefox and navigate to `about:debugging#/runtime/this-firefox`.
3. Click the "Load Temporary Add-on..." button.
4. Select the `manifest.json` file from the extension directory.
5. Note: Temporary add-ons in Firefox are removed when the browser is closed. For permanent installation, the extension must be signed through the Firefox Add-ons (AMO) developer portal.

## Configuration

1. Click the AI Vibe GIF Search icon in your browser toolbar.
2. Click the "Settings" icon or button within the popup.
3. Enter your Gemini API Key and Giphy API Key in the respective fields.
4. Click "Save" to store the keys locally.
5. You can now begin searching for GIFs by entering a query or "vibe" description.
