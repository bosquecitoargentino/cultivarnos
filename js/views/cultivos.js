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
// Mantener presionado + arrastrar para reordenar (Mis cultivos). Mismo
// enfoque de Pointer Events que "Personalizar inicio" (ver
// habilitarArrastreHomeLayout en inicio.js), pero acá NO hay un handle
// separado: toda la tarjeta sirve tanto para abrir la ficha (toque normal)
// como para reordenar (mantener presionado ~900ms). Antes de cumplirse
// ese tiempo, cualquier movimiento se interpreta como scroll normal — no
// como el comienzo de un arrastre — así nunca compite con desplazarse por
// la lista.
// ---------------------------------------------------------------------

function habilitarArrastreCultivos(grid, todosLosCultivos, onReordenado) {
  const UMBRAL_MOVIMIENTO = 10; // px — cualquier movimiento antes del hold es scroll, no drag
  const DEMORA_HOLD = 900; // ms — "mantener presionado ~1 segundo"
  const MARGEN_ARRIBA = 70; // px, despeja el header fijo
  const MARGEN_ABAJO = 100; // px, despeja el nav inferior fijo
  const VELOCIDAD_AUTOSCROLL = 12; // px por frame, cerca del borde

  let drag = null;

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

    const timer = setTimeout(() => {
      if (!cancelado) activar();
    }, DEMORA_HOLD);

    function activar() {
      if (activado || cancelado) return;
      activado = true;
      // Haptic opcional — no todos los navegadores lo tienen (iOS Safari
      // no), y no hace falta: si no existe, esto simplemente no hace nada.
      if (navigator.vibrate) {
        try { navigator.vibrate(10); } catch (err) { /* no-op */ }
      }
      comenzarArrastre(card, yInicial);
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      if (activado) {
        if (drag) drag.ultimoClientY = e.clientY;
        return;
      }
      const dx = e.clientX - xInicial;
      const dy = e.clientY - yInicial;
      if (Math.abs(dx) > UMBRAL_MOVIMIENTO || Math.abs(dy) > UMBRAL_MOVIMIENTO) {
        // Antes de cumplirse el hold, cualquier movimiento es scroll (o un
        // gesto que no nos interesa) — se cancela y se deja que el
        // navegador siga con su comportamiento normal.
        cancelado = true;
        clearTimeout(timer);
        quitarListeners();
      }
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      clearTimeout(timer);
      quitarListeners();
      if (activado) {
        finalizarArrastre();
      } else if (!cancelado) {
        // Toque normal (sin mantener, sin moverse): abre la ficha, como
        // siempre.
        navigate(`#/cultivo/${card.dataset.id}`);
      }
    }

    function onCancel(e) {
      if (e.pointerId !== pointerId) return;
      clearTimeout(timer);
      quitarListeners();
      if (activado) finalizarArrastre();
    }

    function quitarListeners() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
  }

  function comenzarArrastre(card, clientY) {
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

    drag = {
      card,
      placeholder,
      altura: rect.height,
      offsetDentro: clientY - rect.top,
      ultimoClientY: clientY,
      rafId: null,
    };
    drag.rafId = requestAnimationFrame(paso);
  }

  function paso() {
    if (!drag) return;
    posicionarYReordenar(drag.ultimoClientY);
    autoScroll(drag.ultimoClientY);
    drag.rafId = requestAnimationFrame(paso);
  }

  // Solo vertical: "left" quedó fijo desde comenzarArrastre y nunca se
  // vuelve a tocar — el gesto puede derivar levemente en horizontal sin
  // que la tarjeta lo siga.
  function posicionarYReordenar(clientY) {
    const minTop = MARGEN_ARRIBA;
    const maxTop = Math.max(minTop, window.innerHeight - MARGEN_ABAJO - drag.altura);
    const top = Math.min(Math.max(clientY - drag.offsetDentro, minTop), maxTop);
    drag.card.style.top = top + 'px';

    const centro = top + drag.altura / 2;
    const cards = Array.from(grid.querySelectorAll('.cultivo-card:not(.cultivo-card-arrastrando)'));
    let destino = null;
    for (const c of cards) {
      const r = c.getBoundingClientRect();
      if (centro < r.top + r.height / 2) { destino = c; break; }
    }
    const siguienteActual = drag.placeholder.nextElementSibling;
    if (destino !== siguienteActual && destino !== drag.placeholder) {
      animarReacomodo(cards, () => {
        if (destino) grid.insertBefore(drag.placeholder, destino);
        else grid.appendChild(drag.placeholder);
      });
    }
  }

  // FLIP chico, igual criterio que Personalizar inicio: en vez de que las
  // tarjetas "salten" al nuevo lugar, se animan desde donde estaban hasta
  // donde quedan (120-180ms, sin rebote, mismas variables de motion que
  // ya usa el resto de la app).
  function animarReacomodo(cards, mutar) {
    const antes = new Map(cards.map((c) => [c, c.getBoundingClientRect().top]));
    mutar();
    cards.forEach((c) => {
      const delta = antes.get(c) - c.getBoundingClientRect().top;
      if (!delta) return;
      c.style.transition = 'none';
      c.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        c.style.transition = 'transform var(--motion-base) var(--ease-soft)';
        c.style.transform = '';
      });
    });
  }

  function autoScroll(clientY) {
    if (clientY < MARGEN_ARRIBA) window.scrollBy(0, -VELOCIDAD_AUTOSCROLL);
    else if (clientY > window.innerHeight - MARGEN_ABAJO) window.scrollBy(0, VELOCIDAD_AUTOSCROLL);
  }

  function finalizarArrastre() {
    if (!drag) return;
    cancelAnimationFrame(drag.rafId);
    const { card, placeholder } = drag;
    grid.insertBefore(card, placeholder);
    placeholder.remove();
    card.style.position = '';
    card.style.left = '';
    card.style.top = '';
    card.style.width = '';
    card.style.height = '';
    card.classList.remove('cultivo-card-arrastrando');

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
