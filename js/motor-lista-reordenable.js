// motor-lista-reordenable.js — arrastrar para reordenar, con handle "≡" +
// Pointer Events, reutilizable en cualquier lista de filas dentro de un
// modal chico (`.modal-sheet`). Es la MISMA lógica que "Personalizar
// inicio" usaba para sus bloques (antes vivía duplicada ahí adentro, en
// habilitarArrastreHomeLayout) — se extrajo acá para que "Ordenar
// cultivos" pueda usar exactamente el mismo mecanismo en vez de tener su
// propia implementación de arrastre. Un solo sistema de "arrastrar con
// handle dentro de un modal" para toda la app.
//
// Requiere que cada fila de la lista use las clases ya establecidas por
// "Personalizar inicio" (ver css/styles.css, sección "Filas reordenables
// reutilizables"): `.home-layout-row` (con `data-id`), y un
// `.home-layout-handle` adentro desde donde arranca el arrastre. El
// arrastre es SOLO desde el handle — nunca desde el resto de la fila —
// así nunca compite con un tap en otra parte de la fila (una etiqueta, un
// checkbox, las flechas ↑/↓) ni con el scroll del modal.
//
// No decide NADA sobre qué significa el nuevo orden ni cómo se persiste
// — eso es responsabilidad de quien llama, vía el callback onReordenar
// (recibe el array de `data-id` en el nuevo orden, como strings). Este
// módulo solo mueve filas en el DOM y anima el reacomodo.

// Markup del handle, compartido entre "Personalizar inicio" y "Ordenar
// cultivos" — antes cada uno tenía escrito a mano el mismo botón con el
// carácter "≡" adentro. Es un ícono SVG a propósito, no texto: en iPhone
// un carácter de texto puede quedar atrapado en una selección igual que
// cualquier otra letra de la pantalla; un SVG no participa de eso. No es
// parte del sistema de 24 íconos curados de js/icons.js (ese catálogo es
// solo para trazos de la lámina de referencia) — este es un trazo chico
// aparte, propio de este componente.
function handleArrastreHtml() {
  return `
    <button type="button" class="home-layout-handle" aria-hidden="true" tabindex="-1">
      <svg class="home-layout-handle-icono" width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" focusable="false">
        <rect x="3" y="5" width="14" height="2" rx="1" fill="currentColor"></rect>
        <rect x="3" y="9" width="14" height="2" rx="1" fill="currentColor"></rect>
        <rect x="3" y="13" width="14" height="2" rx="1" fill="currentColor"></rect>
      </svg>
    </button>
  `;
}

function habilitarArrastreListaReordenable(sheet, listEl, { onReordenar, onSoltar }) {
  const UMBRAL_MOVIMIENTO = 8; // px — para distinguir de un tap o de un gesto horizontal
  const DEMORA_HOLD = 130; // ms — "mantener presionado", no un tap
  const MARGEN_AUTOSCROLL = 42; // px desde el borde visible del modal
  const VELOCIDAD_AUTOSCROLL = 12; // px por frame, mientras el dedo esté cerca del borde

  let drag = null; // estado del arrastre activo, o null si no hay ninguno

  listEl.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const handle = e.target.closest('.home-layout-handle');
    if (!handle) return;
    const fila = handle.closest('.home-layout-row');
    if (!fila) return;
    e.preventDefault();
    prepararPosibleArrastre(e, fila);
  });

  // Si de todos modos algo (iOS, un navegador distinto) intenta mostrar el
  // menú contextual de mantener-presionado, se lo evita ACÁ, escopeado
  // solo a esta lista — nunca globalmente. La solución principal sigue
  // siendo el CSS de arriba (`.home-layout-list, .home-layout-list *`);
  // esto es un cinturón de seguridad, no el mecanismo principal.
  listEl.addEventListener('contextmenu', (e) => e.preventDefault());

  function prepararPosibleArrastre(eInicial, fila) {
    const pointerId = eInicial.pointerId;
    const xInicial = eInicial.clientX;
    const yInicial = eInicial.clientY;
    let activado = false;
    let descartado = false;

    const timer = setTimeout(() => {
      if (!descartado) activar();
    }, DEMORA_HOLD);

    function activar() {
      if (activado || descartado) return;
      activado = true;
      comenzarArrastre(fila, yInicial);
    }

    function onMove(e) {
      if (e.pointerId !== pointerId) return;
      const dy = e.clientY - yInicial;
      const dx = e.clientX - xInicial;
      if (!activado) {
        if (Math.abs(dy) > UMBRAL_MOVIMIENTO && Math.abs(dy) > Math.abs(dx)) {
          clearTimeout(timer);
          activar();
        } else if (Math.abs(dx) > UMBRAL_MOVIMIENTO && Math.abs(dx) > Math.abs(dy)) {
          // Gesto horizontal desde el handle: esto es solo vertical, se
          // descarta en vez de forzar algo que no se pidió.
          descartado = true;
          clearTimeout(timer);
          quitarListeners();
        }
        return;
      }
      if (drag) drag.ultimoClientY = e.clientY;
    }

    function onUp(e) {
      if (e.pointerId !== pointerId) return;
      clearTimeout(timer);
      quitarListeners();
      if (activado) finalizarArrastre();
    }

    function quitarListeners() {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onUp);
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onUp);
  }

  function comenzarArrastre(fila, clientY) {
    // Red de seguridad secundaria: si alguna selección de texto alcanzó a
    // arrancar durante el mantener-presionado (antes de este punto), se
    // limpia acá. La solución principal es el CSS de arriba — esto es solo
    // un refuerzo para el caso raro en que igual algo quedó seleccionado.
    window.getSelection?.()?.removeAllRanges();

    const rect = fila.getBoundingClientRect();
    const listRect = listEl.getBoundingClientRect();

    // Un placeholder ocupa el lugar de la fila mientras esta "flota" — así
    // el resto de la lista no se desarma, solo se corre para hacerle lugar.
    const placeholder = document.createElement('div');
    placeholder.className = 'home-layout-placeholder';
    placeholder.style.height = rect.height + 'px';
    fila.parentNode.insertBefore(placeholder, fila);

    fila.classList.add('home-layout-row-arrastrando');
    fila.style.position = 'absolute';
    fila.style.left = (rect.left - listRect.left) + 'px';
    fila.style.top = (rect.top - listRect.top) + 'px';
    fila.style.width = rect.width + 'px';

    drag = {
      fila,
      placeholder,
      altura: rect.height,
      offsetDentro: clientY - rect.top,
      ultimoClientY: clientY,
      rafId: null,
    };
    drag.rafId = requestAnimationFrame(paso);
  }

  function paso() {
    if (!drag) return;
    posicionarYReordenar(drag.ultimoClientY);
    autoScroll(drag.ultimoClientY);
    drag.rafId = requestAnimationFrame(paso);
  }

  function posicionarYReordenar(clientY) {
    const listRect = listEl.getBoundingClientRect();
    let top = clientY - listRect.top - drag.offsetDentro;
    const maxTop = Math.max(0, listEl.scrollHeight - drag.altura);
    top = Math.min(Math.max(top, 0), maxTop);
    drag.fila.style.top = top + 'px';

    // ¿A cuál fila (que no sea la que se arrastra) le pasamos por encima del
    // centro? Ahí es donde va el placeholder — el resto de la lista se
    // reacomoda solo, por ser flujo normal.
    const centro = top + drag.altura / 2;
    const filas = Array.from(listEl.querySelectorAll('.home-layout-row:not(.home-layout-row-arrastrando)'));
    let destino = null;
    for (const f of filas) {
      if (centro < f.offsetTop + f.offsetHeight / 2) { destino = f; break; }
    }
    const siguienteActual = drag.placeholder.nextElementSibling;
    if (destino !== siguienteActual && destino !== drag.placeholder) {
      animarReacomodo(() => {
        if (destino) listEl.insertBefore(drag.placeholder, destino);
        else listEl.appendChild(drag.placeholder);
      });
    }
  }

  // FLIP chico: antes de mover el placeholder, mido dónde está cada fila;
  // después de moverlo, si alguna fila cambió de posición la dejo animar
  // desde donde estaba hasta donde quedó (120-180ms, sin rebote — mismas
  // variables de motion que ya usa el resto de la app), en vez de que
  // "salte" de golpe.
  function animarReacomodo(mutar) {
    const filas = Array.from(listEl.querySelectorAll('.home-layout-row:not(.home-layout-row-arrastrando)'));
    const antes = new Map(filas.map((f) => [f, f.getBoundingClientRect().top]));
    mutar();
    filas.forEach((f) => {
      const delta = antes.get(f) - f.getBoundingClientRect().top;
      if (!delta) return;
      f.style.transition = 'none';
      f.style.transform = `translateY(${delta}px)`;
      requestAnimationFrame(() => {
        f.style.transition = 'transform var(--motion-base) var(--ease-soft)';
        f.style.transform = '';
      });
    });
  }

  function autoScroll(clientY) {
    const contRect = sheet.getBoundingClientRect();
    if (clientY < contRect.top + MARGEN_AUTOSCROLL) {
      sheet.scrollTop -= VELOCIDAD_AUTOSCROLL;
    } else if (clientY > contRect.bottom - MARGEN_AUTOSCROLL) {
      sheet.scrollTop += VELOCIDAD_AUTOSCROLL;
    }
  }

  function finalizarArrastre() {
    if (!drag) return;
    cancelAnimationFrame(drag.rafId);
    const { fila, placeholder } = drag;
    listEl.insertBefore(fila, placeholder);
    placeholder.remove();
    fila.style.position = '';
    fila.style.left = '';
    fila.style.top = '';
    fila.style.width = '';
    fila.classList.remove('home-layout-row-arrastrando');

    const idsEnOrden = Array.from(listEl.querySelectorAll('.home-layout-row')).map((f) => f.dataset.id);
    onReordenar(idsEnOrden);

    drag = null;
    onSoltar();
  }
}
