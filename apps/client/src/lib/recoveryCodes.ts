/** The text file a user downloads to keep their recovery codes. */
export function recoveryCodesFile(codes: string[]): string {
  return (
    'Sheafly recovery codes\n\n' +
    'Keep these somewhere safe. Each code can be used once to sign in if you lose your\n' +
    'authenticator device. Without them you cannot recover your account.\n\n' +
    codes.join('\n') +
    '\n'
  );
}

/** Triggers a browser download of the recovery codes as a plain-text file. */
export function downloadRecoveryCodes(codes: string[]) {
  const url = URL.createObjectURL(new Blob([recoveryCodesFile(codes)], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'sheafly-recovery-codes.txt';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
