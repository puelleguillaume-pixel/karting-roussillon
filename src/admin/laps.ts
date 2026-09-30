/** « 44.210 », « 44,21 », « 1:02.345 » → millisecondes */
export function parseLapTime(input: string): number | null {
  const m = input.trim().replace(',', '.').match(/^(?:(\d+):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const minutes = Number(m[1] ?? 0);
  const seconds = Number(m[2]);
  const millis = Number((m[3] ?? '0').padEnd(3, '0'));
  if (seconds >= 60 && minutes > 0) return null;
  return minutes * 60_000 + seconds * 1000 + millis;
}
