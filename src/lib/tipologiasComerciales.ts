/**
 * Tipologías comerciales.
 *
 * La columna `tipologia` del CSV es demasiado gruesa para vender: agrupa 52
 * unidades entre 24,4 y 47,02 m² bajo la etiqueta "1D". Estas reglas la
 * subdividen en las plantas reales del proyecto.
 *
 * Se derivan del CSV base — no hay una columna `tipologia_comercial` que
 * mantener sincronizada. Si el CSV cambia y alguna unidad deja de clasificar,
 * `unidades.ts` falla el build en vez de publicar una unidad huérfana.
 */

export type Familia = 'E' | '1D' | 'Duplex' | 'L';

export interface TipologiaComercial {
  codigo: string;
  nombre: string;
  familia: Familia;
  /** Orden de presentación: menor primero. */
  orden: number;
}

export const TIPOLOGIAS_COMERCIALES: Record<string, TipologiaComercial> = {
  B1: { codigo: 'B1', nombre: '1D con terraza', familia: '1D', orden: 1 },
  B2: { codigo: 'B2', nombre: '1D compacto', familia: '1D', orden: 2 },
  C1: { codigo: 'C1', nombre: '1D compacto', familia: '1D', orden: 3 },
  A2: { codigo: 'A2', nombre: '1D', familia: '1D', orden: 4 },
  C2: { codigo: 'C2', nombre: '1D con terraza', familia: '1D', orden: 5 },
  A1: { codigo: 'A1', nombre: 'Estudio', familia: 'E', orden: 6 },
  B3: { codigo: 'B3', nombre: '1D esquina', familia: '1D', orden: 7 },
  B4: { codigo: 'B4', nombre: '1D superior', familia: '1D', orden: 8 },
  D1: { codigo: 'D1', nombre: 'Duplex 1D', familia: 'Duplex', orden: 9 },
  D2: { codigo: 'D2', nombre: 'Duplex 1D + ½', familia: 'Duplex', orden: 10 },
  LOCAL: { codigo: 'LOCAL', nombre: 'Local comercial', familia: 'L', orden: 11 },
};

export interface UnidadClasificable {
  tipo_unidad: string;
  cuerpo: string;
  tipologia: string;
  es_duplex: string;
  superficie_terraza_m2: number;
  superficie_total_venta_m2: number;
}

/**
 * Devuelve el código de tipología comercial, o null si la unidad no calza con
 * ninguna regla (lo que debe romper el build).
 *
 * Ojo con el orden: la regla de duplex va antes que la de cuerpo, porque
 * 302 C viene en el CSV como `tipologia=1D` pese a tener `es_duplex=SI` y
 * ocupar dos niveles. Es lo que estiraba el rango de "1D" hasta 47 m².
 */
export function clasificar(u: UnidadClasificable): string | null {
  if (u.tipo_unidad === 'LOCAL') return 'LOCAL';
  if (u.es_duplex === 'SI') return u.tipologia === '1D 1/2' ? 'D2' : 'D1';

  if (u.cuerpo === 'A') return u.tipologia === 'E' ? 'A1' : 'A2';

  if (u.cuerpo === 'B') {
    const total = u.superficie_total_venta_m2.toFixed(2);
    if (total === '35.68') return 'B1';
    if (total === '28.38' || total === '28.75') return 'B2';
    if (total === '34.22') return 'B3';
    if (total === '37.58') return 'B4';
    return null;
  }

  if (u.cuerpo === 'C') return u.superficie_terraza_m2 > 0 ? 'C2' : 'C1';

  return null;
}
