import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type {
  ChangePasswordRequest,
  ConfirmDeviceResponse,
  EnrollDeviceResponse,
  RecoveryCodesResponse,
  TwoFactorStatus,
  UpdateProfileRequest,
  User,
} from '@sheafly/shared';
import { api, session } from '../lib/api';
import { QrCode } from './QrCode';
import { RecoveryCodes } from './RecoveryCodes';
import { secondaryBtn } from './styles';

const inputClass =
  'px-2.5 py-1.5 border border-line rounded-md bg-hover text-fg text-sm outline-none focus:border-accent focus:ring-3 focus:ring-accent/25';
const labelClass = 'flex flex-col gap-1 text-[13px] text-muted';
const primaryBtn = 'bg-accent text-white rounded-md px-3.5 py-[7px] text-sm font-medium hover:brightness-108 disabled:opacity-60';
const sectionClass = 'flex flex-col gap-3 border-t border-line pt-4';

const message = (err: unknown) => (err instanceof TypeError ? 'Cannot reach the server.' : (err as Error).message);

function ProfileSection({ user, onUserChange }: { user: User; onUserChange: (u: User) => void }) {
  const [email, setEmail] = useState(user.email);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      const body: UpdateProfileRequest = { email };
      const updated = await api<User>('/api/me/profile', body);
      session.set(session.token!, updated);
      onUserChange(updated);
      setStatus('Saved');
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <h3 className="font-semibold">Profile</h3>
      <label className={labelClass}>
        Email
        <input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      </label>
      {error && <div role="alert" className="text-danger text-[13px]">{error}</div>}
      <div className="flex items-center gap-3">
        <button className={primaryBtn} disabled={email.trim() === user.email}>Save</button>
        {status && <span className="text-[13px] text-muted">{status}</span>}
      </div>
    </form>
  );
}

function PasswordSection() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setStatus('');
    try {
      const body: ChangePasswordRequest = { currentPassword, newPassword };
      await api('/api/me/password', body);
      setCurrent('');
      setNew('');
      setStatus('Password changed');
    } catch (err) {
      setError(message(err));
    }
  }

  return (
    <form className={sectionClass} onSubmit={submit}>
      <h3 className="font-semibold">Password</h3>
      <label className={labelClass}>
        Current password
        <input className={inputClass} type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label className={labelClass}>
        New password
        <input className={inputClass} type="password" autoComplete="new-password" required minLength={8} value={newPassword} onChange={(e) => setNew(e.target.value)} />
      </label>
      {error && <div role="alert" className="text-danger text-[13px]">{error}</div>}
      <div className="flex items-center gap-3">
        <button className={primaryBtn}>Change password</button>
        {status && <span className="text-[13px] text-muted">{status}</span>}
      </div>
    </form>
  );
}

type Step =
  | { kind: 'idle' }
  | { kind: 'naming' }
  | { kind: 'scanning'; enrollment: EnrollDeviceResponse }
  | { kind: 'codes'; codes: string[] }
  | { kind: 'regenerate' };

export function TwoFactorSection() {
  const [status, setStatus] = useState<TwoFactorStatus | null>(null);
  const [step, setStep] = useState<Step>({ kind: 'idle' });
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const refresh = useCallback(() => api<TwoFactorStatus>('/api/2fa').then(setStatus, (err) => setError(message(err))), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const reset = (next: Step) => {
    setError('');
    setCode('');
    setPassword('');
    setStep(next);
  };

  async function startEnroll(e: FormEvent) {
    e.preventDefault();
    try {
      const enrollment = await api<EnrollDeviceResponse>('/api/2fa/devices', { name });
      setName('');
      reset({ kind: 'scanning', enrollment });
    } catch (err) {
      setError(message(err));
    }
  }

  async function verifyDevice(e: FormEvent, id: string) {
    e.preventDefault();
    try {
      const res = await api<ConfirmDeviceResponse>(`/api/2fa/devices/${encodeURIComponent(id)}/confirm`, { code });
      await refresh();
      reset(res.recoveryCodes ? { kind: 'codes', codes: res.recoveryCodes } : { kind: 'idle' });
    } catch (err) {
      setError(message(err));
    }
  }

  async function remove(id: string, deviceName: string) {
    const last = status?.devices.length === 1;
    const warning = last ? ' This is your last device, so two-factor authentication will be turned off.' : '';
    if (!window.confirm(`Remove “${deviceName}”?${warning}`)) return;
    try {
      await api(`/api/2fa/devices/${encodeURIComponent(id)}/delete`, {});
      await refresh();
    } catch (err) {
      setError(message(err));
    }
  }

  async function regenerate(e: FormEvent) {
    e.preventDefault();
    try {
      const res = await api<RecoveryCodesResponse>('/api/2fa/recovery-codes', { password });
      await refresh();
      reset({ kind: 'codes', codes: res.recoveryCodes });
    } catch (err) {
      setError(message(err));
    }
  }

  if (!status) {
    return (
      <section className={sectionClass}>
        <h3 className="font-semibold">Two-factor authentication</h3>
        {error ? <div role="alert" className="text-danger text-[13px]">{error}</div> : <div className="text-[13px] text-muted">Loading…</div>}
      </section>
    );
  }

  return (
    <section className={sectionClass}>
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Two-factor authentication</h3>
        <span className={`text-xs rounded px-1.5 py-0.5 ${status.enabled ? 'bg-ok/20 text-fg' : 'bg-hover text-muted'}`}>
          {status.enabled ? 'On' : 'Off'}
        </span>
      </div>
      <p className="text-[13px] text-muted">
        Require a code from an authenticator app (such as Google Authenticator, 1Password or Authy) when you log in.
      </p>

      {step.kind === 'codes' ? (
        <RecoveryCodes codes={step.codes} onDone={() => reset({ kind: 'idle' })} />
      ) : step.kind === 'scanning' ? (
        <form className="flex flex-col gap-3" onSubmit={(e) => verifyDevice(e, step.enrollment.id)}>
          <p className="text-[13px]">Scan this QR code with your authenticator app, then enter the 6-digit code it shows.</p>
          <QrCode value={step.enrollment.uri} />
          <details className="text-[13px] text-muted">
            <summary className="cursor-pointer">Can’t scan? Enter this key manually</summary>
            <code className="block mt-1 font-mono break-all text-fg">{step.enrollment.secret}</code>
          </details>
          <label className={labelClass}>
            Verification code
            <input
              className={inputClass}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9 ]{6,7}"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && <div role="alert" className="text-danger text-[13px]">{error}</div>}
          <div className="flex gap-2">
            <button className={primaryBtn}>Verify and enable</button>
            <button type="button" className={secondaryBtn} onClick={() => reset({ kind: 'idle' })}>Cancel</button>
          </div>
        </form>
      ) : (
        <>
          {status.devices.length > 0 && (
            <ul className="flex flex-col gap-1" aria-label="Two-factor devices">
              {status.devices.map((d) => (
                <li key={d.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded-md bg-hover text-sm">
                  <span>🔐</span>
                  <span className="flex-1 truncate">{d.name}</span>
                  <span className="text-xs text-faint">Added {new Date(d.createdAt).toLocaleDateString()}</span>
                  <button className="danger-btn" onClick={() => remove(d.id, d.name)}>Remove</button>
                </li>
              ))}
            </ul>
          )}

          {step.kind === 'naming' ? (
            <form className="flex flex-col gap-3" onSubmit={startEnroll}>
              <label className={labelClass}>
                Device name
                <input className={inputClass} required maxLength={60} placeholder="e.g. My phone" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
              </label>
              {error && <div role="alert" className="text-danger text-[13px]">{error}</div>}
              <div className="flex gap-2">
                <button className={primaryBtn}>Continue</button>
                <button type="button" className={secondaryBtn} onClick={() => reset({ kind: 'idle' })}>Cancel</button>
              </div>
            </form>
          ) : step.kind === 'regenerate' ? (
            <form className="flex flex-col gap-3" onSubmit={regenerate}>
              <p className="text-[13px] text-muted">Your current recovery codes will stop working.</p>
              <label className={labelClass}>
                Confirm your password
                <input className={inputClass} type="password" autoComplete="current-password" required autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
              </label>
              {error && <div role="alert" className="text-danger text-[13px]">{error}</div>}
              <div className="flex gap-2">
                <button className={primaryBtn}>Generate new codes</button>
                <button type="button" className={secondaryBtn} onClick={() => reset({ kind: 'idle' })}>Cancel</button>
              </div>
            </form>
          ) : (
            <>
              {error && <div role="alert" className="text-danger text-[13px]">{error}</div>}
              <div className="flex flex-wrap items-center gap-2">
                <button className={primaryBtn} onClick={() => reset({ kind: 'naming' })}>
                  {status.enabled ? 'Add another device' : 'Enable two-factor'}
                </button>
                {status.enabled && (
                  <button className={secondaryBtn} onClick={() => reset({ kind: 'regenerate' })}>New recovery codes</button>
                )}
              </div>
              {status.enabled && (
                <p className="text-xs text-faint">{status.recoveryCodesRemaining} unused recovery code(s) left.</p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}

export function ProfileDialog({ user, onUserChange, onClose }: { user: User; onUserChange: (u: User) => void; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-100 bg-[rgba(15,15,15,0.45)] flex justify-center items-start pt-[8vh] px-4 pb-4 overflow-y-auto" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Account settings"
        className="w-full max-w-[480px] bg-elevated rounded-xl shadow-pop p-6 flex flex-col gap-4 text-fg"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Account settings</h2>
          <button className="icon-btn" title="Close" onClick={onClose}>✕</button>
        </div>
        <ProfileSection user={user} onUserChange={onUserChange} />
        <PasswordSection />
        <TwoFactorSection />
      </div>
    </div>
  );
}
