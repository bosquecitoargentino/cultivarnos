// views/auth.js — Bienvenida / Crear cuenta / Iniciar sesión / Olvidé mi
// contraseña / Elegí tu usuario / Vincular huerta local.
//
// Mismo lenguaje visual que el resto de la app (.form-group/.form-input,
// .btn-primary/.btn-secondary, view-header) — nada de componentes nuevos.
// Estas vistas nunca llaman navigate() después de un login/logout exitoso:
// CultivarnosAuth.onCambio() en app.js ya vuelve a evaluar la ruta sola en
// cuanto cambia el estado de sesión (ver decidirDestino en app.js). Solo
// "Vincular huerta" navega explícitamente, porque ese cambio de estado
// vive en CultivarnosSync, no en CultivarnosAuth (ver el comentario ahí).

function deshabilitar(btn) { if (btn) btn.disabled = true; }
function habilitar(btn) { if (btn) btn.disabled = false; }

function mostrarErrorAuth(root, mensaje) {
  const el = root.querySelector('#auth-error');
  if (!el) return;
  el.textContent = mensaje;
  el.classList.remove('hidden');
}
function ocultarErrorAuth(root) {
  const el = root.querySelector('#auth-error');
  if (!el) return;
  el.classList.add('hidden');
  el.textContent = '';
}

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// ---------------------------------------------------------------------
// Bienvenida
// ---------------------------------------------------------------------

function renderBienvenida(root) {
  root.innerHTML = `
    <div class="auth-shell">
      <img src="assets/logo-cultivarnos.svg" alt="" class="auth-logo" width="64" height="64" />
      <h1 class="auth-titulo">Cultivarnos</h1>
      <p class="auth-subtitulo">La memoria de tu huerta</p>
      <button type="button" id="btn-crear-cuenta" class="btn-primary">Crear cuenta</button>
      <button type="button" id="btn-iniciar-sesion" class="btn-secondary">Iniciar sesión</button>
      <button type="button" id="btn-google" class="btn-secondary">Continuar con Google</button>
    </div>
  `;
  root.querySelector('#btn-crear-cuenta').addEventListener('click', () => navigate('#/crear-cuenta'));
  root.querySelector('#btn-iniciar-sesion').addEventListener('click', () => navigate('#/iniciar-sesion'));
  root.querySelector('#btn-google').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    deshabilitar(btn);
    const resultado = await window.CultivarnosAuth.iniciarSesionConGoogle();
    if (!resultado.ok) {
      showToast(resultado.mensaje);
      habilitar(btn);
    }
    // Si resultado.ok, o bien redirigiendo:true (la página va a navegar
    // afuera sola) o bien ya hay sesión y CultivarnosAuth.onCambio() en
    // app.js va a reevaluar la ruta — no hace falta hacer nada más acá.
  });
}

// ---------------------------------------------------------------------
// Crear cuenta
// ---------------------------------------------------------------------

function renderCrearCuenta(root) {
  root.innerHTML = `
    <div class="view-header">
      <h1>Crear cuenta</h1>
    </div>
    <form id="form-crear-cuenta" class="auth-form">
      <div id="auth-error" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre de usuario</label>
        <input type="text" id="f-username" class="form-input" autocomplete="off" placeholder="Ej: bosquecito_argentino" />
        <p id="f-username-hint" class="form-hint"></p>
      </div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="f-email" class="form-input" autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label">Contraseña</label>
        <input type="password" id="f-password" class="form-input" autocomplete="new-password" />
      </div>
      <div class="form-group">
        <label class="form-label">Confirmar contraseña</label>
        <input type="password" id="f-confirmar" class="form-input" autocomplete="new-password" />
      </div>
      <button type="submit" id="btn-submit" class="btn-primary">Crear cuenta</button>
      <p class="auth-links"><a href="#/iniciar-sesion">Ya tengo cuenta</a></p>
    </form>
  `;

  const inputUsername = root.querySelector('#f-username');
  const hint = root.querySelector('#f-username-hint');
  const verificar = debounce(async () => {
    const valor = inputUsername.value;
    if (!valor) { hint.textContent = ''; hint.className = 'form-hint'; return; }
    const val = window.CultivarnosAuth.validarUsername(valor);
    if (!val.valido) { hint.textContent = val.mensaje; hint.className = 'form-hint form-hint-error'; return; }
    hint.textContent = 'Verificando...';
    hint.className = 'form-hint';
    const resultado = await window.CultivarnosAuth.verificarUsernameDisponible(valor);
    if (resultado.disponible === true) { hint.textContent = 'Disponible.'; hint.className = 'form-hint form-hint-ok'; }
    else if (resultado.disponible === false) { hint.textContent = resultado.mensaje; hint.className = 'form-hint form-hint-error'; }
    else { hint.textContent = ''; hint.className = 'form-hint'; }
  }, 450);
  inputUsername.addEventListener('input', verificar);

  root.querySelector('#form-crear-cuenta').addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarErrorAuth(root);
    const btn = root.querySelector('#btn-submit');
    deshabilitar(btn);
    const resultado = await window.CultivarnosAuth.crearCuentaConEmail({
      username: inputUsername.value,
      email: root.querySelector('#f-email').value,
      password: root.querySelector('#f-password').value,
      confirmarPassword: root.querySelector('#f-confirmar').value,
    });
    if (!resultado.ok) {
      mostrarErrorAuth(root, resultado.mensaje);
      habilitar(btn);
    }
    // Si ok: CultivarnosAuth.onCambio() en app.js ya redirige a #/inicio.
  });
}

// ---------------------------------------------------------------------
// Iniciar sesión
// ---------------------------------------------------------------------

function renderIniciarSesion(root) {
  root.innerHTML = `
    <div class="view-header">
      <h1>Iniciar sesión</h1>
    </div>
    <form id="form-iniciar-sesion" class="auth-form">
      <div id="auth-error" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="f-email" class="form-input" autocomplete="email" />
      </div>
      <div class="form-group">
        <label class="form-label">Contraseña</label>
        <input type="password" id="f-password" class="form-input" autocomplete="current-password" />
      </div>
      <button type="submit" id="btn-submit" class="btn-primary">Iniciar sesión</button>
      <button type="button" id="btn-google" class="btn-secondary">Continuar con Google</button>
      <p class="auth-links">
        <a href="#/recuperar-contrasena">Olvidé mi contraseña</a>
        <a href="#/crear-cuenta">Crear cuenta</a>
      </p>
    </form>
  `;

  root.querySelector('#form-iniciar-sesion').addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarErrorAuth(root);
    const btn = root.querySelector('#btn-submit');
    deshabilitar(btn);
    const resultado = await window.CultivarnosAuth.iniciarSesionConEmail({
      email: root.querySelector('#f-email').value,
      password: root.querySelector('#f-password').value,
    });
    if (!resultado.ok) {
      mostrarErrorAuth(root, resultado.mensaje);
      habilitar(btn);
    }
  });

  root.querySelector('#btn-google').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    deshabilitar(btn);
    const resultado = await window.CultivarnosAuth.iniciarSesionConGoogle();
    if (!resultado.ok) {
      showToast(resultado.mensaje);
      habilitar(btn);
    }
  });
}

// ---------------------------------------------------------------------
// Olvidé mi contraseña
// ---------------------------------------------------------------------

function renderRecuperarContrasena(root) {
  root.innerHTML = `
    <div class="view-header">
      <h1>Olvidé mi contraseña</h1>
    </div>
    <form id="form-recuperar" class="auth-form">
      <div id="auth-error" class="form-error hidden"></div>
      <div id="auth-ok" class="form-ok hidden"></div>
      <div class="form-group">
        <label class="form-label">Email</label>
        <input type="email" id="f-email" class="form-input" autocomplete="email" />
      </div>
      <button type="submit" id="btn-submit" class="btn-primary">Enviar correo de recuperación</button>
      <p class="auth-links"><a href="#/iniciar-sesion">Volver a iniciar sesión</a></p>
    </form>
  `;

  root.querySelector('#form-recuperar').addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarErrorAuth(root);
    const okEl = root.querySelector('#auth-ok');
    okEl.classList.add('hidden');
    const btn = root.querySelector('#btn-submit');
    deshabilitar(btn);
    const resultado = await window.CultivarnosAuth.enviarRecuperarPassword(root.querySelector('#f-email').value);
    habilitar(btn);
    if (resultado.ok) {
      okEl.textContent = resultado.mensaje;
      okEl.classList.remove('hidden');
    } else {
      mostrarErrorAuth(root, resultado.mensaje);
    }
  });
}

// ---------------------------------------------------------------------
// Elegí tu nombre de usuario — primera vez con Google, o email+contraseña
// cuya reserva de username no se había llegado a completar la vez
// anterior (ver docs/firebase-architecture.md, "estado parcial").
// ---------------------------------------------------------------------

function renderElegirUsername(root) {
  const est = window.CultivarnosAuth.getEstado();
  const email = (est.usuario && est.usuario.email) || '';
  root.innerHTML = `
    <div class="view-header">
      <h1>Elegí tu nombre de usuario</h1>
      ${email ? `<p>Vas a entrar como ${escapeHtml(email)}.</p>` : ''}
    </div>
    <form id="form-username" class="auth-form">
      <div id="auth-error" class="form-error hidden"></div>
      <div class="form-group">
        <label class="form-label">Nombre de usuario</label>
        <input type="text" id="f-username" class="form-input" autocomplete="off" placeholder="Ej: bosquecito_argentino" />
        <p id="f-username-hint" class="form-hint"></p>
      </div>
      <button type="submit" id="btn-submit" class="btn-primary">Continuar</button>
      <p class="auth-links"><a href="#" id="link-cerrar-sesion">No es mi cuenta, cerrar sesión</a></p>
    </form>
  `;

  const inputUsername = root.querySelector('#f-username');
  const hint = root.querySelector('#f-username-hint');
  const verificar = debounce(async () => {
    const valor = inputUsername.value;
    if (!valor) { hint.textContent = ''; hint.className = 'form-hint'; return; }
    const val = window.CultivarnosAuth.validarUsername(valor);
    if (!val.valido) { hint.textContent = val.mensaje; hint.className = 'form-hint form-hint-error'; return; }
    const resultado = await window.CultivarnosAuth.verificarUsernameDisponible(valor);
    if (resultado.disponible === true) { hint.textContent = 'Disponible.'; hint.className = 'form-hint form-hint-ok'; }
    else if (resultado.disponible === false) { hint.textContent = resultado.mensaje; hint.className = 'form-hint form-hint-error'; }
    else { hint.textContent = ''; hint.className = 'form-hint'; }
  }, 450);
  inputUsername.addEventListener('input', verificar);

  root.querySelector('#form-username').addEventListener('submit', async (e) => {
    e.preventDefault();
    ocultarErrorAuth(root);
    const btn = root.querySelector('#btn-submit');
    deshabilitar(btn);
    const resultado = await window.CultivarnosAuth.elegirUsername(inputUsername.value);
    if (!resultado.ok) {
      mostrarErrorAuth(root, resultado.mensaje);
      habilitar(btn);
    }
  });

  root.querySelector('#link-cerrar-sesion').addEventListener('click', (e) => {
    e.preventDefault();
    window.CultivarnosAuth.cerrarSesion();
  });
}

// ---------------------------------------------------------------------
// "Encontramos una huerta en este dispositivo" — ver
// firebase-sync.js#detectarHuertaLegada / vincularHuertaLocal /
// descartarHuertaLocal.
// ---------------------------------------------------------------------

function renderVincularHuerta(root) {
  root.innerHTML = `
    <div class="auth-shell">
      <h1 class="auth-titulo">Encontramos una huerta en este dispositivo</h1>
      <p class="auth-subtitulo">¿Querés guardarla en tu cuenta?</p>
      <button type="button" id="btn-guardar-huerta" class="btn-primary">Guardar mi huerta</button>
      <button type="button" id="btn-empezar-de-cero" class="btn-secondary">Empezar de cero con esta cuenta</button>
    </div>
  `;

  root.querySelector('#btn-guardar-huerta').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    deshabilitar(btn);
    deshabilitar(root.querySelector('#btn-empezar-de-cero'));
    showToast('Guardando tu huerta…');
    await window.CultivarnosSync.vincularHuertaLocal();
    navigate('#/inicio');
  });

  root.querySelector('#btn-empezar-de-cero').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    deshabilitar(btn);
    deshabilitar(root.querySelector('#btn-guardar-huerta'));
    await window.CultivarnosSync.descartarHuertaLocal();
    navigate('#/inicio');
  });
}
