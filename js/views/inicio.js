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

  // "Sugerencia para hoy": la mejor sugerencia entre TODOS los cultivos
  // activos (motor-observacion.js#getSugerenciaDestacada — nunca el
  // primer/último/random cultivo). Se calcula ACÁ, antes de armar el HTML,
  // por la misma razón que en detalle.js: si no hay ninguna, la sección
  // entera no existe (ni título ni nada), en vez de dejar un <section>
  // vacío o un texto de relleno genérico.
  const destacada = await getSugerenciaDestacada(activos, config.hemisferio);

  // Recordatorio de respaldo: solo tiene sentido si ya hay algo que
  // respaldar. Umbral mensual (ver utils.js#necesitaRespaldo). A propósito
  // sin botón de "ocultar": a diferencia de las sugerencias, esto sí es
  // intencionalmente un recordatorio (fue un pedido explícito, no algo que
  // deba desaparecer solo).
  const mostrarAvisoRespaldo = cultivos.length > 0 && necesitaRespaldo(config);

  // Deliberadamente NO hay ninguna señal acá sobre "hace cuánto no
  // observás" un cultivo, ni cuenta de observaciones pendientes: Inicio no
  // debe generar sensación de deuda. Los únicos recordatorios que se
  // asoman acá son los que la persona creó explícitamente (paraHoy) — la
  // observación en sí es siempre voluntaria y vive en la ficha de cada
  // cultivo. La sugerencia destacada de acá abajo sigue el mismo espíritu:
  // es algo que podría interesar mirar, nunca una tarea pendiente — por
  // eso no lleva badge, contador, ni color de alerta.
  let resumen;
  if (!cultivos.length) {
    resumen = 'Registrá tu primer cultivo para empezar';
  } else {
    const n = activos.length;
    const base = `${n} cultivo${n === 1 ? '' : 's'} activo${n === 1 ? '' : 's'}`;
    resumen = paraHoy.length
      ? `${base} · ${paraHoy.length} recordatorio${paraHoy.length === 1 ? '' : 's'}`
      : `${base} · Todo al día`;
  }

  // Los 5 bloques de contenido de Inicio (personalizables en orden y
  // visibilidad desde "Personalizar inicio" — ver motor-home-layout.js) se
  // resuelven ACÁ, ANTES de armar el HTML: así el orden final se puede
  // aplicar leyendo obtenerHomeLayout() sin ningún await pendiente después,
  // y de paso ninguna sección queda esperando un await con un `root` que
  // mientras tanto pudo haber sido reemplazado por otra pantalla.
  const cardsCultivosHtml = activos.length
    ? (await Promise.all(activos.slice(0, 6).map((c) => renderCultivoCardHtml(c)))).join('')
    : '';
  const movimientos = await getUltimosMovimientos(5);

  const bloquesHtml = {
    recordatorios: htmlBloqueRecordatorios(recordatorios, cultivos),
    cultivos: htmlBloqueCultivos(cultivos, activos, cardsCultivosHtml),
    sugerencia: htmlBloqueSugerenciaDestacada(destacada),
    movimientos: htmlBloqueMovimientos(movimientos),
    temporada: htmlBloqueTemporada(config),
  };

  const bloquesOrdenados = obtenerHomeLayout()
    .filter((b) => b.visible)
    .map((b) => bloquesHtml[b.id] || '')
    .join('');

  // Header, "acciones rápidas" y el aviso de respaldo son estructurales —
  // no forman parte de la personalización, siempre están (mismo criterio
  // que el header/la navegación de toda la app).
  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>Hola</h1>
      <p>${resumen}</p>
    </div>

    <section class="acciones-rapidas">
      <button id="btn-obs-principal" class="btn-primary btn-obs-principal">${renderIcon('observacion', { scale: 'sm' })} Registrar observación</button>
      <a href="#/nuevo" class="link-nuevo-cultivo">＋ Nuevo cultivo</a>
    </section>

    ${mostrarAvisoRespaldo ? `
    <section>
      <div class="temporada-prompt">
        <span>${config.ultimoRespaldo ? 'Hace más de un mes que no hacés un respaldo.' : 'Todavía no hiciste un respaldo de tus datos.'}</span>
        <button type="button" id="btn-respaldo-inicio" class="link-small">Hacer respaldo</button>
      </div>
    </section>` : ''}

    ${bloquesOrdenados}
  `;

  // A partir de acá ya no hay ningún await: todo el contenido ya está en
  // el DOM, así que estos querySelector solo pueden devolver null porque el
  // bloque correspondiente está oculto por elección de la persona — no por
  // una carrera con otra navegación (esa clase de bug ya no puede pasar acá
  // desde que se resuelven los bloques antes de tocar el DOM).

  const recList = root.querySelector('#recordatorios-list');
  if (recList) {
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
        await DB.updateRecordatorio(id, { fecha: sumarDiasFecha(rec.fecha, 3) });
        showToast('Recordatorio pospuesto 3 días');
        renderInicio(root);
      }
    });
  }

  root.querySelectorAll('#activos-list .cultivo-card').forEach((card) => {
    card.addEventListener('click', () => navigate(`#/cultivo/${card.dataset.id}`));
  });

  // "Ver cultivo" de la sugerencia destacada: no existe (ni se crea acá)
  // ninguna pantalla nueva de "sugerencias" — abre directamente la ficha.
  root.querySelector('#btn-ver-cultivo-destacado')?.addEventListener('click', (e) => {
    navigate(`#/cultivo/${e.currentTarget.dataset.cultivoId}`);
  });

  // Un movimiento agrupado (riego múltiple, ver views/riego-multiple.js) no
  // tiene una única ficha a la que llevar — abre "Mis cultivos", el destino
  // existente más natural. Un movimiento individual abre la ficha del
  // cultivo, como cualquier otro acceso a un cultivo en la app.
  root.querySelectorAll('#movimientos-list .movimiento-item').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.batch) navigate('#/cultivos');
      else navigate(`#/cultivo/${btn.dataset.cultivoId}`);
    });
  });

  root.querySelector('#btn-obs-principal')?.addEventListener('click', () => {
    openObservacionRapida(cultivos);
  });

  const btnRespaldo = root.querySelector('#btn-respaldo-inicio');
  if (btnRespaldo) {
    btnRespaldo.addEventListener('click', async () => {
      btnRespaldo.disabled = true;
      try {
        await exportarRespaldo();
        showToast('Respaldo exportado');
        renderInicio(root);
      } catch (err) {
        console.error(err);
        showToast('Error al exportar');
        btnRespaldo.disabled = false;
      }
    });
  }
}

// ---------------------------------------------------------------------
// Bloques de Inicio — cada función arma el HTML completo de un bloque
// (incluida su propia <section>, título y estado vacío si corresponde) sin
// tocar el DOM. renderInicio() los intercala según el orden/visibilidad
// guardado en motor-home-layout.js. El contenido/comportamiento de cada
// bloque es exactamente el mismo que tenían antes de esta funcionalidad —
// esto es un reordenamiento del código existente, no un cambio de lógica.
// ---------------------------------------------------------------------

function htmlBloqueRecordatorios(recordatorios, cultivos) {
  if (!recordatorios.length) {
    return `<section><p class="recordatorios-vacio">Sin recordatorios para hoy</p></section>`;
  }
  const cultivoPorId = new Map(cultivos.map((c) => [c.id, c]));
  const itemsHtml = recordatorios
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
  return `
    <section>
      <div class="section-title">Recordatorios</div>
      <div id="recordatorios-list">${itemsHtml}</div>
    </section>
  `;
}

function htmlBloqueCultivos(cultivos, activos, cardsHtml) {
  const contenido = activos.length
    ? `<div class="cultivos-grid">${cardsHtml}</div>`
    : `<div class="empty-state">${renderIcon('cultivos', { scale: 'xl', className: 'icon-bloque' })}Todavía no registraste cultivos.</div>`;
  return `
    <section>
      <div class="section-title">
        Tus cultivos
        ${cultivos.length ? '<a href="#/cultivos" class="link-small">Ver todos</a>' : ''}
      </div>
      <div id="activos-list">${contenido}</div>
    </section>
  `;
}

function htmlBloqueSugerenciaDestacada(destacada) {
  if (!destacada) return '';
  return `
    <section>
      <div class="section-title">Sugerencia para hoy</div>
      <div id="sugerencia-destacada">
        <div class="sugerencia-card sugerencia-destacada">
          <div class="sugerencia-destacada-cultivo">${escapeHtml(destacada.cultivoNombre)}</div>
          <div class="sugerencia-pregunta">${escapeHtml(destacada.pregunta)}</div>
          <button type="button" id="btn-ver-cultivo-destacado" class="btn-secondary" data-cultivo-id="${destacada.cultivoId}">Ver cultivo</button>
        </div>
      </div>
    </section>
  `;
}

function htmlBloqueMovimientos(movimientos) {
  const contenido = !movimientos.length
    ? `<p class="movimientos-vacio">Todavía no hay movimientos registrados.</p>`
    : movimientos
        .map((m) => {
          const icono = eventoIcon(m.tipo);
          if (m.batch) {
            return `
              <button type="button" class="movimiento-item" data-batch="1">
                <span class="movimiento-icono">${icono}</span>
                <span class="movimiento-info">
                  <span class="movimiento-titulo">${escapeHtml(eventoLabel(m.tipo))} · ${m.count} cultivos</span>
                  <span class="movimiento-sub">${textoRelativo(m.fecha)}</span>
                </span>
              </button>
            `;
          }
          return `
            <button type="button" class="movimiento-item" data-cultivo-id="${m.cultivoId}">
              <span class="movimiento-icono">${icono}</span>
              <span class="movimiento-info">
                <span class="movimiento-titulo">${escapeHtml(m.cultivoNombre)}</span>
                <span class="movimiento-sub">${escapeHtml(eventoLabel(m.tipo))} · ${textoRelativo(m.fecha)}</span>
              </span>
            </button>
          `;
        })
        .join('');
  return `
    <section>
      <div class="section-title">Últimos movimientos</div>
      <div id="movimientos-list">${contenido}</div>
    </section>
  `;
}

function htmlBloqueTemporada(config) {
  if (!config.hemisferio) {
    return `
      <section>
        <div class="section-title">${renderIcon('siembra', { scale: 'xs' })} Esta temporada</div>
        <div class="temporada-prompt">
          <span>Configurá tu hemisferio para ver qué podés sembrar ahora.</span>
          <a href="#/configuracion" class="link-small">Configurar</a>
        </div>
      </section>
    `;
  }
  const mesActual = new Date().getMonth() + 1;
  const recomendaciones = obtenerRecomendacionesTemporada(config.hemisferio, mesActual);
  if (!recomendaciones.length) {
    return `
      <section>
        <div class="section-title">${renderIcon('siembra', { scale: 'xs' })} Esta temporada</div>
        <p class="fotos-vacio">Este mes no hay siembras típicas para arrancar.</p>
        <a href="#/calendario" class="link-ver-todas">Ver calendario →</a>
      </section>
    `;
  }
  return `
    <section>
      <div class="section-title">${renderIcon('siembra', { scale: 'xs' })} Esta temporada</div>
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
    </section>
  `;
}

// ---------------------------------------------------------------------
// "Personalizar inicio": reordenar (↑/↓) y mostrar/ocultar los bloques de
// arriba. Nunca borra datos — solo cambia qué se ve primero en Inicio y en
// qué orden (ver motor-home-layout.js). Cada cambio se guarda al toque y
// se refleja de inmediato si la persona vuelve a Inicio; no hace falta un
// botón "Guardar" porque cada acción ya es, en sí misma, el cambio
// completo (mover uno o togglear uno), así que persistir al instante es
// tan simple como esperar a un guardado explícito, pero con menos pasos.
// ---------------------------------------------------------------------

function abrirPersonalizarInicio() {
  function pintarFilas() {
    const layout = obtenerHomeLayout();
    return layout
      .map((b, i) => {
        const primero = i === 0;
        const ultimo = i === layout.length - 1;
        return `
          <div class="home-layout-row" data-id="${b.id}">
            <div class="home-layout-mover">
              <button type="button" class="home-layout-flecha" data-move="up" data-id="${b.id}" ${primero ? 'disabled' : ''} aria-label="Subir">↑</button>
              <button type="button" class="home-layout-flecha" data-move="down" data-id="${b.id}" ${ultimo ? 'disabled' : ''} aria-label="Bajar">↓</button>
            </div>
            <label class="home-layout-label checkbox-row">
              <input type="checkbox" class="home-layout-check" data-id="${b.id}" ${b.visible ? 'checked' : ''} />
              ${escapeHtml(etiquetaBloqueHome(b.id))}
            </label>
          </div>
        `;
      })
      .join('');
  }

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
      <h2>Personalizar inicio</h2>
      <div class="home-layout-list" id="home-layout-list">${pintarFilas()}</div>
      <button type="button" id="btn-restaurar-home" class="link-small home-layout-restaurar">Restaurar inicio predeterminado</button>
    </div>
  `);

  const sheet = backdrop.querySelector('.modal-sheet');

  // El cambio se guarda al toque (guardarHomeLayout/restaurarHomeLayoutPorDefecto
  // dentro de cada handler de abajo), pero volver a pintar Inicio recién
  // cuando el modal se cierra — no en cada toque de ↑/↓/checkbox mientras
  // sigue abierto. Inicio queda tapado por el modal de todos modos, así que
  // no hay necesidad de re-renderizarlo de fondo en cada micro-cambio; y
  // evitarlo también evita re-computar la sugerencia destacada más seguido
  // de lo necesario (ver motor-observacion.js#getSugerenciaDestacada, que
  // no se toca acá). El requisito de "se aplica de inmediato al volver a
  // Inicio" queda cubierto porque cerrar el modal siempre pasa por acá.
  function cerrarYActualizar() {
    close();
    router();
  }
  sheet.querySelector('#modal-close').addEventListener('click', cerrarYActualizar);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) router();
  });

  function refrescarLista() {
    sheet.querySelector('#home-layout-list').innerHTML = pintarFilas();
  }

  sheet.querySelector('#home-layout-list').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-move]');
    if (!btn || btn.disabled) return;
    const layout = obtenerHomeLayout();
    const idx = layout.findIndex((b) => b.id === btn.dataset.id);
    if (idx === -1) return;
    const destino = btn.dataset.move === 'up' ? idx - 1 : idx + 1;
    if (destino < 0 || destino >= layout.length) return;
    [layout[idx], layout[destino]] = [layout[destino], layout[idx]];
    guardarHomeLayout(layout);
    refrescarLista();
  });

  sheet.querySelector('#home-layout-list').addEventListener('change', (e) => {
    const check = e.target.closest('.home-layout-check');
    if (!check) return;
    const layout = obtenerHomeLayout();
    const entrada = layout.find((b) => b.id === check.dataset.id);
    if (!entrada) return;
    entrada.visible = check.checked;
    guardarHomeLayout(layout);
    refrescarLista();
  });

  sheet.querySelector('#btn-restaurar-home').addEventListener('click', () => {
    if (!window.confirm('¿Restaurar el Inicio original?')) return;
    restaurarHomeLayoutPorDefecto();
    refrescarLista();
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
          <span class="cultivo-pick-thumb" style="${fotoUrl ? `background-image:url('${fotoUrl}')` : ''}">${fotoUrl ? '' : renderIcon('cultivos', { scale: 'xl' })}</span>
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
      <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
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
    <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
    <h2>${escapeHtml(especieLabel)}</h2>
    <div class="form-group">
      <div class="photo-picker-compacta" id="obs-photo-picker" role="button" tabindex="0" aria-label="Tomar foto">
        <span class="ppc-thumb" id="obs-photo-thumb">${renderIcon('foto', { scale: 'lg' })}</span>
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
    photoThumb.innerHTML = renderIcon('foto', { scale: 'lg' });
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
