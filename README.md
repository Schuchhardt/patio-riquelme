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
npm test          # build + suite de tests (ver «Tests»)
```

## Estructura

```
src/
├── assets/            # imágenes fuente (optimizadas automáticamente por Astro a WebP)
├── components/        # Header, Footer, formularios, cotizador, FAQ, Seo
├── data/faqs.ts        # preguntas frecuentes (única fuente: se usa en el acordeón y en el JSON-LD)
├── layouts/
│   └── BaseLayout.astro  # <head> común: meta tags, JSON-LD Organization, capa de analytics, global.css
├── lib/
│   ├── config.ts         # constantes editables: contacto, WhatsApp, entrega, créditos, coordenadas, disclaimer
│   ├── unidades.ts       # parser del CSV + modelo público + test de humo del dataset
│   ├── pricing.ts        # fórmula y constantes de precio (UF/m², factor terraza)
│   ├── formValidacion.ts # validación de email/teléfono compartida por los 3 formularios
│   └── schema.ts         # helpers para generar JSON-LD (breadcrumbs, FAQPage)
├── pages/
│   ├── index.astro         # Inicio
│   ├── tipologias.astro    # Estudio / 1D / Duplex / Locales + cotizador de m²
│   ├── disponibilidad.astro # Buscador de las 62 unidades + modal de cotización
│   ├── ubicacion.astro     # Mapa (OpenStreetMap embed) + conectividad
│   └── contacto.astro      # Formulario + FAQ
└── styles/global.css    # variables CSS responsive (breakpoints 860px / 480px), menú mobile
public/
├── robots.txt
├── llms.txt           # resumen del sitio para crawlers de IA / answer engines
├── og-image.jpg       # imagen para Open Graph / Twitter Card
└── brochure.pdf       # brochure descargable (generado con scripts/generate-brochure.mjs)
tests/                  # tests del buscador (node --test + puppeteer-core sobre ./dist)
unidades_cotizador.csv  # inventario real de unidades (tipología, m², piso, precio) — fuente de verdad para tipologías.astro y el cotizador
```

## Datos de unidades

`unidades_cotizador.csv` es la **única fuente de verdad** del inventario (62 unidades: 56 departamentos + 6 locales). Lo lee [`src/lib/unidades.ts`](src/lib/unidades.ts) en build time; `/tipologias` y `/disponibilidad` derivan todo de ahí — no hay metrajes, conteos ni precios escritos a mano en las páginas.

Tres superficies, explícitas y separadas:

| Campo del CSV | Significado | En la UI |
|---|---|---|
| `superficie_total_m2` | superficie **útil** (interior) — el nombre del CSV induce a error | `m2Util` → «Superficie útil» |
| `superficie_terraza_m2` | terraza | `m2Terraza` → «Terraza» |
| `superficie_total_venta_m2` | útil + terraza — es la superficie sobre la que se cotiza | `m2Total` → «Superficie total» |

### Precio

El CSV trae el **precio base**, función solo de la superficie:

```
precio_base = útil × UF_M2_BASE + terraza × UF_M2_BASE × FACTOR_TERRAZA   // 110 y 0.5
```

Sobre él, [`pricing.ts`](src/lib/pricing.ts) aplica una **escala lineal de +1% por nivel** (`ESCALA_POR_NIVEL`). El nivel más bajo del edificio (Nivel Patio) es el índice 0 y conserva su precio base; cada nivel por encima suma un 1%. Es lineal, no compuesta: el Piso 4 vale base × 1,04, no base × 1,01⁴.

Sin la escala, un mismo plano valía lo mismo en el Nivel Patio que en el Piso 4 — no había diferencial de altura ni palanca para colocar primero los niveles bajos. Con ella, las 20 unidades B1 (plano idéntico) abren 149 UF de spread:

| Nivel | Base | Lista |
|---|---|---|
| Nivel Patio | 3.721,3 | **3.721,3** |
| Piso 1 | 3.721,3 | 3.758,5 |
| Piso 2 | 3.721,3 | 3.795,7 |
| Piso 3 | 3.721,3 | 3.832,9 |
| Piso 4 | 3.721,3 | **3.870,2** |

Efecto en el total: departamentos **190.889,4 → 195.655,4 UF** (+4.766, un 2,08% del proyecto). El mínimo residencial pasa de 2.684 a **2.737,7 UF**.

**Los locales no escalan** (`ESCALA_APLICA_A_LOCALES = false`): están todos en el Piso 1, así que un incremento por nivel sería un alza plana disfrazada, no un diferencial de altura. Su precio se revisa aparte.

`ESCALA_POR_NIVEL = 0` desactiva todo y devuelve los precios del CSV tal cual.

Cada unidad expone `uf` (precio de lista, el que se publica), `ufBase` (el del CSV) y `ufEscala` (el sobreprecio por altura). Los tres viajan en el payload de la cotización para que ventas vea el desglose.

### Test de humo (falla el build)

`unidades.ts` valida el dataset completo al importarse. **El build se cae** —con el detalle de cada unidad afectada— si alguna tiene precio `NaN`/vacío/≤ 0, superficie ≤ 0, piso indefinido, tipología vacía, `id_unidad` duplicado, superficies que no suman, o un precio que no coincide con la fórmula. Nunca se publica un `NaN`.

Además, `formatUF()` degrada a `"Consultar"` ante cualquier valor no publicable, como segunda red de seguridad en runtime.

> El CSV viene con saltos de línea CRLF. El parser los normaliza explícitamente: sin eso, la última cabecera queda como `precio_estimado_uf\r` y **todos** los precios del sitio salen `NaN`.

## Tests

```bash
npm test        # build + tests
npm run test:only   # tests sobre el ./dist ya construido
```

Corren con el runner de Node (`node --test`, sin dependencias nuevas) y apuntan
al **build real** de `./dist`, no al código fuente: los tests levantan un
servidor estático sobre `dist/` y abren `/disponibilidad` en Chromium
(`puppeteer-core`, el mismo que usa el brochure). Si Chrome no está en una ruta
conocida, apunta `CHROME_PATH` al ejecutable.

- [`tests/buscador.test.mjs`](tests/buscador.test.mjs) — el filtro de
  `/disponibilidad`: preselección por `?tipologia=`, `?piso=`, `?cuerpo=` y
  `?tc=`, los chips, el cruce entre filtros, el rango de precio y «Limpiar
  filtros». La aserción central es que **lo que se renderiza** es exactamente lo
  que cumple el filtro, y que el contador coincide con lo que se ve.
- [`tests/ocultamiento.test.mjs`](tests/ocultamiento.test.mjs) — guarda estática
  sobre el HTML construido, sin navegador.

> **Por qué se mide lo renderizado y no la clase `oculta`.** El buscador oculta
> unidades agregando `.oculta`, pero las tarjetas traían `display:flex` en un
> atributo `style` inline, que le gana por cascada a
> `.unidad-card.oculta {display:none}`. El JS marcaba bien las tarjetas y el
> contador decía «3 unidades disponibles», mientras en pantalla seguían
> apareciendo las 1D. Un test que comprobara la clase habría dado verde con el
> bug vivo. Por eso la presentación de la tarjeta vive en el bloque `<style>`
> del componente y ningún elemento que se oculte por clase puede declarar
> `display` inline.

## Tipologías comerciales

La columna `tipologia` del CSV es demasiado gruesa para vender: agrupa 51 unidades entre 24,4 y 37,58 m² bajo «1D». [`src/lib/tipologiasComerciales.ts`](src/lib/tipologiasComerciales.ts) la subdivide en las **11 plantas reales** del proyecto, derivadas del CSV base con reglas deterministas — no hay una columna extra que mantener sincronizada.

| Cód. | Nombre | Uds. | Total m² | Desde UF | Niveles |
|---|---|---|---|---|---|
| **B1** | 1D con terraza | **20** | 35,68 | 3.721 | -1 a 4 |
| **B2** | 1D compacto | **15** | 28,38–28,75 | 3.013 | -1 a 4 |
| C1 | 1D compacto | 5 | 24,40–27,33 | 2.684 | 3 a 5 |
| A2 | 1D | 4 | 31,63–35,04 | 3.479 | 2 a 3 |
| C2 | 1D con terraza | 4 | 28,67 | 2.967 | 2 a 5 |
| A1 | Estudio | 3 | 24,40–26,38 | 2.684 | 2 a 3 |
| B3 | 1D esquina | 2 | 34,22 | 3.626 | 5 |
| B4 | 1D superior | 1 | 37,58 | 4.011 | 3 |
| D1 | Duplex 1D | 1 | 47,02 | 5.172 | 3+4 |
| D2 | Duplex 1D + ½ | 1 | 49,33 | 5.426 | 3+4 |
| LOCAL | Local comercial | 6 | 18,98–169,77 | 2.088 | 1 |

**B1 y B2 son 35 de los 56 departamentos (62%) con solo dos plantas.** B1 son 20 unidades idénticas repetidas en 5 niveles (Norte y Sur son la misma planta espejada).

`302 C` viene en el CSV como `tipologia=1D` pese a tener `es_duplex=SI` y ocupar Piso 3 + Piso 4: es lo que estiraba el rango de «1D» hasta 47 m². La regla de duplex se evalúa **antes** que la de cuerpo, así que queda como `D1` y el rango de 1D cierra en 37,58 m².

Las páginas agrupan por `familia` (E / 1D / Duplex / L), derivada de la tipología comercial — no por la columna `tipologia` del CSV. `/tipologias` lista las 11 plantas en tabla, cada una enlazando a `/disponibilidad?tc=B1`. El test de humo **falla el build** si alguna unidad deja de clasificar.

## El nivel -1: «Nivel Patio»

El edificio **parte** en el nivel -1: es donde está el patio interior, y los pisos superiores miran hacia él. Por eso sus 7 unidades del cuerpo B tienen terraza (1,6–3,7 m²) y orientación N/S/P — algo que un subterráneo no tendría.

Se muestra como **«Nivel Patio»**, no como «Subterráneo», que describiría mal el producto y hundiría comercialmente esas 7 unidades. Pero tampoco se oculta que está bajo cota: el grupo lleva una nota permanente en `/disponibilidad` («Está bajo la cota del Piso 1, y los pisos superiores miran hacia el patio»), porque el comprador tiene que saber qué nivel está comprando. Se configura en `NIVEL_LABELS` / `NIVEL_DESCRIPCIONES`.

`ubicacionLabel()` también reescribe el tramo en las unidades que ocupan varios niveles: `LOC. C1` pasa de «Piso 1 + Piso 2 + Subterráneo -1» a «Piso 1 + Piso 2 + Nivel Patio».

> El home dice «5 pisos» y el JSON-LD `numberOfFloors: 5`, contando solo los niveles sobre cota. Confirmado como correcto: el Nivel Patio no suma al conteo.

## Configuración editable

Casi todo lo que cambia sin tocar diseño vive en [`src/lib/config.ts`](src/lib/config.ts):

| Constante | Para qué |
|---|---|
| `ENTREGA_ESTIMADA` / `_CORTA` | fecha de entrega — una sola cadena para hero, avance de obra y FAQ |
| `WHATSAPP_NUMERO` / `_DISPLAY` | activa el botón flotante mobile y los CTA de WhatsApp. **Vacío = ocultos en todo el sitio** |
| `SALA_VENTAS_HORARIO` | horario de atención en `/contacto` y footer. Vacío = no se muestra |
| `CREDITOS` | inmobiliaria, constructora, arquitecto, financiamiento (con logo opcional). Vacío = la sección no se renderiza |
| `COORDENADAS` | pin del mapa **y** JSON-LD de `Place`, en un solo lugar |
| `METRO_FRASE` / `METRO_FRASE_CORTA` | cercanía al metro — una constante para hero, meta descriptions, JSON-LD, FAQ y `/ubicacion` |
| `HITOS` | métricas de conectividad de `/ubicacion` |
| `DISCLAIMER_LEY_19472` | texto legal, renderizado por `Disclaimer.astro` en el footer de las 5 páginas |
| `NIVEL_LABELS` / `NIVEL_DESCRIPCIONES` (en `unidades.ts`) | nombre comercial de cada nivel y su nota aclaratoria |
| `ESCALA_POR_NIVEL` (en `pricing.ts`) | incremento de precio por nivel. `0` desactiva la escala |

## Formularios

Los tres formularios (mini-form del Home, `/contacto`, y el modal de cotización de `/disponibilidad`) postean a [Formspree](https://formspree.io) vía `fetch`, configurado en [`src/lib/config.ts`](src/lib/config.ts). Los leads llegan al email configurado en el dashboard de Formspree para ese endpoint. Si hay error de red o el POST falla, se muestra un mensaje de error con el mailto de respaldo.

- **Validación en cliente** de nombre, email y teléfono chileno vía [`src/lib/formValidacion.ts`](src/lib/formValidacion.ts), con foco y mensaje en el primer campo inválido.
- **Honeypot** `_gotcha` (el campo nativo de Formspree) en los tres.
- El modal de cotización inyecta en el payload la unidad, su `id_unidad`, tipología, piso, cuerpo, las tres superficies y el precio estimado.
- `/contacto?tipologia=1D` preselecciona la tipología; `/contacto?brochure=1` marca la casilla del brochure.

## Analytics

`BaseLayout.astro` define `window.track(evento, params)`, que empuja a `window.dataLayer` — listo para conectar GTM o GA4 sin tocar los componentes. Cualquier elemento con `data-track="nombre_evento"` se instrumenta solo.

Eventos emitidos: `agendar_visita`, `descargar_brochure`, `ver_unidades`, `filtro_unidades`, `limpiar_filtros`, `cotizar_abrir`, `cotizar_enviado`, `cotizar_error`, `contacto_enviado`, `contacto_error`, `cotizador_tipologia`, `whatsapp_*`, `abrir_mapa`.

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
| `/disponibilidad` | Inventario unidad por unidad, filtros (tipología, piso, cuerpo, precio) y modal de cotización |
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

Datos que faltan y hoy dejan funcionalidad apagada o sin confirmar:

- **`WHATSAPP_NUMERO`** — vacío por decisión: por ahora el único canal directo es el correo. Mientras esté vacío, el botón flotante y todos los CTA de WhatsApp no se renderizan (verificado: cero referencias en el build). Se enciende llenando la constante, sin tocar componentes.
- **`SALA_VENTAS_HORARIO`** — vacío; no se muestra horario de atención.
- **`CREDITOS`** — vacío; la sección de créditos del footer no se renderiza.
- **Precio de los locales** — están a los mismos 110 UF/m² que los departamentos. `LOC. C1` son 169,77 m² en esquina a 18.675 UF. Revisar con tasación antes de publicar.

### Ubicación y distancias (verificadas)

`COORDENADAS` = `-33.4379843, -70.6612325`, tomadas de la ficha de Google Maps de Guardia Marina Ernesto Riquelme 536. Las anteriores (`-33.4400, -70.6718`) estaban **1.006 m al surponiente**: el mapa mostraba otra manzana.

Tiempos de caminata confirmados por el mandante: **2 min** al Metro Santa Ana, **15 min** a Plaza de Armas, **10 min** al Barrio Brasil.

El claim del metro venía como «1 cuadra» repetido a mano en 8 lugares (hero, dos meta descriptions, JSON-LD, FAQ, `llms.txt`, brochure, sección del barrio). Ahora sale de `METRO_FRASE` / `METRO_FRASE_CORTA`. `llms.txt` y el brochure son estáticos: hay que editarlos a mano si el número cambia.

El dominio `https://patioriquelme.cl` está hardcodeado en `astro.config.mjs`, `Seo.astro`, `BaseLayout.astro` (JSON-LD) y `robots.txt`. Si el dominio final es otro, actualízalo en esos archivos.
