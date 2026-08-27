// test-orden-cultivos.js — validación mínima de "mantener presionado +
// arrastrar" para reordenar tarjetas en Mis cultivos. Simulado con
// page.mouse (Chromium genera PointerEvents reales con pointerType
// "mouse", el mismo código que consume habilitarArrastreCultivos).

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

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const consoleErrors = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('http://localhost:8899/index.html');
  await page.waitForTimeout(700);

  // 8 cultivos activos, con fechaInicio distintas para que el orden por
  // defecto (más reciente primero) quede bien determinado: E1 (más nuevo)
  // ... E8 (más viejo).
  const especies = await page.evaluate(async () => {
    const nombres = ['Tomate1', 'Tomate2', 'Tomate3', 'Tomate4', 'Tomate5', 'Tomate6', 'Tomate7', 'Tomate8'];
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
  check('el más nuevo (Tomate8, fechaInicio más tardía) aparece primero', ordenInicial[0] === 'Tomate8');
  check('hay 8 tarjetas', ordenInicial.length === 8);

  console.log('\n== 1) La ayuda de descubribilidad aparece la primera vez ==');
  const hayAyuda = await page.locator('.cultivos-ayuda-orden').count();
  check('el texto de ayuda "Mantené presionado..." está presente', hayAyuda === 1);

  console.log('\n== 2) Toque normal (sin mantener) abre la ficha ==');
  const primeraCard = page.locator('.cultivo-card').first();
  await primeraCard.click();
  await page.waitForTimeout(400);
  const abrioFicha = await page.locator('.detalle-hero, .view-header').count();
  const urlTrasTap = page.url();
  check('un toque normal navegó a la ficha del cultivo', /#\/cultivo\/\d+/.test(urlTrasTap) && abrioFicha > 0);
  await page.goBack();
  await page.waitForTimeout(400);

  console.log('\n== 3) Un movimiento antes del hold (scroll) NO activa el arrastre ==');
  const ordenAntesScroll = await especiesEnOrden(page);
  const box0 = await page.locator('.cultivo-card').first().boundingBox();
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2 + 40, { steps: 4 }); // se mueve YA, antes del hold
  await page.waitForTimeout(1000); // superamos de sobra los 900ms, pero ya se canceló
  await page.mouse.up();
  await page.waitForTimeout(200);
  const ordenTrasScroll = await especiesEnOrden(page);
  check('mover antes del hold no reordenó nada', JSON.stringify(ordenAntesScroll) === JSON.stringify(ordenTrasScroll));

  console.log('\n== 4) Mantener ~1 segundo + arrastrar reordena ==');
  const etiquetaFila0 = ordenTrasScroll[0]; // Tomate8
  const cardFila0 = page.locator('.cultivo-card').first();
  const cardFila2Box = await page.locator('.cultivo-card').nth(2).boundingBox();
  const box = await cardFila0.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950); // pasa el umbral de hold (900ms) sin moverse
  const destinoY = cardFila2Box.y + cardFila2Box.height * 0.85;
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + (destinoY - box.y) * (i / 6));
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const ordenTrasArrastre = await especiesEnOrden(page);
  check('la tarjeta mantenida y arrastrada cambió de posición', ordenTrasArrastre[0] !== etiquetaFila0);
  check('la tarjeta arrastrada sigue estando en la lista (no se perdió)', ordenTrasArrastre.includes(etiquetaFila0));

  console.log('\n== 5) La ayuda desaparece después del primer reordenamiento ==');
  const ayudaTrasReordenar = await page.locator('.cultivos-ayuda-orden').count();
  check('el texto de ayuda ya no aparece', ayudaTrasReordenar === 0);

  console.log('\n== 6) El nuevo orden persiste tras recargar ==');
  await page.reload();
  await page.waitForTimeout(500);
  const ordenTrasReload = await especiesEnOrden(page);
  check('el orden se mantiene igual tras recargar', JSON.stringify(ordenTrasArrastre) === JSON.stringify(ordenTrasReload));

  console.log('\n== 7) Cambiar de pestaña (Todos) y volver (Activos) conserva el orden ==');
  await page.locator('.filter-tab[data-filter="todos"]').click();
  await page.waitForTimeout(300);
  await page.locator('.filter-tab[data-filter="activo"]').click();
  await page.waitForTimeout(300);
  const ordenTrasTabs = await especiesEnOrden(page);
  check('el orden no cambió solo por cambiar de pestaña', JSON.stringify(ordenTrasReload) === JSON.stringify(ordenTrasTabs));

  console.log('\n== 8) Auto-scroll: arrastrar cerca del borde inferior mueve la página ==');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const scrollAntes = await page.evaluate(() => window.scrollY);
  const ultimaCard = page.locator('.cultivo-card').last();
  await ultimaCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const boxUltima = await ultimaCard.boundingBox();
  await page.mouse.move(boxUltima.x + boxUltima.width / 2, boxUltima.y + boxUltima.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950);
  // Llevamos el puntero bien cerca del borde inferior visible y lo dejamos
  // ahí varios frames — el loop de auto-scroll debería mover la página
  // sola, sin más movimientos del mouse.
  await page.mouse.move(boxUltima.x + boxUltima.width / 2, 820);
  await page.waitForTimeout(600);
  const scrollDurante = await page.evaluate(() => window.scrollY);
  await page.mouse.up();
  await page.waitForTimeout(300);
  check('la página hizo auto-scroll mientras se mantenía cerca del borde', scrollDurante > scrollAntes);

  console.log('\n== 9) "Reordenar cultivos" (menú ⋯): alternativa ↑/↓ funciona ==');
  await page.locator('#btn-menu').click();
  await page.waitForTimeout(150);
  await page.locator('#btn-orden-cultivos').click();
  await page.waitForTimeout(300);
  const filasModal = await page.locator('#orden-cultivos-list .home-layout-row').count();
  check('el modal de reordenar lista los 8 cultivos', filasModal === 8);
  const primeraEtiquetaModal = (await page.locator('#orden-cultivos-list .home-layout-row').first().locator('.home-layout-label').textContent());
  await page.locator('#orden-cultivos-list .home-layout-row').first().locator('[data-move="down"]').click();
  await page.waitForTimeout(200);
  const segundaEtiquetaModalTrasMover = (await page.locator('#orden-cultivos-list .home-layout-row').nth(1).locator('.home-layout-label').textContent());
  check('↑/↓ en el modal también reordena', primeraEtiquetaModal.trim() === segundaEtiquetaModalTrasMover.trim());

  console.log('\n== 10) "Restaurar orden predeterminado" vuelve al orden original ==');
  page.once('dialog', (d) => d.accept());
  await page.locator('#btn-restaurar-orden-cultivos').click();
  await page.waitForTimeout(300);
  await page.locator('#modal-close').click();
  await page.waitForTimeout(300);
  const ordenTrasRestaurar = await especiesEnOrden(page);
  check('el orden vuelve a ser el original (más reciente primero)', JSON.stringify(ordenTrasRestaurar) === JSON.stringify(ordenInicial));

  console.log('\n== 11) No quedó ninguna tarjeta con estilos residuales ==');
  const residuales = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cultivo-card')).map((c) => c.style.position)
  );
  check('ninguna tarjeta quedó con position inline residual', residuales.every((p) => p === ''));

  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
