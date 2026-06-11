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
 * Builds a predicate applying all active filter criteria (AND logic).
 * The regex is compiled once here — compiling it per entry dominates the cost
 * of filtering large buffers.
 */
export function buildFilterPredicate(filters: FilterState): (entry: LogEntry) => boolean {
  let re: RegExp | null = null;
  if (filters.regex != null && filters.regex !== '') {
    try {
      re = new RegExp(filters.regex);
    } catch {
      // Invalid regex — skip regex filtering (show entry)
    }
  }
  const { levels, sources } = filters;

  return (entry: LogEntry): boolean => {
    if (re && !re.test(entry.message)) return false;
    if (levels.size > 0 && !levels.has(entry.level)) return false;
    if (sources.size > 0 && !sources.has(entry.sourceId)) return false;
    return true;
  };
}

/**
 * Determines whether a single LogEntry passes all active filter criteria.
 */
export function matchesFilter(entry: LogEntry, filters: FilterState): boolean {
  return buildFilterPredicate(filters)(entry);
}

/**
 * Applies all filter criteria to an array of LogEntry objects.
 * Returns only entries that pass all active filters.
 */
export function applyFilters(entries: LogEntry[], filters: FilterState): LogEntry[] {
  return entries.filter(buildFilterPredicate(filters));
}
