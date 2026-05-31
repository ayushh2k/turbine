import type { LogEntry, LogLevel, TimestampFormat } from '../types';

/**
 * Detects the log level from a log line by finding the first recognized
 * keyword (case-insensitive). Returns 'info' as default when no keyword is found.
 *
 * Keywords: ERROR, WARN (also matches WARNING), INFO, DEBUG, TRACE
 */
export function detectLevel(line: string): LogLevel {
  const upper = line.toUpperCase();

  // Find the first occurrence of each keyword
  const keywords: { keyword: string; level: LogLevel }[] = [
    { keyword: 'ERROR', level: 'error' },
    { keyword: 'WARNING', level: 'warn' },
    { keyword: 'WARN', level: 'warn' },
    { keyword: 'INFO', level: 'info' },
    { keyword: 'DEBUG', level: 'debug' },
    { keyword: 'TRACE', level: 'trace' },
  ];

  let earliestIndex = Infinity;
  let detectedLevel: LogLevel = 'info';

  for (const { keyword, level } of keywords) {
    const index = upper.indexOf(keyword);
    if (index !== -1 && index < earliestIndex) {
      earliestIndex = index;
      detectedLevel = level;
    }
  }

  return detectedLevel;
}

// Syslog month abbreviations
const SYSLOG_MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

// ISO 8601 / RFC 3339: 2024-01-15T10:30:45.123Z or 2024-01-15T10:30:45+00:00
const ISO_RFC_REGEX =
  /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/;

// Syslog: Jan 15 10:30:45
const SYSLOG_REGEX =
  /(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}/;

// Unix epoch seconds: a standalone 10-digit number (seconds since 1970)
const EPOCH_REGEX = /(?<!\d)\d{10}(?!\d)/;

/**
 * Extracts a timestamp from a log line. Tries formats in order:
 * 1. ISO 8601 / RFC 3339
 * 2. Syslog (MMM DD HH:MM:SS)
 * 3. Unix epoch seconds
 *
 * Returns the parsed Date and the line with the timestamp portion removed,
 * or null if no recognized timestamp is found.
 */
export function extractTimestamp(
  line: string
): { timestamp: Date; remainingText: string } | null {
  // Try ISO 8601 / RFC 3339
  const isoMatch = line.match(ISO_RFC_REGEX);
  if (isoMatch) {
    const date = new Date(isoMatch[0]);
    if (!isNaN(date.getTime())) {
      const remainingText = removeMatch(line, isoMatch);
      return { timestamp: date, remainingText };
    }
  }

  // Try syslog format
  const syslogMatch = line.match(SYSLOG_REGEX);
  if (syslogMatch) {
    const date = parseSyslogTimestamp(syslogMatch[0]);
    if (date && !isNaN(date.getTime())) {
      const remainingText = removeMatch(line, syslogMatch);
      return { timestamp: date, remainingText };
    }
  }

  // Try Unix epoch seconds
  const epochMatch = line.match(EPOCH_REGEX);
  if (epochMatch) {
    const seconds = parseInt(epochMatch[0], 10);
    const date = new Date(seconds * 1000);
    if (!isNaN(date.getTime())) {
      const remainingText = removeMatch(line, epochMatch);
      return { timestamp: date, remainingText };
    }
  }

  return null;
}

/**
 * Parses a syslog-format timestamp string (e.g., "Jan 15 10:30:45").
 * Uses the current year since syslog format doesn't include one.
 */
function parseSyslogTimestamp(str: string): Date | null {
  const parts = str.split(/\s+/);
  if (parts.length < 3) return null;

  const month = SYSLOG_MONTHS[parts[0]];
  if (month === undefined) return null;

  const day = parseInt(parts[1], 10);
  const timeParts = parts[2].split(':');
  if (timeParts.length < 3) return null;

  const hours = parseInt(timeParts[0], 10);
  const minutes = parseInt(timeParts[1], 10);
  const seconds = parseInt(timeParts[2], 10);

  const now = new Date();
  return new Date(now.getFullYear(), month, day, hours, minutes, seconds);
}

/**
 * Removes the matched timestamp from the line and trims leading/trailing
 * whitespace and common separators from the remaining text.
 */
function removeMatch(line: string, match: RegExpMatchArray): string {
  const start = match.index!;
  const end = start + match[0].length;
  const before = line.slice(0, start);
  const after = line.slice(end);
  const joined = (before + after).trim();
  // Remove leading separators like " - ", " | ", ":"
  return joined.replace(/^[\s\-|:]+/, '').replace(/[\s\-|:]+$/, '');
}

/**
 * Normalizes a Date into a display string based on the specified format.
 *
 * Supported formats:
 * - 'HH:mm:ss.SSS' → e.g., "10:30:45.123"
 * - 'HH:mm:ss'     → e.g., "10:30:45"
 * - 'ISO'          → full ISO 8601 string
 * - 'relative'     → e.g., "2s ago", "5m ago", "3h ago", "1d ago"
 */
export function normalizeTimestamp(date: Date, format: TimestampFormat): string {
  switch (format) {
    case 'HH:mm:ss.SSS': {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      const ms = String(date.getMilliseconds()).padStart(3, '0');
      return `${h}:${m}:${s}.${ms}`;
    }
    case 'HH:mm:ss': {
      const h = String(date.getHours()).padStart(2, '0');
      const m = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${h}:${m}:${s}`;
    }
    case 'ISO':
      return date.toISOString();
    case 'relative': {
      const diffMs = Date.now() - date.getTime();
      const diffSeconds = Math.floor(Math.abs(diffMs) / 1000);

      if (diffSeconds < 60) {
        return `${diffSeconds}s ago`;
      }
      const diffMinutes = Math.floor(diffSeconds / 60);
      if (diffMinutes < 60) {
        return `${diffMinutes}m ago`;
      }
      const diffHours = Math.floor(diffMinutes / 60);
      if (diffHours < 24) {
        return `${diffHours}h ago`;
      }
      const diffDays = Math.floor(diffHours / 24);
      return `${diffDays}d ago`;
    }
  }
}


/**
 * Parses a raw log line into a structured LogEntry object.
 *
 * - Generates a unique ID using crypto.randomUUID()
 * - Detects the log level via detectLevel()
 * - Extracts the timestamp via extractTimestamp(); falls back to receipt time (new Date())
 * - The message field is the remainingText from extractTimestamp, or the full raw line if no timestamp found
 */
export function parseLine(
  raw: string,
  sourceId: string,
  sourceLabel: string,
  sourceColor: string
): LogEntry {
  const id = crypto.randomUUID();
  const level = detectLevel(raw);
  const extracted = extractTimestamp(raw);

  const timestamp = extracted ? extracted.timestamp : new Date();
  const message = extracted ? extracted.remainingText : raw;

  return {
    id,
    sourceId,
    sourceLabel,
    sourceColor,
    timestamp,
    level,
    message,
    rawText: raw,
  };
}
