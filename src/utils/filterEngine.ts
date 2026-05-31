import type { LogEntry, FilterState } from '../types';

/**
 * Validates whether a string is a valid JavaScript regular expression.
 * Returns { valid: true } if the pattern compiles, or { valid: false, error }
 * with the error message if it does not.
 */
export function validateRegex(pattern: string): { valid: boolean; error?: string } {
  try {
    new RegExp(pattern);
    return { valid: true };
  } catch (e) {
    return {
      valid: false,
      error: e instanceof Error ? e.message : 'Invalid regular expression',
    };
  }
}

/**
 * Determines whether a single LogEntry passes all active filter criteria.
 *
 * AND logic:
 * - If regex is set (non-null and non-empty), the entry's message must match it
 * - If levels set is non-empty, the entry's level must be in the set
 * - If sources set is non-empty, the entry's sourceId must be in the set
 *
 * When all criteria are null/empty, the entry always matches.
 */
export function matchesFilter(entry: LogEntry, filters: FilterState): boolean {
  // Regex filter: skip if null or empty string
  if (filters.regex != null && filters.regex !== '') {
    try {
      const re = new RegExp(filters.regex);
      if (!re.test(entry.message)) {
        return false;
      }
    } catch {
      // Invalid regex — skip regex filtering (show entry)
    }
  }

  // Level filter: skip if empty set (show all levels)
  if (filters.levels.size > 0) {
    if (!filters.levels.has(entry.level)) {
      return false;
    }
  }

  // Source filter: skip if empty set (show all sources)
  if (filters.sources.size > 0) {
    if (!filters.sources.has(entry.sourceId)) {
      return false;
    }
  }

  return true;
}

/**
 * Applies all filter criteria to an array of LogEntry objects.
 * Returns only entries that pass all active filters.
 */
export function applyFilters(entries: LogEntry[], filters: FilterState): LogEntry[] {
  return entries.filter((entry) => matchesFilter(entry, filters));
}
