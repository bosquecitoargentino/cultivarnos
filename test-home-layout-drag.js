// test-home-layout-drag.js — validación mínima de "mantener presionado +
// arrastrar" para reordenar en Personalizar inicio. Se simula con
// page.mouse (Chromium genera PointerEvents reales con pointerType
// "mouse" para esto, que es exactamente lo que consume el código nuevo —
// no hay ninguna rama de comportamiento distinta para touch vs mouse en
// habilitarArrastreHomeLayout). Batería chica a propósito.

const { chromium } = require('playwright');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

async function abrirModal(page) {
  await page.locator('#btn-menu').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-personalizar-inicio').click();
  await page.waitForTimeout(300);
}

async function cerrarModal(page) {
  await page.locator('#modal-close').click();
  await page.waitForTimeout(300);
}

async function etiquetasActuales(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.home-layout-row')).map((f) => f.querySelector('.home-layout-label').textContent.trim())
  );
}

async function centroDe(locator) {
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
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
  await page.evaluate(async () => {
    await DB.setConfiguracion({ hemisferio: 'sur' });
    await DB.addCultivo({ especie: 'Tomate', tipoInicio: 'semilla', fechaInicio: '2026-06-01', estado: 'activo' });
  });
  await page.goto('http://localhost:8899/index.html#/inicio');
  await page.waitForTimeout(500);

  console.log('\n== 1) Un tap rápido en el handle (sin mantener) no reordena nada ==');
  await abrirModal(page);
  const ordenAntesTap = await etiquetasActuales(page);
  const handle0 = page.locator('.home-layout-handle').first();
  const p0 = await centroDe(handle0);
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await page.waitForTimeout(40); // bien por debajo de los 130ms de DEMORA_HOLD
  await page.mouse.up();
  await page.waitForTimeout(150);
  const ordenTrasTap = await etiquetasActuales(page);
  check('un tap corto no cambia el orden', JSON.stringify(ordenAntesTap) === JSON.stringify(ordenTrasTap));

  console.log('\n== 2) Mantener presionado + arrastrar una posición hacia abajo ==');
  const filas = page.locator('.home-layout-row');
  const etiquetaFila0 = (await filas.nth(0).locator('.home-layout-label').textContent()).trim();
  const handleFila0 = filas.nth(0).locator('.home-layout-handle');
  const box0 = await handleFila0.boundingBox();
  const box1 = await filas.nth(1).boundingBox();
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180); // pasa la demora de "mantener presionado"
  // Mover el mouse en varios pasos hasta bien pasado el centro de la fila 1,
  // para cruzar el umbral de reordenamiento.
  const destinoY = box1.y + box1.height * 0.8;
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2 + (destinoY - box0.y) * (i / 5));
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(120);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const ordenTrasArrastre1 = await etiquetasActuales(page);
  check('tras arrastrar, la fila pasó a la posición 2', ordenTrasArrastre1[1] === etiquetaFila0);
  check('la fila ya no está en la posición 1', ordenTrasArrastre1[0] !== etiquetaFila0);

  console.log('\n== 3) Arrastrar de la primera posición hasta la última ==');
  const etiquetaPrimeraAhora = (await filas.nth(0).locator('.home-layout-label').textContent()).trim();
  const boxPrimera = await filas.nth(0).locator('.home-layout-handle').boundingBox();
  const boxUltima = await filas.last().boundingBox();
  await page.mouse.move(boxPrimera.x + boxPrimera.width / 2, boxPrimera.y + boxPrimera.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180);
  const pasos = 8;
  for (let i = 1; i <= pasos; i++) {
    const y = boxPrimera.y + (boxUltima.y + boxUltima.height * 0.9 - boxPrimera.y) * (i / pasos);
    await page.mouse.move(boxPrimera.x + boxPrimera.width / 2, y);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const ordenTrasArrastreTotal = await etiquetasActuales(page);
  check('la fila movida de punta a punta terminó última', ordenTrasArrastreTotal[ordenTrasArrastreTotal.length - 1] === etiquetaPrimeraAhora);

  console.log('\n== 4) Un gesto horizontal desde el handle se descarta (no reordena) ==');
  const ordenAntesHorizontal = await etiquetasActuales(page);
  const handleH = await filas.nth(0).locator('.home-layout-handle').boundingBox();
  await page.mouse.move(handleH.x + handleH.width / 2, handleH.y + handleH.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleH.x + handleH.width / 2 + 60, handleH.y + handleH.height / 2 + 2, { steps: 5 });
  await page.waitForTimeout(200);
  await page.mouse.up();
  await page.waitForTimeout(150);
  const ordenTrasHorizontal = await etiquetasActuales(page);
  check('el gesto horizontal no cambió el orden', JSON.stringify(ordenAntesHorizontal) === JSON.stringify(ordenTrasHorizontal));

  console.log('\n== 5) El switch de mostrar/ocultar sigue funcionando (no lo tapa el drag) ==');
  const checkbox0 = filas.nth(0).locator('.home-layout-check');
  const estabaMarcado = await checkbox0.isChecked();
  await checkbox0.click();
  await page.waitForTimeout(150);
  const estaMarcadoAhora = await checkbox0.isChecked();
  check('tocar el checkbox lo togglea con normalidad', estaMarcadoAhora !== estabaMarcado);
  await checkbox0.click(); // lo dejamos como estaba
  await page.waitForTimeout(150);

  console.log('\n== 6) El nuevo orden persiste tras cerrar el modal y recargar ==');
  const ordenFinalEnModal = await etiquetasActuales(page);
  await cerrarModal(page);
  await page.reload();
  await page.waitForTimeout(500);
  await abrirModal(page);
  const ordenTrasReload = await etiquetasActuales(page);
  check('el orden se mantiene igual tras recargar la página', JSON.stringify(ordenFinalEnModal) === JSON.stringify(ordenTrasReload));

  console.log('\n== 7) "Restaurar inicio predeterminado" sigue funcionando tras usar el arrastre ==');
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-restaurar-home').click();
  await page.waitForTimeout(300);
  const ordenTrasRestaurar = await etiquetasActuales(page);
  const ordenEsperado = ['Recordatorios', 'Mis cultivos', 'Sugerencia para hoy', 'Últimos movimientos', 'Esta temporada'];
  check('restaurar vuelve al orden original de los 5 bloques', JSON.stringify(ordenTrasRestaurar) === JSON.stringify(ordenEsperado));
  await cerrarModal(page);

  console.log('\n== 8) Ninguna fila quedó "pegada" en position:absolute tras soltar ==');
  await abrirModal(page);
  const posicionesResiduales = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.home-layout-row')).map((f) => f.style.position)
  );
  check('ninguna fila quedó con position inline residual', posicionesResiduales.every((p) => p === ''));
  await cerrarModal(page);

  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
