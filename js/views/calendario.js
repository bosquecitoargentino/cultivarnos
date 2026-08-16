// views/calendario.js — "Sembrar ahora", navegable mes a mes. Vista simple
// a propósito: sin interfaz de calendario compleja, solo listas agrupadas.

async function renderCalendario(root) {
  const config = await DB.getConfiguracion();

  if (!config.hemisferio) {
    root.innerHTML = `
      <div class="view-header view-header-compacto">
        <a href="#/inicio" class="volver-link">‹ Inicio</a>
        <h1>Calendario de temporada</h1>
      </div>
      <div class="empty-state">
        <span class="emoji">🌍</span>
        Configurá tu hemisferio para ver el calendario estacional.
      </div>
      <a href="#/configuracion" class="btn-secondary" style="display:block;text-align:center;margin-top:12px;">Ir a Configuración</a>
    `;
    return;
  }

  let mesActual = new Date().getMonth() + 1; // 1-12

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
    mesLabel.textContent = nombreMes(mesActual);
    const grupos = obtenerCalendarioMes(config.hemisferio, mesActual);
    // Almácigo se queda con el emoji: no hay un ícono en la lámina que
    // distinga "semillero" de "siembra directa" sin repetir el mismo
    // dibujo de 'siembra' en dos títulos vecinos, lo cual generaría la
    // mezcla confusa que se pidió evitar en esta pasada. Siembra directa
    // y Trasplante sí tienen un ícono propio y exacto, así que usan el
    // ícono del sistema — mismo dibujo que ya se ve en el historial de
    // eventos, para que "Trasplante" se lea igual en todos lados.
    const secciones = [
      { titulo: '🌱 Almácigo', items: grupos.almacigo },
      { titulo: `${renderIcon('siembra', { scale: 'xs' })} Siembra directa`, items: grupos.directa },
      { titulo: `${renderIcon('trasplante', { scale: 'xs' })} Trasplante (aproximado)`, items: grupos.trasplante },
    ].filter((s) => s.items.length);

    if (!secciones.length) {
      contenido.innerHTML = `<p class="fotos-vacio">No hay siembras típicas para este mes en la biblioteca.</p>`;
      return;
    }

    contenido.innerHTML = secciones
      .map(
        (s) => `
          <div class="calendario-grupo">
            <div class="calendario-grupo-titulo">${s.titulo}</div>
            <div class="calendario-chips">
              ${s.items.map((it) => `<span class="calendario-chip">${escapeHtml(it.nombre)}</span>`).join('')}
            </div>
          </div>
        `
      )
      .join('');
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
