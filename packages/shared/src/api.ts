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
