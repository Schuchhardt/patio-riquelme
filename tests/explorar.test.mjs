/**
 * /explorar: que todo archivo referenciado se publique, que las pestañas se
 * armen con el inventario completo y que "Mi selección" llegue a /contacto.
 * No depende de los CDN de Pannellum ni de model-viewer.
 */
import test, { describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { dist, raiz, exigirBuild, servirDist, abrirNavegador } from './helpers/entorno.mjs';

exigirBuild();
const datos = JSON.parse(fs.readFileSync(path.join(raiz, 'src/data/explorar.json'), 'utf-8'));

describe('/explorar · archivos publicados', () => {
  const rutas = [
    ...datos.recorridos.flatMap((r) => [r.thumb, ...r.vistas.map((v) => v.pano)]),
    ...datos.imagenes.flatMap((i) => [i.img, i.thumb]),
    ...datos.familias.flatMap((f) => f.niveles.map((n) => n.plano)),
    ...datos.locales.flatMap((l) => l.niveles.map((n) => n.plano)),
    ...Object.values(datos.modelos),
  ];

  test('cada recurso de explorar.json existe en dist/', () => {
    const faltan = rutas.filter((r) => !fs.existsSync(path.join(dist, r)));
    assert.deepEqual(faltan, []);
  });

  test('ningún modelo 3D supera 10 MB', () => {
    for (const r of Object.values(datos.modelos)) {
      const mb = fs.statSync(path.join(dist, r)).size / 1e6;
      assert.ok(mb < 10, `${r} pesa ${mb.toFixed(1)} MB`);
    }
  });
});

describe('/explorar · navegador', () => {
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
    await page.goto(`${srv.url}/explorar/?tab=unidades`, { waitUntil: 'domcontentloaded' });
    const total = await page.$$eval('.ex-row', (els) => els.length);
    assert.equal(total, 56);
    await page.type('#ex-q', '304');
    const filtradas = await page.$$eval('.ex-row', (els) => els.map((e) => e.dataset.unidad));
    assert.deepEqual(filtradas.sort(), ['304 B', '304 C']);
  });

  test('tipologías: 11 familias y cada una muestra su planta', async () => {
    await page.goto(`${srv.url}/explorar/?tab=tipologias&id=C-DUPLEX-301`, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.$$eval('[data-familia]', (els) => els.length), 11);
    const src = await page.$eval('#ex-img img', (img) => img.getAttribute('src'));
    assert.match(src, /C-DUPLEX-301_p3\.png$/);
    // El dúplex ofrece sus dos niveles.
    assert.equal(await page.$$eval('#ex-chips button', (els) => els.length), 2);
  });

  test('Mi selección llega a /contacto como mensaje', async () => {
    await page.goto(`${srv.url}/explorar/?tab=unidades&id=305%20B`, { waitUntil: 'domcontentloaded' });
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

  test('en celular no hay scroll horizontal', async () => {
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
    for (const tab of ['edificio', 'unidades', 'tipologias', 'locales', 'recorridos', 'imagenes']) {
      await page.goto(`${srv.url}/explorar/?tab=${tab}`, { waitUntil: 'domcontentloaded' });
      const ancho = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(ancho <= 390, `${tab}: el documento mide ${ancho}px de ancho`);
    }
  });
});
