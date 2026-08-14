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

  // Seguimiento de siembra: pura derivación de los eventos (ver
  // motor-siembra.js) — nada de esto se guarda aparte. Si el cultivo nunca
  // cargó una cantidad sembrada, resumen.activo queda en false y esta
  // sección completa se omite, tal cual funcionaba antes de esta función.
  const resumenSiembra = calcularResumenSiembra(cultivo, eventos);
  const anotacionesSiembra = calcularAnotacionesHistorialSiembra(eventos);

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
      <button id="btn-editar-cultivo">✏️ Editar</button>
      <button id="btn-toggle-estado">${cultivo.estado === 'finalizado' ? '↩️ Reactivar' : '🏁 Finalizar'}</button>
    </div>

    <section id="siembra-section"></section>

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

  // Seguimiento de siembra: tarjeta resumen + accesos directos a
  // germinación/trasplante/baja, o el link retroactivo si el cultivo
  // todavía no tiene datos cuantitativos cargados.
  const siembraWrap = root.querySelector('#siembra-section');
  pintarSeguimientoSiembra(siembraWrap, cultivo, resumenSiembra, () => renderDetalle(id, root));

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
        await DB.updateRecordatorio(rid, { fecha: sumarDiasFecha(rec.fecha, 3) });
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
          mostrarOfertaEnItem(item, oferta, id, () => renderDetalle(id, root), resumenSiembra);
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
    const items = await Promise.all(eventos.map((ev) => renderTimelineItem(ev, fotos, anotacionesSiembra, resumenSiembra)));
    timelineWrap.innerHTML = `<div class="timeline">${items.join('')}</div>`;
    timelineWrap.addEventListener('click', async (e) => {
      const deleteBtn = e.target.closest('.timeline-delete');
      if (deleteBtn) {
        if (!window.confirm('¿Eliminar este evento del historial?')) return;
        await DB.deleteEventoCompleto(Number(deleteBtn.dataset.id));
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
  root.querySelector('#btn-editar-cultivo').addEventListener('click', () => abrirModalEditarCultivo(cultivo, resumenSiembra, () => renderDetalle(id, root)));

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
    await DB.deleteCultivoCompleto(id);
    showToast('Cultivo eliminado');
    navigate('#/cultivos');
  });
}

async function renderTimelineItem(ev, fotos, anotacionesSiembra, resumenSiembra) {
  const fotoUrl = await fotoUrlCache.getUrl(ev.fotoId);
  const fotoIndex = fotoUrl ? fotos.findIndex((f) => f.eventoId === ev.id) : -1;
  const lineaSiembra = anotacionesSiembra ? lineaSiembraParaEvento(ev, anotacionesSiembra, resumenSiembra) : null;
  return `
    <div class="timeline-item">
      <div class="timeline-card">
        <div class="timeline-head">
          <span>${eventoIcon(ev.tipo)}</span>
          <span>${eventoLabel(ev.tipo)}</span>
          <span class="timeline-fecha">${formatFecha(ev.fecha)}</span>
        </div>
        ${lineaSiembra ? `<div class="timeline-siembra">${escapeHtml(lineaSiembra)}</div>` : ''}
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

// Arma la línea narrativa de un evento de siembra/germinación/trasplante/
// baja a partir de los totales acumulados que ya calculó
// calcularAnotacionesHistorialSiembra — así el historial cuenta la
// historia completa del lote (punto 22 del pedido).
function lineaSiembraParaEvento(ev, anotaciones, resumen) {
  const metodo = resumen && resumen.metodo;
  if (ev.tipo === 'siembra' && ev.cantidad != null) {
    // Texto adaptado al método (punto 6: evitar que todo diga "Sembradas").
    if (metodo === 'plantin') {
      return `${ev.cantidad} plantín${ev.cantidad === 1 ? '' : 'es'} inicial${ev.cantidad === 1 ? '' : 'es'}.`;
    }
    if (metodo === 'trasplante') {
      const destinoTxt = ev.destino ? ` a ${ev.destino}` : '';
      return `${ev.cantidad} planta${ev.cantidad === 1 ? '' : 's'} trasplantada${ev.cantidad === 1 ? '' : 's'}${destinoTxt}.`;
    }
    return `${ev.cantidad} unidad${ev.cantidad === 1 ? '' : 'es'} sembrada${ev.cantidad === 1 ? '' : 's'}.`;
  }
  const a = anotaciones.get(ev.id);
  if (!a) return null;
  if (a.tipo === 'germinacion') {
    const totalTxt = a.sembradas != null ? `${a.totalGerminadas}/${a.sembradas}` : `${a.totalGerminadas}`;
    const pctTxt = a.pct != null ? ` · ${a.pct}%` : '';
    return `${a.nuevas} nueva${a.nuevas === 1 ? '' : 's'} germinaci${a.nuevas === 1 ? 'ón' : 'ones'}. Total: ${totalTxt}${pctTxt}.`;
  }
  if (a.tipo === 'trasplante') {
    const destinoTxt = a.destino ? ` a ${a.destino}` : '';
    const quedanTxt = a.enOrigen != null ? ` Quedan ${a.enOrigen} disponibles.` : '';
    return `${a.cantidad} planta${a.cantidad === 1 ? '' : 's'} trasladada${a.cantidad === 1 ? '' : 's'}${destinoTxt}.${quedanTxt}`;
  }
  if (a.tipo === 'baja') {
    const motivoTxt = a.motivo ? ` (${etiquetaMotivoBaja(a.motivo) || a.motivo})` : '';
    let origenTxt;
    if (a.origen === 'destino') {
      origenTxt = a.destino ? ` en ${a.destino}` : ' en lugar definitivo';
    } else {
      origenTxt = metodo === 'plantin' ? ' sin trasplantar' : ' en semillero';
    }
    return `${a.cantidad} baja${a.cantidad === 1 ? '' : 's'}${origenTxt}${motivoTxt}.`;
  }
  return null;
}

// ---------------------------------------------------------------------
// Seguimiento de siembra — tarjeta resumen + accesos a germinación /
// trasplante / baja. Capa de presentación pura: toda la aritmética vive en
// motor-siembra.js, acá solo se pinta y se piden confirmaciones.
// ---------------------------------------------------------------------

function pintarSeguimientoSiembra(wrap, cultivo, resumen, onChange) {
  if (!resumen.activo) {
    if (!puedeAgregarDatosSiembra(cultivo, resumen)) {
      wrap.innerHTML = '';
      return;
    }
    wrap.innerHTML = `<button type="button" id="btn-agregar-siembra" class="link-ver-todas">＋ Agregar datos de siembra</button>`;
    wrap.querySelector('#btn-agregar-siembra').addEventListener('click', () => {
      abrirModalAgregarSiembra(cultivo, onChange);
    });
    return;
  }

  // Etiqueta de la cantidad inicial adaptada al método (semillero/directa:
  // "sembradas"; plantín: "plantines iniciales"; trasplante: "plantas
  // trasplantadas" — punto 6 del pedido). Para "trasplante" no se repite un
  // tile de "trasplantadas": sería el mismo número dos veces.
  const tiles = [{ valor: resumen.sembradas, label: resumen.etiquetaCantidadInicial }];
  if (!resumen.sinGerminacion) {
    tiles.push({ valor: resumen.germinadas, label: 'germinadas' });
    if (resumen.pctGerminacion != null) tiles.push({ valor: `${resumen.pctGerminacion}%`, label: 'germinación' });
  }
  if (resumen.origenLabel && resumen.germinadas > 0) {
    tiles.push({ valor: resumen.enOrigen, label: resumen.origenLabel.toLowerCase() });
  }
  if (resumen.trasplantadas > 0 && resumen.metodo !== 'trasplante') {
    tiles.push({ valor: resumen.trasplantadas, label: 'trasplantadas' });
  }
  if (resumen.bajas > 0) {
    tiles.push({ valor: resumen.bajas, label: 'bajas' });
  }

  const puedeGerminar = !resumen.sinGerminacion && resumen.germinadas < resumen.sembradas;
  const puedeTrasplantar = resumen.permiteTrasplante && resumen.enOrigen > 0;
  const puedeBaja = resumen.enOrigen > 0 || resumen.enDestino > 0;

  // Distribución actual: dónde está el lote hoy (semillero + cada destino
  // con stock), compacta y mobile-first (punto 4 del pedido) — se muestra
  // siempre que haya algo que ubicar, incluso cuando ya todo pasó a destino
  // (el mensaje colapsado de arriba dice "ya pasó", esto dice A DÓNDE).
  const distribucionHtml = resumen.distribucion && resumen.distribucion.length ? `
    <div class="distribucion-siembra">
      <div class="distribucion-titulo">Distribución actual</div>
      <div class="distribucion-lista">
        ${resumen.distribucion.map((d) => `
          <div class="distribucion-fila">
            <span class="distribucion-icono">${d.tipo === 'origen' ? '🌱' : '📍'}</span>
            <span class="distribucion-ubicacion">${escapeHtml(d.ubicacion)}</span>
            <span class="distribucion-cantidad">${d.cantidad}</span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  wrap.innerHTML = `
    <div class="siembra-card">
      <div class="siembra-card-titulo">Seguimiento de siembra 🌱</div>
      ${resumen.todoTrasplantado
        ? `<p class="siembra-todo-trasplantado">🌱 Todo el lote germinado ya pasó a lugar definitivo.</p>`
        : `<div class="siembra-tiles">${tiles.map((t) => `
            <div class="siembra-tile">
              <div class="siembra-tile-valor">${escapeHtml(String(t.valor))}</div>
              <div class="siembra-tile-label">${escapeHtml(t.label)}</div>
            </div>`).join('')}</div>`
      }
      ${distribucionHtml}
      ${(puedeGerminar || puedeTrasplantar || puedeBaja) ? `
      <div class="siembra-acciones">
        ${puedeGerminar ? `<button type="button" class="pill-btn" data-accion="germinacion">＋ Germinación</button>` : ''}
        ${puedeTrasplantar ? `<button type="button" class="pill-btn" data-accion="trasplante">＋ Trasplante</button>` : ''}
        ${puedeBaja ? `<button type="button" class="pill-btn" data-accion="baja">＋ Baja</button>` : ''}
      </div>` : ''}
    </div>
  `;

  const accionesWrap = wrap.querySelector('.siembra-acciones');
  if (accionesWrap) {
    accionesWrap.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-accion]');
      if (!btn) return;
      if (btn.dataset.accion === 'germinacion') abrirModalGerminacion(cultivo.id, resumen, onChange);
      if (btn.dataset.accion === 'trasplante') abrirModalTrasplante(cultivo.id, resumen, onChange);
      if (btn.dataset.accion === 'baja') abrirModalBaja(cultivo.id, resumen, onChange);
    });
  }
}

// ¿Cuántas nuevas germinaron? — mobile-first: muestra en vivo "ya habían
// germinado X, después de esto Y de Z" a medida que se escribe, y valida
// contra el máximo posible antes de guardar (nunca más que lo sembrado).
function abrirModalGerminacion(cultivoId, resumen, onDone) {
  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Germinación</h2>
      <div class="form-group">
        <label class="form-label">¿Cuántas nuevas germinaron?</label>
        <input type="number" id="germ-cantidad" class="form-input" min="1" step="1" inputmode="numeric" placeholder="Ej: 5" />
      </div>
      <p class="siembra-modal-info" id="germ-info"></p>
      <p class="siembra-modal-error hidden" id="germ-error"></p>
      <button type="button" id="germ-guardar" class="btn-primary">Guardar</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const input = backdrop.querySelector('#germ-cantidad');
  const info = backdrop.querySelector('#germ-info');
  const errorEl = backdrop.querySelector('#germ-error');

  function actualizarPreview() {
    const n = parseInt(input.value, 10);
    if (Number.isFinite(n) && n > 0) {
      info.textContent = `Ya habían germinado: ${resumen.germinadas} · Después de esto: ${resumen.germinadas + n} de ${resumen.sembradas}`;
    } else {
      info.textContent = `Ya habían germinado: ${resumen.germinadas} de ${resumen.sembradas}`;
    }
  }
  input.addEventListener('input', () => {
    errorEl.classList.add('hidden');
    actualizarPreview();
  });
  actualizarPreview();
  input.focus({ preventScroll: true });

  backdrop.querySelector('#germ-guardar').addEventListener('click', async () => {
    const n = parseInt(input.value, 10);
    const validacion = validarCantidadGerminacion(resumen, n);
    if (!validacion.ok) {
      errorEl.textContent = validacion.mensaje;
      errorEl.classList.remove('hidden');
      return;
    }
    await DB.addEvento({ cultivoId, tipo: 'germinacion', fecha: todayIsoDate(), cantidad: n });
    close();
    showToast('Germinación registrada 🌱');
    onDone();
  });
}

// Trasplante parcial: cantidad + destino libre (reutiliza destinos ya
// usados como sugerencia rápida). Valida contra lo disponible en el
// semillero/origen antes de guardar.
function abrirModalTrasplante(cultivoId, resumen, onDone) {
  const sugerencias = resumen.destinos.map((d) => d.destino).filter((d) => d !== 'Sin destino especificado').slice(0, 4);
  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Trasplante</h2>
      <div class="form-group">
        <label class="form-label">Cantidad trasplantada</label>
        <input type="number" id="tra-cantidad" class="form-input" min="1" step="1" inputmode="numeric" placeholder="Ej: 10" />
        <p class="siembra-modal-info">Disponibles: ${resumen.enOrigen}</p>
      </div>
      <div class="form-group">
        <label class="form-label">Destino <span class="optional">(opcional)</span></label>
        <input type="text" id="tra-destino" class="form-input" placeholder="Ej: Bancal 2, Maceta, Invernadero..." autocomplete="off" />
        ${sugerencias.length ? `<div class="chip-group siembra-destinos-sugeridos" id="tra-destino-sugeridos">${sugerencias.map((d) => `<div class="chip-option" data-value="${escapeHtml(d)}">${escapeHtml(d)}</div>`).join('')}</div>` : ''}
      </div>
      <p class="siembra-modal-error hidden" id="tra-error"></p>
      <button type="button" id="tra-guardar" class="btn-primary">Guardar</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const cantidadInput = backdrop.querySelector('#tra-cantidad');
  const destinoInput = backdrop.querySelector('#tra-destino');
  const errorEl = backdrop.querySelector('#tra-error');
  cantidadInput.focus({ preventScroll: true });
  cantidadInput.addEventListener('input', () => errorEl.classList.add('hidden'));

  const sugeridosWrap = backdrop.querySelector('#tra-destino-sugeridos');
  if (sugeridosWrap) {
    sugeridosWrap.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      destinoInput.value = chip.dataset.value;
    });
  }

  backdrop.querySelector('#tra-guardar').addEventListener('click', async () => {
    const n = parseInt(cantidadInput.value, 10);
    const validacion = validarCantidadTrasplante(resumen, n);
    if (!validacion.ok) {
      errorEl.textContent = validacion.mensaje;
      errorEl.classList.remove('hidden');
      return;
    }
    const destino = destinoInput.value.trim() || null;
    await DB.addEvento({ cultivoId, tipo: 'trasplante', fecha: todayIsoDate(), cantidad: n, destino });
    close();
    showToast('Trasplante registrado 🪴');

    // Mismo recordatorio de seguimiento que ya se ofrece para cualquier
    // evento de trasplante (motor-observacion.js) — nunca se crea sin
    // confirmación explícita.
    const sugerencia = sugerenciaRecordatorioPorEvento('trasplante');
    if (sugerencia) {
      abrirSugerenciaRecordatorioStandalone(cultivoId, sugerencia, onDone);
    } else {
      onDone();
    }
  });
}

// Baja / pérdida: cantidad + de dónde (si hay unidades en más de un lugar)
// + motivo opcional. Sin diagnóstico, solo registro (punto 16 del pedido).
// Si la baja es en "lugar definitivo" y hay más de un destino con stock,
// pide también en cuál (punto 5 del pedido) — con un solo destino no hace
// falta preguntar, se asume directamente para no agregar un paso de más.
function abrirModalBaja(cultivoId, resumen, onDone) {
  const opciones = [];
  if (resumen.enOrigen > 0) opciones.push({ value: 'origen', label: resumen.origenLabel || 'Donde estaban' });
  if (resumen.enDestino > 0) opciones.push({ value: 'destino', label: 'Lugar definitivo' });
  let origenSeleccionado = opciones.length ? opciones[0].value : 'origen';
  let motivoSeleccionado = null;

  const destinosConStock = (resumen.destinos || []).filter((d) => d.cantidad > 0);
  let destinoSeleccionado = destinosConStock.length === 1 ? destinosConStock[0].destino : null;

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Baja / pérdida</h2>
      <div class="form-group">
        <label class="form-label">Cantidad</label>
        <input type="number" id="baja-cantidad" class="form-input" min="1" step="1" inputmode="numeric" placeholder="Ej: 2" />
      </div>
      ${opciones.length > 1 ? `
      <div class="form-group">
        <label class="form-label">¿De dónde?</label>
        <div class="chip-group" id="baja-origen">
          ${opciones.map((o, i) => `<div class="chip-option ${i === 0 ? 'selected' : ''}" data-value="${o.value}">${escapeHtml(o.label)}</div>`).join('')}
        </div>
      </div>` : ''}
      <div class="form-group ${(origenSeleccionado === 'destino' && destinosConStock.length > 1) ? '' : 'hidden'}" id="baja-destino-group">
        <label class="form-label">¿Dónde ocurrió?</label>
        <div class="chip-group" id="baja-destino">
          ${destinosConStock.map((d) => `<div class="chip-option" data-value="${escapeHtml(d.destino)}">${escapeHtml(d.destino)}</div>`).join('')}
        </div>
      </div>
      <p class="siembra-modal-info" id="baja-info"></p>
      <div class="form-group">
        <label class="form-label">Motivo <span class="optional">(opcional)</span></label>
        <div class="chip-group" id="baja-motivo">
          ${MOTIVOS_BAJA.map((m) => `<div class="chip-option" data-value="${m.value}">${escapeHtml(m.label)}</div>`).join('')}
        </div>
      </div>
      <p class="siembra-modal-error hidden" id="baja-error"></p>
      <button type="button" id="baja-guardar" class="btn-primary">Guardar</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const cantidadInput = backdrop.querySelector('#baja-cantidad');
  const errorEl = backdrop.querySelector('#baja-error');
  const infoEl = backdrop.querySelector('#baja-info');
  const destinoGroupWrap = backdrop.querySelector('#baja-destino-group');
  cantidadInput.focus({ preventScroll: true });
  cantidadInput.addEventListener('input', () => errorEl.classList.add('hidden'));

  function actualizarInfo() {
    if (origenSeleccionado === 'destino' && destinoSeleccionado) {
      const entrada = destinosConStock.find((d) => d.destino === destinoSeleccionado);
      infoEl.textContent = `Disponibles en ${destinoSeleccionado}: ${entrada ? entrada.cantidad : 0}`;
    } else {
      const disponible = origenSeleccionado === 'destino' ? resumen.enDestino : resumen.enOrigen;
      infoEl.textContent = `Disponibles ahí: ${disponible}`;
    }
  }
  actualizarInfo();

  const origenGroup = backdrop.querySelector('#baja-origen');
  if (origenGroup) {
    origenGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      origenGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      origenSeleccionado = chip.dataset.value;
      destinoGroupWrap.classList.toggle('hidden', !(origenSeleccionado === 'destino' && destinosConStock.length > 1));
      actualizarInfo();
    });
  }

  const destinoGroup = backdrop.querySelector('#baja-destino');
  if (destinoGroup) {
    destinoGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      destinoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      destinoSeleccionado = chip.dataset.value;
      actualizarInfo();
    });
  }

  backdrop.querySelector('#baja-motivo').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    const grupo = backdrop.querySelector('#baja-motivo');
    const yaSeleccionado = chip.classList.contains('selected');
    grupo.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    motivoSeleccionado = yaSeleccionado ? null : chip.dataset.value;
    if (motivoSeleccionado) chip.classList.add('selected');
  });

  backdrop.querySelector('#baja-guardar').addEventListener('click', async () => {
    const n = parseInt(cantidadInput.value, 10);
    if (origenSeleccionado === 'destino' && destinosConStock.length > 1 && !destinoSeleccionado) {
      errorEl.textContent = 'Elegí dónde ocurrió la baja.';
      errorEl.classList.remove('hidden');
      return;
    }
    const validacion = validarCantidadBaja(resumen, n, origenSeleccionado, destinoSeleccionado);
    if (!validacion.ok) {
      errorEl.textContent = validacion.mensaje;
      errorEl.classList.remove('hidden');
      return;
    }
    await DB.addEvento({
      cultivoId,
      tipo: 'baja',
      fecha: todayIsoDate(),
      cantidad: n,
      origen: origenSeleccionado,
      destino: origenSeleccionado === 'destino' ? destinoSeleccionado : null,
      motivo: motivoSeleccionado,
    });
    close();
    showToast('Baja registrada');
    onDone();
  });
}

// Alta retroactiva de datos de siembra para cultivos ya existentes que
// nunca cargaron cantidad (punto 30 del pedido) — nunca se asume ni se
// completa nada automáticamente.
function abrirModalAgregarSiembra(cultivo, onDone) {
  const esSemilla = cultivo.tipoInicio === 'semilla';
  let metodoSeleccionado = 'semillero';

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Agregar datos de siembra</h2>
      ${esSemilla ? `
      <div class="form-group">
        <label class="form-label">¿Cómo empezó?</label>
        <div class="chip-group" id="agregar-metodo">
          <div class="chip-option selected" data-value="semillero">Semillero</div>
          <div class="chip-option" data-value="directa">Siembra directa</div>
        </div>
      </div>` : ''}
      <div class="form-group">
        <label class="form-label">${esSemilla ? 'Unidades sembradas' : 'Cantidad inicial'}</label>
        <input type="number" id="agregar-cantidad" class="form-input" min="1" step="1" inputmode="numeric" placeholder="Ej: 20" />
      </div>
      <p class="siembra-modal-error hidden" id="agregar-error"></p>
      <button type="button" id="agregar-guardar" class="btn-primary">Guardar</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const metodoGroup = backdrop.querySelector('#agregar-metodo');
  if (metodoGroup) {
    metodoGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      metodoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      metodoSeleccionado = chip.dataset.value;
    });
  }

  const input = backdrop.querySelector('#agregar-cantidad');
  const errorEl = backdrop.querySelector('#agregar-error');
  input.focus({ preventScroll: true });
  input.addEventListener('input', () => errorEl.classList.add('hidden'));

  backdrop.querySelector('#agregar-guardar').addEventListener('click', async () => {
    const n = parseInt(input.value, 10);
    if (!Number.isFinite(n) || n <= 0) {
      errorEl.textContent = 'Ingresá una cantidad mayor a 0.';
      errorEl.classList.remove('hidden');
      return;
    }
    if (esSemilla) {
      await DB.updateCultivo(cultivo.id, { metodoSiembra: metodoSeleccionado });
    }
    // Igual que en el alta (nuevo.js): si el cultivo arranca como
    // "Trasplante", reusamos cultivo.ubicacion como destino inicial — sin
    // pedir un campo nuevo acá tampoco.
    const destinoInicial = cultivo.tipoInicio === 'trasplante' ? (cultivo.ubicacion || undefined) : undefined;
    const eventos = await DB.getEventosByCultivo(cultivo.id);
    const eventoSiembra = eventos.find((e) => e.tipo === 'siembra');
    if (eventoSiembra) {
      await DB.updateEvento(eventoSiembra.id, { cantidad: n, destino: destinoInicial });
    } else {
      await DB.addEvento({ cultivoId: cultivo.id, tipo: 'siembra', fecha: todayIsoDate(), cantidad: n, destino: destinoInicial });
    }
    close();
    showToast('Datos de siembra agregados 🌱');
    onDone();
  });
}

// Editar cultivo: corregir datos básicos sin tener que borrar y volver a
// crear (punto 7 del pedido). Especie/variedad/ubicación/fecha/nota siempre
// se pueden editar. El tipo de inicio (y, con él, el método de siembra)
// solo se puede tocar si el cultivo TODAVÍA no tiene ningún movimiento
// cuantitativo cargado (resumenSiembra.activo === false) — una vez que hay
// germinaciones/trasplantes/bajas/cantidad, cambiar el tipo silenciosamente
// podría volver incoherentes esos cálculos, así que se bloquea con aviso en
// vez de intentar reconstruir nada (prioridad: seguridad, no complejidad).
function abrirModalEditarCultivo(cultivo, resumenSiembra, onDone) {
  const bloqueado = !!(resumenSiembra && resumenSiembra.activo);
  let tipoSeleccionado = cultivo.tipoInicio;

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Editar cultivo</h2>
      <div class="form-group">
        <label class="form-label">Especie</label>
        <input type="text" id="edit-especie" class="form-input" value="${escapeHtml(cultivo.especie)}" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Variedad <span class="optional">(opcional)</span></label>
        <input type="text" id="edit-variedad" class="form-input" value="${escapeHtml(cultivo.variedad || '')}" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Tipo de inicio</label>
        <div class="chip-group${bloqueado ? ' chip-group-disabled' : ''}" id="edit-tipo-inicio">
          <div class="chip-option ${tipoSeleccionado === 'semilla' ? 'selected' : ''}" data-value="semilla">Semilla</div>
          <div class="chip-option ${tipoSeleccionado === 'plantin' ? 'selected' : ''}" data-value="plantin">Plantín</div>
          <div class="chip-option ${tipoSeleccionado === 'trasplante' ? 'selected' : ''}" data-value="trasplante">Trasplante</div>
        </div>
        ${bloqueado ? `<p class="siembra-modal-info">Este cultivo ya tiene movimientos registrados. Cambiar el tipo de inicio podría alterar su seguimiento cuantitativo.</p>` : ''}
      </div>
      <div class="form-group">
        <label class="form-label">Fecha de inicio</label>
        <input type="date" id="edit-fecha" class="form-input" value="${cultivo.fechaInicio || todayIsoDate()}" />
      </div>
      <div class="form-group">
        <label class="form-label">Ubicación <span class="optional">(opcional)</span></label>
        <input type="text" id="edit-ubicacion" class="form-input" value="${escapeHtml(cultivo.ubicacion || '')}" autocomplete="off" />
      </div>
      <div class="form-group">
        <label class="form-label">Nota <span class="optional">(opcional)</span></label>
        <textarea id="edit-nota" class="form-textarea">${escapeHtml(cultivo.nota || '')}</textarea>
      </div>
      <p class="siembra-modal-error hidden" id="edit-error"></p>
      <button type="button" id="edit-guardar" class="btn-primary">Guardar cambios</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const errorEl = backdrop.querySelector('#edit-error');
  const tipoGroup = backdrop.querySelector('#edit-tipo-inicio');
  if (!bloqueado) {
    tipoGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      tipoSeleccionado = chip.dataset.value;
    });
  }

  backdrop.querySelector('#edit-guardar').addEventListener('click', async () => {
    const especie = backdrop.querySelector('#edit-especie').value.trim();
    if (!especie) {
      errorEl.textContent = 'La especie no puede quedar vacía.';
      errorEl.classList.remove('hidden');
      return;
    }
    const fecha = backdrop.querySelector('#edit-fecha').value || cultivo.fechaInicio;
    const cambios = {
      especie,
      variedad: backdrop.querySelector('#edit-variedad').value.trim() || null,
      fechaInicio: fecha,
      ubicacion: backdrop.querySelector('#edit-ubicacion').value.trim() || null,
      nota: backdrop.querySelector('#edit-nota').value.trim() || null,
    };
    // El tipo de inicio (y el método que depende de él) solo se toca si no
    // estaba bloqueado — si estaba bloqueado, cultivo.tipoInicio/metodoSiembra
    // quedan exactamente como estaban, pase lo que pase con los chips.
    if (!bloqueado) cambios.tipoInicio = tipoSeleccionado;
    await DB.updateCultivo(cultivo.id, cambios);
    close();
    showToast('Cultivo actualizado');
    onDone();
  });
}

// Modal chico standalone para ofrecer un recordatorio de seguimiento
// (misma idea que mostrarSugerenciaRecordatorioEnModal, pero sin depender
// de un modal ya abierto — nuestros modales de cantidad ya se cerraron
// antes de ofrecer esto).
function abrirSugerenciaRecordatorioStandalone(cultivoId, sugerencia, onDone) {
  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <div class="sugerencia-evento">
        <div class="sugerencia-evento-icono">🌱</div>
        <div class="sugerencia-evento-texto">¿Querés que te recuerde<br /><strong>"${escapeHtml(sugerencia.titulo)}"</strong><br />en ${sugerencia.dias} días?</div>
        <div class="sugerencia-evento-botones">
          <button type="button" id="sugerencia-si" class="btn-primary">Sí, recordarme</button>
          <button type="button" id="sugerencia-no" class="btn-secondary">No, gracias</button>
        </div>
      </div>
    </div>
  `);
  function terminar() { close(); if (onDone) onDone(); }
  backdrop.querySelector('#modal-close').addEventListener('click', terminar);
  backdrop.querySelector('#sugerencia-no').addEventListener('click', terminar);
  backdrop.querySelector('#sugerencia-si').addEventListener('click', async () => {
    await DB.addRecordatorio({ cultivoId, titulo: sugerencia.titulo, fecha: sumarDiasFecha(todayIsoDate(), sugerencia.dias), estado: 'pendiente' });
    showToast('Recordatorio creado');
    terminar();
  });
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
// Si el cultivo tiene seguimiento cuantitativo activo y la oferta es de
// germinación o trasplante, en vez de crear un evento vacío abrimos el
// modal de cantidad correspondiente — así "¿Ya germinó?" -> "Sí" no
// registra un evento sin datos cuando ya se está llevando la cuenta.
// Devuelve true si intercepta la oferta (el llamador no debe hacer nada más).
function intentarAbrirCantidadPorOferta(oferta, cultivoId, resumen, onDone) {
  if (!resumen || !resumen.activo || oferta.tipo !== 'accion') return false;
  if (oferta.eventoTipo === 'germinacion' && !resumen.sinGerminacion && resumen.germinadas < resumen.sembradas) {
    abrirModalGerminacion(cultivoId, resumen, onDone);
    return true;
  }
  if (oferta.eventoTipo === 'trasplante' && resumen.enOrigen > 0) {
    abrirModalTrasplante(cultivoId, resumen, onDone);
    return true;
  }
  return false;
}

function mostrarOfertaEnItem(item, oferta, cultivoId, onDone, resumenSiembra) {
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
    if (intentarAbrirCantidadPorOferta(oferta, cultivoId, resumenSiembra, onDone)) {
      div.remove();
      item.classList.add('resuelto');
      return;
    }
    if (oferta.tipo === 'accion') {
      await DB.addEvento({ cultivoId, tipo: oferta.eventoTipo, fecha: todayIsoDate() });
      showToast('Evento registrado');
    } else {
      await DB.addRecordatorio({ cultivoId, titulo: oferta.titulo, fecha: sumarDiasFecha(todayIsoDate(), oferta.dias), estado: 'pendiente' });
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
            await DB.addRecordatorio({ cultivoId, titulo: oferta.titulo, fecha: sumarDiasFecha(todayIsoDate(), oferta.dias), estado: 'pendiente' });
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
    await DB.addRecordatorio({
      cultivoId,
      titulo: sugerencia.titulo,
      fecha: sumarDiasFecha(todayIsoDate(), sugerencia.dias),
      estado: 'pendiente',
    });
    showToast('Recordatorio creado');
    onDone();
  });
}

function openRecordatorioModal(cultivoId, onSaved) {
  const defaultDate = sumarDiasFecha(todayIsoDate(), 3);

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
        <input type="date" id="rec-fecha" class="form-input" value="${defaultDate}" />
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
