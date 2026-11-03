import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

/** Renders an `otpauth://` (or any) string as a scannable QR code. */
export function QrCode({ value, size = 180 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toString(value, { type: 'svg', margin: 1, width: size }).then(
      (markup) => active && setSvg(markup),
      () => active && setSvg(''),
    );
    return () => {
      active = false;
    };
  }, [value, size]);

  return (
    <div
      role="img"
      aria-label="Two-factor authentication QR code"
      className="bg-white p-2 rounded-md inline-block [&>svg]:block"
      style={{ width: size + 16, height: size + 16 }}
      // The markup is produced by the qrcode library from our own otpauth URI, never user input.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
