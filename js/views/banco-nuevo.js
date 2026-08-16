// views/banco-nuevo.js — alta de un Lote en el Banco. Arriba lo esencial
// (especie, tipo de material, cantidad, variedad, procedencia); "Más
// detalles" (fecha, ubicación, nota, foto) queda colapsado con <details>
// nativo — no hay componente de disclosure en el CSS actual y esto evita
// construir uno nuevo solo para esto.

const PROCEDENCIAS_LOTE_CON_VACIO = [{ id: '', label: 'No registrado' }, ...PROCEDENCIAS_LOTE];

function renderBancoNuevo(root, queryString) {
  let especieIdSeleccionado = null;
  let tipoMaterialSeleccionado = 'semilla';
  let tipoTocadoManualmente = false;
  let tipoCantidadSeleccionado = 'exacta';
  let cantidadCualitativaSeleccionada = 'media';
  let procedenciaSeleccionada = '';
  let unidadTocadaManualmente = false;
  let anioTocadoManualmente = false;
  let fotoBlob = null;
  let fotoPreviewUrl = null;

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>+ Agregar al Banco</h1>
      <p>Registrá lo esencial. Podés sumar más detalles después.</p>
    </div>

    <form id="form-banco-nuevo">
      <div class="form-group">
        <label class="form-label">Especie</label>
        <input type="text" id="f-especie" class="form-input" placeholder="Ej: Tomate cherry, Ajo, Papa..." required autocomplete="off" />
        <div id="f-especie-sugerencias" class="especie-sugerencias hidden"></div>
      </div>

      <div class="form-group">
        <label class="form-label">¿Qué guardaste?</label>
        <div class="chip-group" id="f-tipo-material">
          ${TIPOS_MATERIAL_PROPAGACION.map((t) => `<div class="chip-option ${t.id === 'semilla' ? 'selected' : ''}" data-value="${t.id}">${t.icono} ${escapeHtml(t.label)}</div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Cantidad</label>
        <div class="chip-group" id="f-tipo-cantidad">
          <div class="chip-option selected" data-value="exacta">Exacta</div>
          <div class="chip-option" data-value="aproximada">Aproximada</div>
          <div class="chip-option" data-value="cualitativa">Cualitativa</div>
          <div class="chip-option" data-value="desconocida">No registrar</div>
        </div>
        <div style="height:10px"></div>
        <div id="f-cantidad-numerica" class="cantidad-numerica-row">
          <input type="number" id="f-cantidad-num" class="form-input" min="0" step="1" inputmode="numeric" placeholder="Cantidad" />
          <input type="text" id="f-unidad" class="form-input" placeholder="unidad" autocomplete="off" />
        </div>
        <div class="chip-group hidden" id="f-cantidad-cualitativa">
          ${CANTIDADES_CUALITATIVAS.map((c) => `<div class="chip-option ${c.id === 'media' ? 'selected' : ''}" data-value="${c.id}">${escapeHtml(c.label)}</div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Variedad <span class="optional">(opcional)</span></label>
        <input type="text" id="f-variedad" class="form-input" placeholder="Ej: Cherry rojo, San Marzano..." autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label">Procedencia <span class="optional">(opcional)</span></label>
        <div class="chip-group" id="f-procedencia">
          ${PROCEDENCIAS_LOTE_CON_VACIO.map((p) => `<div class="chip-option ${p.id === '' ? 'selected' : ''}" data-value="${p.id}">${escapeHtml(p.label)}</div>`).join('')}
        </div>
      </div>

      <details class="mas-detalles">
        <summary>Más detalles</summary>

        <div class="form-group">
          <label class="form-label">Referencia temporal <span class="optional">(opcional)</span></label>
          <input type="date" id="f-fecha-referencia" class="form-input" />
          <div style="height:8px"></div>
          <input type="number" id="f-anio-referencia" class="form-input" min="1900" max="2100" step="1" inputmode="numeric" placeholder="Solo el año, si no sabés la fecha exacta" />
        </div>

        <div class="form-group">
          <label class="form-label">¿Dónde lo guardás? <span class="optional">(opcional)</span></label>
          <input type="text" id="f-ubicacion" class="form-input" placeholder="Ej: Caja de semillas, Heladera..." autocomplete="off" list="f-ubicacion-datalist" />
        </div>

        <div class="form-group">
          <label class="form-label">Nota <span class="optional">(opcional)</span></label>
          <textarea id="f-nota" class="form-textarea" placeholder="Algo que quieras recordar..."></textarea>
        </div>

        <div class="form-group">
          <label class="form-label">Fotografía <span class="optional">(opcional)</span></label>
          <div class="photo-picker" id="f-photo-picker" role="button" tabindex="0" aria-label="Agregar fotografía">
            <span class="photo-picker-placeholder">
              <span class="emoji">📷</span>
              <span>Tocá para agregar una foto</span>
            </span>
            <button type="button" class="remove-photo hidden" id="f-photo-remove">✕</button>
            <input type="file" id="f-foto" accept="image/*" capture="environment" hidden />
          </div>
        </div>
      </details>

      <button type="submit" class="btn-primary">Guardar en el Banco</button>
    </form>
  `;

  // Preselección desde una ficha de Biblioteca (mismo patrón que
  // #/nuevo?especie=<id>): completa el campo Especie y fija el especieId.
  if (queryString) {
    const params = new URLSearchParams(queryString);
    const especieId = params.get('especie');
    const especieLibreria = especieId && typeof getEspecie === 'function' ? getEspecie(especieId) : null;
    if (especieLibreria) {
      especieIdSeleccionado = especieLibreria.id;
      root.querySelector('#f-especie').value = especieLibreria.identidad.nombre;
    }
  }

  // ---------- Especie: búsqueda en vivo contra la Biblioteca ----------
  const especieInput = root.querySelector('#f-especie');
  const especieSugerencias = root.querySelector('#f-especie-sugerencias');

  function actualizarTipoSugerido() {
    if (tipoTocadoManualmente || !especieIdSeleccionado) return;
    const sugerido = sugerirTipoMaterialPorEspecie(especieIdSeleccionado);
    if (!sugerido) return;
    tipoMaterialSeleccionado = sugerido;
    const tipoGroup = root.querySelector('#f-tipo-material');
    tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.toggle('selected', c.dataset.value === sugerido));
    actualizarUnidadPrellenada();
  }

  function pintarSugerenciasEspecie() {
    const query = especieInput.value.trim();
    if (!query || query.length < 2 || typeof filtrarBiblioteca !== 'function') {
      especieSugerencias.innerHTML = '';
      especieSugerencias.classList.add('hidden');
      return;
    }
    const coincidencias = filtrarBiblioteca(query, 'todos').slice(0, 6);
    if (coincidencias.length) {
      especieSugerencias.innerHTML = coincidencias
        .map((esp) => `<div class="especie-sugerencia" data-id="${esp.id}">${esp.visual.icono || '🌿'} ${escapeHtml(esp.identidad.nombre)}</div>`)
        .join('');
    } else {
      especieSugerencias.innerHTML = `<div class="especie-sugerencia especie-sugerencia-libre" data-libre="1">Usar «${escapeHtml(query)}» como especie (no está en Biblioteca)</div>`;
    }
    especieSugerencias.classList.remove('hidden');
  }

  especieInput.addEventListener('input', () => {
    especieIdSeleccionado = null;
    pintarSugerenciasEspecie();
  });
  especieInput.addEventListener('focus', pintarSugerenciasEspecie);

  especieSugerencias.addEventListener('click', (e) => {
    const item = e.target.closest('.especie-sugerencia');
    if (!item) return;
    if (item.dataset.libre) {
      especieIdSeleccionado = null;
    } else {
      especieIdSeleccionado = item.dataset.id;
      const especie = getEspecie(item.dataset.id);
      especieInput.value = especie.identidad.nombre;
      actualizarTipoSugerido();
    }
    especieSugerencias.innerHTML = '';
    especieSugerencias.classList.add('hidden');
  });

  document.addEventListener('click', (e) => {
    if (!especieSugerencias.contains(e.target) && e.target !== especieInput) {
      especieSugerencias.classList.add('hidden');
    }
  });

  // ---------- Tipo de material ----------
  function actualizarUnidadPrellenada() {
    if (unidadTocadaManualmente) return;
    root.querySelector('#f-unidad').value = unidadPorTipoMaterial(tipoMaterialSeleccionado) || '';
  }
  actualizarUnidadPrellenada();

  const tipoGroup = root.querySelector('#f-tipo-material');
  tipoGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    tipoMaterialSeleccionado = chip.dataset.value;
    tipoTocadoManualmente = true;
    actualizarUnidadPrellenada();
  });

  root.querySelector('#f-unidad').addEventListener('input', () => { unidadTocadaManualmente = true; });

  // ---------- Cantidad ----------
  const tipoCantidadGroup = root.querySelector('#f-tipo-cantidad');
  const cantidadNumericaRow = root.querySelector('#f-cantidad-numerica');
  const cantidadCualitativaGroup = root.querySelector('#f-cantidad-cualitativa');

  function actualizarSeccionCantidad() {
    const esNumerica = tipoCantidadSeleccionado === 'exacta' || tipoCantidadSeleccionado === 'aproximada';
    cantidadNumericaRow.classList.toggle('hidden', !esNumerica);
    cantidadCualitativaGroup.classList.toggle('hidden', tipoCantidadSeleccionado !== 'cualitativa');
  }
  actualizarSeccionCantidad();

  tipoCantidadGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    tipoCantidadGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    tipoCantidadSeleccionado = chip.dataset.value;
    actualizarSeccionCantidad();
  });

  cantidadCualitativaGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    cantidadCualitativaGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    cantidadCualitativaSeleccionada = chip.dataset.value;
  });

  // ---------- Procedencia ----------
  const procedenciaGroup = root.querySelector('#f-procedencia');
  procedenciaGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    procedenciaGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    procedenciaSeleccionada = chip.dataset.value;
  });

  // ---------- Fecha / año de referencia ----------
  const fechaInput = root.querySelector('#f-fecha-referencia');
  const anioInput = root.querySelector('#f-anio-referencia');
  fechaInput.addEventListener('change', () => {
    if (fechaInput.value && !anioTocadoManualmente) {
      anioInput.value = fechaInput.value.slice(0, 4);
    }
  });
  anioInput.addEventListener('input', () => { anioTocadoManualmente = true; });

  // ---------- Ubicación: autocomplete con lo ya usado en otros lotes ----------
  if (typeof obtenerUbicacionesLoteUsadas === 'function' && typeof datalistUbicacionesHtml === 'function') {
    obtenerUbicacionesLoteUsadas().then((ubicaciones) => {
      if (!ubicaciones.length) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = datalistUbicacionesHtml('f-ubicacion-datalist', ubicaciones);
      root.appendChild(wrap.firstElementChild);
    });
  }

  // ---------- Foto: mismo mecanismo que #/nuevo (downscaleImage + DB.addFoto) ----------
  const photoPicker = root.querySelector('#f-photo-picker');
  const fotoInput = root.querySelector('#f-foto');
  const photoPlaceholder = root.querySelector('.photo-picker-placeholder');
  const photoRemoveBtn = root.querySelector('#f-photo-remove');

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
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = URL.createObjectURL(fotoBlob);
    photoPicker.style.backgroundImage = `url('${fotoPreviewUrl}')`;
    photoPicker.classList.add('has-photo');
    photoPlaceholder.classList.add('hidden');
    photoRemoveBtn.classList.remove('hidden');
  });
  photoRemoveBtn.addEventListener('click', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    fotoBlob = null;
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = null;
    fotoInput.value = '';
    photoPicker.style.backgroundImage = '';
    photoPicker.classList.remove('has-photo');
    photoPlaceholder.classList.remove('hidden');
    photoRemoveBtn.classList.add('hidden');
  });

  // ---------- Submit ----------
  root.querySelector('#form-banco-nuevo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const especieTexto = especieInput.value.trim();
    if (!especieTexto) { showToast('Ingresá una especie'); return; }

    let fotoId = null;
    if (fotoBlob) fotoId = await DB.addFoto(fotoBlob);

    const cantidadNumRaw = root.querySelector('#f-cantidad-num').value.trim();
    const cantidadNum = cantidadNumRaw ? parseInt(cantidadNumRaw, 10) : null;
    const cantidadValida = Number.isFinite(cantidadNum) && cantidadNum >= 0 ? cantidadNum : null;
    const esNumerica = tipoCantidadSeleccionado === 'exacta' || tipoCantidadSeleccionado === 'aproximada';

    const anioRaw = anioInput.value.trim();
    const anioValido = anioRaw && Number.isFinite(parseInt(anioRaw, 10)) ? parseInt(anioRaw, 10) : null;

    const id = await DB.addLote({
      especieId: especieIdSeleccionado,
      nombreLibre: especieIdSeleccionado ? null : especieTexto,
      variedad: root.querySelector('#f-variedad').value.trim() || null,
      tipoMaterial: tipoMaterialSeleccionado,
      tipoCantidad: tipoCantidadSeleccionado,
      cantidad: esNumerica ? cantidadValida : null,
      unidad: esNumerica ? (root.querySelector('#f-unidad').value.trim() || null) : null,
      cantidadCualitativa: tipoCantidadSeleccionado === 'cualitativa' ? cantidadCualitativaSeleccionada : null,
      procedencia: procedenciaSeleccionada || null,
      fechaReferencia: fechaInput.value || null,
      anioReferencia: anioValido,
      ubicacionFisica: root.querySelector('#f-ubicacion').value.trim() || null,
      nota: root.querySelector('#f-nota').value.trim() || null,
      fotoId,
    });

    showToast('Lote agregado al Banco 🌰');
    navigate(`#/banco/${id}`);
  });
}
