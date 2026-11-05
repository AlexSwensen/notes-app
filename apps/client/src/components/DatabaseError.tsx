import { useState } from 'react';
import { resetLocalData } from '../lib/db';

/** Shown when the browser can't open the local IndexedDB database (e.g. Chrome's "UnknownError: Internal error"). */
export function DatabaseError({ error }: { error: unknown }) {
  const [busy, setBusy] = useState(false);
  const [resetFailed, setResetFailed] = useState(false);
  const message = error instanceof Error ? error.message : String(error);

  async function reset() {
    setBusy(true);
    setResetFailed(false);
    try {
      await resetLocalData();
      window.location.reload();
    } catch {
      setResetFailed(true);
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full grid place-items-center p-6 bg-sidebar">
      <div className="w-full max-w-[420px] flex flex-col gap-3.5 bg-bg p-8 rounded-xl shadow-pop">
        <div className="text-4xl">⚠️</div>
        <h1 className="text-2xl font-bold">Can't open local storage</h1>
        <p className="text-sm text-muted">
          Your browser couldn't open this device's copy of your notes. Resetting local data deletes
          it and downloads your notes from the server again. Changes that hadn't synced yet will be
          lost.
        </p>
        <pre className="text-xs text-faint whitespace-pre-wrap break-words">{message}</pre>
        {resetFailed && (
          <div className="text-danger text-[13px]" role="alert">
            Couldn't reset local data. Clear this site's data in your browser settings, then reload.
          </div>
        )}
        <button
          className="bg-accent text-white rounded-md px-3.5 py-[9px] font-medium hover:brightness-108 disabled:opacity-60"
          disabled={busy}
          onClick={reset}
        >
          {busy ? 'Resetting…' : 'Reset local data'}
        </button>
        <button
          className="text-sm text-muted hover:text-fg"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    </div>
  );
}
