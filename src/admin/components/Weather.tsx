import { useQuery } from '@tanstack/react-query';
import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Sun, Wind, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/feedback';
import { addDays, todayInParis } from '@/lib/format';

interface Forecast {
  code: number;
  tMax: number;
  tMin: number;
  rainProbability: number;
  windMax: number;
  gustMax: number;
}

// Codes météo WMO (Open-Meteo) → libellé et pictogramme
function describe(code: number): { label: string; icon: LucideIcon } {
  if (code === 0) return { label: 'Ensoleillé', icon: Sun };
  if (code <= 2) return { label: 'Éclaircies', icon: CloudSun };
  if (code === 3) return { label: 'Couvert', icon: Cloud };
  if (code <= 48) return { label: 'Brouillard', icon: CloudFog };
  if (code <= 57) return { label: 'Bruine', icon: CloudDrizzle };
  if (code <= 67 || (code >= 80 && code <= 82)) return { label: 'Pluie', icon: CloudRain };
  if (code <= 77 || code === 85 || code === 86) return { label: 'Neige', icon: CloudSnow };
  return { label: 'Orages', icon: CloudLightning };
}

async function fetchForecast(lat: number, lng: number, day: string): Promise<Forecast | null> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
    timezone: 'Europe/Paris',
    start_date: day,
    end_date: day,
  }).toString();
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Météo indisponible (${response.status})`);
  const json = (await response.json()) as { daily?: Record<string, number[]> };
  const d = json.daily;
  if (!d?.weather_code?.length) return null;
  return {
    code: d.weather_code[0]!,
    tMax: d.temperature_2m_max?.[0] ?? NaN,
    tMin: d.temperature_2m_min?.[0] ?? NaN,
    rainProbability: d.precipitation_probability_max?.[0] ?? 0,
    windMax: d.wind_speed_10m_max?.[0] ?? 0,
    gustMax: d.wind_gusts_10m_max?.[0] ?? 0,
  };
}

/** Météo du jour affiché (prévisions Open-Meteo, 14 jours) */
export function Weather({ day, geo }: { day: string; geo: { lat: number; lng: number } | undefined }) {
  const today = todayInParis();
  const inRange = day >= today && day <= addDays(today, 14);
  const forecast = useQuery({
    queryKey: ['weather', geo?.lat, geo?.lng, day],
    queryFn: () => fetchForecast(geo!.lat, geo!.lng, day),
    enabled: !!geo && inRange,
    staleTime: 30 * 60_000,
    retry: 0,
  });

  let content: React.ReactNode;
  if (!geo) content = <p className="text-sm text-asphalt-400">Coordonnées du circuit non renseignées (contenu « contact »).</p>;
  else if (!inRange) content = <p className="text-sm text-asphalt-400">Prévisions disponibles pour les 14 prochains jours.</p>;
  else if (forecast.isPending) content = <Skeleton className="h-16 w-full" />;
  else if (forecast.isError || !forecast.data) content = <p className="text-sm text-asphalt-400">Prévisions momentanément indisponibles.</p>;
  else {
    const f = forecast.data;
    const { label, icon: Icon } = describe(f.code);
    const risky = f.rainProbability >= 60 || f.gustMax >= 60;
    content = (
      <div className="flex items-center gap-4">
        <Icon aria-hidden className={risky ? 'size-12 text-flag-yellow' : 'size-12 text-chalk'} />
        <div className="flex flex-col text-sm">
          <p className="font-display text-2xl font-bold leading-none">
            {Math.round(f.tMax)}° <span className="text-lg text-asphalt-400">/ {Math.round(f.tMin)}°</span>
          </p>
          <p className="text-chalk">{label}</p>
          <p className="text-xs text-asphalt-400">
            Pluie {f.rainProbability} % · <Wind aria-hidden className="inline size-3" /> {Math.round(f.windMax)} km/h (rafales {Math.round(f.gustMax)})
          </p>
          {risky && <p className="text-xs font-semibold text-flag-yellow">Conditions à surveiller : pensez à la bannière d’information.</p>}
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 bg-asphalt-900 p-4 ring-1 ring-asphalt-800">
      <p className="text-xs font-semibold uppercase tracking-wider text-asphalt-400">Météo</p>
      {content}
      <p className="text-[0.65rem] text-asphalt-400">Source : Open-Meteo</p>
    </div>
  );
}
