// views/biblioteca.js — vista Biblioteca: explorar especies aunque no
// estén registradas como cultivo. Interfaz simple a propósito: buscador +
// categorías, sin filtros complejos (ver motor-biblioteca.js).

function especieCardHtml(especie) {
  const { id, identidad, visual, origen } = especie;
  const categoriaLabel = (CATEGORIAS_BIBLIOTECA.find((c) => identidad.categorias.includes(c.id)) || {}).label || '';
  const ciclo = identidad.ciclo ? identidad.ciclo.split('(')[0].split(',')[0].trim() : '';
  const meta = [categoriaLabel, ciclo].filter(Boolean).join(' · ');
  const esNativa = origen && origen.estatus === 'nativa';

  return `
    <div class="especie-card" data-id="${id}">
      <div class="especie-card-photo" style="${visual.imagen ? `background-image:url('${visual.imagen}')` : ''}">
        ${visual.imagen ? '' : (visual.icono || '🌿')}
        ${esNativa ? `<span class="especie-card-nativa" title="Especie nativa">${renderIcon('especie-nativa', { scale: 'xs' })}</span>` : ''}
      </div>
      <div class="especie-card-body">
        <div class="especie-card-nombre">${escapeHtml(identidad.nombre)}</div>
        <div class="especie-card-cientifico">${escapeHtml(identidad.nombreCientifico)}</div>
        <div class="especie-card-meta">${escapeHtml(meta)}</div>
      </div>
    </div>
  `;
}

async function renderBiblioteca(root) {
  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>${renderIcon('biblioteca', { scale: 'lg' })} Biblioteca</h1>
      <p>Explorá especies y su información agronómica, aunque todavía no las tengas registradas.</p>
    </div>
    <div class="biblioteca-buscador">
      <input type="text" id="bib-buscar" class="form-input" placeholder="Buscar tomate, rúcula, papa..." autocomplete="off" />
    </div>
    <div class="chip-group biblioteca-categorias" id="bib-categorias">
      ${CATEGORIAS_BIBLIOTECA.map((c) => `<div class="chip-option ${c.id === 'todos' ? 'selected' : ''}" data-value="${c.id}">${c.id === 'nativas' ? renderIcon('especie-nativa', { scale: 'xs' }) + ' ' : ''}${escapeHtml(c.label)}</div>`).join('')}
    </div>
    <div id="bib-resultados"></div>
  `;

  const buscarInput = root.querySelector('#bib-buscar');
  const categoriasGroup = root.querySelector('#bib-categorias');
  const resultados = root.querySelector('#bib-resultados');
  let categoriaActual = 'todos';

  function pintar() {
    const especies = filtrarBiblioteca(buscarInput.value, categoriaActual);
    if (!especies.length) {
      resultados.innerHTML = `<div class="empty-state">${renderIcon('buscar', { scale: 'xl', className: 'icon-bloque' })}No encontramos especies con esa búsqueda todavía.</div>`;
      return;
    }
    resultados.innerHTML = `<div class="especies-grid">${especies.map(especieCardHtml).join('')}</div>`;
    resultados.querySelectorAll('.especie-card').forEach((card) => {
      card.addEventListener('click', () => navigate(`#/biblioteca/${card.dataset.id}`));
    });
  }

  buscarInput.addEventListener('input', pintar);
  categoriasGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    categoriasGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    categoriaActual = chip.dataset.value;
    pintar();
  });

  pintar();
}
