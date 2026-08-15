// motor-tarjeta.js — dibuja la tarjeta compartible con Canvas API, 100%
// offline, sin librerías nuevas. Construido ESTRICTAMENTE sobre
// `generarResumenCultivo()` (motor-resumen.js): no vuelve a calcular
// ningún total, solo elige qué mostrar y lo dibuja.
//
// Dos formatos nada más (punto 3 del pedido — "no veinte formatos"):
//   publicacion: 1080x1350 (4:5)
//   historia:    1080x1920 (9:16)
// Se dibuja directo a la resolución final (no un canvas chico escalado)
// para que quede nítido en pantallas retina.
//
// Privacidad (punto 5 del pedido): esta tarjeta NUNCA dibuja
// cultivo.ubicacion ni cultivo.nota — solo especie/variedad, fechas,
// duración, las métricas ya elegidas por elegirIndicadoresCiclo() (que
// por diseño no incluyen ubicación) y, únicamente si la persona lo pide
// explícitamente, la reflexión final (notaFinalizacion).

const FORMATOS_TARJETA = {
  publicacion: { w: 1080, h: 1350, label: 'Publicación', ratioLabel: '4:5' },
  historia: { w: 1080, h: 1920, label: 'Historia', ratioLabel: '9:16' },
};

// Paleta — mismos tokens que css/styles.css (:root), para que la tarjeta
// se sienta parte de la app y no un genérico "SaaS card".
const PALETA_TARJETA = {
  verdeOscuro: '#2f4f34',
  verde: '#3f6b45',
  verdeClaro: '#8fbf7a',
  verdeSuave: '#e7f0e2',
  tierra: '#a9784f',
  crema: '#f4f1ea',
  cremaCard: '#ffffff',
  texto: '#2b2a26',
  textoSuave: '#6b6a63',
  borde: '#e4ded0',
};

const FUENTE_TARJETA = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

// Hasta 6 indicadores (punto 6 del pedido: "elegir automáticamente 4-6
// métricas relevantes, no mostrar las 15") — reutiliza exactamente la
// misma selección/orden que ya usa la ficha en "Ciclo completado", nunca
// una segunda lógica de elección.
function elegirMetricasParaTarjeta(resumen, max = 6) {
  const todas = typeof elegirIndicadoresCiclo === 'function' ? elegirIndicadoresCiclo(resumen) : [];
  return todas.slice(0, max);
}

// Nombre de archivo sanitizado: "cultivarnos-tomate-cherry-2027.png"
// (ejemplo del pedido). Reutiliza normalizarTexto (utils.js) en vez de
// escribir un segundo slugificador.
function nombreArchivoTarjeta(cultivo) {
  const base = `cultivarnos ${cultivo.especie || 'cultivo'} ${cultivo.variedad || ''}`;
  const anioFuente = cultivo.fechaFinalizado || cultivo.fechaInicio || '';
  const anio = /^\d{4}/.test(anioFuente) ? anioFuente.slice(0, 4) : '';
  const slug = normalizarTexto(base).trim().replace(/\s+/g, '-');
  return `${slug}${anio ? `-${anio}` : ''}.png`.replace(/-+/g, '-');
}

function roundRectPath(ctx, x, y, w, h, r) {
  const radio = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radio, y);
  ctx.arcTo(x + w, y, x + w, y + h, radio);
  ctx.arcTo(x + w, y + h, x, y + h, radio);
  ctx.arcTo(x, y + h, x, y, radio);
  ctx.arcTo(x, y, x + w, y, radio);
  ctx.closePath();
}

function cargarImagen(url) {
  return new Promise((resolve) => {
    if (!url) { resolve(null); return; }
    const img = new Image();
    img.onload = () => resolve(img);
    // Nunca rompe la tarjeta: si la imagen no carga, seguimos sin foto
    // (punto 2 del pedido: "la imagen nunca debe romperse").
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

// Dibuja `img` recortada tipo "cover" dentro del rectángulo x,y,w,h.
function dibujarImagenCover(ctx, img, x, y, w, h) {
  const escala = Math.max(w / img.width, h / img.height);
  const iw = img.width * escala;
  const ih = img.height * escala;
  const ix = x + (w - iw) / 2;
  const iy = y + (h - ih) / 2;
  ctx.drawImage(img, ix, iy, iw, ih);
}

// Texto envuelto en varias líneas dentro de maxWidth. Devuelve la
// coordenada Y siguiente disponible (para seguir dibujando debajo).
function dibujarTextoEnvuelto(ctx, texto, x, y, maxWidth, lineHeight, maxLineas) {
  const palabras = (texto || '').split(/\s+/).filter(Boolean);
  let linea = '';
  let cy = y;
  let lineas = 0;
  for (let i = 0; i < palabras.length; i++) {
    const prueba = linea ? `${linea} ${palabras[i]}` : palabras[i];
    if (ctx.measureText(prueba).width > maxWidth && linea) {
      lineas++;
      if (maxLineas && lineas >= maxLineas) {
        ctx.fillText(`${linea.replace(/[.,;:]+$/, '')}…`, x, cy);
        return cy + lineHeight;
      }
      ctx.fillText(linea, x, cy);
      cy += lineHeight;
      linea = palabras[i];
    } else {
      linea = prueba;
    }
  }
  if (linea) { ctx.fillText(linea, x, cy); cy += lineHeight; }
  return cy;
}

// ---------------------------------------------------------------------
// Dibuja la tarjeta completa en un <canvas> nuevo, a la resolución final
// del formato elegido. `fotoUrl` puede ser una foto real del cultivo o,
// si no hay ninguna, la ilustración botánica de la Biblioteca (la misma
// que resuelve obtenerImagenCultivo — nunca se inventa una imagen nueva
// acá). `incluirReflexion` solo tiene efecto si resumen.finalizacion.nota
// existe (opt-in explícito del punto 5 del pedido).
// ---------------------------------------------------------------------
async function dibujarTarjetaCultivo({ cultivo, resumen, formato, fotoUrl, incluirReflexion }) {
  const dim = FORMATOS_TARJETA[formato] || FORMATOS_TARJETA.publicacion;
  const canvas = document.createElement('canvas');
  canvas.width = dim.w;
  canvas.height = dim.h;
  const ctx = canvas.getContext('2d');
  const P = PALETA_TARJETA;
  const pad = 64;

  // Fondo crema — identidad de la app, nunca un fondo genérico blanco.
  ctx.fillStyle = P.crema;
  ctx.fillRect(0, 0, dim.w, dim.h);

  // Zona de foto: proporción distinta según formato (punto: "Historia
  // debe adaptar la composición, no solo estirar la 4:5" — acá cambia la
  // fracción de alto dedicada a la foto, no solo el alto total).
  const fotoAltura = formato === 'historia' ? dim.h * 0.5 : dim.h * 0.56;
  const img = await cargarImagen(fotoUrl);
  if (img) {
    roundRectPath(ctx, 0, 0, dim.w, fotoAltura + 40, 0);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, dim.w, fotoAltura);
    ctx.clip();
    dibujarImagenCover(ctx, img, 0, 0, dim.w, fotoAltura);
    ctx.restore();
    // Degradé suave hacia el fondo crema, para que el corte de la foto no
    // quede seco.
    const grad = ctx.createLinearGradient(0, fotoAltura - 140, 0, fotoAltura);
    grad.addColorStop(0, 'rgba(244,241,234,0)');
    grad.addColorStop(1, P.crema);
    ctx.fillStyle = grad;
    ctx.fillRect(0, fotoAltura - 140, dim.w, 140);
  } else {
    // Nunca queda roto: sin foto real NI ilustración botánica
    // disponible, cae a un panel verde-suave con una hoja — sigue
    // sintiéndose parte de Cultivarnos, no un espacio vacío.
    ctx.fillStyle = P.verdeSuave;
    ctx.fillRect(0, 0, dim.w, fotoAltura);
    ctx.font = `160px ${FUENTE_TARJETA}`;
    ctx.textAlign = 'center';
    ctx.fillText('🌿', dim.w / 2, fotoAltura / 2 + 60);
  }

  let y = fotoAltura + 20;

  // Especie + variedad
  ctx.textAlign = 'left';
  ctx.fillStyle = P.verdeOscuro;
  ctx.font = `700 64px ${FUENTE_TARJETA}`;
  ctx.fillText(cultivo.especie || '', pad, y + 60);
  y += 74;
  if (cultivo.variedad) {
    ctx.fillStyle = P.tierra;
    ctx.font = `500 36px ${FUENTE_TARJETA}`;
    ctx.fillText(cultivo.variedad, pad, y + 30);
    y += 48;
  }

  // Estado del ciclo — honesto siempre: si nunca hubo cosecha ni cierre
  // exitoso, esto simplemente dice "Ciclo finalizado", nunca inventa un
  // relato de éxito (punto del pedido: "la tarjeta representa lo que
  // ocurrió").
  y += 34;
  ctx.fillStyle = P.verde;
  ctx.font = `600 40px ${FUENTE_TARJETA}`;
  const tituloEstado = resumen.estado === 'finalizado' ? 'Ciclo completado 🌱' : 'Cultivarnos 🌱';
  ctx.fillText(tituloEstado, pad, y);
  y += 48;

  // Días cultivando
  if (resumen.diasSeguimiento != null) {
    ctx.fillStyle = P.textoSuave;
    ctx.font = `400 34px ${FUENTE_TARJETA}`;
    ctx.fillText(`${resumen.diasSeguimiento} día${resumen.diasSeguimiento === 1 ? '' : 's'} cultivando`, pad, y);
    y += 50;
  }

  // Métricas: 4-6 nada más, cada una como una línea "🌱 20 sembradas".
  const metricas = elegirMetricasParaTarjeta(resumen);
  y += 16;
  ctx.font = `500 38px ${FUENTE_TARJETA}`;
  metricas.forEach((m) => {
    ctx.fillStyle = P.texto;
    ctx.fillText(`${m.icon}  ${m.texto}`, pad, y);
    y += 54;
  });

  // Reflexión final — solo si existe Y la persona activó el checkbox.
  if (incluirReflexion && resumen.finalizacion && resumen.finalizacion.nota) {
    y += 20;
    ctx.strokeStyle = P.borde;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(dim.w - pad, y);
    ctx.stroke();
    y += 46;
    ctx.fillStyle = P.verdeOscuro;
    ctx.font = `italic 400 34px ${FUENTE_TARJETA}`;
    const maxY = dim.h - 110;
    const maxLineas = Math.max(1, Math.floor((maxY - y) / 46));
    y = dibujarTextoEnvuelto(ctx, `"${resumen.finalizacion.nota}"`, pad, y, dim.w - pad * 2, 46, maxLineas);
  }

  // Marca discreta al pie — sin CTA comercial agresivo (punto del pedido).
  ctx.fillStyle = P.textoSuave;
  ctx.font = `500 30px ${FUENTE_TARJETA}`;
  ctx.textAlign = 'center';
  ctx.fillText('Cultivarnos · La memoria de tu huerta', dim.w / 2, dim.h - 44);

  return canvas;
}

function canvasATarjetaBlob(canvas) {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

window.FORMATOS_TARJETA = FORMATOS_TARJETA;
window.elegirMetricasParaTarjeta = elegirMetricasParaTarjeta;
window.nombreArchivoTarjeta = nombreArchivoTarjeta;
window.dibujarTarjetaCultivo = dibujarTarjetaCultivo;
window.canvasATarjetaBlob = canvasATarjetaBlob;
