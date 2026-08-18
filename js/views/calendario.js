// views/calendario.js — "Sembrar ahora", navegable mes a mes. Vista simple
// a propósito: sin interfaz de calendario compleja, solo listas agrupadas.

// Mes que se estaba mirando la última vez — vive fuera de renderCalendario
// para sobrevivir a un re-render de la vista (ej. volver acá después de
// abrir una especie desde un chip). Se resetea solo si se recarga la
// página entera, que es el comportamiento esperado.
let mesCalendarioActual = null;

async function renderCalendario(root) {
  const config = await DB.getConfiguracion();

  if (!config.hemisferio) {
    root.innerHTML = `
      <div class="view-header view-header-compacto">
        <a href="#/inicio" class="volver-link">‹ Inicio</a>
        <h1>Calendario de temporada</h1>
      </div>
      <div class="empty-state">
        Configurá tu hemisferio para ver el calendario estacional.
      </div>
      <a href="#/configuracion" class="btn-secondary" style="display:block;text-align:center;margin-top:12px;">Ir a Configuración</a>
    `;
    return;
  }

  let mesActual = mesCalendarioActual || (new Date().getMonth() + 1); // 1-12

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <a href="#/inicio" class="volver-link">‹ Inicio</a>
      <h1>Calendario de temporada</h1>
      <p>Hemisferio ${config.hemisferio === 'sur' ? 'Sur' : 'Norte'} · orientativo</p>
    </div>
    <div class="calendario-nav">
      <button type="button" id="cal-prev" class="calendario-nav-btn" aria-label="Mes anterior">‹</button>
      <div class="calendario-mes" id="cal-mes-label"></div>
      <button type="button" id="cal-next" class="calendario-nav-btn" aria-label="Mes siguiente">›</button>
    </div>
    <div id="cal-contenido"></div>
  `;

  const mesLabel = root.querySelector('#cal-mes-label');
  const contenido = root.querySelector('#cal-contenido');

  function pintar() {
    mesCalendarioActual = mesActual;
    mesLabel.textContent = nombreMes(mesActual);
    const grupos = obtenerCalendarioMes(config.hemisferio, mesActual);
    // Los tres títulos usan ícono del sistema — Almácigo con 'germinacion'
    // (semillero = arrancar plantines, el mismo concepto que ese ícono ya
    // representa en el historial de eventos), Siembra directa con
    // 'siembra' y Trasplante con 'trasplante'. Tres dibujos distintos, sin
    // repetir ninguno entre títulos vecinos.
    const secciones = [
      { titulo: `${renderIcon('germinacion', { scale: 'sm' })} Almácigo`, items: grupos.almacigo },
      { titulo: `${renderIcon('siembra', { scale: 'sm' })} Siembra directa`, items: grupos.directa },
      { titulo: `${renderIcon('trasplante', { scale: 'sm' })} Trasplante (aproximado)`, items: grupos.trasplante },
    ].filter((s) => s.items.length);

    if (!secciones.length) {
      contenido.innerHTML = `<p class="fotos-vacio">No hay siembras típicas para este mes en la biblioteca.</p>`;
      return;
    }

    // Cada chip es una especie de la Biblioteca (mismo id, misma fuente —
    // ver motor-estacional.js#obtenerCalendarioMes) — tocarla abre esa
    // ficha directamente, sin buscar por texto ni duplicar nada.
    contenido.innerHTML = secciones
      .map(
        (s) => `
          <div class="calendario-grupo">
            <div class="calendario-grupo-titulo">${s.titulo}</div>
            <div class="calendario-chips">
              ${s.items.map((it) => `<button type="button" class="calendario-chip" data-id="${escapeHtml(String(it.id))}">${escapeHtml(it.nombre)}</button>`).join('')}
            </div>
          </div>
        `
      )
      .join('');

    contenido.querySelectorAll('.calendario-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        const especieId = chip.dataset.id;
        if (!especieId) return;
        mesCalendarioActual = mesActual;
        window.__volverDesdeFicha = '#/calendario';
        navigate('#/biblioteca/' + especieId);
      });
    });
  }

  root.querySelector('#cal-prev').addEventListener('click', () => {
    mesActual = mesActual === 1 ? 12 : mesActual - 1;
    pintar();
  });
  root.querySelector('#cal-next').addEventListener('click', () => {
    mesActual = mesActual === 12 ? 1 : mesActual + 1;
    pintar();
  });

  pintar();
}
