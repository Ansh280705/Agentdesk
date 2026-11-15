/**
 * Build an OR-ed tsquery string from free-text input.
 * Keeps only alphanumeric terms so the output is always valid tsquery syntax.
 */
export function toOrTsQuery(input: string): string {
  return input
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 12)
    .join(' | ');
}
