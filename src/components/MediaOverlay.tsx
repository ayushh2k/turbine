import { useState } from 'react';
import './MediaOverlay.css';

// Supported video extensions
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)$/i;
// Unsupported media formats that get a placeholder
const UNSUPPORTED_EXTENSIONS = /\.(bmp|tiff?|svg|avif|heic|heif|mkv|avi|flv|wmv)$/i;

export interface MediaItem {
  id: string;
  type: 'video' | 'unsupported';
  url: string;
  formatName: string;
  fileSize: string | null;
}

/**
 * Parse a terminal line for media URLs.
 * Returns a MediaItem if a video or unsupported media format is detected.
 */
export function detectMediaUrl(line: string): MediaItem | null {
  // Match file:// or http(s):// URLs
  const urlMatch = line.match(/((?:https?|file):\/\/\S+)/i);
  if (!urlMatch) return null;

  const url = urlMatch[1];

  if (VIDEO_EXTENSIONS.test(url)) {
    const ext = url.match(VIDEO_EXTENSIONS)?.[0] ?? '';
    return {
      id: crypto.randomUUID(),
      type: 'video',
      url,
      formatName: ext.slice(1).toUpperCase(),
      fileSize: extractFileSize(line),
    };
  }

  if (UNSUPPORTED_EXTENSIONS.test(url)) {
    const ext = url.match(UNSUPPORTED_EXTENSIONS)?.[0] ?? '';
    return {
      id: crypto.randomUUID(),
      type: 'unsupported',
      url,
      formatName: ext.slice(1).toUpperCase(),
      fileSize: extractFileSize(line),
    };
  }

  return null;
}

/** Try to extract a file size mention from surrounding text (e.g. "2.4 MB") */
function extractFileSize(text: string): string | null {
  const sizeMatch = text.match(/(\d+(?:\.\d+)?\s*(?:B|KB|MB|GB|TB))/i);
  return sizeMatch ? sizeMatch[1] : null;
}

interface MediaOverlayProps {
  items: MediaItem[];
  onDismiss: (id: string) => void;
}

export function MediaOverlay({ items, onDismiss }: MediaOverlayProps) {
  if (items.length === 0) return null;

  return (
    <div className="media-overlay">
      {items.map((item) =>
        item.type === 'video' ? (
          <VideoPlayer key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
        ) : (
          <UnsupportedPlaceholder key={item.id} item={item} onDismiss={() => onDismiss(item.id)} />
        ),
      )}
    </div>
  );
}

function VideoPlayer({ item, onDismiss }: { item: MediaItem; onDismiss: () => void }) {
  const [error, setError] = useState(false);

  if (error) {
    return (
      <UnsupportedPlaceholder
        item={{ ...item, type: 'unsupported' }}
        onDismiss={onDismiss}
      />
    );
  }

  return (
    <div className="media-overlay__video">
      <button className="media-overlay__dismiss" onClick={onDismiss} title="Dismiss">
        &times;
      </button>
      <video
        src={item.url}
        controls
        preload="metadata"
        onError={() => setError(true)}
        className="media-overlay__video-element"
      />
      <div className="media-overlay__label">
        {item.formatName}{item.fileSize ? ` \u2014 ${item.fileSize}` : ''}
      </div>
    </div>
  );
}

function UnsupportedPlaceholder({ item, onDismiss }: { item: MediaItem; onDismiss: () => void }) {
  return (
    <div className="media-overlay__placeholder">
      <button className="media-overlay__dismiss" onClick={onDismiss} title="Dismiss">
        &times;
      </button>
      <div className="media-overlay__placeholder-icon">&#128247;</div>
      <div className="media-overlay__placeholder-text">
        <strong>{item.formatName}</strong> format not supported
      </div>
      {item.fileSize && (
        <div className="media-overlay__placeholder-size">{item.fileSize}</div>
      )}
    </div>
  );
}
