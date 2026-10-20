import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { MAX_FILE_BYTES, TransferError, type Manifest, type Package } from './format';
import { buildPackage, collectBackup, collectProject, packageFileName } from './pack';
import { readPackage } from './read';

const LAST_BACKUP = 'lastBackupAt';
/** The plan: remind after 7 days without a backup. */
export const BACKUP_REMINDER_DAYS = 7;

export async function exportProjectFile(projectId: string, includeResults: boolean): Promise<{ blob: Blob; name: string; manifest: Manifest }> {
  const project = await db.projects.get(projectId);
  if (!project) throw new Error('المشروع غير موجود.');
  const { bytes, manifest } = await buildPackage(await collectProject(db, projectId, { includeResults }), 'project', { title: project.title, appVersion: __APP_VERSION__, includesResults: includeResults });
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name: packageFileName(project.title), manifest };
}

export async function exportBackupFile(): Promise<{ blob: Blob; name: string; manifest: Manifest }> {
  const { bytes, manifest } = await buildPackage(await collectBackup(db), 'backup', { title: 'نسخة احتياطية كاملة', appVersion: __APP_VERSION__, includesResults: true });
  await db.meta.put({ key: LAST_BACKUP, value: Date.now() });
  return { blob: new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), name: packageFileName('IBRAHI8M نسخة احتياطية'), manifest };
}

/** Time of the last full backup made on this device (null = never). */
export function useLastBackup(): number | null | undefined {
  return useLiveQuery(async () => {
    const row = await db.meta.get(LAST_BACKUP);
    return typeof row?.value === 'number' ? row.value : null;
  }, []);
}

/** Whether to remind: there is something to lose and no backup for 7 days. */
export function backupDue(last: number | null | undefined, hasData: boolean, now = Date.now()): boolean {
  if (last === undefined || !hasData) return false;
  return last === null || now - last > BACKUP_REMINDER_DAYS * 86_400_000;
}

/** Reads a picked file: size checked before reading it into memory. */
export async function openPackageFile(file: File): Promise<Package> {
  if (file.size > MAX_FILE_BYTES) throw new TransferError('too-large', `الملف (${Math.round(file.size / 1024 / 1024)} م.ب) أكبر من الحد المسموح (${Math.round(MAX_FILE_BYTES / 1024 / 1024)} م.ب).`);
  if (file.size === 0) throw new TransferError('empty', 'الملف فارغ.');
  return readPackage(new Uint8Array(await file.arrayBuffer()));
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
