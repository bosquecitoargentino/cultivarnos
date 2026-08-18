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
  // '#/cultivo/:id', '#/biblioteca/:id', '#/espacios/:clave' y '#/banco/:id'
  // se manejan aparte
};

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
  const hash = window.location.hash || '#/inicio';
  const route = parseRoute(hash);
  updateNavActive(route.nav);
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
// frecuente (observación) va primero, crear cultivo queda como opción chica.
async function openRegistrarSheet() {
  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
      <h2>Registrar</h2>
      <button id="sheet-observacion" class="btn-primary" style="margin-bottom:10px;">${renderIcon('observacion', { scale: 'sm' })} Registrar observación</button>
      <button id="sheet-nuevo-cultivo" class="btn-secondary">＋ Nuevo cultivo</button>
    </div>
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);

  backdrop.querySelector('#sheet-observacion').addEventListener('click', async () => {
    close();
    const cultivos = await DB.getAllCultivos();
    openObservacionRapida(cultivos);
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

  inicializarServiceWorker();
});

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
