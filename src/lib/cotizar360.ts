/**
 * "Cotizar desde el 360°": qué se puede cotizar desde un recorrido.
 *
 * Funciones puras, sin imports de datos: las usa el cliente de /explorar y se
 * prueban directo desde tests/explorar.test.mjs.
 *
 * - Recorrido de un local (`local: 'B1'`): ese local, si está disponible.
 * - Recorrido de un departamento: el interior es el de una planta tipo (la
 *   familia cuyo `recorrido` es este id; si ninguna lo declara, la familia de
 *   la unidad del recorrido). Se ofrecen las unidades disponibles de esa familia.
 * - Recorridos del edificio, patio o circulación: nada que cotizar.
 */

interface RecorridoMin {
  id: string;
  unidad?: string;
  local?: string;
}
interface FamiliaMin {
  id: string;
  recorrido?: string | null;
  tc: string;
  tcNombre: string;
}
interface LocalMin {
  id: string;
  unidad: string;
  titulo?: string;
  recorrido?: string | null;
  datos: { estado: string };
}
interface DeptoMin {
  nombre: string;
  estado: string;
  familiaPlanta: string;
}

export type Cotizacion360 =
  | { tipo: 'local'; local: string; unidad: string; titulo: string }
  | { tipo: 'tipologia'; familia: string; tc: string; tcNombre: string; unidades: string[] };

export function cotizacion360(
  r: RecorridoMin | null | undefined,
  datos: { familias: FamiliaMin[]; locales: LocalMin[]; departamentos: DeptoMin[] }
): Cotizacion360 | null {
  if (!r) return null;

  if (r.local) {
    const l = datos.locales.find((x) => x.id === r.local) ?? datos.locales.find((x) => x.recorrido === r.id);
    if (!l || l.datos.estado !== 'disponible') return null;
    return { tipo: 'local', local: l.id, unidad: l.unidad, titulo: l.titulo ?? l.unidad };
  }

  if (r.unidad) {
    const idFamilia =
      datos.familias.find((f) => f.recorrido === r.id)?.id ??
      datos.departamentos.find((u) => u.nombre === r.unidad)?.familiaPlanta;
    const f = datos.familias.find((x) => x.id === idFamilia);
    if (!f) return null;
    const unidades = datos.departamentos
      .filter((u) => u.familiaPlanta === f.id && u.estado === 'disponible')
      .map((u) => u.nombre);
    if (!unidades.length) return null;
    return { tipo: 'tipologia', familia: f.id, tc: f.tc, tcNombre: f.tcNombre, unidades };
  }

  return null;
}

/** Link a /contacto con las unidades elegidas (el formulario arma el mensaje). */
export const hrefCotizacion = (unidades: string[]) =>
  unidades.length ? `/contacto?unidades=${encodeURIComponent(unidades.join(','))}` : '/contacto';
