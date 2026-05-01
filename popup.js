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

// Also accepts the slim stored shape (from recents re-use)
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

    img.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData("text/uri-list", gif.original);
      e.dataTransfer.setData("text/plain", gif.original);
      e.dataTransfer.effectAllowed = "copy";
      recordRecentSlim(gif);
    });

    img.addEventListener("click", () => {
      navigator.clipboard.writeText(gif.original);
      statusDiv.innerText = "link copied!";
      recordRecentSlim(gif);
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
  settingsDiv.style.display =
    settingsDiv.style.display === "none" ? "block" : "none";
};

saveBtn.onclick = async () => {
  localStorage.setItem("gemini_key", geminiInput.value.trim());
  localStorage.setItem("giphy_key", giphyInput.value.trim());
  statusDiv.innerText = "keys saved!";
  settingsDiv.style.display = "none";
};

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
      currentOffset = 0;
      blobCache.clear();
      // currentKeywords = await getKeywordsFromGemini(userInput, gemini_key);
      currentKeywords = userInput;
    }

    const gifs = await searchGiphy(currentKeywords, giphy_key, currentOffset);
    displayGifs(gifs, isAppend);
    currentOffset += gifs.length;

    statusDiv.innerText = "done! drag a gif to any chat.";
    statusDiv.classList.remove("loading");

    if (loadMoreBtn) {
      loadMoreBtn.style.display = gifs.length >= 10 ? "block" : "none";
    }
  } catch (err) {
    statusDiv.innerText = "something went wrong.";
    statusDiv.classList.remove("loading");
    console.error(err);
  }
}

queryInput.addEventListener("keypress", (e) => {
  if (e.key === "Enter") performSearch(false);
});

const searchBtn = document.getElementById("search-btn");
if (searchBtn) searchBtn.onclick = () => performSearch(false);
if (loadMoreBtn) loadMoreBtn.onclick = () => performSearch(true);

// --- Gemini ---

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
    const err = await response.json();
    throw new Error(
      `Gemini API Error: ${err.error?.message || response.statusText}`,
    );
  }

  const data = await response.json();
  if (!data.candidates || !data.candidates[0]?.content) {
    throw new Error("Gemini returned no results.");
  }
  return data.candidates[0].content.parts[0].text;
}

// --- Giphy ---

async function searchGiphy(keywords, key, offset = 0) {
  const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(keywords)}&limit=10&offset=${offset}&rating=g`;
  const response = await fetch(url);

  if (!response.ok) {
    const err = await response.json();
    throw new Error(`GIPHY API Error: ${err.meta?.msg || response.statusText}`);
  }

  const data = await response.json();
  return data.data;
}

// --- Display ---

function displayGifs(gifs, isAppend = false) {
  if (!isAppend) resultsDiv.innerHTML = "";

  gifs.forEach((gif) => {
    const wrap = document.createElement("div");
    wrap.className = "gif-wrap";

    const img = document.createElement("img");
    img.src = gif.images.fixed_width.url;
    img.alt = gif.title;
    img.draggable = false;

    const hint = document.createElement("div");
    hint.className = "drag-hint";
    hint.textContent = "drag or click";

    wrap.appendChild(img);
    wrap.appendChild(hint);
    resultsDiv.appendChild(wrap);

    // Ghost element for custom drag visual
    let ghostEl = null;

    wrap.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      const startX = e.clientX;
      const startY = e.clientY;
      let dragStarted = false;

      const onMouseMove = (e) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;

        if (!dragStarted && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
          dragStarted = true;
          wrap.classList.add("is-dragging");
          hint.textContent = "dragging...";
          hint.style.transform = "translateY(0)";

          ghostEl = document.createElement("img");
          ghostEl.src = gif.images.fixed_width.url;
          ghostEl.className = "drag-ghost";
          ghostEl.style.width = wrap.offsetWidth + "px";
          document.body.appendChild(ghostEl);
        }

        if (ghostEl) {
          ghostEl.style.left = e.clientX - wrap.offsetWidth / 2 + "px";
          ghostEl.style.top = e.clientY - 20 + "px";
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        if (ghostEl) {
          ghostEl.remove();
          ghostEl = null;
        }
        wrap.classList.remove("is-dragging");
        hint.textContent = "drag or click";
        hint.style.transform = "";
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });

    wrap.setAttribute("draggable", "true");

    wrap.addEventListener("dragstart", (e) => {
      const gifUrl = gif.images.original.url;
      e.dataTransfer.setData("text/uri-list", gifUrl);
      e.dataTransfer.setData("text/plain", gifUrl);
      e.dataTransfer.effectAllowed = "copy";

      wrap.classList.add("is-dragging");
      hint.textContent = "drop it!";
      hint.style.transform = "translateY(0)";

      recordRecent(gif);
    });

    wrap.addEventListener("dragend", () => {
      wrap.classList.remove("is-dragging");
      hint.textContent = "drag or click";
      hint.style.transform = "";
    });

    wrap.addEventListener("click", () => {
      navigator.clipboard.writeText(gif.images.original.url);
      hint.textContent = "link copied!";
      hint.style.transform = "translateY(0)";
      wrap.classList.add("copied");
      setTimeout(() => {
        hint.textContent = "drag or click";
        hint.style.transform = "";
        wrap.classList.remove("copied");
      }, 1500);
      recordRecent(gif);
    });
  });
}

// --- Init ---
checkKeys();
renderRecents();
