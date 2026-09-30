import { useEffect, useState } from 'react';

/** QR code (image PNG générée dans le navigateur, bibliothèque chargée à la demande). */
export function QrCode({ value, size = 200, label }: { value: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL(value, { width: size * 2, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#0a0a0b', light: '#ffffff' } }),
      )
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [value, size]);

  if (!src) return <div aria-hidden className="shrink-0 animate-pulse bg-asphalt-800" style={{ width: size, height: size }} />;
  return <img src={src} width={size} height={size} alt={label} className="shrink-0 bg-white p-2" style={{ width: size, height: size }} />;
}
