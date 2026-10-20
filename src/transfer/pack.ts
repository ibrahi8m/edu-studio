import { strToU8, zipSync, type Zippable } from 'fflate';
import { SCHEMA_VERSION, type EduDB } from '../db/db';
import type { Asset } from '../lesson/types';
import { LIBRARY_OWNER } from '../library/types';
import { FORMAT, FORMAT_VERSION, type AssetMeta, type Manifest, type PackageData, type PackageKind } from './format';

/** SHA-256 of bytes as hex (Web Crypto: available offline in the browser, Electron and Node). */
export async function sha256(bytes: Uint8Array | ArrayBuffer): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', (bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)) as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const EXT: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/wav': 'wav', 'audio/ogg': 'ogg', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

export interface Collected {
  data: Omit<PackageData, 'assets'>;
  assets: Asset[];
}

/** One project with everything that belongs to it. Results (attempts, progress) only on request. */
export async function collectProject(database: EduDB, projectId: string, opts: { includeResults: boolean }): Promise<Collected> {
  return database.transaction('r', [database.projects, database.lessons, database.lessonDocs, database.assets, database.quizzes, database.attempts, database.progress, database.designs], async () => {
    const project = await database.projects.get(projectId);
    if (!project) throw new Error('المشروع غير موجود.');
    const lessons = await database.lessons.where('projectId').equals(projectId).toArray();
    const ids = lessons.map((l) => l.id);
    const lessonDocs = (await database.lessonDocs.bulkGet(ids)).filter((d): d is NonNullable<typeof d> => !!d);
    const assets = ids.length ? await database.assets.where('lessonId').anyOf(ids).toArray() : [];
    const quizzes = await database.quizzes.where('projectId').equals(projectId).toArray();
    const quizIds = quizzes.map((q) => q.id);
    const attempts = opts.includeResults && quizIds.length ? (await database.attempts.where('quizId').anyOf(quizIds).toArray()).filter((a) => !a.preview) : [];
    const progress = opts.includeResults ? await database.progress.where('projectId').equals(projectId).toArray() : [];
    const designs = await database.designs.where('projectId').equals(projectId).toArray();
    return { data: { projects: [project], lessons, lessonDocs, quizzes, attempts, progress, designs, library: [], settings: [] }, assets };
  });
}

/** Everything on this device: every table, all media, the library and the settings. */
export async function collectBackup(database: EduDB): Promise<Collected> {
  return database.transaction('r', [database.projects, database.lessons, database.lessonDocs, database.assets, database.quizzes, database.attempts, database.progress, database.designs, database.library, database.settings], async () => {
    const [projects, lessons, lessonDocs, assets, quizzes, attempts, progress, designs, library, settings] = await Promise.all([
      database.projects.toArray(),
      database.lessons.toArray(),
      database.lessonDocs.toArray(),
      database.assets.toArray(),
      database.quizzes.toArray(),
      database.attempts.toArray(),
      database.progress.toArray(),
      database.designs.toArray(),
      database.library.toArray(),
      database.settings.toArray(),
    ]);
    // Only media that still belong to something (a lesson or the library) are kept.
    const owners = new Set([...lessons.map((l) => l.id), LIBRARY_OWNER]);
    return {
      data: { projects, lessons, lessonDocs, quizzes, attempts: attempts.filter((a) => !a.preview), progress, designs, library, settings },
      assets: assets.filter((a) => owners.has(a.lessonId)),
    };
  });
}

/** Builds the .ibm file (ZIP). Media are stored without recompression (they are already compressed). */
export async function buildPackage(c: Collected, kind: PackageKind, info: { title: string; appVersion: string; includesResults: boolean; now?: Date }): Promise<{ bytes: Uint8Array; manifest: Manifest }> {
  const files: Zippable = {};
  const metas: AssetMeta[] = [];
  for (const a of c.assets) {
    const bytes = new Uint8Array(a.data);
    const path = `assets/${a.id}.${EXT[a.mime] ?? 'bin'}`;
    const { data: _omit, ...meta } = a;
    void _omit;
    metas.push({ ...meta, path, sha256: await sha256(bytes) });
    files[path] = [bytes, { level: 0 }];
  }
  const data: PackageData = { ...c.data, assets: metas };
  const json = strToU8(JSON.stringify(data));
  const manifest: Manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    kind,
    schemaVersion: SCHEMA_VERSION,
    appVersion: info.appVersion,
    exportedAt: (info.now ?? new Date()).toISOString(),
    title: info.title,
    counts: {
      projects: data.projects.length,
      lessons: data.lessons.length,
      quizzes: data.quizzes.length,
      attempts: data.attempts.length,
      progress: data.progress.length,
      designs: data.designs.length,
      library: data.library.length,
      assets: metas.length,
      assetBytes: metas.reduce((s, m) => s + m.size, 0),
    },
    dataSha256: await sha256(json),
    includesResults: info.includesResults,
  };
  files['manifest.json'] = [strToU8(JSON.stringify(manifest, null, 2)), { level: 6 }];
  files['data.json'] = [json, { level: 6 }];
  // Manifest first: tools that peek at a ZIP see what it is right away.
  const ordered: Zippable = { 'manifest.json': files['manifest.json'], 'data.json': files['data.json'] };
  for (const k of Object.keys(files)) if (!(k in ordered)) ordered[k] = files[k];
  return { bytes: zipSync(ordered), manifest };
}

/** File name for downloads: Arabic kept, characters invalid on Windows removed. */
export function packageFileName(base: string, date = new Date()): string {
  const day = date.toISOString().slice(0, 10);
  const clean = base.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'IBRAHI8M';
  return `${clean} ${day}.ibm`;
}
