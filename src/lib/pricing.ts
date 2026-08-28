/**
 * Punto único de verdad para el cálculo de precios.
 *
 * El CSV `unidades_cotizador.csv` ya trae `precio_estimado_uf` calculado con
 * esta misma fórmula (verificado fila por fila). El CSV manda; esta fórmula
 * existe para validarlo en build y detectar drift si alguien edita el archivo
 * a mano.
 */

/** Valor referencial de la UF por m² útil. */
export const UF_M2_BASE = 110;

/** La terraza se pondera a la mitad del m² útil. */
export const FACTOR_TERRAZA = 0.5;

/** Tolerancia al comparar el precio del CSV contra la fórmula (redondeo a 1 decimal). */
export const TOLERANCIA_UF = 0.06;

export function precioUF(m2Util: number, m2Terraza: number): number {
  return m2Util * UF_M2_BASE + m2Terraza * UF_M2_BASE * FACTOR_TERRAZA;
}

// ---------------------------------------------------------------------------
// Escala por nivel
// ---------------------------------------------------------------------------
/**
 * Incremento lineal por nivel sobre el precio base, aplicado sólo a los
 * departamentos.
 *
 * El precio del CSV es función únicamente de la superficie, así que un mismo
 * plano valía lo mismo en el Nivel Patio que en el Piso 4. Esta escala crea el
 * diferencial: el nivel más bajo conserva su precio base (índice 0) y cada
 * nivel por encima suma un `ESCALA_POR_NIVEL`.
 *
 * Es lineal, no compuesta: el Piso 4 vale base × 1,04 — no base × 1,01⁴.
 *
 * Poner en 0 desactiva la escala y devuelve los precios del CSV tal cual.
 */
export const ESCALA_POR_NIVEL = 0.01;

/**
 * Los locales NO escalan: están todos en el Piso 1, así que un incremento por
 * nivel sería un alza plana disfrazada, no un diferencial de altura. Su precio
 * se revisa aparte (hoy están a los mismos 110 UF/m² que los departamentos,
 * pendiente de tasación).
 */
export const ESCALA_APLICA_A_LOCALES = false;

/**
 * @param precioBase  precio del CSV
 * @param nivelIndex  0 para el nivel más bajo del edificio, 1 para el siguiente…
 */
export function precioConEscala(precioBase: number, nivelIndex: number): number {
  const escalado = precioBase * (1 + ESCALA_POR_NIVEL * nivelIndex);
  // Se redondea a 1 decimal, la misma convención que usa el CSV.
  return Math.round(escalado * 10) / 10;
}

/** Un precio sólo es publicable si es un número finito y positivo. */
export function esPrecioValido(uf: unknown): uf is number {
  return typeof uf === 'number' && Number.isFinite(uf) && uf > 0;
}
