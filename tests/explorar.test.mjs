/**
 * Explorar 3D (/explorar/): que todo archivo referenciado se publique, que las pestañas se
 * armen con el inventario completo, que "Mi selección" y "Cotizar desde el 360°" lleguen a /contacto
 * y que la página esté publicada (menú, sitemap, redirección de /visor-360/).
 * No depende de los CDN de Pannellum ni de model-viewer.
 */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dist, raiz, exigirBuild, servirDist, abrirNavegador } from './helpers/entorno.mjs';
import { cotizacion360, hrefCotizacion } from '../src/lib/cotizar360.ts';

exigirBuild();
const VISOR = '/explorar/';
const datos = JSON.parse(fs.readFileSync(path.join(raiz, 'src/data/explorar.json'), 'utf-8'));

const vistas = datos.recorridos.flatMap((r) => r.vistas.map((v, i) => ({ r, v, i })));
const conPlanta3D = [...datos.familias, ...datos.locales];
const casaMunecas = datos.modelos.casa_munecas
  ? JSON.parse(fs.readFileSync(path.join(raiz, 'public', datos.modelos.casa_munecas), 'utf-8'))
  : null;
const faltantes = (rutas) => rutas.filter((r) => r && !fs.existsSync(path.join(dist, r)));

describe('visor · archivos publicados', () => {
  const rutas = [
    ...datos.recorridos.flatMap((r) => [r.thumb, ...r.vistas.flatMap((v) => [v.pano, v.pano_m])]),
    ...datos.imagenes.flatMap((i) => [i.img, i.thumb]),
    ...datos.familias.flatMap((f) => f.niveles.map((n) => n.plano)),
    ...datos.locales.flatMap((l) => l.niveles.map((n) => n.plano)),
    ...conPlanta3D.flatMap((x) => [...(x.planta3d ?? []).map((p) => p.img), x.iso]),
    ...vistas.map(({ v }) => v.planta?.img),
    ...Object.values(datos.modelos),
  ];

  test('cada recurso de explorar.json existe en dist/', () => {
    assert.deepEqual(faltantes(rutas), []);
  });

  // El visor esconde el botón si la imagen no carga, así que no rompe la página: se reporta como pendiente.
  const mapasFaltantes = faltantes(vistas.map(({ v }) => v.mapa?.img));
  test('los planos de ubicación existen en dist/', { todo: mapasFaltantes.length ? `faltan ${mapasFaltantes.join(', ')}` : false }, () => {
    assert.deepEqual(mapasFaltantes, []);
  });

  test('ningún modelo 3D supera 10 MB', () => {
    for (const r of Object.values(datos.modelos)) {
      const mb = fs.statSync(path.join(dist, r)).size / 1e6;
      assert.ok(mb < 10, `${r} pesa ${mb.toFixed(1)} MB`);
    }
  });
});

describe('visor · datos nuevos', () => {
  test('cada salto apunta a otra vista del mismo recorrido', () => {
    const malos = vistas.flatMap(({ r, v, i }) =>
      (v.saltos ?? []).filter((s) => !Number.isInteger(s.a) || s.a === i || !r.vistas[s.a]).map((s) => `${r.id}/${i}→${s.a}`)
    );
    assert.deepEqual(malos, []);
  });

  // El visor oculta el punto si cae fuera de la imagen; un dato así es un error del exportador.
  const fuera = vistas
    .filter(({ v }) => [v.planta, v.mapa].some((u) => u && !(u.x >= 0 && u.x <= 1 && u.y >= 0 && u.y <= 1)))
    .map(({ r, v }) => `${r.id} · ${v.nombre}`);
  test('la posición en la planta cae dentro de la imagen', { todo: fuera.length ? `fuera de rango: ${fuera.join(', ')}` : false }, () => {
    assert.deepEqual(fuera, []);
  });

  test('casa de muñecas: cada unidad existe en el inventario', { skip: !casaMunecas && 'sin casa_munecas' }, () => {
    const normal = (s) => s.toUpperCase().replace(/^LOC\.?/, '').replace(/[\s.]/g, '');
    const csv = fs.readFileSync(path.join(raiz, 'unidades_cotizador.csv'), 'utf-8').trim().split('\n').slice(1);
    const deptos = new Set(csv.filter((l) => l.split(',')[1] === 'DEPARTAMENTO').map((l) => normal(l.split(',')[5])));
    const locales = new Set(csv.filter((l) => l.split(',')[1] === 'LOCAL').map((l) => normal(l.split(',')[5])));
    const huerfanas = casaMunecas.pisos.flatMap((p) =>
      p.unidades.filter((u) => !(u.tipo === 'local' ? locales : deptos).has(normal(u.nombre))).map((u) => `${p.id}:${u.nombre}`)
    );
    assert.deepEqual(huerfanas, []);
    assert.ok(casaMunecas.pisos.every((p) => p.unidades.every((u) => u.poly.length >= 3)));
  });
});

describe('visor · publicado', () => {
  const html = fs.readFileSync(path.join(dist, VISOR, 'index.html'), 'utf-8');

  test('no lleva noindex ni X-Robots-Tag', () => {
    assert.doesNotMatch(html, /<meta name="robots" content="noindex/);
    const headers = path.join(raiz, 'public/_headers');
    if (fs.existsSync(headers)) assert.doesNotMatch(fs.readFileSync(headers, 'utf-8'), /explorar|visor-/);
  });

  test('está en el sitemap y en llms.txt', () => {
    const sitemaps = fs.readdirSync(dist).filter((f) => f.startsWith('sitemap'));
    assert.ok(sitemaps.some((f) => /\/explorar\//.test(fs.readFileSync(path.join(dist, f), 'utf-8'))));
    assert.match(fs.readFileSync(path.join(dist, 'llms.txt'), 'utf-8'), /\(\/explorar\/\)/);
  });

  test('el menú enlaza a Explorar 3D en todas las páginas', () => {
    const paginas = fs.readdirSync(dist, { recursive: true }).filter((f) => f.endsWith('index.html'));
    const sinLink = paginas.filter((f) => !/<a href="\/explorar\/"[^>]*>Explorar 3D<\/a>/.test(fs.readFileSync(path.join(dist, f), 'utf-8')));
    assert.deepEqual(sinLink, []);
    assert.match(html, /<a href="\/explorar\/" aria-current="page">Explorar 3D<\/a>/);
  });

  test('/visor-360/ redirige con 301 y nadie enlaza a la URL vieja', () => {
    const reglas = fs.readFileSync(path.join(dist, '_redirects'), 'utf-8').split('\n').map((l) => l.trim().split(/\s+/));
    assert.ok(reglas.some(([de, a, c]) => de === '/visor-360' && a === '/explorar/' && c === '301'));
    assert.ok(reglas.some(([de, a, c]) => de === '/visor-360/*' && a === '/explorar/:splat' && c === '301'));
    assert.ok(!fs.existsSync(path.join(dist, 'visor-360')));
    const paginas = fs.readdirSync(dist, { recursive: true }).filter((f) => f.endsWith('.html'));
    assert.deepEqual(paginas.filter((f) => /visor-360/.test(fs.readFileSync(path.join(dist, f), 'utf-8'))), []);
  });
});

describe('cotizar desde el 360° · cotizacion360', () => {
  const familias = [
    { id: 'B-1', recorrido: '304B', tc: 'B2', tcNombre: '1D compacto' },
    { id: 'B-2', recorrido: '305B', tc: 'B1', tcNombre: '1D con terraza' },
  ];
  const locales = [
    { id: 'B1', unidad: 'LOC. 1 B', titulo: 'Local 1B', recorrido: 'LB1', datos: { estado: 'disponible' } },
    { id: 'B2', unidad: 'LOC. 2 B', titulo: 'Local 2B', recorrido: 'LB2', datos: { estado: 'vendida' } },
  ];
  const departamentos = [
    { nombre: '104 B', estado: 'disponible', familiaPlanta: 'B-1' },
    { nombre: '204 B', estado: 'reservada', familiaPlanta: 'B-1' },
    { nombre: '304 B', estado: 'disponible', familiaPlanta: 'B-1' },
    { nombre: '305 B', estado: 'vendida', familiaPlanta: 'B-2' },
  ];
  const D = { familias, locales, departamentos };

  test('un recorrido de departamento ofrece las unidades disponibles de su planta', () => {
    assert.deepEqual(cotizacion360({ id: '304B', unidad: '304 B' }, D), {
      tipo: 'tipologia', familia: 'B-1', tc: 'B2', tcNombre: '1D compacto', unidades: ['104 B', '304 B'],
    });
    // Sin `recorrido` en la familia, manda la planta de la unidad del recorrido.
    const sinRecorrido = { ...D, familias: familias.map((f) => ({ ...f, recorrido: null })) };
    assert.equal(cotizacion360({ id: '304B', unidad: '304 B' }, sinRecorrido)?.familia, 'B-1');
  });

  test('un recorrido de local cotiza ese local; vendido o sin unidades, no hay botón', () => {
    assert.deepEqual(cotizacion360({ id: 'LB1', local: 'B1' }, D), { tipo: 'local', local: 'B1', unidad: 'LOC. 1 B', titulo: 'Local 1B' });
    assert.equal(cotizacion360({ id: 'LB2', local: 'B2' }, D), null);
    assert.equal(cotizacion360({ id: '305B', unidad: '305 B' }, D), null);
    assert.equal(cotizacion360({ id: 'edificio' }, D), null);
    assert.equal(cotizacion360(undefined, D), null);
  });

  test('hrefCotizacion arma el link a /contacto', () => {
    assert.equal(hrefCotizacion([]), '/contacto');
    assert.equal(hrefCotizacion(['304 B', 'LOC. 1 B']), '/contacto?unidades=304%20B%2CLOC.%201%20B');
  });
});

describe('visor · navegador', () => {
  let srv, browser, page;

  before(async () => {
    srv = await servirDist();
    browser = await abrirNavegador();
    page = await browser.newPage();
    // Sin red externa: los visores 360/3D no cargan, el resto debe funcionar igual.
    await page.setRequestInterception(true);
    page.on('request', (r) => (r.url().startsWith(srv.url) ? r.continue() : r.abort()));
  });

  after(async () => {
    await browser?.close();
    await srv?.cerrar();
  });

  test('la pestaña Unidades lista los 56 departamentos y filtra', async () => {
    await page.setViewport({ width: 1366, height: 820 });
    await page.goto(`${srv.url}${VISOR}?tab=unidades`, { waitUntil: 'domcontentloaded' });
    const total = await page.$$eval('.ex-row', (els) => els.length);
    assert.equal(total, 56);
    await page.type('#ex-q', '304');
    const filtradas = await page.$$eval('.ex-row', (els) => els.map((e) => e.dataset.unidad));
    assert.deepEqual(filtradas.sort(), ['304 B', '304 C']);
  });

  test('tipologías: 11 familias y cada una muestra su planta', async () => {
    await page.goto(`${srv.url}${VISOR}?tab=tipologias&id=C-DUPLEX-301`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.$$eval('[data-familia]', (els) => els.length), 11);
    const src = await page.$eval('#ex-img img', (img) => img.getAttribute('src'));
    assert.match(src, /C-DUPLEX-301_p3\.png$/);
    // El dúplex ofrece sus dos niveles CAD, sus dos plantas 3D y la isométrica.
    const f = datos.familias.find((x) => x.id === 'C-DUPLEX-301');
    const esperados = f.niveles.length + (f.planta3d ?? []).length + (f.iso ? 1 : 0);
    assert.equal(await page.$$eval('#ex-chips button', (els) => els.length), esperados);
  });

  test('ficha de tipología: los botones de planta 3D e isométrica muestran la imagen', async () => {
    const f = datos.familias.find((x) => x.planta3d?.length && x.iso);
    assert.ok(f, 'ninguna familia trae planta 3D e isométrica');
    await page.goto(`${srv.url}${VISOR}?tab=tipologias&id=${encodeURIComponent(f.id)}`, { waitUntil: 'domcontentloaded' });
    const botones = await page.$$eval('.ex-card [data-img3d]', (els) => els.map((e) => e.textContent.trim()));
    assert.equal(botones.length, f.planta3d.length + 1);
    assert.ok(botones.includes('Isométrica'));
    await page.click('.ex-card [data-img3d-iso]');
    assert.equal(await page.$eval('#ex-img img', (img) => img.getAttribute('src')), f.iso);
    assert.equal(await page.$eval('#ex-chips [aria-pressed="true"]', (b) => b.textContent), 'Isométrica');
    // La miniatura de la lista usa la planta 3D.
    const mini = await page.$eval(`[data-familia="${f.id}"] img`, (img) => img.getAttribute('src'));
    assert.equal(mini, f.planta3d[0].img);
  });

  test('ficha de local con planta 3D ofrece sus botones', async () => {
    const l = datos.locales.find((x) => x.planta3d?.length);
    if (!l) return;
    await page.goto(`${srv.url}${VISOR}?tab=locales&id=${encodeURIComponent(l.id)}`, { waitUntil: 'domcontentloaded' });
    await page.click('.ex-card [data-img3d]');
    assert.equal(await page.$eval('#ex-img img', (img) => img.getAttribute('src')), l.planta3d[0].img);
  });

  test('las unidades llevan su estado del CSV', async () => {
    await page.goto(`${srv.url}${VISOR}`, { waitUntil: 'domcontentloaded' });
    const estados = await page.$eval('#explorar-data', (s) => {
      const d = JSON.parse(s.textContent);
      return [...d.departamentos, ...d.locales.map((l) => l.datos)].map((u) => u.estado);
    });
    assert.ok(estados.length > 0);
    assert.ok(estados.every((e) => ['disponible', 'reservada', 'vendida'].includes(e)), estados.join(','));
  });

  test('Edificio abre por defecto en Unidades 3D, y sin red avisa en vez de romperse', { skip: !casaMunecas && 'sin casa_munecas' }, async () => {
    await page.goto(`${srv.url}${VISOR}?tab=edificio`, { waitUntil: 'domcontentloaded' });
    const chips = await page.$$eval('#ex-chips button', (els) => els.map((b) => [b.textContent, b.getAttribute('aria-pressed')]));
    assert.deepEqual(chips[0], ['Unidades 3D', 'true']);
    assert.equal(await page.$eval('#ex-casa', (e) => e.hidden), false);
    await page.waitForFunction(() => /No se pudo/.test(document.getElementById('ex-loading').textContent));
    // Al cambiar de vista la capa se esconde.
    await page.click('#ex-chips button:nth-child(2)');
    assert.equal(await page.$eval('#ex-casa', (e) => e.hidden), true);
  });

  test('el botón de controles oculta rótulos y chips', async () => {
    await page.goto(`${srv.url}${VISOR}?tab=recorridos&id=304B`, { waitUntil: 'domcontentloaded' });
    const visible = () => page.$eval('#ex-chips', (e) => getComputedStyle(e).display !== 'none');
    assert.equal(await visible(), true);
    await page.click('#ex-ui');
    assert.equal(await visible(), false);
    assert.equal(await page.$eval('#ex-fs', (e) => getComputedStyle(e).display !== 'none'), true);
    await page.click('#ex-ui');
    assert.equal(await visible(), true);
  });

  test('Mi selección llega a /contacto como mensaje', async () => {
    await page.goto(`${srv.url}${VISOR}?tab=unidades&id=305%20B`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('pr-seleccion'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.click('[data-sel="305 B"]');
    assert.equal(await page.$eval('#sel-count', (e) => e.textContent), '1');
    await page.click('#sel-open');
    const href = await page.$eval('#sel-cta', (a) => a.getAttribute('href'));
    await page.goto(`${srv.url}${href}`, { waitUntil: 'domcontentloaded' });
    const mensaje = await page.$eval('#cp-mensaje', (t) => t.value);
    assert.equal(mensaje, 'Me interesa cotizar la unidad 305 B.');
  });

  test('tras ver un plano, el 360° y el modelo 3D reciben el arrastre', async () => {
    const encima = () =>
      page.evaluate(() => {
        const r = document.querySelector('.ex-stage').getBoundingClientRect();
        return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.ex-layer')?.id;
      });
    await page.goto(`${srv.url}${VISOR}?tab=locales&id=B1`, { waitUntil: 'domcontentloaded' });
    assert.equal(await encima(), 'ex-img');
    await page.click('[data-go-recorrido]');
    assert.equal(await encima(), 'ex-pano');
    await page.goto(`${srv.url}${VISOR}?tab=locales&id=B1`, { waitUntil: 'domcontentloaded' });
    await page.click('[data-modelo]');
    assert.equal(await encima(), 'ex-model');
  });

  const disponiblesDe = (familia) =>
    page.$eval('#explorar-data', (s, f) => JSON.parse(s.textContent).departamentos.filter((u) => u.familiaPlanta === f && u.estado === 'disponible').map((u) => u.nombre), familia);

  test('cotizar desde el 360°: una tipología lista sus unidades disponibles y las agrega', async () => {
    const f = datos.familias.find((x) => x.recorrido);
    await page.goto(`${srv.url}${VISOR}?tab=recorridos&id=${f.recorrido}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.removeItem('pr-seleccion'));
    await page.reload({ waitUntil: 'domcontentloaded' });
    const esperadas = await disponiblesDe(f.id);
    if (!esperadas.length) {
      assert.equal(await page.$eval('#ex-cot', (b) => b.hidden), true);
      return;
    }
    assert.equal(await page.$eval('#ex-cot', (b) => b.hidden), false);
    await page.click('#ex-cot');
    assert.equal(await page.$eval('#cot-dialog', (d) => d.open), true);
    assert.deepEqual(await page.$$eval('#cot-list [data-cot-sel]', (els) => els.map((e) => e.dataset.cotSel)), esperadas);
    assert.equal(await page.$eval('#cot-cta', (a) => a.getAttribute('aria-disabled')), 'true');
    await page.click(`#cot-list [data-cot-sel="${esperadas[0]}"]`);
    assert.equal(await page.$eval('#sel-count', (e) => e.textContent), '1');
    assert.equal(await page.$eval(`#cot-list [data-cot-sel="${esperadas[0]}"]`, (b) => b.getAttribute('aria-pressed')), 'true');
    assert.equal(await page.$eval('#cot-cta', (a) => a.getAttribute('href')), `/contacto?unidades=${encodeURIComponent(esperadas[0])}`);
  });

  test('cotizar desde el 360°: un local se agrega a Mi selección; el edificio no tiene botón', async () => {
    await page.goto(`${srv.url}${VISOR}?tab=recorridos&id=edificio`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.$eval('#ex-cot', (b) => b.hidden), true);
    const disponibles = await page.$eval('#explorar-data', (s) =>
      JSON.parse(s.textContent).locales.filter((l) => l.recorrido && l.datos.estado === 'disponible').map((l) => [l.recorrido, l.unidad])
    );
    if (!disponibles.length) return;
    const [recorrido, unidad] = disponibles[0];
    await page.evaluate(() => localStorage.removeItem('pr-seleccion'));
    await page.goto(`${srv.url}${VISOR}?tab=recorridos&id=${recorrido}`, { waitUntil: 'domcontentloaded' });
    await page.click('#ex-cot');
    assert.equal(await page.$eval('#sel-dialog', (d) => d.open), true);
    assert.deepEqual(await page.$$eval('#sel-list [data-unsel]', (els) => els.map((e) => e.dataset.unsel)), [unidad]);
    assert.equal(await page.$eval('#sel-cta', (a) => a.getAttribute('href')), `/contacto?unidades=${encodeURIComponent(unidad)}`);
  });

  test('en celular no hay scroll horizontal', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    for (const tab of ['edificio', 'unidades', 'tipologias', 'locales', 'recorridos', 'imagenes']) {
      await page.goto(`${srv.url}${VISOR}?tab=${tab}`, { waitUntil: 'domcontentloaded' });
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(ancho <= 390, `${tab}: el documento mide ${ancho}px de ancho`);
    }
  });

  test('en celular el botón Cotizar cabe en el visor y abre el diálogo', async () => {
    await page.goto(`${srv.url}${VISOR}?tab=recorridos&id=304B`, { waitUntil: 'domcontentloaded' });
    if (await page.$eval('#ex-cot', (b) => b.hidden)) return;
    const caja = await page.$eval('#ex-cot', (b) => {
      const r = b.getBoundingClientRect();
      const s = document.getElementById('ex-stage').getBoundingClientRect();
      return { dentro: r.left >= s.left && r.right <= s.right && r.bottom <= s.bottom, ancho: r.width };
    });
    assert.ok(caja.dentro && caja.ancho > 0, JSON.stringify(caja));
    await page.tap('#ex-cot');
    assert.equal(await page.$eval('#cot-dialog', (d) => d.open), true);
  });
});
