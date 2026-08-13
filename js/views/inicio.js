// views/inicio.js — vista Inicio

async function renderInicio(root) {
  const [cultivos, recordatorios] = await Promise.all([
    DB.getAllCultivos(),
    DB.getRecordatoriosPendientes(),
  ]);

  const activos = cultivos.filter((c) => c.estado === 'activo');
  const recordatoriosCultivos = new Map(cultivos.map((c) => [c.id, c]));

  root.innerHTML = `
    <div class="view-header">
      <h1>Hola 🌿</h1>
      <p>${activos.length ? `Tenés ${activos.length} cultivo${activos.length === 1 ? '' : 's'} activo${activos.length === 1 ? '' : 's'}` : 'Empezá registrando tu primer cultivo'}</p>
    </div>

    <section>
      <div class="quick-actions">
        <a href="#/nuevo" class="quick-action">
          <span class="qa-icon">➕</span>
          Nuevo cultivo
        </a>
        <button id="btn-quick-obs" class="quick-action secondary">
          <span class="qa-icon">👁️</span>
          Registrar observación
        </button>
      </div>
    </section>

    <section>
      <div class="section-title">
        Recordatorios pendientes
        ${recordatorios.length ? `<span class="link-small">${recordatorios.length}</span>` : ''}
      </div>
      <div id="recordatorios-list"></div>
    </section>

    <section>
      <div class="section-title">
        Cultivos activos
        ${cultivos.length ? '<a href="#/cultivos" class="link-small">Ver todos</a>' : ''}
      </div>
      <div id="activos-list"></div>
    </section>
  `;

  // Recordatorios
  const recList = root.querySelector('#recordatorios-list');
  if (!recordatorios.length) {
    recList.innerHTML = `<div class="empty-state"><span class="emoji">✅</span>No tenés recordatorios pendientes.</div>`;
  } else {
    recList.innerHTML = recordatorios
      .slice(0, 6)
      .map((r) => {
        const cultivo = recordatoriosCultivos.get(r.cultivoId);
        const vencido = isVencido(r.fecha);
        return `
        <div class="reminder-item ${vencido ? 'vencido' : ''}" data-id="${r.id}">
          <button class="reminder-check" data-action="completar" data-id="${r.id}" aria-label="Marcar como completado"></button>
          <div class="reminder-info">
            <div class="reminder-title">${escapeHtml(r.titulo)}</div>
            <div class="reminder-sub">${cultivo ? escapeHtml(cultivo.especie) + ' · ' : ''}${vencido ? 'Venció el ' : ''}${formatFechaCorta(r.fecha)}</div>
          </div>
          <div class="reminder-actions">
            <button class="pill-btn" data-action="posponer" data-id="${r.id}">+3d</button>
          </div>
        </div>`;
      })
      .join('');
  }

  recList.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.action === 'completar') {
      await DB.updateRecordatorio(id, { estado: 'completado' });
      showToast('Recordatorio completado');
      renderInicio(root);
    } else if (btn.dataset.action === 'posponer') {
      const rec = recordatorios.find((r) => r.id === id);
      const nueva = new Date(rec.fecha);
      nueva.setDate(nueva.getDate() + 3);
      await DB.updateRecordatorio(id, { fecha: nueva.toISOString().slice(0, 10) });
      showToast('Recordatorio pospuesto 3 días');
      renderInicio(root);
    }
  });

  // Cultivos activos (reutiliza render de tarjeta)
  const activosList = root.querySelector('#activos-list');
  if (!activos.length) {
    activosList.innerHTML = `<div class="empty-state"><span class="emoji">🌱</span>Todavía no registraste cultivos.</div>`;
  } else {
    const cards = await Promise.all(activos.slice(0, 4).map((c) => renderCultivoCardHtml(c)));
    activosList.innerHTML = `<div class="cultivos-grid">${cards.join('')}</div>`;
    activosList.querySelectorAll('.cultivo-card').forEach((card) => {
      card.addEventListener('click', () => navigate(`#/cultivo/${card.dataset.id}`));
    });
  }

  root.querySelector('#btn-quick-obs').addEventListener('click', () => {
    openQuickObservacionModal(cultivos);
  });
}

function openQuickObservacionModal(cultivos) {
  const activos = cultivos.filter((c) => c.estado === 'activo');
  if (!activos.length) {
    showToast('Primero registrá un cultivo');
    return;
  }

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Registrar observación</h2>
      <div class="form-group">
        <label class="form-label">Cultivo</label>
        <select id="obs-cultivo" class="form-select">
          ${activos.map((c) => `<option value="${c.id}">${escapeHtml(c.especie)}${c.variedad ? ' — ' + escapeHtml(c.variedad) : ''}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Nota</label>
        <textarea id="obs-nota" class="form-textarea" placeholder="¿Qué observaste?"></textarea>
      </div>
      <button id="obs-guardar" class="btn-primary">Guardar</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#modal-close').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.querySelector('#obs-guardar').addEventListener('click', async () => {
    const cultivoId = Number(backdrop.querySelector('#obs-cultivo').value);
    const nota = backdrop.querySelector('#obs-nota').value.trim();
    if (!nota) { showToast('Escribí una nota'); return; }
    await DB.addEvento({
      cultivoId,
      tipo: 'observacion',
      fecha: todayIsoDate(),
      nota,
    });
    backdrop.remove();
    showToast('Observación registrada');
    router();
  });
}
