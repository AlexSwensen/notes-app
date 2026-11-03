import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Auth } from './Auth';
import { session } from '../lib/api';
import { jsonResponse } from '../test/factories';

/** Answers `/api/config` with `allowSignup` and every other call with `respond`. */
function mockApi(respond: (path: string, body: unknown) => Response | Promise<Response>, allowSignup = true) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    if (path === '/api/config') return jsonResponse({ allowSignup });
    return respond(path, init?.body ? JSON.parse(init.body as string) : undefined);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function fillIn(email: string, password: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), password);
  return user;
}

describe('Auth', () => {
  it('logs in, stores the session and reports success', async () => {
    const fetchMock = mockApi(() => jsonResponse({ token: 'tok', user: { id: 'u1', email: 'a@example.com' } }));
    const onAuthed = vi.fn();
    render(<Auth onAuthed={onAuthed} />);

    const user = await fillIn('a@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    await waitFor(() => expect(onAuthed).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({ method: 'POST' }));
    expect(session.token).toBe('tok');
    expect(session.user).toEqual({ id: 'u1', email: 'a@example.com' });
  });

  it('switches to sign-up and posts to the signup endpoint', async () => {
    const fetchMock = mockApi(() => jsonResponse({ token: 'tok', user: { id: 'u1', email: 'new@example.com' } }));
    const onAuthed = vi.fn();
    render(<Auth onAuthed={onAuthed} />);

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /Sign up/ }));
    expect(screen.getByRole('heading', { name: 'Create your account' })).toBeTruthy();
    expect(screen.getByLabelText('Password').getAttribute('minlength')).toBe('8');

    await fillIn('new@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: 'Sign up' }));

    await waitFor(() => expect(onAuthed).toHaveBeenCalled());
    const [path, init] = fetchMock.mock.calls.at(-1)!;
    expect(path).toBe('/api/auth/signup');
    expect(JSON.parse(init!.body as string)).toEqual({ email: 'new@example.com', password: 'password123' });
  });

  it('shows the server error and stays on the form', async () => {
    mockApi(() => jsonResponse({ error: 'Invalid email or password' }, 401));
    const onAuthed = vi.fn();
    render(<Auth onAuthed={onAuthed} />);

    const user = await fillIn('a@example.com', 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Invalid email or password');
    expect(onAuthed).not.toHaveBeenCalled();
    expect(session.token).toBeNull();
    expect(screen.getByRole('button', { name: 'Log in' })).toHaveProperty('disabled', false);
  });

  it('explains when the server cannot be reached', async () => {
    mockApi(() => Promise.reject(new TypeError('Failed to fetch')));
    render(<Auth onAuthed={() => {}} />);

    const user = await fillIn('a@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Cannot reach the server/);
  });

  it('hides the sign-up link when the server has sign-ups disabled', async () => {
    const fetchMock = mockApi(() => jsonResponse({}), false);
    render(<Auth onAuthed={() => {}} />);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/config', expect.anything()));
    await waitFor(() => expect(screen.queryByRole('button', { name: /Sign up/ })).toBeNull());
  });
});

describe('Auth with two-factor', () => {
  const challenged = () => jsonResponse({ twoFactorRequired: true, challenge: 'chal' });
  const authed = () => jsonResponse({ token: 'tok', user: { id: 'u1', email: 'a@example.com' } });

  it('asks for a code after the password, then logs in with it', async () => {
    const fetchMock = mockApi((path) => (path === '/api/auth/login' ? challenged() : authed()));
    const onAuthed = vi.fn();
    render(<Auth onAuthed={onAuthed} />);

    const user = await fillIn('a@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('heading', { name: 'Two-factor authentication' })).toBeTruthy();
    expect(onAuthed).not.toHaveBeenCalled();
    expect(session.token).toBeNull();

    await user.type(screen.getByLabelText('Verification code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(onAuthed).toHaveBeenCalledOnce());
    const [path, init] = fetchMock.mock.calls.at(-1)!;
    expect(path).toBe('/api/auth/login/2fa');
    expect(JSON.parse(init!.body as string)).toEqual({ challenge: 'chal', code: '123456' });
    expect(session.token).toBe('tok');
  });

  it('accepts a recovery code instead', async () => {
    const fetchMock = mockApi((path) => (path === '/api/auth/login' ? challenged() : authed()));
    render(<Auth onAuthed={() => {}} />);

    const user = await fillIn('a@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.click(await screen.findByRole('button', { name: /Use a recovery code/ }));
    await user.type(screen.getByLabelText('Recovery code'), 'abcde-12345');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    await waitFor(() => expect(session.token).toBe('tok'));
    expect(JSON.parse(fetchMock.mock.calls.at(-1)![1]!.body as string).code).toBe('abcde-12345');
  });

  it('shows an error for a wrong code and lets the user go back', async () => {
    mockApi((path) => (path === '/api/auth/login' ? challenged() : jsonResponse({ error: 'That code is not valid' }, 401)));
    render(<Auth onAuthed={() => {}} />);

    const user = await fillIn('a@example.com', 'password123');
    await user.click(screen.getByRole('button', { name: 'Log in' }));
    await user.type(await screen.findByLabelText('Verification code'), '000000');
    await user.click(screen.getByRole('button', { name: 'Verify' }));

    expect((await screen.findByRole('alert')).textContent).toBe('That code is not valid');
    await user.click(screen.getByRole('button', { name: 'Back to login' }));
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeTruthy();
  });
});
