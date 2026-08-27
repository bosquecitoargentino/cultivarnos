// views/cultivos.js — vista Mis cultivos + helper de tarjeta reutilizable

// Tarjeta compacta y fotográfica — usada en Inicio y en Mis cultivos.
// [FOTO] Especie / Variedad / Ubicación · Día N · Estado / Última observación
async function renderCultivoCardHtml(cultivo) {
  const eventos = await DB.getEventosByCultivo(cultivo.id);
  const fotoUrl = await obtenerImagenCultivo(cultivo, eventos);
  const dias = diasDesde(cultivo.fechaInicio);
  const finalizado = cultivo.estado === 'finalizado';

  const metaPartes = [];
  if (cultivo.ubicacion) metaPartes.push(escapeHtml(cultivo.ubicacion));
  metaPartes.push(dias >= 0 ? `Día ${dias}` : 'Programado');
  metaPartes.push(finalizado ? 'Finalizado' : 'Activo');

  return `
    <div class="cultivo-card" data-id="${cultivo.id}">
      <div class="cultivo-card-photo" style="${fotoUrl ? `background-image:url('${fotoUrl}')` : ''}">
        ${fotoUrl ? '' : renderIcon('cultivos', { scale: 'xl' })}
      </div>
      <div class="cultivo-card-body">
        <div class="cultivo-card-especie">${escapeHtml(cultivo.especie)}</div>
        ${cultivo.variedad ? `<div class="cultivo-card-variedad">${escapeHtml(cultivo.variedad)}</div>` : ''}
        <div class="cultivo-card-meta">${metaPartes.join(' · ')}</div>
        <div class="cultivo-card-obs">${textoUltimaObservacion(eventos)}</div>
      </div>
    </div>
  `;
}

async function renderCultivos(root) {
  const cultivos = await DB.getAllCultivos();

  root.innerHTML = `
    <div class="view-header">
      <h1>Mis cultivos</h1>
      <p>${cultivos.length} registrado${cultivos.length === 1 ? '' : 's'}</p>
      <a href="#/espacios" class="link-ver-todas">${renderIcon('espacios', { scale: 'sm' })} Ver espacios</a>
    </div>
    <div class="filter-tabs">
      <div class="filter-tab active" data-filter="activo">Activos</div>
      <div class="filter-tab" data-filter="finalizado">Finalizados</div>
      <div class="filter-tab" data-filter="todos">Todos</div>
    </div>
    <div id="cultivos-list"></div>
  `;

  const list = root.querySelector('#cultivos-list');
  const tabs = root.querySelectorAll('.filter-tab');

  async function paint(filter) {
    let filtered = cultivos;
    if (filter === 'activo') filtered = cultivos.filter((c) => c.estado === 'activo');
    if (filter === 'finalizado') filtered = cultivos.filter((c) => c.estado === 'finalizado');

    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state">${renderIcon('cultivos', { scale: 'xl', className: 'icon-bloque' })}No hay cultivos en esta categoría.</div>`;
      return;
    }

    // El orden manual (motor-orden-cultivos.js) es una preferencia de
    // presentación aparte del dato del cultivo — nunca reordena "de
    // verdad" nada más que esta lista. Reordenar en sí pasa únicamente
    // dentro de "Ordenar cultivos" (menú ⋯) — las tarjetas de acá son
    // cards normales: un toque abre la ficha, nada más.
    const ordenados = ordenarCultivosSegunPreferencia(filtered);
    const cards = await Promise.all(ordenados.map((c) => renderCultivoCardHtml(c)));
    list.innerHTML = `<div class="cultivos-grid">${cards.join('')}</div>`;
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      paint(tab.dataset.filter);
    });
  });

  // Card normal: un toque abre la ficha, nada más — sin ningún gesto
  // especial de mantener presionado (eso ahora vive solo dentro de
  // "Ordenar cultivos", ver abrirOrdenCultivos más abajo). Delegado en
  // `list`, que no se reemplaza entre paint(); no hace falta reengancharlo
  // cada vez que cambia el filtro.
  list.addEventListener('click', (e) => {
    const card = e.target.closest('.cultivo-card');
    if (!card) return;
    navigate(`#/cultivo/${card.dataset.id}`);
  });

  paint('activo');
}

// ---------------------------------------------------------------------
// "Ordenar cultivos" (desde el menú ⋯): única forma de reordenar Mis
// cultivos. Las tarjetas de la lista normal (arriba) son cards comunes —
// un toque abre la ficha, sin ningún gesto especial de mantener
// presionado; eso se probó, se sintió frágil en iPhone, y se reemplazó
// por esto: exactamente el mismo mecanismo que ya usa "Personalizar
// inicio" (handle "≡", arrastre con Pointer Events, ↑/↓ como alternativa
// accesible — ver motor-lista-reordenable.js, compartido entre ambos),
// más "Restaurar orden predeterminado". Un solo lenguaje de "ordenar
// contenido" en toda la app, no dos sistemas de drag distintos.
// ---------------------------------------------------------------------

async function abrirOrdenCultivos() {
  // Siempre sobre la lista COMPLETA de cultivos (no un filtro/búsqueda) —
  // así arrastrar acá nunca depende de qué pestaña estabas mirando en Mis
  // cultivos, y el orden guardado es directamente el array final, sin
  // necesidad de fusionar un sub-orden parcial.
  async function pintarFilas() {
    const todos = await DB.getAllCultivos();
    if (!todos.length) return { html: '<p class="recordatorios-vacio">Todavía no hay cultivos registrados.</p>', total: 0 };
    const ordenados = ordenarCultivosSegunPreferencia(todos);
    const html = ordenados
      .map((c, i) => {
        const etiqueta = `${escapeHtml(c.especie)}${c.variedad ? ' · ' + escapeHtml(c.variedad) : ''}`;
        const estado = c.estado === 'finalizado' ? ' <span class="orden-cultivo-estado">Finalizado</span>' : '';
        return `
          <div class="home-layout-row" data-id="${c.id}">
            <span class="home-layout-label">${etiqueta}${estado}</span>
            <div class="home-layout-controles">
              <div class="home-layout-mover home-layout-mover-secundario">
                <button type="button" class="home-layout-flecha" data-move="up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${etiqueta}">↑</button>
                <button type="button" class="home-layout-flecha" data-move="down" data-id="${c.id}" ${i === ordenados.length - 1 ? 'disabled' : ''} aria-label="Bajar ${etiqueta}">↓</button>
              </div>
              ${handleArrastreHtml()}
            </div>
          </div>
        `;
      })
      .join('');
    return { html, total: ordenados.length };
  }

  const primera = await pintarFilas();

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
      <h2>Ordenar cultivos</h2>
      <div class="home-layout-list" id="orden-cultivos-list">${primera.html}</div>
      ${primera.total > 1 ? `<button type="button" id="btn-restaurar-orden-cultivos" class="link-small home-layout-restaurar">Restaurar orden predeterminado</button>` : ''}
    </div>
  `);

  const sheet = backdrop.querySelector('.modal-sheet');

  function cerrarYActualizar() {
    close();
    router();
  }
  sheet.querySelector('#modal-close').addEventListener('click', cerrarYActualizar);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) router();
  });

  async function refrescar() {
    const resultado = await pintarFilas();
    sheet.querySelector('#orden-cultivos-list').innerHTML = resultado.html;
  }

  // ↑/↓ siguen siendo el camino accesible (teclado, lectores de pantalla):
  // el arrastre de abajo es un segundo camino, más natural en táctil, que
  // nunca reemplaza a este — mismo criterio que Personalizar inicio.
  sheet.querySelector('#orden-cultivos-list').addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-move]');
    if (!btn || btn.disabled) return;
    const todos = await DB.getAllCultivos();
    const ordenados = ordenarCultivosSegunPreferencia(todos);
    const idx = ordenados.findIndex((c) => c.id === Number(btn.dataset.id));
    if (idx === -1) return;
    const destino = btn.dataset.move === 'up' ? idx - 1 : idx + 1;
    if (destino < 0 || destino >= ordenados.length) return;
    [ordenados[idx], ordenados[destino]] = [ordenados[destino], ordenados[idx]];
    guardarOrdenCultivosGuardado(ordenados.map((c) => c.id));
    refrescar();
  });

  const btnRestaurar = sheet.querySelector('#btn-restaurar-orden-cultivos');
  if (btnRestaurar) {
    btnRestaurar.addEventListener('click', () => {
      if (!window.confirm('¿Restaurar el orden original de Mis cultivos?')) return;
      restaurarOrdenCultivosPorDefecto();
      refrescar();
    });
  }

  // Arrastre con handle "≡": exactamente el mismo mecanismo que
  // Personalizar inicio (ver motor-lista-reordenable.js). Guarda
  // directamente el array completo de ids en el nuevo orden — acá no
  // hace falta fusionar un sub-orden parcial porque esta lista siempre
  // muestra todos los cultivos.
  habilitarArrastreListaReordenable(sheet, sheet.querySelector('#orden-cultivos-list'), {
    onReordenar(idsEnOrden) {
      guardarOrdenCultivosGuardado(idsEnOrden.map(Number));
    },
    onSoltar: refrescar,
  });
}
