// Arabic note parser for Gulf scrapyard terminology.
// DICTIONARY and DONOR_TERMS are the single place for a native speaker to
// review and extend terms. Keys may be multi-word phrases.
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
    "خدوش": "scratched",
    "شرخ": "cracked",
    "شق": "cracked",
    "سليم": "intact",
    "جيدة": "good",
    "جيد": "good",
    "ممتازة": "excellent",
    "ممتاز": "excellent",
    "سليمان": "intact",
    "مستعمل": "used",
    "مستعملة": "used",
    "نظيف": "clean",
    "نظيفة": "clean",
    "خفيف": "light",
    "خفيفة": "light",
    "باهت": "faded",
    "ضرر": "damage",
    "مقطوع": "cut",
    "مقطوعان": "cut",
    "منحني": "bent",
    "منحنية": "bent",
  },
  features: {
    "كهربائي": "electric",
    "كهربائية": "electric",
    "كهربا": "electric",
    "الكهرباء": "electric",
    "تدفئة": "heated",
    "سخان": "heated",
    "مدفأة": "heated",
    "طي": "folding",
    "ينطوي": "folding",
    "قابل للطي": "folding",
    "كاميرا": "camera",
    "بكاميرا": "camera",
    "إشارة": "indicator",
    "اشارة": "indicator",
  },
  parts: {
    "الزجاج": "glass",
    "الجسم": "housing",
    "الإطار": "frame",
    "القاعدة": "base",
    "الموصل": "connector",
    "باب": "door",
    "سلك": "wire",
    "سلكان": "wire",
    "أطراف": "pins",
    "التوصيل": "wiring",
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

// Vehicle makes and models. Donor evidence only: never fitment, never an
// attribute of the part.
export const DONOR_TERMS = {
  "لاند كروزر": "Land Cruiser",
  "نيسان": "Nissan",
  "باترول": "Patrol",
  "برادو": "Prado",
  "باجيرو": "Pajero",
  "هيونداي": "Hyundai",
  "توسان": "Tucson",
  "أكاديا": "Acadia",
  "لكزس": "Lexus",
  "فورد": "Ford",
  "إكسبلورر": "Explorer",
  "بي إم دبليو": "BMW",
  "إكس 5": "X5",
};

// Function and filler words, ignored silently (never attributes, never unknown).
export const STOPWORDS = new Set(
  [
    "في", "من", "مع", "على", "هذا", "هذه", "ذلك", "عن", "و", "او", "الى",
    "لدي", "عند", "بها", "منها", "منه", "فقط", "جدا", "لا", "يوجد", "بحالة",
    "غير", "لم", "يتم", "صغير",
    "بدون", "مرفقة", "الرجاء", "تحتاج", "يدويا", "أسفل", "ظاهر",
    "واضح", "مؤكد", "مؤكدة", "مذكور",
  ].map(normalizeArabic),
);

// Known words that name the item, a group or a record detail but carry no
// attribute value themselves (e.g. "mirror", "side", "colour", "part number").
export const MARKER_WORDS = new Set(
  [
    "لون", "مرآة", "مرايا", "جانب", "جانبية", "للمرآة", "صور", "حالة",
    "رقم", "قطعة", "كود", "سجل", "فحص", "فحصها", "تحقق", "أخصائي",
  ].map(normalizeArabic),
);

// Terms are keyed by their normalised, prefix-stripped words so "الزجاج",
// "والزجاج" and "زجاج" all match. Multi-word terms are tried longest first.
const SINGLE = new Map();
const MULTI = [];
function addTerm(term, entry) {
  const words = normalizeArabic(term).split(/\s+/).map(stripPrefixes);
  if (words.length === 1) SINGLE.set(words[0], entry);
  else MULTI.push({ ...entry, words });
}
for (const [group, terms] of Object.entries(DICTIONARY)) {
  for (const [term, value] of Object.entries(terms)) addTerm(term, { kind: "attribute", group, value });
}
for (const [term, value] of Object.entries(DONOR_TERMS)) addTerm(term, { kind: "donor", value });
MULTI.sort((a, b) => b.words.length - a.words.length);

const YEAR_RANGE = { min: 1990, max: 2030 };

/**
 * Parse an Arabic seller note.
 * @returns {{ attributes: {attribute: string, value: string, word: string, source: "Arabic Note"}[],
 *             donor_evidence: {value: string, word: string, source: "Arabic Note"}[],
 *             years: number[], unknown_words: string[] }}
 */
export function parseArabicNote(text) {
  const normalized = normalizeArabic(text);
  const attributes = [];
  const donor_evidence = [];
  const years = [];
  const unknown_words = [];
  const seen = new Set();

  for (const match of normalized.match(/\b\d{4}\b/g) || []) {
    const n = Number(match);
    if (n >= YEAR_RANGE.min && n <= YEAR_RANGE.max && !years.includes(n)) years.push(n);
  }

  const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const bare = tokens.map(stripPrefixes);

  const record = (entry, word) => {
    const key = `${entry.kind}:${entry.group}:${entry.value}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (entry.kind === "donor") donor_evidence.push({ value: entry.value, word, source: "Arabic Note" });
    else attributes.push({ attribute: entry.group, value: entry.value, word, source: "Arabic Note" });
  };

  for (let i = 0; i < tokens.length; ) {
    const multi = MULTI.find((e) => e.words.every((w, j) => bare[i + j] === w || tokens[i + j] === w));
    if (multi) {
      record(multi, tokens.slice(i, i + multi.words.length).join(" "));
      i += multi.words.length;
      continue;
    }
    const token = tokens[i];
    const word = bare[i];
    i += 1;
    if (/^\d+$/.test(word)) continue; // numbers are handled as years
    if (STOPWORDS.has(word) || STOPWORDS.has(token)) continue;
    if (MARKER_WORDS.has(word) || MARKER_WORDS.has(token)) continue;
    const hit = SINGLE.get(word) || SINGLE.get(token);
    if (hit) record(hit, token);
    else if (!unknown_words.includes(token)) unknown_words.push(token);
  }

  return { attributes, donor_evidence, years, unknown_words };
}
