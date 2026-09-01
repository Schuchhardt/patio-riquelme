/**
 * Tests del buscador de /disponibilidad.
 *
 * Regresión que originó la suite: las tarjetas traían `display:flex` en un
 * atributo `style` inline, que le gana a la regla `.unidad-card.oculta
 * {display:none}` de la hoja de estilos. El JS marcaba bien las tarjetas y el
 * contador decía «3 unidades disponibles», pero en pantalla seguían apareciendo
 * las 1D. Por eso estos tests miran lo que se RENDERIZA (rect > 0), no la clase
 * `oculta` ni el contador: comprobar la clase habría dado verde con el bug vivo.
 */
import test, { before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { servirDist, abrirNavegador, exigirBuild } from './helpers/entorno.mjs';

exigirBuild();

let servidor;
let navegador;
let page;

before(async () => {
  servidor = await servirDist();
  navegador = await abrirNavegador();
  page = await navegador.newPage();
  await page.setViewport({ width: 1280, height: 900 });
  // Nada de red externa: las fuentes de Google bloquean DOMContentLoaded hasta
  // agotar su timeout y no tienen nada que ver con lo que se está probando.
  await page.setRequestInterception(true);
  page.on('request', (req) => (req.url().startsWith(servidor.url) ? req.continue() : req.abort()));
});

after(async () => {
  await navegador?.close();
  await servidor?.cerrar();
});

/** Lee el estado renderizado del buscador. */
function leerEstado() {
  return page.evaluate(() => {
    const datos = (c) => ({
      nombre: c.querySelector('h3')?.textContent.trim(),
      familia: c.dataset.familia,
      tc: c.dataset.tc,
      piso: c.dataset.piso,
      cuerpo: c.dataset.cuerpo,
      uf: Number(c.dataset.uf),
    });
    // Una tarjeta cuenta como visible sólo si ocupa espacio en el layout: así
    // también se detecta cuando la esconde un ancestro (el grupo de piso).
    const cards = Array.from(document.querySelectorAll('.unidad-card'));
    const visible = (el) => el.getBoundingClientRect().width > 0;

    return {
      todas: cards.map(datos),
      visibles: cards.filter(visible).map(datos),
      contador: document.getElementById('resultado-count')?.textContent ?? '',
      sinResultadosVisible: visible(document.getElementById('sin-resultados')),
      grupos: Array.from(document.querySelectorAll('.piso-group')).map((g) => ({
        piso: g.dataset.piso,
        visible: visible(g),
        etiqueta: g.querySelector('.piso-count')?.textContent ?? '',
        cardsVisibles: Array.from(g.querySelectorAll('.unidad-card')).filter(visible).length,
      })),
      chipsActivos: Object.fromEntries(
        Array.from(document.querySelectorAll('.chip-group')).map((g) => [
          g.dataset.filter,
          g.querySelector('.chip.active')?.dataset.value ?? null,
        ])
      ),
    };
  });
}

async function ir(ruta) {
  // El script del buscador es un módulo: se ejecuta antes de DOMContentLoaded,
  // así que al llegar aquí los filtros de la URL ya están aplicados.
  await page.goto(`${servidor.url}${ruta}`, { waitUntil: 'domcontentloaded' });
  return leerEstado();
}

/** Hace clic en un chip por su texto dentro del grupo indicado. */
async function clicChip(filtro, texto) {
  await page.evaluate(
    (f, t) => {
      const chips = Array.from(document.querySelectorAll(`.chip-group[data-filter="${f}"] .chip`));
      const chip = chips.find((c) => c.textContent.trim() === t);
      if (!chip) throw new Error(`No existe el chip "${t}" en el filtro "${f}"`);
      chip.click();
    },
    filtro,
    texto
  );
  return leerEstado();
}

/**
 * Invariante central: lo que se ve en pantalla es exactamente lo que cumple el
 * filtro, y el contador dice ese mismo número.
 */
function verificarCoherencia(estado, cumple, contexto) {
  const esperadas = estado.todas.filter(cumple).map((u) => u.nombre).sort();
  const mostradas = estado.visibles.map((u) => u.nombre).sort();

  assert.deepEqual(
    mostradas,
    esperadas,
    `${contexto}: lo mostrado no coincide con el filtro.\n` +
      `  de más: ${mostradas.filter((n) => !esperadas.includes(n)).join(', ') || '—'}\n` +
      `  de menos: ${esperadas.filter((n) => !mostradas.includes(n)).join(', ') || '—'}`
  );

  const n = mostradas.length;
  assert.equal(
    estado.contador,
    n === 1 ? '1 unidad disponible' : `${n} unidades disponibles`,
    `${contexto}: el contador no refleja lo que se ve`
  );
  assert.equal(
    estado.sinResultadosVisible,
    n === 0,
    `${contexto}: el aviso "sin resultados" no corresponde`
  );

  for (const g of estado.grupos) {
    assert.equal(g.visible, g.cardsVisibles > 0, `${contexto}: grupo del piso ${g.piso} mal oculto`);
    if (g.visible) {
      const esperado = `${g.cardsVisibles} ${g.cardsVisibles === 1 ? 'unidad' : 'unidades'}`;
      assert.equal(g.etiqueta, esperado, `${contexto}: conteo del piso ${g.piso}`);
    }
  }
}

describe('sin filtros', () => {
  test('muestra todas las unidades del inventario', async () => {
    const estado = await ir('/disponibilidad/');
    assert.ok(estado.todas.length > 0, 'la página no renderizó ninguna unidad');
    verificarCoherencia(estado, () => true, 'sin filtros');
  });
});

describe('preselección por ?tipologia= (el enlace de /tipologias y del cotizador)', () => {
  const casos = [
    ['E', 'E'],
    ['Estudio', 'E'],
    ['1D', '1D'],
    ['Duplex', 'Duplex'],
    ['1D 1/2', 'Duplex'],
    ['Local', 'L'],
    ['L', 'L'],
  ];

  for (const [param, familia] of casos) {
    test(`?tipologia=${param} muestra sólo la familia ${familia}`, async () => {
      const estado = await ir(`/disponibilidad/?tipologia=${encodeURIComponent(param)}`);
      verificarCoherencia(estado, (u) => u.familia === familia, `?tipologia=${param}`);
      assert.ok(estado.visibles.length > 0, `?tipologia=${param} no dejó ninguna unidad visible`);
      assert.equal(estado.chipsActivos.familia, familia, 'el chip activo no acompaña a la URL');
    });
  }

  test('?tipologia=E no deja pasar ninguna 1D (el caso reportado)', async () => {
    const estado = await ir('/disponibilidad/?tipologia=E');
    const intrusas = estado.visibles.filter((u) => u.familia !== 'E');
    assert.deepEqual(intrusas, [], 'se ven unidades que no son Estudio');
  });

  test('?tipologia=1D excluye los duplex aunque el CSV los marque como 1D', async () => {
    const estado = await ir('/disponibilidad/?tipologia=1D');
    assert.ok(
      estado.visibles.every((u) => !u.tc.startsWith('D')),
      'un duplex se coló en el filtro 1D'
    );
  });

  test('un valor desconocido no filtra nada (muestra todo, no una página vacía)', async () => {
    const estado = await ir('/disponibilidad/?tipologia=inventado');
    verificarCoherencia(estado, () => true, '?tipologia=inventado');
  });
});

describe('preselección por ?piso=, ?cuerpo= y ?tc=', () => {
  test('?piso=3 muestra sólo ese nivel', async () => {
    const estado = await ir('/disponibilidad/?piso=3');
    verificarCoherencia(estado, (u) => u.piso === '3', '?piso=3');
    assert.ok(estado.visibles.length > 0);
  });

  test('?cuerpo=b acepta minúsculas', async () => {
    const estado = await ir('/disponibilidad/?cuerpo=b');
    verificarCoherencia(estado, (u) => u.cuerpo === 'B', '?cuerpo=b');
    assert.ok(estado.visibles.length > 0);
  });

  test('?tc=B1 muestra sólo esa planta y anuncia el filtro', async () => {
    const estado = await ir('/disponibilidad/?tc=B1');
    verificarCoherencia(estado, (u) => u.tc === 'B1', '?tc=B1');
    assert.ok(estado.visibles.length > 0);
    const banner = await page.evaluate(
      () => document.getElementById('filtro-planta').getBoundingClientRect().width > 0
    );
    assert.ok(banner, 'no se anuncia que hay un filtro de planta activo');
  });

  test('combina ?tipologia= con ?piso=', async () => {
    const estado = await ir('/disponibilidad/?tipologia=1D&piso=2');
    verificarCoherencia(estado, (u) => u.familia === '1D' && u.piso === '2', '1D + piso 2');
    assert.ok(estado.visibles.length > 0);
  });
});

describe('chips', () => {
  test('cambiar de tipología reemplaza el resultado, no lo acumula', async () => {
    await ir('/disponibilidad/?tipologia=E');

    // El caso exacto del reporte: con Estudio preseleccionado, pasar a Locales.
    let estado = await clicChip('familia', 'Local comercial');
    verificarCoherencia(estado, (u) => u.familia === 'L', 'chip Locales');
    assert.ok(
      estado.visibles.every((u) => u.familia === 'L'),
      'al elegir Locales se siguen viendo departamentos'
    );

    estado = await clicChip('familia', 'Duplex');
    verificarCoherencia(estado, (u) => u.familia === 'Duplex', 'chip Duplex');

    estado = await clicChip('familia', 'E · Estudio');
    verificarCoherencia(estado, (u) => u.familia === 'E', 'chip Estudio');

    estado = await clicChip('familia', 'Todas');
    verificarCoherencia(estado, () => true, 'chip Todas');
  });

  test('los filtros se cruzan entre sí', async () => {
    await ir('/disponibilidad/');
    await clicChip('familia', '1D · 1 Dormitorio');
    const estado = await clicChip('cuerpo', 'Cuerpo B');
    verificarCoherencia(estado, (u) => u.familia === '1D' && u.cuerpo === 'B', '1D + cuerpo B');
    assert.ok(estado.visibles.length > 0);
  });

  test('un cruce sin unidades muestra el aviso de vacío', async () => {
    await ir('/disponibilidad/?tc=LOCAL');
    const estado = await clicChip('familia', 'E · Estudio');
    assert.equal(estado.visibles.length, 0);
    verificarCoherencia(estado, () => false, 'planta LOCAL + familia E');
  });

  test('«Limpiar filtros» devuelve el inventario completo', async () => {
    await ir('/disponibilidad/?tipologia=E&piso=3&tc=A1');
    await page.click('#limpiar-filtros');
    const estado = await leerEstado();
    verificarCoherencia(estado, () => true, 'limpiar filtros');
    assert.deepEqual(estado.chipsActivos, { familia: '', piso: '', cuerpo: '' });
  });
});

describe('rango de precio', () => {
  test('el slider recorta por UF y se combina con la tipología', async () => {
    await ir('/disponibilidad/?tipologia=1D');
    const tope = await page.evaluate(() => {
      const max = document.getElementById('uf-max');
      const min = document.getElementById('uf-min');
      // Un tope por debajo del máximo real, sobre la grilla de 100 del control.
      const cards = Array.from(document.querySelectorAll('.unidad-card')).map((c) => Number(c.dataset.uf));
      const objetivo = Math.round(((Math.min(...cards) + Math.max(...cards)) / 2) / 100) * 100;
      max.value = String(objetivo);
      max.dispatchEvent(new Event('input', { bubbles: true }));
      return { max: Number(max.value), min: Number(min.value) };
    });
    const estado = await leerEstado();
    verificarCoherencia(
      estado,
      (u) => u.familia === '1D' && u.uf >= tope.min && u.uf <= tope.max,
      'rango de precio'
    );
    assert.ok(estado.visibles.length > 0 && estado.visibles.length < estado.todas.length);
  });
});
