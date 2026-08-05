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

export const TIPOLOGIA_LABELS: Record<string, string> = {
  E: 'E · Estudio',
  '1D': '1D · 1 Dormitorio',
  '1D 1/2': 'Duplex 1D 1/2',
  L: 'Local comercial',
};

const ORIENTACION_LABELS: Record<string, string> = {
  N: 'Norte',
  S: 'Sur',
  O: 'Oriente',
  P: 'Poniente',
};

export function formatOrientacion(orientacion: string): string {
  if (!orientacion) return '';
  return orientacion
    .split('/')
    .map((o) => ORIENTACION_LABELS[o.trim()] ?? o.trim())
    .join(' / ');
}

const ufFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });

export function formatUF(uf: number): string {
  return `${ufFormatter.format(uf)} UF`;
}

export interface UnidadPublica {
  id: string;
  nombre: string;
  tipologia: string;
  tipologiaLabel: string;
  piso: number;
  pisoLabel: string;
  cuerpo: string;
  orientacion: string;
  duplex: boolean;
  m2: number;
  m2Terraza: number;
  uf: number;
}

/** Unidades listas para el buscador: ordenadas por piso y luego por identificador. */
export const unidadesPublicas: UnidadPublica[] = unidades
  .map((u) => ({
    id: u.id_unidad,
    nombre: u.identificador,
    tipologia: u.tipologia,
    tipologiaLabel: TIPOLOGIA_LABELS[u.tipologia] ?? u.tipologia,
    piso: Number(u.piso),
    pisoLabel: u.piso_label,
    cuerpo: u.cuerpo,
    orientacion: formatOrientacion(u.orientacion),
    duplex: u.es_duplex === 'SI',
    m2: u.superficie_total_venta_m2,
    m2Terraza: u.superficie_terraza_m2,
    uf: u.precio_estimado_uf,
  }))
  .sort((a, b) => a.piso - b.piso || a.nombre.localeCompare(b.nombre, 'es'));

/** Pisos presentes en el CSV, de menor a mayor. */
export const pisosDisponibles: number[] = [...new Set(unidadesPublicas.map((u) => u.piso))].sort(
  (a, b) => a - b
);

export function pisoLabel(piso: number): string {
  return piso === -1 ? 'Piso -1 · Subterráneo' : `Piso ${piso}`;
}

export const rangoUF = {
  min: Math.floor(Math.min(...unidadesPublicas.map((u) => u.uf)) / 100) * 100,
  max: Math.ceil(Math.max(...unidadesPublicas.map((u) => u.uf)) / 100) * 100,
};
