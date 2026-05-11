const ext = typeof browser !== "undefined" ? browser : chrome;

const queryInput = document.getElementById("query");
const resultsDiv = document.getElementById("results");
const statusDiv = document.getElementById("status");
const recentsDiv = document.getElementById("recents");
const recentsSection = document.getElementById("recents-section");
const clearRecentsBtn = document.getElementById("clear-recents");

// Settings Elements
const settingsDiv = document.getElementById("settings");
const geminiInput = document.getElementById("gemini_key_input");
const giphyInput = document.getElementById("giphy_key_input");
const saveBtn = document.getElementById("save_keys");
const toggleBtn = document.getElementById("toggle_settings");

const blobCache = new Map();

let currentOffset = 0;
let currentKeywords = "";
const loadMoreBtn = document.getElementById("load-more");

const loaderEl = document.getElementById("loader");
const loadingMsg = document.getElementById("loading-msg");
let messageInterval;

const FUN_MESSAGES = [
  "Initializing vibe check...",
  "Calibrating GIF sensors...",
  "Consulting the AI elders...",
  "Polishing pixels...",
  "Extracting humor from the cloud...",
  "Searching the GIPHY galaxy...",
  "Bending space-time for the perfect GIF...",
  "Verifying cool factor...",
  "Contacting the meme department...",
  "Waking up the GPUs...",
];

function showLoading(show) {
  if (show) {
    loaderEl.style.display = "flex";
    let i = 0;
    loadingMsg.textContent = FUN_MESSAGES[0];
    messageInterval = setInterval(() => {
      loadingMsg.style.opacity = 0;
      setTimeout(() => {
        i = (i + 1) % FUN_MESSAGES.length;
        loadingMsg.textContent = FUN_MESSAGES[i];
        loadingMsg.style.opacity = 1;
      }, 300);
    }, 1800);
  } else {
    loaderEl.style.display = "none";
    clearInterval(messageInterval);
  }
}

// --- Recents ---

const RECENTS_KEY = "vibe_gif_recents";
const RECENTS_LIMIT = 8;

function getRecents() {
  try {
    return JSON.parse(localStorage.getItem(RECENTS_KEY)) || [];
  } catch {
    return [];
  }
}

function saveRecents(recents) {
  localStorage.setItem(RECENTS_KEY, JSON.stringify(recents));
}

function recordRecent(gif) {
  const recents = getRecents();
  const filtered = recents.filter((g) => g.id !== gif.id);
  const slim = {
    id: gif.id,
    slug: gif.slug,
    title: gif.title,
    preview: gif.images.fixed_width.url,
    original: gif.images.original.url,
  };
  saveRecents([slim, ...filtered].slice(0, RECENTS_LIMIT));
  renderRecents();
}

function recordRecentSlim(slim) {
  const recents = getRecents();
  const filtered = recents.filter((g) => g.id !== slim.id);
  saveRecents([slim, ...filtered].slice(0, RECENTS_LIMIT));
  renderRecents();
}

function renderRecents() {
  const recents = getRecents();

  if (recents.length === 0) {
    recentsSection.style.display = "none";
    return;
  }

  recentsSection.style.display = "block";
  recentsDiv.innerHTML = "";

  recents.forEach((gif) => {
    const img = document.createElement("img");
    img.src = gif.preview;
    img.alt = gif.title;
    img.className = "recent-item";
    img.draggable = true;
    img.title = gif.title;

    fetch(gif.original)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `${gif.slug || gif.id}.gif`, { type: "image/gif" });
        blobCache.set(gif.id, file);
      })
      .catch((err) => console.warn("Recent pre-fetch failed for", gif.id, err));

    img.addEventListener("click", async () => {
      recordRecentSlim(gif);
      const file = blobCache.get(gif.id);
      if (file) {
        try {
          const blob = new Blob([file], { type: "image/gif" });
          await navigator.clipboard.write([new ClipboardItem({ "image/gif": blob })]);
          statusDiv.innerText = "GIF copied! Paste into Teams ✓";
        } catch (gifErr) {
          try {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d").drawImage(bitmap, 0, 0);
            const pngBlob = await new Promise((res) => canvas.toBlob(res, "image/png"));
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
            statusDiv.innerText = "Image copied (static)! Paste into Teams ✓";
          } catch (pngErr) {
            navigator.clipboard.writeText(gif.original);
            statusDiv.innerText = "Link copied to clipboard!";
          }
        }
      } else {
        navigator.clipboard.writeText(gif.original);
        statusDiv.innerText = "Link copied to clipboard!";
      }
    });

    recentsDiv.appendChild(img);
  });
}

clearRecentsBtn.addEventListener("click", () => {
  localStorage.removeItem(RECENTS_KEY);
  renderRecents();
});

// --- Keys ---

async function checkKeys() {
  const gemini_key = localStorage.getItem("gemini_key");
  const giphy_key = localStorage.getItem("giphy_key");
  if (!gemini_key || !giphy_key) {
    settingsDiv.style.display = "block";
    statusDiv.innerText = "please set your api keys.";
  } else {
    geminiInput.value = gemini_key;
    giphyInput.value = giphy_key;
  }
}

toggleBtn.onclick = (e) => {
  e.preventDefault();
  settingsDiv.style.display = settingsDiv.style.display === "none" ? "block" : "none";
};

saveBtn.onclick = async () => {
  localStorage.setItem("gemini_key", geminiInput.value.trim());
  localStorage.setItem("giphy_key", giphyInput.value.trim());
  statusDiv.innerText = "keys saved!";
  settingsDiv.style.display = "none";
};

// --- State Restore ---
// On every popup open, ask background if there's a previous search to restore.
// This makes closing & reopening seamless — no re-fetch, no loader.

async function restoreState() {
  return new Promise((resolve) => {
    ext.runtime.sendMessage({ action: "GET_STATE" }, (response) => {
      if (response && response.state) {
        const { query, keywords, offset, gifs } = response.state;

        // Restore input field
        queryInput.value = query;

        // Restore local state vars so "load more" continues from right offset
        currentKeywords = keywords;
        currentOffset = offset;

        // Re-render all accumulated GIFs without any loading spinner
        displayGifs(gifs, false);
        statusDiv.innerText = "done! drag a gif to any chat.";

        if (loadMoreBtn) {
          loadMoreBtn.style.display = gifs.length >= 10 ? "block" : "none";
        }

        resolve(true); // state was restored
      } else {
        resolve(false); // no state, fresh start
      }
    });
  });
}

// --- Search ---

async function performSearch(isAppend = false) {
  const userInput = queryInput.value.trim();
  if (!userInput) return;

  const gemini_key = localStorage.getItem("gemini_key");
  const giphy_key = localStorage.getItem("giphy_key");

  if (!gemini_key || !giphy_key) {
    statusDiv.innerText = "missing api keys!";
    settingsDiv.style.display = "block";
    return;
  }

  try {
    statusDiv.innerText = isAppend ? "loading more..." : "consulting ai...";
    statusDiv.classList.add("loading");

    if (!isAppend) {
      // New search — tell background to wipe saved state
      await new Promise((resolve) => ext.runtime.sendMessage({ action: "CLEAR_STATE" }, resolve));
      showLoading(true);
      currentOffset = 0;
      blobCache.clear();
      currentKeywords = "";
    }

    const response = await new Promise((resolve) => {
      ext.runtime.sendMessage({
        action: "search",
        query: userInput,
        geminiKey: gemini_key,
        giphyKey: giphy_key,
        offset: currentOffset,
        keywords: isAppend ? currentKeywords : "",
      }, resolve);
    });

    if (!response || response.status === "error") {
      throw new Error(response?.message || "Background fetch failed");
    }

    const gifs = response.data;
    if (response.keywords) {
      currentKeywords = response.keywords;
    }

    displayGifs(gifs, isAppend);
    currentOffset += gifs.length;

    statusDiv.innerText = "done! drag a gif to any chat.";
    statusDiv.classList.remove("loading");
    showLoading(false);

    if (loadMoreBtn) {
      loadMoreBtn.style.display = gifs.length >= 10 ? "block" : "none";
    }
  } catch (err) {
    statusDiv.innerText = "something went wrong.";
    statusDiv.classList.remove("loading");
    showLoading(false);
    console.error(err);
  }
}

queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") performSearch(false);
});

const searchBtn = document.getElementById("search-btn");
if (searchBtn) searchBtn.onclick = () => performSearch(false);
if (loadMoreBtn) loadMoreBtn.onclick = () => performSearch(true);

// --- Display ---
function displayGifs(gifs, isAppend = false) {
  if (!isAppend) {
    resultsDiv.innerHTML = "";
  }

  gifs.forEach((gif) => {
    const img = document.createElement("img");
    img.src = gif.images.fixed_width.url;
    img.className = "gif-item";
    img.draggable = true;

    fetch(gif.images.original.url)
      .then((res) => res.blob())
      .then((blob) => {
        const file = new File([blob], `${gif.slug}.gif`, { type: "image/gif" });
        blobCache.set(gif.id, file);
      })
      .catch((err) => console.warn("Pre-fetch failed for", gif.id, err));

    img.addEventListener("dragstart", (e) => {
      const file = blobCache.get(gif.id);
      const gifUrl = gif.images.original.url;

      e.dataTransfer.setData("text/uri-list", gifUrl);
      e.dataTransfer.setData("text/plain", gifUrl);
      e.dataTransfer.setData("DownloadURL", `image/gif:${gif.slug}.gif:${gifUrl}`);
      if (file) e.dataTransfer.items.add(file);
      e.dataTransfer.effectAllowed = "copy";

      recordRecent(gif);
    });

    img.onclick = async () => {
      recordRecent(gif);

      const file = blobCache.get(gif.id);
      if (file) {
        try {
          const blob = new Blob([file], { type: "image/gif" });
          await navigator.clipboard.write([new ClipboardItem({ "image/gif": blob })]);
          statusDiv.innerText = "GIF copied! Paste into Teams ✓";
        } catch (gifErr) {
          try {
            const bitmap = await createImageBitmap(file);
            const canvas = document.createElement("canvas");
            canvas.width = bitmap.width;
            canvas.height = bitmap.height;
            canvas.getContext("2d").drawImage(bitmap, 0, 0);
            const pngBlob = await new Promise((res) => canvas.toBlob(res, "image/png"));
            await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
            statusDiv.innerText = "Image copied (static)! Paste into Teams ✓";
          } catch (pngErr) {
            navigator.clipboard.writeText(gif.images.original.url);
            statusDiv.innerText = "Link copied to clipboard!";
          }
        }
      } else {
        navigator.clipboard.writeText(gif.images.original.url);
        statusDiv.innerText = "Link copied to clipboard!";
      }
    };

    resultsDiv.appendChild(img);
  });
}

// --- Init ---
checkKeys();
renderRecents();
restoreState(); // ← restore last search silently on every popup open