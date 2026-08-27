const { chromium } = require('playwright');

const BASE = 'http://localhost:8899';
const results = [];
function ok(name, cond, extra) { results.push({ name, pass: !!cond, extra: extra || '' }); }

(async () => {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // Configure hemisferio first via DB directly (fast setup)
  await page.goto(BASE + '/index.html');
  await page.waitForTimeout(900);
  await page.evaluate(async () => {
    const cfg = await DB.getConfiguracion();
    cfg.hemisferio = 'sur';
    await DB.setConfiguracion(cfg);
  });

  await page.goto(BASE + '/index.html#/calendario');
  await page.waitForTimeout(600);

  // find a chip and remember its label + which month we're on
  const mesInicial = await page.$eval('#cal-mes-label', (el) => el.textContent);
  const chips = await page.$$eval('.calendario-chip', (els) => els.map((e) => e.textContent.trim()));
  ok('calendario tiene chips', chips.length > 0, JSON.stringify(chips.slice(0, 10)));

  // navigate forward 2 months to a non-default month, to test context preservation
  await page.click('#cal-next');
  await page.click('#cal-next');
  const mesTest = await page.$eval('#cal-mes-label', (el) => el.textContent);
  ok('mes cambiado', mesTest !== mesInicial, `${mesInicial} -> ${mesTest}`);

  const chipsAfter = await page.$$eval('.calendario-chip', (els) => els.map((e) => e.textContent.trim()));
  if (chipsAfter.length > 0) {
    const targetLabel = chipsAfter[0];
    await page.click('.calendario-chip');
    await page.waitForTimeout(500);
    const hash = await page.evaluate(() => location.hash);
    ok('tap en chip navega a ficha de biblioteca', /^#\/biblioteca\//.test(hash), hash);

    const fichaTitulo = await page.$eval('.ficha-hero-nombre', (el) => el.textContent).catch(() => null);
    ok('ficha muestra un nombre de especie', !!fichaTitulo, fichaTitulo);

    const backLink = await page.$eval('.volver-link', (el) => el.textContent.trim()).catch(() => null);
    ok('back link dice Calendario', backLink === '‹ Calendario', backLink);

    await page.click('.volver-link');
    await page.waitForTimeout(500);
    const hashBack = await page.evaluate(() => location.hash);
    ok('volver navega a #/calendario', hashBack === '#/calendario', hashBack);

    const mesRestaurado = await page.$eval('#cal-mes-label', (el) => el.textContent);
    ok('mes restaurado tras volver', mesRestaurado === mesTest, `esperado=${mesTest} obtenido=${mesRestaurado}`);
  } else {
    ok('tap en chip navega a ficha de biblioteca', false, 'no chips found after nav');
  }

  // TEST: normal biblioteca entry still shows '‹ Biblioteca'
  await page.goto(BASE + '/index.html#/biblioteca');
  await page.waitForTimeout(500);
  const firstCard = await page.$('.especie-card');
  if (firstCard) {
    await firstCard.click();
    await page.waitForTimeout(400);
    const backLinkNormal = await page.$eval('.volver-link', (el) => el.textContent.trim()).catch(() => null);
    ok('entrada normal desde Biblioteca conserva "‹ Biblioteca"', backLinkNormal === '‹ Biblioteca', backLinkNormal);
  }

  console.log('\n=== RESULTADOS CALENDARIO ===');
  results.forEach((r) => console.log(`[${r.pass ? 'PASS' : 'FAIL'}] ${r.name}${r.extra ? ' -- ' + r.extra : ''}`));
  console.log(`\nConsole errors: ${errors.length}`);
  if (errors.length) console.log(JSON.stringify(errors.slice(0, 10), null, 2));
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  await browser.close();
  process.exit(failed.length || errors.length ? 1 : 0);
})();
