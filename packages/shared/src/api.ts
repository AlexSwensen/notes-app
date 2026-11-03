import type { Note } from './note.ts';

/** The public view of an account (never includes the password hash). */
export interface User {
  id: string;
  email: string;
}

/** Any non-2xx response body. */
export interface ErrorResponse {
  error: string;
}

/** `GET /api/config` */
export interface ConfigResponse {
  allowSignup: boolean;
}

/** `POST /api/auth/signup` and `POST /api/auth/login` */
export interface AuthRequest {
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

/**
 * `POST /api/auth/login` when the account has two-factor enabled: the password was
 * correct, but a second factor is still required. Exchange `challenge` + a code at
 * `POST /api/auth/login/2fa`. The challenge is short-lived.
 */
export interface TwoFactorChallengeResponse {
  twoFactorRequired: true;
  challenge: string;
}

/** `POST /api/auth/login` returns one or the other depending on the account. */
export type LoginResponse = AuthResponse | TwoFactorChallengeResponse;

/** `POST /api/auth/login/2fa`: finish a challenged login with a TOTP or recovery code. */
export interface TwoFactorLoginRequest {
  challenge: string;
  code: string;
}

/** A registered authenticator app / device. `confirmed` is false until its first valid code. */
export interface TwoFactorDevice {
  id: string;
  name: string;
  confirmed: boolean;
  createdAt: number;
  lastUsedAt: number | null;
}

/** `GET /api/2fa`: the account's two-factor state. */
export interface TwoFactorStatus {
  enabled: boolean;
  devices: TwoFactorDevice[];
  recoveryCodesRemaining: number;
}

/** `POST /api/2fa/devices`: begin enrolling a new device. */
export interface EnrollDeviceRequest {
  name: string;
}

/** The TOTP secret and `otpauth://` URI to show as a QR code during enrollment. */
export interface EnrollDeviceResponse {
  id: string;
  name: string;
  secret: string;
  uri: string;
}

/** `POST /api/2fa/devices/:id/confirm`: prove the device works with a current code. */
export interface ConfirmDeviceRequest {
  code: string;
}

/**
 * Recovery codes are returned exactly once, only when confirming the device that first
 * enables two-factor. Save them somewhere safe — they are the only way back into a locked
 * account and cannot be shown again.
 */
export interface ConfirmDeviceResponse {
  confirmed: true;
  recoveryCodes?: string[];
}

/** `POST /api/2fa/recovery-codes`: regenerate (and invalidate the previous) recovery codes. */
export interface RecoveryCodesResponse {
  recoveryCodes: string[];
}

/** `POST /api/me/profile`: update editable profile fields. */
export interface UpdateProfileRequest {
  email: string;
}

/** `POST /api/me/password`: change the account password. */
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}


/** `POST /api/sync`: push local changes and pull everything newer than `since`. */
export interface SyncRequest<Content = unknown> {
  /** The last server sequence number this device has seen. */
  since: number;
  /** Identifies this browser tab, so the server doesn't notify it about its own changes. */
  clientId: string;
  changes: Note<Content>[];
}

export interface SyncResponse<Content = unknown> {
  seq: number;
  /** `true` if there are more changes to pull; call sync again with the new `seq`. */
  more: boolean;
  changes: Note<Content>[];
}
