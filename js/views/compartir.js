// views/compartir.js — modal "Compartir resumen": preview + Web Share API
// + fallback "Guardar imagen". Construido enteramente sobre
// generarResumenCultivo()/dibujarTarjetaCultivo() (motor-resumen.js /
// motor-tarjeta.js) — este archivo es SOLO interfaz: formato, elegir
// foto, checkbox de reflexión, y los dos botones de salida. Nada de
// edición (sin mover texto, sin colores, sin filtros — punto final del
// pedido: "Cultivarnos genera una linda placa automáticamente, eso YA es
// el valor").

async function abrirCompartirResumen(cultivoId) {
  const [cultivo, eventos, fotosReales] = await Promise.all([
    DB.getCultivo(cultivoId),
    DB.getEventosByCultivo(cultivoId),
    DB.getFotosByCultivo(cultivoId),
  ]);
  const resumen = generarResumenCultivo(cultivo, eventos);
  const tieneReflexion = !!(resumen.finalizacion && resumen.finalizacion.nota);

  let formato = 'publicacion';
  // null = usar la resolución por defecto (foto real más reciente, o si
  // no hay ninguna, la ilustración botánica — mismo orden que
  // obtenerImagenCultivo ya usa en el resto de la app).
  let fotoIdSeleccionada = null;
  let incluirReflexion = false;
  let blobActual = null;
  let generacionId = 0; // evita pintar una preview vieja si el usuario cambia de opción rápido

  const { backdrop, close } = createModal(`
    <div class="modal-sheet">
      <div class="modal-close-row"><button id="modal-close">✕</button></div>
      <h2>Compartir resumen</h2>
      <div class="chip-group" id="compartir-formato">
        <div class="chip-option selected" data-value="publicacion">Publicación · 4:5</div>
        <div class="chip-option" data-value="historia">Historia · 9:16</div>
      </div>
      <div class="compartir-preview-wrap">
        <canvas id="compartir-preview" class="compartir-preview"></canvas>
      </div>
      ${fotosReales.length ? `<button type="button" id="compartir-elegir-foto" class="link-ver-todas">🖼 Elegir foto</button>
      <div class="compartir-foto-grid hidden" id="compartir-foto-grid"></div>` : ''}
      ${tieneReflexion ? `
      <div class="form-group">
        <label class="form-label checkbox-row">
          <input type="checkbox" id="compartir-reflexion" />
          Incluir reflexión final
        </label>
      </div>` : ''}
      <p class="siembra-modal-info compartir-estado" id="compartir-estado">Preparando la tarjeta…</p>
      <button type="button" id="compartir-btn-compartir" class="btn-primary hidden">Compartir</button>
      <button type="button" id="compartir-btn-guardar" class="btn-secondary">Guardar imagen</button>
    </div>
  `);
  backdrop.querySelector('#modal-close').addEventListener('click', close);

  const previewCanvas = backdrop.querySelector('#compartir-preview');
  const estadoEl = backdrop.querySelector('#compartir-estado');
  const btnCompartir = backdrop.querySelector('#compartir-btn-compartir');
  const btnGuardar = backdrop.querySelector('#compartir-btn-guardar');

  // Resuelve qué imagen usar: la foto real elegida, o si no se eligió
  // ninguna en particular, el mismo orden de prioridad que ya usa toda la
  // app (obtenerImagenCultivo) — foto real más reciente, y si no hay
  // ninguna, la ilustración botánica. Nunca queda sin imagen.
  async function resolverFotoUrl() {
    if (fotoIdSeleccionada) {
      const url = await fotoUrlCache.getUrl(fotoIdSeleccionada);
      if (url) return url;
    }
    return obtenerImagenCultivo(cultivo, eventos);
  }

  async function regenerar() {
    const miGeneracion = ++generacionId;
    estadoEl.textContent = 'Preparando la tarjeta…';
    btnCompartir.classList.add('hidden');
    const fotoUrl = await resolverFotoUrl();
    const canvas = await dibujarTarjetaCultivo({
      cultivo,
      resumen,
      formato,
      fotoUrl,
      incluirReflexion,
    });
    if (miGeneracion !== generacionId) return; // el usuario ya cambió de opción, descartamos esto

    // Preview a tamaño reducido (mismo canvas final, solo se ajusta el
    // ancho de PANTALLA vía CSS — el archivo que se comparte/guarda sigue
    // siendo el de resolución completa).
    previewCanvas.width = canvas.width;
    previewCanvas.height = canvas.height;
    previewCanvas.getContext('2d').drawImage(canvas, 0, 0);

    blobActual = await canvasATarjetaBlob(canvas);
    if (miGeneracion !== generacionId) return;

    estadoEl.textContent = '';

    // El File se genera ACÁ (fuera del click), y se reutiliza tal cual
    // dentro del handler de "Compartir" — en iOS Safari, share() solo
    // funciona si queda pegado al gesto del usuario sin ningún await
    // previo; si esperáramos a generar el archivo recién al tocar el
    // botón, el navegador podría rechazar la llamada.
    const file = new File([blobActual], nombreArchivoTarjeta(cultivo), { type: 'image/png' });
    const puedeCompartirArchivos = !!(navigator.canShare && navigator.share && navigator.canShare({ files: [file] }));
    btnCompartir.classList.toggle('hidden', !puedeCompartirArchivos);
    btnCompartir.dataset.ready = '1';
    previewCanvas.dataset.fileReady = '1';
    previewCanvas._archivoActual = file;
  }

  backdrop.querySelector('#compartir-formato').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip || chip.dataset.value === formato) return;
    backdrop.querySelectorAll('#compartir-formato .chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    formato = chip.dataset.value;
    regenerar();
  });

  if (tieneReflexion) {
    backdrop.querySelector('#compartir-reflexion').addEventListener('change', (e) => {
      incluirReflexion = e.target.checked;
      regenerar();
    });
  }

  const elegirFotoBtn = backdrop.querySelector('#compartir-elegir-foto');
  if (elegirFotoBtn) {
    const grid = backdrop.querySelector('#compartir-foto-grid');
    let cargado = false;
    elegirFotoBtn.addEventListener('click', async () => {
      const abrir = grid.classList.contains('hidden');
      if (abrir && !cargado) {
        cargado = true;
        grid.innerHTML = await renderFotoGridHtml(fotosReales);
      }
      grid.classList.toggle('hidden', !abrir);
    });
    grid.addEventListener('click', (e) => {
      const item = e.target.closest('.foto-grid-item');
      if (!item) return;
      const foto = fotosReales[Number(item.dataset.index)];
      if (!foto) return;
      fotoIdSeleccionada = foto.fotoId;
      grid.classList.add('hidden');
      regenerar();
    });
  }

  btnGuardar.addEventListener('click', () => {
    if (!blobActual) return;
    const url = URL.createObjectURL(blobActual);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombreArchivoTarjeta(cultivo);
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    showToast('Imagen guardada');
  });

  btnCompartir.addEventListener('click', async () => {
    const file = previewCanvas._archivoActual;
    if (!file || !navigator.share) return;
    try {
      await navigator.share({
        files: [file],
        title: cultivo.especie,
        text: 'Hecho con Cultivarnos 🌱',
      });
    } catch (err) {
      // AbortError = la persona canceló el panel nativo — no es un error
      // real, no hace falta avisar nada.
      if (err && err.name !== 'AbortError') showToast('No se pudo compartir');
    }
  });

  regenerar();
}
