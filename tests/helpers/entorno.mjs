/**
 * Utilidades compartidas por los tests: un servidor estático sobre ./dist y el
 * arranque de Chromium.
 *
 * Los tests corren contra el build real (`dist/`), no contra el código fuente:
 * el bug que motivó esta suite era de CSS —una declaración `display` inline le
 * ganaba a `.oculta`— y sólo aparece en la página renderizada.
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

export const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const dist = path.join(raiz, 'dist');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.xml': 'application/xml',
};

export function exigirBuild() {
  const pagina = path.join(dist, 'disponibilidad/index.html');
  if (!fs.existsSync(pagina)) {
    throw new Error(
      `No existe ${path.relative(raiz, pagina)}. Corre \`npm run build\` antes de los tests (\`npm test\` ya lo hace).`
    );
  }
  return pagina;
}

/** Servidor estático mínimo sobre ./dist. Devuelve { url, cerrar }. */
export async function servirDist() {
  const server = http.createServer((req, res) => {
    let archivo = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
    if (fs.existsSync(archivo) && fs.statSync(archivo).isDirectory()) {
      archivo = path.join(archivo, 'index.html');
    }
    if (!archivo.startsWith(dist) || !fs.existsSync(archivo)) {
      res.writeHead(404);
      return res.end('no encontrado');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(archivo)] ?? 'application/octet-stream' });
    res.end(fs.readFileSync(archivo));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    url: `http://127.0.0.1:${server.address().port}`,
    cerrar: () => new Promise((resolve) => server.close(resolve)),
  };
}

const RUTAS_CHROME = [
  process.env.CHROME_PATH,
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/opt/pw-browsers/chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

export function rutaChrome() {
  return RUTAS_CHROME.find((p) => fs.existsSync(p));
}

export async function abrirNavegador() {
  const executablePath = rutaChrome();
  if (!executablePath) {
    throw new Error(
      'No se encontró Chrome/Chromium. Instálalo o apunta la variable CHROME_PATH al ejecutable.'
    );
  }
  return puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
}
