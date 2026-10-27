export const positiveNumber = value => typeof value === 'number' && Number.isFinite(value) && value > 0;

export const hasDimensions = record => ['length', 'width', 'height']
  .every(key => positiveNumber(record.packaged_dimensions_cm?.[key]));

export const hasComponents = record => Array.isArray(record.included_components) &&
  record.included_components.length > 0 && record.included_components.every(value => typeof value === 'string' && value.trim());
