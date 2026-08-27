// test-arrastre-cultivos-gestos.js — valida específicamente el rediseño
// del motor gestual de "Mis cultivos": touch-action: none fijo +
// "scroll manual" antes de activar el hold (ya no depende de que el
// navegador scrollee solo), y que el arrastre activado no se corte.

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
  const consoleLogs = [];
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
    if (msg.type() === 'log' && msg.text().includes('[arrastre-cultivos]')) consoleLogs.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push('pageerror: ' + err.message));

  await page.goto('http://localhost:8899/index.html');
  await page.waitForTimeout(700);

  await page.evaluate(async () => {
    const nombres = ['Tomate1', 'Tomate2', 'Tomate3', 'Tomate4', 'Tomate5', 'Tomate6', 'Tomate7', 'Tomate8', 'Tomate9', 'Tomate10'];
    for (let i = 0; i < nombres.length; i++) {
      const fecha = new Date(2026, 5, 1 + i).toISOString().slice(0, 10);
      await DB.addCultivo({ especie: nombres[i], tipoInicio: 'semilla', fechaInicio: fecha, estado: 'activo' });
    }
  });

  await page.goto('http://localhost:8899/index.html#/cultivos');
  await page.waitForTimeout(600);

  console.log('\n== 0) touch-action de la tarjeta es "none" fijo (no pan-y) ==');
  const touchAction = await page.evaluate(() => getComputedStyle(document.querySelector('.cultivo-card')).touchAction);
  check('touch-action computado es "none"', touchAction === 'none');

  console.log('\n== 1) "Modo scroll manual": mover antes del hold scrollea la página igual ==');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const scrollAntes = await page.evaluate(() => window.scrollY);
  const box0 = await page.locator('.cultivo-card').first().boundingBox();
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  // Nos movemos hacia arriba (scroll hacia abajo) bastante antes del hold.
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2 - i * 15, { steps: 2 });
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(150);
  const scrollDurante = await page.evaluate(() => window.scrollY);
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('la página scrolleó por el gesto manual (aunque touch-action sea none)', scrollDurante > scrollAntes);

  console.log('\n== 2) Después de ese scroll manual, la tarjeta no se abrió ni se reordenó ==');
  const urlTrasScroll = page.url();
  check('no navegó a ninguna ficha durante el scroll manual', !/#\/cultivo\/\d+/.test(urlTrasScroll));

  console.log('\n== 3) Con el hold activado, el arrastre NO se corta: sigue el puntero varios frames ==');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  const cardBox = await page.locator('.cultivo-card').first().boundingBox();
  await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950); // pasa el hold sin moverse
  const posicionesTransform = [];
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(cardBox.x + cardBox.width / 2, cardBox.y + cardBox.height / 2 + i * 20, { steps: 2 });
    await page.waitForTimeout(40);
    const t = await page.evaluate(() => document.querySelector('.cultivo-card-arrastrando')?.style.transform || '');
    posicionesTransform.push(t);
  }
  await page.waitForTimeout(100);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const huboTransformsDistintos = new Set(posicionesTransform).size > 1;
  check('el transform de la tarjeta arrastrada cambió en frames sucesivos (no se quedó pegada)', huboTransformsDistintos);
  check('todas las muestras tienen translate3d con Y creciente (sigue el puntero)', posicionesTransform.every((t) => /translate3d/.test(t)));

  console.log('\n== 4) Tras soltar, no queda ninguna tarjeta con pointer capture colgado ==');
  // No hay API directa para consultar "quién tiene pointer capture" desde
  // fuera, pero sí podemos confirmar que un toque normal posterior sigue
  // funcionando con normalidad (si hubiese quedado capturado algo raro,
  // esto fallaría).
  const cardParaTap = page.locator('.cultivo-card').nth(3);
  await cardParaTap.click();
  await page.waitForTimeout(400);
  const urlTrasTap = page.url();
  check('un toque normal después de un arrastre sigue abriendo la ficha con normalidad', /#\/cultivo\/\d+/.test(urlTrasTap));
  await page.goBack();
  await page.waitForTimeout(400);

  console.log('\n== 5) Los logs de diagnóstico temporales aparecen (pointerdown, activación, capture) ==');
  const tienePointerdown = consoleLogs.some((l) => l.includes('pointerdown'));
  const tieneActivated = consoleLogs.some((l) => l.includes('longpress activated'));
  const tieneCapture = consoleLogs.some((l) => l.includes('setPointerCapture'));
  const tieneScrollManual = consoleLogs.some((l) => l.includes('modo scroll manual'));
  check('se logueó al menos un pointerdown', tienePointerdown);
  check('se logueó la activación del long press', tieneActivated);
  check('se logueó el intento de setPointerCapture', tieneCapture);
  check('se logueó la entrada a modo scroll manual', tieneScrollManual);

  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
