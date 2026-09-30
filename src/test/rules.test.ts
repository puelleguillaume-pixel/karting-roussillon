// Tests unitaires de la logique pure du front (npm test).
import { describe, expect, it } from 'vitest';
import { centsToEuros, eurosToCents, parisTimestamp } from '@/admin/labels';
import { daysBetween, isoWeekdayOf, monthRange, shiftMonth, startOfWeek } from '@/admin/dates';
import { parseCsv, toCsv } from '@/admin/files';
import { parseLapTime } from '@/admin/laps';
import { ageOn, EMPTY_PARTICIPANT, isMinorOn, pilotKey, validateParticipant } from '@/lib/booking-rules';
import type { OpeningHours } from '@/lib/data/types';
import { addDays, formatLapTime, formatPrice, isoToParisDay } from '@/lib/format';
import { normalizeGiftCode } from '@/lib/giftcards';
import { buildIcs } from '@/lib/ics';
import { summarizeOpening } from '@/lib/opening';

const nbsp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');

describe('participants (mêmes règles que la base)', () => {
  it('âge révolu au jour de la session', () => {
    expect(ageOn('2012-06-15', '2026-06-14')).toBe(13);
    expect(ageOn('2012-06-15', '2026-06-15')).toBe(14);
    expect(ageOn('pas une date', '2026-06-15')).toBeNull();
    expect(isMinorOn('2008-06-15', '2026-06-14')).toBe(true);
    expect(isMinorOn('2008-06-15', '2026-06-15')).toBe(false);
  });

  it('clé pilote insensible aux accents, à la casse et aux tirets', () => {
    expect(pilotKey({ first_name: 'Éloïse', last_name: 'Martin-Durand', birth_date: '2000-01-01' })).toBe(
      pilotKey({ first_name: 'eloise', last_name: 'MARTIN DURAND ', birth_date: '2000-01-01' }),
    );
  });

  it('âge minimum, taille et représentant légal', () => {
    const rules = { day: '2026-07-01', minAge: 7, minHeight: 130 };
    const child = { ...EMPTY_PARTICIPANT, first_name: 'Léo', last_name: 'Petit', birth_date: '2020-01-01' };
    const errors = validateParticipant(child, rules, 'Le pilote');
    expect(errors.birth_date).toMatch(/7 ans/);
    expect(errors.height_cm).toBeDefined();
    expect(errors.guardian_name).toBeDefined();

    const ok = validateParticipant({ ...child, birth_date: '2016-01-01', height_cm: '135', guardian_name: 'Anne Petit' }, rules, 'Le pilote');
    expect(ok).toEqual({});
    const certified = validateParticipant({ ...child, birth_date: '2016-01-01', height_certified: true, guardian_name: 'Anne Petit' }, rules, 'Le pilote');
    expect(certified).toEqual({});
    const tooSmall = validateParticipant({ ...child, birth_date: '2016-01-01', height_cm: '120', guardian_name: 'A' }, rules, 'Le pilote');
    expect(tooSmall.height_cm).toMatch(/130/);
  });
});

describe('formats', () => {
  it('prix en euros', () => {
    expect(nbsp(formatPrice(2400))).toBe('24 €');
    expect(nbsp(formatPrice(1750))).toBe('17,50 €');
  });
  it('temps au tour', () => {
    expect(formatLapTime(38950)).toBe('38.950');
    expect(formatLapTime(62345)).toBe('1:02.345');
  });
  it('dates civiles et jour de Paris', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // 23h30 UTC le 31/10 = 00h30 le 1er novembre à Paris (heure d'hiver)
    expect(isoToParisDay('2026-10-31T23:30:00Z')).toBe('2026-11-01');
  });
});

describe('bons cadeaux', () => {
  it('normalise la saisie du code', () => {
    expect(normalizeGiftCode(' kdo abcd 2345 wxyz ')).toBe('KDO-ABCD-2345-WXYZ');
    expect(normalizeGiftCode('ABCD-2345-WXYZ')).toBe('KDO-ABCD-2345-WXYZ');
    expect(normalizeGiftCode('KDO-ABCD')).toBeNull();
  });
});

describe('horaires', () => {
  const row = (weekday: number, opens = '09:00:00', closes = '19:00:00', extra: Partial<OpeningHours> = {}): OpeningHours => ({
    track_id: null,
    weekday,
    opens_at: opens,
    closes_at: closes,
    is_closed: false,
    valid_from: null,
    valid_to: null,
    priority: 0,
    label: '',
    ...extra,
  });
  it('regroupe « tous les jours »', () => {
    expect(summarizeOpening([1, 2, 3, 4, 5, 6, 7].map((d) => row(d)))).toEqual([{ days: 'Tous les jours', hours: '9h00 – 19h00' }]);
  });
  it('sépare les plages différentes et les fermetures', () => {
    const lines = summarizeOpening([...[1, 2, 3, 4, 5].map((d) => row(d)), row(6, '10:00:00', '18:00:00'), row(7, '09:00:00', '19:00:00', { is_closed: true })]);
    expect(lines).toEqual([
      { days: 'Du lundi au vendredi', hours: '9h00 – 19h00' },
      { days: 'Samedi', hours: '10h00 – 18h00' },
      { days: 'Dimanche', hours: 'Fermé' },
    ]);
  });
});

describe('agenda (.ics)', () => {
  it('produit un VEVENT valide avec lignes pliées à 75 caractères', () => {
    const ics = buildIcs({
      uid: 'kr-1@karting',
      start: '2026-10-01T08:00:00Z',
      end: '2026-10-01T08:10:00Z',
      title: 'Session SodiKart 390 cc, Circuit 1',
      description: 'x'.repeat(200),
    });
    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('DTSTART:20261001T080000Z');
    expect(ics).toContain('SUMMARY:Session SodiKart 390 cc\\, Circuit 1');
    expect(ics.split('\r\n').every((line) => line.length <= 75)).toBe(true);
  });
});

describe('espace dirigeant : saisies', () => {
  it('montants en euros ↔ centimes', () => {
    expect(eurosToCents('12,5')).toBe(1250);
    expect(eurosToCents(' 1 200 ')).toBe(120000);
    expect(eurosToCents('')).toBeNull();
    expect(eurosToCents('abc')).toBeNull();
    expect(centsToEuros(1250)).toBe('12,50');
    expect(centsToEuros(2000)).toBe('20');
  });
  it('horodatage à l’heure de Paris transmis à Postgres', () => {
    expect(parisTimestamp('2026-10-01', '14:30')).toBe('2026-10-01 14:30:00 Europe/Paris');
  });
  it('temps au tour saisis', () => {
    expect(parseLapTime('44.210')).toBe(44210);
    expect(parseLapTime('44,21')).toBe(44210);
    expect(parseLapTime('1:02.345')).toBe(62345);
    expect(parseLapTime('abc')).toBeNull();
  });
  it('calendrier', () => {
    expect(isoWeekdayOf('2026-09-27')).toBe(7);
    expect(startOfWeek('2026-09-27')).toBe('2026-09-21');
    expect(monthRange('2026-02-10')).toEqual({ first: '2026-02-01', last: '2026-02-28' });
    expect(shiftMonth('2026-12-15', 1)).toBe('2027-01-01');
    expect(daysBetween('2026-09-29', '2026-10-02')).toEqual(['2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });
  it('CSV Excel : séparateur, guillemets, décimales, BOM', () => {
    const csv = toCsv(
      [{ name: 'Dupont; "Jo"', amount: 12.5, ok: true }],
      [
        { header: 'Nom', value: (r) => r.name },
        { header: 'Montant', value: (r) => r.amount },
        { header: 'Réglé', value: (r) => r.ok },
      ],
    );
    expect(csv.startsWith('\uFEFFNom;Montant;Réglé\r\n')).toBe(true);
    expect(csv).toContain('"Dupont; ""Jo""";12,5;oui');
    expect(parseCsv('piste,pilote,temps\n"Circuit 1","A, B",44.210\n')).toEqual([
      ['piste', 'pilote', 'temps'],
      ['Circuit 1', 'A, B', '44.210'],
    ]);
  });
});
