// views/configuracion.js — hemisferio (con detección opcional por GPS) y
// campos preparados para región/clima/suelo más adelante. Ajusta las
// sugerencias de temporada; no afecta nada del resto de la app.

async function renderConfiguracion(root) {
  const config = await DB.getConfiguracion();
  const version = await obtenerVersionApp();
  const notificacionesHtml = await seccionNotificacionesHtml();

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <h1>Configuración</h1>
      <p>Esto ajusta las sugerencias de temporada a tu zona.</p>
    </div>

    ${seccionCuentaHtml()}

    ${notificacionesHtml}

    <section>
      <div class="section-title">Hemisferio</div>
      <div class="chip-group" id="config-hemisferio">
        <div class="chip-option ${config.hemisferio === 'sur' ? 'selected' : ''}" data-value="sur">Sur</div>
        <div class="chip-option ${config.hemisferio === 'norte' ? 'selected' : ''}" data-value="norte">Norte</div>
      </div>
      <button type="button" id="config-geo-btn" class="btn-secondary" style="margin-top:12px;">Usar mi ubicación</button>
      <p class="config-geo-estado" id="config-geo-estado">${textoEstadoUbicacion(config)}</p>
    </section>

    <section>
      <p class="config-nota">Más adelante vamos a poder afinar esto con región, clima y tipo de suelo.</p>
    </section>

    <section>
      <div class="section-title">Datos y respaldo</div>
      <button type="button" id="config-btn-export" class="btn-secondary">Exportar respaldo</button>
      <p class="config-respaldo-fecha" id="config-respaldo-fecha">${textoUltimoRespaldo(config)}</p>
      <label class="link-small config-import-link" for="config-input-import">Importar respaldo</label>
      <input type="file" id="config-input-import" accept="application/json" hidden />
    </section>

    ${version ? `
    <section class="config-footer">
      <p class="config-version">Cultivarnos · Versión ${escapeHtml(version)}</p>
    </section>` : ''}
  `;

  vincularSeccionCuenta(root);
  vincularSeccionNotificaciones(root);

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

  // Datos y respaldo — misma lógica compartida (utils.js) que usa el menú
  // superior; acá solo agregamos el refresco de la fecha del último
  // respaldo, que es lo nuevo de esta pantalla.
  const respaldoFechaEl = root.querySelector('#config-respaldo-fecha');
  root.querySelector('#config-btn-export').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await exportarRespaldo();
      const actual = await DB.getConfiguracion();
      respaldoFechaEl.textContent = textoUltimoRespaldo(actual);
      showToast('Respaldo exportado');
    } catch (err) {
      console.error(err);
      showToast('Error al exportar');
    } finally {
      btn.disabled = false;
    }
  });

  root.querySelector('#config-input-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      // Mismo orden obligatorio que el menú superior: leer + parsear +
      // validar ANTES de preguntar por el reemplazo. Un archivo inválido
      // nunca llega a tocar IndexedDB ni a mostrar el diálogo de confirmar.
      const data = await leerRespaldoDesdeArchivo(file);
      const confirmMsg = 'Importar reemplazará todos los datos actuales por los del respaldo. ¿Continuar?';
      if (!window.confirm(confirmMsg)) { e.target.value = ''; return; }
      await DB.importAll(data, { replace: true });
      showToast('Datos importados');
      renderConfiguracion(root);
    } catch (err) {
      console.error(err);
      showToast(err.message || 'Error al importar el archivo');
    } finally {
      e.target.value = '';
    }
  });
}

function textoEstadoUbicacion(config) {
  if (config.lat == null || config.lon == null) {
    return 'Todavía no guardaste tu ubicación. Podés elegir el hemisferio a mano, arriba.';
  }
  return `Ubicación aproximada guardada (${config.lat}, ${config.lon}).`;
}

function textoUltimoRespaldo(config) {
  if (!config.ultimoRespaldo) return 'Todavía no hiciste un respaldo.';
  return `Último respaldo: ${formatFecha(config.ultimoRespaldo)}`;
}

// ---------------------------------------------------------------------
// Cuenta (Firebase Authentication + Sync Engine) — usuario, email,
// estado de sincronización, cerrar sesión, restablecer contraseña. Es un
// snapshot al momento de renderizar (mismo criterio que el resto de esta
// pantalla: se lee una vez, sin suscripción en vivo — volver a entrar
// acá refresca el estado; no hay "estado pendiente" mostrado con
// insistencia en ningún otro lado, esto es discreto a propósito). Si
// CultivarnosAuth no existe (el módulo no cargó) o no hay sesión, la
// sección no se muestra — no debería ser alcanzable de todos modos, el
// gate de app.js ya manda a /bienvenida sin sesión.
// ---------------------------------------------------------------------

function seccionCuentaHtml() {
  if (!window.CultivarnosAuth) return '';
  const est = window.CultivarnosAuth.getEstado();
  if (!est.usuario) return '';

  const estSync = window.CultivarnosSync ? window.CultivarnosSync.obtenerEstado() : { estado: 'inactivo' };
  const textoSync = {
    sincronizado: '✓ Sincronizado',
    sincronizando: 'Sincronizando…',
    pendiente: 'Pendiente de sincronizar',
    'sin-conexion': 'Sin conexión — se sincroniza cuando vuelva',
    'espera-decision-huerta-local': 'Pendiente de sincronizar',
    inactivo: 'Sin sincronizar',
  }[estSync.estado] || 'Sin sincronizar';

  const username = (est.perfil && est.perfil.username) || '(sin nombre de usuario)';
  const email = est.usuario.email || '';
  const esProveedorPassword = est.usuario.providerId !== 'google.com';

  return `
    <section>
      <div class="section-title">Cuenta</div>
      <div class="cuenta-fila"><span>Usuario</span><span>${escapeHtml(username)}</span></div>
      ${email ? `<div class="cuenta-fila"><span>Email</span><span>${escapeHtml(email)}</span></div>` : ''}
      <div class="cuenta-fila"><span>Sincronización</span><span>${escapeHtml(textoSync)}</span></div>
      ${esProveedorPassword ? '<button type="button" id="cuenta-btn-restablecer" class="link-small">Restablecer contraseña</button>' : ''}
      <button type="button" id="cuenta-btn-cerrar-sesion" class="btn-secondary" style="margin-top:10px;">Cerrar sesión</button>
    </section>
  `;
}

function vincularSeccionCuenta(root) {
  const btnCerrar = root.querySelector('#cuenta-btn-cerrar-sesion');
  if (btnCerrar) {
    btnCerrar.addEventListener('click', async () => {
      btnCerrar.disabled = true;
      await window.CultivarnosAuth.cerrarSesion();
      // CultivarnosAuth.onCambio() en app.js manda a /bienvenida solo.
    });
  }

  const btnRestablecer = root.querySelector('#cuenta-btn-restablecer');
  if (btnRestablecer) {
    btnRestablecer.addEventListener('click', async () => {
      const est = window.CultivarnosAuth.getEstado();
      if (!est.usuario || !est.usuario.email) return;
      btnRestablecer.disabled = true;
      const resultado = await window.CultivarnosAuth.enviarRecuperarPassword(est.usuario.email);
      showToast((resultado && resultado.mensaje) || (resultado.ok ? 'Listo' : 'No se pudo enviar el correo'));
      btnRestablecer.disabled = false;
    });
  }
}

// ---------------------------------------------------------------------
// Notificaciones (Push — Firebase Cloud Messaging). Igual que la sección
// Cuenta, es un snapshot al momento de renderizar (no hay suscripción en
// vivo acá tampoco). NUNCA pide permiso solo por entrar a esta pantalla —
// eso pasa recién si la persona toca "Activar notificaciones" (mismo
// principio del pedido: nunca pedir permiso automáticamente).
//
// Estados de Notification.permission:
//  - 'unsupported' (navegador sin soporte): la sección no se muestra en
//    absoluto — la app sigue funcionando normalmente, sin nada raro que
//    explicar acá.
//  - 'denied': no hay nada para ofrecer (el navegador no deja volver a
//    preguntar por JS) — se explica en una sola línea, sin insistir.
//  - 'default'/'granted' sin dispositivo activo todavía: botón "Activar
//    notificaciones".
//  - 'granted' con dispositivo activo: dos preferencias independientes
//    (Recordatorios / Sugerencias de cultivo) + "Desactivar
//    notificaciones en este dispositivo".
// ---------------------------------------------------------------------

async function seccionNotificacionesHtml() {
  if (!window.CultivarnosPush) return '';
  const estado = window.CultivarnosPush.estadoPermiso();
  if (estado === 'unsupported') return '';

  if (estado === 'denied') {
    return `
      <section>
        <div class="section-title">Notificaciones</div>
        <p class="config-nota">Notificaciones bloqueadas en este dispositivo. Para activarlas, hay que habilitarlas desde los permisos del navegador o del teléfono.</p>
      </section>
    `;
  }

  const dispositivo = estado === 'granted' ? await window.CultivarnosPush.obtenerEstadoDispositivo() : null;
  const activo = !!(dispositivo && dispositivo.enabled);

  if (!activo) {
    return `
      <section>
        <div class="section-title">Notificaciones</div>
        <p class="config-nota">Notificaciones desactivadas</p>
        <button type="button" id="push-btn-activar" class="btn-secondary">Activar notificaciones</button>
      </section>
    `;
  }

  const remindersOn = dispositivo.remindersEnabled !== false;
  const suggestionsOn = dispositivo.suggestionsEnabled !== false;
  return `
    <section>
      <div class="section-title">Notificaciones</div>
      <p class="config-nota">Notificaciones del dispositivo: Activadas</p>
      <label class="form-label checkbox-row">
        <input type="checkbox" id="push-check-recordatorios" ${remindersOn ? 'checked' : ''} />
        Recordatorios
      </label>
      <label class="form-label checkbox-row">
        <input type="checkbox" id="push-check-sugerencias" ${suggestionsOn ? 'checked' : ''} />
        Sugerencias de cultivo
      </label>
      <button type="button" id="push-btn-desactivar" class="btn-secondary" style="margin-top:10px;">Desactivar notificaciones</button>
    </section>
  `;
}

function vincularSeccionNotificaciones(root) {
  const btnActivar = root.querySelector('#push-btn-activar');
  if (btnActivar) {
    btnActivar.addEventListener('click', async () => {
      btnActivar.disabled = true;
      const resultado = await window.CultivarnosPush.activar();
      showToast(resultado.mensaje);
      renderConfiguracion(root);
    });
  }

  const btnDesactivar = root.querySelector('#push-btn-desactivar');
  if (btnDesactivar) {
    btnDesactivar.addEventListener('click', async () => {
      btnDesactivar.disabled = true;
      const resultado = await window.CultivarnosPush.desactivarEnEsteDispositivo();
      showToast(resultado.mensaje || 'Notificaciones desactivadas');
      renderConfiguracion(root);
    });
  }

  const checkRecordatorios = root.querySelector('#push-check-recordatorios');
  if (checkRecordatorios) {
    checkRecordatorios.addEventListener('change', async () => {
      await window.CultivarnosPush.actualizarPreferencias({ remindersEnabled: checkRecordatorios.checked });
      showToast('Guardado');
    });
  }

  const checkSugerencias = root.querySelector('#push-check-sugerencias');
  if (checkSugerencias) {
    checkSugerencias.addEventListener('change', async () => {
      await window.CultivarnosPush.actualizarPreferencias({ suggestionsEnabled: checkSugerencias.checked });
      showToast('Guardado');
    });
  }
}
