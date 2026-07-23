# Patio Riquelme

Landing page del proyecto inmobiliario **Patio Riquelme** — studios y departamentos de 1 dormitorio dentro de dos fachadas patrimoniales restauradas en Santo Domingo, Santiago Centro.

Construido con [Astro](https://astro.build) como sitio 100% estático (HTML pre-renderizado, sin runtime de JS salvo los pequeños scripts de interactividad puntual).

## Requisitos

- Node **22** (el repo trae un [.nvmrc](.nvmrc); con [nvm](https://github.com/nvm-sh/nvm) instalado corre `nvm use` antes de cualquier comando).
- npm

## Uso

```bash
npm install       # instala dependencias
npm run dev       # servidor de desarrollo en http://localhost:4321
npm run build     # build de producción a ./dist
npm run preview   # sirve el build de ./dist localmente
```

## Estructura

```
src/
├── assets/            # imágenes fuente (optimizadas automáticamente por Astro a WebP)
├── components/        # Header, Footer, formularios, cotizador, FAQ, Seo
├── data/faqs.ts        # preguntas frecuentes (única fuente: se usa en el acordeón y en el JSON-LD)
├── layouts/
│   └── BaseLayout.astro  # <head> común: meta tags, JSON-LD Organization, import de global.css
├── lib/schema.ts        # helpers para generar JSON-LD (breadcrumbs, FAQPage)
├── pages/
│   ├── index.astro       # Inicio
│   ├── tipologias.astro  # Studio / 1 Dormitorio + cotizador de m²
│   ├── ubicacion.astro   # Mapa (OpenStreetMap embed) + conectividad
│   └── contacto.astro    # Formulario + FAQ
└── styles/global.css    # variables CSS responsive (breakpoints 860px / 480px), menú mobile
public/
├── robots.txt
├── llms.txt           # resumen del sitio para crawlers de IA / answer engines
├── og-image.jpg       # imagen para Open Graph / Twitter Card
└── brochure.pdf       # brochure descargable (generado con scripts/generate-brochure.mjs)
unidades_cotizador.csv  # inventario real de unidades (tipología, m², piso, precio) — fuente de verdad para tipologías.astro y el cotizador
```

## Formularios

Ambos formularios (mini-form del Home y el de `/contacto`) postean a [Formspree](https://formspree.io) vía `fetch`, configurado en [`src/lib/config.ts`](src/lib/config.ts). Los leads llegan al email configurado en el dashboard de Formspree para ese endpoint. Si hay error de red o el POST falla, se muestra un mensaje de error con el mailto de respaldo.

## Brochure PDF

`public/brochure.pdf` no se genera en cada build — es un artefacto versionado que se regenera manualmente cuando cambian las fotos, la data del CSV o el diseño:

```bash
node scripts/generate-brochure.mjs
```

El script arma un HTML de 6 páginas (mismo look del sitio: paleta, tipografías, fotos reales) y lo renderiza a PDF con `puppeteer-core` usando el Chrome instalado en el sistema (no descarga un Chromium aparte). Las imágenes se re-comprimen a JPEG a la resolución real que se muestran en el documento antes de incrustarlas, para mantener el PDF liviano (~1MB).

## Páginas

| Ruta | Contenido |
|---|---|
| `/` | Hero, avance de obra, accesos patrimoniales, galería, formulario de reserva |
| `/tipologias` | Detalle Estudio / 1D / Duplex / Locales + cotizador con datos reales del CSV |
| `/ubicacion` | Mapa embebido y conectividad del barrio |
| `/contacto` | Formulario extendido + preguntas frecuentes |

## SEO / AEO

- Meta tags únicos por página (title, description, canonical, Open Graph, Twitter Card) vía [`Seo.astro`](src/components/Seo.astro).
- JSON-LD (Schema.org): `RealEstateAgent` global, `ApartmentComplex` en Inicio, `Product`/`Offer` en Tipologías, `Place` con geocoordenadas en Ubicación, y **`FAQPage`** en Contacto (clave para que asistentes de IA respondan citando el proyecto).
- `sitemap-index.xml` generado automáticamente en cada build (`@astrojs/sitemap`) + `robots.txt`.
- `llms.txt` con un resumen del proyecto para crawlers de answer engines.
- Imágenes servidas como WebP optimizado vía `astro:assets` (reducción de ~90% de peso vs. los PNG originales).

## Responsive

Sistema mobile-first con variables CSS en [`global.css`](src/styles/global.css) (`--pad-x`, `--cols-2`, `--cols-4`, etc.) que colapsan grids de 2/3/4 columnas a 1 columna y reducen paddings bajo 860px / 480px. El header incluye menú hamburguesa bajo 860px.

## Pendiente antes de producción

El dominio `https://patioriquelme.cl` está hardcodeado en `astro.config.mjs`, `Seo.astro`, `BaseLayout.astro` (JSON-LD) y `robots.txt`. Si el dominio final es otro, actualízalo en esos archivos.
