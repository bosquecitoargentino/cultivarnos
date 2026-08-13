// views/detalle.js — vista Detalle del cultivo

async function renderDetalle(id, root) {
  root = root || APP_ROOT;
  const cultivo = await DB.getCultivo(id);
  if (!cultivo) {
    root.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span>No se encontró el cultivo.</div>`;
    return;
  }

  const [eventos, recordatorios] = await Promise.all([
    DB.getEventosByCultivo(id),
    DB.getRecordatoriosByCultivo(id),
  ]);

  const fotoUrl = await fotoUrlCache.getUrl(cultivo.fotoId);
  const dias = diasDesde(cultivo.fechaInicio);
  const pendientes = recordatorios.filter((r) => r.estado === 'pendiente');

  root.innerHTML = `
    <div class="detalle-hero">
      <div class="detalle-hero-photo" style="${fotoUrl ? `background-image:url('${fotoUrl}')` : ''}">
        ${fotoUrl ? '' : '🌿'}
      </div>
      <div class="detalle-hero-body">
        <div class="detalle-especie">${escapeHtml(cultivo.especie)}</div>
        ${cultivo.variedad ? `<div class="detalle-variedad">${escapeHtml(cultivo.variedad)}</div>` : ''}
        <div class="detalle-badges">
          <span class="badge">${dias >= 0 ? `Día ${dias}` : 'Programado'}</span>
          <span class="badge tierra">${TIPO_INICIO_LABELS[cultivo.tipoInicio] || cultivo.tipoInicio}</span>
          ${cultivo.ubicacion ? `<span class="badge">📍 ${escapeHtml(cultivo.ubicacion)}</span>` : ''}
          ${cultivo.estado === 'finalizado' ? `<span class="badge finalizado">Finalizado</span>` : ''}
        </div>
        ${cultivo.nota ? `<div class="detalle-nota">${escapeHtml(cultivo.nota)}</div>` : ''}
      </div>
    </div>

    <div class="detalle-actions">
      <button id="btn-add-evento">➕ Evento</button>
      <button id="btn-add-recordatorio">⏰ Recordatorio</button>
      <button id="btn-toggle-estado">${cultivo.estado === 'finalizado' ? '↩️ Reactivar' : '🏁 Finalizar'}</button>
    </div>

    ${pendientes.length ? `
    <section>
      <div class="section-title">Recordatorios</div>
      <div id="recordatorios-detalle"></div>
    </section>` : ''}

    <section>
      <div class="section-title">Historial</div>
      <div id="timeline"></div>
    </section>

    <section>
      <button id="btn-eliminar" class="btn-danger" style="margin-top:8px;">Eliminar cultivo</button>
    </section>
  `;

  // Recordatorios pendientes
  if (pendientes.length) {
    const recWrap = root.querySelector('#recordatorios-detalle');
    recWrap.innerHTML = pendientes
      .map((r) => {
        const vencido = isVencido(r.fecha);
        return `
        <div class="reminder-item ${vencido ? 'vencido' : ''}">
          <button class="reminder-check" data-action="completar" data-id="${r.id}" aria-label="Completar"></button>
          <div class="reminder-info">
            <div class="reminder-title">${escapeHtml(r.titulo)}</div>
            <div class="reminder-sub">${vencido ? 'Venció el ' : ''}${formatFechaCorta(r.fecha)}</div>
          </div>
          <div class="reminder-actions">
            <button class="pill-btn" data-action="posponer" data-id="${r.id}">+3d</button>
          </div>
        </div>`;
      })
      .join('');

    recWrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const rid = Number(btn.dataset.id);
      if (btn.dataset.action === 'completar') {
        await DB.updateRecordatorio(rid, { estado: 'completado' });
        showToast('Recordatorio completado');
      } else {
        const rec = pendientes.find((r) => r.id === rid);
        const nueva = new Date(rec.fecha);
        nueva.setDate(nueva.getDate() + 3);
        await DB.updateRecordatorio(rid, { fecha: nueva.toISOString().slice(0, 10) });
        showToast('Pospuesto 3 días');
      }
      renderDetalle(id, root);
    });
  }

  // Timeline
  const timelineWrap = root.querySelector('#timeline');
  if (!eventos.length) {
    timelineWrap.innerHTML = `<div class="empty-state"><span class="emoji">📖</span>Todavía no hay eventos registrados.</div>`;
  } else {
    const items = await Promise.all(eventos.map(renderTimelineItem));
    timelineWrap.innerHTML = `<div class="timeline">${items.join('')}</div>`;
    timelineWrap.addEventListener('click', async (e) => {
      const btn = e.target.closest('.timeline-delete');
      if (!btn) return;
      if (!window.confirm('¿Eliminar este evento del historial?')) return;
      await DB.deleteEvento(Number(btn.dataset.id));
      showToast('Evento eliminado');
      renderDetalle(id, root);
    });
  }

  // Acciones
  root.querySelector('#btn-add-evento').addEventListener('click', () => openEventoModal(id, () => renderDetalle(id, root)));
  root.querySelector('#btn-add-recordatorio').addEventListener('click', () => openRecordatorioModal(id, () => renderDetalle(id, root)));

  root.querySelector('#btn-toggle-estado').addEventListener('click', async () => {
    const nuevoEstado = cultivo.estado === 'finalizado' ? 'activo' : 'finalizado';
    await DB.updateCultivo(id, {
      estado: nuevoEstado,
      fechaFinalizado: nuevoEstado === 'finalizado' ? todayIsoDate() : null,
    });
    showToast(nuevoEstado === 'finalizado' ? 'Cultivo finalizado' : 'Cultivo reactivado');
    renderDetalle(id, root);
  });

  root.querySelector('#btn-eliminar').addEventListener('click', async () => {
    if (!window.confirm('Esto eliminará el cultivo y todo su historial. ¿Confirmás?')) return;
    await DB.deleteCultivo(id);
    for (const ev of eventos) await DB.deleteEvento(ev.id);
    for (const r of recordatorios) await DB.deleteRecordatorio(r.id);
    showToast('Cultivo eliminado');
    navigate('#/cultivos');
  });
}

async function renderTimelineItem(ev) {
  const fotoUrl = await fotoUrlCache.getUrl(ev.fotoId);
  return `
    <div class="timeline-item">
      <div class="timeline-card">
        <div class="timeline-head">
          <span>${eventoIcon(ev.tipo)}</span>
          <span>${eventoLabel(ev.tipo)}</span>
          <span class="timeline-fecha">${formatFecha(ev.fecha)}</span>
        </div>
        ${ev.nota ? `<div class="timeline-nota">${escapeHtml(ev.nota)}</div>` : ''}
        ${fotoUrl ? `<img class="timeline-foto" src="${fotoUrl}" alt="Foto del evento" />` : ''}
        <button class="timeline-delete" data-id="${ev.id}">Eliminar</button>
      </div>
    </div>
  `;
}

function openEventoModal(cultivoId, onSaved) {
  let fotoBlob = null;
  let tipoSeleccionado = 'observacion';

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Agregar evento</h2>
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="chip-group" id="ev-tipo">
          ${EVENTO_TIPOS.map((t, i) => `<div class="chip-option ${i === 0 ? 'selected' : ''}" data-value="${t.value}">${t.icon} ${t.label}</div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input type="date" id="ev-fecha" class="form-input" value="${todayIsoDate()}" />
      </div>
      <div class="form-group">
        <label class="form-label">Nota <span class="optional">(opcional)</span></label>
        <textarea id="ev-nota" class="form-textarea" placeholder="Detalles..."></textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Foto <span class="optional">(opcional)</span></label>
        <label class="photo-picker" id="ev-photo-picker">
          <span class="photo-picker-placeholder">
            <span class="emoji">📷</span>
            <span>Tocá para agregar una foto</span>
          </span>
          <button type="button" class="remove-photo hidden" id="ev-photo-remove">✕</button>
          <input type="file" id="ev-foto" accept="image/*" capture="environment" hidden />
        </label>
      </div>
      <button id="ev-guardar" class="btn-primary">Guardar evento</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#modal-close').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  const tipoGroup = backdrop.querySelector('#ev-tipo');
  tipoGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    tipoSeleccionado = chip.dataset.value;
  });

  const photoPicker = backdrop.querySelector('#ev-photo-picker');
  const fotoInput = backdrop.querySelector('#ev-foto');
  const photoPlaceholder = backdrop.querySelector('.photo-picker-placeholder');
  const photoRemoveBtn = backdrop.querySelector('#ev-photo-remove');
  let previewUrl = null;

  fotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fotoBlob = await downscaleImage(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(fotoBlob);
    photoPicker.style.backgroundImage = `url('${previewUrl}')`;
    photoPicker.classList.add('has-photo');
    photoPlaceholder.classList.add('hidden');
    photoRemoveBtn.classList.remove('hidden');
    if (tipoSeleccionado === 'observacion') {
      tipoSeleccionado = 'fotografia';
      tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.toggle('selected', c.dataset.value === 'fotografia'));
    }
  });

  photoRemoveBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    fotoBlob = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    fotoInput.value = '';
    photoPicker.style.backgroundImage = '';
    photoPicker.classList.remove('has-photo');
    photoPlaceholder.classList.remove('hidden');
    photoRemoveBtn.classList.add('hidden');
  });

  backdrop.querySelector('#ev-guardar').addEventListener('click', async () => {
    const fecha = backdrop.querySelector('#ev-fecha').value || todayIsoDate();
    const nota = backdrop.querySelector('#ev-nota').value.trim();

    let fotoId = null;
    if (fotoBlob) fotoId = await DB.addFoto(fotoBlob);

    await DB.addEvento({
      cultivoId,
      tipo: tipoSeleccionado,
      fecha,
      nota: nota || null,
      fotoId,
    });

    backdrop.remove();
    showToast('Evento agregado');
    onSaved();
  });
}

function openRecordatorioModal(cultivoId, onSaved) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 3);

  backdrop.innerHTML = `
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Nuevo recordatorio</h2>
      <div class="form-group">
        <label class="form-label">Título</label>
        <input type="text" id="rec-titulo" class="form-input" placeholder="Ej: Regar, Fertilizar, Revisar plagas..." />
      </div>
      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input type="date" id="rec-fecha" class="form-input" value="${defaultDate.toISOString().slice(0, 10)}" />
      </div>
      <button id="rec-guardar" class="btn-primary">Guardar recordatorio</button>
    </div>
  `;
  document.body.appendChild(backdrop);

  backdrop.querySelector('#modal-close').addEventListener('click', () => backdrop.remove());
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.remove(); });

  backdrop.querySelector('#rec-guardar').addEventListener('click', async () => {
    const titulo = backdrop.querySelector('#rec-titulo').value.trim();
    const fecha = backdrop.querySelector('#rec-fecha').value;
    if (!titulo || !fecha) { showToast('Completá título y fecha'); return; }
    await DB.addRecordatorio({ cultivoId, titulo, fecha, estado: 'pendiente' });
    backdrop.remove();
    showToast('Recordatorio agregado');
    onSaved();
  });
}
