// views/nuevo.js — vista Nuevo cultivo

function renderNuevo(root) {
  let fotoBlob = null;
  let fotoPreviewUrl = null;
  let tipoInicioSeleccionado = 'semilla';

  root.innerHTML = `
    <div class="view-header">
      <h1>Nuevo cultivo</h1>
      <p>Registrá lo esencial. Podés sumar más detalles después.</p>
    </div>

    <form id="form-nuevo">
      <div class="form-group">
        <label class="form-label">Especie</label>
        <input type="text" id="f-especie" class="form-input" placeholder="Ej: Tomate, Albahaca, Ficus..." required autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label">Variedad <span class="optional">(opcional)</span></label>
        <input type="text" id="f-variedad" class="form-input" placeholder="Ej: Cherry, San Marzano..." autocomplete="off" />
      </div>

      <div class="form-group">
        <label class="form-label">Tipo de inicio</label>
        <div class="chip-group" id="f-tipo-inicio">
          <div class="chip-option selected" data-value="semilla">Semilla</div>
          <div class="chip-option" data-value="plantin">Plantín</div>
          <div class="chip-option" data-value="trasplante">Trasplante</div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Fecha de inicio</label>
        <input type="date" id="f-fecha" class="form-input" required />
      </div>

      <div class="form-group">
        <label class="form-label">Ubicación <span class="optional">(opcional)</span></label>
        <input type="text" id="f-ubicacion" class="form-input" placeholder="Ej: Balcón, Huerta, Maceta 3..." autocomplete="off" />
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

      <div class="form-group">
        <label class="form-label">Nota <span class="optional">(opcional)</span></label>
        <textarea id="f-nota" class="form-textarea" placeholder="Algo que quieras recordar..."></textarea>
      </div>

      <div class="form-group">
        <label class="form-label checkbox-row">
          <input type="checkbox" id="f-recordatorio-check" />
          Agregar recordatorio
        </label>
      </div>

      <div class="form-group hidden" id="f-recordatorio-group">
        <label class="form-label">Recordar el</label>
        <input type="date" id="f-recordatorio-fecha" class="form-input" />
        <div style="height:8px"></div>
        <input type="text" id="f-recordatorio-titulo" class="form-input" placeholder="Ej: Regar, Fertilizar..." />
      </div>

      <button type="submit" class="btn-primary">Guardar cultivo</button>
    </form>
  `;

  root.querySelector('#f-fecha').value = todayIsoDate();

  // Tipo de inicio chips
  const tipoGroup = root.querySelector('#f-tipo-inicio');
  tipoGroup.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    tipoGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    tipoInicioSeleccionado = chip.dataset.value;
  });

  // Recordatorio toggle
  const recCheck = root.querySelector('#f-recordatorio-check');
  const recGroup = root.querySelector('#f-recordatorio-group');
  recCheck.addEventListener('change', () => {
    recGroup.classList.toggle('hidden', !recCheck.checked);
    if (recCheck.checked && !root.querySelector('#f-recordatorio-fecha').value) {
      const d = new Date();
      d.setDate(d.getDate() + 3);
      root.querySelector('#f-recordatorio-fecha').value = d.toISOString().slice(0, 10);
    }
  });

  // Foto picker
  const photoPicker = root.querySelector('#f-photo-picker');
  const fotoInput = root.querySelector('#f-foto');
  const photoPlaceholder = root.querySelector('.photo-picker-placeholder');
  const photoRemoveBtn = root.querySelector('#f-photo-remove');

  // Control propio (no <label>): un único camino determinístico para abrir
  // el selector de archivos, sin depender del reenvío nativo label->input
  // (que falla de forma inconsistente en varios navegadores móviles).
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

  root.querySelector('#form-nuevo').addEventListener('submit', async (e) => {
    e.preventDefault();
    const especie = root.querySelector('#f-especie').value.trim();
    if (!especie) { showToast('Ingresá una especie'); return; }
    const fecha = root.querySelector('#f-fecha').value || todayIsoDate();

    let fotoId = null;
    if (fotoBlob) {
      fotoId = await DB.addFoto(fotoBlob);
    }

    const nota = root.querySelector('#f-nota').value.trim() || null;

    const cultivoId = await DB.addCultivo({
      especie,
      variedad: root.querySelector('#f-variedad').value.trim() || null,
      tipoInicio: tipoInicioSeleccionado,
      fechaInicio: fecha,
      ubicacion: root.querySelector('#f-ubicacion').value.trim() || null,
      fotoId,
      nota,
      estado: 'activo',
    });

    // Evento inicial automático: así la ficha arranca su línea de tiempo
    // desde el registro, sin pedirle un paso extra a quien está cargando.
    await DB.addEvento({
      cultivoId,
      tipo: 'siembra',
      fecha,
      nota,
      fotoId,
    });

    if (recCheck.checked) {
      const recFecha = root.querySelector('#f-recordatorio-fecha').value;
      const recTitulo = root.querySelector('#f-recordatorio-titulo').value.trim();
      if (recFecha && recTitulo) {
        await DB.addRecordatorio({ cultivoId, titulo: recTitulo, fecha: recFecha, estado: 'pendiente' });
      }
    }

    showToast('Cultivo registrado 🌱');

    // Si la especie es reconocida y arrancó de semilla, ofrecemos un primer
    // seguimiento (ej. "Revisar germinación"). Nunca se crea sin
    // confirmación — si no hay sugerencia o la persona ya cargó su propio
    // recordatorio arriba, vamos directo a la ficha sin interrumpir nada.
    const especieId = identificarEspecie(especie);
    const sugerencia = sugerenciaSeguimientoInicial(especieId, tipoInicioSeleccionado);
    if (sugerencia && !recCheck.checked) {
      mostrarSeguimientoSugerido(root, cultivoId, especie, sugerencia);
    } else {
      navigate(`#/cultivo/${cultivoId}`);
    }
  });
}

// Pantalla breve de confirmación tras guardar el cultivo, con el
// seguimiento inicial sugerido (motor-observacion.js decide el qué y el
// cuándo; acá solo se muestra y se pide confirmación explícita).
function mostrarSeguimientoSugerido(root, cultivoId, especie, sugerencia) {
  root.innerHTML = `
    <div class="creado-confirmacion">
      <div class="creado-icono">🌱</div>
      <div class="creado-titulo">${escapeHtml(especie)} registrado</div>
      <div class="observar-oferta creado-oferta">
        <span>Seguimiento sugerido: ${escapeHtml(sugerencia.titulo)} · dentro de ${sugerencia.dias} días</span>
        <div class="observar-oferta-botones">
          <button type="button" id="seguimiento-si" class="pill-btn">Crear recordatorio</button>
          <button type="button" id="seguimiento-no" class="pill-btn">Ahora no</button>
        </div>
      </div>
      <button type="button" id="ir-a-cultivo" class="btn-primary">Ver cultivo →</button>
    </div>
  `;

  root.querySelector('#seguimiento-si').addEventListener('click', async () => {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() + sugerencia.dias);
    await DB.addRecordatorio({
      cultivoId,
      titulo: sugerencia.titulo,
      fecha: fecha.toISOString().slice(0, 10),
      estado: 'pendiente',
    });
    showToast('Recordatorio creado');
    navigate(`#/cultivo/${cultivoId}`);
  });
  root.querySelector('#seguimiento-no').addEventListener('click', () => navigate(`#/cultivo/${cultivoId}`));
  root.querySelector('#ir-a-cultivo').addEventListener('click', () => navigate(`#/cultivo/${cultivoId}`));
}
