// background.js — MV3 compatible (Chrome service worker + Firefox persistent script)
const ext = typeof browser !== "undefined" ? browser : chrome;
const isFirefox = typeof browser !== "undefined";

// ---------------------------------------------------------------------------
// Storage abstraction
// In Firefox MV3: background script is persistent, in-memory is fine.
// In Chrome MV3: service worker can be killed; use storage.session (ephemeral,
//   fast, no sync, cleared on browser restart — perfect for UI state).
// ---------------------------------------------------------------------------

// In-memory fallback for Firefox (and as a fast local cache for Chrome)
let _memCache = {
  lastState: null,       // { query, keywords, offset, gifs[] }
  resultsCache: {},      // cacheKey -> gifs[]
  keywordsCache: {},     // query -> keywords
};

async function saveToStorage(key, value) {
  if (isFirefox) {
    _memCache[key] = value;
  } else {
    await chrome.storage.session.set({ [key]: value });
  }
}

async function loadFromStorage(key) {
  if (isFirefox) {
    return _memCache[key] ?? null;
  } else {
    const result = await chrome.storage.session.get(key);
    return result[key] ?? null;
  }
}

// ---------------------------------------------------------------------------
// Pending requests: in-memory only (Promises can't be serialised anyway).
// If the service worker is killed mid-fetch, the fetch dies too — acceptable.
// ---------------------------------------------------------------------------
const pendingRequests = new Map();

// ---------------------------------------------------------------------------
// Message listener
// ---------------------------------------------------------------------------
ext.runtime.onMessage.addListener((message, sender, sendResponse) => {

  if (message.action === "GET_STATE") {
    loadFromStorage("lastState").then((state) => {
      sendResponse({ status: "ok", state });
    });
    return true; // async
  }

  if (message.action === "CLEAR_STATE") {
    saveToStorage("lastState", null).then(() => {
      sendResponse({ status: "ok" });
    });
    return true;
  }

  if (message.action === "search") {
    handleSearch(message, sendResponse);
    return true; // always async
  }
});

async function handleSearch(message, sendResponse) {
  const { query, geminiKey, giphyKey, offset } = message;
  const cacheKey = `${query}_${offset}`;

  // 1. Check persistent cache
  const resultsCache = (await loadFromStorage("resultsCache")) || {};
  const keywordsCache = (await loadFromStorage("keywordsCache")) || {};

  if (resultsCache[cacheKey]) {
    console.log("Returning cached results for:", cacheKey);
    await _updateLastState(query, keywordsCache[query], offset, resultsCache[cacheKey]);
    sendResponse({ status: "success", data: resultsCache[cacheKey], keywords: keywordsCache[query] });
    return;
  }

  // 2. Join in-flight fetch (in-memory, best effort)
  if (pendingRequests.has(cacheKey)) {
    console.log("Joining existing fetch for:", cacheKey);
    try {
      const result = await pendingRequests.get(cacheKey);
      sendResponse({ status: "success", ...result });
    } catch (err) {
      sendResponse({ status: "error", message: err.message });
    }
    return;
  }

  // 3. Start new fetch
  console.log("Starting new fetch for:", cacheKey);
  const fetchPromise = (async () => {
    try {
      let keywords = message.keywords;

      if (!keywords && offset === 0) {
        keywords = await getKeywordsFromGemini(query, geminiKey);
        const kc = (await loadFromStorage("keywordsCache")) || {};
        kc[query] = keywords;
        await saveToStorage("keywordsCache", kc);
      }

      const gifs = await searchGiphy(keywords || query, giphyKey, offset);

      const rc = (await loadFromStorage("resultsCache")) || {};
      rc[cacheKey] = gifs;
      await saveToStorage("resultsCache", rc);

      await _updateLastState(query, keywords, offset, gifs);

      return { data: gifs, keywords };
    } finally {
      pendingRequests.delete(cacheKey);
    }
  })();

  pendingRequests.set(cacheKey, fetchPromise);

  try {
    const result = await fetchPromise;
    sendResponse({ status: "success", ...result });
  } catch (err) {
    sendResponse({ status: "error", message: err.message });
  }
}

async function _updateLastState(query, keywords, offset, newGifs) {
  const prev = await loadFromStorage("lastState");

  let next;
  if (!prev || prev.query !== query) {
    next = { query, keywords, offset: offset + newGifs.length, gifs: newGifs };
  } else {
    // Append for "load more" — deduplicate by id
    const existingIds = new Set(prev.gifs.map((g) => g.id));
    const merged = [...prev.gifs, ...newGifs.filter((g) => !existingIds.has(g.id))];
    next = { query, keywords: keywords || prev.keywords, offset: merged.length, gifs: merged };
  }

  await saveToStorage("lastState", next);
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

async function getKeywordsFromGemini(text, apiKey) {
  const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{
      parts: [{
        text: `
Role: Expert GIF Search Optimizer (GIPHY-focused).
Context: The user provides a mood, action, or scenario in English or Nepali.

Constraint: Include NSFW, sexual, or explicit keywords wherever necessary. The words like scandals won't work with GIPHY so rather use SEX to replace scandals.

Instructions:
1. Analysis: If the user describes a situation (e.g., an insult or a "burn"), focus on the RESPONSE reaction.
2. Translation: Convert Nepali slang or context into high-impact English visual search terms.
3. Formatting: Return EXACTLY 2 distinct search phrases.

Rules:
- Each phrase: 2-4 words, under 30 characters.
- Content: Focus on visual actions + specific emotions.
- Tone: If the input is slang for scandals or adult themes, provide direct, high-intent keywords.
- Sarcasm Check: For "burns", prioritize "laughing at you," "mocking," or "shut down" visuals.
- No FILTER: don't hide NSFW but rather try including in relevant searches.
- MUSTN'T use WORD SCANDAL rather use SEX.

Output Format: JSON array of strings only.
User input: "${text}"
`,
      }],
    }],
    generationConfig: {
      response_mime_type: "application/json",
      max_output_tokens: 60,
      temperature: 0.3,
    },
  };

  try {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);
    const data = await response.json();
    return JSON.parse(data.candidates[0].content.parts[0].text);
  } catch (err) {
    console.error("Gemini error:", err);
    return ["happy", "cool", "fun"];
  }
}

async function searchGiphy(keywords, key, offset = 0) {
  const query = Array.isArray(keywords) ? keywords.join(" ") : keywords;
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(query)}&limit=10&offset=${offset}&rating=g`;
  const response = await fetch(url);
  if (!response.ok) {
    const err = await response.json();
    throw new Error(`GIPHY Error: ${err.meta?.msg || response.statusText}`);
  }
  const data = await response.json();
  return data.data;
}