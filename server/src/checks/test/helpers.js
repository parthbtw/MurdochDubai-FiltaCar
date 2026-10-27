// Shared helpers for the checks tests. Records use the CONTRACT.md shape.

// Deep merge for nested overrides (objects only; arrays are replaced).
function merge(target, overrides) {
  const out = { ...target };
  for (const [key, value] of Object.entries(overrides || {})) {
    out[key] =
      value && typeof value === "object" && !Array.isArray(value) && out[key] && typeof out[key] === "object" && !Array.isArray(out[key])
        ? merge(out[key], value)
        : value;
  }
  return out;
}

export function baseRecord(overrides = {}) {
  const record = {
    item_id: "TEST-001",
    seller_id: "S-1",
    original_title_ar: "",
    original_title_en: "Right side door mirror, Toyota Land Cruiser 2017, used",
    part_details: {
      category: "Exterior",
      subcategory: "Side View Mirror",
      brand: "Unbranded",
      part_number: {
        extracted_value: "SBM-0001-T17",
        extraction_method: "spreadsheet",
        requires_manual_verification: false,
      },
      placement: "Right",
    },
    condition: {
      state: "Used",
      cosmetic_damage: [],
      testing_status: "Visual inspection only",
    },
    readiness_status: "draft",
    actions_required: [],
    storage_location: 'Rack TEST, Bay 1',
    weight_kg: 2.4,
    packaged_dimensions_cm: { length: 40, width: 26, height: 22 },
    included_components: ['mirror glass', 'housing'],
    donor_vehicle: { make: "Toyota", model: "Land Cruiser", year: 2017, drive_side: "LHD" },
    field_sources: {},
    questions: [],
    gaps_and_conflicts: [],
    photos: ["p1.jpg"],
    notes_ar: "",
    ocr: null,
    draft: null,
    corridor: null,
    seller_approval: { approved: false, approved_at: null },
    history: [],
  };
  return merge(record, overrides);
}

export function gapWhere(gaps, field, type) {
  return gaps.find((g) => g.field === field && g.type === type);
}
