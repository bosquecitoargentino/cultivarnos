// app.js — inicialización, router hash-based y navegación inferior

const APP_ROOT = document.getElementById('app');
const BOTTOM_NAV = document.getElementById('bottom-nav');

const ROUTES = {
  '#/inicio': { render: renderInicio, nav: 'inicio' },
  '#/cultivos': { render: renderCultivos, nav: 'cultivos' },
  '#/nuevo': { render: renderNuevo, nav: 'nuevo' },
  // '#/cultivo/:id' se maneja aparte
};

function parseRoute(hash) {
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

window.addEventListener('hashchange', router);
window.addEventListener('DOMContentLoaded', () => {
  router();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW registration failed', err));
  }
});
