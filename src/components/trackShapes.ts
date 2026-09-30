export const TRACK_PATHS = {
  compact:
    'M70 190 C45 130 95 62 165 70 L250 80 C322 88 352 142 322 182 C300 208 252 202 232 177 C212 152 172 152 162 182 C152 212 95 232 70 190 Z',
  medium:
    'M52 200 C30 150 62 70 132 60 C192 52 212 110 262 100 C322 88 360 60 370 112 C380 162 332 172 302 190 C272 210 222 215 172 205 C122 195 72 240 52 200 Z',
  long: 'M40 150 C40 80 100 40 170 50 L300 60 C360 66 382 112 350 142 C325 166 280 140 250 160 C220 180 250 215 210 225 L110 230 C60 234 40 200 40 150 Z',
  oval: 'M120 130 C120 90 160 80 200 80 C240 80 280 90 280 130 C280 170 240 180 200 180 C160 180 120 170 120 130 Z',
} as const;

export type TrackShape = keyof typeof TRACK_PATHS;

export function trackShapeFor(slug: string): TrackShape {
  if (slug === 'circuit-1') return 'compact';
  if (slug === 'circuit-3') return 'long';
  if (slug === 'piste-baby') return 'oval';
  return 'medium';
}
