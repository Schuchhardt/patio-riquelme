import fs from 'node:fs';
import path from 'node:path';
import {
  precioUF,
  precioConEscala,
  esPrecioValido,
  TOLERANCIA_UF,
  ESCALA_POR_NIVEL,
  ESCALA_APLICA_A_LOCALES,
} from './pricing';
import {
  clasificar,
  TIPOLOGIAS_COMERCIALES,
  type Familia,
} from './tipologiasComerciales';

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
  /** OJO: en el CSV se llama `superficie_total_m2` pero es la superficie ÚTIL (interior). */
  superficie_total_m2: number;
  superficie_terraza_m2: number;
  /** Útil + terraza. Es la superficie sobre la que se cotiza. */
  superficie_total_venta_m2: number;
  precio_estimado_uf: number;
}

const NUMERIC_FIELDS = [
  'superficie_total_m2',
  'superficie_terraza_m2',
  'superficie_total_venta_m2',
  'precio_estimado_uf',
] as const;

/**
 * Parser de CSV tolerante al formato del archivo fuente:
 * - quita el BOM de UTF-8 que agrega Excel,
 * - acepta saltos CRLF y LF (el CSV original es CRLF: sin esto la última
 *   cabecera queda como `precio_estimado_uf\r` y todos los precios dan NaN),
 * - descarta líneas en blanco,
 * - normaliza coma decimal (`"35,68"` -> 35.68) en los campos numéricos.
 */
function parseCsv(text: string): Unidad[] {
  const lines = text
    .replace(/^﻿/, '')
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '');

  const headers = lines[0].split(',').map((h) => h.trim());

  return lines.slice(1).map((line, i) => {
    const cells = line.split(',');
    const row: Record<string, string> = {};
    headers.forEach((h, j) => (row[h] = (cells[j] ?? '').trim()));

    for (const field of NUMERIC_FIELDS) {
      if (!(field in row)) {
        throw new Error(`[unidades] Falta la columna "${field}" en unidades_cotizador.csv`);
      }
    }

    const numeros = Object.fromEntries(
      NUMERIC_FIELDS.map((field) => [field, parseNumero(row[field], field, i + 2)])
    ) as Record<(typeof NUMERIC_FIELDS)[number], number>;

    return { ...row, ...numeros } as unknown as Unidad;
  });
}

/** Acepta "35.68", "35,68" y "1.234,56". Nunca devuelve NaN: falla el build en su lugar. */
function parseNumero(raw: string, campo: string, linea: number): number {
  // Si hay coma, es el separador decimal y los puntos son de miles.
  const normalizado = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  // Number('') es 0, no NaN: una celda vacía es un dato faltante, no un cero.
  const n = normalizado === '' ? NaN : Number(normalizado);
  if (!Number.isFinite(n)) {
    throw new Error(
      `[unidades] Valor no numérico en la columna "${campo}", línea ${linea} del CSV: ${JSON.stringify(raw)}`
    );
  }
  return n;
}

const csvPath = path.resolve(process.cwd(), 'unidades_cotizador.csv');
export const unidades: Unidad[] = parseCsv(fs.readFileSync(csvPath, 'utf-8'));

// ---------------------------------------------------------------------------
// Test de humo: si el dataset no cuadra, el build falla en vez de publicar NaN.
// ---------------------------------------------------------------------------
function validarDataset(items: Unidad[]): void {
  const errores: string[] = [];

  if (items.length === 0) errores.push('El CSV no tiene unidades.');

  const ids = new Set<string>();
  for (const u of items) {
    const ref = u.id_unidad || u.identificador || '(sin id)';

    if (!u.id_unidad) errores.push(`Unidad sin id_unidad (${u.identificador}).`);
    if (ids.has(u.id_unidad)) errores.push(`id_unidad duplicado: ${u.id_unidad}.`);
    ids.add(u.id_unidad);

    if (!Number.isFinite(Number(u.piso))) errores.push(`${ref}: piso indefinido ("${u.piso}").`);
    if (!u.tipologia) errores.push(`${ref}: tipología vacía.`);
    if (!(u.superficie_total_m2 > 0)) errores.push(`${ref}: superficie útil <= 0.`);
    if (!(u.superficie_total_venta_m2 > 0)) errores.push(`${ref}: superficie total <= 0.`);
    if (u.superficie_terraza_m2 < 0) errores.push(`${ref}: terraza negativa.`);

    const suma = u.superficie_total_m2 + u.superficie_terraza_m2;
    if (Math.abs(suma - u.superficie_total_venta_m2) > 0.011) {
      errores.push(
        `${ref}: útil (${u.superficie_total_m2}) + terraza (${u.superficie_terraza_m2}) = ${suma.toFixed(2)}, pero el total dice ${u.superficie_total_venta_m2}.`
      );
    }

    if (clasificar(u) === null) {
      errores.push(
        `${ref}: no calza con ninguna tipología comercial (cuerpo ${u.cuerpo}, ${u.superficie_total_venta_m2} m², duplex ${u.es_duplex}).`
      );
    }

    if (!esPrecioValido(u.precio_estimado_uf)) {
      errores.push(`${ref}: precio_estimado_uf inválido (${u.precio_estimado_uf}).`);
    } else {
      const esperado = precioUF(u.superficie_total_m2, u.superficie_terraza_m2);
      if (Math.abs(esperado - u.precio_estimado_uf) > TOLERANCIA_UF) {
        errores.push(
          `${ref}: precio del CSV (${u.precio_estimado_uf} UF) no coincide con la fórmula (${esperado.toFixed(1)} UF).`
        );
      }
    }
  }

  if (errores.length > 0) {
    throw new Error(
      `[unidades] El dataset tiene ${errores.length} problema(s):\n  - ${errores.join('\n  - ')}`
    );
  }
}

validarDataset(unidades);

// ---------------------------------------------------------------------------
// Formateo
// ---------------------------------------------------------------------------
const ufFormatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 });
const m2Formatter = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 });

/** Nunca muestra NaN al usuario: si el precio no es publicable, dice "Consultar". */
export function formatUF(uf: unknown): string {
  return esPrecioValido(uf) ? `${ufFormatter.format(uf)} UF` : 'Consultar';
}

export function formatM2Valor(m2: number): string {
  return `${m2Formatter.format(m2)} m²`;
}

// ---------------------------------------------------------------------------
// Etiquetas
// ---------------------------------------------------------------------------
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

/**
 * Nombre comercial de cada nivel.
 *
 * El nivel -1 se llama "Nivel Patio": está bajo la cota del Piso 1, pero es
 * donde arranca el edificio y donde está el patio interior — por eso sus 7
 * unidades tienen terraza y orientación N/S/P. Los pisos superiores miran
 * hacia ese patio.
 *
 * NO se muestra como "Subterráneo": describiría mal el producto. Pero tampoco
 * se oculta que está bajo el Piso 1 (ver NIVEL_DESCRIPCIONES), porque el
 * comprador tiene que saber qué nivel está comprando.
 */
export const NIVEL_LABELS: Record<number, string> = {
  [-1]: 'Nivel Patio',
};

/** Nota aclaratoria que acompaña al nivel donde el nombre no basta. */
export const NIVEL_DESCRIPCIONES: Record<number, string> = {
  [-1]: 'El edificio parte en este nivel, en torno al patio interior. Está bajo la cota del Piso 1, y los pisos superiores miran hacia el patio.',
};

export function pisoLabel(piso: number): string {
  return NIVEL_LABELS[piso] ?? `Piso ${piso}`;
}

/** Versión compacta para tablas: "Patio, 1, 2, 3, 4". */
export function nivelCorto(piso: number): string {
  return piso === -1 ? 'Patio' : String(piso);
}

/**
 * Etiqueta de ubicación de una unidad concreta.
 *
 * Las unidades que ocupan varios niveles traen en el CSV algo como
 * "Piso 1 + Piso 2 + Subterráneo -1"; ahí solo se reemplaza el tramo del
 * nivel -1 y se conserva el resto.
 */
export function ubicacionLabel(pisoLabelCsv: string, piso: number): string {
  if (pisoLabelCsv.includes('+')) {
    return pisoLabelCsv.replace(/Subterráneo -1|Piso -1/g, NIVEL_LABELS[-1]);
  }
  return NIVEL_LABELS[piso] ?? pisoLabelCsv;
}

/** Cuerpos del edificio. La descripción se muestra como nota en /disponibilidad. */
export const CUERPO_LABELS: Record<string, string> = {
  A: 'Cuerpo A',
  B: 'Cuerpo B',
  C: 'Cuerpo C',
};

// ---------------------------------------------------------------------------
// Modelo público
// ---------------------------------------------------------------------------
export interface UnidadPublica {
  id: string;
  nombre: string;
  tipologia: string;
  tipologiaLabel: string;
  esLocal: boolean;
  piso: number;
  pisoLabel: string;
  cuerpo: string;
  cuerpoLabel: string;
  orientacion: string;
  duplex: boolean;
  /** Superficie interior, sin terraza. */
  m2Util: number;
  m2Terraza: number;
  /** Útil + terraza. Es la superficie sobre la que se cotiza. */
  m2Total: number;
  /** Precio de lista, con la escala por nivel ya aplicada. Es el que se publica. */
  uf: number;
  /** Precio del CSV, sin escala. Se conserva para trazabilidad. */
  ufBase: number;
  /** Sobreprecio por altura respecto del nivel más bajo, en UF. 0 en la base. */
  ufEscala: number;
  /** Código de tipología comercial (B1, B2, …). Ver tipologiasComerciales.ts. */
  tc: string;
  tcNombre: string;
  /** Familia a la que pertenece la tipología comercial. */
  familia: Familia;
}

/**
 * Niveles del edificio, de abajo hacia arriba. El índice en este arreglo es lo
 * que alimenta la escala de precios: el nivel más bajo es 0.
 */
const nivelesOrdenados: number[] = [...new Set(unidades.map((u) => Number(u.piso)))].sort(
  (a, b) => a - b
);

function nivelIndex(piso: number): number {
  const i = nivelesOrdenados.indexOf(piso);
  if (i < 0) throw new Error(`[unidades] Nivel desconocido: ${piso}`);
  return i;
}

function precioDeLista(u: Unidad): { uf: number; ufBase: number; ufEscala: number } {
  const ufBase = u.precio_estimado_uf;
  const escala = u.tipo_unidad === 'LOCAL' && !ESCALA_APLICA_A_LOCALES;
  const uf = escala ? ufBase : precioConEscala(ufBase, nivelIndex(Number(u.piso)));
  return { uf, ufBase, ufEscala: Math.round((uf - ufBase) * 10) / 10 };
}

export const unidadesPublicas: UnidadPublica[] = unidades
  .map((u) => ({
    id: u.id_unidad,
    nombre: u.identificador,
    tipologia: u.tipologia,
    tipologiaLabel: TIPOLOGIA_LABELS[u.tipologia] ?? u.tipologia,
    esLocal: u.tipo_unidad === 'LOCAL',
    piso: Number(u.piso),
    pisoLabel: ubicacionLabel(u.piso_label, Number(u.piso)),
    cuerpo: u.cuerpo,
    cuerpoLabel: CUERPO_LABELS[u.cuerpo] ?? `Cuerpo ${u.cuerpo}`,
    orientacion: formatOrientacion(u.orientacion),
    duplex: u.es_duplex === 'SI',
    m2Util: u.superficie_total_m2,
    m2Terraza: u.superficie_terraza_m2,
    m2Total: u.superficie_total_venta_m2,
    ...precioDeLista(u),
    tc: clasificar(u)!,
    tcNombre: TIPOLOGIAS_COMERCIALES[clasificar(u)!].nombre,
    familia: TIPOLOGIAS_COMERCIALES[clasificar(u)!].familia,
  }))
  .sort((a, b) => a.piso - b.piso || a.nombre.localeCompare(b.nombre, 'es'));

export const pisosDisponibles: number[] = [...new Set(unidadesPublicas.map((u) => u.piso))].sort(
  (a, b) => a - b
);

export const cuerposDisponibles: string[] = [
  ...new Set(unidadesPublicas.map((u) => u.cuerpo)),
].sort();

export const departamentos = unidadesPublicas.filter((u) => !u.esLocal);
export const locales = unidadesPublicas.filter((u) => u.esLocal);

function rango(items: UnidadPublica[]) {
  const ufs = items.map((u) => u.uf);
  return { min: Math.min(...ufs), max: Math.max(...ufs) };
}

/** Rango real del dataset, redondeado hacia afuera al múltiplo de 100 para el slider. */
const rangoReal = rango(unidadesPublicas);
export const rangoUF = {
  min: Math.floor(rangoReal.min / 100) * 100,
  max: Math.ceil(rangoReal.max / 100) * 100,
};

export const desdeDepartamentos = rango(departamentos).min;
export const desdeLocales = rango(locales).min;

// ---------------------------------------------------------------------------
// Resúmenes por tipología
// ---------------------------------------------------------------------------
export interface TipologiaSummary {
  tipologia: string;
  count: number;
  minM2: number;
  maxM2: number;
  minUF: number;
  maxUF: number;
  pisos: number[];
}

function resumir(tipologia: string, items: UnidadPublica[]): TipologiaSummary {
  if (items.length === 0) {
    throw new Error(`[unidades] No hay unidades para "${tipologia}".`);
  }
  const m2 = items.map((u) => u.m2Total);
  const uf = items.map((u) => u.uf);
  return {
    tipologia,
    count: items.length,
    minM2: Math.min(...m2),
    maxM2: Math.max(...m2),
    minUF: Math.min(...uf),
    maxUF: Math.max(...uf),
    pisos: [...new Set(items.map((u) => u.piso))].sort((a, b) => a - b),
  };
}

/**
 * Resumen por familia (Estudio / 1D / Duplex / Local).
 *
 * Se agrupa por `familia`, no por la columna `tipologia` del CSV: 302 C viene
 * marcada como `1D` pese a ser un duplex de dos niveles, y era lo que estiraba
 * el rango de "1D" hasta 47 m². Agrupando por familia, 1D cierra en 37,58 m².
 */
function summarizeFamilia(familia: Familia): TipologiaSummary {
  return resumir(familia, unidadesPublicas.filter((u) => u.familia === familia));
}

export const summaries: Record<string, TipologiaSummary> = {
  E: summarizeFamilia('E'),
  '1D': summarizeFamilia('1D'),
  Duplex: summarizeFamilia('Duplex'),
  L: summarizeFamilia('L'),
};

export const FAMILIA_LABELS: Record<Familia, string> = {
  E: 'E · Estudio',
  '1D': '1D · 1 Dormitorio',
  Duplex: 'Duplex',
  L: 'Local comercial',
};

// ---------------------------------------------------------------------------
// Resúmenes por tipología comercial (las plantas reales del proyecto)
// ---------------------------------------------------------------------------
export interface ResumenComercial extends TipologiaSummary {
  codigo: string;
  nombre: string;
  familia: Familia;
  minUtil: number;
  maxUtil: number;
  minTerraza: number;
  maxTerraza: number;
  cuerpos: string[];
}

export const resumenComerciales: ResumenComercial[] = Object.values(TIPOLOGIAS_COMERCIALES)
  .sort((a, b) => a.orden - b.orden)
  .map(({ codigo, nombre, familia }) => {
    const items = unidadesPublicas.filter((u) => u.tc === codigo);
    const base = resumir(codigo, items);
    const util = items.map((u) => u.m2Util);
    const terraza = items.map((u) => u.m2Terraza);
    return {
      ...base,
      codigo,
      nombre,
      familia,
      minUtil: Math.min(...util),
      maxUtil: Math.max(...util),
      minTerraza: Math.min(...terraza),
      maxTerraza: Math.max(...terraza),
      cuerpos: [...new Set(items.map((u) => u.cuerpo))].sort(),
    };
  });

/** Formatea un rango de m², colapsando cuando min === max. */
export function formatRangoM2(min: number, max: number): string {
  return min === max
    ? formatM2Valor(min)
    : `${m2Formatter.format(min)} – ${formatM2Valor(max)}`;
}

/** Formatea un rango de UF, colapsando cuando min === max. */
export function formatRangoUF(min: number, max: number): string {
  return min === max ? formatUF(min) : `${ufFormatter.format(min)} – ${formatUF(max)}`;
}

export function formatM2(s: TipologiaSummary): string {
  return s.minM2 === s.maxM2
    ? formatM2Valor(s.minM2)
    : `${m2Formatter.format(s.minM2)} – ${formatM2Valor(s.maxM2)}`;
}

/** Texto natural para una lista de niveles: "el piso 3", "los pisos 2 y 3", "todos los pisos". */
export function formatPisos(pisos: number[]): string {
  if (pisos.length === 0) return '';
  if (pisos.length === pisosDisponibles.length) return 'todos los pisos';
  if (pisos.length === 1) return `el ${pisoLabel(pisos[0]).toLowerCase()}`;
  const nums = pisos.map(String);
  return `los pisos ${nums.slice(0, -1).join(', ')} y ${nums[nums.length - 1]}`;
}
