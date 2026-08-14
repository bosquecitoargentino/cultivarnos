// app.js — inicialización, router hash-based y navegación inferior

const APP_ROOT = document.getElementById('app');
const BOTTOM_NAV = document.getElementById('bottom-nav');

const ROUTES = {
  '#/inicio': { render: renderInicio, nav: 'inicio' },
  '#/cultivos': { render: renderCultivos, nav: 'cultivos' },
  '#/nuevo': { render: renderNuevo, nav: 'registrar' },
  '#/configuracion': { render: renderConfiguracion, nav: null },
  '#/calendario': { render: renderCalendario, nav: null },
  // '#/cultivo/:id' se maneja aparte
};

function parseRoute(hash) {
  const fotosMatch = hash.match(/^#\/cultivo\/(\d+)\/fotos$/);
  if (fotosMatch) {
    return { render: () => renderGaleriaFotos(Number(fotosMatch[1])), nav: 'cultivos' };
  }
  const detalleMatch = hash.match(/^#\/cultivo\/(\d+)$/);
  if (detalleMatch) {
    return { render: () => renderDetalle(Number(detalleMatch[1])), nav: 'cultivos' };
  }
  return ROUTES[hash] || ROUTES['#/inicio'];
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
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Registrar</h2>
      <button id="sheet-observacion" class="btn-primary" style="margin-bottom:10px;">👁 Registrar observación</button>
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

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));

    // Si se activa una versión nueva del Service Worker, recargamos una
    // sola vez para que la app siempre corra el código más reciente.
    let refrescando = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refrescando) return;
      refrescando = true;
      window.location.reload();
    });
  }
});
