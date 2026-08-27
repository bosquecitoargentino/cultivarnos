// test-orden-cultivos-2d.js — validación del arrastre 2D (X+Y) y de que la
// selección de texto de iOS solo se bloquea durante el gesto, nunca en
// reposo. Complementa test-orden-cultivos.js (que ya cubre el caso
// vertical clásico); acá se agregan los casos nuevos: mover una tarjeta
// horizontalmente dentro de la misma fila de la grilla de 2 columnas,
// mover entre filas, y el ciclo de vida de .cultivo-card-sujetando.

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

  await page.evaluate(async () => {
    const nombres = ['Tomate1', 'Tomate2', 'Tomate3', 'Tomate4', 'Tomate5', 'Tomate6'];
    for (let i = 0; i < nombres.length; i++) {
      const fecha = new Date(2026, 5, 1 + i).toISOString().slice(0, 10);
      await DB.addCultivo({ especie: nombres[i], tipoInicio: 'semilla', fechaInicio: fecha, estado: 'activo' });
    }
  });

  await page.goto('http://localhost:8899/index.html#/cultivos');
  await page.waitForTimeout(600);

  console.log('\n== 0) Confirmamos que la grilla es de 2 columnas (misma fila y) ==');
  const box0 = await page.locator('.cultivo-card').nth(0).boundingBox();
  const box1 = await page.locator('.cultivo-card').nth(1).boundingBox();
  const box2 = await page.locator('.cultivo-card').nth(2).boundingBox();
  check('las tarjetas 0 y 1 están en la misma fila', Math.abs(box0.y - box1.y) < 5);
  check('la tarjeta 2 está en la fila siguiente', box2.y > box0.y + box0.height / 2);
  check('la tarjeta 1 está a la derecha de la 0 (misma fila, 2 columnas)', box1.x > box0.x + box0.width / 2);

  console.log('\n== 1) .cultivo-card-sujetando se agrega ni bien empieza el toque ==');
  const ordenAntes1 = await especiesEnOrden(page);
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(150); // bien antes del hold (900ms) — todavía "posible gesto"
  const tieneSujetandoDuranteHold = await page.evaluate(() =>
    document.querySelector('.cultivo-card').classList.contains('cultivo-card-sujetando')
  );
  check('la clase se agrega desde el pointerdown, antes de que se cumpla el hold', tieneSujetandoDuranteHold);

  console.log('\n== 2) Si se cancela por movimiento antes del hold, se saca la clase ==');
  await page.mouse.move(box0.x + box0.width / 2, box0.y + box0.height / 2 + 40, { steps: 4 });
  await page.waitForTimeout(200);
  const sujetandoTrasCancelar = await page.evaluate(() =>
    document.querySelector('.cultivo-card').classList.contains('cultivo-card-sujetando')
  );
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('la clase se quita al cancelarse el gesto (scroll)', !sujetandoTrasCancelar);
  const ordenTrasCancelar = await especiesEnOrden(page);
  check('cancelar por scroll no reordenó nada', JSON.stringify(ordenAntes1) === JSON.stringify(ordenTrasCancelar));

  console.log('\n== 3) Arrastre horizontal dentro de la misma fila (columna 0 -> columna 1) ==');
  const etiquetaCol0 = ordenTrasCancelar[0]; // Tomate1
  const etiquetaCol1 = ordenTrasCancelar[1]; // Tomate2
  const cardCol0 = page.locator('.cultivo-card').nth(0);
  const cardCol1Box = await page.locator('.cultivo-card').nth(1).boundingBox();
  const boxCol0 = await cardCol0.boundingBox();
  await page.mouse.move(boxCol0.x + boxCol0.width / 2, boxCol0.y + boxCol0.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950); // supera el hold sin moverse
  const tieneSujetandoActivo = await page.evaluate(() =>
    document.querySelector('.cultivo-card-arrastrando')?.classList.contains('cultivo-card-sujetando')
  );
  check('al activarse el arrastre, la tarjeta sigue con cultivo-card-sujetando', tieneSujetandoActivo === true);
  // Movemos el puntero bien a la derecha (al centro de la columna 1, y un
  // poco más allá) sin apenas variar la Y — un desplazamiento puramente
  // horizontal.
  const destinoX = cardCol1Box.x + cardCol1Box.width * 0.9;
  for (let i = 1; i <= 6; i++) {
    await page.mouse.move(
      boxCol0.x + boxCol0.width / 2 + (destinoX - (boxCol0.x + boxCol0.width / 2)) * (i / 6),
      boxCol0.y + boxCol0.height / 2,
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(150);
  // Mientras se arrastra, el transform debe reflejar movimiento en X (no
  // solo en Y) — confirmamos que el eje horizontal no está bloqueado.
  const transformDuranteArrastre = await page.evaluate(() =>
    document.querySelector('.cultivo-card-arrastrando')?.style.transform
  );
  check(
    'el transform inline durante el arrastre incluye traslación en X (translate3d con dx != 0)',
    /translate3d\(\s*-?\d*[1-9]\d*(\.\d+)?px/.test(transformDuranteArrastre || '')
  );
  await page.mouse.up();
  await page.waitForTimeout(250);
  const ordenTrasHorizontal = await especiesEnOrden(page);
  check('la tarjeta de la columna 0 cambió de lugar tras el arrastre horizontal', ordenTrasHorizontal[0] !== etiquetaCol0);
  check('la que estaba en la columna 1 ahora quedó primera', ordenTrasHorizontal[0] === etiquetaCol1);
  check('la tarjeta arrastrada sigue en la lista (no se perdió)', ordenTrasHorizontal.includes(etiquetaCol0));

  console.log('\n== 4) Arrastre entre filas (cambiar de fila y de columna a la vez) ==');
  // Tomamos la primera tarjeta de la fila 1 (índice 2) y la llevamos hasta
  // la posición de la última tarjeta visible, combinando X e Y.
  const ordenAntes4 = await especiesEnOrden(page);
  const etiquetaMovida = ordenAntes4[2];
  const cardOrigen = page.locator('.cultivo-card').nth(2);
  await cardOrigen.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const boxOrigen = await cardOrigen.boundingBox();
  const cardDestino = page.locator('.cultivo-card').last();
  await cardDestino.scrollIntoViewIfNeeded();
  await page.waitForTimeout(150);
  const boxDestinoFinal = await cardDestino.boundingBox();
  await page.mouse.move(boxOrigen.x + boxOrigen.width / 2, boxOrigen.y + boxOrigen.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(950);
  const pasos = 8;
  for (let i = 1; i <= pasos; i++) {
    await page.mouse.move(
      boxOrigen.x + boxOrigen.width / 2 + (boxDestinoFinal.x - boxOrigen.x) * (i / pasos),
      boxOrigen.y + boxOrigen.height / 2 + (boxDestinoFinal.y - boxOrigen.y) * (i / pasos),
    );
    await page.waitForTimeout(30);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await page.waitForTimeout(250);
  const ordenTrasEntreFilas = await especiesEnOrden(page);
  check('la tarjeta movida entre filas cambió de posición', ordenTrasEntreFilas.indexOf(etiquetaMovida) !== 2);
  check('sigue en la lista (no se perdió ni se duplicó)', ordenTrasEntreFilas.filter((e) => e === etiquetaMovida).length === 1);
  check('no se perdió ninguna tarjeta (siguen siendo 6)', ordenTrasEntreFilas.length === 6);

  console.log('\n== 5) Un toque normal tras el arrastre sigue abriendo la ficha (no quedó "enganchado") ==');
  const cardParaTap = page.locator('.cultivo-card').first();
  await cardParaTap.click();
  await page.waitForTimeout(400);
  const url = page.url();
  check('un toque normal después de haber arrastrado antes sigue navegando a la ficha', /#\/cultivo\/\d+/.test(url));
  await page.goBack();
  await page.waitForTimeout(400);

  console.log('\n== 6) Ninguna tarjeta en reposo quedó con estilos o clases residuales ==');
  const residuales = await page.evaluate(() =>
    Array.from(document.querySelectorAll('.cultivo-card')).map((c) => ({
      position: c.style.position,
      transform: c.style.transform,
      touchAction: c.style.touchAction,
      margin: c.style.margin,
      sujetando: c.classList.contains('cultivo-card-sujetando'),
      arrastrando: c.classList.contains('cultivo-card-arrastrando'),
    }))
  );
  check('ninguna tarjeta quedó con position inline residual', residuales.every((r) => r.position === ''));
  check('ninguna tarjeta quedó con transform inline residual', residuales.every((r) => r.transform === ''));
  check('ninguna tarjeta quedó con touch-action inline residual', residuales.every((r) => r.touchAction === ''));
  check('ninguna tarjeta quedó con margin inline residual', residuales.every((r) => r.margin === ''));
  check('ninguna tarjeta quedó con la clase cultivo-card-sujetando', residuales.every((r) => !r.sujetando));
  check('ninguna tarjeta quedó con la clase cultivo-card-arrastrando', residuales.every((r) => !r.arrastrando));

  console.log('\n== 7) En reposo, las tarjetas NO tienen user-select/touch-callout deshabilitado ==');
  const estiloComputadoReposo = await page.evaluate(() => {
    const c = document.querySelector('.cultivo-card');
    const cs = getComputedStyle(c);
    return { userSelect: cs.userSelect, webkitTouchCallout: cs.webkitTouchCallout || cs['-webkit-touch-callout'] };
  });
  check(
    'user-select en reposo NO es "none" (la regla ya no vive en la clase base .cultivo-card)',
    estiloComputadoReposo.userSelect !== 'none'
  );

  console.log('\n== Errores de consola ==');
  console.log(consoleErrors.length ? consoleErrors.join('\n') : '(ninguno)');
  check('cero errores de consola en toda la corrida', consoleErrors.length === 0);

  await browser.close();
  console.log(`\n${pass} pasaron, ${fail} fallaron`);
  process.exit(fail > 0 ? 1 : 0);
})();
