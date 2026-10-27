import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArabicNote } from "../arabicDictionary.js";

function oneAttribute(text, group) {
  const { attributes } = parseArabicNote(text);
  return attributes.filter((a) => a.attribute === group);
}

test("side terms map correctly", () => {
  const cases = {
    "يمين": "right",
    "يمنى": "right",
    "يسار": "left",
    "يسرى": "left",
    "شمال": "left",
    "سائق": "driver",
    "راكب": "passenger",
  };
  for (const [word, value] of Object.entries(cases)) {
    const hits = oneAttribute(word, "side");
    assert.equal(hits.length, 1, `${word} should map to one side attribute`);
    assert.equal(hits[0].value, value, `${word} should be ${value}`);
    assert.equal(hits[0].source, "Arabic Note");
  }
});

test("condition terms map correctly", () => {
  const cases = {
    "مكسور": "broken",
    "مشعور": "cracked",
    "مشروخ": "cracked",
    "خدش": "scratched",
    "مخدوش": "scratched",
  };
  for (const [word, value] of Object.entries(cases)) {
    const hits = oneAttribute(word, "condition");
    assert.equal(hits.length, 1, `${word} should map to one condition attribute`);
    assert.equal(hits[0].value, value, `${word} should be ${value}`);
  }
});

test("feature terms map correctly, including the multi-word phrase", () => {
  const cases = {
    "كهربائي": "electric",
    "كهربا": "electric",
    "تدفئة": "heated",
    "سخان": "heated",
    "طي": "folding",
    "ينطوي": "folding",
    "قابل للطي": "folding",
    "كاميرا": "camera",
    "إشارة": "indicator",
  };
  for (const [word, value] of Object.entries(cases)) {
    const hits = oneAttribute(word, "features");
    assert.equal(hits.length, 1, `${word} should map to one feature attribute`);
    assert.equal(hits[0].value, value, `${word} should be ${value}`);
  }
});

test("colour terms map correctly", () => {
  const cases = {
    "أبيض": "white",
    "أسود": "black",
    "فضي": "silver",
    "رمادي": "grey",
    "أحمر": "red",
    "أزرق": "blue",
    "ذهبي": "gold",
    "بني": "brown",
  };
  for (const [word, value] of Object.entries(cases)) {
    const hits = oneAttribute(word, "colour");
    assert.equal(hits.length, 1, `${word} should map to one colour attribute`);
    assert.equal(hits[0].value, value, `${word} should be ${value}`);
  }
});

test("Arabic-Indic digits become a year", () => {
  const { years } = parseArabicNote("٢٠١٧");
  assert.deepEqual(years, [2017]);
});

test("Western digits in range are years, out-of-range are not", () => {
  assert.deepEqual(parseArabicNote("سنة 2015").years, [2015]);
  assert.deepEqual(parseArabicNote("١٨٩٠ ٢٠٥٠").years, []);
});

test("normalisation: diacritics, tatweel, alef forms, taa marbuta, prefixes", () => {
  assert.equal(oneAttribute("كَهْرَبَائِيّ", "features")[0]?.value, "electric");
  assert.equal(oneAttribute("مـــكسور", "condition")[0]?.value, "broken");
  assert.equal(oneAttribute("إشارة", "features")[0]?.value, "indicator");
  assert.equal(oneAttribute("تدفئة", "features")[0]?.value, "heated");
  assert.equal(oneAttribute("والكهربائي", "features")[0]?.value, "electric");
  assert.equal(oneAttribute("الكهربائي", "features")[0]?.value, "electric");
});

test("unknown word is reported, never guessed as an attribute", () => {
  const result = parseArabicNote("مرايا");
  assert.deepEqual(result.unknown_words, ["مرايا"]);
  assert.deepEqual(result.attributes, []);
});

test("stopwords are ignored, not unknown words", () => {
  const result = parseArabicNote("في من مع على هذا عن");
  assert.deepEqual(result.unknown_words, []);
  assert.deepEqual(result.attributes, []);
});

test("a mixed note yields attributes, a year and unknown words together", () => {
  const result = parseArabicNote("يمين كهربائي ٢٠١٨ مرايا");
  assert.deepEqual(result.years, [2018]);
  const side = result.attributes.find((a) => a.attribute === "side");
  assert.equal(side?.value, "right");
  const feature = result.attributes.find((a) => a.attribute === "features");
  assert.equal(feature?.value, "electric");
  assert.deepEqual(result.unknown_words, ["مرايا"]);
});
