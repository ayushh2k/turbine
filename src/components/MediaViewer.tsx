import { useEffect, useMemo, useState } from 'react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getMediaFormatLabel, getMediaKind } from '../utils/mediaFiles';
import './MediaViewer.css';

interface MediaViewerProps {
  filePath: string;
  onFocus?: () => void;
}

function resolveMediaSource(filePath: string): string {
  if (/^(https?|file|asset):\/\//i.test(filePath)) {
    return filePath;
  }

  return convertFileSrc(filePath);
}

export function MediaViewer({ filePath, onFocus }: MediaViewerProps) {
  const [loadError, setLoadError] = useState(false);
  const mediaKind = useMemo(() => getMediaKind(filePath), [filePath]);
  const mediaSource = useMemo(() => resolveMediaSource(filePath), [filePath]);
  const fileName = useMemo(() => filePath.replace(/\\/g, '/').split('/').pop() ?? filePath, [filePath]);
  const formatLabel = useMemo(() => getMediaFormatLabel(filePath), [filePath]);

  useEffect(() => {
    setLoadError(false);
  }, [filePath]);

  const effectiveKind = loadError ? 'unsupported' : mediaKind;

  return (
    <div className="media-viewer" onClick={onFocus}>
      <div className="media-viewer__header">
        <div className="media-viewer__eyebrow">{effectiveKind === 'video' ? 'Video' : effectiveKind === 'image' ? 'Image' : 'Media'}</div>
        <div className="media-viewer__title" title={filePath}>{fileName}</div>
        <div className="media-viewer__path" title={filePath}>{filePath}</div>
      </div>

      <div className="media-viewer__content">
        {effectiveKind === 'image' && (
          <img
            src={mediaSource}
            alt={fileName}
            className="media-viewer__image"
            onError={() => setLoadError(true)}
          />
        )}

        {effectiveKind === 'video' && (
          <video
            src={mediaSource}
            className="media-viewer__video"
            controls
            preload="metadata"
            onError={() => setLoadError(true)}
          />
        )}

        {effectiveKind === 'unsupported' && (
          <div className="media-viewer__placeholder">
            <div className="media-viewer__placeholder-icon">&#128247;</div>
            <div className="media-viewer__placeholder-title">
              {formatLabel} preview not supported
            </div>
            <div className="media-viewer__placeholder-copy">
              Turbine can keep this file in a media pane, but there is no built-in preview for this format yet.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
