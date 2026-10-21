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

  it('1.1.0: reset keeps the profile and the CV (user data), and an invalid CV falls back to the default', async () => {
    const d = fresh();
    await saveSetting(d, 'theme', 'light');
    await saveSetting(d, 'userName', 'منى');
    await saveSetting(d, 'cv', { ...DEFAULT_SETTINGS.cv, phone: '0590000000' });
    await resetSettings(d);
    const s = await loadSettings(d);
    expect(s.theme).toBe('dark');
    expect(s.userName).toBe('منى');
    expect(s.cv.phone).toBe('0590000000');
    await expect(saveSetting(d, 'cv', { name: 1 } as never)).rejects.toThrow();
    await d.settings.put({ key: 'cv', value: { broken: true }, updatedAt: 0 });
    expect((await loadSettings(d)).cv).toEqual(DEFAULT_SETTINGS.cv);
  });

  it('1.1.0: the greeting name is never a built-in name', async () => {
    const { displayName } = await import('../../src/db/settings');
    expect(displayName(DEFAULT_SETTINGS)).toBe('');
    expect(displayName({ userName: ' سارة ', ownerFullName: 'قديم' })).toBe('سارة');
    expect(displayName({ userName: '', ownerFullName: 'اسم من إصدار سابق' })).toBe('اسم من إصدار سابق');
  });
});
