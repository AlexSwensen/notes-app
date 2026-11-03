import { useEffect, useState, type FormEvent } from 'react';
import type { AuthRequest, AuthResponse, ConfigResponse, LoginResponse, TwoFactorLoginRequest } from '@sheafly/shared';
import { api, session } from '../lib/api';

const labelClass = 'flex flex-col gap-1.5 text-[13px] text-muted';
const inputClass =
  'px-2.5 py-2 border border-line rounded-md bg-hover text-fg text-[15px] outline-none focus:border-accent focus:ring-3 focus:ring-accent/25';

export function Auth({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [allowSignup, setAllowSignup] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [useRecovery, setUseRecovery] = useState(false);

  useEffect(() => {
    api<ConfigResponse>('/api/config').then((c) => setAllowSignup(c.allowSignup)).catch(() => {});
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (challenge) {
        const body: TwoFactorLoginRequest = { challenge, code };
        const res = await api<AuthResponse>('/api/auth/login/2fa', body);
        session.set(res.token, res.user);
        onAuthed();
        return;
      }
      const body: AuthRequest = { email, password };
      const res = await api<LoginResponse>(`/api/auth/${mode}`, body);
      if ('twoFactorRequired' in res) {
        setChallenge(res.challenge);
        return;
      }
      session.set(res.token, res.user);
      onAuthed();
    } catch (err) {
      setError(err instanceof TypeError ? 'Cannot reach the server. Check your connection.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (challenge) {
    return (
      <div className="min-h-full grid place-items-center p-6 bg-sidebar">
        <form className="w-full max-w-[360px] flex flex-col gap-3.5 bg-bg p-8 rounded-xl shadow-pop" onSubmit={submit}>
          <div className="text-4xl">🔐</div>
          <h1 className="text-2xl font-bold">Two-factor authentication</h1>
          <p className="-mt-2 mb-1 text-sm text-muted">
            {useRecovery ? 'Enter one of your saved recovery codes.' : 'Enter the 6-digit code from your authenticator app.'}
          </p>
          <label className={labelClass}>
            {useRecovery ? 'Recovery code' : 'Verification code'}
            <input
              className={inputClass}
              inputMode={useRecovery ? 'text' : 'numeric'}
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </label>
          {error && <div className="text-danger text-[13px]" role="alert">{error}</div>}
          <button className="bg-accent text-white rounded-md px-3.5 py-[9px] font-medium hover:brightness-108 disabled:opacity-60" disabled={busy}>
            {busy ? 'Please wait…' : 'Verify'}
          </button>
          <button type="button" className="link-btn" onClick={() => { setUseRecovery(!useRecovery); setCode(''); setError(''); }}>
            {useRecovery ? 'Use your authenticator app instead' : 'Lost your device? Use a recovery code'}
          </button>
          <button type="button" className="link-btn" onClick={() => { setChallenge(null); setCode(''); setError(''); }}>
            Back to login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="min-h-full grid place-items-center p-6 bg-sidebar">
      <form className="w-full max-w-[360px] flex flex-col gap-3.5 bg-bg p-8 rounded-xl shadow-pop" onSubmit={submit}>
        <div className="text-4xl">📝</div>
        <h1 className="text-2xl font-bold">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h1>
        <p className="-mt-2 mb-1 text-sm text-muted">Your notes, synced across all your devices.</p>
        <label className={labelClass}>
          Email
          <input className={inputClass} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        <label className={labelClass}>
          Password
          <input
            className={inputClass}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <div className="text-danger text-[13px]" role="alert">{error}</div>}
        <button className="bg-accent text-white rounded-md px-3.5 py-[9px] font-medium hover:brightness-108 disabled:opacity-60" disabled={busy}>
          {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Sign up'}
        </button>
        {(allowSignup || mode === 'signup') && (
          <button type="button" className="link-btn" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
            {mode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Log in'}
          </button>
        )}
      </form>
    </div>
  );
}
