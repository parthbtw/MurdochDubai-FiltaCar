// Arabic note parser for Gulf scrapyard terminology.
// DICTIONARY is the single place for a native speaker to review and extend terms.
// parseArabicNote never guesses: anything not in the dictionary, the stopword
// list or the marker words is returned verbatim in unknown_words.

/** Normalise Arabic text: digits, diacritics, tatweel, alef forms, taa marbuta. */
export function normalizeArabic(text) {
  return String(text ?? "")
    // Arabic-Indic digits ٠-٩ and Eastern ۰-۹ to Western digits
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    // diacritics and tatweel
    .replace(/[\u064b-\u0652\u0670\u0640]/g, "")
    // unify alef forms (أ إ آ ٱ -> ا); alef maqsura handled below
    .replace(/[\u0623\u0625\u0622\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064a")
    // taa marbuta and haa are treated the same
    .replace(/\u0629/g, "\u0647");
}

/** Strip a leading "و" and/or "ال" from a normalised word. */
function stripPrefixes(word) {
  let w = word;
  for (let i = 0; i < 2; i += 1) {
    if (w.length > 1 && w.startsWith("\u0648")) w = w.slice(1);
    else if (w.length > 2 && w.startsWith("\u0627\u0644")) w = w.slice(2);
    else break;
  }
  return w;
}

// Reviewed Gulf scrapyard terms -> English attributes.
// Keys are written naturally; matching uses normalizeArabic + stripPrefixes.
export const DICTIONARY = {
  side: {
    "يمين": "right",
    "يمنى": "right",
    "يسار": "left",
    "يسرى": "left",
    "شمال": "left",
    "سائق": "driver",
    "راكب": "passenger",
  },
  condition: {
    "مكسور": "broken",
    "مشعور": "cracked",
    "مشروخ": "cracked",
    "خدش": "scratched",
    "مخدوش": "scratched",
  },
  features: {
    "كهربائي": "electric",
    "كهربا": "electric",
    "تدفئة": "heated",
    "سخان": "heated",
    "طي": "folding",
    "ينطوي": "folding",
    "كاميرا": "camera",
    "إشارة": "indicator",
    "اشارة": "indicator",
  },
  colour: {
    "أبيض": "white",
    "أسود": "black",
    "فضي": "silver",
    "رمادي": "grey",
    "أحمر": "red",
    "أزرق": "blue",
    "ذهبي": "gold",
    "بني": "brown",
  },
};

// Multi-word terms matched on the normalised token stream.
export const PHRASES = [
  { phrase: "قابل للطي", group: "features", value: "folding" },
];

// Function words ignored by unknown-word detection (never treated as attributes).
export const STOPWORDS = new Set(
  [
    "في", "من", "مع", "على", "هذا", "هذه", "ذلك", "عن", "و", "او", "الى",
    "لدي", "عند", "بها", "منها", "منه", "فقط", "جدا",
  ].map(normalizeArabic),
);

// Known words that signal a group but carry no attribute value themselves.
export const MARKER_WORDS = new Set(["لون"].map(normalizeArabic));

const LOOKUP = new Map();
for (const [group, terms] of Object.entries(DICTIONARY)) {
  for (const [term, value] of Object.entries(terms)) {
    LOOKUP.set(normalizeArabic(term), { group, value });
  }
}

const YEAR_RANGE = { min: 1990, max: 2030 };

/**
 * Parse an Arabic seller note.
 * @returns {{ attributes: {attribute: string, value: string, word: string, source: "Arabic Note"}[],
 *             years: number[], unknown_words: string[] }}
 */
export function parseArabicNote(text) {
  const normalized = normalizeArabic(text);
  const attributes = [];
  const years = [];
  const unknown_words = [];
  const seen = new Set();

  for (const match of normalized.match(/\b\d{4}\b/g) || []) {
    const n = Number(match);
    if (n >= YEAR_RANGE.min && n <= YEAR_RANGE.max && !years.includes(n)) years.push(n);
  }

  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);

  // Multi-word phrases first, so their words are not flagged unknown.
  const consumed = new Set();
  for (const { phrase, group, value } of PHRASES) {
    const wanted = normalizeArabic(phrase).split(/\s+/);
    for (let i = 0; i + wanted.length <= tokens.length; i += 1) {
      if (wanted.every((w, j) => tokens[i + j] === w)) {
        for (let j = 0; j < wanted.length; j += 1) consumed.add(i + j);
        const key = `${group}:${value}`;
        if (!seen.has(key)) {
          seen.add(key);
          attributes.push({ attribute: group, value, word: phrase, source: "Arabic Note" });
        }
        break;
      }
    }
  }

  for (const [i, token] of tokens.entries()) {
    if (consumed.has(i)) continue;
    const bare = stripPrefixes(token);
    if (/^\d+$/.test(bare)) continue; // numbers are handled as years
    if (STOPWORDS.has(bare) || STOPWORDS.has(token)) continue;
    if (MARKER_WORDS.has(bare)) continue;
    const hit = LOOKUP.get(bare);
    if (hit) {
      const key = `${hit.group}:${hit.value}`;
      if (!seen.has(key)) {
        seen.add(key);
        attributes.push({ attribute: hit.group, value: hit.value, word: token, source: "Arabic Note" });
      }
    } else if (!unknown_words.includes(token)) {
      unknown_words.push(token);
    }
  }

  return { attributes, years, unknown_words };
}
