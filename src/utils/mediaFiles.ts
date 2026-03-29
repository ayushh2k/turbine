const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i;
const VIDEO_EXTENSIONS = /\.(mp4|webm|ogg|mov)$/i;
const MEDIA_EXTENSIONS = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?|mp4|webm|ogg|mov)$/i;

export type MediaKind = 'image' | 'video' | 'unsupported';

export function isMediaFilePath(path: string): boolean {
  return MEDIA_EXTENSIONS.test(path);
}

export function getPaneTypeForPath(path: string): 'code_viewer' | 'media_viewer' {
  return isMediaFilePath(path) ? 'media_viewer' : 'code_viewer';
}

export function getMediaKind(path: string): MediaKind {
  if (IMAGE_EXTENSIONS.test(path)) {
    return 'image';
  }

  if (VIDEO_EXTENSIONS.test(path)) {
    return 'video';
  }

  return 'unsupported';
}

export function getMediaFormatLabel(path: string): string {
  const extension = path.match(/\.([a-z0-9]+)(?:[?#].*)?$/i)?.[1];
  return extension ? extension.toUpperCase() : 'MEDIA';
}
