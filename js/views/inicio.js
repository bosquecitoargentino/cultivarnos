// views/inicio.js — vista Inicio: memoria viva de los cultivos, no dashboard.
// Prioridad: registrar una observación tiene que ser más rápido que
// escribirla en un cuaderno.

async function renderInicio(root) {
  const [cultivos, recordatorios, config] = await Promise.all([
    DB.getAllCultivos(),
    DB.getRecordatoriosPendientes(),
    DB.getConfiguracion(),
  ]);

  const activos = cultivos.filter((c) => c.estado === 'activo');
  const paraHoy = recordatorios.filter((r) => esParaHoy(r.fecha));
  const observarHoy = await construirQueObservarHoy(activos);

  let resumen;
  if (!cultivos.length) {
    resumen = 'Registrá tu primer cultivo para empezar';
  } else {
    const n = activos.length;
    const base = `${n} cultivo${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}`;
    resumen = paraHoy.length ? `${base} · ${paraHoy.length} para revisar hoy` : `${base} · Todo al día`;
  }

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>Hola 🌿</h1>
      <p>${resumen}</p>
    </div>

    <section class="acciones-rapidas">
      <button id="btn-obs-principal" class="btn-primary btn-obs-principal">👁 Registrar observación</button>
      <a href="#/nuevo" class="link-nuevo-cultivo">＋ Nuevo cultivo</a>
    </section>

    <section id="recordatorios-section"></section>

    ${observarHoy.length ? `
    <section>
      <div class="section-title">Qué observar hoy 👀</div>
      <div id="observar-hoy-list"></div>
    </section>` : ''}

    <section>
      <div class="section-title">
        Tus cultivos
        ${cultivos.length ? '<a href="#/cultivos" class="link-small">Ver todos</a>' : ''}
      </div>
      <div id="activos-list"></div>
    </section>

    <section id="temporada-section"></section>
  `;

  // Recordatorios: sección completa solo si hay pendientes; si no, una
  // línea chica para no empujar hacia abajo lo que importa.
  const recSection = root.querySelector('#recordatorios-section');
  if (!recordatorios.length) {
    recSection.innerHTML = `<p class="recordatorios-vacio">✅ Sin recordatorios para hoy</p>`;
  } else {
    recSection.innerHTML = `
      <div class="section-title">Recordatorios</div>
      <div id="recordatorios-list"></div>
    `;
    const recList = recSection.querySelector('#recordatorios-list');
    const cultivoPorId = new Map(cultivos.map((c) => [c.id, c]));

    recList.innerHTML = recordatorios
      .slice(0, 6)
      .map((r) => {
        const cultivo = cultivoPorId.get(r.cultivoId);
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

    recList.addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = Number(btn.dataset.id);
      if (btn.dataset.action === 'completar') {
        btn.classList.add('checked');
        btn.closest('.reminder-item')?.classList.add('completing');
        await DB.updateRecordatorio(id, { estado: 'completado' });
        showToast('Recordatorio completado');
        setTimeout(() => renderInicio(root), 220);
      } else if (btn.dataset.action === 'posponer') {
        const rec = recordatorios.find((r) => r.id === id);
        const nueva = new Date(rec.fecha);
        nueva.setDate(nueva.getDate() + 3);
        await DB.updateRecordatorio(id, { fecha: nueva.toISOString().slice(0, 10) });
        showToast('Recordatorio pospuesto 3 días');
        renderInicio(root);
      }
    });
  }

  // Qué observar hoy: señal blanda basada en "hace cuánto no se registra
  // nada" — no reemplaza los recordatorios explícitos, es un empujoncito
  // chico y priorizado (nunca una lista larga de tareas).
  if (observarHoy.length) {
    const obsHoyList = root.querySelector('#observar-hoy-list');
    obsHoyList.innerHTML = observarHoy
      .map(
        (it) => `
        <div class="observar-hoy-item">
          <div class="observar-hoy-info">
            <span class="observar-hoy-especie">${escapeHtml(it.cultivo.especie)}</span>
            <span class="observar-hoy-sub">👀 Hace ${it.dias} días que no lo revisás</span>
          </div>
          <button type="button" class="pill-btn" data-id="${it.cultivo.id}">Revisar ahora</button>
        </div>`
      )
      .join('');
    obsHoyList.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-id]');
      if (!btn) return;
      navigate(`#/cultivo/${btn.dataset.id}`);
    });
  }

  // Tus cultivos
  const activosList = root.querySelector('#activos-list');
  if (!activos.length) {
    activosList.innerHTML = `<div class="empty-state"><span class="emoji">🌱</span>Todavía no registraste cultivos.</div>`;
  } else {
    const cards = await Promise.all(activos.slice(0, 6).map((c) => renderCultivoCardHtml(c)));
    activosList.innerHTML = `<div class="cultivos-grid">${cards.join('')}</div>`;
    activosList.querySelectorAll('.cultivo-card').forEach((card) => {
      card.addEventListener('click', () => navigate(`#/cultivo/${card.dataset.id}`));
    });
  }

  // Esta temporada: motor local, sin IA — solo lo que la biblioteca de
  // especies puede resolver de forma predecible según hemisferio y mes.
  const temporadaSection = root.querySelector('#temporada-section');
  if (!config.hemisferio) {
    temporadaSection.innerHTML = `
      <div class="section-title">Esta temporada 🌱</div>
      <div class="temporada-prompt">
        <span>Configurá tu hemisferio para ver qué podés sembrar ahora.</span>
        <a href="#/configuracion" class="link-small">Configurar</a>
      </div>
    `;
  } else {
    const mesActual = new Date().getMonth() + 1;
    const recomendaciones = obtenerRecomendacionesTemporada(config.hemisferio, mesActual);
    if (!recomendaciones.length) {
      temporadaSection.innerHTML = `
        <div class="section-title">Esta temporada 🌱</div>
        <p class="fotos-vacio">Este mes no hay siembras típicas para arrancar.</p>
        <a href="#/calendario" class="link-ver-todas">Ver calendario →</a>
      `;
    } else {
      temporadaSection.innerHTML = `
        <div class="section-title">Esta temporada 🌱</div>
        <div class="temporada-list">
          ${recomendaciones
            .map(
              (r) => `
                <div class="temporada-item">
                  <span class="temporada-especie">${escapeHtml(r.nombre)}</span>
                  <span class="temporada-tipo">${r.tipo === 'almacigo' ? 'Almácigo' : 'Siembra directa'}</span>
                </div>
              `
            )
            .join('')}
        </div>
        <a href="#/calendario" class="link-ver-todas">Ver calendario →</a>
      `;
    }
  }

  root.querySelector('#btn-obs-principal').addEventListener('click', () => {
    openObservacionRapida(cultivos);
  });
}

// ---------------------------------------------------------------------
// Flujo ultrarrápido de "Registrar observación": elegir cultivo -> foto +
// nota -> guardar. Pensado para usarse parado en la huerta, en 3 toques.
// ---------------------------------------------------------------------

async function openObservacionRapida(cultivos) {
  const activos = cultivos.filter((c) => c.estado === 'activo');
  if (!activos.length) {
    showToast('Primero registrá un cultivo');
    return;
  }

  const itemsHtml = await Promise.all(
    activos.map(async (c) => {
      const eventosCultivo = await DB.getEventosByCultivo(c.id);
      const fotoUrl = await obtenerImagenCultivo(c, eventosCultivo);
      return `
        <button type="button" class="cultivo-pick-item" data-id="${c.id}" data-especie="${escapeHtml(c.especie)}">
          <span class="cultivo-pick-thumb" style="${fotoUrl ? `background-image:url('${fotoUrl}')` : ''}">${fotoUrl ? '' : '🌿'}</span>
          <span class="cultivo-pick-info">
            <span class="cultivo-pick-especie">${escapeHtml(c.especie)}</span>
            ${c.variedad ? `<span class="cultivo-pick-variedad">${escapeHtml(c.variedad)}</span>` : ''}
          </span>
        </button>
      `;
    })
  );

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>¿Qué cultivo?</h2>
      <div class="cultivo-pick-list">${itemsHtml.join('')}</div>
    </div>
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);
  backdrop.querySelector('.cultivo-pick-list').addEventListener('click', (e) => {
    const item = e.target.closest('.cultivo-pick-item');
    if (!item) return;
    renderObservacionPaso2(backdrop, close, Number(item.dataset.id), item.dataset.especie);
  });
}

function renderObservacionPaso2(backdrop, close, cultivoId, especieLabel) {
  const sheet = backdrop.querySelector('.modal-sheet');
  let fotoBlob = null;
  let previewUrl = null;

  sheet.innerHTML = `
    <div class="modal-close-row"><button id="modal-close">✕</button></div>
    <h2>${escapeHtml(especieLabel)}</h2>
    <div class="form-group">
      <div class="photo-picker-compacta" id="obs-photo-picker" role="button" tabindex="0" aria-label="Tomar foto">
        <span class="ppc-thumb" id="obs-photo-thumb"><span class="emoji">📷</span></span>
        <span class="ppc-label" id="obs-photo-label">Tomar foto</span>
        <button type="button" class="remove-photo hidden" id="obs-photo-remove" aria-label="Quitar foto">✕</button>
      </div>
      <input type="file" id="obs-foto" accept="image/*" capture="environment" hidden />
    </div>
    <div class="form-group">
      <label class="form-label">¿Qué observaste?</label>
      <textarea id="obs-nota" class="form-textarea" placeholder="Escribí lo que ves..."></textarea>
    </div>
    <button id="obs-guardar" class="btn-primary">Guardar observación</button>
  `;

  sheet.querySelector('#modal-close').addEventListener('click', close);
  sheet.querySelector('#obs-nota').focus({ preventScroll: true });

  const photoPicker = sheet.querySelector('#obs-photo-picker');
  const fotoInput = sheet.querySelector('#obs-foto');
  const photoThumb = sheet.querySelector('#obs-photo-thumb');
  const photoLabel = sheet.querySelector('#obs-photo-label');
  const photoRemoveBtn = sheet.querySelector('#obs-photo-remove');

  photoPicker.addEventListener('click', (e) => {
    if (e.target.closest('.remove-photo')) return;
    fotoInput.click();
  });
  photoPicker.addEventListener('keydown', (e) => {
    if (e.target.closest('.remove-photo')) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      fotoInput.click();
    }
  });

  fotoInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    fotoBlob = await downscaleImage(file);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(fotoBlob);
    photoThumb.style.backgroundImage = `url('${previewUrl}')`;
    photoThumb.textContent = '';
    photoLabel.textContent = 'Foto lista ✓';
    photoPicker.classList.add('has-photo');
    photoRemoveBtn.classList.remove('hidden');
  });

  photoRemoveBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    fotoBlob = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    fotoInput.value = '';
    photoThumb.style.backgroundImage = '';
    photoThumb.innerHTML = '<span class="emoji">📷</span>';
    photoLabel.textContent = 'Tomar foto';
    photoPicker.classList.remove('has-photo');
    photoRemoveBtn.classList.add('hidden');
  });

  sheet.querySelector('#obs-guardar').addEventListener('click', async () => {
    const nota = sheet.querySelector('#obs-nota').value.trim();
    if (!nota && !fotoBlob) {
      showToast('Escribí algo o sacá una foto');
      return;
    }
    let fotoId = null;
    if (fotoBlob) fotoId = await DB.addFoto(fotoBlob);
    await DB.addEvento({
      cultivoId,
      tipo: fotoId ? 'fotografia' : 'observacion',
      fecha: todayIsoDate(),
      nota: nota || null,
      fotoId,
    });
    close();
    showToast('Observación registrada 🌿');
    router();
  });
}

// ---------------------------------------------------------------------
// Qué observar hoy: prioriza cultivos activos con más días sin ningún
// registro (evento distinto de la siembra inicial). Es una señal simple
// a propósito — no reemplaza al motor de observación de la ficha, solo
// ayuda a decidir POR CUÁL cultivo empezar. Lista corta siempre.
// ---------------------------------------------------------------------

async function construirQueObservarHoy(activos, limite = 3, umbralDias = 5) {
  const candidatos = [];
  for (const c of activos) {
    const eventos = await DB.getEventosByCultivo(c.id);
    const relevantes = eventos.filter((e) => e.tipo !== 'siembra');
    const fechaReferencia = relevantes.length ? relevantes[0].fecha : c.fechaInicio;
    const dias = diasDesde(fechaReferencia);
    if (dias >= umbralDias) candidatos.push({ cultivo: c, dias });
  }
  candidatos.sort((a, b) => b.dias - a.dias);
  return candidatos.slice(0, limite);
}
