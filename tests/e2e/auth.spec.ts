import { expect, test, type Page } from '@playwright/test';
import { waitPastSplash } from './helpers';

/** No account yet, so the splash is waited out instead of switched off in the settings. */
async function disableSplash(page: Page) {
  await page.goto('./#/login');
  await waitPastSplash(page);
}

/**
 * 1.5.0 — sign-in, roles and data separation, through the real UI.
 * These tests start with NO stored account (unlike the rest of the suite).
 */
test.use({ storageState: { cookies: [], origins: [] } });

const heavy = (n: string) => ['desktop-1440', 'phone-pixel-7'].includes(n);
const OWNER = { user: 'ibrahim', pass: 'Owner-pass-2026' };

async function setupOwner(page: Page) {
  await disableSplash(page);
  await page.goto('./#/projects');
  // a protected link with no account → first-run setup
  await expect(page.getByTestId('page-setup')).toBeVisible();
  await page.getByTestId('setup-user').fill(OWNER.user);
  await page.getByTestId('setup-password').fill(OWNER.pass);
  await page.getByTestId('setup-password2').fill(OWNER.pass);
  await page.getByTestId('setup-submit').click();
  const code = (await page.getByTestId('recovery-code').textContent())!.trim();
  expect(code).toMatch(/^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
  await page.getByTestId('setup-continue').click();
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  return code;
}
async function signIn(page: Page, user: string, pass: string) {
  await page.getByTestId('login-user').fill(user);
  await page.getByTestId('login-password').fill(pass);
  await page.getByTestId('login-submit').click();
}
async function signOutFromAccount(page: Page) {
  await page.goto('./#/account');
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('page-login')).toBeVisible();
}
async function createUser(page: Page, role: 'teacher' | 'student', name: string, user: string, pass: string) {
  await page.goto('./#/users');
  await page.getByTestId('user-new').click();
  const d = page.getByTestId('user-dialog');
  await d.getByTestId('user-new-role').selectOption(role);
  await d.getByTestId('user-new-name').fill(name);
  await d.getByTestId('user-new-username').fill(user);
  await d.getByTestId('user-new-password').fill(pass);
  await d.getByTestId('user-save').click();
  await expect(page.getByTestId('user-row').filter({ hasText: user })).toBeVisible();
}

test('first run: every page asks for an account; the owner creates the admin; wrong password, sign-out and expired session', async ({ page }, info) => {
  test.skip(!heavy(info.project.name), 'computer and phone');
  test.setTimeout(120_000);
  await setupOwner(page);
  // stored: a PBKDF2 hash, never the password
  const raw = await page.evaluate(() => localStorage.getItem('ibrahi8m.accounts.v1')!);
  expect(raw).not.toContain(OWNER.pass);
  expect(JSON.parse(raw).accounts[0]).toMatchObject({ role: 'admin', iterations: 210000 });

  await signOutFromAccount(page);
  // direct protected link → login, then back to that page after signing in
  await page.goto('./#/settings');
  await expect(page.getByTestId('page-login')).toBeVisible();
  await signIn(page, OWNER.user, 'wrong-pass-1');
  await expect(page.getByTestId('auth-error')).toHaveText(/اسم المستخدم أو كلمة المرور غير صحيحة/);
  await signIn(page, 'nobody', 'wrong-pass-1');
  await expect(page.getByTestId('auth-error')).toHaveText(/اسم المستخدم أو كلمة المرور غير صحيحة/); // same message
  await signIn(page, OWNER.user, OWNER.pass);
  await expect(page.getByTestId('page-settings')).toBeVisible();

  // the session ends by itself after its time limit
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('ibrahi8m.session.v1')!);
    s.expiresAt = Date.now() - 1000;
    localStorage.setItem('ibrahi8m.session.v1', JSON.stringify(s));
  });
  await page.goto('./#/projects');
  await expect(page.getByTestId('page-login')).toBeVisible();
  await expect(page.getByTestId('session-expired')).toBeVisible();
  await signIn(page, OWNER.user, OWNER.pass);
  await expect(page.getByTestId('page-projects')).toBeVisible();
});

test('five wrong passwords lock the account for a minute; the owner recovers a forgotten password with the one-time code', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one size');
  test.setTimeout(150_000);
  const code = await setupOwner(page);
  await signOutFromAccount(page);
  for (let i = 0; i < 5; i++) await signIn(page, OWNER.user, `bad-pass-${i}x`);
  await signIn(page, OWNER.user, OWNER.pass); // even the right password is refused now
  await expect(page.getByTestId('auth-error')).toContainText('محاولات كثيرة خاطئة');

  await page.getByTestId('to-recover').click();
  await page.getByTestId('recover-user').fill(OWNER.user);
  await page.getByTestId('recover-code').fill('WRONG-CODE1');
  await page.getByTestId('recover-password').fill('New-owner-pass-1');
  await page.getByTestId('recover-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('رمز الاستعادة');
  await page.getByTestId('recover-code').fill(code.toLowerCase().replace('-', ' ')); // forgiving input
  await page.getByTestId('recover-submit').click();
  await expect(page.getByTestId('recover-done')).toContainText('رمز الاستعادة الجديد');
  await page.goto('./#/login');
  await signIn(page, OWNER.user, 'New-owner-pass-1');
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  // the old code is single use
  await signOutFromAccount(page);
  await page.goto('./#/recover');
  await page.getByTestId('recover-user').fill(OWNER.user);
  await page.getByTestId('recover-code').fill(code);
  await page.getByTestId('recover-password').fill('Another-pass-2');
  await page.getByTestId('recover-submit').click();
  await expect(page.getByTestId('auth-error')).toBeVisible();
});

test('three portals: the teacher sees and edits only their own content and no admin pages; the student sees only the learner environment under their own profile', async ({ page }, info) => {
  test.skip(!heavy(info.project.name), 'computer and phone');
  test.setTimeout(240_000);
  await setupOwner(page);
  // the admin's own content
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-title').fill('محتوى الأدمن');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('page-project')).toBeVisible();
  const adminProjectUrl = page.url();

  await createUser(page, 'teacher', 'المعلمة هدى', 'huda', 'Teacher-pass-1');
  await createUser(page, 'student', 'الطالب سامي', 'sami', 'Student-pass-1');
  // weak password and duplicate user name are refused
  await page.getByTestId('user-new').click();
  await page.getByTestId('user-new-username').fill('huda');
  await page.getByTestId('user-new-password').fill('Teacher-pass-1');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-dialog').getByTestId('auth-error')).toContainText('مستخدم بالفعل');
  await page.getByTestId('user-new-username').fill('another');
  await page.getByTestId('user-new-password').fill('short');
  await page.getByTestId('user-save').click();
  await expect(page.getByTestId('user-dialog').getByTestId('auth-error')).toContainText('8 أحرف');
  await page.keyboard.press('Escape');
  await signOutFromAccount(page);

  // ── teacher
  await signIn(page, 'huda', 'Teacher-pass-1');
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await expect(page.getByTestId('hero-title')).toContainText('المعلمة هدى');
  await page.goto('./#/projects');
  await expect(page.getByText('محتوى الأدمن')).toHaveCount(0); // not the admin's content
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-title').fill('درس المعلمة');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('page-project')).toBeVisible();
  // admin pages refused, even typed directly
  for (const r of ['users', 'backup', 'settings']) {
    await page.goto(`./#/${r}`);
    await expect(page.getByTestId('page-forbidden'), r).toBeVisible();
  }
  // the admin's project by its direct link: not shown
  await page.goto(adminProjectUrl);
  await expect(page.getByTestId('page-project')).toHaveCount(0);
  // the owner page is readable, not editable
  await page.goto('./#/me');
  await expect(page.getByTestId('owner-phone')).toHaveText('0592780728');
  await expect(page.getByTestId('cv-edit')).toHaveCount(0);
  // a write attempted from the browser console is refused too
  const forbidden = await page.evaluate(async () => {
    const open = indexedDB.open('ibrahi8m-edu');
    const db: IDBDatabase = await new Promise((ok) => (open.onsuccess = () => ok(open.result)));
    const tx = db.transaction('projects');
    const all: { id: string; title: string }[] = await new Promise((ok) => {
      const r = tx.objectStore('projects').getAll();
      r.onsuccess = () => ok(r.result);
    });
    db.close();
    return all.find((p) => p.title === 'محتوى الأدمن')!.id;
  });
  expect(forbidden).toBeTruthy();
  await signOutFromAccount(page);

  // ── student
  await signIn(page, 'sami', 'Student-pass-1');
  await expect(page).toHaveURL(/#\/learn/);
  await expect(page.getByTestId('student-chip')).toContainText('الطالب سامي');
  await expect(page.getByTestId('switch-student')).toHaveCount(0); // cannot switch to another learner
  await expect(page.getByTestId('page-learn-who')).toHaveCount(0);
  for (const r of ['', 'projects', 'results', 'users', 'me', 'ai-studio']) {
    await page.goto(`./#/${r}`);
    await expect(page.getByTestId('page-forbidden'), r || 'dashboard').toBeVisible();
  }
  await page.goto('./#/learn');
  await page.getByTestId('logout').click();
  await expect(page.getByTestId('page-login')).toBeVisible();

  // ── admin: sees both, can stop an account; a stopped account cannot sign in
  await signIn(page, OWNER.user, OWNER.pass);
  await page.goto('./#/projects');
  await expect(page.getByText('محتوى الأدمن').first()).toBeVisible();
  await expect(page.getByText('درس المعلمة').first()).toBeVisible();
  await page.goto('./#/users');
  await page.getByTestId('user-row').filter({ hasText: 'sami' }).getByTestId('user-toggle').click();
  await expect(page.getByTestId('user-row').filter({ hasText: 'sami' })).toContainText('موقوف');
  // the last admin cannot be demoted
  await page.getByTestId('user-row').filter({ hasText: OWNER.user }).getByTestId('user-role').selectOption('teacher');
  await expect(page.getByTestId('toast').last()).toContainText('آخر حساب أدمن');
  await signOutFromAccount(page);
  await signIn(page, 'sami', 'Student-pass-1');
  await expect(page.getByTestId('auth-error')).toContainText('موقوف');
});

test('the data layer refuses a teacher’s write to content that is not theirs (not only hidden buttons)', async ({ page }, info) => {
  test.skip(info.project.name !== 'desktop-1440', 'one size');
  test.setTimeout(120_000);
  await setupOwner(page);
  await page.goto('./#/projects');
  await page.getByTestId('new-project').click();
  await page.getByTestId('project-title').fill('محتوى الأدمن');
  await page.getByTestId('project-save').click();
  await expect(page.getByTestId('page-project')).toBeVisible();
  const id = decodeURIComponent(page.url().split('/projects/')[1]);
  await createUser(page, 'teacher', 'المعلم', 'teacher1', 'Teacher-pass-1');
  await signOutFromAccount(page);
  await signIn(page, 'teacher1', 'Teacher-pass-1');
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  // the app's own update function, called directly with the admin's project id
  const result = await page.evaluate(async (pid) => {
    const w = window as unknown as { __ibrahi8mTest?: { updateProject(id: string, patch: object): Promise<unknown> } };
    try {
      await w.__ibrahi8mTest!.updateProject(pid, { title: 'تعديل غير مسموح' });
      return 'changed';
    } catch (e) {
      return (e as Error).message;
    }
  }, id);
  expect(result).toContain('لا تملك صلاحية');
});

test('1.6.0: «إنشاء حساب جديد» on this device — student only, validation, sign out/in, reload, offline; the admin can stop it', async ({ page, context }, info) => {
  test.skip(!['desktop-1440', 'phone-iphone-se', 'phone-pixel-7'].includes(info.project.name), 'desktop and phones');
  await setupOwner(page);
  await signOutFromAccount(page);
  await page.getByTestId('to-local-signup').click();
  await expect(page.getByTestId('page-local-signup')).toBeVisible();
  await expect(page.getByTestId('local-signup-note')).toContainText('هذا الجهاز فقط');
  await page.getByTestId('local-signup-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('اكتب اسم المستخدم');
  await page.getByTestId('local-signup-user').fill('sara.student');
  await page.getByTestId('local-signup-password').fill('Student-pass-1');
  await page.getByTestId('local-signup-password2').fill('Student-pass-2');
  await page.getByTestId('local-signup-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('غير متطابقتين');
  await page.getByTestId('local-signup-user').fill(OWNER.user.toUpperCase()); // same name, other case
  await page.getByTestId('local-signup-password2').fill('Student-pass-1');
  await page.getByTestId('local-signup-submit').click();
  await expect(page.getByTestId('auth-error')).toContainText('مستخدم بالفعل');
  await page.getByTestId('local-signup-user').fill('sara.student');
  await page.getByTestId('local-signup-submit').click();
  await expect(page.getByTestId('local-signup-done')).toBeVisible();
  await expect(page.getByTestId('login-user')).toHaveValue('sara.student');
  // the password is never stored as text
  expect(await page.evaluate(() => localStorage.getItem('ibrahi8m.accounts.v1'))).not.toContain('Student-pass-1');
  await page.getByTestId('login-password').fill('Student-pass-1');
  await page.getByTestId('login-submit').click();
  await expect(page).toHaveURL(/#\/learn/); // the student portal
  await page.goto('./#/users');
  await expect(page.getByTestId('page-forbidden')).toBeVisible();
  await page.goto('./#/account');
  await expect(page.getByTestId('account-role')).toHaveText('طالب');
  await signOutFromAccount(page);
  // restart: reload the app, sign in again
  await page.reload();
  await signIn(page, 'sara.student', 'Student-pass-1');
  await expect(page).toHaveURL(/#\/learn/);
  // offline: sign out and in with no network, and reload offline
  await context.setOffline(true);
  await signOutFromAccount(page);
  await signIn(page, 'sara.student', 'Student-pass-1');
  await expect(page).toHaveURL(/#\/learn/);
  await page.reload();
  await expect(page).toHaveURL(/#\/learn/);
  await context.setOffline(false);
  // the owner stops self sign-up; the student keeps working
  await signOutFromAccount(page);
  await signIn(page, OWNER.user, OWNER.pass);
  await expect(page.getByTestId('page-dashboard')).toBeVisible();
  await page.goto('./#/users');
  await expect(page.getByTestId('user-row').filter({ hasText: 'sara.student' })).toContainText('طالب');
  await page.getByTestId('self-signup-checkbox').uncheck();
  await signOutFromAccount(page);
  await expect(page.getByTestId('to-local-signup')).toHaveCount(0);
  await page.goto('./#/local-signup');
  await expect(page.getByTestId('local-signup-off')).toBeVisible();
  await page.goto('./#/login');
  await signIn(page, 'sara.student', 'Student-pass-1');
  await expect(page).toHaveURL(/#\/learn/);
});

test.describe('cloud accounts (Supabase) — against a MOCKED server', () => {
  // The real project is not reachable from the test machine; these requests are answered by page.route
  // with the same shapes Supabase returns. They test the app's client logic, not the live server.
  const BASE = 'https://wqhyubqoxqlcefwqnpwq.supabase.co';
  test('login with the role from the server, wrong password, sign-up starts as a student, recovery e-mail', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop-1440', 'one size');
    const calls: string[] = [];
    await page.route(`${BASE}/**`, async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      calls.push(`${req.method()} ${u.pathname}${u.search}`);
      expect(req.headers()['apikey']).toBe('sb_publishable_oUjYYweRokZorggB7DQK_w_GzkPVXAY');
      if (u.pathname === '/auth/v1/token') {
        const body = JSON.parse(req.postData() ?? '{}');
        if (body.password !== 'Cloud-pass-1') return route.fulfill({ status: 400, json: { error: 'invalid_grant', error_description: 'Invalid login credentials' } });
        return route.fulfill({ json: { access_token: 'tok', refresh_token: 'ref', expires_in: 3600, user: { id: 'u-1', email: body.email } } });
      }
      if (u.pathname === '/rest/v1/profiles') {
        expect(req.headers()['authorization']).toBe('Bearer tok');
        return route.fulfill({ json: [{ id: 'u-1', email: 'teacher@example.com', display_name: 'معلم سحابي', role: 'teacher', learner_name: null, disabled: false }] });
      }
      if (u.pathname === '/auth/v1/signup') return route.fulfill({ json: { id: 'u-2', email: 'new@example.com' } });
      if (u.pathname === '/auth/v1/recover') return route.fulfill({ json: {} });
      if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 404, json: {} });
    });
    await disableSplash(page);
    // no local account on this device yet: the first-run screen offers the cloud mode and explains its setup
    await page.goto('./#/login');
    await expect(page.getByTestId('page-setup')).toBeVisible();
    await page.getByTestId('mode-cloud').click();
    await expect(page.getByTestId('cloud-setup-help')).toContainText('supabase/schema.sql');
    await page.goto('./#/login');
    await signIn(page, 'teacher@example.com', 'nope-nope-1');
    await expect(page.getByTestId('auth-error')).toContainText('البريد الإلكتروني أو كلمة المرور غير صحيحة');
    await signIn(page, 'teacher@example.com', 'Cloud-pass-1');
    await expect(page.getByTestId('page-dashboard')).toBeVisible();
    await page.goto('./#/account');
    await expect(page.getByTestId('account-role')).toHaveText('معلم'); // role from the server's profile
    await page.goto('./#/users');
    await expect(page.getByTestId('page-forbidden')).toBeVisible();
    await page.goto('./#/account');
    await page.getByTestId('logout').click();
    await page.getByTestId('to-signup').click();
    await page.getByTestId('signup-name').fill('طالب جديد');
    await page.getByTestId('signup-email').fill('new@example.com');
    await page.getByTestId('signup-password').fill('Cloud-pass-1');
    await page.getByTestId('signup-submit').click();
    await expect(page.getByText('يبدأ الحساب «طالبًا»')).toBeVisible();
    await page.goto('./#/recover');
    await page.getByTestId('recover-email').fill('teacher@example.com');
    await page.getByTestId('recover-submit').click();
    await expect(page.getByTestId('recover-done')).toBeVisible();
    expect(calls).toEqual(expect.arrayContaining(['POST /auth/v1/token?grant_type=password', 'GET /rest/v1/profiles?id=eq.u-1&select=*', 'POST /auth/v1/signup', 'POST /auth/v1/recover?redirect_to=https%3A%2F%2Fibrahi8m.github.io%2Fedu-studio%2F', 'POST /auth/v1/logout']));
  });
  test('1.5.2: the e-mail limit (429) is explained; a recovery link opens «كلمة مرور جديدة», sets the password, and hides the token', async ({ page }, info) => {
    test.skip(!['desktop-1440', 'phone-iphone-se'].includes(info.project.name), 'desktop and the smallest phone');
    const calls: string[] = [];
    let newPassword = '';
    await page.route(`${BASE}/**`, async (route) => {
      const req = route.request();
      const u = new URL(req.url());
      calls.push(`${req.method()} ${u.pathname}${u.search}`);
      if (u.pathname === '/auth/v1/recover')
        return route.fulfill({ status: 429, json: { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' } });
      if (u.pathname === '/auth/v1/user' && req.method() === 'PUT') {
        expect(req.headers()['authorization']).toBe('Bearer recovery-token-123');
        newPassword = JSON.parse(req.postData() ?? '{}').password;
        return route.fulfill({ json: { id: 'u-1', email: 'owner@example.com' } });
      }
      if (u.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ status: 404, json: {} });
    });
    await disableSplash(page);
    await page.goto('./#/login');
    await page.getByTestId('mode-cloud').click();
    await page.goto('./#/recover');
    await page.getByTestId('recover-email').fill('owner@example.com');
    await page.getByTestId('recover-submit').click();
    await expect(page.getByTestId('auth-error')).toContainText('رسالتان في الساعة');
    await expect(page.getByTestId('auth-error')).toContainText('لا تكرر الطلب');

    // the link from the e-mail (Supabase appends the one-time token after #)
    await page.goto('./#access_token=recovery-token-123&expires_in=3600&refresh_token=r&token_type=bearer&type=recovery');
    await expect(page.getByTestId('page-reset-password')).toBeVisible();
    expect(page.url()).toContain('#/reset-password');
    expect(page.url()).not.toContain('recovery-token-123'); // removed from the address bar
    await page.getByTestId('reset-password').fill('short');
    await page.getByTestId('reset-password2').fill('short');
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('auth-error')).toBeVisible();
    await page.getByTestId('reset-password').fill('New-cloud-pass-7');
    await page.getByTestId('reset-password2').fill('New-cloud-pass-8');
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('auth-error')).toContainText('غير متطابقتين');
    await page.getByTestId('reset-password2').fill('New-cloud-pass-7');
    await page.getByTestId('reset-submit').click();
    await expect(page.getByTestId('reset-done')).toBeVisible();
    expect(newPassword).toBe('New-cloud-pass-7');
    expect(calls).toContain('PUT /auth/v1/user');
    expect(calls).toContain('POST /auth/v1/logout?scope=local'); // only the one-time recovery session is ended
    expect(calls.some((c) => c.includes('/rest/v1/profiles') && !c.startsWith('GET'))).toBe(false); // role/data untouched
    await page.getByTestId('reset-to-login').click();
    await expect(page.getByTestId('page-login')).toBeVisible();

    // an expired / already-opened link
    await page.goto('./#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired');
    await expect(page.getByTestId('reset-invalid')).toContainText('انتهت صلاحية');
    // opening the page directly, without a link
    await page.evaluate(() => sessionStorage.clear());
    await page.goto('./#/reset-password');
    await page.reload();
    await expect(page.getByTestId('reset-invalid')).toContainText('لا يوجد رابط');
  });
});
