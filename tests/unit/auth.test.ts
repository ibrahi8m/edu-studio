import { describe, expect, it } from 'vitest';
import { canAccess, homeFor } from '../../src/auth/types';
import { canEditProject, canSeeProject } from '../../src/auth/access';
import { checkPassword, checkUsername, hashPassword } from '../../src/auth/local';

const admin = { id: 'a', login: 'a', displayName: 'A', role: 'admin' as const, mode: 'local' as const };
const teacher = { ...admin, id: 't', role: 'teacher' as const };
const student = { ...admin, id: 's', role: 'student' as const, learnerName: 'سامي' };

describe('1.5.0 roles', () => {
  it('route rules per role', () => {
    for (const p of ['/', '/users', '/backup', '/settings', '/projects/1', '/me', '/learn']) expect(canAccess('admin', p), p).toBe(true);
    for (const p of ['/users', '/backup', '/settings']) expect(canAccess('teacher', p), p).toBe(false);
    for (const p of ['/', '/projects', '/quizzes/x', '/results', '/ai-studio', '/me', '/learn', '/account']) expect(canAccess('teacher', p), p).toBe(true);
    for (const p of ['/', '/projects', '/results', '/me', '/users', '/ai-studio', '/backup']) expect(canAccess('student', p), p).toBe(false);
    for (const p of ['/learn', '/learn/lesson/1', '/take/q', '/account', '/about']) expect(canAccess('student', p), p).toBe(true);
    expect(homeFor('student')).toBe('/learn');
    expect(homeFor('teacher')).toBe('/');
  });
  it('content visibility and editing', () => {
    const mine = { ownerId: 't', published: true };
    const adminOld = { published: true }; // before 1.5.0: no owner = the admin's
    const draft = { ownerId: 'a', published: false };
    expect(canSeeProject(mine, teacher)).toBe(true);
    expect(canSeeProject(adminOld, teacher)).toBe(false);
    expect(canSeeProject(adminOld, admin)).toBe(true);
    expect(canSeeProject(adminOld, student)).toBe(true); // published, read-only
    expect(canSeeProject(draft, student)).toBe(false);
    expect(canEditProject(mine, teacher)).toBe(true);
    expect(canEditProject(adminOld, teacher)).toBe(false);
    expect(canEditProject(mine, student)).toBe(false);
    expect(canSeeProject(mine, null)).toBe(false);
  });
  it('password and user-name rules; PBKDF2 hash is salted and repeatable', async () => {
    expect(checkPassword('short1')).toBeTruthy();
    expect(checkPassword('onlyletters')).toBeTruthy();
    expect(checkPassword('Good-pass-1')).toBeNull();
    expect(checkUsername('a b')).toBeTruthy();
    expect(checkUsername('ab')).toBeTruthy();
    expect(checkUsername('ibrahim')).toBeNull();
    const salt = btoa('0123456789abcdef');
    const h1 = await hashPassword('Good-pass-1', salt, 1000);
    expect(h1).toBe(await hashPassword('Good-pass-1', salt, 1000));
    expect(h1).not.toBe(await hashPassword('Good-pass-2', salt, 1000));
    expect(h1).not.toBe(await hashPassword('Good-pass-1', btoa('fedcba9876543210'), 1000));
    expect(h1).not.toContain('Good-pass-1');
  });
});
