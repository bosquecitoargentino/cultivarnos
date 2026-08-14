// views/detalle.js — vista Detalle del cultivo

async function renderDetalle(id, root) {
  root = root || APP_ROOT;
  const cultivo = await DB.getCultivo(id);
  if (!cultivo) {
    root.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span>No se encontró el cultivo.</div>`;
    return;
  }

  const [eventos, recordatorios, fotos, config] = await Promise.all([
    DB.getEventosByCultivo(id),
    DB.getRecordatoriosByCultivo(id),
    DB.getFotosByCultivo(id),
    DB.getConfiguracion(),
  ]);

  // Cabecera: foto real más reciente, o si todavía no hay ninguna, la
  // imagen predeterminada de la especie (nunca al revés). La sección
  // "Fotos" más abajo sigue usando `fotos` (DB.getFotosByCultivo) tal
  // cual — esa lista es exclusivamente de fotografías reales.
  const fotoUrl = await obtenerImagenCultivo(cultivo, eventos);
  const dias = diasDesde(cultivo.fechaInicio);
  const pendientes = recordatorios.filter((r) => r.estado === 'pendiente');

  // Qué observar ahora: motor local, sin IA — no tiene sentido seguir
  // sugiriendo observaciones sobre un cultivo ya finalizado.
  const observar = cultivo.estado === 'finalizado'
    ? { preguntas: [] }
    : obtenerPreguntasActuales(cultivo, eventos, new Date(), config.hemisferio, 3);

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

    ${cultivo.estado !== 'finalizado' ? `
    <section>
      <div class="section-title">Qué observar ahora 🌱</div>
      <div id="observar-ahora"></div>
    </section>` : ''}

    ${pendientes.length ? `
    <section>
      <div class="section-title">Recordatorios</div>
      <div id="recordatorios-detalle"></div>
    </section>` : ''}

    <section>
      ${fotos.length
        ? `<div class="section-title">Fotos · ${fotos.length}</div>
           <div id="fotos-grid"></div>
           ${fotos.length > 6 ? `<a href="#/cultivo/${id}/fotos" class="link-ver-todas">Ver todas →</a>` : ''}`
        : `<div class="section-title">Fotos</div>
           <p class="fotos-vacio">Todavía no hay fotos registradas.</p>`
      }
    </section>

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
        btn.classList.add('checked');
        btn.closest('.reminder-item')?.classList.add('completing');
        await DB.updateRecordatorio(rid, { estado: 'completado' });
        showToast('Recordatorio completado');
        setTimeout(() => renderDetalle(id, root), 220);
        return;
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

  // Qué observar ahora: preguntas rápidas del motor de observación (sin IA,
  // sin diagnóstico — solo guía sobre qué mirar). Cada respuesta se guarda
  // al toque en el historial; si la pregunta trae una acción o recordatorio
  // asociado, se ofrece — nunca se crea nada sin confirmación.
  const observarWrap = root.querySelector('#observar-ahora');
  if (observarWrap) {
    observarWrap.innerHTML = renderObservarAhoraHtml(observar.preguntas);
    observarWrap.addEventListener('click', async (e) => {
      const opcionBtn = e.target.closest('.observar-opcion');
      if (opcionBtn) {
        const preguntaId = opcionBtn.dataset.preguntaId;
        const respuesta = opcionBtn.dataset.respuesta;
        const pregunta = observar.preguntas.find((p) => p.id === preguntaId);
        if (!pregunta) return;
        const item = opcionBtn.closest('.observar-item');
        item.querySelectorAll('.observar-opcion').forEach((b) => {
          b.classList.toggle('selected', b === opcionBtn);
          b.disabled = true;
        });
        await guardarRespuestaRapida(id, pregunta, respuesta);
        showToast('Observación guardada');
        const oferta = construirOferta(pregunta, respuesta);
        if (oferta) {
          // Si hay una oferta (acción o recordatorio sugerido), esperamos su
          // confirmación antes de refrescar la ficha, para que la persona
          // pueda verla y decidir sin que la pantalla se mueva debajo suyo.
          mostrarOfertaEnItem(item, oferta, id, () => renderDetalle(id, root));
        } else {
          item.classList.add('resuelto');
          // Refresca la ficha para que la respuesta quede visible en el
          // historial al toque, igual que el resto de las acciones rápidas
          // de esta vista (completar recordatorio, eliminar evento, etc.).
          setTimeout(() => renderDetalle(id, root), 260);
        }
        return;
      }
      if (e.target.closest('#btn-revision-completa')) {
        abrirRevisionCompleta(id, cultivo, eventos, config, () => renderDetalle(id, root));
      }
    });
  }

  // Fotos: minibiblioteca visual del cultivo (primeras 6, sin duplicar nada)
  if (fotos.length) {
    const fotosGrid = root.querySelector('#fotos-grid');
    fotosGrid.innerHTML = await renderFotoGridHtml(fotos, 6);
    fotosGrid.addEventListener('click', (e) => {
      const item = e.target.closest('.foto-grid-item');
      if (!item) return;
      openFotoLightbox(fotos, Number(item.dataset.index));
    });
  }

  // Timeline
  const timelineWrap = root.querySelector('#timeline');
  if (!eventos.length) {
    timelineWrap.innerHTML = `<div class="empty-state"><span class="emoji">📖</span>Todavía no hay eventos registrados.</div>`;
  } else {
    const items = await Promise.all(eventos.map((ev) => renderTimelineItem(ev, fotos)));
    timelineWrap.innerHTML = `<div class="timeline">${items.join('')}</div>`;
    timelineWrap.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.timeline-delete');
      if (deleteBtn) {
        if (!window.confirm('¿Eliminar este evento del historial?')) return;
        await DB.deleteEvento(Number(deleteBtn.dataset.id));
        showToast('Evento eliminado');
        renderDetalle(id, root);
        return;
      }
      const foto = e.target.closest('.timeline-foto');
      if (foto) {
        openFotoLightbox(fotos, Number(foto.dataset.fotoIndex));
      }
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

async function renderTimelineItem(ev, fotos) {
  const fotoUrl = await fotoUrlCache.getUrl(ev.fotoId);
  const fotoIndex = fotoUrl ? fotos.findIndex((f) => f.eventoId === ev.id) : -1;
  return `
    <div class="timeline-item">
      <div class="timeline-card">
        <div class="timeline-head">
          <span>${eventoIcon(ev.tipo)}</span>
          <span>${eventoLabel(ev.tipo)}</span>
          <span class="timeline-fecha">${formatFecha(ev.fecha)}</span>
        </div>
        ${ev.respuestas && ev.respuestas.length ? `
        <div class="timeline-respuestas">
          ${ev.respuestas.map((r) => `<div class="timeline-respuesta"><strong>${escapeHtml(r.etiqueta)}:</strong> ${escapeHtml(r.respuesta)}</div>`).join('')}
        </div>` : ''}
        ${ev.nota ? `<div class="timeline-nota">${escapeHtml(ev.nota)}</div>` : ''}
        ${fotoUrl ? `<button type="button" class="timeline-foto" data-foto-index="${fotoIndex}" aria-label="Ver foto grande"><img src="${fotoUrl}" alt="Foto del evento" /></button>` : ''}
        <button class="timeline-delete" data-id="${ev.id}">Eliminar</button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------
// Qué observar ahora / Revisión guiada — capa de presentación del motor
// de observación (motor-observacion.js). Esta sección no contiene ninguna
// lógica agronómica: solo pinta lo que el motor decide y guarda las
// respuestas. Ninguna acción o recordatorio se crea sin confirmación
// explícita del usuario (principio central: enseñar a observar, no
// diagnosticar).
// ---------------------------------------------------------------------

function renderObservarAhoraHtml(preguntas) {
  if (!preguntas.length) {
    return `
      <div class="observar-vacio">
        <p>No hay preguntas sugeridas por ahora.</p>
        <button type="button" id="btn-revision-completa" class="link-ver-todas">👁 Revisar cultivo</button>
      </div>
    `;
  }
  return `
    <div class="observar-lista">
      ${preguntas.map((p) => `
        <div class="observar-item" data-pregunta-id="${p.id}">
          <div class="observar-pregunta">${escapeHtml(p.texto)}</div>
          <div class="observar-opciones">
            ${p.opciones.map((op) => `<button type="button" class="observar-opcion" data-pregunta-id="${p.id}" data-respuesta="${escapeHtml(op)}">${escapeHtml(op)}</button>`).join('')}
          </div>
          ${p.pista ? `<div class="observar-pista">${escapeHtml(p.pista)}</div>` : ''}
        </div>
      `).join('')}
    </div>
    <button type="button" id="btn-revision-completa" class="link-ver-todas">👁 Hacer revisión completa →</button>
  `;
}

// Guarda una respuesta rápida agrupándola en el evento de revisión del día
// (si ya existe uno para hoy) en vez de crear un evento por cada respuesta.
async function guardarRespuestaRapida(cultivoId, pregunta, respuesta, fecha) {
  const hoy = fecha || todayIsoDate();
  const eventos = await DB.getEventosByCultivo(cultivoId);
  const revisionHoy = eventos.find((e) => e.tipo === 'revision' && e.fecha === hoy);
  const entrada = { preguntaId: pregunta.id, etiqueta: pregunta.etiqueta || pregunta.texto, respuesta };
  if (revisionHoy) {
    const respuestas = (revisionHoy.respuestas || []).filter((r) => r.preguntaId !== pregunta.id);
    respuestas.push(entrada);
    await DB.updateEvento(revisionHoy.id, { respuestas });
  } else {
    await DB.addEvento({ cultivoId, tipo: 'revision', fecha: hoy, respuestas: [entrada] });
  }
}

// Si la respuesta dada coincide con la que dispara una acción o un
// recordatorio sugerido para esa pregunta, arma el objeto de oferta.
// Nunca se ejecuta nada acá — solo se describe qué se podría ofrecer.
function construirOferta(pregunta, respuesta) {
  if (pregunta.accion && pregunta.accion.respuesta === respuesta) {
    return { tipo: 'accion', eventoTipo: pregunta.accion.eventoTipo, label: pregunta.accion.label };
  }
  if (pregunta.recordatorio && pregunta.recordatorio.respuesta === respuesta) {
    return { tipo: 'recordatorio', dias: pregunta.recordatorio.dias, titulo: pregunta.recordatorio.titulo };
  }
  return null;
}

// Muestra la oferta (registrar evento / crear recordatorio) debajo de la
// pregunta respondida, con confirmación explícita Sí/No. onDone se llama
// tanto si se confirma como si se descarta, para refrescar la ficha recién
// ahí (así la persona alcanza a ver y decidir la oferta antes de que la
// pantalla se actualice).
function mostrarOfertaEnItem(item, oferta, cultivoId, onDone) {
  const div = document.createElement('div');
  div.className = 'observar-oferta';
  const label = oferta.tipo === 'accion' ? oferta.label : `Recordarme en ${oferta.dias} días: ${oferta.titulo}`;
  div.innerHTML = `
    <span>${escapeHtml(label)}</span>
    <div class="observar-oferta-botones">
      <button type="button" class="pill-btn oferta-confirmar">Sí</button>
      <button type="button" class="pill-btn oferta-descartar">No</button>
    </div>
  `;
  item.appendChild(div);
  div.querySelector('.oferta-confirmar').addEventListener('click', async () => {
    if (oferta.tipo === 'accion') {
      await DB.addEvento({ cultivoId, tipo: oferta.eventoTipo, fecha: todayIsoDate() });
      showToast('Evento registrado');
    } else {
      const fecha = new Date();
      fecha.setDate(fecha.getDate() + oferta.dias);
      await DB.addRecordatorio({ cultivoId, titulo: oferta.titulo, fecha: fecha.toISOString().slice(0, 10), estado: 'pendiente' });
      showToast('Recordatorio creado');
    }
    div.remove();
    item.classList.add('resuelto');
    if (onDone) setTimeout(onDone, 500);
  });
  div.querySelector('.oferta-descartar').addEventListener('click', () => {
    div.remove();
    item.classList.add('resuelto');
    if (onDone) setTimeout(onDone, 260);
  });
}

// Sesión guiada paso a paso ("1 de N"): recorre un pool más amplio de
// preguntas, permite Omitir en cada paso, y al final agrupa todas las
// respuestas de la sesión en UN solo evento de revisión (mismo criterio
// de agrupamiento por día que las respuestas rápidas de la ficha).
function abrirRevisionCompleta(cultivoId, cultivo, eventos, config, onSaved) {
  const { preguntas } = obtenerPreguntasActuales(cultivo, eventos, new Date(), config.hemisferio, 8);
  if (!preguntas.length) {
    showToast('No hay más preguntas sugeridas por ahora');
    return;
  }

  let idx = 0;
  const respuestas = [];
  const ofertas = [];

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <div id="revision-contenido"></div>
    </div>
  `, 'revision-modal');

  backdrop.querySelector('#modal-close').addEventListener('click', close);
  const contenido = backdrop.querySelector('#revision-contenido');

  function pintarPregunta() {
    const p = preguntas[idx];
    contenido.innerHTML = `
      <div class="revision-progreso">${idx + 1} de ${preguntas.length}</div>
      <div class="revision-pregunta">${escapeHtml(p.texto)}</div>
      <div class="observar-opciones revision-opciones">
        ${p.opciones.map((op) => `<button type="button" class="observar-opcion" data-respuesta="${escapeHtml(op)}">${escapeHtml(op)}</button>`).join('')}
      </div>
      ${p.pista ? `<div class="observar-pista">${escapeHtml(p.pista)}</div>` : ''}
      <button type="button" id="revision-omitir" class="link-ver-todas">Omitir</button>
    `;
    contenido.querySelectorAll('.observar-opcion').forEach((btn) => {
      btn.addEventListener('click', () => {
        const respuesta = btn.dataset.respuesta;
        respuestas.push({ preguntaId: p.id, etiqueta: p.etiqueta || p.texto, respuesta });
        const oferta = construirOferta(p, respuesta);
        if (oferta) ofertas.push({ ...oferta, preguntaTexto: p.texto });
        avanzar();
      });
    });
    contenido.querySelector('#revision-omitir').addEventListener('click', avanzar);
  }

  function avanzar() {
    idx++;
    if (idx < preguntas.length) pintarPregunta();
    else pintarResumen();
  }

  function pintarResumen() {
    contenido.innerHTML = `
      <div class="revision-resumen-titulo">Revisión completada 🌱</div>
      ${respuestas.length ? `
        <div class="revision-resumen-lista">
          ${respuestas.map((r) => `<div class="revision-resumen-item"><strong>${escapeHtml(r.etiqueta)}:</strong> ${escapeHtml(r.respuesta)}</div>`).join('')}
        </div>
      ` : `<p class="revision-resumen-vacio">No se registraron respuestas.</p>`}
      ${ofertas.length ? `
        <div class="revision-ofertas" id="revision-ofertas">
          ${ofertas.map((o, i) => `
            <div class="observar-oferta" data-oferta-index="${i}">
              <span>${o.tipo === 'accion' ? escapeHtml(o.label) : `Recordarme en ${o.dias} días: ${escapeHtml(o.titulo)}`}</span>
              <div class="observar-oferta-botones">
                <button type="button" class="pill-btn oferta-confirmar" data-oferta-index="${i}">Sí</button>
                <button type="button" class="pill-btn oferta-descartar" data-oferta-index="${i}">No</button>
              </div>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <div class="form-group">
        <label class="form-label">Nota <span class="optional">(opcional)</span></label>
        <textarea id="revision-nota" class="form-textarea" placeholder="Algo más que quieras anotar..."></textarea>
      </div>
      <button type="button" id="revision-guardar" class="btn-primary">Guardar revisión</button>
    `;

    const ofertasWrap = contenido.querySelector('#revision-ofertas');
    if (ofertasWrap) {
      ofertasWrap.addEventListener('click', async (e) => {
        const confirmar = e.target.closest('.oferta-confirmar');
        const descartar = e.target.closest('.oferta-descartar');
        const btn = confirmar || descartar;
        if (!btn) return;
        const i = Number(btn.dataset.ofertaIndex);
        const oferta = ofertas[i];
        if (confirmar) {
          if (oferta.tipo === 'accion') {
            await DB.addEvento({ cultivoId, tipo: oferta.eventoTipo, fecha: todayIsoDate() });
            showToast('Evento registrado');
          } else {
            const fecha = new Date();
            fecha.setDate(fecha.getDate() + oferta.dias);
            await DB.addRecordatorio({ cultivoId, titulo: oferta.titulo, fecha: fecha.toISOString().slice(0, 10), estado: 'pendiente' });
            showToast('Recordatorio creado');
          }
        }
        btn.closest('.observar-oferta').remove();
      });
    }

    contenido.querySelector('#revision-guardar').addEventListener('click', async () => {
      const nota = contenido.querySelector('#revision-nota').value.trim();
      const hoy = todayIsoDate();
      const eventosCultivo = await DB.getEventosByCultivo(cultivoId);
      const revisionHoy = eventosCultivo.find((e) => e.tipo === 'revision' && e.fecha === hoy);
      if (revisionHoy) {
        const previas = (revisionHoy.respuestas || []).filter((r) => !respuestas.some((n) => n.preguntaId === r.preguntaId));
        const merged = [...previas, ...respuestas];
        await DB.updateEvento(revisionHoy.id, {
          respuestas: merged,
          nota: nota ? (revisionHoy.nota ? `${revisionHoy.nota}\n${nota}` : nota) : revisionHoy.nota,
        });
      } else {
        await DB.addEvento({ cultivoId, tipo: 'revision', fecha: hoy, respuestas, nota: nota || null });
      }
      close();
      showToast('Revisión guardada');
      onSaved();
    });
  }

  pintarPregunta();
}

// Vista completa: todas las fotos del cultivo en una cuadrícula.
async function renderGaleriaFotos(cultivoId, root) {
  root = root || APP_ROOT;
  const cultivo = await DB.getCultivo(cultivoId);
  if (!cultivo) {
    root.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span>No se encontró el cultivo.</div>`;
    return;
  }
  const fotos = await DB.getFotosByCultivo(cultivoId);

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <a href="#/cultivo/${cultivoId}" class="volver-link">‹ ${escapeHtml(cultivo.especie)}</a>
      <h1>Fotos</h1>
      <p>${fotos.length} fotografía${fotos.length === 1 ? '' : 's'}</p>
    </div>
    <div id="fotos-grid-completo"></div>
  `;

  const grid = root.querySelector('#fotos-grid-completo');
  if (!fotos.length) {
    grid.innerHTML = `<p class="fotos-vacio">Todavía no hay fotos registradas.</p>`;
    return;
  }
  grid.innerHTML = await renderFotoGridHtml(fotos);
  grid.addEventListener('click', (e) => {
    const item = e.target.closest('.foto-grid-item');
    if (!item) return;
    openFotoLightbox(fotos, Number(item.dataset.index));
  });
}

function openEventoModal(cultivoId, onSaved) {
  let fotoBlob = null;
  let tipoSeleccionado = 'observacion';

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Agregar evento</h2>
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="chip-group" id="ev-tipo">
          ${EVENTO_TIPOS.map((t) => `<div class="chip-option ${t.value === tipoSeleccionado ? 'selected' : ''}" data-value="${t.value}">${t.icon} ${t.label}</div>`).join('')}
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
        <div class="photo-picker" id="ev-photo-picker" role="button" tabindex="0" aria-label="Agregar fotografía">
          <span class="photo-picker-placeholder">
            <span class="emoji">📷</span>
            <span>Tocá para agregar una foto</span>
          </span>
          <button type="button" class="remove-photo hidden" id="ev-photo-remove">✕</button>
          <input type="file" id="ev-foto" accept="image/*" capture="environment" hidden />
        </div>
      </div>
      <button id="ev-guardar" class="btn-primary">Guardar evento</button>
    </div>
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);

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

    // Algunos tipos de evento (trasplante, poda...) tienen un seguimiento
    // típico que vale la pena ofrecer — nunca se crea el recordatorio sin
    // que la persona lo confirme acá mismo.
    const sugerencia = sugerenciaRecordatorioPorEvento(tipoSeleccionado);
    if (sugerencia) {
      mostrarSugerenciaRecordatorioEnModal(backdrop, sugerencia, cultivoId, () => {
        close();
        onSaved();
      });
    } else {
      close();
      showToast('Evento agregado');
      onSaved();
    }
  });
}

// Reemplaza el contenido del modal de evento por una oferta de
// recordatorio de seguimiento, con confirmación explícita Sí/No.
function mostrarSugerenciaRecordatorioEnModal(backdrop, sugerencia, cultivoId, onDone) {
  const sheet = backdrop.querySelector('.modal-sheet');
  sheet.innerHTML = `
    <div class="modal-close-row"><button id="modal-close">✕</button></div>
    <div class="sugerencia-evento">
      <div class="sugerencia-evento-icono">🌱</div>
      <div class="sugerencia-evento-texto">Evento registrado. ¿Querés que te recuerde<br /><strong>"${escapeHtml(sugerencia.titulo)}"</strong><br />en ${sugerencia.dias} días?</div>
      <div class="sugerencia-evento-botones">
        <button type="button" id="sugerencia-si" class="btn-primary">Sí, recordarme</button>
        <button type="button" id="sugerencia-no" class="btn-secondary">No, gracias</button>
      </div>
    </div>
  `;
  sheet.querySelector('#modal-close').addEventListener('click', onDone);
  sheet.querySelector('#sugerencia-no').addEventListener('click', onDone);
  sheet.querySelector('#sugerencia-si').addEventListener('click', async () => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + sugerencia.dias);
    await DB.addRecordatorio({
      cultivoId,
      titulo: sugerencia.titulo,
      fecha: fecha.toISOString().slice(0, 10),
      estado: 'pendiente',
    });
    showToast('Recordatorio creado');
    onDone();
  });
}

function openRecordatorioModal(cultivoId, onSaved) {
  const defaultDate = new Date();
  defaultDate.setDate(defaultDate.getDate() + 3);

  const { backdrop, close } = createModal(`
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
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);

  backdrop.querySelector('#rec-guardar').addEventListener('click', async () => {
    const titulo = backdrop.querySelector('#rec-titulo').value.trim();
    const fecha = backdrop.querySelector('#rec-fecha').value;
    if (!titulo || !fecha) { showToast('Completá título y fecha'); return; }
    await DB.addRecordatorio({ cultivoId, titulo, fecha, estado: 'pendiente' });
    close();
    showToast('Recordatorio agregado');
    onSaved();
  });
}
