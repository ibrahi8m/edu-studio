import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { studentKey } from '../quiz/model';

/**
 * Who is using student mode on this device. Only the name is remembered (in this browser's storage);
 * everything the student does — attempts and lesson progress — is stored in the local database under that name.
 * If browser storage is blocked, the name is simply asked again.
 */
const KEY = 'ibrahi8m.student';
const EVENT = 'ibrahi8m-student-change';

export function readStudent(): string {
  try {
    return (localStorage.getItem(KEY) ?? '').trim();
  } catch {
    return '';
  }
}

export function writeStudent(name: string | null): void {
  try {
    if (name && name.trim()) localStorage.setItem(KEY, name.trim().slice(0, 80));
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: the name lives only in this page */
  }
  memory = name?.trim().slice(0, 80) ?? '';
  window.dispatchEvent(new Event(EVENT));
}

let memory = '';

/** The current student's name ('' = nobody chose yet) and a setter shared by every screen. */
export function useStudent(): [string, (name: string | null) => void] {
  const [name, setName] = useState(() => readStudent() || memory);
  useEffect(() => {
    const sync = () => setName(readStudent() || memory);
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return [name, writeStudent];
}

export interface KnownStudent {
  key: string;
  name: string;
  lastAt: number;
}

/** Students who already have attempts or lesson progress on this device (teacher test runs excluded). */
export function useKnownStudents(): KnownStudent[] | undefined {
  return useLiveQuery(async () => {
    const [attempts, progress] = await Promise.all([db.attempts.toArray(), db.progress.toArray()]);
    const m = new Map<string, KnownStudent>();
    const add = (name: string, at: number) => {
      const key = studentKey(name);
      if (!key) return;
      const cur = m.get(key);
      if (!cur || at > cur.lastAt) m.set(key, { key, name, lastAt: at });
    };
    for (const a of attempts) if (!a.preview) add(a.studentName, a.submittedAt ?? a.startedAt);
    for (const p of progress) add(p.studentName, p.updatedAt);
    return [...m.values()].sort((a, b) => b.lastAt - a.lastAt);
  }, []);
}
