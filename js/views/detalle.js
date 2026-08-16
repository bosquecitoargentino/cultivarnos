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

  // Resumen central del cultivo (motor-resumen.js) — única fuente para el
  // bloque "Producción" de acá abajo y para "Ciclo completado" cuando el
  // cultivo está finalizado. Ninguno de los dos vuelve a sumar cosechas ni
  // a calcular días de seguimiento por su cuenta.
  const resumen = generarResumenCultivo(cultivo, eventos);

  // Integración con la Biblioteca agronómica: si la especie de este
  // cultivo está reconocida y tiene ficha cargada, ofrecemos un link
  // directo — nunca al revés, esta vista sigue siendo la única fuente del
  // historial real del cultivo. Si la especie no está en la Biblioteca
  // todavía, el resto de la ficha funciona exactamente igual que siempre
  // (sin este link).
  //
  // El matcher es buscarEspecieBibliotecaPorNombre() (motor-biblioteca.js),
  // que cubre las ~102 especies de la Biblioteca por id, nombre o alias
  // (Morrón↔Pimiento, Cilantro↔Coriandro, etc.) — un universo mucho más
  // amplio que identificarEspecie() (preguntas-cultivos.js), que solo
  // reconoce las ~28 especies del motor de preguntas interactivas y no se
  // toca acá. Si el nuevo matcher no encuentra nada, probamos igual con
  // identificarEspecie() como puente hacia atrás, por si el texto libre
  // cargado coincide con uno de esos alias pero no con ningún nombre/alias
  // de la Biblioteca (caso borde, no debería pasar para las especies ya
  // migradas, pero cuesta nada cubrirlo).
  const especieEnBiblioteca = (typeof buscarEspecieBibliotecaPorNombre === 'function' ? buscarEspecieBibliotecaPorNombre(cultivo.especie) : null)
    || (() => {
      const especieIdLegacy = typeof identificarEspecie === 'function' ? identificarEspecie(cultivo.especie) : null;
      return especieIdLegacy && typeof getEspecie === 'function' ? getEspecie(especieIdLegacy) : null;
    })();

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
        ${especieEnBiblioteca ? `<a href="#/biblioteca/${especieEnBiblioteca.id}" class="detalle-link-biblioteca">${renderIcon('biblioteca', { size: 16 })} Ver ficha de la especie</a>` : ''}
      </div>
    </div>

    <div class="detalle-actions">
      <button id="btn-add-evento">${renderIcon('registrar', { size: 18 })} Evento</button>
      <button id="btn-add-recordatorio">${renderIcon('recordatorio', { size: 18 })} Recordatorio</button>
      <button id="btn-editar-cultivo">${renderIcon('editar', { size: 18 })} Editar</button>
      <button id="btn-toggle-estado">${cultivo.estado === 'finalizado' ? '↩️ Reactivar' : `${renderIcon('ciclo', { size: 18 })} Finalizar`}</button>
    </div>

    ${cultivo.estado === 'finalizado' ? `<section id="ciclo-completado-section"></section>` : ''}

    <section id="siembra-section"></section>

    ${cultivo.estado !== 'finalizado' && resumen.cosechas ? `<section id="produccion-section"></section>` : ''}

    ${cultivo.estado !== 'finalizado' ? `
    <section>
      <div id="sugerencia-observacion"></div>
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
  // todavía no tiene datos cuantitativos cargados. Se omite en cultivos
  // finalizados: "Ciclo completado" (más arriba) ya muestra estos mismos
  // números de forma compacta, y seguir ofreciendo acciones que modifican
  // cantidades (＋Germinación/Trasplante/Baja) sobre un ciclo ya cerrado
  // no tendría sentido — reactivar es el camino correcto si hace falta
  // seguir cargando movimientos.
  const siembraWrap = root.querySelector('#siembra-section');
  if (cultivo.estado === 'finalizado') {
    siembraWrap.innerHTML = '';
  } else {
    pintarSeguimientoSiembra(siembraWrap, cultivo, resumenSiembra, () => renderDetalle(id, root));
  }

  // Ciclo completado (solo cultivos finalizados) / Producción (solo
  // activos con al menos una cosecha) — ambos leen exclusivamente del
  // mismo `resumen` central, nunca recalculan nada por su cuenta.
  const cicloWrap = root.querySelector('#ciclo-completado-section');
  if (cicloWrap) pintarCicloCompletado(cicloWrap, cultivo, resumen);
  const produccionWrap = root.querySelector('#produccion-section');
  if (produccionWrap) pintarProduccion(produccionWrap, resumen);

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

  // Recibir una sugerencia: motor local, sin IA — botón voluntario, nunca
  // protagonista de la pantalla. Un toque = una pregunta = una interacción
  // completa (ver pintarSugerenciaObservacion más abajo). "Registrar lo
  // que veo" refresca la ficha al guardar, para que la observación quede
  // en el Historial; "Otra sugerencia" nunca se encadena sola.
  const sugerenciaWrap = root.querySelector('#sugerencia-observacion');
  if (sugerenciaWrap) {
    pintarSugerenciaObservacion(sugerenciaWrap, cultivo, eventos, config, () => renderDetalle(id, root));
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
    if (cultivo.estado === 'finalizado') {
      // Reactivar es una acción simple y directa (punto 23 del pedido) — la
      // reflexión/motivo del cierre anterior NO se borra: sigue viva para
      // siempre en el evento 'finalizacion' ya escrito en el historial.
      // cultivo.motivoFinalizacion/notaFinalizacion representan únicamente
      // el cierre VIGENTE, así que se limpian acá; si se vuelve a finalizar
      // más adelante, se escribe un evento 'finalizacion' nuevo, sin perder
      // el anterior.
      await DB.updateCultivo(id, {
        estado: 'activo',
        fechaFinalizado: null,
        motivoFinalizacion: null,
        notaFinalizacion: null,
      });
      await DB.addEvento({ cultivoId: id, tipo: 'reactivacion', fecha: todayIsoDate() });
      showToast('Cultivo reactivado');
      renderDetalle(id, root);
      return;
    }
    abrirModalFinalizarCultivo(id, () => renderDetalle(id, root));
  });

  root.querySelector('#btn-eliminar').addEventListener('click', async () => {
    if (!window.confirm('Esto eliminará el cultivo y todo su historial. ¿Confirmás?')) return;
    await DB.deleteCultivoCompleto(id);
    showToast('Cultivo eliminado');
    navigate('#/cultivos');
  });
}

// Línea compacta de una cosecha en el historial: cantidad (sumada por
// magnitud compatible vía motor-cosecha.js, nunca fusionando unidades
// distintas) + de dónde salió, si se cargó. Una cosecha registrada solo
// con nota (sin mediciones) simplemente no agrega esta línea — sigue
// contando como cosecha igual (punto 3 del pedido).
function lineaCosechaParaEvento(ev) {
  if (ev.tipo !== 'cosecha') return null;
  const partes = [];
  if (ev.mediciones && ev.mediciones.length) {
    const sumado = sumarMedicionesCompatibles(ev.mediciones);
    if (sumado.length) partes.push(formatearListaMediciones(sumado));
  }
  if (ev.ubicacion) partes.push(`📍 ${ev.ubicacion}`);
  return partes.length ? partes.join(' · ') : null;
}

async function renderTimelineItem(ev, fotos, anotacionesSiembra, resumenSiembra) {
  const fotoUrl = await fotoUrlCache.getUrl(ev.fotoId);
  const fotoIndex = fotoUrl ? fotos.findIndex((f) => f.eventoId === ev.id) : -1;
  const lineaSiembra = anotacionesSiembra ? lineaSiembraParaEvento(ev, anotacionesSiembra, resumenSiembra) : null;
  const lineaCosecha = lineaCosechaParaEvento(ev);
  const motivoFinTxt = ev.tipo === 'finalizacion' && ev.motivo && typeof etiquetaMotivoFinalizacion === 'function'
    ? etiquetaMotivoFinalizacion(ev.motivo)
    : null;
  return `
    <div class="timeline-item">
      <div class="timeline-card">
        <div class="timeline-head">
          <span>${eventoIcon(ev.tipo)}</span>
          <span>${eventoLabel(ev.tipo)}</span>
          <span class="timeline-fecha">${formatFecha(ev.fecha)}</span>
        </div>
        ${lineaSiembra ? `<div class="timeline-siembra">${escapeHtml(lineaSiembra)}</div>` : ''}
        ${lineaCosecha ? `<div class="timeline-siembra">${escapeHtml(lineaCosecha)}</div>` : ''}
        ${motivoFinTxt ? `<div class="timeline-siembra">${escapeHtml(motivoFinTxt)}</div>` : ''}
        ${ev.preguntaContexto
          ? `<div class="timeline-pregunta-contexto">🌱 <em>${escapeHtml(ev.preguntaContexto)}</em></div>`
          : (ev.respuestas && ev.respuestas.length ? `
        <div class="timeline-respuestas">
          ${ev.respuestas.map((r) => `<div class="timeline-respuesta"><strong>${escapeHtml(r.etiqueta)}:</strong> ${escapeHtml(r.respuesta)}</div>`).join('')}
        </div>` : '')}
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

// ---------------------------------------------------------------------
// Producción — bloque compacto que aparece en la ficha ACTIVA en cuanto
// hay al menos una cosecha registrada (punto 9 del pedido), y nunca
// antes. Capa de presentación pura: toda la aritmética viene ya resuelta
// de `resumen.cosechas` (motor-resumen.js) — acá solo se pinta.
// ---------------------------------------------------------------------
function pintarProduccion(wrap, resumen) {
  const c = resumen.cosechas;
  if (!c) { wrap.innerHTML = ''; return; }

  const tiles = [{ valor: c.cantidad, label: c.cantidad === 1 ? 'cosecha' : 'cosechas' }];
  c.produccion.forEach((m) => tiles.push({ valor: formatearMedicion(m), label: '' }));

  const rangoFechas = c.primeraFecha && c.ultimaFecha && c.primeraFecha !== c.ultimaFecha
    ? `Primera cosecha: ${formatFechaCorta(c.primeraFecha)} · Última: ${formatFechaCorta(c.ultimaFecha)}`
    : (c.ultimaFecha ? `Cosechado el ${formatFechaCorta(c.ultimaFecha)}` : '');

  wrap.innerHTML = `
    <div class="siembra-card">
      <div class="siembra-card-titulo">Producción 🍅</div>
      <div class="siembra-tiles">
        ${tiles.map((t) => `
          <div class="siembra-tile">
            <div class="siembra-tile-valor">${escapeHtml(String(t.valor))}</div>
            ${t.label ? `<div class="siembra-tile-label">${escapeHtml(t.label)}</div>` : ''}
          </div>`).join('')}
      </div>
      ${rangoFechas ? `<p class="siembra-modal-info">${escapeHtml(rangoFechas)}</p>` : ''}
    </div>
  `;
}

// ---------------------------------------------------------------------
// Ciclo completado — al finalizar un cultivo, esto reemplaza "Qué
// observar ahora" como cabecera de la ficha (punto 12 del pedido). TODO
// lo que se muestra sale de `resumen` (motor-resumen.js) +
// `elegirIndicadoresCiclo` — ninguna cuenta nueva se hace acá.
// ---------------------------------------------------------------------
function pintarCicloCompletado(wrap, cultivo, resumen) {
  const inicio = formatFecha(resumen.fechaInicio);
  const fin = resumen.fechaFin ? formatFecha(resumen.fechaFin) : null;
  const diasTxt = resumen.diasSeguimiento != null ? `${resumen.diasSeguimiento} día${resumen.diasSeguimiento === 1 ? '' : 's'}` : null;

  const indicadores = elegirIndicadoresCiclo(resumen);
  const fin_ = resumen.finalizacion;

  wrap.innerHTML = `
    <div class="siembra-card">
      <div class="siembra-card-titulo">Ciclo completado 🌱</div>
      <p class="siembra-modal-info">${[fin ? `${inicio} → ${fin}` : inicio, diasTxt].filter(Boolean).join(' · ')}</p>
      ${fin_ && fin_.motivoLabel ? `<span class="badge finalizado">${escapeHtml(fin_.motivoLabel)}</span>` : ''}
      ${indicadores.length ? `
      <div class="detalle-badges" style="margin-top:10px;">
        ${indicadores.map((i) => `<span class="badge">${i.iconSvg ? renderIcon(i.iconSvg, { size: 14 }) : i.icon} ${escapeHtml(i.texto)}</span>`).join('')}
      </div>` : ''}
      ${fin_ && fin_.nota ? `
      <div class="detalle-nota" style="margin-top:10px;">
        <strong>Lo que me deja este cultivo</strong><br />${escapeHtml(fin_.nota)}
      </div>` : ''}
      <button type="button" id="btn-compartir-resumen" class="btn-secondary" style="margin-top:14px;">${renderIcon('compartir', { size: 18 })} Compartir resumen</button>
    </div>
  `;

  wrap.querySelector('#btn-compartir-resumen').addEventListener('click', () => abrirCompartirResumen(cultivo.id));
}

// ---------------------------------------------------------------------
// Finalizar cultivo — motivo + reflexión, ambos opcionales (punto 11 del
// pedido: "Finalizar" con todo vacío tiene que seguir funcionando). Se
// guarda SOLO lo que pertenece al cierre (cultivo.motivoFinalizacion/
// notaFinalizacion, punto 12: nunca una copia congelada de las métricas)
// más un evento 'finalizacion' permanente en el historial — así, si más
// adelante se reactiva y se vuelve a finalizar, cada cierre queda
// registrado sin pisar al anterior (punto 23 del pedido).
// ---------------------------------------------------------------------
function abrirModalFinalizarCultivo(cultivoId, onDone) {
  let motivoSeleccionado = null;

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Finalizar cultivo</h2>
      <div class="form-group">
        <label class="form-label">¿Por qué termina este seguimiento? <span class="optional">(opcional)</span></label>
        <div class="chip-group" id="fin-motivo">
          ${MOTIVOS_FINALIZACION.map((m) => `<div class="chip-option" data-value="${m.value}">${escapeHtml(m.label)}</div>`).join('')}
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">¿Qué te deja este cultivo? <span class="optional">(opcional)</span></label>
        <textarea id="fin-nota" class="form-textarea" placeholder="Un aprendizaje, algo para recordar la próxima..."></textarea>
      </div>
      <button type="button" id="fin-guardar" class="btn-primary">Finalizar cultivo</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  backdrop.querySelector('#fin-motivo').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    const grupo = backdrop.querySelector('#fin-motivo');
    const yaSeleccionado = chip.classList.contains('selected');
    grupo.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    motivoSeleccionado = yaSeleccionado ? null : chip.dataset.value;
    if (motivoSeleccionado) chip.classList.add('selected');
  });

  backdrop.querySelector('#fin-guardar').addEventListener('click', async () => {
    const nota = backdrop.querySelector('#fin-nota').value.trim() || null;
    await DB.updateCultivo(cultivoId, {
      estado: 'finalizado',
      fechaFinalizado: todayIsoDate(),
      motivoFinalizacion: motivoSeleccionado,
      notaFinalizacion: nota,
    });
    await DB.addEvento({ cultivoId, tipo: 'finalizacion', fecha: todayIsoDate(), motivo: motivoSeleccionado, nota });
    close();
    showToast('Cultivo finalizado 🌱');
    onDone();
  });
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
        <input type="text" id="edit-ubicacion" class="form-input" value="${escapeHtml(cultivo.ubicacion || '')}" autocomplete="off" list="edit-ubicacion-datalist" />
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

  if (typeof obtenerUbicacionesUsadas === 'function' && typeof datalistUbicacionesHtml === 'function') {
    obtenerUbicacionesUsadas().then((ubicaciones) => {
      if (!ubicaciones.length) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = datalistUbicacionesHtml('edit-ubicacion-datalist', ubicaciones);
      backdrop.appendChild(wrap.firstElementChild);
    });
  }

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
// Recibir una sugerencia — capa de presentación del motor de observación
// (motor-observacion.js#obtenerSugerenciaCultivo). A propósito NO es un
// cuestionario ni una sesión guiada: cada toque es una interacción
// completa y separada — un botón, una pregunta, listo. Nunca se encadena
// automáticamente a una siguiente pregunta (ni siquiera después de
// guardar una observación), y nunca se muestra "Pregunta 1 de N". Esta
// sección no contiene ninguna lógica agronómica propia: solo pinta lo que
// el motor decide.
// ---------------------------------------------------------------------

// wrap: contenedor de la sección. onDone: se llama cuando conviene
// refrescar la ficha completa (después de guardar una observación, para
// que quede reflejada en Historial).
function pintarSugerenciaObservacion(wrap, cultivo, eventos, config, onDone) {
  function pintarBoton() {
    wrap.innerHTML = `
      <button type="button" id="btn-recibir-sugerencia" class="link-ver-todas">🌱 Recibir una sugerencia</button>
    `;
    wrap.querySelector('#btn-recibir-sugerencia').addEventListener('click', () => mostrarSugerencia([]));
  }

  // excluirIds: ids a evitar en ESTE pedido puntual (se usa desde "Otra
  // sugerencia", para no repetir la que se acaba de mostrar). La memoria
  // entre visitas (cultivo.sugerenciasRecientes) la aplica el motor por su
  // cuenta — acá solo la persistimos cuando se muestra algo nuevo.
  async function mostrarSugerencia(excluirIds) {
    const sugerencia = obtenerSugerenciaCultivo(cultivo, eventos, new Date(), config.hemisferio, { excluirIds });
    if (!sugerencia) {
      pintarVacio();
      return;
    }

    // Guardamos un rastro corto (hasta 6 ids) para que la próxima vez que
    // se pida una sugerencia — hoy o en otra visita — el motor evite
    // repetir lo último mostrado (punto 8 y 25 del pedido: sin subsistema
    // nuevo, un campo más sobre el registro de cultivo que ya existía).
    const recientes = [sugerencia.idPregunta, ...(Array.isArray(cultivo.sugerenciasRecientes) ? cultivo.sugerenciasRecientes : [])].slice(0, 6);
    cultivo.sugerenciasRecientes = recientes;
    await DB.updateCultivo(cultivo.id, { sugerenciasRecientes: recientes });

    wrap.innerHTML = `
      <div class="sugerencia-card">
        <div class="sugerencia-titulo">Una cosa que podrías mirar 👀</div>
        <div class="sugerencia-pregunta">${escapeHtml(sugerencia.pregunta)}</div>
        <div class="sugerencia-botones">
          <button type="button" id="btn-registrar-sugerencia" class="btn-primary">Registrar lo que veo</button>
          <button type="button" id="btn-otra-sugerencia" class="link-ver-todas">Otra sugerencia</button>
        </div>
      </div>
    `;
    wrap.querySelector('#btn-registrar-sugerencia').addEventListener('click', () => {
      openEventoModal(cultivo.id, () => { if (onDone) onDone(); }, { pregunta: sugerencia });
    });
    wrap.querySelector('#btn-otra-sugerencia').addEventListener('click', () => {
      // Nunca auto-encadenada: es un toque explícito más, igual que el
      // primero. Evitamos repetir la que se acaba de mostrar sumándola a
      // la exclusión de este pedido puntual.
      mostrarSugerencia([sugerencia.idPregunta, ...excluirIds]);
    });
  }

  function pintarVacio() {
    wrap.innerHTML = `
      <div class="sugerencia-vacio">
        <p>Por ahora no tengo una sugerencia específica para este momento. Podés registrar libremente cualquier cambio que notes.</p>
        <button type="button" id="btn-registrar-libre" class="link-ver-todas">Registrar observación</button>
      </div>
    `;
    wrap.querySelector('#btn-registrar-libre').addEventListener('click', () => {
      openEventoModal(cultivo.id, () => { if (onDone) onDone(); });
    });
  }

  pintarBoton();
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

// Filas de medición dentro del modal de evento: arranca con UNA sola
// (punto 2 del pedido — nunca mostrar dos campos de entrada de una), y
// revela una segunda recién cuando la persona toca "+ Agregar otra
// medida" (para el caso real de "12 tomates + 1,8 kg" en la misma
// cosecha). Cantidad sigue siendo 100% opcional: una fila sin número
// cargado simplemente no se guarda como medición.
function renderMedicionRowHtml(index) {
  return `
    <div class="cosecha-medicion-row" data-row="${index}">
      <input type="text" inputmode="decimal" class="form-input cosecha-valor" placeholder="Ej: 1,8" />
      <select class="form-select cosecha-unidad">
        ${UNIDADES_COSECHA.map((u) => `<option value="${u.value}">${u.label}</option>`).join('')}
      </select>
      <input type="text" class="form-input cosecha-unidad-libre hidden" placeholder="¿Qué unidad? (ej: cajones)" autocomplete="off" />
    </div>
  `;
}

function wireMedicionRow(rowEl) {
  const unidadSelect = rowEl.querySelector('.cosecha-unidad');
  const libreInput = rowEl.querySelector('.cosecha-unidad-libre');
  unidadSelect.addEventListener('change', () => {
    libreInput.classList.toggle('hidden', unidadSelect.value !== 'otro');
  });
}

function parseValorCosechaInput(str) {
  if (!str) return null;
  const n = parseFloat(String(str).trim().replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// cultivoId, onSaved, opts.pregunta — cuando viene de "Recibir una
// sugerencia" (ver pintarSugerenciaObservacion), opts.pregunta es
// { idPregunta, pregunta, categoria, etapa, origen } (motor-observacion.js).
// En ese caso el modal se simplifica: sin selector de tipo (queda fijo en
// 'observacion'), con la pregunta visible como contexto, y el evento
// guardado queda etiquetado para que el motor sepa que esa pregunta ya
// tuvo una respuesta real (mismo mecanismo de cooldown/historial que ya
// existía, reutilizado — ver el comentario en el guardado más abajo).
function openEventoModal(cultivoId, onSaved, opts) {
  const pregunta = (opts && opts.pregunta) || null;
  let fotoBlob = null;
  let tipoSeleccionado = 'observacion';
  let cosechaInicializada = false;

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>${pregunta ? 'Registrar lo que veo' : 'Agregar evento'}</h2>
      ${pregunta ? `
      <div class="sugerencia-contexto">
        <div class="sugerencia-contexto-label">Pregunta que originó la observación</div>
        <div class="sugerencia-contexto-texto">${escapeHtml(pregunta.pregunta)}</div>
      </div>
      ` : `
      <div class="form-group">
        <label class="form-label">Tipo</label>
        <div class="chip-group" id="ev-tipo">
          ${EVENTO_TIPOS.filter((t) => t.value !== 'finalizacion' && t.value !== 'reactivacion').map((t) => `<div class="chip-option ${t.value === tipoSeleccionado ? 'selected' : ''}" data-value="${t.value}">${t.iconSvg ? renderIcon(t.iconSvg, { size: 16 }) : t.icon} ${t.label}</div>`).join('')}
        </div>
      </div>
      `}

      <div class="form-group hidden" id="ev-cosecha-section">
        <label class="form-label">¿Cuánto cosechaste? <span class="optional">(opcional)</span></label>
        <div id="ev-cosecha-mediciones"></div>
        <button type="button" id="ev-cosecha-agregar-medida" class="link-ver-todas">＋ Agregar otra medida</button>

        <label class="form-label" style="margin-top:14px;">¿De dónde cosechaste? <span class="optional">(opcional)</span></label>
        <div id="ev-cosecha-ubicacion-chips"></div>
        <input type="text" id="ev-cosecha-ubicacion" class="form-input" placeholder="Ej: Bancal 2" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input type="date" id="ev-fecha" class="form-input" value="${todayIsoDate()}" />
      </div>
      <div class="form-group">
        <label class="form-label">${pregunta ? '¿Qué estás viendo?' : 'Nota'} <span class="optional">(opcional)</span></label>
        <textarea id="ev-nota" class="form-textarea" placeholder="${pregunta ? 'Contá lo que notaste — no hace falta responder la pregunta exacta, cualquier cosa que veas sirve.' : 'Detalles...'}"></textarea>
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
      <button id="ev-guardar" class="btn-primary">${pregunta ? 'Registrar lo que veo' : 'Guardar evento'}</button>
    </div>
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);

  // La sección de cosecha (mediciones + ubicación) recién carga sus datos
  // (distribución actual, ubicaciones ya usadas) la primera vez que se
  // selecciona ese tipo — así elegir cualquier OTRO tipo de evento (el
  // caso más común) no paga ningún costo de lectura extra a IndexedDB, y
  // el modal sigue abriendo instantáneo (prioridad: registro en pocos
  // segundos).
  const cosechaSection = backdrop.querySelector('#ev-cosecha-section');
  const medicionesWrap = backdrop.querySelector('#ev-cosecha-mediciones');
  const agregarMedidaBtn = backdrop.querySelector('#ev-cosecha-agregar-medida');
  const ubicacionInput = backdrop.querySelector('#ev-cosecha-ubicacion');
  const ubicacionChipsWrap = backdrop.querySelector('#ev-cosecha-ubicacion-chips');

  async function inicializarCosechaSection() {
    if (cosechaInicializada) return;
    cosechaInicializada = true;

    medicionesWrap.innerHTML = renderMedicionRowHtml(0);
    wireMedicionRow(medicionesWrap.querySelector('[data-row="0"]'));
    agregarMedidaBtn.addEventListener('click', () => {
      const nuevaFila = document.createElement('div');
      nuevaFila.innerHTML = renderMedicionRowHtml(medicionesWrap.children.length);
      const filaEl = nuevaFila.firstElementChild;
      medicionesWrap.appendChild(filaEl);
      wireMedicionRow(filaEl);
      agregarMedidaBtn.classList.add('hidden');
    }, { once: true });

    const [cultivo, eventos, ubicacionesUsadas] = await Promise.all([
      DB.getCultivo(cultivoId),
      DB.getEventosByCultivo(cultivoId),
      typeof obtenerUbicacionesUsadas === 'function' ? obtenerUbicacionesUsadas() : Promise.resolve([]),
    ]);
    const distribucion = typeof obtenerDistribucionActual === 'function' ? obtenerDistribucionActual(cultivo, eventos) : [];
    const ubicacionesActuales = distribucion.map((d) => d.ubicacion).filter(Boolean);

    // Con un único lugar vigente, lo pre-cargamos directo (menos toques);
    // con varios, se ofrecen como chips rápidos arriba del campo de texto
    // (mismo patrón ya usado para destino de trasplante) sin perder la
    // posibilidad de escribir cualquier otro lugar a mano.
    if (ubicacionesActuales.length === 1) {
      ubicacionInput.value = ubicacionesActuales[0];
    } else if (ubicacionesActuales.length > 1) {
      ubicacionChipsWrap.innerHTML = `<div class="chip-group">${ubicacionesActuales.map((u) => `<div class="chip-option" data-value="${escapeHtml(u)}">${escapeHtml(u)}</div>`).join('')}</div>`;
      ubicacionChipsWrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.chip-option');
        if (!chip) return;
        ubicacionChipsWrap.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
        chip.classList.add('selected');
        ubicacionInput.value = chip.dataset.value;
      });
    }

    if (ubicacionesUsadas.length && typeof datalistUbicacionesHtml === 'function') {
      ubicacionInput.setAttribute('list', 'ev-cosecha-ubicacion-datalist');
      const datalistWrap = document.createElement('div');
      datalistWrap.innerHTML = datalistUbicacionesHtml('ev-cosecha-ubicacion-datalist', ubicacionesUsadas);
      backdrop.appendChild(datalistWrap.firstElementChild);
    }
  }

  // Cuando viene de una sugerencia (opts.pregunta) el chip-group #ev-tipo
  // ni siquiera se renderiza (ver template arriba) — el tipo queda fijo en
  // 'observacion' (o pasa a 'fotografia' automáticamente al agregar una
  // foto, más abajo), así que acá no hay nada que conectar.
  const tipoGroup = backdrop.querySelector('#ev-tipo');
  if (tipoGroup) {
    tipoGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
      chip.classList.add('selected');
      tipoSeleccionado = chip.dataset.value;
      cosechaSection.classList.toggle('hidden', tipoSeleccionado !== 'cosecha');
      if (tipoSeleccionado === 'cosecha') inicializarCosechaSection();
    });
  }

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
      if (tipoGroup) tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.toggle('selected', c.dataset.value === 'fotografia'));
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

    const eventoNuevo = {
      cultivoId,
      tipo: tipoSeleccionado,
      fecha,
      nota: nota || null,
      fotoId,
    };

    // Si esto vino de "Recibir una sugerencia", dejamos guardada la
    // pregunta que la originó (para que el historial se siga leyendo bien,
    // punto 14) y una respuesta sintética con valor 'Registrado' — no
    // reproduce ninguna opción real del banco de preguntas (que suelen ser
    // 'Sí'/'No'/etc.), así que nunca dispara resuelvePermanente por
    // accidente, pero sí arranca el cooldown normal porque
    // extraerRespuestasPrevias() (motor-observacion.js) lee
    // evento.respuestas sin filtrar por tipo de evento. Es decir: reusamos
    // el mecanismo de memoria que ya existía, sin tocarlo.
    if (pregunta) {
      eventoNuevo.preguntaContexto = pregunta.pregunta;
      eventoNuevo.respuestas = [
        { preguntaId: pregunta.idPregunta, etiqueta: pregunta.categoria || pregunta.pregunta, respuesta: 'Registrado' },
      ];
    }

    // Cosecha: la cantidad es 100% opcional (punto 3 del pedido) — una
    // fila sin número cargado no genera medición, y una cosecha sin
    // ninguna medición sigue siendo un evento válido (nunca "0 kg"). Cada
    // fila válida es {valor, unidad, unidadLibre?}; motor-cosecha.js es
    // quien después sabe sumarlas/mostrarlas — acá solo se recolectan tal
    // cual se cargaron.
    if (tipoSeleccionado === 'cosecha' && cosechaInicializada) {
      const mediciones = Array.from(medicionesWrap.querySelectorAll('.cosecha-medicion-row'))
        .map((row) => {
          const valor = parseValorCosechaInput(row.querySelector('.cosecha-valor').value);
          if (valor == null) return null;
          const unidad = row.querySelector('.cosecha-unidad').value;
          const unidadLibre = unidad === 'otro' ? (row.querySelector('.cosecha-unidad-libre').value.trim() || null) : undefined;
          return unidad === 'otro' ? { valor, unidad, unidadLibre } : { valor, unidad };
        })
        .filter(Boolean);
      eventoNuevo.mediciones = mediciones.length ? mediciones : null;
      eventoNuevo.ubicacion = ubicacionInput.value.trim() || null;
    }

    await DB.addEvento(eventoNuevo);

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
      showToast(pregunta ? 'Observación guardada' : 'Evento agregado');
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
