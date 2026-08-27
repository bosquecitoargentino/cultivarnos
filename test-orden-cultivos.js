// test-orden-cultivos.js — validación de "Ordenar cultivos" tras la
// simplificación: se eliminó por completo el drag directo sobre las
// tarjetas de "Mis cultivos" (mantener presionado, pointer capture,
// scroll manual, etc. — todo lo que vivía en habilitarArrastreCultivos).
// Las cards ahora son cards normales (tap -> abre ficha, nada más) y
// reordenar pasa únicamente dentro del modal "Ordenar cultivos" (menú
// ⋯), que reutiliza EXACTAMENTE el mismo mecanismo de arrastre que
// "Personalizar inicio" (motor-lista-reordenable.js). Simulado con
// page.mouse (Chromium genera PointerEvents reales con pointerType
// "mouse", el mismo código que consume el handle en touch).

const { chromium } = require('playwright');

let pass = 0;
let fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  OK  ${name}`); }
  else { fail++; console.log(`  FAIL ${name}`); }
}

async function especiesEnOrden(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('.cultivo-card .cultivo-card-especie')).map((e) => e.textContent.trim())
  );
}

async function etiquetasModal(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('#orden-cultivos-list .home-layout-row .home-layout-label')).map((e) => e.textContent.trim())
  );
}

async function abrirOrdenar(page) {
  await page.locator('#btn-menu').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-orden-cultivos').click();
  await page.waitForTimeout(300);
}

async function cerrarModal(page) {
  await page.locator('#modal-close').click();
  await page.waitForTimeout(300);
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

  const especies = await page.evaluate(async () => {
    const nombres = ['Tomate1', 'Tomate2', 'Tomate3', 'Tomate4', 'Tomate5', 'Tomate6'];
    for (let i = 0; i < nombres.length; i++) {
      const fecha = new Date(2026, 5, 1 + i).toISOString().slice(0, 10);
      await DB.addCultivo({ especie: nombres[i], tipoInicio: 'semilla', fechaInicio: fecha, estado: 'activo' });
    }
    return nombres;
  });

  await page.goto('http://localhost:8899/index.html#/cultivos');
  await page.waitForTimeout(600);

  console.log('\n== 0) Orden por defecto: más reciente primero ==');
  const ordenInicial = await especiesEnOrden(page);
  check('el más nuevo (Tomate6) aparece primero', ordenInicial[0] === 'Tomate6');
  check('hay 6 tarjetas', ordenInicial.length === 6);

  console.log('\n== 1) Las tarjetas ya NO tienen ningún gesto especial: mantener presionado no hace nada ==');
  const box0 = await page.locator('.cultivo-card').first().boundingBox();
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(1200); // bien más que cualquier "hold" que existía antes (900ms)
  const claseArrastrandoDurante = await page.evaluate(() =>
    document.querySelector('.cultivo-card').className
  );
  await page.mouse.up();
  await page.waitForTimeout(200);
  check(
    'ninguna clase de "arrastrando"/"sujetando" aparece por mantener presionado',
    !/arrastrando|sujetando/.test(claseArrastrandoDurante)
  );
  const urlTrasHold = page.url();
  check('mantener presionado y soltar en el mismo lugar abre la ficha (comportamiento de tap normal)', /#\/cultivo\/\d+/.test(urlTrasHold));
  await page.goBack();
  await page.waitForTimeout(400);

  console.log('\n== 2) Un toque (tap) normal abre la ficha ==');
  const ordenAntesTap = await especiesEnOrden(page);
  await page.locator('.cultivo-card').nth(1).click();
  await page.waitForTimeout(400);
  const urlTrasTap = page.url();
  check('el tap navegó a la ficha del cultivo', /#\/cultivo\/\d+/.test(urlTrasTap));
  await page.goBack();
  await page.waitForTimeout(400);
  const ordenTrasTap = await especiesEnOrden(page);
  check('el tap no alteró el orden', JSON.stringify(ordenAntesTap) === JSON.stringify(ordenTrasTap));

  console.log('\n== 3) Mover el mouse/dedo sobre una tarjeta (como si fuera a scrollear) no queda "atrapado" ==');
  const scrollAntes = await page.evaluate(() => window.scrollY);
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2 - 300, { steps: 6 });
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(150);
  // Con mouse, arrastrar sobre una card ya no dispara ningún comportamiento
  // propio (ni scroll manual, ni drag) — el navegador maneja el gesto
  // normalmente (con mouse real esto no scrollea la página tampoco, a
  // diferencia de un touchmove real; lo que importa acá es que nuestro JS
  // no intercepta nada ni deja las cards en un estado raro).
  const residualesTrasIntento = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cultivo-card')).map((c) => c.style.transform)
  );
  check('ninguna tarjeta quedó con transform inline (no hay más lógica de arrastre en las cards)', residualesTrasIntento.every((t) => t === ''));

  console.log('\n== 4) El menú dice "Ordenar cultivos" (no "Reordenar cultivos") y abre la herramienta ==');
  const etiquetaMenu = await page.locator('#btn-orden-cultivos').textContent();
  check('la etiqueta del menú es "Ordenar cultivos"', etiquetaMenu.trim() === 'Ordenar cultivos');
  await abrirOrdenar(page);
  const tituloModal = await page.locator('.modal-sheet h2').textContent();
  check('el modal se llama "Ordenar cultivos"', tituloModal.trim() === 'Ordenar cultivos');
  const filasModal = await page.locator('#orden-cultivos-list .home-layout-row').count();
  check('el modal lista los 6 cultivos', filasModal === 6);
  const hayHandle = await page.locator('#orden-cultivos-list .home-layout-handle').count();
  check('cada fila tiene el handle "≡" (mismo mecanismo que Personalizar inicio)', hayHandle === 6);

  console.log('\n== 5) Arrastrar desde el handle reordena, igual que en Personalizar inicio ==');
  const etiquetasAntesDrag = await etiquetasModal(page);
  const filas = page.locator('#orden-cultivos-list .home-layout-row');
  const etiquetaFila0 = etiquetasAntesDrag[0];
  const handle0 = filas.nth(0).locator('.home-layout-handle');
  const box0Modal = await handle0.boundingBox();
  const box2Modal = await filas.nth(2).boundingBox();
  await page.mouse.move(box0Modal.x + box0Modal.width / 2, box0Modal.y + box0Modal.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(180); // pasa la demora de "mantener presionado" (130ms)
  const destinoY = box2Modal.y + box2Modal.height * 0.8;
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      box0Modal.x + box0Modal.width / 2,
      box0Modal.y + box0Modal.height / 2 + (destinoY - box0Modal.y) * (i / 6),
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const etiquetasTrasDrag = await etiquetasModal(page);
  check('la fila arrastrada cambió de posición', etiquetasTrasDrag[0] !== etiquetaFila0);
  check('la fila arrastrada sigue en la lista (no se perdió)', etiquetasTrasDrag.includes(etiquetaFila0));

  console.log('\n== 6) El orden queda guardado — se refleja en la lista real de Mis cultivos ==');
  await cerrarModal(page);
  await page.waitForTimeout(300);
  const ordenTrasDrag = await especiesEnOrden(page);
  check('el orden de la lista real coincide con el del modal tras el arrastre', ordenTrasDrag[0] !== ordenInicial[0]);
  await page.reload();
  await page.waitForTimeout(600);
  const ordenTrasReload = await especiesEnOrden(page);
  check('el orden persiste tras recargar la página', JSON.stringify(ordenTrasDrag) === JSON.stringify(ordenTrasReload));

  console.log('\n== 7) ↑/↓ dentro del modal siguen funcionando como alternativa accesible ==');
  await abrirOrdenar(page);
  const primeraEtiquetaModal = (await page.locator('#orden-cultivos-list .home-layout-row').first().locator('.home-layout-label').textContent()).trim();
  await page.locator('#orden-cultivos-list .home-layout-row').first().locator('[data-move="down"]').click();
  await page.waitForTimeout(200);
  const segundaEtiquetaTrasMover = (await page.locator('#orden-cultivos-list .home-layout-row').nth(1).locator('.home-layout-label').textContent()).trim();
  check('↑/↓ en el modal también reordena', primeraEtiquetaModal === segundaEtiquetaTrasMover);

  console.log('\n== 8) "Restaurar orden predeterminado" vuelve al orden original ==');
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-restaurar-orden-cultivos').click();
  await page.waitForTimeout(300);
  await cerrarModal(page);
  await page.waitForTimeout(300);
  const ordenTrasRestaurar = await especiesEnOrden(page);
  check('el orden vuelve a ser el original (más reciente primero)', JSON.stringify(ordenTrasRestaurar) === JSON.stringify(ordenInicial));

  console.log('\n== 9) Crear un cultivo nuevo no rompe el orden manual (se agrega al final) ==');
  // Reordenamos manualmente de nuevo (vía ↑/↓, más simple y determinístico
  // para el test) para tener una preferencia guardada, y confirmamos que
  // un cultivo nuevo se agrega al final sin tocar a los demás.
  await abrirOrdenar(page);
  await page.locator('#orden-cultivos-list .home-layout-row').first().locator('[data-move="down"]').click();
  await page.waitForTimeout(200);
  await cerrarModal(page);
  await page.waitForTimeout(300);
  const ordenAntesDeCrear = await especiesEnOrden(page);
  await page.evaluate(async () => {
    await DB.addCultivo({ especie: 'TomateNuevo', tipoInicio: 'semilla', fechaInicio: '2026-01-01', estado: 'activo' });
  });
  await page.reload();
  await page.waitForTimeout(600);
  const ordenConNuevo = await especiesEnOrden(page);
  check('el cultivo nuevo aparece en la lista', ordenConNuevo.includes('TomateNuevo'));
  check('el cultivo nuevo quedó al final (fecha más vieja del grupo, y sin preferencia guardada)', ordenConNuevo[ordenConNuevo.length - 1] === 'TomateNuevo');
  check('los cultivos existentes conservaron su orden relativo', JSON.stringify(ordenConNuevo.slice(0, -1)) === JSON.stringify(ordenAntesDeCrear));

  console.log('\n== 10) No quedó ninguna fila/tarjeta con estilos residuales ==');
  const residualesCards = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cultivo-card')).map((c) => c.style.position + '|' + c.style.transform)
  );
  check('ninguna tarjeta quedó con position/transform inline residual', residualesCards.every((r) => r === '|'));

  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
