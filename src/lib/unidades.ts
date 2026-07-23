import fs from 'node:fs';
import path from 'node:path';

export interface Unidad {
  id_unidad: string;
  tipo_unidad: string;
  piso: string;
  piso_label: string;
  cuerpo: string;
  identificador: string;
  tipologia: string;
  orientacion: string;
  es_duplex: string;
  superficie_total_m2: number;
  superficie_terraza_m2: number;
  superficie_total_venta_m2: number;
  precio_estimado_uf: number;
}

function parseCsv(text: string): Unidad[] {
  const [headerLine, ...lines] = text.trim().split('\n');
  const headers = headerLine.split(',');
  return lines.map((line) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i]));
    return {
      ...row,
      superficie_total_m2: Number(row.superficie_total_m2),
      superficie_terraza_m2: Number(row.superficie_terraza_m2),
      superficie_total_venta_m2: Number(row.superficie_total_venta_m2),
      precio_estimado_uf: Number(row.precio_estimado_uf),
    } as Unidad;
  });
}

const csvPath = path.resolve(process.cwd(), 'unidades_cotizador.csv');
export const unidades: Unidad[] = parseCsv(fs.readFileSync(csvPath, 'utf-8'));

export interface TipologiaSummary {
  tipologia: string;
  count: number;
  minM2: number;
  maxM2: number;
  minUF: number;
  maxUF: number;
  pisos: string[];
}

function summarize(tipologia: string): TipologiaSummary {
  const items = unidades.filter((u) => u.tipologia === tipologia);
  const m2 = items.map((u) => u.superficie_total_venta_m2);
  const uf = items.map((u) => u.precio_estimado_uf);
  const pisos = [...new Set(items.map((u) => u.piso))].sort((a, b) => Number(a) - Number(b));
  return {
    tipologia,
    count: items.length,
    minM2: Math.min(...m2),
    maxM2: Math.max(...m2),
    minUF: Math.min(...uf),
    maxUF: Math.max(...uf),
    pisos,
  };
}

export const summaries: Record<string, TipologiaSummary> = {
  E: summarize('E'),
  '1D': summarize('1D'),
  '1D 1/2': summarize('1D 1/2'),
  L: summarize('L'),
};

export function formatM2(s: TipologiaSummary): string {
  return s.minM2 === s.maxM2 ? `${s.minM2} m²` : `${s.minM2} – ${s.maxM2} m²`;
}

export function formatPisos(pisos: string[]): string {
  const labels = pisos.map((p) => (p === '-1' ? 'subterráneo' : `piso ${p}`));
  if (labels.length === 1) return labels[0];
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]}`;
}
