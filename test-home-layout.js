// test-home-layout.js — validación mínima de "Personalizar inicio"
// (reordenar, mostrar/ocultar, persistencia, restaurar, no afectar otras
// pantallas). Batería chica a propósito — el pedido fue verificación
// mínima, no exhaustiva.

const { chromium } = require('playwright');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const consoleErrors = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('http://localhost:8899/index.html');
  await page.waitForTimeout(700);

  // Sembrar algo de contenido para que todos los bloques tengan algo que
  // mostrar (cultivo activo, config con hemisferio). A propósito con una
  // fecha de inicio de hace unos meses (no "hoy"): un cultivo recién
  // plantado puede tener más de una pregunta de "especie" empatada en
  // prioridad, y getSugerenciaDestacada (motor-observacion.js, sin tocar
  // en esta funcionalidad) puede alternar aleatoriamente entre ellas en
  // cada recálculo del día — con una sola candidata estable evitamos que
  // ese comportamiento ajeno a Personalizar-inicio interfiera con este test.
  await page.evaluate(async () => {
    await DB.setConfiguracion({ hemisferio: 'sur' });
    await DB.addCultivo({ especie: 'Tomate', tipoInicio: 'semilla', fechaInicio: '2026-06-01', estado: 'activo' });
  });

  await page.goto('http://localhost:8899/index.html#/inicio');
  await page.waitForTimeout(500);

  console.log('\n== 0) Orden por defecto: los bloques reales aparecen, ninguno inventado ==');
  const seccionesIniciales = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#app > section')).map((s) => s.querySelector('.section-title')?.textContent.trim() || '(sin título)')
  );
  console.log('   secciones:', seccionesIniciales.join(' | '));
  check('aparece "Tus cultivos"', seccionesIniciales.some((t) => t.includes('Tus cultivos')));
  check('aparece "Últimos movimientos"', seccionesIniciales.some((t) => t.includes('Últimos movimientos')));
  check('no aparece ningún bloque "Espacios" inventado', !seccionesIniciales.some((t) => t.includes('Espacios')));

  console.log('\n== 1) Abrir "Personalizar inicio" desde el menú ⋯ ==');
  await page.locator('#btn-menu').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-personalizar-inicio').click();
  await page.waitForTimeout(300);
  const filas = await page.locator('.home-layout-row').count();
  check('el modal muestra 5 filas (los 5 bloques reales de Inicio)', filas === 5);

  console.log('\n== 2) Reordenar: mover el primero hacia abajo ==');
  const primeroAntes = await page.locator('.home-layout-row').first().locator('.home-layout-label').textContent();
  await page.locator('.home-layout-row').first().locator('[data-move="down"]').click();
  await page.waitForTimeout(200);
  const segundoDespues = await page.locator('.home-layout-row').nth(1).locator('.home-layout-label').textContent();
  check('el bloque movido hacia abajo ahora está en la posición 2', primeroAntes.trim() === segundoDespues.trim());

  console.log('\n== 3) Mostrar/ocultar: destildar un bloque ==');
  const labelAOcultar = await page.locator('.home-layout-row').nth(2).locator('.home-layout-label').textContent();
  await page.locator('.home-layout-row').nth(2).locator('.home-layout-check').uncheck();
  await page.waitForTimeout(200);
  await page.locator('#modal-close').click();
  await page.waitForTimeout(300);
  const seccionesTrasOcultar = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#app > section')).map((s) => s.querySelector('.section-title')?.textContent.trim() || '(sin título)')
  );
  check(`el bloque "${labelAOcultar.trim()}" ya no aparece en Inicio`, !seccionesTrasOcultar.some((t) => t.includes(labelAOcultar.trim())));

  console.log('\n== 4) Persistencia: recargar la página y confirmar que se mantiene ==');
  await page.reload();
  await page.waitForTimeout(500);
  const seccionesTrasReload = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#app > section')).map((s) => s.querySelector('.section-title')?.textContent.trim() || '(sin título)')
  );
  check('tras recargar, el bloque sigue oculto', !seccionesTrasReload.some((t) => t.includes(labelAOcultar.trim())));
  const layoutGuardado = await page.evaluate(() => localStorage.getItem('cultivarnos-home-layout'));
  check('la preferencia está guardada en localStorage', !!layoutGuardado);

  console.log('\n== 5) "Restaurar inicio predeterminado" vuelve exactamente al original ==');
  await page.locator('#btn-menu').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-personalizar-inicio').click();
  await page.waitForTimeout(300);
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-restaurar-home').click();
  await page.waitForTimeout(300);
  await page.locator('#modal-close').click();
  await page.waitForTimeout(300);
  const seccionesTrasRestaurar = await page.evaluate(() =>
    Array.from(document.querySelectorAll('#app > section')).map((s) => s.querySelector('.section-title')?.textContent.trim() || '(sin título)')
  );
  if (JSON.stringify(seccionesTrasRestaurar) !== JSON.stringify(seccionesIniciales)) {
    console.log('   INICIAL:', JSON.stringify(seccionesIniciales));
    console.log('   RESTAURADO:', JSON.stringify(seccionesTrasRestaurar));
  }
  check('tras restaurar, el orden vuelve a ser exactamente el original', JSON.stringify(seccionesTrasRestaurar) === JSON.stringify(seccionesIniciales));
  const layoutTrasRestaurar = await page.evaluate(() => localStorage.getItem('cultivarnos-home-layout'));
  check('restaurar borra la preferencia guardada (no la deja "igual al default" a mano)', layoutTrasRestaurar === null);

  console.log('\n== 6) No afecta otras pantallas ==');
  await page.goto('http://localhost:8899/index.html#/cultivos');
  await page.waitForTimeout(300);
  const cultivosOk = await page.locator('.view-header, .empty-state').count();
  check('#/cultivos sigue renderizando con normalidad', cultivosOk > 0);
  await page.goto('http://localhost:8899/index.html#/biblioteca');
  await page.waitForTimeout(300);
  const bibliotecaOk = (await page.locator('body').textContent()).length > 200;
  check('#/biblioteca sigue renderizando con normalidad', bibliotecaOk);

  console.log('\n== 7) Forward-compatibility: un id desconocido guardado no rompe Inicio ==');
  await page.evaluate(() => {
    localStorage.setItem('cultivarnos-home-layout', JSON.stringify([
      { id: 'bloque-que-ya-no-existe', visible: true },
      { id: 'cultivos', visible: true },
    ]));
  });
  await page.goto('http://localhost:8899/index.html#/inicio');
  await page.waitForTimeout(400);
  const rendOk = await page.locator('.view-header').count();
  check('Inicio renderiza sin romperse con un id desconocido en la preferencia guardada', rendOk > 0);
  await page.evaluate(() => localStorage.removeItem('cultivarnos-home-layout'));

  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
