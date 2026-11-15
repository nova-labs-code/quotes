
const STORAGE_KEY = "quotes_preferences_v1";

const quoteText = document.getElementById("quoteText");
const likeButton = document.getElementById("likeButton");
const dislikeButton = document.getElementById("dislikeButton");
const resetButton = document.getElementById("resetButton");
const app = document.getElementById("app");

let quotes = [];
let currentQuote = null;
let history = [];
let historyIndex = -1;

let preferences = {
  liked: [],
  disliked: [],
  seen: []
};

let touchStartX = 0;
let touchStartY = 0;
let isChanging = false;

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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  } catch (error) {
    console.warn("Could not save preferences:", error);
  }
}

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
  return tokenize(text).filter(word => !stopWords.has(word));
}

function getBigrams(words) {
  const result = new Set();

  for (let i = 0; i < words.length - 1; i++) {
    result.add(`${words[i]} ${words[i + 1]}`);
  }

  return result;
}

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
    if (bigramsB.has(phrase)) phraseMatches++;
  }

  const phraseScore =
    phraseMatches /
    Math.max(1, new Set([...bigramsA, ...bigramsB]).size);

  return jaccard * 0.75 + phraseScore * 0.25;
}

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
    return available[Math.floor(Math.random() * available.length)];
  }

  const ranked = available.map(quote => ({
    quote,
    score: recommendationScore(quote)
  }));

  ranked.sort((a, b) => b.score - a.score);

  const explore = Math.random() < 0.15;

  if (explore) {
    const pool = ranked.slice(0, Math.min(5, ranked.length));
    return pool[Math.floor(Math.random() * pool.length)].quote;
  }

  const top = ranked.slice(0, Math.min(3, ranked.length));

  return top[Math.floor(Math.random() * top.length)].quote;
}

function updateButtons() {
  if (!currentQuote) return;

  const liked = preferences.liked.includes(currentQuote.id);
  const disliked = preferences.disliked.includes(currentQuote.id);

  likeButton.classList.toggle("selected", liked);
  dislikeButton.classList.toggle("selected", disliked);

  likeButton.setAttribute("aria-pressed", String(liked));
  dislikeButton.setAttribute("aria-pressed", String(disliked));
}

function displayQuote(quote, addToHistory = true) {
  if (!quote) {
    currentQuote = null;

    quoteText.textContent =
      "You've discovered every quote. Reset your preferences to start again.";

    likeButton.classList.remove("selected");
    dislikeButton.classList.remove("selected");

    likeButton.setAttribute("aria-pressed", "false");
    dislikeButton.setAttribute("aria-pressed", "false");

    return;
  }

  currentQuote = quote;

  if (addToHistory) {
    // Remove forward history when discovering a new quote.
    history = history.slice(0, historyIndex + 1);

    history.push(quote.id);
    historyIndex = history.length - 1;
  }

  quoteText.classList.add("changing");

  setTimeout(() => {
    quoteText.textContent = quote.text;
    quoteText.classList.remove("changing");

    updateButtons();
    isChanging = false;
  }, 150);
}

function showNextQuote() {
  if (isChanging) return;

  // First, move through existing browsing history.
  if (historyIndex < history.length - 1) {
    historyIndex++;

    const quote = quotes.find(
      q => q.id === history[historyIndex]
    );

    displayQuote(quote, false);
    return;
  }

  const next = getNextQuote();

  if (!next) {
    displayQuote(null);
    return;
  }

  preferences.seen.push(next.id);
  savePreferences();

  displayQuote(next);
}

function showPreviousQuote() {
  if (isChanging || historyIndex <= 0) return;

  historyIndex--;

  const previous = quotes.find(
    q => q.id === history[historyIndex]
  );

  if (previous) {
    displayQuote(previous, false);
  }
}

function vote(type) {
  if (!currentQuote || isChanging) return;

  const id = currentQuote.id;

  preferences.liked = preferences.liked.filter(x => x !== id);
  preferences.disliked = preferences.disliked.filter(x => x !== id);

  if (type === "like") {
    preferences.liked.push(id);
  } else {
    preferences.disliked.push(id);
  }

  savePreferences();
  updateButtons();

  showNextQuote();
}

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

    const validIds = new Set(quotes.map(q => q.id));

    preferences.liked = preferences.liked.filter(id => validIds.has(id));
    preferences.disliked = preferences.disliked.filter(id => validIds.has(id));
    preferences.seen = preferences.seen.filter(id => validIds.has(id));

    history = [];
    historyIndex = -1;

    // Start another discovery round only if all quotes were seen.
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

likeButton.addEventListener("click", () => vote("like"));
dislikeButton.addEventListener("click", () => vote("dislike"));

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
  if (Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;

  if (deltaX < 0) {
    showNextQuote();
  } else {
    showPreviousQuote();
  }
}, { passive: true });

loadQuotes();
