import { useEffect, useMemo, useState, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { getMediaFormatLabel, getMediaKind } from '../../utils/mediaFiles';
import './MediaViewer.css';

interface MediaViewerProps {
  filePath: string;
  onFocus?: () => void;
}

function getMimeType(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    bmp: 'image/bmp',
    avif: 'image/avif',
    mp4: 'video/mp4',
    webm: 'video/webm',
    ogg: 'video/ogg',
    mov: 'video/quicktime',
  };
  return map[ext] ?? 'application/octet-stream';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaViewer({ filePath, onFocus }: MediaViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [fileSize, setFileSize] = useState<number | null>(null);
  const [dimensions, setDimensions] = useState<{ w: number; h: number } | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  const mediaKind = useMemo(() => getMediaKind(filePath), [filePath]);
  const fileName = useMemo(() => filePath.replace(/\\/g, '/').split('/').pop() ?? filePath, [filePath]);
  const formatLabel = useMemo(() => getMediaFormatLabel(filePath), [filePath]);

  useEffect(() => {
    setLoadError(false);
    setBlobUrl(null);
    setDimensions(null);
    setFileSize(null);

    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    if (mediaKind === 'unsupported') return;

    invoke<number[]>('read_binary_file', { path: filePath })
      .then((bytes) => {
        setFileSize(bytes.length);
        const blob = new Blob([new Uint8Array(bytes)], { type: getMimeType(filePath) });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      })
      .catch(() => setLoadError(true));

    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
        blobUrlRef.current = null;
      }
    };
  }, [filePath, mediaKind]);

  const effectiveKind = loadError ? 'unsupported' : mediaKind;

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ w: img.naturalWidth, h: img.naturalHeight });
  };

  return (
    <div className="media-viewer" onClick={onFocus}>
      <div className="media-viewer__canvas">
        {effectiveKind === 'image' && blobUrl && (
          <img
            src={blobUrl}
            alt={fileName}
            className="media-viewer__image"
            onLoad={handleImageLoad}
            onError={() => setLoadError(true)}
          />
        )}
        {effectiveKind === 'image' && !blobUrl && !loadError && (
          <div className="media-viewer__loading">Loading...</div>
        )}

        {effectiveKind === 'video' && blobUrl && (
          <video
            src={blobUrl}
            className="media-viewer__video"
            controls
            preload="metadata"
            onError={() => setLoadError(true)}
          />
        )}

        {effectiveKind === 'unsupported' && (
          <div className="media-viewer__placeholder">
            <div className="media-viewer__placeholder-title">
              {formatLabel} preview not supported
            </div>
            <div className="media-viewer__placeholder-copy">
              No built-in preview for this format.
            </div>
          </div>
        )}
      </div>

      <div className="media-viewer__status-bar">
        <span className="media-viewer__status-name" title={filePath}>{fileName}</span>
        <span className="media-viewer__status-meta">
          {dimensions && `${dimensions.w} × ${dimensions.h}`}
          {dimensions && fileSize != null && ' · '}
          {fileSize != null && formatBytes(fileSize)}
        </span>
      </div>
    </div>
  );
}
