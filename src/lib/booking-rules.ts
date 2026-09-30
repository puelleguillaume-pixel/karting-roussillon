// Règles de saisie des participants, identiques à celles vérifiées par la base
// (app.add_participants) : le client est prévenu avant l'envoi, la base reste
// l'arbitre final.

export interface ParticipantDraft {
  first_name: string;
  last_name: string;
  birth_date: string;
  height_cm: string;
  height_certified: boolean;
  guardian_name: string;
}

export const EMPTY_PARTICIPANT: ParticipantDraft = {
  first_name: '',
  last_name: '',
  birth_date: '',
  height_cm: '',
  height_certified: false,
  guardian_name: '',
};

export interface ParticipantRules {
  day: string; // jour de la session (AAAA-MM-JJ)
  minAge: number;
  minHeight: number | null;
}

/** Âge révolu à une date (comme age() de Postgres). */
export function ageOn(birth: string, day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [by, bm, bd] = birth.split('-').map(Number) as [number, number, number];
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  let age = y - by;
  if (m < bm || (m === bm && d < bd)) age--;
  return age;
}

export function isMinorOn(birth: string, day: string): boolean {
  const age = ageOn(birth, day);
  return age !== null && age < 18;
}

/** Clé d'identité pilote (nom + prénom sans accents ni casse + naissance). */
export function pilotKey(p: Pick<ParticipantDraft, 'first_name' | 'last_name' | 'birth_date'>): string {
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase()
      .replace(/['-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  return `${norm(p.first_name)}|${norm(p.last_name)}|${p.birth_date}`;
}

/** Erreurs d'un participant, indexées par champ. */
export function validateParticipant(p: ParticipantDraft, rules: ParticipantRules, who: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!p.first_name.trim()) errors.first_name = 'Indiquez le prénom.';
  if (!p.last_name.trim()) errors.last_name = 'Indiquez le nom.';
  const age = ageOn(p.birth_date, rules.day);
  if (age === null || p.birth_date > rules.day || age > 110) {
    errors.birth_date = 'Indiquez une date de naissance valide.';
  } else if (age < rules.minAge) {
    errors.birth_date = `${who} doit avoir au moins ${rules.minAge} ans révolus le jour de la session.`;
  }
  if (rules.minHeight !== null) {
    const height = p.height_cm ? Number(p.height_cm) : null;
    if (height !== null && (Number.isNaN(height) || height < 50 || height > 250)) {
      errors.height_cm = 'Indiquez une taille en centimètres.';
    } else if (height !== null && height < rules.minHeight) {
      errors.height_cm = `Taille minimum : ${rules.minHeight} cm.`;
    } else if (height === null && !p.height_certified) {
      errors.height_cm = `Indiquez la taille ou certifiez au moins ${rules.minHeight} cm.`;
    }
  }
  if (age !== null && age < 18 && !p.guardian_name.trim()) {
    errors.guardian_name = 'Participant mineur : indiquez le nom du représentant légal.';
  }
  return errors;
}
