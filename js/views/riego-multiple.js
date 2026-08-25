// views/riego-multiple.js — "Riego múltiple": un mismo riego para varios
// cultivos a la vez, con un solo formulario. Nace de un problema de uso
// real: regar toda la huerta y tener que cargarlo cultivo por cultivo, uno
// por uno, es tan lento que termina no registrándose.
//
// NO reemplaza el riego individual — "Tomate → ＋ Evento → Riego" (ver
// views/detalle.js#openEventoModal) sigue funcionando exactamente igual
// que antes; 'riego' es simplemente un tipo de evento más en EVENTO_TIPOS
// (utils.js). Riego múltiple es solo un atajo para el caso de varios
// cultivos: internamente termina creando el mismo tipo de evento, uno por
// cultivo, todos en la MISMA transacción de IndexedDB
// (DB.addEventosMultiples) — o se guardan todos, o no se guarda ninguno,
// nunca un estado a medias.

async function openRiegoMultiple() {
  const cultivos = await DB.getAllCultivos();
  const activos = cultivos.filter((c) => c.estado === 'activo').sort((a, b) => a.especie.localeCompare(b.especie, 'es'));
  if (!activos.length) {
    showToast('Primero registrá un cultivo');
    return;
  }

  // Atajos por espacio (punto 5 del pedido, prioridad 3): solo si la
  // arquitectura actual ya lo resuelve limpio. obtenerEspaciosActuales()
  // (motor-espacios.js) ya agrupa exactamente así — se reutiliza tal
  // cual, sin ninguna estructura nueva. Un espacio de un solo cultivo no
  // sirve como atajo (no ahorra ningún toque frente a tocarlo directo en
  // la lista), así que se descarta.
  const espacios = typeof obtenerEspaciosActuales === 'function' ? await obtenerEspaciosActuales() : [];
  const espaciosUtiles = espacios.filter((e) => e.cultivos.length > 1);

  const seleccionados = new Set(); // cultivoId

  const itemsHtml = activos
    .map(
      (c) => `
        <button type="button" class="cultivo-select-item" data-id="${c.id}">
          <span class="cultivo-select-info">
            <span class="cultivo-select-especie">${escapeHtml(c.especie)}</span>
            ${c.variedad ? `<span class="cultivo-select-variedad">${escapeHtml(c.variedad)}</span>` : ''}
          </span>
          <span class="cultivo-select-check" aria-hidden="true"></span>
        </button>
      `
    )
    .join('');

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close" aria-label="Cerrar">✕</button></div>
      <h2>💧 Riego múltiple</h2>

      <div class="form-group">
        <label class="form-label">Fecha</label>
        <input type="date" id="rm-fecha" class="form-input" value="${todayIsoDate()}" max="${todayIsoDate()}" />
      </div>

      <div class="rm-seleccion-header">
        <span id="rm-contador">0 seleccionados</span>
        <button type="button" id="rm-todos" class="rm-todos-btn">Seleccionar todos</button>
      </div>

      ${espaciosUtiles.length ? `
      <div class="chip-group rm-espacios" id="rm-espacios">
        ${espaciosUtiles.map((e) => `<div class="chip-option" data-clave="${escapeHtml(e.clave)}">${escapeHtml(e.nombre)}</div>`).join('')}
      </div>
      ` : ''}

      <div class="cultivo-pick-list" id="rm-lista">${itemsHtml}</div>

      <div class="form-group">
        <label class="form-label">Nota <span class="optional">(opcional)</span></label>
        <textarea id="rm-nota" class="form-textarea" placeholder="Detalles..."></textarea>
      </div>

      <button id="rm-guardar" class="btn-primary">Guardar riego</button>
    </div>
  `);

  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const lista = backdrop.querySelector('#rm-lista');
  const contador = backdrop.querySelector('#rm-contador');
  const todosBtn = backdrop.querySelector('#rm-todos');
  const espaciosGroup = backdrop.querySelector('#rm-espacios');

  function actualizarContador() {
    const n = seleccionados.size;
    contador.textContent = n === 0 ? '0 seleccionados' : n === 1 ? '1 seleccionado' : `${n} seleccionados`;
    todosBtn.textContent = n === activos.length ? 'Deseleccionar todos' : 'Seleccionar todos';
  }

  function marcar(id, on) {
    const item = lista.querySelector(`.cultivo-select-item[data-id="${id}"]`);
    if (!item) return;
    if (on) {
      seleccionados.add(id);
      item.classList.add('selected');
    } else {
      seleccionados.delete(id);
      item.classList.remove('selected');
    }
  }

  // Los chips de espacio reflejan si TODOS sus cultivos están
  // seleccionados en este momento — se recalculan cada vez que cambia
  // cualquier selección (lista completa o por espacio), así nunca quedan
  // "marcados" a medias ni desincronizados de la lista real.
  function sincronizarChipsEspacio() {
    if (!espaciosGroup) return;
    espaciosGroup.querySelectorAll('.chip-option').forEach((chip) => {
      const espacio = espaciosUtiles.find((e) => e.clave === chip.dataset.clave);
      const todosDentro = espacio.cultivos.every((it) => seleccionados.has(it.cultivo.id));
      chip.classList.toggle('selected', todosDentro);
    });
  }

  lista.addEventListener('click', (e) => {
    const item = e.target.closest('.cultivo-select-item');
    if (!item) return;
    const id = Number(item.dataset.id);
    marcar(id, !seleccionados.has(id));
    actualizarContador();
    sincronizarChipsEspacio();
  });

  todosBtn.addEventListener('click', () => {
    const activarTodo = seleccionados.size !== activos.length;
    activos.forEach((c) => marcar(c.id, activarTodo));
    actualizarContador();
    sincronizarChipsEspacio();
  });

  if (espaciosGroup) {
    espaciosGroup.addEventListener('click', (e) => {
      const chip = e.target.closest('.chip-option');
      if (!chip) return;
      const espacio = espaciosUtiles.find((es) => es.clave === chip.dataset.clave);
      if (!espacio) return;
      // Mismo criterio "todo/nada" que "Seleccionar todos" general, pero
      // sobre el subconjunto de este espacio: si ya estaban todos
      // marcados, tocar de nuevo los desmarca.
      const yaTodos = espacio.cultivos.every((it) => seleccionados.has(it.cultivo.id));
      espacio.cultivos.forEach((it) => marcar(it.cultivo.id, !yaTodos));
      actualizarContador();
      sincronizarChipsEspacio();
    });
  }

  backdrop.querySelector('#rm-guardar').addEventListener('click', async () => {
    if (!seleccionados.size) {
      showToast('Elegí al menos un cultivo');
      return;
    }
    const fecha = backdrop.querySelector('#rm-fecha').value || todayIsoDate();
    // La fecha real la valida el navegador vía `max` (arriba) para el
    // caso normal, pero un valor manipulado igual no debe poder guardar
    // una fecha futura para "un riego ya realizado" (punto 7 del pedido).
    const fechaFinal = fecha > todayIsoDate() ? todayIsoDate() : fecha;
    const nota = backdrop.querySelector('#rm-nota').value.trim();
    const cultivoIds = Array.from(seleccionados);

    const guardarBtn = backdrop.querySelector('#rm-guardar');
    guardarBtn.disabled = true;
    guardarBtn.textContent = 'Guardando...';

    try {
      // batchId solo tiene sentido para agrupar 2 o más — un "riego
      // múltiple" de un solo cultivo es, en los hechos, un riego
      // individual (así se ve también en "Últimos movimientos", ver
      // motor-movimientos.js).
      const batchId = cultivoIds.length > 1 ? generarBatchId() : null;
      const eventosData = cultivoIds.map((cultivoId) => ({
        cultivoId,
        tipo: 'riego',
        fecha: fechaFinal,
        nota: nota || null,
        fotoId: null,
        ...(batchId ? { batchId } : {}),
      }));
      await DB.addEventosMultiples(eventosData);
      close();
      showToast(`Riego registrado en ${cultivoIds.length} cultivo${cultivoIds.length === 1 ? '' : 's'}`);
      router();
    } catch (err) {
      console.error(err);
      guardarBtn.disabled = false;
      guardarBtn.textContent = 'Guardar riego';
      showToast('No se pudo guardar el riego. Probá de nuevo.');
    }
  });
}
