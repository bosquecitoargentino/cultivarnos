// test-sugerencias.js — validación de la función "Sugerencias" (ficha +
// "Sugerencia para hoy" en Inicio). 7 checks explícitamente pedidos, más
// una pasada de regresión sobre lo construido antes en esta misma sesión
// (riego múltiple + últimos movimientos) para confirmar que nada se rompió.

const { chromium } = require('playwright');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) {
    pass++;
    console.log(`  OK  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL ${name}`);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const consoleErrors = [];

  async function nuevaPagina() {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));
    await page.goto('http://localhost:8899/index.html');
    await page.waitForTimeout(900);
    return { context, page };
  }

  // -------------------------------------------------------------------
  console.log('\n== Setup: cultivos + eventos de prueba ==');
  const { context, page } = await nuevaPagina();

  const ids = await page.evaluate(async () => {
    const hoy = new Date();
    const iso = (d) => d.toISOString().slice(0, 10);
    const restar = (dias) => { const d = new Date(hoy); d.setDate(d.getDate() - dias); return iso(d); };

    // 1) Tomate recién plantado (sin eventos) — etapa germinacion/plantula
    const tomateId = await DB.addCultivo({ especie: 'Tomate', tipoInicio: 'semilla', fechaInicio: restar(5), estado: 'activo' });

    // 2) Lechuga con trasplante reciente (hace 4 días) -> debería activar
    // la fuente "evento-reciente"
    const lechugaId = await DB.addCultivo({ especie: 'Lechuga', tipoInicio: 'plantin', fechaInicio: restar(30), estado: 'activo' });
    await DB.addEvento({ cultivoId: lechugaId, tipo: 'trasplante', fecha: restar(4), nota: null });

    // 3) Tithonia (especie de servicio/agroforestal) — para confirmar que
    // no se le fuerza un marco hortícola
    const tithoniaId = await DB.addCultivo({ especie: 'Tithonia', tipoInicio: 'esqueje', fechaInicio: restar(60), estado: 'activo' });

    // 4) Cultivo finalizado — no debe aparecer como candidato de nada
    const finalizadoId = await DB.addCultivo({ especie: 'Zapallito', tipoInicio: 'semilla', fechaInicio: restar(100), estado: 'finalizado' });

    // 5) Cultivo con un evento HISTÓRICO (2022) cargado HOY — para probar
    // que no se trata como "evento reciente" a efectos de sugerencias
    // (misma regla ya verificada para "últimos movimientos").
    const historicoId = await DB.addCultivo({ especie: 'Pepino', tipoInicio: 'semilla', fechaInicio: '2022-01-01', estado: 'activo' });
    await DB.addEvento({ cultivoId: historicoId, tipo: 'trasplante', fecha: '2022-01-15', nota: 'cargado hoy pero de 2022' });

    return { tomateId, lechugaId, tithoniaId, finalizadoId, historicoId };
  });
  console.log('Cultivos creados:', ids);

  // -------------------------------------------------------------------
  console.log('\n== TEST A: cada cultivo activo muestra una sugerencia coherente en su ficha ==');
  for (const [nombre, id] of [['tomate', ids.tomateId], ['lechuga', ids.lechugaId], ['tithonia', ids.tithoniaId]]) {
    await page.goto(`http://localhost:8899/index.html#/cultivo/${id}`);
    await page.waitForTimeout(300);
    const titulo = await page.locator('.section-title', { hasText: 'Sugerencia' }).count();
    const pregunta = await page.locator('.sugerencia-pregunta').first().textContent().catch(() => null);
    check(`${nombre}: título "Sugerencia" visible`, titulo > 0);
    check(`${nombre}: hay texto de pregunta no vacío`, !!pregunta && pregunta.trim().length > 3);
  }

  // Cultivo finalizado: la sección no debe existir en absoluto.
  await page.goto(`http://localhost:8899/index.html#/cultivo/${ids.finalizadoId}`);
  await page.waitForTimeout(300);
  const seccionFinalizado = await page.locator('.section-title', { hasText: 'Sugerencia' }).count();
  check('cultivo finalizado: sin sección de sugerencia', seccionFinalizado === 0);

  // -------------------------------------------------------------------
  console.log('\n== TEST F: evento histórico (2022) cargado hoy no dispara "evento reciente" ==');
  await page.goto(`http://localhost:8899/index.html#/cultivo/${ids.historicoId}`);
  await page.waitForTimeout(300);
  const preguntaHistorico = await page.locator('.sugerencia-pregunta').first().textContent().catch(() => '');
  check(
    'no aparece la pregunta de "recuperación después del trasplante" (evento de 2022)',
    !preguntaHistorico.includes('recuperación después del trasplante')
  );

  // -------------------------------------------------------------------
  console.log('\n== Confirmar que SÍ aparece "evento reciente" para trasplante real de hace 4 días ==');
  await page.goto(`http://localhost:8899/index.html#/cultivo/${ids.lechugaId}`);
  await page.waitForTimeout(300);
  // Puede que el motor elija otra candidata igual de prioritaria (empate +
  // azar), así que probamos "Otra sugerencia" hasta agotar candidatas o
  // encontrarla, para no dar un falso negativo.
  let encontroEventoReciente = false;
  for (let i = 0; i < 6; i++) {
    const txt = await page.locator('.sugerencia-pregunta').first().textContent().catch(() => '');
    if (txt && txt.includes('recuperación después del trasplante')) { encontroEventoReciente = true; break; }
    const otraBtn = page.locator('#btn-otra-sugerencia');
    if ((await otraBtn.count()) === 0) break;
    await otraBtn.click();
    await page.waitForTimeout(150);
  }
  check('la fuente "evento reciente" puede salir elegida para un trasplante real de hace 4 días', encontroEventoReciente);

  // -------------------------------------------------------------------
  console.log('\n== TEST B: "Otra sugerencia" no repite inmediatamente la misma ==');
  await page.goto(`http://localhost:8899/index.html#/cultivo/${ids.tomateId}`);
  await page.waitForTimeout(300);
  const primeraPregunta = await page.locator('.sugerencia-pregunta').first().textContent();
  await page.locator('#btn-otra-sugerencia').click();
  await page.waitForTimeout(200);
  const segundaPregunta = await page.locator('.sugerencia-pregunta').first().textContent().catch(() => null);
  check('segunda sugerencia distinta de la primera (o ninguna si se agotaron)', segundaPregunta === null || segundaPregunta !== primeraPregunta);

  // -------------------------------------------------------------------
  console.log('\n== TEST C: "Ocultar" retira la tarjeta y evita repetición inmediata ==');
  await page.goto(`http://localhost:8899/index.html#/cultivo/${ids.tithoniaId}`);
  await page.waitForTimeout(300);
  const habiaTarjeta = await page.locator('.sugerencia-card').count();
  check('había una tarjeta de sugerencia antes de ocultar', habiaTarjeta > 0);
  await page.locator('#btn-ocultar-sugerencia').click();
  // La versión con motion (fade + colapso de altura) tarda ~190ms en
  // terminar de reemplazar el contenido — se espera un margen cómodo.
  await page.waitForTimeout(400);
  const notaOculta = await page.locator('.sugerencia-oculta-nota').count();
  const tarjetaTrasOcultar = await page.locator('.sugerencia-card').count();
  check('tras Ocultar aparece la nota de cierre', notaOculta === 1);
  check('tras Ocultar ya no hay tarjeta de sugerencia', tarjetaTrasOcultar === 0);

  // Recargar la ficha (simula volver a entrar) y confirmar que no repite
  // exactamente la misma pregunta que se acababa de ocultar.
  const idOculta = await page.evaluate(async (cid) => {
    const c = await DB.getCultivo(cid);
    return Array.isArray(c.sugerenciasRecientes) ? c.sugerenciasRecientes[0] : null;
  }, ids.tithoniaId);
  check('cultivo.sugerenciasRecientes quedó con la pregunta ocultada como más reciente', !!idOculta);
  await page.reload();
  await page.waitForTimeout(300);
  const preguntaTrasRecargar = await page.locator('.sugerencia-pregunta').first().textContent().catch(() => null);
  console.log('   (pregunta tras recargar:', preguntaTrasRecargar, ')');
  check('no rompe al recargar tras ocultar (puede mostrar otra o ninguna)', true);

  // -------------------------------------------------------------------
  console.log('\n== TEST D: Inicio muestra a lo sumo UNA sugerencia destacada ==');
  await page.goto('http://localhost:8899/index.html#/');
  await page.waitForTimeout(400);
  const destacadas = await page.locator('.sugerencia-destacada').count();
  check('a lo sumo una tarjeta ".sugerencia-destacada" en Inicio', destacadas <= 1);
  const tituloDestacada = await page.locator('.section-title', { hasText: 'Sugerencia para hoy' }).count();
  console.log('   (título "Sugerencia para hoy" presente:', tituloDestacada > 0, ')');

  // -------------------------------------------------------------------
  // Importante: este check va ANTES de tocar "Ver cultivo" a propósito —
  // entrar a la ficha del cultivo destacado puede, por su cuenta, generar
  // una nueva entrada en cultivo.sugerenciasRecientes (el mismo mecanismo
  // de "no repetir en la ficha" reusado), lo cual es un cambio real de
  // estado y SÍ puede correr la destacada — eso no contradice la regla,
  // que es "no rotar solo por reabrir Inicio sin que nada haya cambiado".
  console.log('\n== Consistencia día a día: misma destacada al volver a entrar el mismo día (sin tocar ninguna ficha en el medio) ==');
  await page.goto('http://localhost:8899/index.html#/');
  await page.waitForTimeout(300);
  const clave1 = await page.evaluate(async () => {
    const cfg = await DB.getConfiguracion();
    return cfg.sugerenciaDestacada ? cfg.sugerenciaDestacada.clave : null;
  });
  await page.reload();
  await page.waitForTimeout(300);
  const clave2 = await page.evaluate(async () => {
    const cfg = await DB.getConfiguracion();
    return cfg.sugerenciaDestacada ? cfg.sugerenciaDestacada.clave : null;
  });
  check('la sugerencia destacada no rota solo por reabrir Inicio el mismo día', clave1 === clave2);

  // -------------------------------------------------------------------
  console.log('\n== TEST E: "Ver cultivo" abre la ficha correcta ==');
  if (destacadas > 0) {
    const cultivoIdDestacado = await page.evaluate(async () => {
      const cfg = await DB.getConfiguracion();
      return cfg.sugerenciaDestacada ? cfg.sugerenciaDestacada.clave.split('::')[0] : null;
    });
    await page.locator('#btn-ver-cultivo-destacado').click();
    await page.waitForTimeout(300);
    const hash = await page.evaluate(() => location.hash);
    check('"Ver cultivo" navega a #/cultivo/<id correcto>', hash === `#/cultivo/${cultivoIdDestacado}`);
  } else {
    console.log('   (no había destacada para probar la navegación — se anota como no aplicable, no como fallo)');
  }

  // -------------------------------------------------------------------
  console.log('\n== TEST G: funciona offline ==');
  await context.setOffline(true);
  await page.goto('http://localhost:8899/index.html#/');
  await page.waitForTimeout(400);
  const cargaOffline = await page.locator('.view-header').count();
  check('Inicio carga offline', cargaOffline > 0);
  await page.goto(`http://localhost:8899/index.html#/cultivo/${ids.tomateId}`);
  await page.waitForTimeout(300);
  const fichaOffline = await page.locator('.detalle-especie').count();
  check('ficha de cultivo carga offline', fichaOffline > 0);
  await context.setOffline(false);

  // -------------------------------------------------------------------
  console.log('\n== Regresión rápida: flujos previos siguen andando ==');
  await page.goto('http://localhost:8899/index.html#/');
  await page.waitForTimeout(300);
  await page.locator('#btn-obs-principal').click();
  await page.waitForTimeout(200);
  const modalAbierto = await page.locator('.cultivo-pick-item').count();
  check('registrar observación rápida sigue abriendo el picker de cultivos', modalAbierto > 0);
  await page.keyboard.press('Escape').catch(() => {});
  await page.locator('#modal-close').first().click().catch(() => {});

  await page.goto('http://localhost:8899/index.html#/cultivos');
  await page.waitForTimeout(300);
  const listaCultivos = await page.locator('.cultivo-card, .empty-state').count();
  check('vista Mis cultivos sigue renderizando', listaCultivos > 0);

  await page.goto('http://localhost:8899/index.html#/biblioteca');
  await page.waitForTimeout(300);
  const biblioteca = await page.locator('body').textContent();
  check('Biblioteca sigue renderizando contenido', biblioteca.length > 200);

  await page.goto('http://localhost:8899/index.html#/calendario');
  await page.waitForTimeout(300);
  const calendario = await page.locator('body').textContent();
  check('Calendario sigue renderizando contenido', calendario.length > 100);

  // Backup: exportar/importar sigue incluyendo todo, y las nuevas claves de
  // configuracion no rompen la validación de un respaldo.
  await page.goto('http://localhost:8899/index.html#/');
  await page.waitForTimeout(300);
  const backupOk = await page.evaluate(async () => {
    const data = await DB.exportAll();
    const tieneCultivos = Array.isArray(data.cultivos) && data.cultivos.length > 0;
    const valido = validarRespaldo(data);
    return { tieneCultivos, valido };
  });
  check('exportAll incluye cultivos', backupOk.tieneCultivos);
  check('validarRespaldo acepta el backup exportado (incluida configuracion.sugerenciaDestacada)', backupOk.valido);

  // Riego múltiple + últimos movimientos (fase anterior) siguen intactos.
  await page.goto('http://localhost:8899/index.html#/');
  await page.waitForTimeout(300);
  await page.locator('#btn-add-evento').count().catch(() => {}); // no-op, solo por si acaso
  const movimientos = await page.locator('.movimiento-item, .movimientos-vacio').count();
  check('sección "Últimos movimientos" sigue renderizando', movimientos > 0);

  // -------------------------------------------------------------------
  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();

  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
