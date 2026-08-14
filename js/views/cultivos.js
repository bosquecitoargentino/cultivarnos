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
        ${fotoUrl ? '' : '🌿'}
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
  cultivos.sort((a, b) => aFechaLocal(b.fechaInicio) - aFechaLocal(a.fechaInicio));

  root.innerHTML = `
    <div class="view-header">
      <h1>Mis cultivos</h1>
      <p>${cultivos.length} registrado${cultivos.length === 1 ? '' : 's'}</p>
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
      list.innerHTML = `<div class="empty-state"><span class="emoji">🌱</span>No hay cultivos en esta categoría.</div>`;
      return;
    }
    const cards = await Promise.all(filtered.map((c) => renderCultivoCardHtml(c)));
    list.innerHTML = `<div class="cultivos-grid">${cards.join('')}</div>`;
    list.querySelectorAll('.cultivo-card').forEach((card) => {
      card.addEventListener('click', () => navigate(`#/cultivo/${card.dataset.id}`));
    });
  }

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      tab.classList.add('active');
      paint(tab.dataset.filter);
    });
  });

  paint('activo');
}
