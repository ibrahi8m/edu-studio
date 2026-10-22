import { useEffect, useId, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, LogOut, Trash2, UserCog, UserPlus, Users } from 'lucide-react';
import { useToast } from '../app/Toasts';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { Card, PageHeader, Pill } from '../components/ui';
import { saveLearner, getLearner } from '../learner/db';
import { db } from '../db/db';
import * as local from './local';
import * as cloud from './cloud';
import { refreshFromStorage, signOut, useAuth } from './session';
import { ROLE_LABEL, type Role } from './types';

const ROLES: Role[] = ['admin', 'teacher', 'student'];
const msg = (e: unknown) => (e instanceof Error ? e.message : 'حدث خطأ.');

/* ───────── «حسابي»: every role ───────── */

export function AccountPage() {
  const { user, mode } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const uid = useId();
  const [name, setName] = useState(user?.displayName ?? '');
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [error, setError] = useState('');
  if (!user) return null;
  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await local.changeOwnPassword(cur, next);
      setCur('');
      setNext('');
      toast({ message: 'تم تغيير كلمة المرور. أُنهيت الجلسات الأخرى.', sound: 'save' });
    } catch (err) {
      setError(msg(err));
    }
  };
  return (
    <div className="page" data-testid="page-account">
      <PageHeader title="حسابي" subtitle={`${user.displayName} · ${ROLE_LABEL[user.role]} · ${mode === 'cloud' ? 'حساب سحابي' : 'حساب على هذا الجهاز'}`} />
      <Card title="بيانات الحساب" icon={UserCog}>
        <dl className="account-dl">
          <dt>{mode === 'cloud' ? 'البريد الإلكتروني' : 'اسم المستخدم'}</dt>
          <dd dir="ltr" data-testid="account-login">
            {user.login}
          </dd>
          <dt>الدور</dt>
          <dd data-testid="account-role">{ROLE_LABEL[user.role]}</dd>
          {user.learnerName && (
            <>
              <dt>ملف المتعلم</dt>
              <dd>{user.learnerName}</dd>
            </>
          )}
        </dl>
        {mode === 'local' && (
          <div className="field-row">
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-n`}>
                الاسم الظاهر
              </label>
              <input id={`${uid}-n`} className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} data-testid="account-name" />
            </div>
            <button
              type="button"
              className="btn"
              onClick={() => {
                try {
                  local.updateOwnName(name);
                  refreshFromStorage();
                  toast({ message: 'حُفظ الاسم.', sound: 'save' });
                } catch (err) {
                  toast({ message: msg(err), tone: 'danger' });
                }
              }}
              data-testid="account-name-save"
            >
              حفظ الاسم
            </button>
          </div>
        )}
      </Card>
      {mode === 'local' ? (
        <Card title="تغيير كلمة المرور" icon={KeyRound}>
          <form onSubmit={(e) => void changePassword(e)} noValidate className="form-grid">
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-c`}>
                كلمة المرور الحالية
              </label>
              <input id={`${uid}-c`} className="input" type="password" dir="ltr" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="account-current" />
            </div>
            <div className="field">
              <label className="field-label" htmlFor={`${uid}-x`}>
                كلمة المرور الجديدة
              </label>
              <input id={`${uid}-x`} className="input" type="password" dir="ltr" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="account-new" />
              <span className="field-hint">8 أحرف على الأقل، فيها حروف وأرقام.</span>
            </div>
            {error && (
              <p className="auth-error" role="alert" data-testid="auth-error">
                {error}
              </p>
            )}
            <button type="submit" className="btn btn-primary" data-testid="account-password-save">
              تغيير كلمة المرور
            </button>
          </form>
        </Card>
      ) : (
        <Card title="كلمة المرور" icon={KeyRound}>
          <p className="muted">لتغيير كلمة المرور اطلب رابط استعادة من شاشة الدخول؛ يصل إلى بريدك.</p>
        </Card>
      )}
      <button
        type="button"
        className="btn btn-danger"
        onClick={async () => {
          await signOut();
          navigate('/login', { replace: true });
        }}
        data-testid="logout"
      >
        <LogOut size={18} aria-hidden="true" /> تسجيل الخروج
      </button>
    </div>
  );
}

/* ───────── «المستخدمون»: admin only (every action is checked again in local.ts / on the server) ───────── */

type Row = { id: string; login: string; displayName: string; role: Role; disabled: boolean; learnerName?: string };

export function UsersPage() {
  const { user, mode } = useAuth();
  const toast = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [resetFor, setResetFor] = useState<Row | null>(null);
  const [deleting, setDeleting] = useState<Row | null>(null);

  const load = async () => {
    setError('');
    try {
      if (mode === 'cloud') {
        const ps = await cloud.cloudListProfiles();
        setRows(ps.map((p) => ({ id: p.id, login: p.email, displayName: p.display_name || p.email, role: p.role, disabled: p.disabled, learnerName: p.learner_name ?? undefined })));
      } else {
        setRows(local.listAccounts().map((a) => ({ id: a.id, login: a.username, displayName: a.displayName, role: a.role, disabled: !!a.disabled, learnerName: a.learnerName })));
      }
    } catch (e) {
      setError(msg(e));
      setRows([]);
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const act = async (fn: () => unknown | Promise<unknown>, ok: string) => {
    try {
      await fn();
      toast({ message: ok, sound: 'save' });
      await load();
    } catch (e) {
      toast({ message: msg(e), tone: 'danger' });
    }
  };

  return (
    <div className="page" data-testid="page-users">
      <PageHeader
        title="المستخدمون والصلاحيات"
        subtitle={mode === 'cloud' ? 'حسابات سحابية على Supabase. الأدوار محمية على الخادم.' : 'حسابات على هذا الجهاز. كل حساب له كلمة مرور وبيانات منفصلة.'}
        actions={
          mode === 'local' ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)} data-testid="user-new">
              <UserPlus size={18} aria-hidden="true" /> حساب جديد
            </button>
          ) : undefined
        }
      />
      {mode === 'cloud' && <p className="muted">المستخدمون الجدد ينشئون حساباتهم من «إنشاء حساب» في شاشة الدخول، ويبدؤون «طلابًا». غيّر الدور من هنا.</p>}
      {mode === 'local' && <SelfSignupToggle />}
      {error && (
        <p className="auth-error" role="alert">
          {error}
        </p>
      )}
      <Card title="الحسابات" icon={Users}>
        <ul className="users-list">
          {(rows ?? []).map((r) => (
            <li key={r.id} className="users-row" data-testid="user-row">
              <div className="users-main">
                <strong>{r.displayName}</strong>
                <span className="muted" dir="ltr">
                  {r.login}
                </span>
                {r.learnerName && <span className="muted">ملف المتعلم: {r.learnerName}</span>}
              </div>
              <div className="users-actions">
                {r.disabled && <Pill tone="danger">موقوف</Pill>}
                {r.id === user?.id && <Pill tone="accent">أنت</Pill>}
                <select
                  className="input input-sm"
                  aria-label={`دور ${r.displayName}`}
                  value={r.role}
                  onChange={(e) => void act(() => (mode === 'cloud' ? cloud.cloudUpdateProfile(r.id, { role: e.target.value as Role }) : local.setRole(r.id, e.target.value as Role)), 'تم تغيير الدور. يسري من الدخول التالي.')}
                  data-testid="user-role"
                >
                  {ROLES.map((x) => (
                    <option key={x} value={x}>
                      {ROLE_LABEL[x]}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn btn-sm" onClick={() => void act(() => (mode === 'cloud' ? cloud.cloudUpdateProfile(r.id, { disabled: !r.disabled }) : local.setDisabled(r.id, !r.disabled)), r.disabled ? 'أُعيد تفعيل الحساب.' : 'أوقف الحساب.')} data-testid="user-toggle">
                  {r.disabled ? 'تفعيل' : 'إيقاف'}
                </button>
                {mode === 'local' && (
                  <>
                    <button type="button" className="btn btn-sm" onClick={() => setResetFor(r)} data-testid="user-reset">
                      <KeyRound size={15} aria-hidden="true" /> كلمة مرور جديدة
                    </button>
                    <button type="button" className="icon-btn danger" aria-label={`حذف حساب ${r.displayName}`} onClick={() => setDeleting(r)} data-testid="user-delete">
                      <Trash2 size={17} />
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      {creating && (
        <NewUserDialog
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false);
            await load();
          }}
        />
      )}
      {resetFor && <ResetDialog row={resetFor} onClose={() => setResetFor(null)} />}
      <ConfirmDialog
        open={!!deleting}
        title="حذف الحساب؟"
        message={`يُحذف حساب «${deleting?.displayName ?? ''}» ولا يستطيع الدخول بعدها. تقدّم المتعلم ومحاولاته وتسليماته تبقى محفوظة.`}
        confirmLabel="حذف الحساب"
        onConfirm={() => {
          const r = deleting!;
          setDeleting(null);
          void act(() => local.deleteAccount(r.id), 'حُذف الحساب.');
        }}
        onClose={() => setDeleting(null)}
        testId="user-delete-confirm"
      />
    </div>
  );
}

function NewUserDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const uid = useId();
  const toast = useToast();
  const [v, setV] = useState({ username: '', displayName: '', password: '', role: 'student' as Role, learnerName: '' });
  const [error, setError] = useState('');
  const set = (k: keyof typeof v, x: string) => setV((p) => ({ ...p, [k]: x }));
  return (
    <Dialog
      open
      title="حساب جديد"
      onClose={onClose}
      testId="user-dialog"
      onSubmit={async () => {
        setError('');
        try {
          const a = await local.createAccount(v);
          // a student account is tied to its own learner profile (progress, attempts, assignments)
          if (a.role === 'student' && a.learnerName && !(await getLearner(db, a.learnerName))) await saveLearner(db, { name: a.learnerName, type: 'school' });
          toast({ message: `أُنشئ حساب «${a.displayName}» (${ROLE_LABEL[a.role]}).`, sound: 'save' });
          onDone();
        } catch (e) {
          setError(msg(e));
        }
      }}
      footer={
        <>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            إلغاء
          </button>
          <button type="submit" className="btn btn-primary" data-testid="user-save">
            إنشاء الحساب
          </button>
        </>
      }
    >
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor={`${uid}-r`}>
            الدور
          </label>
          <select id={`${uid}-r`} className="input" value={v.role} onChange={(e) => set('role', e.target.value)} data-testid="user-new-role">
            {ROLES.map((x) => (
              <option key={x} value={x}>
                {ROLE_LABEL[x]}
              </option>
            ))}
          </select>
        </div>
        {(
          [
            ['displayName', 'الاسم الظاهر', 'text', 'user-new-name'],
            ['username', 'اسم المستخدم (للدخول)', 'text', 'user-new-username'],
            ['password', 'كلمة المرور الأولى', 'password', 'user-new-password'],
          ] as const
        ).map(([k, label, type, t]) => (
          <div className="field" key={k}>
            <label className="field-label" htmlFor={`${uid}-${k}`}>
              {label}
            </label>
            <input id={`${uid}-${k}`} className="input" type={type} dir={k === 'displayName' ? 'auto' : 'ltr'} value={v[k]} onChange={(e) => set(k, e.target.value)} autoComplete="off" data-testid={t} />
          </div>
        ))}
        {v.role === 'student' && (
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-l`}>
              اسم ملف المتعلم
            </label>
            <input id={`${uid}-l`} className="input" value={v.learnerName} placeholder="يُستخدم الاسم الظاهر إن تُرك فارغًا" onChange={(e) => set('learnerName', e.target.value)} data-testid="user-new-learner" />
            <span className="field-hint">تقدّم الطالب ومحاولاته وتكاليفه تُحفظ تحت هذا الملف، ولا يرى ملفات غيره.</span>
          </div>
        )}
        {error && (
          <p className="auth-error" role="alert" data-testid="auth-error">
            {error}
          </p>
        )}
      </div>
    </Dialog>
  );
}

function ResetDialog({ row, onClose }: { row: Row; onClose: () => void }) {
  const uid = useId();
  const toast = useToast();
  const [p, setP] = useState('');
  const [error, setError] = useState('');
  return (
    <Dialog
      open
      title={`كلمة مرور جديدة لـ«${row.displayName}»`}
      onClose={onClose}
      size="sm"
      testId="user-reset-dialog"
      onSubmit={async () => {
        try {
          await local.adminResetPassword(row.id, p);
          toast({ message: 'عُيّنت كلمة المرور. أعطها للمستخدم ليغيّرها من «حسابي».', sound: 'save' });
          onClose();
        } catch (e) {
          setError(msg(e));
        }
      }}
      footer={
        <button type="submit" className="btn btn-primary" data-testid="user-reset-save">
          تعيين
        </button>
      }
    >
      <div className="field">
        <label className="field-label" htmlFor={`${uid}-p`}>
          كلمة المرور الجديدة
        </label>
        <input id={`${uid}-p`} className="input" type="password" dir="ltr" autoComplete="new-password" value={p} onChange={(e) => setP(e.target.value)} data-testid="user-reset-password" />
      </div>
      {error && (
        <p className="auth-error" role="alert" data-testid="auth-error">
          {error}
        </p>
      )}
    </Dialog>
  );
}

/** 1.6.0: the admin allows or stops «إنشاء حساب جديد» on this device's sign-in screen (new accounts are always students). */
function SelfSignupToggle() {
  const toast = useToast();
  const [on, setOn] = useState(() => local.selfSignupAllowed());
  return (
    <label className="switch-row" data-testid="self-signup-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={(e) => {
          try {
            local.setSelfSignup(e.target.checked);
            setOn(e.target.checked);
            toast({ message: e.target.checked ? 'صار إنشاء حسابات الطلاب من شاشة الدخول متاحًا على هذا الجهاز.' : 'أُوقف إنشاء الحسابات من شاشة الدخول على هذا الجهاز.', sound: 'save' });
          } catch (err) {
            toast({ message: msg(err), tone: 'danger' });
          }
        }}
        data-testid="self-signup-checkbox"
      />
      <span>السماح بـ«إنشاء حساب جديد» من شاشة الدخول على هذا الجهاز. الحساب الجديد يكون «طالبًا» دائمًا، وأنت تغيّر دوره من هنا.</span>
    </label>
  );
}
