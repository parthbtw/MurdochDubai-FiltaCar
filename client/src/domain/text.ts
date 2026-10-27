export const isArabic = (text: string): boolean => /\p{Script=Arabic}/u.test(text)
export const displayValue = (value: unknown): string => value == null || value === '' ? 'Not recorded' : String(value)
