export const DEMO_PROGRESS_CHANNEL = 'kr-demo-progress';
/** Demande d'écriture durable de la base dans IndexedDB (après chaque écriture) */
export const DEMO_FLUSH_CHANNEL = 'kr-demo-flush';

export type DemoStep = 'open' | 'schema' | 'seed' | 'maintenance' | 'ready';

export interface DemoProgress {
  step: DemoStep;
  done?: number;
  total?: number;
}

export const DEMO_STEP_LABELS: Record<DemoStep, string> = {
  open: 'Ouverture de la base locale',
  schema: 'Création du schéma',
  seed: 'Chargement du catalogue et des données d’exemple',
  maintenance: 'Mise à jour des créneaux',
  ready: 'Prêt',
};
