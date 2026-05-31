import { useCallback } from 'react';
import type { LogEntry, TimestampFormat } from '../../../types';
import { normalizeTimestamp } from '../../../utils/logParser';

interface LogEntryRowProps {
  entry: LogEntry;
  isExpanded: boolean;
  onToggle: () => void;
  timestampFormat: TimestampFormat;
}

/**
 * Truncates a message to 200 characters for collapsed view.
 */
function truncateMessage(message: string): string {
  if (message.length <= 200) return message;
  return message.slice(0, 200) + '…';
}

export function LogEntryRow({ entry, isExpanded, onToggle, timestampFormat }: LogEntryRowProps) {
  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      navigator.clipboard.writeText(entry.rawText).catch(() => {
        // Fallback: select text if clipboard fails
      });
    },
    [entry.rawText],
  );

  const formattedTimestamp = normalizeTimestamp(entry.timestamp, timestampFormat);

  const sourceBadgeStyle = {
    backgroundColor: entry.sourceColor ? `${entry.sourceColor}20` : 'rgba(255,255,255,0.06)',
    color: entry.sourceColor || 'var(--color-fg-muted)',
  };

  if (isExpanded) {
    return (
      <div className="log-entry-row log-entry-row--expanded" onClick={onToggle}>
        <div className="log-entry-row__header">
          <span className="log-entry-row__source-badge" style={sourceBadgeStyle}>
            {entry.sourceLabel}
          </span>
          <span className="log-entry-row__timestamp">{formattedTimestamp}</span>
          <span className={`log-entry-row__level-badge log-entry-row__level-badge--${entry.level}`}>
            {entry.level}
          </span>
          <span className="log-entry-row__message">{entry.message}</span>
        </div>
        <div className="log-entry-row__expanded-content">
          {entry.rawText}
          <button
            className="log-entry-row__copy-btn"
            onClick={handleCopy}
            title="Copy to clipboard"
            aria-label="Copy log entry to clipboard"
          >
            Copy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="log-entry-row" onClick={onToggle}>
      <span className="log-entry-row__source-badge" style={sourceBadgeStyle}>
        {entry.sourceLabel}
      </span>
      <span className="log-entry-row__timestamp">{formattedTimestamp}</span>
      <span className={`log-entry-row__level-badge log-entry-row__level-badge--${entry.level}`}>
        {entry.level}
      </span>
      <span className="log-entry-row__message">{truncateMessage(entry.message)}</span>
    </div>
  );
}
