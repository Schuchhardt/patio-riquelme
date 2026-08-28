/** Validación de formularios compartida por los tres formularios del sitio. */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export function emailValido(valor: string): boolean {
  return EMAIL_RE.test(valor.trim());
}

/**
 * Acepta los formatos chilenos habituales: +56 9 1234 5678, 9 1234 5678,
 * 22 123 4567. El teléfono es opcional, así que un valor vacío es válido.
 */
export function telefonoValido(valor: string): boolean {
  const limpio = valor.replace(/[\s().-]/g, '');
  if (limpio === '') return true;
  return /^(\+?56)?[2-9]\d{7,8}$/.test(limpio);
}

export function nombreValido(valor: string): boolean {
  return valor.trim().length >= 2;
}

export interface CampoValidado {
  el: HTMLInputElement | null;
  ok: boolean;
  mensaje: string;
}

/**
 * Marca los campos inválidos y devuelve el primer error encontrado.
 * Devuelve null si todo está correcto.
 */
export function primerError(campos: CampoValidado[]): CampoValidado | null {
  let fallo: CampoValidado | null = null;
  for (const campo of campos) {
    campo.el?.classList.toggle('campo-invalido', !campo.ok);
    campo.el?.setAttribute('aria-invalid', String(!campo.ok));
    if (!campo.ok && !fallo) fallo = campo;
  }
  return fallo;
}
