import { downloadRecoveryCodes } from '../lib/recoveryCodes';
import { secondaryBtn } from './styles';

/**
 * Shows freshly generated recovery codes with a prominent warning. Codes are shown exactly
 * once, so the user must download or copy them and confirm before continuing.
 */
export function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join('\n'));
    } catch {
      // Clipboard access can be blocked; downloading is always available as a fallback.
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div role="alert" className="text-[13px] bg-mark text-fg rounded-md px-3 py-2">
        Save these recovery codes somewhere safe. Each one works once. <strong>Without them you cannot recover your
        account</strong> if you lose your authenticator device — they will not be shown again.
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-sm bg-hover rounded-md p-3">
        {codes.map((code) => (
          <li key={code}>{code}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <button className={secondaryBtn} onClick={() => downloadRecoveryCodes(codes)}>⬇ Download</button>
        <button className={secondaryBtn} onClick={copy}>⧉ Copy</button>
        <button className="ml-auto bg-accent text-white rounded-md px-3.5 py-[7px] text-sm font-medium hover:brightness-108" onClick={onDone}>
          I’ve saved them
        </button>
      </div>
    </div>
  );
}
