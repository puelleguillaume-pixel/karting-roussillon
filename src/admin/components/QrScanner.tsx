import { CameraOff, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

/**
 * Lecture de QR code par la caméra (arrière sur mobile). Détecteur natif
 * (BarcodeDetector) quand il existe, sinon décodage jsQR sur les images vidéo.
 */
export function QrScanner({ onResult }: { onResult: (text: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<'starting' | 'running' | 'error'>('starting');
  const [error, setError] = useState<string | null>(null);
  const resultRef = useRef(onResult);
  useEffect(() => {
    resultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d', { willReadFrequently: true });

    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Caméra non disponible sur cet appareil (connexion HTTPS requise).');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        const video = videoRef.current;
        if (!video || stopped) return;
        video.srcObject = stream;
        await video.play();
        setState('running');

        type Detector = { detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>> };
        const NativeDetector = (window as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = NativeDetector ? new NativeDetector({ formats: ['qr_code'] }) : null;
        const { default: jsQR } = detector ? { default: null } : await import('jsqr');

        let last = 0;
        const tick = async (time: number) => {
          if (stopped) return;
          if (time - last > 180 && video.readyState >= 2) {
            last = time;
            let text: string | null = null;
            if (detector) {
              const codes = await detector.detect(video).catch(() => []);
              text = codes[0]?.rawValue ?? null;
            } else if (jsQR && context) {
              const width = Math.min(video.videoWidth, 640);
              const height = Math.round((video.videoHeight / video.videoWidth) * width);
              canvas.width = width;
              canvas.height = height;
              context.drawImage(video, 0, 0, width, height);
              const image = context.getImageData(0, 0, width, height);
              text = jsQR(image.data, width, height, { inversionAttempts: 'dontInvert' })?.data ?? null;
            }
            if (text) {
              resultRef.current(text);
              return; // le parent démonte le lecteur
            }
          }
          frame = requestAnimationFrame((t) => void tick(t));
        };
        frame = requestAnimationFrame((t) => void tick(t));
      } catch (e) {
        setState('error');
        const name = (e as { name?: string }).name;
        setError(name === 'NotAllowedError' ? 'Accès à la caméra refusé : autorisez-le dans le navigateur, ou saisissez la référence.' : (e as Error).message || 'Caméra indisponible.');
      }
    }
    void start();
    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="relative aspect-square w-full max-w-sm overflow-hidden bg-black ring-1 ring-asphalt-700">
      <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label="Aperçu de la caméra" />
      {state === 'running' && <div aria-hidden className="pointer-events-none absolute inset-[18%] border-2 border-race-500/80" />}
      {state === 'starting' && (
        <p role="status" className="absolute inset-0 flex items-center justify-center gap-2 text-sm text-asphalt-200">
          <LoaderCircle aria-hidden className="size-5 animate-spin" />
          Ouverture de la caméra…
        </p>
      )}
      {state === 'error' && (
        <p role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-sm text-asphalt-200">
          <CameraOff aria-hidden className="size-8 text-race-400" />
          {error}
        </p>
      )}
    </div>
  );
}
