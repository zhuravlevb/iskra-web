/**
 * Файл с устройства → `OutgoingFile`: тип, размеры, длительность и миниатюра считаются
 * здесь, до отправки, — чтобы у получателя место под картинку было отведено до того, как
 * она загрузилась, а в ленте было что показать, пока оригинал в пути.
 *
 * Ничего не отправляет: путь наверх один — `core/media/upload.ts`.
 */
import type { OutgoingFile, OutgoingKind } from '../../core/media/upload';

/** Длинная сторона миниатюры, px. */
const THUMBNAIL_SIDE = 800;
/** Меньше этого миниатюра не нужна: оригинал и есть превью. */
const THUMBNAIL_WORTH_BYTES = 200 * 1024;
const METADATA_TIMEOUT_MS = 5000;

/**
 * Что это для Matrix. SVG — не `m.image`: многие клиенты его не покажут, а некоторые
 * покажут с сюрпризом; уходит файлом.
 */
export function kindOf(type: string): OutgoingKind {
  if (/^image\/(jpeg|png|gif|webp|avif|bmp)$/.test(type)) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'file';
}

export async function prepareFile(file: File): Promise<OutgoingFile> {
  const mimetype = file.type || 'application/octet-stream';
  const kind = kindOf(mimetype);
  const base: OutgoingFile = { blob: file, name: file.name || nameFor(mimetype), mimetype, kind };
  try {
    if (kind === 'image') return { ...base, ...(await imageInfo(file)) };
    if (kind === 'video') return { ...base, ...(await videoInfo(file)) };
    if (kind === 'audio') return { ...base, ...(await audioInfo(file)) };
  } catch {
    // Не разобрали — отправим без размеров: получатель просто не узнает их заранее.
  }
  return base;
}

/** Вставка из буфера приходит без имени: «image.png» — лучше, чем ничего. */
function nameFor(type: string): string {
  const ext = type.split('/')[1]?.split('+')[0] ?? 'bin';
  return `${type.split('/')[0] ?? 'file'}.${ext}`;
}

async function imageInfo(file: File): Promise<Partial<OutgoingFile>> {
  const image = await decodeImage(file);
  try {
    const { width, height } = image;
    const info: Partial<OutgoingFile> = { width, height };
    if (file.type !== 'image/gif' && (file.size > THUMBNAIL_WORTH_BYTES || Math.max(width, height) > THUMBNAIL_SIDE * 2)) {
      const thumbnail = await drawThumbnail(image.source, width, height);
      if (thumbnail) info.thumbnail = thumbnail;
    }
    return info;
  } finally {
    image.release();
  }
}

/** `createImageBitmap`, а где он не справился (старый Safari) — `<img>`. */
async function decodeImage(file: Blob): Promise<{ source: CanvasImageSource; width: number; height: number; release: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // ниже — запасной путь
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.src = url;
  await img.decode();
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) };
}

function drawThumbnail(source: CanvasImageSource, width: number, height: number): Promise<OutgoingFile['thumbnail']> {
  const scale = Math.min(1, THUMBNAIL_SIDE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d')?.drawImage(source, 0, 0, w, h);
  return new Promise((resolve) =>
    canvas.toBlob((blob) => resolve(blob ? { blob, width: w, height: h, mimetype: 'image/jpeg' } : undefined), 'image/jpeg', 0.8),
  );
}

/** Размеры, длительность и кадр для миниатюры — у `<video>` без звука и без показа. */
async function videoInfo(file: File): Promise<Partial<OutgoingFile>> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    await once(video, 'loadedmetadata');
    const info: Partial<OutgoingFile> = {
      width: video.videoWidth,
      height: video.videoHeight,
      ...(Number.isFinite(video.duration) ? { duration: video.duration * 1000 } : {}),
    };
    // Первый кадр бывает чёрным — берём чуть дальше начала.
    video.currentTime = Math.min(0.1, (video.duration || 1) / 2);
    await once(video, 'seeked');
    const thumbnail = await drawThumbnail(video, video.videoWidth, video.videoHeight);
    if (thumbnail) info.thumbnail = thumbnail;
    return info;
  } finally {
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(url);
  }
}

async function audioInfo(file: File): Promise<Partial<OutgoingFile>> {
  const url = URL.createObjectURL(file);
  const audio = document.createElement('audio');
  audio.preload = 'metadata';
  audio.src = url;
  try {
    await once(audio, 'loadedmetadata');
    return Number.isFinite(audio.duration) ? { duration: audio.duration * 1000 } : {};
  } finally {
    URL.revokeObjectURL(url);
  }
}

function once(element: HTMLMediaElement, event: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), METADATA_TIMEOUT_MS);
    element.addEventListener(event, () => (clearTimeout(timer), resolve()), { once: true });
    element.addEventListener('error', () => (clearTimeout(timer), reject(new Error('media error'))), { once: true });
  });
}
