/**
 * Guarda estática de la causa raíz, sin navegador.
 *
 * El buscador oculta unidades agregando la clase `.oculta`. Una declaración
 * `display` en el atributo `style` de la tarjeta le gana a esa regla por
 * cascada, y el filtro deja de tener efecto visible aunque el JS y el contador
 * estén bien. Este test revisa el HTML construido para que nadie vuelva a
 * poner un `display` inline sobre un elemento que se oculta por clase.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { exigirBuild } from './helpers/entorno.mjs';

const html = fs.readFileSync(exigirBuild(), 'utf-8');

/** Devuelve el atributo `style` de cada elemento que tenga la clase dada. */
function estilosInline(clase) {
  const etiquetas = html.match(new RegExp(`<[a-z]+[^>]*class="[^"]*\\b${clase}\\b[^"]*"[^>]*>`, 'g')) ?? [];
  return etiquetas.map((tag) => tag.match(/\sstyle="([^"]*)"/)?.[1] ?? '');
}

describe('nada inline puede ganarle a .oculta', () => {
  for (const clase of ['unidad-card', 'piso-group']) {
    test(`ningún .${clase} declara display en un style inline`, () => {
      const estilos = estilosInline(clase);
      assert.ok(estilos.length > 0, `no se encontró ningún .${clase} en el HTML construido`);

      const culpables = estilos.filter((s) => /(^|;)\s*display\s*:/.test(s));
      assert.deepEqual(
        culpables,
        [],
        `Un \`display\` inline en .${clase} le gana a \`.${clase}.oculta {display:none}\` ` +
          `y rompe el filtro de /disponibilidad. Mueve esos estilos al bloque <style> del componente.`
      );
    });
  }

  test('la regla que oculta sigue presente en el CSS publicado', () => {
    const css = html.replace(/\s+/g, ' ');
    assert.match(
      css,
      /\.unidad-card[^{,]*\.oculta[^{]*\{[^}]*display: ?none/,
      'desapareció la regla que oculta las tarjetas filtradas'
    );
    assert.match(
      css,
      /\.piso-group[^{,]*\.oculta[^{]*\{[^}]*display: ?none/,
      'desapareció la regla que oculta los grupos de piso vacíos'
    );
  });
});
