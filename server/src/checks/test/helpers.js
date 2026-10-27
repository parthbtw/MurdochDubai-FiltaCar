// Shared helpers for the checks tests.

export function baseRecord(overrides = {}) {
  const record = {
    item_id: "TEST-001",
    seller_id: "S-1",
    original_title_ar: "",
    original_title_en: "Toyota Corolla 2015 Mirror",
    part_details: {
      part_number: "12345-AB678",
      side: "left",
      make: "Toyota",
      model: "Corolla",
      year: 2015,
      colour: "",
      features: [],
    },
    condition: "used",
    readiness_status: "draft",
    actions_required: [],
    donor_vehicle: { make: "Toyota", model: "Corolla", year: 2015, drive_side: "left" },
    field_sources: {},
    notes_ar: "",
    photos: ["p1.jpg"],
    ocr: {
      text: "TOYOTA COROLLA 12345-AB678 2015 LEFT MIRROR",
      confidence: 0.9,
      unclear: false,
      quality: "good",
    },
    questions: [],
    gaps_and_conflicts: [],
    draft: { title: "", description: "", item_specifics: {} },
    seller_approval: { approved: false, approved_at: null },
    history: [],
  };
  return { ...record, ...overrides, part_details: { ...record.part_details, ...(overrides.part_details || {}) } };
}

export function gapWhere(gaps, field, type) {
  return gaps.find((g) => g.field === field && g.type === type);
}
