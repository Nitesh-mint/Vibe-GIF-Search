const queryInput = document.getElementById("query");
const resultsDiv = document.getElementById("results");
const statusDiv = document.getElementById("status");

// Settings Elements
const settingsDiv = document.getElementById("settings");
const geminiInput = document.getElementById("gemini_key_input");
const giphyInput = document.getElementById("giphy_key_input");
const saveBtn = document.getElementById("save_keys");
const toggleBtn = document.getElementById("toggle_settings");

// Blob cache: gif.id -> File (pre-fetched so dragstart stays synchronous)
const blobCache = new Map();
// const pinnedGifs = {};

// Pagination and Search State
let currentOffset = 0;
let currentKeywords = "";
const loadMoreBtn = document.getElementById("load-more");

// Check for keys on startup
async function checkKeys() {
  const gemini_key = localStorage.getItem("gemini_key");
  const giphy_key = localStorage.getItem("giphy_key");
  if (!gemini_key || !giphy_key) {
    settingsDiv.style.display = "block";
    statusDiv.innerText = "Please set your API keys.";
  } else {
    geminiInput.value = gemini_key;
    giphyInput.value = giphy_key;
  }
}
checkKeys();

// Toggle Settings
toggleBtn.onclick = (e) => {
  e.preventDefault();
  settingsDiv.style.display =
    settingsDiv.style.display === "none" ? "block" : "none";
};

// Save Keys
saveBtn.onclick = async () => {
  const gemini_key = geminiInput.value.trim();
  const giphy_key = giphyInput.value.trim();

  localStorage.setItem("gemini_key", gemini_key);
  localStorage.setItem("giphy_key", giphy_key);
  statusDiv.innerText = "Keys saved!";
  settingsDiv.style.display = "none";
};

async function performSearch(isAppend = false) {
  const userInput = queryInput.value.trim();
  if (!userInput) return;

  const gemini_key = localStorage.getItem("gemini_key");
  const giphy_key = localStorage.getItem("giphy_key");

  if (!gemini_key || !giphy_key) {
    statusDiv.innerText = "Error: Missing API Keys!";
    settingsDiv.style.display = "block";
    return;
  }

  try {
    statusDiv.innerText = isAppend ? "Loading more..." : "Consulting AI...";
    statusDiv.classList.add("loading");
    if (!isAppend) {
      currentOffset = 0;
      blobCache.clear();
      // currentKeywords = await getKeywordsFromGemini(userInput, gemini_key);
      currentKeywords = userInput;
    }

    const gifs = await searchGiphy(currentKeywords, giphy_key, currentOffset);

    displayGifs(gifs, isAppend);

    currentOffset += gifs.length;
    statusDiv.innerText = "Done! Drag a GIF to any chat.";
    statusDiv.classList.remove("loading");

    if (loadMoreBtn) {
      loadMoreBtn.style.display = gifs.length >= 10 ? "block" : "none";
    }
  } catch (err) {
    statusDiv.innerText = "Something went wrong.";
    statusDiv.classList.remove("loading");
    console.error(err);
  }
}

// Handle Search Trigger
queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") performSearch(false);
});

const searchBtn = document.getElementById("search-btn");
if (searchBtn) {
  searchBtn.onclick = () => performSearch(false);
}

if (loadMoreBtn) {
  loadMoreBtn.onclick = () => performSearch(true);
}

async function getKeywordsFromGemini(text, key) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            {
              text: `Turn this mood into 3 specific, short search keywords for a GIF engine. Return only the keywords separated by commas. Mood: ${text}`,
            },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Gemini API Error: ${errorData.error?.message || response.statusText}`,
    );
  }

  const data = await response.json();
  if (
    !data.candidates ||
    data.candidates.length === 0 ||
    !data.candidates[0].content
  ) {
    throw new Error(
      "Gemini returned no results. Check your prompt or API key.",
    );
  }

  return data.candidates[0].content.parts[0].text;
}

async function searchGiphy(keywords, key, offset = 0) {
  console.log(`Calling GIPHY API (offset: ${offset})...`);
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(keywords)}&limit=10&offset=${offset}&rating=g`;
  const response = await fetch(url);

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `GIPHY API Error: ${errorData.meta?.msg || response.statusText}`,
    );
  }

  const data = await response.json();
  console.log("GIPHY Data: ", data);
  return data.data;
}

function displayGifs(gifs, isAppend = false) {
  if (!isAppend) {
    resultsDiv.innerHTML = "";
  }

  gifs.forEach((gif) => {
    const img = document.createElement("img");
    // const pinBtn = document.createElement("button");
    // pinBtn.text = "pin";
    img.src = gif.images.fixed_width.url;
    img.className = "gif-item";
    img.draggable = true;

    // Pre-fetch the GIF blob in the background so dragstart stays synchronous
    fetch(gif.images.original.url)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `${gif.slug}.gif`, { type: "image/gif" });
        blobCache.set(gif.id, file);
      })
      .catch((err) => console.warn("Pre-fetch failed for", gif.id, err));

    // Drag: attach the pre-fetched file — synchronous, so dataTransfer works
    img.addEventListener("dragstart", (e) => {
      const file = blobCache.get(gif.id);
      const gifUrl = gif.images.original.url;

      if (file) {
        // 1. Standard File API approach
        e.dataTransfer.items.add(file);

        // 2. The "DownloadURL" trick (format: mime:filename:url)
        const downloadData = `image/gif:${file.name}:${gifUrl}`;
        e.dataTransfer.setData("DownloadURL", downloadData);

        e.dataTransfer.effectAllowed = "copy";
      } else {
        e.dataTransfer.setData("text/plain", gifUrl);
      }
    });

    // Click: copy link to clipboard (keep the original behaviour)
    img.onclick = () => {
      navigator.clipboard.writeText(gif.images.original.url);
      statusDiv.innerText = "Link copied to clipboard!";
    };

    resultsDiv.appendChild(img);
    // resultsDiv.appendChild(pinBtn);
  });
}
