import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { TwoFactorStatus } from '@sheafly/shared';
import { ProfileDialog } from './ProfileDialog';
import { session } from '../lib/api';
import { jsonResponse } from '../test/factories';

vi.mock('qrcode', () => ({ default: { toString: vi.fn(async () => '<svg data-testid="qr"></svg>') } }));

const user = { id: 'u1', email: 'ada@example.com' };
const off: TwoFactorStatus = { enabled: false, devices: [], recoveryCodesRemaining: 0 };
const on: TwoFactorStatus = {
  enabled: true,
  devices: [{ id: 'd1', name: 'Phone', confirmed: true, createdAt: 0, lastUsedAt: null }],
  recoveryCodesRemaining: 10,
};

type Route = (body: unknown) => Response | Promise<Response>;

/** Routes fetch calls by path; `/api/2fa` returns the latest `status`. */
function mockApi(routes: Record<string, Route>, status: () => TwoFactorStatus = () => off) {
  const fetchMock = vi.fn(async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    if (path === '/api/2fa') return jsonResponse(status());
    const route = routes[path];
    if (!route) throw new Error(`unexpected ${path}`);
    return route(body);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderDialog(props: Partial<Parameters<typeof ProfileDialog>[0]> = {}) {
  session.set('tok', user);
  const onUserChange = vi.fn();
  const onClose = vi.fn();
  render(<ProfileDialog user={user} onUserChange={onUserChange} onClose={onClose} {...props} />);
  return { onUserChange, onClose, ui: userEvent.setup() };
}

const twoFactor = () => screen.getByRole('heading', { name: 'Two-factor authentication' }).closest('section') as HTMLElement;

describe('ProfileDialog: profile and password', () => {
  it('updates the email and the stored session', async () => {
    const fetchMock = mockApi({ '/api/me/profile': (b) => jsonResponse({ id: 'u1', ...(b as object) }) });
    const { onUserChange, ui } = renderDialog();

    const email = screen.getByLabelText('Email');
    await ui.clear(email);
    await ui.type(email, 'new@example.com');
    await ui.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onUserChange).toHaveBeenCalledWith({ id: 'u1', email: 'new@example.com' }));
    expect(session.user?.email).toBe('new@example.com');
    expect(fetchMock).toHaveBeenCalledWith('/api/me/profile', expect.objectContaining({ method: 'POST' }));
  });

  it('shows a profile error from the server', async () => {
    mockApi({ '/api/me/profile': () => jsonResponse({ error: 'An account with that email already exists' }, 409) });
    const { ui } = renderDialog();
    await ui.clear(screen.getByLabelText('Email'));
    await ui.type(screen.getByLabelText('Email'), 'taken@example.com');
    await ui.click(screen.getByRole('button', { name: 'Save' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/already exists/);
  });

  it('changes the password', async () => {
    const fetchMock = mockApi({ '/api/me/password': () => jsonResponse({ ok: true }) });
    const { ui } = renderDialog();
    await ui.type(screen.getByLabelText('Current password'), 'password123');
    await ui.type(screen.getByLabelText('New password'), 'brand-new-pass');
    await ui.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Password changed')).toBeTruthy();
    const [, init] = fetchMock.mock.calls.find(([p]) => p === '/api/me/password')!;
    expect(JSON.parse(init!.body as string)).toEqual({ currentPassword: 'password123', newPassword: 'brand-new-pass' });
  });

  it('closes on Escape and the close button', async () => {
    mockApi({});
    const { onClose, ui } = renderDialog();
    await ui.keyboard('{Escape}');
    await ui.click(screen.getByTitle('Close'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});

describe('ProfileDialog: two-factor', () => {
  it('enables 2FA: names a device, shows the QR code, verifies and shows recovery codes once', async () => {
    let status = off;
    const codes = Array.from({ length: 10 }, (_, i) => `code${i}-xxxxx`);
    const fetchMock = mockApi(
      {
        '/api/2fa/devices': () => jsonResponse({ id: 'd1', name: 'Phone', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://totp/x' }),
        '/api/2fa/devices/d1/confirm': () => {
          status = on;
          return jsonResponse({ confirmed: true, recoveryCodes: codes });
        },
      },
      () => status,
    );
    const { ui } = renderDialog();

    await ui.click(await within(twoFactor()).findByRole('button', { name: 'Enable two-factor' }));
    await ui.type(screen.getByLabelText('Device name'), 'Phone');
    await ui.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('img', { name: /QR code/ })).toBeTruthy();
    expect(screen.getByText('JBSWY3DPEHPK3PXP')).toBeTruthy();
    await ui.type(screen.getByLabelText('Verification code'), '123456');
    await ui.click(screen.getByRole('button', { name: 'Verify and enable' }));

    // The safety warning and every code are shown.
    expect((await screen.findByText(/cannot recover your/)).textContent).toBeTruthy();
    for (const c of codes) expect(screen.getByText(c)).toBeTruthy();

    await ui.click(screen.getByRole('button', { name: 'I’ve saved them' }));
    expect(screen.queryByText(codes[0])).toBeNull();
    expect(within(twoFactor()).getByText('Phone')).toBeTruthy();
    expect(within(twoFactor()).getByText('On')).toBeTruthy();
    const confirmCall = fetchMock.mock.calls.find(([p]) => p === '/api/2fa/devices/d1/confirm')!;
    expect(JSON.parse(confirmCall[1]!.body as string)).toEqual({ code: '123456' });
  });

  it('shows an error for a wrong verification code', async () => {
    mockApi({
      '/api/2fa/devices': () => jsonResponse({ id: 'd1', name: 'Phone', secret: 'S', uri: 'otpauth://totp/x' }),
      '/api/2fa/devices/d1/confirm': () => jsonResponse({ error: 'That code is not valid.' }, 400),
    });
    const { ui } = renderDialog();
    await ui.click(await screen.findByRole('button', { name: 'Enable two-factor' }));
    await ui.type(screen.getByLabelText('Device name'), 'Phone');
    await ui.click(screen.getByRole('button', { name: 'Continue' }));
    await ui.type(await screen.findByLabelText('Verification code'), '000000');
    await ui.click(screen.getByRole('button', { name: 'Verify and enable' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/not valid/);
  });

  it('adds a second device without showing recovery codes', async () => {
    let status = on;
    mockApi(
      {
        '/api/2fa/devices': () => jsonResponse({ id: 'd2', name: 'Laptop', secret: 'S', uri: 'otpauth://totp/x' }),
        '/api/2fa/devices/d2/confirm': () => {
          status = { ...on, devices: [...on.devices, { id: 'd2', name: 'Laptop', confirmed: true, createdAt: 0, lastUsedAt: null }] };
          return jsonResponse({ confirmed: true });
        },
      },
      () => status,
    );
    const { ui } = renderDialog();
    await ui.click(await screen.findByRole('button', { name: 'Add another device' }));
    await ui.type(screen.getByLabelText('Device name'), 'Laptop');
    await ui.click(screen.getByRole('button', { name: 'Continue' }));
    await ui.type(await screen.findByLabelText('Verification code'), '123456');
    await ui.click(screen.getByRole('button', { name: 'Verify and enable' }));

    expect(await within(twoFactor()).findByText('Laptop')).toBeTruthy();
    expect(screen.queryByText(/cannot recover your/)).toBeNull();
  });

  it('removes a device after confirmation, warning when it is the last one', async () => {
    let status = on;
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    mockApi(
      {
        '/api/2fa/devices/d1/delete': () => {
          status = off;
          return jsonResponse({ ok: true });
        },
      },
      () => status,
    );
    const { ui } = renderDialog();
    await ui.click(await screen.findByRole('button', { name: 'Remove' }));

    expect(confirmSpy.mock.calls[0][0]).toMatch(/last device/);
    await waitFor(() => expect(within(twoFactor()).getByText('Off')).toBeTruthy());
    expect(within(twoFactor()).queryByText('Phone')).toBeNull();
  });

  it('keeps the device when removal is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const fetchMock = mockApi({}, () => on);
    const { ui } = renderDialog();
    await ui.click(await screen.findByRole('button', { name: 'Remove' }));
    expect(fetchMock.mock.calls.some(([p]) => String(p).endsWith('/delete'))).toBe(false);
  });

  it('regenerates recovery codes after confirming the password', async () => {
    const fetchMock = mockApi({ '/api/2fa/recovery-codes': () => jsonResponse({ recoveryCodes: ['aaaaa-bbbbb'] }) }, () => on);
    const { ui } = renderDialog();
    expect(await screen.findByText('10 unused recovery code(s) left.')).toBeTruthy();

    await ui.click(screen.getByRole('button', { name: 'New recovery codes' }));
    await ui.type(screen.getByLabelText('Confirm your password'), 'password123');
    await ui.click(screen.getByRole('button', { name: 'Generate new codes' }));

    expect(await screen.findByText('aaaaa-bbbbb')).toBeTruthy();
    const call = fetchMock.mock.calls.find(([p]) => p === '/api/2fa/recovery-codes')!;
    expect(JSON.parse(call[1]!.body as string)).toEqual({ password: 'password123' });
  });

  it('cancels enrollment and returns to the overview', async () => {
    mockApi({});
    const { ui } = renderDialog();
    await ui.click(await screen.findByRole('button', { name: 'Enable two-factor' }));
    await ui.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Enable two-factor' })).toBeTruthy();
  });

  it('shows an error when the status cannot load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'Unauthorized' }, 401)));
    renderDialog();
    expect((await screen.findByRole('alert')).textContent).toBe('Unauthorized');
  });
});
