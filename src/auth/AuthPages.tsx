import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Cloud, HardDrive, KeyRound, LogIn, ShieldAlert, ShieldCheck, UserPlus } from 'lucide-react';
import { BrandMark, Wordmark } from '../components/Brand';
import { ThemeButton } from '../app/ThemeButton';
import * as local from './local';
import * as cloud from './cloud';
import { refreshFromStorage, revalidate, setMode, signIn, useAuth } from './session';
import { canAccess, homeFor, ROLE_LABEL } from './types';

/* ───────── shared frame ───────── */

function AuthFrame({ title, children, testId }: { title: string; children: ReactNode; testId: string }) {
  return (
    <main className="auth-wrap" data-testid={testId}>
      <div className="auth-tools">
        <ThemeButton />
      </div>
      <section className="card auth-card">
        <div className="auth-brand">
          <BrandMark size={56} />
          <div>
            <Wordmark size="md" />
            <span className="brand-sub" dir="ltr">
              EDU STUDIO
            </span>
          </div>
        </div>
        <h1 className="auth-title">{title}</h1>
        {children}
      </section>
    </main>
  );
}

function TextField(props: { label: string; value: string; onChange: (v: string) => void; type?: string; autoComplete?: string; testId: string; hint?: string; dir?: 'ltr' | 'auto' }) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {props.label}
      </label>
      <input
        id={id}
        className="input input-lg"
        type={props.type ?? 'text'}
        dir={props.dir ?? 'auto'}
        value={props.value}
        autoComplete={props.autoComplete}
        onChange={(e) => props.onChange(e.target.value)}
        data-testid={props.testId}
      />
      {props.hint && <span className="field-hint">{props.hint}</span>}
    </div>
  );
}

function ErrorBox({ text }: { text: string }) {
  return text ? (
    <p className="auth-error" role="alert" data-testid="auth-error">
      <ShieldAlert size={16} aria-hidden="true" /> {text}
    </p>
  ) : null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : 'حدث خطأ غير متوقع.');

function ModeSwitch() {
  const mode = useAuth().mode;
  if (!cloud.cloudConfigured()) return null;
  return (
    <div className="segmented auth-mode" role="radiogroup" aria-label="نوع الحساب">
      <button type="button" role="radio" aria-checked={mode === 'local'} className={mode === 'local' ? 'is-active' : ''} onClick={() => setMode('local')} data-testid="mode-local">
        <HardDrive size={15} aria-hidden="true" /> حساب على هذا الجهاز
      </button>
      <button type="button" role="radio" aria-checked={mode === 'cloud'} className={mode === 'cloud' ? 'is-active' : ''} onClick={() => setMode('cloud')} data-testid="mode-cloud">
        <Cloud size={15} aria-hidden="true" /> حساب سحابي
      </button>
    </div>
  );
}

/* ───────── login ───────── */

export function LoginPage() {
  const { user, mode, expired } = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const next = params.get('next') || '';
  if (mode === 'local' && !local.hasAccounts()) return <Navigate to="/setup" replace />;
  if (user) return <Navigate to={next && canAccess(user.role, next) ? next : homeFor(user.role)} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!login.trim() || !password) return setError(mode === 'cloud' ? 'اكتب البريد الإلكتروني وكلمة المرور.' : 'اكتب اسم المستخدم وكلمة المرور.');
    setBusy(true);
    try {
      const u = await signIn(login, password);
      navigate(next && canAccess(u.role, next) ? next : homeFor(u.role), { replace: true });
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="تسجيل الدخول" testId="page-login">
      <ModeSwitch />
      {(expired || params.get('expired')) && (
        <p className="auth-note" role="status" data-testid="session-expired">
          انتهت الجلسة. سجّل الدخول من جديد.
        </p>
      )}
      <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
        <TextField label={mode === 'cloud' ? 'البريد الإلكتروني' : 'اسم المستخدم'} value={login} onChange={setLogin} autoComplete="username" dir="ltr" testId="login-user" type={mode === 'cloud' ? 'email' : 'text'} />
        <TextField label="كلمة المرور" value={password} onChange={setPassword} type="password" autoComplete="current-password" dir="ltr" testId="login-password" />
        <ErrorBox text={error} />
        <button type="submit" className="btn btn-primary btn-lg" disabled={busy} data-testid="login-submit">
          <LogIn size={18} aria-hidden="true" /> {busy ? 'جارٍ التحقق…' : 'دخول'}
        </button>
      </form>
      <p className="auth-links">
        <Link to="/recover" data-testid="to-recover">
          نسيت كلمة المرور؟
        </Link>
        {mode === 'cloud' && (
          <>
            {' · '}
            <Link to="/signup" data-testid="to-signup">
              إنشاء حساب
            </Link>
          </>
        )}
      </p>
      <p className="muted auth-small">
        {mode === 'cloud'
          ? 'الحساب السحابي يحتاج الإنترنت لتسجيل الدخول. الصلاحيات محفوظة ومحمية على الخادم.'
          : 'الحسابات المحلية محفوظة على هذا الجهاز فقط ويعمل الدخول دون إنترنت. الحسابات الجديدة ينشئها صاحب المشروع من «المستخدمون».'}
      </p>
    </AuthFrame>
  );
}

/* ───────── first run: the owner creates the admin account ───────── */

export function SetupPage() {
  const navigate = useNavigate();
  const { mode } = useAuth();
  const [username, setUsername] = useState('');
  const [name, setName] = useState('إبراهيم سمير محمود الخطيب');
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  if (mode === 'local' && local.hasAccounts() && !code) return <Navigate to="/login" replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const bad = local.checkUsername(username) ?? local.checkPassword(password) ?? (password !== again ? 'كلمتا المرور غير متطابقتين.' : null);
    if (bad) return setError(bad);
    setBusy(true);
    try {
      setCode(await local.setupOwner({ username, displayName: name, password }));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  if (code)
    return (
      <AuthFrame title="تم إنشاء حساب صاحب المشروع" testId="page-setup-done">
        <p>
          احفظ <strong>رمز الاستعادة</strong> هذا في مكان آمن. يُستخدم مرة واحدة إن نسيت كلمة المرور، ولن يظهر مرة أخرى:
        </p>
        <p className="recovery-code" dir="ltr" data-testid="recovery-code">
          {code}
        </p>
        <button
          type="button"
          className="btn btn-primary btn-lg"
          onClick={() => {
            refreshFromStorage();
            navigate('/', { replace: true });
          }}
          data-testid="setup-continue"
        >
          <ShieldCheck size={18} aria-hidden="true" /> حفظت الرمز، تابع
        </button>
      </AuthFrame>
    );

  return (
    <AuthFrame title="أول تشغيل: حساب صاحب المشروع" testId="page-setup">
      <ModeSwitch />
      {mode === 'cloud' ? (
        <CloudSetupHelp />
      ) : (
        <>
          <p className="muted">
            أنشئ حسابك أنت (الأدمن). كلمة المرور تختارها أنت ولا تُحفظ إلا مشفّرة (PBKDF2). كل البيانات الموجودة على هذا الجهاز تبقى كما هي وتصبح تحت إدارتك.
          </p>
          <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
            <TextField label="اسم المستخدم" value={username} onChange={setUsername} autoComplete="username" dir="ltr" testId="setup-user" hint="بالإنجليزية أو العربية، دون مسافات." />
            <TextField label="الاسم الظاهر" value={name} onChange={setName} testId="setup-name" />
            <TextField label="كلمة المرور" value={password} onChange={setPassword} type="password" autoComplete="new-password" dir="ltr" testId="setup-password" hint="8 أحرف على الأقل، فيها حروف وأرقام." />
            <TextField label="أعد كتابة كلمة المرور" value={again} onChange={setAgain} type="password" autoComplete="new-password" dir="ltr" testId="setup-password2" />
            <ErrorBox text={error} />
            <button type="submit" className="btn btn-primary btn-lg" disabled={busy} data-testid="setup-submit">
              <UserPlus size={18} aria-hidden="true" /> {busy ? 'جارٍ الإنشاء…' : 'إنشاء حساب الأدمن'}
            </button>
          </form>
        </>
      )}
    </AuthFrame>
  );
}

function CloudSetupHelp() {
  return (
    <div className="auth-help" data-testid="cloud-setup-help">
      <p>الحسابات السحابية تُدار على Supabase. لتفعيلها مرة واحدة:</p>
      <ol>
        <li>في لوحة Supabase: SQL Editor ← الصق محتوى الملف supabase/schema.sql ← Run.</li>
        <li>
          من صفحة <Link to="/signup">إنشاء حساب</Link> أنشئ حسابك ببريدك.
        </li>
        <li>في SQL Editor نفّذ سطر جعل حسابك أدمن (آخر سطر في الملف).</li>
      </ol>
      <p className="muted">كل حساب جديد يبدأ «طالبًا» على الخادم، ولا يصبح معلمًا أو أدمن إلا بقرار من الأدمن.</p>
      <Link to="/login" className="btn btn-primary">
        إلى تسجيل الدخول
      </Link>
    </div>
  );
}

/* ───────── forgotten password ───────── */

export function RecoverPage() {
  const mode = useAuth().mode;
  const [a, setA] = useState('');
  const [b, setB] = useState('');
  const [c, setC] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'cloud') {
        await cloud.cloudRecover(a);
        setDone('إن كان البريد مسجّلًا، فستصلك رسالة. افتح الرابط مباشرة منها: سيفتح نسخة الويب على صفحة «كلمة مرور جديدة». لا تطلب رابطًا ثانيًا قبل ساعة.');
      } else {
        const nextCode = await local.recoverOwner(c, a, b);
        setDone(`تم تعيين كلمة المرور. رمز الاستعادة الجديد (احفظه، القديم لم يعد يعمل): ${nextCode}`);
      }
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="استعادة كلمة المرور" testId="page-recover">
      {done ? (
        <>
          <p role="status" data-testid="recover-done">
            {done}
          </p>
          <Link to="/login" className="btn btn-primary">
            إلى تسجيل الدخول
          </Link>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
          {mode === 'cloud' ? (
            <TextField label="البريد الإلكتروني" value={a} onChange={setA} type="email" dir="ltr" testId="recover-email" />
          ) : (
            <>
              <p className="muted">
                <strong>للمعلمين والطلاب:</strong> صاحب المشروع يعيّن لك كلمة مرور جديدة من «المستخدمون». <strong>لصاحب المشروع:</strong> استخدم رمز الاستعادة الذي ظهر عند إنشاء الحساب.
              </p>
              <TextField label="اسم مستخدم الأدمن" value={a} onChange={setA} dir="ltr" testId="recover-user" />
              <TextField label="رمز الاستعادة" value={c} onChange={setC} dir="ltr" testId="recover-code" />
              <TextField label="كلمة المرور الجديدة" value={b} onChange={setB} type="password" dir="ltr" autoComplete="new-password" testId="recover-password" />
            </>
          )}
          <ErrorBox text={error} />
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy} data-testid="recover-submit">
            <KeyRound size={18} aria-hidden="true" /> {mode === 'cloud' ? 'أرسل رابط الاستعادة' : 'تعيين كلمة المرور'}
          </button>
          <Link to="/login">رجوع</Link>
        </form>
      )}
    </AuthFrame>
  );
}

/* ───────── 1.5.2: new password from a Supabase recovery link ───────── */

export function ResetPasswordPage() {
  const [pending] = useState(() => cloud.pendingRecovery());
  const [password, setPassword] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const weak = local.checkPassword(password);
    if (weak) return setError(weak);
    if (password !== again) return setError('كلمتا المرور غير متطابقتين.');
    setBusy(true);
    try {
      await cloud.cloudSetNewPassword(password);
      setMode('cloud');
      setDone(true);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <AuthFrame title="كلمة مرور جديدة" testId="page-reset-password">
      {done ? (
        <>
          <p role="status" data-testid="reset-done">
            تم تعيين كلمة المرور الجديدة لحسابك السحابي. ادخل بها الآن من أي نسخة (الويب أو Windows أو الهاتف). دورك وبياناتك كما هي.
          </p>
          <Link to="/login" className="btn btn-primary" data-testid="reset-to-login">
            إلى تسجيل الدخول
          </Link>
        </>
      ) : !pending?.token ? (
        <>
          <p className="auth-error" role="alert" data-testid="reset-invalid">
            <ShieldAlert size={16} aria-hidden="true" />{' '}
            {pending?.error === 'expired'
              ? 'انتهت صلاحية رابط الاستعادة أو استُخدم من قبل (بعض برامج البريد تفتح الروابط تلقائيًا للفحص).'
              : 'لا يوجد رابط استعادة صالح في هذه الصفحة.'}{' '}
            اطلب رابطًا جديدًا مرة واحدة، وافتحه مباشرة من رسالة البريد.
          </p>
          <Link to="/recover" className="btn btn-primary">
            طلب رابط جديد
          </Link>
        </>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
          <p className="muted">اختر كلمة مرور جديدة لحسابك السحابي. لن يتغير دورك ولا بياناتك.</p>
          <TextField label="كلمة المرور الجديدة" value={password} onChange={setPassword} type="password" autoComplete="new-password" dir="ltr" testId="reset-password" hint="8 أحرف على الأقل، فيها حروف وأرقام." />
          <TextField label="أعد كتابة كلمة المرور" value={again} onChange={setAgain} type="password" autoComplete="new-password" dir="ltr" testId="reset-password2" />
          <ErrorBox text={error} />
          <button type="submit" className="btn btn-primary btn-lg" disabled={busy} data-testid="reset-submit">
            <KeyRound size={18} aria-hidden="true" /> {busy ? 'جارٍ الحفظ…' : 'حفظ كلمة المرور'}
          </button>
        </form>
      )}
    </AuthFrame>
  );
}

/* ───────── cloud sign-up ───────── */

export function SignUpPage() {
  const { mode } = useAuth();
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  if (mode !== 'cloud') return <Navigate to="/login" replace />;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    const bad = local.checkPassword(password);
    if (bad) return setError(bad);
    try {
      const r = await cloud.cloudSignUp(email, password, name);
      setDone(r === 'confirm' ? 'أُنشئ الحساب. افتح رسالة التأكيد في بريدك، ثم سجّل الدخول. يبدأ الحساب «طالبًا» حتى يغيّر الأدمن دوره.' : 'أُنشئ الحساب. سجّل الدخول الآن.');
    } catch (err) {
      setError(message(err));
    }
  };
  return (
    <AuthFrame title="إنشاء حساب سحابي" testId="page-signup">
      {done ? (
        <p role="status">{done}</p>
      ) : (
        <form onSubmit={(e) => void submit(e)} noValidate className="auth-form">
          <TextField label="الاسم" value={name} onChange={setName} testId="signup-name" />
          <TextField label="البريد الإلكتروني" value={email} onChange={setEmail} type="email" dir="ltr" testId="signup-email" />
          <TextField label="كلمة المرور" value={password} onChange={setPassword} type="password" dir="ltr" autoComplete="new-password" testId="signup-password" />
          <ErrorBox text={error} />
          <button type="submit" className="btn btn-primary btn-lg" data-testid="signup-submit">
            إنشاء الحساب
          </button>
        </form>
      )}
      <Link to="/login">إلى تسجيل الدخول</Link>
    </AuthFrame>
  );
}

/* ───────── guard ───────── */

/** Every route goes through here: no session → login; wrong role → «لا تملك صلاحية». */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, mode, checking } = useAuth();
  const loc = useLocation();
  useEffect(() => {
    void revalidate();
  }, [loc.pathname]);
  if (mode === 'local' && !local.hasAccounts()) return <Navigate to="/setup" replace />;
  if (checking && !user) return <div className="auth-wrap" aria-busy="true" />;
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />;
  if (!canAccess(user.role, loc.pathname)) return <Forbidden home={homeFor(user.role)} />;
  return <>{children}</>;
}

export function Forbidden({ home }: { home: string }) {
  const { user } = useAuth();
  return (
    <main className="auth-wrap" data-testid="page-forbidden">
      <section className="card auth-card">
        <h1 className="auth-title">
          <ShieldAlert size={22} aria-hidden="true" /> لا تملك صلاحية فتح هذه الصفحة
        </h1>
        <p className="muted">حسابك: {user ? `${user.displayName} (${ROLE_LABEL[user.role]})` : '—'}.</p>
        <Link to={home} className="btn btn-primary" data-testid="forbidden-home">
          العودة إلى صفحتك الرئيسية
        </Link>
      </section>
    </main>
  );
}
