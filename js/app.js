// app.js — inicialización, router hash-based y navegación inferior

const APP_ROOT = document.getElementById('app');
const BOTTOM_NAV = document.getElementById('bottom-nav');

const ROUTES = {
  '#/inicio': { render: renderInicio, nav: 'inicio' },
  '#/cultivos': { render: renderCultivos, nav: 'cultivos' },
  '#/nuevo': { render: renderNuevo, nav: 'registrar' },
  '#/configuracion': { render: renderConfiguracion, nav: null },
  '#/calendario': { render: renderCalendario, nav: null },
  '#/biblioteca': { render: renderBiblioteca, nav: 'biblioteca' },
  '#/espacios': { render: renderEspacios, nav: null },
  '#/banco': { render: renderBanco, nav: null },
  '#/banco/nuevo': { render: renderBancoNuevo, nav: null },
  // Cuenta (ver js/views/auth.js) — pantallas sin nav inferior, se
  // muestran o no según el gate de sesión de decidirDestino() más abajo.
  '#/bienvenida': { render: renderBienvenida, nav: null },
  '#/crear-cuenta': { render: renderCrearCuenta, nav: null },
  '#/iniciar-sesion': { render: renderIniciarSesion, nav: null },
  '#/recuperar-contrasena': { render: renderRecuperarContrasena, nav: null },
  '#/elegir-usuario': { render: renderElegirUsername, nav: null },
  '#/vincular-huerta': { render: renderVincularHuerta, nav: null },
  // '#/cultivo/:id', '#/biblioteca/:id', '#/espacios/:clave' y '#/banco/:id'
  // se manejan aparte
};

// Rutas visibles SIN sesión — cualquier otra ruta, sin sesión, redirige a
// '#/bienvenida' (ver decidirDestino). '#/elegir-usuario' y
// '#/vincular-huerta' están fuera de este set a propósito: solo tienen
// sentido CON sesión (usuario autenticado sin perfil todavía, o con
// perfil pero con una huerta local sin resolver) — decidirDestino las
// redirige por su cuenta cuando corresponde, nunca hace falta pedirlas
// directamente sin sesión.
const RUTAS_AUTH_SIN_SESION = new Set(['#/bienvenida', '#/crear-cuenta', '#/iniciar-sesion', '#/recuperar-contrasena']);

function estaAutenticado() {
  const est = window.CultivarnosAuth && window.CultivarnosAuth.getEstado();
  return !!(est && est.usuario);
}

// uid para el que ya se llamó CultivarnosSync.iniciar() en esta carga de
// página — evita reiniciar el Sync Engine en cada re-evaluación de ruta.
let syncIniciadoParaUid = null;

async function asegurarSyncIniciado(uid, perfil) {
  if (!window.CultivarnosSync || syncIniciadoParaUid === uid) return;
  syncIniciadoParaUid = uid;
  await window.CultivarnosSync.iniciar({ uid, perfil });
}

// Sin sesión confirmada por Firebase PERO este dispositivo tenía una
// sesión cacheada (localStorage) y Firebase no está disponible ahora
// mismo (sin red, CDN bloqueado): se prioriza seguir mostrando la huerta
// ya descargada en vez de bloquear a la persona por falta de señal — ver
// "nunca perder acceso a los propios datos por estar offline" en
// docs/firebase-architecture.md. No arranca el Sync Engine de verdad acá
// (no hay red); se arranca solo cuando CultivarnosAuth confirme sesión
// real (dispara router() de nuevo vía onCambio, ver el listener abajo).
async function continuarModoOfflineConUid(uid) {
  if (syncIniciadoParaUid === uid) return;
  await DB.usarBaseDeDatos(`cultivarnos-${uid}`);
  syncIniciadoParaUid = uid;
}

// El gate de sesión: decide a qué ruta corresponde ir de verdad dado el
// estado actual de autenticación, sin tocar en absoluto la lógica de
// parseRoute/ROUTES de arriba (reusa exactamente el mismo mecanismo de
// fallback que ya existía: "la ruta pedida, u otra si no corresponde").
// Devuelve la MISMA ruta pedida cuando no hace falta redirigir.
async function decidirDestino(pathSolicitado) {
  // Sin CultivarnosAuth en absoluto (el módulo no llegó a cargar) -> la
  // app sigue funcionando exactamente como antes de esta integración,
  // sin ningún gate.
  if (!window.CultivarnosAuth) return pathSolicitado;

  try { await window.CultivarnosAuth.ready(); } catch (err) { console.warn(err); }
  const est = window.CultivarnosAuth.getEstado();

  if (!est.usuario) {
    const uidCacheado = window.CultivarnosAuth.obtenerUidActivoCacheado();
    if (uidCacheado && !est.firebaseDisponible) {
      await continuarModoOfflineConUid(uidCacheado);
      return RUTAS_AUTH_SIN_SESION.has(pathSolicitado) ? '#/inicio' : pathSolicitado;
    }
    if (window.CultivarnosSync) window.CultivarnosSync.detener();
    syncIniciadoParaUid = null;
    await DB.usarBaseDeDatos('cultivarnos');
    return RUTAS_AUTH_SIN_SESION.has(pathSolicitado) ? pathSolicitado : '#/bienvenida';
  }

  if (est.necesitaUsername) return '#/elegir-usuario';

  await asegurarSyncIniciado(est.usuario.uid, est.perfil);
  const estSync = window.CultivarnosSync && window.CultivarnosSync.obtenerEstado();
  if (estSync && estSync.estado === 'espera-decision-huerta-local') return '#/vincular-huerta';

  if (RUTAS_AUTH_SIN_SESION.has(pathSolicitado) || pathSolicitado === '#/elegir-usuario' || pathSolicitado === '#/vincular-huerta') {
    return '#/inicio';
  }
  return pathSolicitado;
}

function parseRoute(hash) {
  // Separamos el query string (ej. #/nuevo?especie=tomate, usado por
  // "＋ Registrar este cultivo" desde una ficha de la Biblioteca) antes de
  // matchear contra ROUTES — así ninguna vista existente necesita cambiar
  // su forma de registrarse acá, solo recibe un segundo parámetro opcional
  // que puede ignorar.
  const [path, queryString] = hash.split('?');

  const fotosMatch = path.match(/^#\/cultivo\/(\d+)\/fotos$/);
  if (fotosMatch) {
    return { render: () => renderGaleriaFotos(Number(fotosMatch[1])), nav: 'cultivos' };
  }
  const detalleMatch = path.match(/^#\/cultivo\/(\d+)$/);
  if (detalleMatch) {
    return { render: () => renderDetalle(Number(detalleMatch[1])), nav: 'cultivos' };
  }
  const fichaMatch = path.match(/^#\/biblioteca\/([a-z0-9-]+)$/);
  if (fichaMatch) {
    return { render: (root) => renderFichaEspecie(fichaMatch[1], root), nav: 'biblioteca' };
  }
  const espacioMatch = path.match(/^#\/espacios\/([^/]+)$/);
  if (espacioMatch) {
    return { render: (root) => renderEspacioDetalle(decodeURIComponent(espacioMatch[1]), root), nav: null };
  }
  const loteMatch = path.match(/^#\/banco\/(\d+)$/);
  if (loteMatch) {
    return { render: (root) => renderBancoDetalle(Number(loteMatch[1]), root), nav: null };
  }
  const base = ROUTES[path] || ROUTES['#/inicio'];
  return { render: (root) => base.render(root, queryString), nav: base.nav };
}

async function router() {
  const hashOriginal = window.location.hash || '#/inicio';
  const pathSolicitado = hashOriginal.split('?')[0];
  const destino = await decidirDestino(pathSolicitado);

  if (destino !== pathSolicitado) {
    // Redirige de verdad (cambia el hash visible) en vez de solo pintar
    // otra cosa — así "atrás" del navegador y recargar la página se
    // comportan como se espera. El cambio de hash dispara 'hashchange',
    // que vuelve a llamar a router().
    window.location.hash = destino;
    return;
  }

  const route = parseRoute(hashOriginal);
  updateNavActive(route.nav);
  document.body.classList.toggle('sin-sesion', !estaAutenticado());
  APP_ROOT.classList.add('fading');
  try {
    await route.render(APP_ROOT);
  } catch (err) {
    console.error(err);
    APP_ROOT.innerHTML = `<div class="empty-state"><p>Ocurrió un error al cargar esta vista.</p></div>`;
  }
  requestAnimationFrame(() => APP_ROOT.classList.remove('fading'));
  window.scrollTo(0, 0);
}

function updateNavActive(navKey) {
  BOTTOM_NAV.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === navKey);
  });
}

function navigate(hash) {
  if (window.location.hash === hash) {
    router();
  } else {
    window.location.hash = hash;
  }
}

// Bottom sheet del botón "＋ Registrar" del nav inferior: la acción más
// frecuente (observación) va primero. "Riego múltiple" (ver
// views/riego-multiple.js) va segundo — mejora pedida explícitamente por
// uso real en la huerta, para el caso de regar varios cultivos a la vez
// sin tener que cargarlos uno por uno. Crear cultivo queda como opción
// chica, es la menos frecuente de las tres.
async function openRegistrarSheet() {
  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
      <h2>Registrar</h2>
      <button id="sheet-observacion" class="btn-primary" style="margin-bottom:10px;">${renderIcon('observacion', { scale: 'sm' })} Registrar observación</button>
      <button id="sheet-riego" class="btn-secondary" style="margin-bottom:10px;">💧 Riego múltiple</button>
      <button id="sheet-nuevo-cultivo" class="btn-secondary">＋ Nuevo cultivo</button>
    </div>
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);

  backdrop.querySelector('#sheet-observacion').addEventListener('click', async () => {
    close();
    const cultivos = await DB.getAllCultivos();
    openObservacionRapida(cultivos);
  });

  backdrop.querySelector('#sheet-riego').addEventListener('click', () => {
    close();
    openRiegoMultiple();
  });

  backdrop.querySelector('#sheet-nuevo-cultivo').addEventListener('click', () => {
    close();
    navigate('#/nuevo');
  });
}

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  router();

  const navRegistrar = document.getElementById('nav-registrar');
  if (navRegistrar) {
    navRegistrar.addEventListener('click', openRegistrarSheet);
  }

  // Reevalúa la ruta actual cada vez que cambia el estado de sesión
  // (login, logout, perfil recién creado) — así js/views/auth.js no
  // necesita llamar navigate() a mano después de cada acción, el gate de
  // arriba se encarga solo de mandar a donde corresponda.
  if (window.CultivarnosAuth) {
    window.CultivarnosAuth.onCambio(() => { router(); });
  }

  // Indicador chico de sync (ver .sync-indicador en styles.css) — se
  // actualiza solo, en segundo plano, cada vez que cambia el estado del
  // Sync Engine. No dispara ningún render de vista, solo toca ese punto.
  if (window.CultivarnosSync) {
    window.CultivarnosSync.onCambio(actualizarIndicadorSync);
    actualizarIndicadorSync();
  }

  inicializarServiceWorker();
});

// Estados "que ameritan avisar, discretamente": sin conexión (todavía no
// se pudo sincronizar) o pendiente (se intentó y falló, se reintenta solo
// en el próximo ciclo). El resto de los estados ('sincronizado',
// 'sincronizando', 'inactivo', 'espera-decision-huerta-local') no
// necesitan un aviso permanente en la topbar — el detalle completo sigue
// disponible en Configuración > Cuenta para quien lo busque.
const ESTADOS_SYNC_CON_AVISO = {
  'sin-conexion': 'sync-indicador-offline',
  pendiente: 'sync-indicador-pendiente',
};

function actualizarIndicadorSync() {
  const el = document.getElementById('sync-indicador');
  if (!el || !window.CultivarnosSync) return;
  const estado = window.CultivarnosSync.obtenerEstado();
  const clase = ESTADOS_SYNC_CON_AVISO[estado.estado];
  el.className = clase ? `sync-indicador ${clase}` : 'sync-indicador hidden';
}

// ---------------------------------------------------------------------
// Service Worker: registro + aviso de actualización disponible.
//
// A propósito NO llamamos self.skipWaiting() automáticamente desde el SW
// (ver sw.js): así, cuando hay una versión nueva, el Service Worker nuevo
// queda "esperando" en vez de tomar control y recargar la página sin
// avisar. Acá mostramos un banner discreto y recién activamos la versión
// nueva cuando la persona toca "Actualizar ahora" — nunca de forma
// automática ni silenciosa, y nunca más de una vez (evita loops).
// ---------------------------------------------------------------------
function inicializarServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  let refrescando = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refrescando) return;
    refrescando = true;
    window.location.reload();
  });

  navigator.serviceWorker.register('./sw.js').then((registration) => {
    // Caso 1: ya había una versión nueva instalada y esperando (ej. se
    // instaló mientras la app estaba cerrada, y ahora se reabre).
    if (registration.waiting && navigator.serviceWorker.controller) {
      mostrarBannerActualizacion(registration);
    }

    // Caso 2: se detecta una actualización mientras la app está abierta.
    registration.addEventListener('updatefound', () => {
      const nuevoWorker = registration.installing;
      if (!nuevoWorker) return;
      nuevoWorker.addEventListener('statechange', () => {
        // "installed" + ya había un controller = es una actualización real
        // (no la primera instalación de la PWA, que no necesita aviso).
        if (nuevoWorker.state === 'installed' && navigator.serviceWorker.controller) {
          mostrarBannerActualizacion(registration);
        }
      });
    });
  }).catch((err) => console.warn('SW registration failed', err));
}

function mostrarBannerActualizacion(registration) {
  const banner = document.getElementById('update-banner');
  if (!banner || banner.classList.contains('show')) return; // nunca más de un banner a la vez
  banner.classList.remove('hidden');
  requestAnimationFrame(() => banner.classList.add('show'));

  const btnActualizar = document.getElementById('update-banner-btn');
  const btnCerrar = document.getElementById('update-banner-cerrar');

  function activarNuevaVersion() {
    if (!registration.waiting) return;
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }

  btnActualizar.addEventListener('click', activarNuevaVersion, { once: true });
  btnCerrar.addEventListener('click', () => {
    banner.classList.remove('show');
    setTimeout(() => banner.classList.add('hidden'), 250);
  }, { once: true });
}
