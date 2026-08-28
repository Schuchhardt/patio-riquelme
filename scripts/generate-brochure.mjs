import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

// --- pre-resize + compress images to the size they're actually displayed at ---
const tmpImgDir = path.join(root, '.brochure-tmp-imgs');
fs.mkdirSync(tmpImgDir, { recursive: true });

// width in px at ~150 DPI for the max size each image is shown at in the layout
const photoSpecs = {
  'hero.png': 1250,
  'fachada-riquelme.png': 650,
  'fachada-santo-domingo.png': 650,
  'render-bim-avance.png': 550,
  'render-patio-interior.jpeg': 700,
  'render-dormitorio.jpeg': 400,
  'fachada-calle-referencia.jpeg': 400,
  'render-fachada-palma.png': 1050,
  'Estudio.png': 550,
  '1D.png': 550,
  'Duplex.png': 550,
  'Local.png': 550,
};
const pngSpecs = { 'footer.png': 500 };

async function preprocess() {
  for (const [name, width] of Object.entries(photoSpecs)) {
    const out = path.join(tmpImgDir, name.replace(/\.(png|jpeg)$/, '.jpg'));
    await sharp(path.join(root, 'src/assets', name)).resize({ width }).jpeg({ quality: 78 }).toFile(out);
  }
  for (const [name, width] of Object.entries(pngSpecs)) {
    const out = path.join(tmpImgDir, name);
    await sharp(path.join(root, 'src/assets', name)).resize({ width }).png({ quality: 80 }).toFile(out);
  }
}
await preprocess();

const assets = (name) => {
  const jpg = name.replace(/\.(png|jpeg)$/, '.jpg');
  const candidate = fs.existsSync(path.join(tmpImgDir, jpg)) ? jpg : name;
  return `file://${path.join(tmpImgDir, candidate)}`;
};

// --- parse unidades_cotizador.csv (misma lógica que src/lib/unidades.ts) ---
// El CSV es CRLF: hay que partir con /\r?\n/ y limpiar las cabeceras, o la
// última columna queda como `precio_estimado_uf\r` y su valor sale NaN.
const csvText = fs.readFileSync(path.join(root, 'unidades_cotizador.csv'), 'utf-8');
const [headerLine, ...lines] = csvText
  .replace(/^\ufeff/, '')
  .split(/\r?\n/)
  .filter((line) => line.trim() !== '');
const headers = headerLine.split(',').map((h) => h.trim());
const unidades = lines.map((line) => {
  const cells = line.split(',');
  const row = {};
  headers.forEach((h, i) => (row[h] = (cells[i] ?? '').trim()));
  row.superficie_total_venta_m2 = Number(row.superficie_total_venta_m2);
  row.precio_estimado_uf = Number(row.precio_estimado_uf);
  if (!Number.isFinite(row.superficie_total_venta_m2) || !Number.isFinite(row.precio_estimado_uf)) {
    throw new Error(`[brochure] Datos inválidos para la unidad ${row.id_unidad}`);
  }
  return row;
});

function summarize(tipologia) {
  const items = unidades.filter((u) => u.tipologia === tipologia);
  const m2 = items.map((u) => u.superficie_total_venta_m2);
  return {
    count: items.length,
    minM2: Math.min(...m2),
    maxM2: Math.max(...m2),
  };
}

function formatM2(s) {
  return s.minM2 === s.maxM2 ? `${s.minM2} m²` : `${s.minM2} – ${s.maxM2} m²`;
}

const E = summarize('E');
const D1 = summarize('1D');
const DUPLEX = summarize('1D 1/2');
const L = summarize('L');

// --- HTML ---
const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400&family=Work+Sans:wght@400;500;600&display=swap" rel="stylesheet" />
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; font-family: 'Work Sans', sans-serif; color: oklch(25% 0.035 75); }
  .page {
    width: 210mm;
    height: 297mm;
    position: relative;
    overflow: hidden;
    page-break-after: always;
    background: oklch(97% 0.01 75);
  }
  .page:last-child { page-break-after: auto; }
  .eyebrow { font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: oklch(58% 0.09 75); margin: 0 0 10px; }
  h1, h2, h3 { font-family: 'Lora', serif; font-weight: 500; margin: 0; }
  .cover-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 25%; }
  .cover-gradient { position: absolute; inset: 0; background: linear-gradient(180deg, oklch(19% 0.03 75 / 0.05) 0%, oklch(14% 0.03 75 / 0.85) 100%); }
  .cover-content { position: absolute; left: 0; right: 0; bottom: 0; padding: 30mm 18mm; color: oklch(98% 0.006 75); }
  .pad { padding: 18mm; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8mm; }
  .card { border: 1px solid oklch(87% 0.014 75); background: oklch(97% 0.01 75); }
  .card img { width: 100%; height: 42mm; object-fit: cover; display: block; }
  .card .body { padding: 6mm; }
  .stat { text-align: center; }
  .stat .num { font-family: 'Lora', serif; font-size: 22px; color: oklch(58% 0.09 75); }
  .stat .label { font-size: 10px; color: oklch(45% 0.025 75); margin-top: 2px; }
  .dark { background: oklch(19% 0.03 75); color: oklch(94% 0.014 75); }
  .dark h2 { color: oklch(98% 0.006 75); }
  .timeline-item { display: flex; gap: 4mm; padding-bottom: 6mm; border-left: 1px solid oklch(58% 0.09 75); padding-left: 5mm; margin-left: 2mm; position: relative; }
  .timeline-item::before { content: ''; position: absolute; left: -2.2mm; top: 0; width: 3.2mm; height: 3.2mm; border-radius: 50%; background: oklch(58% 0.09 75); }
  .footer-note { position: absolute; bottom: 10mm; left: 18mm; right: 18mm; font-size: 9px; color: oklch(58% 0.025 75); text-align: center; }
</style>
</head>
<body>

  <!-- PAGE 1 — COVER -->
  <div class="page">
    <img class="cover-img" src="${assets('hero.png')}" />
    <div class="cover-gradient"></div>
    <div class="cover-content">
      <p class="eyebrow" style="color: oklch(74% 0.085 75);">Proyecto en construcción · Centro de Santiago</p>
      <h1 style="font-size: 44px; letter-spacing: 4px; text-transform: uppercase; margin-bottom: 14px;">Patio Riquelme</h1>
      <div style="width: 40px; height: 1px; background: oklch(68% 0.09 75); margin-bottom: 14px;"></div>
      <p style="font-size: 13px; letter-spacing: 2px; text-transform: uppercase; color: oklch(74% 0.09 75); margin: 0 0 10px;">Vive el centro. Con historia.</p>
      <p style="font-size: 15px; line-height: 1.5; max-width: 120mm; color: oklch(94% 0.014 75);">Estudios, departamentos de 1 dormitorio y duplex dentro de dos fachadas patrimoniales restauradas, a 2 minutos caminando del Metro Santa Ana.</p>
    </div>
  </div>

  <!-- PAGE 2 — EL PROYECTO -->
  <div class="page">
    <div class="pad">
      <p class="eyebrow">El proyecto</p>
      <h2 style="font-size: 26px; margin-bottom: 10mm; line-height: 1.2;">Fachada patrimonial,<br/>vida nueva por dentro</h2>
      <p style="font-size: 12px; line-height: 1.7; color: oklch(38% 0.03 75); margin-bottom: 6mm;">Patio Riquelme conserva y restaura las fachadas históricas de sus dos accesos —Guardia Marina Ernesto Riquelme 536 y Santo Domingo 1720— declaradas parte del patrimonio del barrio. Por dentro, un edificio nuevo de 5 pisos con departamentos estudio, 1 dormitorio y duplex, además de 6 locales comerciales en el primer piso.</p>
      <p style="font-size: 12px; line-height: 1.7; color: oklch(38% 0.03 75); margin-bottom: 10mm;">Es lo que distingue a Patio Riquelme de otros proyectos del sector: no borramos la historia del barrio, construimos sobre ella.</p>
    </div>
    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 3mm; padding: 0 18mm;">
      <img src="${assets('fachada-riquelme.png')}" style="width: 100%; height: 55mm; object-fit: cover; object-position: center 25%;" />
      <img src="${assets('fachada-santo-domingo.png')}" style="width: 100%; height: 55mm; object-fit: cover; object-position: center 40%;" />
    </div>
    <div style="display: grid; grid-template-columns: repeat(4, 1fr); margin: 12mm 18mm 0; border-top: 1px solid oklch(87% 0.014 75); border-bottom: 1px solid oklch(87% 0.014 75); padding: 6mm 0;">
      <div class="stat"><div class="num">5</div><div class="label">pisos</div></div>
      <div class="stat"><div class="num">2</div><div class="label">accesos patrimoniales</div></div>
      <div class="stat"><div class="num">${Math.floor(Math.min(E.minM2, D1.minM2))} m²</div><div class="label">desde</div></div>
      <div class="stat"><div class="num">2027–28</div><div class="label">entrega estimada</div></div>
    </div>
    <div class="footer-note">Patio Riquelme — Guardia Marina Ernesto Riquelme 536 / Santo Domingo 1720, Santiago Centro</div>
  </div>

  <!-- PAGE 3 — TIPOLOGIAS -->
  <div class="page">
    <div class="pad" style="padding-bottom: 0;">
      <p class="eyebrow">Tipologías</p>
      <h2 style="font-size: 26px; margin-bottom: 10mm;">Estudio, 1 dormitorio, duplex y locales</h2>
    </div>
    <div class="grid-2" style="padding: 0 18mm;">
      <div class="card">
        <img src="${assets('Estudio.png')}" />
        <div class="body">
          <h3 style="font-size: 16px; margin-bottom: 4px;">E · Estudio</h3>
          <p style="font-size: 11px; color: oklch(45% 0.025 75); line-height: 1.5; margin: 0;">Aprox. ${formatM2(E)}. Living-dormitorio integrado, kitchenette y baño. ${E.count} unidades en pisos 2 y 3.</p>
        </div>
      </div>
      <div class="card">
        <img src="${assets('1D.png')}" />
        <div class="body">
          <h3 style="font-size: 16px; margin-bottom: 4px;">1D · 1 Dormitorio</h3>
          <p style="font-size: 11px; color: oklch(45% 0.025 75); line-height: 1.5; margin: 0;">Aprox. ${formatM2(D1)} según unidad y piso. ${D1.count} unidades disponibles en todos los pisos.</p>
        </div>
      </div>
      <div class="card">
        <img src="${assets('Duplex.png')}" />
        <div class="body">
          <h3 style="font-size: 16px; margin-bottom: 4px;">Duplex 1D 1/2</h3>
          <p style="font-size: 11px; color: oklch(45% 0.025 75); line-height: 1.5; margin: 0;">${formatM2(DUPLEX)}. Departamento en dos niveles, unidad única en piso 3.</p>
        </div>
      </div>
      <div class="card">
        <img src="${assets('Local.png')}" />
        <div class="body">
          <h3 style="font-size: 16px; margin-bottom: 4px;">${L.count} Locales Comerciales</h3>
          <p style="font-size: 11px; color: oklch(45% 0.025 75); line-height: 1.5; margin: 0;">${formatM2(L)} según local, en el primer piso.</p>
        </div>
      </div>
    </div>
    <div class="footer-note">Metraje y disponibilidad referenciales, sujetos a confirmación con nuestro equipo de ventas.</div>
  </div>

  <!-- PAGE 4 — AVANCE DE OBRA + GALERIA -->
  <div class="page">
    <div class="pad" style="padding-bottom: 0;">
      <p class="eyebrow">Avance de obra</p>
      <h2 style="font-size: 26px; margin-bottom: 10mm;">Un proyecto en marcha, no en el papel</h2>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10mm; align-items: start;">
        <div>
          <div class="timeline-item"><div><div style="font-weight: 600; font-size: 12px;">Excavación completada</div><div style="font-size: 11px; color: oklch(45% 0.025 75);">Etapa finalizada</div></div></div>
          <div class="timeline-item"><div><div style="font-weight: 600; font-size: 12px;">Permiso de edificación aprobado</div><div style="font-size: 11px; color: oklch(45% 0.025 75);">Autorización municipal en regla</div></div></div>
          <div class="timeline-item"><div><div style="font-weight: 600; font-size: 12px;">Inicio de obras</div><div style="font-size: 11px; color: oklch(45% 0.025 75);">En curso</div></div></div>
          <div class="timeline-item" style="border-left-color: oklch(87% 0.014 75);"><div><div style="font-weight: 600; font-size: 12px;">Entrega estimada</div><div style="font-size: 11px; color: oklch(45% 0.025 75);">Fines de 2027 – inicios de 2028</div></div></div>
        </div>
        <img src="${assets('render-bim-avance.png')}" style="width: 100%; height: auto; border: 1px solid oklch(87% 0.014 75);" />
      </div>
    </div>
    <p class="eyebrow" style="padding: 0 18mm; margin-top: 12mm;">Galería</p>
    <div style="display: grid; grid-template-columns: 1.3fr 1fr; gap: 3mm; padding: 0 18mm;">
      <img src="${assets('render-patio-interior.jpeg')}" style="width: 100%; height: 75mm; object-fit: cover;" />
      <div style="display: grid; grid-template-rows: 1fr 1fr; gap: 3mm;">
        <img src="${assets('render-dormitorio.jpeg')}" style="width: 100%; height: 36mm; object-fit: cover;" />
        <img src="${assets('fachada-calle-referencia.jpeg')}" style="width: 100%; height: 36mm; object-fit: cover;" />
      </div>
    </div>
    <div class="footer-note">Renders referenciales del proyecto, sujetos a modificaciones durante la obra.</div>
  </div>

  <!-- PAGE 5 — UBICACION -->
  <div class="page dark">
    <div class="pad" style="height: 100%; display: flex; flex-direction: column; justify-content: center;">
      <p class="eyebrow" style="color: oklch(68% 0.09 75);">Ubicación y conectividad</p>
      <h2 style="font-size: 26px; color: oklch(98% 0.006 75); margin-bottom: 8mm;">Santo Domingo, a pasos de todo</h2>
      <p style="font-size: 12px; line-height: 1.7; color: oklch(87% 0.014 75); margin-bottom: 10mm; max-width: 110mm;">Un barrio tranquilo e histórico con excelente conectividad hacia el resto de la ciudad: a pasos del Metro, caminando al centro, y a 10 minutos del Barrio Brasil.</p>
      <div style="display: flex; flex-direction: column; gap: 4mm; margin-bottom: 10mm;">
        <div style="font-size: 13px;"><span style="color: oklch(68% 0.09 75); font-family: 'Lora', serif;">—</span> 2 minutos caminando del Metro Santa Ana</div>
        <div style="font-size: 13px;"><span style="color: oklch(68% 0.09 75); font-family: 'Lora', serif;">—</span> 15 minutos a pie de Plaza de Armas y el centro histórico</div>
        <div style="font-size: 13px;"><span style="color: oklch(68% 0.09 75); font-family: 'Lora', serif;">—</span> A 10 minutos caminando del Barrio Brasil</div>
      </div>
      <img src="${assets('render-fachada-palma.png')}" style="width: 100%; height: 90mm; object-fit: cover; border: 1px solid oklch(38% 0.03 75);" />
    </div>
  </div>

  <!-- PAGE 6 — CONTACTO -->
  <div class="page" style="display: flex; align-items: center; justify-content: center; text-align: center;">
    <div>
      <img src="${assets('footer.png')}" style="max-width: 90mm; width: 100%; height: auto; margin-bottom: 14mm;" />
      <h2 style="font-size: 22px; margin-bottom: 6mm;">Reserva desde ahora tu departamento</h2>
      <p style="font-size: 12px; color: oklch(45% 0.025 75); max-width: 110mm; margin: 0 auto 10mm; line-height: 1.6;">Proyecto en verde: los mejores pisos y orientaciones se reservan primero.</p>
      <p style="font-size: 14px; margin: 0 0 4mm;">contacto@patioriquelme.cl</p>
      <p style="font-size: 12px; color: oklch(45% 0.025 75); margin: 0 0 4mm;">Santo Domingo 1720, Santiago Centro</p>
      <p style="font-size: 12px; color: oklch(45% 0.025 75); margin: 0;">patioriquelme.cl</p>
    </div>
  </div>

</body>
</html>`;

const tmpHtmlPath = path.join(root, '.brochure-tmp.html');
fs.writeFileSync(tmpHtmlPath, html);

const chromePaths = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
];
const executablePath = chromePaths.find((p) => fs.existsSync(p));
if (!executablePath) throw new Error('Chrome not found');

const browser = await puppeteer.launch({ executablePath, headless: true });
const page = await browser.newPage();
await page.goto(`file://${tmpHtmlPath}`, { waitUntil: 'networkidle0' });
await page.pdf({
  path: path.join(root, 'public/brochure.pdf'),
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
fs.unlinkSync(tmpHtmlPath);
fs.rmSync(tmpImgDir, { recursive: true, force: true });

console.log('Brochure generated at public/brochure.pdf');
