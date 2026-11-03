import { describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QrCode } from './QrCode';

describe('QrCode', () => {
  it('renders the value as an SVG QR code', async () => {
    render(<QrCode value="otpauth://totp/Sheafly:a@example.com?secret=JBSWY3DPEHPK3PXP" />);
    const img = screen.getByRole('img', { name: /QR code/ });
    await waitFor(() => expect(img.querySelector('svg')).not.toBeNull());
  });
});
