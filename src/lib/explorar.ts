/**
 * Datos de /explorar.
 *
 * `src/data/explorar.json` lo genera `scripts/export_site_assets.py` del
 * repositorio Blender: trae plantas, recorridos 360°, imágenes y modelos 3D.
 * Superficies y precios NO vienen de ahí: se toman del CSV (unidades.ts), que
 * sigue siendo la única fuente de verdad del inventario. Si una unidad o local
 * del JSON no existe en el CSV, el build falla.
 */
import data from '../data/explorar.json';
import { unidadesPublicas, CUERPO_LABELS, type UnidadPublica } from './unidades';

export interface Vista {
  nombre: string;
  pano: string;
  yaw: number;
}
export interface Recorrido {
  id: string;
  nombre: string;
  tipo: string;
  thumb: string;
  nota: string;
  vistas: Vista[];
  unidad?: string;
  /** Id del local (A1, B2…) si el recorrido es de un local. */
  local?: string;
  tc?: string;
  modelo?: string | null;
}
export interface Imagen {
  id: string;
  nombre: string;
  img: string;
  thumb: string;
}
export interface Nivel {
  nombre: string;
  plano: string;
  contexto?: boolean;
}

const porNombre = new Map(unidadesPublicas.map((u) => [u.nombre, u]));

function unidad(nombre: string, origen: string): UnidadPublica {
  const u = porNombre.get(nombre);
  if (!u) throw new Error(`[explorar] ${origen}: la unidad "${nombre}" no existe en unidades_cotizador.csv`);
  return u;
}

/** Lo mínimo que necesita el cliente de cada unidad. */
function unidadCliente(u: UnidadPublica) {
  return {
    id: u.id,
    nombre: u.nombre,
    cuerpo: u.cuerpo,
    piso: u.pisoLabel,
    orientacion: u.orientacion,
    tc: u.tc,
    tcNombre: u.tcNombre,
    familia: u.familia,
    m2Util: u.m2Util,
    m2Terraza: u.m2Terraza,
    m2Total: u.m2Total,
    uf: u.uf,
  };
}

export const familias = data.familias.map((f) => {
  const us = f.unidades.map((n) => unidad(n, `familia ${f.id}`));
  const tcs = [...new Set(us.map((u) => u.tc))];
  if (tcs.length !== 1) {
    throw new Error(`[explorar] La familia ${f.id} mezcla tipologías comerciales: ${tcs.join(', ')}`);
  }
  const totales = us.map((u) => u.m2Total);
  return {
    ...f,
    tc: tcs[0],
    tcNombre: us[0].tcNombre,
    m2Min: Math.min(...totales),
    m2Max: Math.max(...totales),
    ufMin: Math.min(...us.map((u) => u.uf)),
  };
});

export const locales = data.locales.map((l) => ({ ...l, datos: unidadCliente(unidad(l.unidad, `local ${l.id}`)) }));

// Cada departamento pertenece a exactamente una familia (la que tiene su planta).
const familiaDe = new Map<string, string>();
for (const f of familias) {
  for (const n of f.unidades) {
    if (familiaDe.has(n)) throw new Error(`[explorar] ${n} aparece en dos familias.`);
    familiaDe.set(n, f.id);
  }
}

export const departamentos = unidadesPublicas
  .filter((u) => !u.esLocal)
  .map((u) => {
    const familia = familiaDe.get(u.nombre);
    if (!familia) throw new Error(`[explorar] ${u.nombre} no tiene planta en explorar.json.`);
    return { ...unidadCliente(u), familiaPlanta: familia };
  });

export const recorridos = data.recorridos as Recorrido[];
export const imagenes = data.imagenes as Imagen[];
export const modelos = data.modelos as Record<string, string>;

for (const r of recorridos) if (r.unidad) unidad(r.unidad, `recorrido ${r.id}`);

export const cuerpos = Object.entries(CUERPO_LABELS).map(([id, label]) => {
  const us = unidadesPublicas.filter((u) => u.cuerpo === id);
  return {
    id,
    label,
    departamentos: us.filter((u) => !u.esLocal).length,
    locales: us.filter((u) => u.esLocal).length,
    familias: familias.filter((f) => f.cuerpo === id).length,
  };
});

export const payload = { familias, locales, departamentos, recorridos, imagenes, modelos, cuerpos };
export type ExplorarPayload = typeof payload;
