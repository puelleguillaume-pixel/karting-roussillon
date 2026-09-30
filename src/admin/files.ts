// Téléchargements générés dans le navigateur (exports CSV, RGPD).

/** Déclenche le téléchargement d'un contenu texte */
export function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | boolean | null | undefined;
}

function csvCell(value: string | number | boolean | null | undefined): string {
  if (value == null) return '';
  const text = typeof value === 'number' ? String(value).replace('.', ',') : typeof value === 'boolean' ? (value ? 'oui' : 'non') : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV au format Excel français : séparateur « ; », virgule décimale et BOM
 * UTF-8 (les accents s'affichent correctement à l'ouverture dans Excel).
 */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.header)).join(';'), ...rows.map((row) => columns.map((c) => csvCell(c.value(row))).join(';'))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}

export function downloadCsv<T>(fileName: string, rows: T[], columns: CsvColumn<T>[]) {
  downloadText(fileName, toCsv(rows, columns), 'text/csv;charset=utf-8');
}

/** Montant en euros pour un tableur : 1250 → 12.5 (affiché « 12,5 ») */
export const euros = (cents: number | null | undefined) => (cents == null ? null : cents / 100);

/** Lecture simple d'un CSV (séparateur « ; » ou « , », guillemets doubles) */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const separator = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === separator) {
      row.push(cell.trim());
      cell = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some((c) => c !== '')) rows.push(row);
  return rows;
}
