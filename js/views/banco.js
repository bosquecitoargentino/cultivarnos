// views/banco.js — vista principal del Banco de propagación: "¿qué
// material tengo guardado?". Buscador + chips de filtro, igual patrón que
// Biblioteca (ver views/biblioteca.js), pero agrupando por especie (un
// mismo cultivo puede tener varios lotes de orígenes distintos).

function loteFilaHtml(lote) {
  const tipo = obtenerTipoMaterial(lote.tipoMaterial) || {};
  const procedencia = obtenerProcedencia(lote.procedencia);
  const referencia = formatearReferenciaLote(lote);
  const metaPartes = [procedencia ? procedencia.label : null, referencia].filter(Boolean);
  const meta = metaPartes.join(' · ');
  return `
    <div class="lote-fila" data-id="${lote.id}">
      <span class="lote-fila-icono">${tipo.icono || '🌱'}</span>
      <div class="lote-fila-info">
        <div class="lote-fila-variedad">${escapeHtml(lote.variedad || 'Sin variedad')}</div>
        ${meta ? `<div class="lote-fila-meta">${escapeHtml(meta)}</div>` : ''}
      </div>
      <div class="lote-fila-cantidad">${escapeHtml(formatearCantidadLote(lote))}</div>
    </div>
  `;
}

function loteGrupoHtml(grupo) {
  const { especie, lotes } = grupo;
  return `
    <div class="lote-grupo">
      <div class="lote-grupo-header">
        <span class="lote-grupo-nombre">${escapeHtml(especie.nombre)}</span>
        ${lotes.length > 1 ? `<span class="badge">${lotes.length} lotes</span>` : ''}
      </div>
      <div class="lote-grupo-lista">
        ${lotes.map(loteFilaHtml).join('')}
      </div>
    </div>
  `;
}

async function renderBanco(root) {
  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>🌰 Banco</h1>
      <p>Semillas, bulbos, rizomas y todo lo que tengas guardado para arrancar algo nuevo.</p>
    </div>
    <div class="biblioteca-buscador">
      <input type="text" id="banco-buscar" class="form-input" placeholder="Buscar especie, variedad, tipo..." autocomplete="off" />
    </div>
    <div class="chip-group biblioteca-categorias" id="banco-filtros">
      ${GRUPOS_FILTRO_BANCO.map((g) => `<div class="chip-option ${g.id === 'todos' ? 'selected' : ''}" data-value="${g.id}">${escapeHtml(g.label)}</div>`).join('')}
    </div>
    <div id="banco-contador" class="section-title"></div>
    <div id="banco-resultados"></div>
    <button type="button" id="banco-btn-agregar" class="btn-primary">+ Agregar al Banco</button>
  `;

  const buscarInput = root.querySelector('#banco-buscar');
  const filtrosGroup = root.querySelector('#banco-filtros');
  const contador = root.querySelector('#banco-contador');
  const resultados = root.querySelector('#banco-resultados');
  let grupoActual = 'todos';
  let todosLosLotes = [];

  async function pintar() {
    todosLosLotes = await DB.getAllLotes();

    if (!todosLosLotes.length) {
      contador.textContent = '';
      resultados.innerHTML = `
        <div class="empty-state">
          <span class="emoji">🌱</span>
          Tu Banco está vacío 🌱<br />
          Registrá las semillas, bulbos, rizomas y otros materiales que tenés guardados para saber con qué contás cuando llegue el momento de cultivar.
        </div>
      `;
      return;
    }

    const filtrados = filtrarLotes(todosLosLotes, buscarInput.value, grupoActual);
    contador.textContent = `${todosLosLotes.length} ${todosLosLotes.length === 1 ? 'lote' : 'lotes'}`;

    if (!filtrados.length) {
      resultados.innerHTML = `<div class="empty-state"><span class="emoji">🔍</span>No encontramos lotes con esa búsqueda.</div>`;
      return;
    }

    const grupos = agruparLotesPorEspecie(filtrados);
    resultados.innerHTML = grupos.map(loteGrupoHtml).join('');
    resultados.querySelectorAll('.lote-fila').forEach((fila) => {
      fila.addEventListener('click', () => navigate(`#/banco/${fila.dataset.id}`));
    });
  }

  buscarInput.addEventListener('input', pintar);
  filtrosGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    filtrosGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    grupoActual = chip.dataset.value;
    pintar();
  });
  root.querySelector('#banco-btn-agregar').addEventListener('click', () => navigate('#/banco/nuevo'));

  await pintar();
}
