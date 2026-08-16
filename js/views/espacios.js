// views/espacios.js — vista "Espacios": otra forma de mirar la huerta,
// agrupada por lugar en vez de por cultivo. Capa de presentación pura —
// toda la agrupación/derivación vive en motor-espacios.js (misma fuente
// que usa la ficha de detalle para "Distribución actual", punto 32 del
// pedido: nunca una segunda interpretación de "dónde están las plantas").
//
// Por defecto solo muestra presencia ACTUAL de cultivos ACTIVOS (punto 33
// del pedido) — "historia del espacio" queda para una etapa futura, no se
// construye acá.

async function renderEspacios(root) {
  root = root || APP_ROOT;
  const espacios = await obtenerEspaciosActuales();

  root.innerHTML = `
    <div class="view-header">
      <h1>${renderIcon('espacios', { scale: 'lg' })} Espacios</h1>
      <p>Tu huerta, vista por lugar.</p>
    </div>
    <div id="espacios-list"></div>
  `;

  const list = root.querySelector('#espacios-list');
  if (!espacios.length) {
    list.innerHTML = `<div class="empty-state">${renderIcon('espacios', { scale: 'xl', className: 'icon-bloque' })}Todavía no hay cultivos activos con una ubicación registrada.</div>`;
    return;
  }

  const claveSemillero = claveUbicacion('Semillero');
  list.innerHTML = `<div class="cultivos-grid">${espacios.map((e) => {
    const icono = renderIcon(e.clave === claveSemillero ? 'siembra' : 'espacios', { scale: 'xs' });
    const partes = [];
    if (e.totalCantidad != null) partes.push(`${e.totalCantidad} planta${e.totalCantidad === 1 ? '' : 's'}`);
    partes.push(`${e.cantidadCultivos} cultivo${e.cantidadCultivos === 1 ? '' : 's'}`);
    return `
      <div class="cultivo-card espacio-card" data-clave="${escapeHtml(e.clave)}">
        <div class="cultivo-card-body">
          <div class="cultivo-card-especie">${icono} ${escapeHtml(e.nombre)}</div>
          <div class="cultivo-card-meta">${partes.join(' · ')}</div>
        </div>
      </div>
    `;
  }).join('')}</div>`;

  list.querySelectorAll('.espacio-card').forEach((card) => {
    card.addEventListener('click', () => navigate(`#/espacios/${encodeURIComponent(card.dataset.clave)}`));
  });
}

async function renderEspacioDetalle(clave, root) {
  root = root || APP_ROOT;
  const espacio = await obtenerEspacioPorClave(clave);

  if (!espacio) {
    root.innerHTML = `
      <div class="view-header view-header-compacto">
        <a href="#/espacios" class="volver-link">‹ Espacios</a>
      </div>
      <div class="empty-state">${renderIcon('buscar', { scale: 'xl', className: 'icon-bloque' })}No se encontró este espacio.</div>
    `;
    return;
  }

  const partes = [];
  if (espacio.totalCantidad != null) partes.push(`${espacio.totalCantidad} planta${espacio.totalCantidad === 1 ? '' : 's'}`);
  partes.push(`${espacio.cantidadCultivos} cultivo${espacio.cantidadCultivos === 1 ? '' : 's'}`);

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <a href="#/espacios" class="volver-link">‹ Espacios</a>
      <h1>${escapeHtml(espacio.nombre)}</h1>
      <p>${partes.join(' · ')}</p>
    </div>
    <section>
      <div class="section-title">Actualmente</div>
      <div class="distribucion-siembra">
        <div class="distribucion-lista" id="espacio-cultivos-list">
          ${espacio.cultivos.map((item) => `
            <div class="distribucion-fila espacio-cultivo-fila" data-id="${item.cultivo.id}" role="button" tabindex="0">
              <span class="distribucion-icono">🌿</span>
              <span class="distribucion-ubicacion">${escapeHtml(item.cultivo.especie)}${item.cultivo.variedad ? ` · ${escapeHtml(item.cultivo.variedad)}` : ''}</span>
              <span class="distribucion-cantidad">${item.conCantidad ? item.cantidad : 'cantidad no registrada'}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </section>
  `;

  // Cada fila abre el cultivo REAL — nunca una copia (punto 31 del
  // pedido): un mismo lote distribuido en varios espacios siempre lleva
  // al mismo registro.
  root.querySelectorAll('.espacio-cultivo-fila').forEach((fila) => {
    fila.addEventListener('click', () => navigate(`#/cultivo/${fila.dataset.id}`));
  });
}
