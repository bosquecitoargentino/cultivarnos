// views/configuracion.js — hemisferio (con detección opcional por GPS) y
// campos preparados para región/clima/suelo más adelante. Ajusta las
// sugerencias de temporada; no afecta nada del resto de la app.

async function renderConfiguracion(root) {
  const config = await DB.getConfiguracion();

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>Configuración</h1>
      <p>Esto ajusta las sugerencias de temporada a tu zona.</p>
    </div>

    <section>
      <div class="section-title">Hemisferio</div>
      <div class="chip-group" id="config-hemisferio">
        <div class="chip-option ${config.hemisferio === 'sur' ? 'selected' : ''}" data-value="sur">Sur</div>
        <div class="chip-option ${config.hemisferio === 'norte' ? 'selected' : ''}" data-value="norte">Norte</div>
      </div>
      <button type="button" id="config-geo-btn" class="btn-secondary" style="margin-top:12px;">📍 Usar mi ubicación</button>
      <p class="config-geo-estado" id="config-geo-estado">${textoEstadoUbicacion(config)}</p>
    </section>

    <section>
      <p class="config-nota">Más adelante vamos a poder afinar esto con región, clima y tipo de suelo.</p>
    </section>
  `;

  const chipGroup = root.querySelector('#config-hemisferio');
  chipGroup.addEventListener('click', async (e) => {
    const chip = e.target.closest('.chip-option');
    if (!chip) return;
    chipGroup.querySelectorAll('.chip-option').forEach((c) => c.classList.remove('selected'));
    chip.classList.add('selected');
    await DB.setConfiguracion({ hemisferio: chip.dataset.value });
    showToast('Hemisferio guardado');
  });

  const geoBtn = root.querySelector('#config-geo-btn');
  const geoEstado = root.querySelector('#config-geo-estado');

  geoBtn.addEventListener('click', () => {
    if (!('geolocation' in navigator)) {
      showToast('Este dispositivo no permite compartir ubicación');
      return;
    }
    geoBtn.disabled = true;
    geoEstado.textContent = 'Buscando tu ubicación...';

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Redondeamos a 1 decimal: precisión de barrio/zona, suficiente
        // para hemisferio y una futura estimación de clima, sin guardar
        // la ubicación exacta.
        const lat = Math.round(pos.coords.latitude * 10) / 10;
        const lon = Math.round(pos.coords.longitude * 10) / 10;
        const hemisferio = lat >= 0 ? 'norte' : 'sur';
        const nueva = await DB.setConfiguracion({ lat, lon, hemisferio });

        chipGroup.querySelectorAll('.chip-option').forEach((c) => {
          c.classList.toggle('selected', c.dataset.value === hemisferio);
        });
        geoEstado.textContent = textoEstadoUbicacion(nueva);
        geoBtn.disabled = false;
        showToast('Ubicación guardada');
      },
      () => {
        geoEstado.textContent = 'No se pudo obtener tu ubicación. Podés elegir el hemisferio a mano, arriba.';
        geoBtn.disabled = false;
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
    );
  });
}

function textoEstadoUbicacion(config) {
  if (config.lat == null || config.lon == null) {
    return 'Todavía no guardaste tu ubicación. Podés elegir el hemisferio a mano, arriba.';
  }
  return `Ubicación aproximada guardada (${config.lat}, ${config.lon}).`;
}
