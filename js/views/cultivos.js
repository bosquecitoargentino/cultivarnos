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
    // verdad" nada más que esta lista.
    const ordenados = ordenarCultivosSegunPreferencia(filtered);
    const cards = await Promise.all(ordenados.map((c) => renderCultivoCardHtml(c)));
    const mostrarAyuda = filtered.length > 1 && !yaVioAyudaOrdenCultivos();
    list.innerHTML = `
      ${mostrarAyuda ? `<p class="cultivos-ayuda-orden">Mantené presionado un cultivo para moverlo</p>` : ''}
      <div class="cultivos-grid">${cards.join('')}</div>
    `;

    const grid = list.querySelector('.cultivos-grid');
    habilitarArrastreCultivos(grid, cultivos, () => {
      if (!yaVioAyudaOrdenCultivos()) {
        marcarAyudaOrdenCultivosVista();
        list.querySelector('.cultivos-ayuda-orden')?.remove();
      }
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

// ---------------------------------------------------------------------
// Mantener presionado + arrastrar para reordenar (Mis cultivos). Un único
// flujo de Pointer Events (pointerdown/pointermove/pointerup/
// pointercancel) — no se mezcla con touchstart/touchmove, mouse events
// por separado, ni con HTML5 Drag & Drop. Toda la tarjeta sirve tanto
// para abrir la ficha (toque normal) como para reordenar (mantener
// presionado ~900ms). Antes de cumplirse ese tiempo, cualquier
// movimiento se interpreta como el inicio de scroll — no como un
// arrastre — así nunca compite con desplazarse por la lista.
//
// Nota importante sobre touch-action (causa confirmada de que el drag se
// cortara solo en iPhone real): en iOS/Safari, el valor de touch-action
// que rige un toque queda fijado desde el pointerdown/touchstart — un
// cambio hecho por JS a mitad de gesto (por ejemplo, recién al activarse
// el arrastre) NO se aplica de forma confiable a ese mismo toque. Es una
// limitación reconocida del propio estándar (ver
// https://github.com/w3c/pointerevents/issues/178: "touch-action cannot
// be modified after pointerdown but before sufficient movement triggers
// scrolling"). Con "touch-action: pan-y" fijo desde el principio, el
// primer movimiento real después de activar el arrastre podía ser
// reclamado por el scroll nativo del navegador ANTES de que nuestro
// preventDefault() llegara a correr — eso es lo que se veía como "la
// tarjeta se levanta pero al mover el dedo no acompaña y se suelta casi
// enseguida": el navegador tomaba el gesto como scroll y mandaba
// pointercancel.
//
// Por eso acá .cultivo-card usa "touch-action: none" FIJO desde siempre
// (ver css/styles.css), y el scroll de antes de activar el arrastre lo
// manejamos nosotros a mano (más abajo, "modo scroll manual") en vez de
// depender de que el navegador lo haga. Así no hay ninguna mutación de
// touch-action a mitad de gesto de la que depender.
// ---------------------------------------------------------------------

function habilitarArrastreCultivos(grid, todosLosCultivos, onReordenado) {
  // Temporal — ver validación en iPhone real. Deja un rastro corto en la
  // consola de cada paso del gesto (pointerdown, activación del hold,
  // setPointerCapture, modo scroll manual, pointerup, pointercancel) para
  // confirmar en qué punto se corta si algo todavía falla. Sacar una vez
  // confirmado que el arrastre funciona bien en el dispositivo real.
  const DEBUG_DRAG = true;
  const log = (...args) => { if (DEBUG_DRAG) console.log('[arrastre-cultivos]', ...args); };

  const UMBRAL_MOVIMIENTO = 10; // px — cualquier movimiento antes del hold es scroll, no drag
  const DEMORA_HOLD = 900; // ms — "mantener presionado ~1 segundo"
  const MARGEN_ARRIBA = 70; // px, despeja el header fijo
  const MARGEN_ABAJO = 100; // px, despeja el nav inferior fijo
  const MARGEN_LATERAL = 4; // px, despeja los bordes de la pantalla
  const VELOCIDAD_AUTOSCROLL = 12; // px por frame, cerca del borde

  let drag = null;

  // Capas extra, acotadas solo a las tarjetas (nunca globales), contra el
  // menú/selección nativo de iOS durante el mantener presionado — además
  // de la clase cultivo-card-sujetando (ver más abajo).
  grid.addEventListener('contextmenu', (e) => {
    if (e.target.closest('.cultivo-card')) e.preventDefault();
  });
  grid.addEventListener('dragstart', (e) => {
    if (e.target.closest('.cultivo-card')) e.preventDefault();
  });

  grid.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    // Si en el futuro una tarjeta tiene botones/links propios adentro, no
    // arrancar un arrastre desde ahí — no interferir con esa acción.
    if (e.target.closest('button, a, [data-no-drag]')) return;
    const card = e.target.closest('.cultivo-card');
    if (!card) return;
    prepararPosibleGesto(e, card);
  });

  function prepararPosibleGesto(eInicial, card) {
    const pointerId = eInicial.pointerId;
    const xInicial = eInicial.clientX;
    const yInicial = eInicial.clientY;
    let activado = false;
    let cancelado = false;
    // "Modo scroll manual": como .cultivo-card tiene touch-action: none
    // fijo (ver comentario arriba), el navegador nunca va a scrollear por
    // su cuenta cuando el toque empieza sobre una tarjeta — así que si el
    // movimiento antes del hold indica que la persona quiere scrollear,
    // lo hacemos nosotros mismos con window.scrollBy, tomando la
    // diferencia entre cada muestra de Y.
    let modoScrollManual = false;
    let ultimoYScroll = yInicial;

    log('pointerdown', { pointerId, pointerType: eInicial.pointerType });
    // Se agrega ni bien empieza el toque, no recién al activar el arrastre
    // — así, si el hold se cumple, iOS ya no tiene ventana de tiempo para
    // haber arrancado su propia selección de texto. Se saca en TODOS los
    // caminos de salida (cancelado por scroll, toque normal, o fin de
    // arrastre) — nunca queda "pegada" en una tarjeta en reposo.
    card.classList.add('cultivo-card-sujetando');

    const timer = setTimeout(() => {
      if (!cancelado) activar();
    }, DEMORA_HOLD);

    function activar() {
      if (activado || cancelado) return;
      activado = true;
      log('longpress activated');
      // Red de seguridad, no el mecanismo principal: si iOS ya alcanzó a
      // marcar una selección antes de que se cumpliera el hold, se limpia
      // acá. La prevención real es la clase de arriba + setPointerCapture.
      try { window.getSelection()?.removeAllRanges(); } catch (err) { /* no-op */ }
      if (card.setPointerCapture) {
        try {
          card.setPointerCapture(pointerId);
          log('setPointerCapture ok');
        } catch (err) {
          log('setPointerCapture error', err && err.message);
        }
      }
      // Haptic opcional — no todos los navegadores lo tienen (iOS Safari
      // no), y no hace falta: si no existe, esto simplemente no hace nada.
      if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch (err) { /* no-op */ }
      }
      comenzarArrastre(card, xInicial, yInicial, pointerId);
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      if (activado) {
        if (drag) {
          drag.ultimoClientX = e.clientX;
          drag.ultimoClientY = e.clientY;
        }
        // Ya estamos arrastrando: no dejar que el navegador interprete
        // este mismo gesto como scroll o selección. Con touch-action:
        // none puesto desde siempre esto ya no debería hacer falta para
        // evitar el scroll nativo, pero se deja como red de seguridad.
        e.preventDefault();
        return;
      }
      if (modoScrollManual) {
        window.scrollBy(0, ultimoYScroll - e.clientY);
        ultimoYScroll = e.clientY;
        e.preventDefault();
        return;
      }
      const dx = e.clientX - xInicial;
      const dy = e.clientY - yInicial;
      if (Math.abs(dx) > UMBRAL_MOVIMIENTO || Math.abs(dy) > UMBRAL_MOVIMIENTO) {
        // Antes de cumplirse el hold, cualquier movimiento es scroll, no
        // el comienzo de un arrastre: se cancela el hold y, a partir de
        // acá, el scroll de la página lo manejamos nosotros a mano (ver
        // "modo scroll manual" arriba) — el navegador no lo va a hacer
        // solo porque la tarjeta tiene touch-action: none.
        log('cancelado por movimiento -> modo scroll manual');
        cancelado = true;
        clearTimeout(timer);
        card.classList.remove('cultivo-card-sujetando');
        modoScrollManual = true;
        ultimoYScroll = e.clientY;
      }
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      log('pointerup', { activado, cancelado, modoScrollManual });
      clearTimeout(timer);
      quitarListeners();
      if (activado) {
        finalizarArrastre();
      } else if (!modoScrollManual) {
        card.classList.remove('cultivo-card-sujetando');
        if (!cancelado) {
          // Toque normal (sin mantener, sin moverse): abre la ficha, como
          // siempre.
          navigate(`#/cultivo/${card.dataset.id}`);
        }
      }
    }

    function onCancel(e) {
      if (e.pointerId !== pointerId) return;
      log('pointercancel', { activado, cancelado, modoScrollManual });
      clearTimeout(timer);
      quitarListeners();
      // Limpiar el estado sin romper la lista, sea cual sea el momento en
      // que Safari haya disparado el cancel.
      if (activado) finalizarArrastre();
      else card.classList.remove('cultivo-card-sujetando');
    }

    function quitarListeners() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    }

    document.addEventListener('pointermove', onMove, { passive: false });
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  function comenzarArrastre(card, clientX, clientY, pointerId) {
    const rect = card.getBoundingClientRect();

    const placeholder = document.createElement('div');
    placeholder.className = 'cultivo-card-placeholder';
    placeholder.style.height = rect.height + 'px';
    card.parentNode.insertBefore(placeholder, card);

    card.classList.add('cultivo-card-arrastrando');
    card.style.position = 'fixed';
    card.style.left = rect.left + 'px';
    card.style.top = rect.top + 'px';
    card.style.width = rect.width + 'px';
    card.style.height = rect.height + 'px';
    card.style.margin = '0';
    card.style.transform = 'translate3d(0px, 0px, 0) scale(1.01)';

    drag = {
      card,
      placeholder,
      pointerId,
      rectLeft: rect.left,
      rectTop: rect.top,
      ancho: rect.width,
      altura: rect.height,
      offsetDentroX: clientX - rect.left,
      offsetDentroY: clientY - rect.top,
      ultimoClientX: clientX,
      ultimoClientY: clientY,
      rafId: null,
    };
    drag.rafId = requestAnimationFrame(paso);
  }

  function paso() {
    if (!drag) return;
    posicionarYReordenar(drag.ultimoClientX, drag.ultimoClientY);
    autoScroll(drag.ultimoClientY);
    drag.rafId = requestAnimationFrame(paso);
  }

  // Arrastre libre en X e Y: la tarjeta sigue al dedo/puntero en ambos
  // ejes (translate3d, sin tocar layout). El reordenamiento se decide con
  // un hit-test 2D — el vecino más cercano por distancia entre centros,
  // no un umbral vertical rígido — así funciona tanto en una lista de una
  // columna como en la grilla de 2 columnas real de "Mis cultivos".
  function posicionarYReordenar(clientX, clientY) {
    const minLeft = MARGEN_LATERAL;
    const maxLeft = Math.max(minLeft, window.innerWidth - MARGEN_LATERAL - drag.ancho);
    const left = Math.min(Math.max(clientX - drag.offsetDentroX, minLeft), maxLeft);

    const minTop = MARGEN_ARRIBA;
    const maxTop = Math.max(minTop, window.innerHeight - MARGEN_ABAJO - drag.altura);
    const top = Math.min(Math.max(clientY - drag.offsetDentroY, minTop), maxTop);

    const dx = left - drag.rectLeft;
    const dy = top - drag.rectTop;
    drag.card.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.01)`;

    const cx = left + drag.ancho / 2;
    const cy = top + drag.altura / 2;

    const cards = Array.from(grid.querySelectorAll('.cultivo-card:not(.cultivo-card-arrastrando)'));
    if (!cards.length) return;

    let vecino = null;
    let vecinoRect = null;
    let mejorDistancia = Infinity;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      const ccx = r.left + r.width / 2;
      const ccy = r.top + r.height / 2;
      const distancia = (cx - ccx) ** 2 + (cy - ccy) ** 2;
      if (distancia < mejorDistancia) {
        mejorDistancia = distancia;
        vecino = c;
        vecinoRect = r;
      }
    }
    if (!vecino) return;

    // ¿Antes o después del vecino más cercano? Primero se compara la fila
    // (con un margen dinámico = mitad de la altura del propio vecino, no
    // un número fijo), y solo si están en la misma fila se compara la
    // columna — así se generaliza a 1 columna (la comparación de columna
    // nunca importa) y a la grilla de 2 columnas real de la app.
    const epsilonFila = vecinoRect.height / 2;
    const vecinoCy = vecinoRect.top + vecinoRect.height / 2;
    const vecinoCx = vecinoRect.left + vecinoRect.width / 2;
    let antesDelVecino;
    if (Math.abs(cy - vecinoCy) > epsilonFila) {
      antesDelVecino = cy < vecinoCy;
    } else {
      antesDelVecino = cx < vecinoCx;
    }
    const destino = antesDelVecino ? vecino : vecino.nextElementSibling;

    const siguienteActual = drag.placeholder.nextElementSibling;
    if (destino !== siguienteActual && destino !== drag.placeholder) {
      animarReacomodo(cards, () => {
        if (destino) grid.insertBefore(drag.placeholder, destino);
        else grid.appendChild(drag.placeholder);
      });
    }
  }

  // FLIP chico, igual criterio que Personalizar inicio, pero ahora en 2D:
  // en vez de que las tarjetas "salten" al nuevo lugar, se animan desde
  // donde estaban hasta donde quedan (120-180ms, sin rebote, mismas
  // variables de motion que ya usa el resto de la app).
  function animarReacomodo(cards, mutar) {
    const antes = new Map(cards.map((c) => [c, c.getBoundingClientRect()]));
    mutar();
    cards.forEach((c) => {
      const rectAntes = antes.get(c);
      const rectDespues = c.getBoundingClientRect();
      const dx = rectAntes.left - rectDespues.left;
      const dy = rectAntes.top - rectDespues.top;
      if (!dx && !dy) return;
      c.style.transition = 'none';
      c.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      requestAnimationFrame(() => {
        c.style.transition = 'transform var(--motion-base) var(--ease-soft)';
        c.style.transform = '';
      });
    });
  }

  // El auto-scroll sigue siendo solo vertical (no se crea scroll horizontal
  // nuevo — la grilla no lo necesita).
  function autoScroll(clientY) {
    if (clientY < MARGEN_ARRIBA) window.scrollBy(0, -VELOCIDAD_AUTOSCROLL);
    else if (clientY > window.innerHeight - MARGEN_ABAJO) window.scrollBy(0, VELOCIDAD_AUTOSCROLL);
  }

  function finalizarArrastre() {
    if (!drag) return;
    cancelAnimationFrame(drag.rafId);
    const { card, placeholder, pointerId } = drag;
    if (card.releasePointerCapture && pointerId != null) {
      try {
        if (!card.hasPointerCapture || card.hasPointerCapture(pointerId)) {
          card.releasePointerCapture(pointerId);
        }
      } catch (err) { /* no-op — puede que ya se haya liberado solo (pointercancel) */ }
    }
    grid.insertBefore(card, placeholder);
    placeholder.remove();
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.height = '';
    card.style.margin = '';
    card.style.transform = '';
    card.classList.remove('cultivo-card-arrastrando');
    card.classList.remove('cultivo-card-sujetando');

    const idsVisiblesNuevoOrden = Array.from(grid.querySelectorAll('.cultivo-card')).map((c) => Number(c.dataset.id));
    guardarOrdenCultivosTrasArrastre(todosLosCultivos, idsVisiblesNuevoOrden);

    drag = null;
    onReordenado();
  }
}

// ---------------------------------------------------------------------
// "Reordenar cultivos" (desde el menú ⋯): alternativa accesible al
// arrastre (teclado, lector de pantalla) vía ↑/↓, más "Restaurar orden
// predeterminado". No es una pantalla nueva ni un "modo" — es el mismo
// tipo de modal chico que ya usa Personalizar inicio, para una acción
// secundaria e infrecuente.
// ---------------------------------------------------------------------

async function abrirOrdenCultivos() {
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
            <div class="home-layout-mover">
              <button type="button" class="home-layout-flecha" data-move="up" data-id="${c.id}" ${i === 0 ? 'disabled' : ''} aria-label="Subir ${etiqueta}">↑</button>
              <button type="button" class="home-layout-flecha" data-move="down" data-id="${c.id}" ${i === ordenados.length - 1 ? 'disabled' : ''} aria-label="Bajar ${etiqueta}">↓</button>
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
      <h2>Reordenar cultivos</h2>
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
}
