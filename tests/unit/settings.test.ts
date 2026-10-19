import { describe, expect, it } from 'vitest';
import { EduDB } from '../../src/db/db';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSetting } from '../../src/db/settings';

const fresh = () => new EduDB(`test-${Math.random()}`);

describe('local settings store', () => {
  it('returns defaults on an empty database', async () => {
    expect(await loadSettings(fresh())).toEqual(DEFAULT_SETTINGS);
  });

  it('persists values across closing and reopening the database', async () => {
    const name = `persist-${Math.random()}`;
    const a = new EduDB(name);
    await saveSetting(a, 'theme', 'light');
    await saveSetting(a, 'fontScale', 1.3);
    await saveSetting(a, 'ownerFullName', 'إبراهيم');
    a.close();
    const b = new EduDB(name);
    const s = await loadSettings(b);
    expect(s.theme).toBe('light');
    expect(s.fontScale).toBe(1.3);
    expect(s.ownerFullName).toBe('إبراهيم');
  });

  it('rejects invalid values instead of storing them', async () => {
    const d = fresh();
    await expect(saveSetting(d, 'theme', 'neon' as never)).rejects.toThrow();
    await expect(saveSetting(d, 'fontScale', 2 as never)).rejects.toThrow();
    expect((await loadSettings(d)).theme).toBe('dark');
  });

  it('ignores corrupted or unknown stored rows', async () => {
    const d = fresh();
    await d.settings.bulkPut([
      { key: 'theme', value: 42, updatedAt: 0 },
      { key: 'unknownKey', value: 'x', updatedAt: 0 },
    ]);
    const s = await loadSettings(d);
    expect(s.theme).toBe('dark');
    expect('unknownKey' in s).toBe(false);
  });

  it('reset clears all saved settings', async () => {
    const d = fresh();
    await saveSetting(d, 'theme', 'light');
    await resetSettings(d);
    expect(await loadSettings(d)).toEqual(DEFAULT_SETTINGS);
  });
});
