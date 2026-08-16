// views/banco-detalle.js — ficha de un Lote del Banco: datos, foto (con el
// mismo fallback en cascada que el resto de la app), editar y eliminar. El
// Banco es independiente de cultivos/Biblioteca — eliminar un lote nunca
// toca ningún otro store.

// Copia local a propósito (no se comparte con banco-nuevo.js): mismo
// criterio que ya usa la app entre nuevo.js y el modal de editar cultivo
// en detalle.js — cada formulario arma sus propios campos, sin acoplar
// dos archivos de vista distintos entre sí solo para ahorrar unas líneas.
const PROCEDENCIAS_LOTE_CON_VACIO_EDIT = [{ id: '', label: 'No registrado' }, ...PROCEDENCIAS_LOTE];

function loteFilaDato(icono, label, valor) {
  if (!valor) return '';
  return `
    <div class="ficha-fila">
      <span class="ficha-fila-icono">${icono}</span>
      <div class="ficha-fila-texto">
        <span class="ficha-fila-label">${escapeHtml(label)}</span>
        <span class="ficha-fila-valor">${escapeHtml(valor)}</span>
      </div>
    </div>
  `;
}

async function renderBancoDetalle(id, root) {
  root = root || APP_ROOT;
  const lote = await DB.getLote(id);

  if (!lote) {
    root.innerHTML = `
      <div class="view-header view-header-compacto">
        <a href="#/banco" class="volver-link">‹ Banco</a>
      </div>
      <div class="empty-state"><span class="emoji">🌰</span>Este lote ya no existe.</div>
    `;
    return;
  }

  const especie = resolverEspecieLote(lote);
  const tipo = obtenerTipoMaterial(lote.tipoMaterial) || {};
  const procedencia = obtenerProcedencia(lote.procedencia);
  const referenciaCompleta = lote.fechaReferencia ? formatFecha(lote.fechaReferencia) : (lote.anioReferencia ? String(lote.anioReferencia) : null);

  // Foto: propia -> imagen botánica de Biblioteca si la especie está
  // vinculada -> sin imagen (la CSS ya resuelve ese caso con un fondo
  // verde suave, sin romper el layout — mismo mecanismo que el resto de
  // la app, ningún código nuevo necesario para ese último escalón).
  let fotoUrl = null;
  if (lote.fotoId) {
    fotoUrl = await fotoUrlCache.getUrl(lote.fotoId);
  }
  if (!fotoUrl && especie.imagen) {
    fotoUrl = especie.imagen;
  }

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <a href="#/banco" class="volver-link">‹ Banco</a>
    </div>

    <div class="ficha-hero">
      <div class="ficha-hero-photo" style="${fotoUrl ? `background-image:url('${fotoUrl}')` : ''}">
        ${fotoUrl ? '' : (tipo.icono || '🌱')}
      </div>
      <div class="ficha-hero-body">
        <div class="ficha-hero-nombre">${escapeHtml(especie.nombre)}</div>
        ${lote.variedad ? `<div class="ficha-hero-cientifico">${escapeHtml(lote.variedad)}</div>` : ''}
        <div class="detalle-badges">
          <span class="badge">${tipo.icono || '🌱'} ${escapeHtml(tipo.label || 'Otro')}</span>
        </div>
      </div>
    </div>

    <section class="ficha-seccion">
      ${loteFilaDato('⚖️', 'Cantidad', formatearCantidadLote(lote))}
      ${loteFilaDato('📦', 'Procedencia', procedencia ? procedencia.label : null)}
      ${loteFilaDato('🗓️', 'Referencia', referenciaCompleta)}
      ${loteFilaDato('📍', 'Guardado en', lote.ubicacionFisica)}
      ${lote.nota ? `
        <div class="ficha-fila">
          <span class="ficha-fila-icono">📝</span>
          <div class="ficha-fila-texto">
            <span class="ficha-fila-label">Nota</span>
            <span class="ficha-fila-valor">${escapeHtml(lote.nota)}</span>
          </div>
        </div>
      ` : ''}
    </section>

    <button type="button" id="btn-editar-lote" class="btn-secondary" style="margin-top:8px;">✏️ Editar</button>
    <button type="button" id="btn-eliminar-lote" class="btn-danger" style="margin-top:8px;">Eliminar lote</button>
  `;

  root.querySelector('#btn-editar-lote').addEventListener('click', () => {
    abrirModalEditarLote(lote, () => renderBancoDetalle(id, root));
  });

  root.querySelector('#btn-eliminar-lote').addEventListener('click', async () => {
    if (!window.confirm('¿Eliminar este lote del Banco?')) return;
    await DB.deleteLoteCompleto(id);
    showToast('Lote eliminado');
    navigate('#/banco');
  });
}

// ---------------------------------------------------------------------
// Editar: mismos campos que el alta (views/banco-nuevo.js), en un modal —
// mismo criterio que ya usa detalle.js para editar un cultivo (campos
// propios del modal, sin compartir código con la vista de alta).
// ---------------------------------------------------------------------
function abrirModalEditarLote(lote, onDone) {
  let especieIdSeleccionado = lote.especieId || null;
  let especieTextoInicial = lote.especieId ? resolverEspecieLote(lote).nombre : (lote.nombreLibre || '');
  let tipoMaterialSeleccionado = lote.tipoMaterial;
  let tipoCantidadSeleccionado = lote.tipoCantidad || 'desconocida';
  let cantidadCualitativaSeleccionada = lote.cantidadCualitativa || 'media';
  let procedenciaSeleccionada = lote.procedencia || '';
  let fotoBlob = null;
  let fotoEliminada = false;
  let fotoPreviewUrl = null;

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Editar lote</h2>

      <div class="form-group">
        <label class="form-label">Especie</label>
        <input type="text" id="edit-especie" class="form-input" value="${escapeHtml(especieTextoInicial)}" autocomplete="off" />
        <div id="edit-especie-sugerencias" class="especie-sugerencias hidden"></div>
      </div>

      <div class="form-group">
        <label class="form-label">¿Qué guardaste?</label>
        <div class="chip-group" id="edit-tipo-material">
          ${TIPOS_MATERIAL_PROPAGACION.map((t) => `<div class="chip-option ${t.id === tipoMaterialSeleccionado ? 'selected' : ''}" data-value="${t.id}">${t.icono} ${escapeHtml(t.label)}</div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Cantidad</label>
        <div class="chip-group" id="edit-tipo-cantidad">
          <div class="chip-option ${tipoCantidadSeleccionado === 'exacta' ? 'selected' : ''}" data-value="exacta">Exacta</div>
          <div class="chip-option ${tipoCantidadSeleccionado === 'aproximada' ? 'selected' : ''}" data-value="aproximada">Aproximada</div>
          <div class="chip-option ${tipoCantidadSeleccionado === 'cualitativa' ? 'selected' : ''}" data-value="cualitativa">Cualitativa</div>
          <div class="chip-option ${tipoCantidadSeleccionado === 'desconocida' ? 'selected' : ''}" data-value="desconocida">No registrar</div>
        </div>
        <div style="height:10px"></div>
        <div id="edit-cantidad-numerica" class="cantidad-numerica-row">
          <input type="number" id="edit-cantidad-num" class="form-input" min="0" step="1" inputmode="numeric" placeholder="Cantidad" value="${lote.cantidad != null ? lote.cantidad : ''}" />
          <input type="text" id="edit-unidad" class="form-input" placeholder="unidad" autocomplete="off" value="${escapeHtml(lote.unidad || unidadPorTipoMaterial(tipoMaterialSeleccionado) || '')}" />
        </div>
        <div class="chip-group hidden" id="edit-cantidad-cualitativa">
          ${CANTIDADES_CUALITATIVAS.map((c) => `<div class="chip-option ${c.id === cantidadCualitativaSeleccionada ? 'selected' : ''}" data-value="${c.id}">${escapeHtml(c.label)}</div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Variedad <span class="optional">(opcional)</span></label>
        <input type="text" id="edit-variedad" class="form-input" value="${escapeHtml(lote.variedad || '')}" autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label">Procedencia <span class="optional">(opcional)</span></label>
        <div class="chip-group" id="edit-procedencia">
          ${PROCEDENCIAS_LOTE_CON_VACIO_EDIT.map((p) => `<div class="chip-option ${p.id === procedenciaSeleccionada ? 'selected' : ''}" data-value="${p.id}">${escapeHtml(p.label)}</div>`).join('')}
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Referencia temporal <span class="optional">(opcional)</span></label>
        <input type="date" id="edit-fecha-referencia" class="form-input" value="${lote.fechaReferencia || ''}" />
        <div style="height:8px"></div>
        <input type="number" id="edit-anio-referencia" class="form-input" min="1900" max="2100" step="1" inputmode="numeric" value="${lote.anioReferencia || ''}" placeholder="Solo el año" />
      </div>

      <div class="form-group">
        <label class="form-label">¿Dónde lo guardás? <span class="optional">(opcional)</span></label>
        <input type="text" id="edit-ubicacion" class="form-input" value="${escapeHtml(lote.ubicacionFisica || '')}" autocomplete="off" list="edit-ubicacion-datalist" />
      </div>

      <div class="form-group">
        <label class="form-label">Nota <span class="optional">(opcional)</span></label>
        <textarea id="edit-nota" class="form-textarea">${escapeHtml(lote.nota || '')}</textarea>
      </div>

      <div class="form-group">
        <label class="form-label">Fotografía <span class="optional">(opcional)</span></label>
        <div class="photo-picker" id="edit-photo-picker" role="button" tabindex="0" aria-label="Agregar fotografía">
          <span class="photo-picker-placeholder">
            <span class="emoji">📷</span>
            <span>Tocá para agregar una foto</span>
          </span>
          <button type="button" class="remove-photo hidden" id="edit-photo-remove">✕</button>
          <input type="file" id="edit-foto" accept="image/*" capture="environment" hidden />
        </div>
      </div>

      <p class="siembra-modal-error hidden" id="edit-error"></p>
      <button type="button" id="edit-guardar" class="btn-primary">Guardar cambios</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  if (typeof obtenerUbicacionesLoteUsadas === 'function' && typeof datalistUbicacionesHtml === 'function') {
    obtenerUbicacionesLoteUsadas().then((ubicaciones) => {
      if (!ubicaciones.length) return;
      const wrap = document.createElement('div');
      wrap.innerHTML = datalistUbicacionesHtml('edit-ubicacion-datalist', ubicaciones);
      backdrop.appendChild(wrap.firstElementChild);
    });
  }

  // Foto actual, si tiene
  const photoPicker = backdrop.querySelector('#edit-photo-picker');
  const fotoInput = backdrop.querySelector('#edit-foto');
  const photoPlaceholder = backdrop.querySelector('.photo-picker-placeholder');
  const photoRemoveBtn = backdrop.querySelector('#edit-photo-remove');
  if (lote.fotoId) {
    fotoUrlCache.getUrl(lote.fotoId).then((url) => {
      if (!url) return;
      photoPicker.style.backgroundImage = `url('${url}')`;
      photoPicker.classList.add('has-photo');
      photoPlaceholder.classList.add('hidden');
      photoRemoveBtn.classList.remove('hidden');
    });
  }

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
    fotoEliminada = false;
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
    fotoEliminada = true;
    if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
    fotoPreviewUrl = null;
    fotoInput.value = '';
    photoPicker.style.backgroundImage = '';
    photoPicker.classList.remove('has-photo');
    photoPlaceholder.classList.remove('hidden');
    photoRemoveBtn.classList.add('hidden');
  });

  // Especie: mismo mecanismo de búsqueda/nombre libre que el alta.
  const especieInput = backdrop.querySelector('#edit-especie');
  const especieSugerencias = backdrop.querySelector('#edit-especie-sugerencias');
  especieInput.addEventListener('input', () => {
    especieIdSeleccionado = null;
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
  });
  especieSugerencias.addEventListener('click', (e) => {
    const item = e.target.closest('.especie-sugerencia');
    if (!item) return;
    if (!item.dataset.libre) {
      especieIdSeleccionado = item.dataset.id;
      especieInput.value = getEspecie(item.dataset.id).identidad.nombre;
    }
    especieSugerencias.innerHTML = '';
    especieSugerencias.classList.add('hidden');
  });

  const tipoGroup = backdrop.querySelector('#edit-tipo-material');
  tipoGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    tipoMaterialSeleccionado = chip.dataset.value;
  });

  const tipoCantidadGroup = backdrop.querySelector('#edit-tipo-cantidad');
  const cantidadNumericaRow = backdrop.querySelector('#edit-cantidad-numerica');
  const cantidadCualitativaGroup = backdrop.querySelector('#edit-cantidad-cualitativa');
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

  const procedenciaGroup = backdrop.querySelector('#edit-procedencia');
  procedenciaGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    procedenciaGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    procedenciaSeleccionada = chip.dataset.value;
  });

  const errorEl = backdrop.querySelector('#edit-error');
  backdrop.querySelector('#edit-guardar').addEventListener('click', async () => {
    const especieTexto = especieInput.value.trim();
    if (!especieTexto) {
      errorEl.textContent = 'La especie no puede quedar vacía.';
      errorEl.classList.remove('hidden');
      return;
    }

    let fotoId = lote.fotoId || null;
    if (fotoBlob) {
      fotoId = await DB.addFoto(fotoBlob);
      if (lote.fotoId) await DB.deleteFoto(lote.fotoId);
    } else if (fotoEliminada && lote.fotoId) {
      await DB.deleteFoto(lote.fotoId);
      fotoId = null;
    }

    const cantidadNumRaw = backdrop.querySelector('#edit-cantidad-num').value.trim();
    const cantidadNum = cantidadNumRaw ? parseInt(cantidadNumRaw, 10) : null;
    const cantidadValida = Number.isFinite(cantidadNum) && cantidadNum >= 0 ? cantidadNum : null;
    const esNumerica = tipoCantidadSeleccionado === 'exacta' || tipoCantidadSeleccionado === 'aproximada';

    const anioRaw = backdrop.querySelector('#edit-anio-referencia').value.trim();
    const anioValido = anioRaw && Number.isFinite(parseInt(anioRaw, 10)) ? parseInt(anioRaw, 10) : null;

    await DB.updateLote(lote.id, {
      especieId: especieIdSeleccionado,
      nombreLibre: especieIdSeleccionado ? null : especieTexto,
      variedad: backdrop.querySelector('#edit-variedad').value.trim() || null,
      tipoMaterial: tipoMaterialSeleccionado,
      tipoCantidad: tipoCantidadSeleccionado,
      cantidad: esNumerica ? cantidadValida : null,
      unidad: esNumerica ? (backdrop.querySelector('#edit-unidad').value.trim() || null) : null,
      cantidadCualitativa: tipoCantidadSeleccionado === 'cualitativa' ? cantidadCualitativaSeleccionada : null,
      procedencia: procedenciaSeleccionada || null,
      fechaReferencia: backdrop.querySelector('#edit-fecha-referencia').value || null,
      anioReferencia: anioValido,
      ubicacionFisica: backdrop.querySelector('#edit-ubicacion').value.trim() || null,
      nota: backdrop.querySelector('#edit-nota').value.trim() || null,
      fotoId,
    });

    close();
    showToast('Lote actualizado');
    onDone();
  });
}
