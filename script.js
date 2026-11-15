
const STORAGE_KEY = "quotes_preferences_v1";
const END_SCREEN = "__end__";

// ==========================================
// ELEMENTS
// ==========================================

const quoteText = document.getElementById("quoteText");
const likeButton = document.getElementById("likeButton");
const dislikeButton = document.getElementById("dislikeButton");
const resetButton = document.getElementById("resetButton");
const app = document.getElementById("app");

// ==========================================
// DYNAMIC FAVICON AND APPLE ICON
// ==========================================

function generateWebsiteIcons() {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="512"
         height="512"
         viewBox="0 0 512 512">

      <circle
        cx="256"
        cy="256"
        r="240"
        fill="#a855f7"
      />

      <text
  x="256"
  y="310"
  text-anchor="middle"
  dominant-baseline="central"
  font-family="Georgia, serif"
  font-size="340"
  font-weight="bold"
  fill="#ffffff"
>“</text>

    </svg>
  `;

  const svgBlob = new Blob(
    [svg],
    { type: "image/svg+xml" }
  );

  const svgUrl = URL.createObjectURL(svgBlob);

  // Browser favicon
  const favicon = document.getElementById("dynamic-favicon");

  if (favicon) {
    favicon.href = svgUrl;
  }

  // Generate Apple Touch Icon
  const image = new Image();

  image.onload = () => {
    const canvas = document.createElement("canvas");

    canvas.width = 180;
    canvas.height = 180;

    const context = canvas.getContext("2d");

    context.drawImage(image, 0, 0, 180, 180);

    const appleIcon = document.getElementById("apple-icon");

    if (appleIcon) {
      appleIcon.href = canvas.toDataURL("image/png");
    }

    URL.revokeObjectURL(svgUrl);
  };

  image.onerror = () => {
    URL.revokeObjectURL(svgUrl);
    console.error("Could not generate website icons.");
  };

  image.src = svgUrl;
}

generateWebsiteIcons();

// ==========================================
// QUOTE DATA
// ==========================================

let quotes = [];
let currentQuote = null;
let history = [];
let historyIndex = -1;
let isChanging = false;

let preferences = {
  liked: [],
  disliked: [],
  seen: []
};

let touchStartX = 0;
let touchStartY = 0;

// ==========================================
// PREFERENCES
// ==========================================

function loadPreferences() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (saved && typeof saved === "object") {
      preferences = {
        liked: Array.isArray(saved.liked) ? saved.liked : [],
        disliked: Array.isArray(saved.disliked) ? saved.disliked : [],
        seen: Array.isArray(saved.seen) ? saved.seen : []
      };
    }
  } catch (error) {
    console.warn("Could not load preferences:", error);
  }
}

function savePreferences() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(preferences)
    );
  } catch (error) {
    console.warn("Could not save preferences:", error);
  }
}

// ==========================================
// TEXT ANALYSIS
// ==========================================

function tokenize(text) {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(word => word.length > 2);
}

const stopWords = new Set([
  "the", "and", "that", "this", "with", "from",
  "your", "you", "are", "was", "were", "will",
  "would", "could", "should", "have", "has",
  "had", "for", "not", "but", "its", "it's",
  "they", "them", "their", "there", "what",
  "when", "where", "which", "who", "whom",
  "into", "than", "then", "just", "some",
  "more", "very", "about", "being", "been",
  "our", "out", "can", "all", "one", "two",
  "too", "how", "why", "his", "her", "she",
  "him", "also", "only", "over", "under"
]);

function getKeywords(text) {
  return tokenize(text).filter(
    word => !stopWords.has(word)
  );
}

function getBigrams(words) {
  const result = new Set();

  for (let i = 0; i < words.length - 1; i++) {
    result.add(`${words[i]} ${words[i + 1]}`);
  }

  return result;
}

// ==========================================
// QUOTE SIMILARITY
// ==========================================

function similarity(a, b) {
  const wordsA = getKeywords(a);
  const wordsB = getKeywords(b);

  if (!wordsA.length || !wordsB.length) return 0;

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  let intersection = 0;

  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }

  const union = new Set([...setA, ...setB]).size;
  const jaccard = intersection / union;

  const bigramsA = getBigrams(wordsA);
  const bigramsB = getBigrams(wordsB);

  let phraseMatches = 0;

  for (const phrase of bigramsA) {
    if (bigramsB.has(phrase)) {
      phraseMatches++;
    }
  }

  const phraseScore =
    phraseMatches /
    Math.max(
      1,
      new Set([...bigramsA, ...bigramsB]).size
    );

  return jaccard * 0.75 + phraseScore * 0.25;
}

// ==========================================
// RECOMMENDATION SYSTEM
// ==========================================

function recommendationScore(candidate) {
  const likedQuotes = quotes.filter(q =>
    preferences.liked.includes(q.id)
  );

  const dislikedQuotes = quotes.filter(q =>
    preferences.disliked.includes(q.id)
  );

  let positive = 0;
  let negative = 0;

  for (const liked of likedQuotes) {
    positive = Math.max(
      positive,
      similarity(candidate.text, liked.text)
    );
  }

  for (const disliked of dislikedQuotes) {
    negative = Math.max(
      negative,
      similarity(candidate.text, disliked.text)
    );
  }

  return positive * 1.5 - negative * 1.2;
}

function getNextQuote() {
  const available = quotes.filter(q =>
    !preferences.seen.includes(q.id)
  );

  if (!available.length) return null;

  if (
    preferences.liked.length === 0 &&
    preferences.disliked.length === 0
  ) {
    return available[
      Math.floor(Math.random() * available.length)
    ];
  }

  const ranked = available.map(quote => ({
    quote,
    score: recommendationScore(quote)
  }));

  ranked.sort((a, b) => b.score - a.score);

  if (Math.random() < 0.15) {
    const pool = ranked.slice(
      0,
      Math.min(5, ranked.length)
    );

    return pool[
      Math.floor(Math.random() * pool.length)
    ].quote;
  }

  const top = ranked.slice(
    0,
    Math.min(3, ranked.length)
  );

  return top[
    Math.floor(Math.random() * top.length)
  ].quote;
}

// ==========================================
// BUTTON STATES
// ==========================================

function updateButtons() {
  if (!currentQuote) {
    likeButton.classList.remove("selected");
    dislikeButton.classList.remove("selected");

    likeButton.setAttribute("aria-pressed", "false");
    dislikeButton.setAttribute("aria-pressed", "false");

    return;
  }

  const liked = preferences.liked.includes(currentQuote.id);
  const disliked = preferences.disliked.includes(currentQuote.id);

  likeButton.classList.toggle("selected", liked);
  dislikeButton.classList.toggle("selected", disliked);

  likeButton.setAttribute("aria-pressed", String(liked));
  dislikeButton.setAttribute("aria-pressed", String(disliked));
}

// ==========================================
// DISPLAY QUOTES
// ==========================================

function displayQuote(quote, addToHistory = true) {
  if (!quote) {
    currentQuote = null;
    isChanging = true;

    quoteText.classList.add("changing");

    setTimeout(() => {
      quoteText.textContent =
        "You've discovered every quote. Reset your preferences to start again.";

      quoteText.classList.remove("changing");

      updateButtons();
      isChanging = false;
    }, 150);

    return;
  }

  currentQuote = quote;

  if (addToHistory) {
    history = history.slice(0, historyIndex + 1);

    history.push(quote.id);
    historyIndex = history.length - 1;
  }

  isChanging = true;
  quoteText.classList.add("changing");

  setTimeout(() => {
    quoteText.textContent = quote.text;

    quoteText.classList.remove("changing");

    updateButtons();
    isChanging = false;
  }, 150);
}

// ==========================================
// NEXT QUOTE
// ==========================================

function showNextQuote() {
  if (isChanging) return;

  // Revisit forward history first
  if (historyIndex < history.length - 1) {
    historyIndex++;

    const nextId = history[historyIndex];

    if (nextId === END_SCREEN) {
      displayQuote(null, false);
      return;
    }

    const quote = quotes.find(q => q.id === nextId);

    if (quote) {
      displayQuote(quote, false);
    }

    return;
  }

  const next = getNextQuote();

  // All quotes have been discovered
  if (!next) {
    history = history.slice(0, historyIndex + 1);
    history.push(END_SCREEN);
    historyIndex = history.length - 1;

    displayQuote(null, false);
    return;
  }

  if (!preferences.seen.includes(next.id)) {
    preferences.seen.push(next.id);
    savePreferences();
  }

  displayQuote(next);
}

// ==========================================
// PREVIOUS QUOTE
// ==========================================

function showPreviousQuote() {
  if (isChanging || historyIndex <= 0) return;

  historyIndex--;

  const previousId = history[historyIndex];

  if (previousId === END_SCREEN) {
    return;
  }

  const previous = quotes.find(
    q => q.id === previousId
  );

  if (previous) {
    displayQuote(previous, false);
  }
}

// ==========================================
// LIKE / DISLIKE
// ==========================================

function vote(type) {
  if (!currentQuote || isChanging) return;

  const id = currentQuote.id;

  preferences.liked = preferences.liked.filter(
    x => x !== id
  );

  preferences.disliked = preferences.disliked.filter(
    x => x !== id
  );

  if (type === "like") {
    preferences.liked.push(id);
  } else {
    preferences.disliked.push(id);
  }

  savePreferences();
  updateButtons();

  showNextQuote();
}

// ==========================================
// LOAD DATA.QUOTES
// ==========================================

async function loadQuotes() {
  try {
    const response = await fetch("./data.quotes", {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const content = await response.text();

    quotes = content
      .split(/\r?\n\s*\r?\n/)
      .map(text => text.trim())
      .filter(Boolean)
      .map((text, index) => ({
        id: `quote-${index}`,
        text
      }));

    if (!quotes.length) {
      throw new Error("No quotes found in data.quotes");
    }

    loadPreferences();

    const validIds = new Set(
      quotes.map(q => q.id)
    );

    preferences.liked = preferences.liked.filter(
      id => validIds.has(id)
    );

    preferences.disliked = preferences.disliked.filter(
      id => validIds.has(id)
    );

    preferences.seen = preferences.seen.filter(
      id => validIds.has(id)
    );

    history = [];
    historyIndex = -1;

    if (preferences.seen.length >= quotes.length) {
      preferences.seen = [];
      savePreferences();
    }

    showNextQuote();

  } catch (error) {
    console.error(error);

    quoteText.textContent =
      "Unable to load data.quotes. Check that the file exists and is being served correctly.";
  }
}

// ==========================================
// BUTTON EVENTS
// ==========================================

likeButton.addEventListener("click", () => {
  vote("like");
});

dislikeButton.addEventListener("click", () => {
  vote("dislike");
});

// ==========================================
// RESET PREFERENCES
// ==========================================

resetButton.addEventListener("click", () => {
  const confirmed = confirm(
    "Reset all likes, dislikes and discovery history on this device?"
  );

  if (!confirmed) return;

  preferences = {
    liked: [],
    disliked: [],
    seen: []
  };

  history = [];
  historyIndex = -1;

  savePreferences();

  showNextQuote();
});

// ==========================================
// KEYBOARD NAVIGATION
// ==========================================

document.addEventListener("keydown", event => {
  if (event.key === "ArrowRight") {
    event.preventDefault();
    showNextQuote();
  }

  if (event.key === "ArrowLeft") {
    event.preventDefault();
    showPreviousQuote();
  }

  if (event.key === "Escape") {
    resetButton.blur();
  }
});

// ==========================================
// SWIPE NAVIGATION
// ==========================================

app.addEventListener("touchstart", event => {
  if (!event.touches.length) return;

  touchStartX = event.touches[0].clientX;
  touchStartY = event.touches[0].clientY;
}, { passive: true });

app.addEventListener("touchend", event => {
  if (!event.changedTouches.length) return;

  const endX = event.changedTouches[0].clientX;
  const endY = event.changedTouches[0].clientY;

  const deltaX = endX - touchStartX;
  const deltaY = endY - touchStartY;

  if (Math.abs(deltaX) < 55) return;

  if (Math.abs(deltaX) < Math.abs(deltaY) * 1.3) {
    return;
  }

  if (deltaX < 0) {
    showNextQuote();
  } else {
    showPreviousQuote();
  }
}, { passive: true });

// ==========================================
// START WEBSITE
// ==========================================

loadQuotes();
