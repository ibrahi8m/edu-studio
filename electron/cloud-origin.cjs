// 1.5.1 — the ONE online address the desktop app may reach: the owner's Supabase project, used only
// when someone chooses «حساب سحابي». It must equal CLOUD.url (src/auth/cloud.ts), the CSP connect-src
// (vite.config.ts) and ALLOWED_SERVICES (scripts/check-offline.mjs); tests/unit/cloud-origin.test.ts checks this.
module.exports = { CLOUD_ORIGIN: 'https://wqhyubqoxqlcefwqnpwq.supabase.co' };
