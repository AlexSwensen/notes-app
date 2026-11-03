// Types shared by the client and the server. Keep this package type-only:
// the server imports it with `import type`, so nothing here exists at runtime.
export type { Note } from './note.ts';
export type {
  User,
  ConfigResponse,
  AuthRequest,
  AuthResponse,
  TwoFactorChallengeResponse,
  LoginResponse,
  TwoFactorLoginRequest,
  TwoFactorDevice,
  TwoFactorStatus,
  EnrollDeviceRequest,
  EnrollDeviceResponse,
  ConfirmDeviceRequest,
  ConfirmDeviceResponse,
  RecoveryCodesResponse,
  UpdateProfileRequest,
  ChangePasswordRequest,
  SyncRequest,
  SyncResponse,
  ErrorResponse,
} from './api.ts';
