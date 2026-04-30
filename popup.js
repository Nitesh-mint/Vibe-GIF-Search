const queryInput = document.getElementById('query');
const resultsDiv = document.getElementById('results');
const statusDiv = document.getElementById('status');

// Settings Elements
const settingsDiv = document.getElementById('settings');
const geminiInput = document.getElementById('gemini_key_input');
const giphyInput = document.getElementById('giphy_key_input');
const saveBtn = document.getElementById('save_keys');
const toggleBtn = document.getElementById('toggle_settings');

// Check for keys on startup
async function checkKeys() {
	const keys = await chrome.storage.local.get(['gemini_key', 'giphy_key']);
	if (!keys.gemini_key || !keys.giphy_key) {
		settingsDiv.style.display = 'block';
		statusDiv.innerText = "Please set your API keys.";
	} else {
		geminiInput.value = keys.gemini_key;
		giphyInput.value = keys.giphy_key;
	}
}
checkKeys();

// Toggle Settings
toggleBtn.onclick = (e) => {
	e.preventDefault();
	settingsDiv.style.display = settingsDiv.style.display === 'none' ? 'block' : 'none';
};

// Save Keys
saveBtn.onclick = async () => {
	const gemini_key = geminiInput.value.trim();
	const giphy_key = giphyInput.value.trim();

	await chrome.storage.local.set({ giphy_key });
	statusDiv.innerText = "Keys saved!";
	settingsDiv.style.display = 'none';
	// if (gemini_key && giphy_key) {
	// } else {
	// 	statusDiv.innerText = "Please provide both keys.";
	// }
};

// Handle "Enter" key
queryInput.addEventListener('keypress', async (e) => {
	if (e.key === 'Enter') {
		const userInput = queryInput.value;
		console.log("Pressed search with search value: ", userInput);
		statusDiv.innerText = "Consulting the AI brain...";

		// 1. Get Keys from Storage
		const keys = await chrome.storage.local.get(['gemini_key', 'giphy_key']);
		// if (!keys.gemini_key || !keys.giphy_key) {
		// 	statusDiv.innerText = "Error: Missing API Keys! (Set them in console)";
		// 	return;
		// }

		try {
			// 2. Ask Gemini to translate the "Vibe" into keywords
			// const keywords = await getKeywordsFromGemini(userInput, keys.gemini_key);
			// statusDiv.innerText = `Searching GIPHY for: ${keywords}...`;

			// 3. Fetch from GIPHY
			const gifs = await searchGiphy(keywords, keys.giphy_key);
			displayGifs(gifs);
			statusDiv.innerText = "Done!";
		} catch (err) {
			statusDiv.innerText = "Something went wrong.";
			console.error(err);
		}
	}
});

async function getKeywordsFromGemini(text, key) {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;
	const response = await fetch(url, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			contents: [{ parts: [{ text: `Turn this mood into 3 specific, short search keywords for a GIF engine. Return only the keywords separated by commas. Mood: ${text}` }] }]
		})
	});

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(`Gemini API Error: ${errorData.error?.message || response.statusText}`);
	}

	const data = await response.json();
	if (!data.candidates || data.candidates.length === 0 || !data.candidates[0].content) {
		throw new Error("Gemini returned no results. Check your prompt or API key.");
	}

	return data.candidates[0].content.parts[0].text;
}

async function searchGiphy(keywords, key) {
	console.log("Calling GIPHY API...");
	const url = `https://api.giphy.com/v1/gifs/search?api_key=${key}&q=${encodeURIComponent(keywords)}&limit=10&rating=g`;
	const response = await fetch(url);

	if (!response.ok) {
		const errorData = await response.json();
		throw new Error(`GIPHY API Error: ${errorData.meta?.msg || response.statusText}`);
	}

	const data = await response.json();
	console.log("GIPHY Data: ", data);
	return data.data;
}

function displayGifs(gifs) {
	resultsDiv.innerHTML = '';
	gifs.forEach(gif => {
		const img = document.createElement('img');
		img.src = gif.images.fixed_width.url;
		img.className = 'gif-item';
		img.onclick = () => {
			navigator.clipboard.writeText(gif.images.original.url);
			statusDiv.innerText = "Link copied to clipboard!";
		};
		resultsDiv.appendChild(img);
	});
}
