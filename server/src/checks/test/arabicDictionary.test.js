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
    "خدوش": "scratched",
    "شرخ": "cracked",
    "شق": "cracked",
    "سليم": "intact",
    "جيدة": "good",
    "ممتازة": "excellent",
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
  const result = parseArabicNote("زرنيخ");
  assert.deepEqual(result.unknown_words, ["زرنيخ"]);
  assert.deepEqual(result.attributes, []);
  assert.deepEqual(result.donor_evidence, []);
});

test("filler words are ignored silently and produce nothing", () => {
  const result = parseArabicNote("غير لم يتم صغير على من فقط");
  assert.deepEqual(result.unknown_words, []);
  assert.deepEqual(result.attributes, []);
  assert.deepEqual(result.donor_evidence, []);
});

test("makes and models are donor evidence only, never attributes", () => {
  const cases = {
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
  };
  for (const [word, value] of Object.entries(cases)) {
    const result = parseArabicNote(word);
    assert.deepEqual(result.donor_evidence.map((d) => d.value), [value], word);
    assert.deepEqual(result.attributes, [], `${word} must not be an attribute`);
    assert.deepEqual(result.unknown_words, [], `${word} must not be unknown`);
  }
});

test("multi-word makes are matched as one phrase inside a sentence", () => {
  const result = parseArabicNote("مرآة يمين من بي إم دبليو 2019");
  assert.deepEqual(result.donor_evidence.map((d) => d.value), ["BMW"]);
  assert.deepEqual(result.unknown_words, []);
  assert.deepEqual(result.years, [2019]);
});

test("part and material words match after normalisation (ال, و, alef forms, taa marbuta)", () => {
  const cases = {
    "الزجاج": "glass",
    "والزجاج": "glass",
    "زجاج": "glass",
    "الجسم": "housing",
    "والجسم": "housing",
    "الإطار": "frame",
    "الاطار": "frame",
    "القاعدة": "base",
    "القاعده": "base",
    "الموصل": "connector",
  };
  for (const [word, value] of Object.entries(cases)) {
    assert.equal(oneAttribute(word, "parts")[0]?.value, value, word);
  }
  assert.equal(oneAttribute("كاميرا", "features")[0]?.value, "camera");
  assert.deepEqual(parseArabicNote("وبي إم دبليو").donor_evidence.map((d) => d.value), ["BMW"]);
  assert.deepEqual(parseArabicNote("اكاديا").donor_evidence.map((d) => d.value), ["Acadia"]);
});

test("item and label words (mirror, side, colour) are markers, not attributes or unknowns", () => {
  for (const word of ["مرآة", "مرايا", "جانب", "جانبية", "لون"]) {
    const result = parseArabicNote(word);
    assert.deepEqual(result.attributes, [], `${word} must not become an attribute`);
    assert.deepEqual(result.unknown_words, [], `${word} must not be unknown`);
  }
});

test("stopwords are ignored, not unknown words", () => {
  const result = parseArabicNote("في من مع على هذا عن");
  assert.deepEqual(result.unknown_words, []);
  assert.deepEqual(result.attributes, []);
});

test("a mixed note yields attributes, a year and unknown words together", () => {
  const result = parseArabicNote("يمين كهربائي ٢٠١٨ برادو زرنيخ");
  assert.deepEqual(result.years, [2018]);
  const side = result.attributes.find((a) => a.attribute === "side");
  assert.equal(side?.value, "right");
  const feature = result.attributes.find((a) => a.attribute === "features");
  assert.equal(feature?.value, "electric");
  assert.deepEqual(result.donor_evidence.map((d) => d.value), ["Prado"]);
  assert.deepEqual(result.unknown_words, ["زرنيخ"]);
});
