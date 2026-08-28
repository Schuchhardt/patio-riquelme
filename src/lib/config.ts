export const FORMSPREE_ENDPOINT = 'https://formspree.io/f/xrenybgz';
export const CONTACT_EMAIL = 'contacto@patioriquelme.cl';

// ---------------------------------------------------------------------------
// Entrega — una sola cadena para todo el sitio (hero, avance de obra, FAQ).
// ---------------------------------------------------------------------------
/** Versión completa, para texto corrido. */
export const ENTREGA_ESTIMADA = 'Fines de 2027 – inicios de 2028';
/** Versión compacta, para la barra de cifras del home. */
export const ENTREGA_ESTIMADA_CORTA = '2027–28';

// ---------------------------------------------------------------------------
// Contacto directo
// ---------------------------------------------------------------------------
/**
 * Teléfono de ventas en formato internacional sin signos (para wa.me).
 * Déjalo vacío ('') para ocultar todos los CTA de WhatsApp/teléfono del sitio.
 */
export const WHATSAPP_NUMERO = '';
/** Cómo se muestra el número en pantalla. */
export const WHATSAPP_DISPLAY = '';
/** Mensaje precargado al abrir el chat. */
export const WHATSAPP_MENSAJE = 'Hola, me interesa Patio Riquelme. Quisiera más información.';

export const TIENE_WHATSAPP = WHATSAPP_NUMERO !== '';

export function whatsappUrl(mensaje: string = WHATSAPP_MENSAJE): string {
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(mensaje)}`;
}

/** Horario de la sala de ventas. Vacío = no se muestra. */
export const SALA_VENTAS_DIRECCION = 'Santo Domingo 1720, Santiago Centro';
export const SALA_VENTAS_HORARIO = '';

// ---------------------------------------------------------------------------
// Legal
// ---------------------------------------------------------------------------
/** Disclaimer Ley N° 19.472 — obligatorio donde se muestren plantas, renders, superficies o precios. */
export const DISCLAIMER_LEY_19472 =
  'Las imágenes, caracterizaciones, textos, plantas y medidas contenidas en este material fueron elaborados con fines ilustrativos y todas las dimensiones son aproximadas, no constituyendo necesariamente una representación exacta de la realidad. Su única finalidad es mostrar de manera referencial el proyecto. Lo anterior se informa en virtud de lo dispuesto en la Ley N° 19.472. Los precios están expresados en UF, son referenciales y están sujetos a confirmación al momento de la reserva.';

// ---------------------------------------------------------------------------
// Créditos del proyecto
// ---------------------------------------------------------------------------
export interface Credito {
  rol: string;
  nombre: string;
  /** URL opcional del sitio de la empresa. */
  url?: string;
  /** Ruta del logo en /public (ej. '/creditos/constructora.png'). Opcional. */
  logo?: string;
}

/**
 * Se muestra en el footer. Mientras esté vacío, la sección no se renderiza.
 * Completar con inmobiliaria, constructora, arquitecto y financiamiento.
 */
export const CREDITOS: Credito[] = [];

// ---------------------------------------------------------------------------
// Ubicación
// ---------------------------------------------------------------------------
export const DIRECCION_COMPLETA =
  'Guardia Marina Ernesto Riquelme 536 / Santo Domingo 1720, Santiago Centro';

/**
 * Coordenadas del proyecto. Se usan en el mapa embebido y en el JSON-LD de Place,
 * así que hay un solo lugar que corregir.
 *
 * Verificadas contra la ficha de Google Maps de Guardia Marina Ernesto Riquelme 536.
 * Las anteriores (-33.4400, -70.6718) estaban 1 km al surponiente: mostraban otra manzana.
 */
export const COORDENADAS = { lat: -33.4379843, lng: -70.6612325 };

/** Media ventana del bbox del mapa, en grados. Más chico = más zoom. */
const MAPA_DELTA = { lat: 0.006, lng: 0.011 };

export const MAPA_EMBED_URL = (() => {
  const { lat, lng } = COORDENADAS;
  // Redondeado a 6 decimales (~11 cm): evita el ruido de coma flotante en la URL.
  const r = (n: number) => Number(n.toFixed(6));
  const bbox = [
    r(lng - MAPA_DELTA.lng),
    r(lat - MAPA_DELTA.lat),
    r(lng + MAPA_DELTA.lng),
    r(lat + MAPA_DELTA.lat),
  ].join('%2C');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lng}`;
})();

export const MAPA_LINK_EXTERNO = `https://www.google.com/maps/search/?api=1&query=${COORDENADAS.lat}%2C${COORDENADAS.lng}`;

export interface Hito {
  /** Distancia o tiempo. Vacío = no se muestra la columna de la métrica. */
  valor: string;
  nombre: string;
  detalle: string;
}

/**
 * Cercanía al metro. Se afirma en el hero, en las meta descriptions, en el
 * JSON-LD, en la FAQ y en /ubicacion — una sola constante para las cinco.
 * Antes convivían "1 cuadra" (8 lugares) y ningún tiempo de caminata.
 */
export const METRO_ESTACION = 'Metro Santa Ana';
export const METRO_TIEMPO_CORTO = '2 min';
/** Para texto corrido: "…, a 2 minutos caminando del Metro Santa Ana." */
export const METRO_FRASE = 'a 2 minutos caminando del Metro Santa Ana';
/** Para listas y meta tags, sin el gerundio. */
export const METRO_FRASE_CORTA = 'A 2 minutos del Metro Santa Ana';

/**
 * Hitos del entorno. Agregar aquí Mercado Central, universidades, etc. una vez
 * que las distancias estén confirmadas — no inventar tiempos de caminata.
 */
export const HITOS: Hito[] = [
  { valor: METRO_TIEMPO_CORTO, nombre: METRO_ESTACION, detalle: 'Caminando' },
  { valor: '15 min', nombre: 'Plaza de Armas y centro histórico', detalle: 'Caminando' },
  {
    valor: '10 min',
    nombre: 'Barrio Brasil',
    detalle: 'Caminando, con su vida de plazas, cafés y cultura',
  },
];
