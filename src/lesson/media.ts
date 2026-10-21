import { useEffect, useState } from 'react';
import { db } from '../db/db';
import { getAsset, type NewAsset } from '../db/lessonDocs';
import { formatBytes } from '../db/storage';
import { MEDIA_LIMITS } from './catalog';
import type { Asset, AssetKind } from './types';

export class MediaError extends Error {}

const EXT_MIME: Record<string, string> = {
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  ogv: 'video/ogg',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  txt: 'text/plain',
  csv: 'text/csv',
  zip: 'application/zip',
};

/** Document types a lesson or an assignment may carry (no executables or scripts). */
export const FILE_EXTS = ['pdf', 'doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx', 'txt', 'csv', 'zip', 'jpg', 'jpeg', 'png', 'webp', 'mp3', 'm4a', 'mp4'];

export const ACCEPT: Record<AssetKind, string> = {
  image: 'image/*',
  audio: 'audio/*,.mp3,.m4a,.wav,.ogg,.aac',
  video: 'video/*,.mp4,.webm,.mov,.m4v',
  file: FILE_EXTS.map((e) => `.${e}`).join(','),
};

function mimeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  return EXT_MIME[ext] ?? '';
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Downscales to MEDIA_LIMITS.imageMaxSide and re-encodes as WebP (JPEG/PNG where WebP encoding is unavailable). */
async function prepareImage(file: File, mime: string): Promise<NewAsset & { note?: string }> {
  if (file.size > MEDIA_LIMITS.imageInputBytes)
    throw new MediaError(`حجم الصورة ${formatBytes(file.size)} أكبر من الحد المسموح (${formatBytes(MEDIA_LIMITS.imageInputBytes)}).`);
  // Animated GIFs and vector SVGs are stored untouched.
  if (mime === 'image/gif' || mime === 'image/svg+xml') {
    return { kind: 'image', mime, name: file.name, data: await file.arrayBuffer() };
  }
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new MediaError('تعذّرت قراءة الصورة. جرّب صيغة JPG أو PNG أو WebP.');
  }
  const scale = Math.min(1, MEDIA_LIMITS.imageMaxSide / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new MediaError('تعذّرت معالجة الصورة على هذا الجهاز.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  let out = await toBlob(canvas, 'image/webp', 0.86);
  if (!out || out.type !== 'image/webp') out = await toBlob(canvas, mime === 'image/png' ? 'image/png' : 'image/jpeg', 0.88);
  if (!out) throw new MediaError('تعذّر حفظ الصورة.');
  // Keep the original if re-encoding did not make it smaller and no resize was needed.
  if (scale === 1 && out.size >= file.size && ['image/jpeg', 'image/png', 'image/webp'].includes(mime)) {
    return { kind: 'image', mime, name: file.name, data: await file.arrayBuffer(), width, height };
  }
  return { kind: 'image', mime: out.type, name: file.name, data: await out.arrayBuffer(), width, height };
}

/** Validates and reads a picked file so it can be stored in the local database. */
export async function prepareFile(file: File, kind: AssetKind): Promise<NewAsset & { note?: string }> {
  const mime = mimeOf(file);
  if (kind === 'file') return prepareDocument(file);
  if (!mime.startsWith(`${kind}/`)) {
    const label = kind === 'image' ? 'صورة' : kind === 'audio' ? 'ملفًا صوتيًا' : 'فيديو';
    throw new MediaError(`الملف «${file.name}» ليس ${label}.`);
  }
  if (kind === 'image') return prepareImage(file, mime);
  const limit = kind === 'audio' ? MEDIA_LIMITS.audioBytes : MEDIA_LIMITS.videoBytes;
  if (file.size > limit) throw new MediaError(`حجم الملف ${formatBytes(file.size)} أكبر من الحد المسموح (${formatBytes(limit)}).`);
  const probe = document.createElement(kind as 'audio' | 'video');
  const note = probe.canPlayType(mime) === '' ? 'قد لا يستطيع هذا المتصفح تشغيل هذه الصيغة. الصيغ الأضمن: MP4 (H.264) أو WebM للفيديو، وMP3 أو M4A للصوت.' : undefined;
  return { kind, mime, name: file.name, data: await file.arrayBuffer(), note };
}

/** Checks an attached document by extension and size; it is stored byte-for-byte. */
export async function prepareDocument(file: File, limit: number = MEDIA_LIMITS.fileBytes): Promise<NewAsset & { note?: string }> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (!FILE_EXTS.includes(ext))
    throw new MediaError(`نوع الملف «${file.name}» غير مسموح. المسموح: ${FILE_EXTS.join('، ')}.`);
  if (file.size === 0) throw new MediaError(`الملف «${file.name}» فارغ.`);
  if (file.size > limit) throw new MediaError(`حجم الملف ${formatBytes(file.size)} أكبر من الحد المسموح (${formatBytes(limit)}).`);
  return { kind: 'file', mime: EXT_MIME[ext] ?? file.type ?? 'application/octet-stream', name: file.name, data: await file.arrayBuffer() };
}

export function isQuotaError(e: unknown): boolean {
  const name = (e as { name?: string; inner?: { name?: string } })?.name ?? '';
  const inner = (e as { inner?: { name?: string } })?.inner?.name ?? '';
  return name === 'QuotaExceededError' || inner === 'QuotaExceededError';
}

/** Loads a stored file and exposes it as a temporary blob: URL (revoked on unmount). */
export function useAssetUrl(assetId: string | null | undefined): { url: string | null; asset: Asset | null; state: 'none' | 'loading' | 'ready' | 'missing' } {
  const [out, setOut] = useState<{ url: string | null; asset: Asset | null; state: 'none' | 'loading' | 'ready' | 'missing' }>({
    url: null,
    asset: null,
    state: assetId ? 'loading' : 'none',
  });
  useEffect(() => {
    if (!assetId) {
      setOut({ url: null, asset: null, state: 'none' });
      return;
    }
    let alive = true;
    let url: string | null = null;
    setOut((o) => ({ ...o, state: 'loading' }));
    getAsset(db, assetId)
      .then((a) => {
        if (!alive) return;
        if (!a) {
          setOut({ url: null, asset: null, state: 'missing' });
          return;
        }
        url = URL.createObjectURL(new Blob([a.data], { type: a.mime }));
        setOut({ url, asset: a, state: 'ready' });
      })
      .catch(() => {
        if (alive) setOut({ url: null, asset: null, state: 'missing' });
      });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [assetId]);
  return out;
}
