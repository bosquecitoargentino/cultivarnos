// views/ficha-especie.js — ficha de una especie de la Biblioteca.
//
// OJO: esto NO es "la ficha de mi cultivo" (esa sigue siendo
// views/detalle.js). Esta vista representa conocimiento general de la
// especie, no el historial de una planta concreta — por eso vive en su
// propia ruta (#/biblioteca/:id) y nunca se confunde con #/cultivo/:id.
// Diseño a propósito breve y con espacios en blanco: no es una
// enciclopedia, son bloques cortos de datos concretos.

function filaDato(icono, label, valor) {
  if (!valor) return '';
  return `
    <div class="ficha-fila">
      <span class="ficha-fila-icono">${icono}</span>
      <div class="ficha-fila-texto">
        <span class="ficha-fila-label">${escapeHtml(label)}</span>
        <span class="ficha-fila-valor">${escapeHtml(valor)}</span>
      </div>
    </div>
  `;
}

function formatRango(rango, sufijo = '') {
  if (!Array.isArray(rango) || rango.length !== 2 || rango[0] == null || rango[1] == null) return null;
  if (rango[0] === rango[1]) return `${rango[0]}${sufijo}`;
  return `${rango[0]}–${rango[1]}${sufijo}`;
}

function formatMeses(meses) {
  if (!Array.isArray(meses) || !meses.length) return null;
  return meses.map((m) => nombreMes(m)).join(', ');
}

function etiquetaTipoSeguimiento(tipo) {
  if (tipo === 'servicio') return 'Especie de servicio / biomasa';
  if (tipo === 'agroforestal') return 'Especie agroforestal';
  return 'Especie hortícola';
}

// Nombres de etapa legibles — cubre tanto el flujo hortícola estándar
// como el flujo de una especie de servicio (ver biblioteca-especies.js,
// especie tithonia, etapas.tipo === 'servicio').
const ETIQUETA_ETAPA = {
  germinacion: 'Germinación',
  plantula: 'Plántula',
  crecimiento: 'Crecimiento',
  floracion: 'Floración',
  produccion: 'Producción',
  senescencia: 'Fin de ciclo',
  establecimiento: 'Establecimiento',
  acumulacion_biomasa: 'Acumulación de biomasa',
  poda: 'Poda',
  rebrote: 'Rebrote',
};

function pintarEtapas(etapas) {
  if (!etapas) return '';
  const orden = etapas.tipo === 'servicio'
    ? ['establecimiento', 'crecimiento', 'acumulacion_biomasa', 'poda', 'rebrote']
    : ['germinacion', 'plantula', 'crecimiento', 'floracion', 'produccion', 'senescencia'];

  const bloques = orden
    .filter((key) => etapas[key])
    .map((key) => {
      const etapa = etapas[key];
      const dias = formatRango(etapa.diasOrientativos, ' días');
      const observar = (etapa.observar || []).slice(0, 2);
      return `
        <div class="ficha-etapa">
          <div class="ficha-etapa-titulo">${escapeHtml(ETIQUETA_ETAPA[key] || key)}${dias ? ` <span class="ficha-etapa-dias">· ${escapeHtml(dias)}</span>` : ''}</div>
          ${observar.length ? `<ul class="ficha-etapa-observar">${observar.map((o) => `<li>${escapeHtml(o)}</li>`).join('')}</ul>` : ''}
        </div>
      `;
    });

  return bloques.join('');
}

async function renderFichaEspecie(id, root) {
  root = root || APP_ROOT;
  const especie = typeof getEspecie === 'function' ? getEspecie(id) : null;

  if (!especie) {
    root.innerHTML = `
      <div class="view-header view-header-compacto">
        <a href="#/biblioteca" class="volver-link">‹ Biblioteca</a>
      </div>
      <div class="empty-state"><span class="emoji">🔍</span>Todavía no hay una ficha para esta especie.</div>
    `;
    return;
  }

  const { identidad, visual, siembra, calendario, ambiente, manejo, etapas, cosecha, ecologia } = especie;
  const config = await DB.getConfiguracion();
  const hemisferio = config.hemisferio || 'sur';
  const templado = calendario && calendario.templado;
  const ventana = templado && (hemisferio === 'norte' ? (templado.hemisferioNorte || null) : templado.hemisferioSur);

  const mesActual = new Date().getMonth() + 1;
  const estadoAlmacigo = ventana ? etiquetaVentanaMes(mesActual, ventana.almacigo) : null;
  const estadoDirecta = ventana ? etiquetaVentanaMes(mesActual, ventana.directa) : null;

  root.innerHTML = `
    <div class="view-header view-header-compacto">
      <a href="#/biblioteca" class="volver-link">‹ Biblioteca</a>
    </div>

    <div class="ficha-hero">
      <div class="ficha-hero-photo" style="${visual.imagen ? `background-image:url('${visual.imagen}')` : ''}">
        ${visual.imagen ? '' : (visual.icono || '🌿')}
      </div>
      <div class="ficha-hero-body">
        <div class="ficha-hero-nombre">${visual.icono ? `${visual.icono} ` : ''}${escapeHtml(identidad.nombre)}</div>
        <div class="ficha-hero-cientifico">${escapeHtml(identidad.nombreCientifico)}</div>
        <div class="detalle-badges">
          <span class="badge">${escapeHtml(identidad.familia)}</span>
          <span class="badge tierra">${escapeHtml(etiquetaTipoSeguimiento(identidad.tipoSeguimiento))}</span>
        </div>
      </div>
    </div>

    <section class="ficha-seccion">
      <div class="section-title">Resumen</div>
      <ul class="ficha-resumen">
        <li>${escapeHtml(identidad.ciclo)}</li>
        <li>${escapeHtml(identidad.tipoCrecimiento)}</li>
        ${identidad.estrato ? `<li>Estrato: ${escapeHtml(identidad.estrato)}</li>` : ''}
      </ul>
    </section>

    <section class="ficha-seccion">
      <div class="section-title">Siembra 🌱</div>
      ${filaDato('🌱', 'Método habitual', siembra.metodoPreferido)}
      ${filaDato('📏', 'Profundidad', formatRango(siembra.profundidadCm, ' cm'))}
      ${filaDato('⏳', 'Germinación aproximada', formatRango(siembra.germinacionDias, ' días'))}
      ${filaDato('🌡️', 'Temperatura favorable', siembra.temperaturaGerminacion && siembra.temperaturaGerminacion.ideal ? formatRango(siembra.temperaturaGerminacion.ideal, ' °C') : null)}
      ${siembra.trasplante && siembra.trasplante.recomendado ? filaDato('🪴', 'Trasplante', formatRango(siembra.trasplante.diasOrientativos, ' días después de sembrar')) : ''}
      ${ventana ? `
        <div class="ficha-calendario-nota">
          <span class="ficha-fila-icono">🗓️</span>
          <div class="ficha-fila-texto">
            <span class="ficha-fila-label">Ventana orientativa (hemisferio ${hemisferio === 'norte' ? 'Norte' : 'Sur'})</span>
            <span class="ficha-fila-valor">
              ${formatMeses(ventana.almacigo) ? `Almácigo: ${escapeHtml(formatMeses(ventana.almacigo))}${estadoAlmacigo ? ` — ${escapeHtml(estadoAlmacigo)} este mes` : ''}` : ''}
              ${formatMeses(ventana.directa) ? `${formatMeses(ventana.almacigo) ? '<br>' : ''}Directa: ${escapeHtml(formatMeses(ventana.directa))}${estadoDirecta ? ` — ${escapeHtml(estadoDirecta)} este mes` : ''}` : ''}
            </span>
          </div>
        </div>
        <p class="ficha-calendario-disclaimer">Orientativo — el microclima de tu huerta puede correr estas fechas.</p>
      ` : ''}
    </section>

    <section class="ficha-seccion">
      <div class="section-title">Ambiente</div>
      ${filaDato('☀️', 'Luz', [ambiente.luz.nivel ? ambiente.luz.nivel.replace(/_/g, ' ') : null, ambiente.luz.notas].filter(Boolean).join(' — '))}
      ${filaDato('💧', 'Agua', [ambiente.agua.demanda ? `demanda ${ambiente.agua.demanda}` : null, ambiente.agua.notas].filter(Boolean).join(' — '))}
      ${filaDato('🌡', 'Temperatura', [formatRango(ambiente.temperatura.ideal, ' °C ideales'), ambiente.temperatura.notas].filter(Boolean).join(' — '))}
      ${filaDato('🌱', 'Suelo', [ambiente.suelo.tipoPreferido, ambiente.suelo.drenaje ? `drenaje ${ambiente.suelo.drenaje}` : null].filter(Boolean).join(' — '))}
    </section>

    <section class="ficha-seccion">
      <div class="section-title">Cultivo</div>
      ${filaDato('📐', 'Distancia entre plantas', formatRango(manejo.distanciaCm, ' cm'))}
      ${filaDato('🪵', 'Tutorado', manejo.tutorado)}
      ${filaDato('✂️', 'Poda', manejo.poda)}
      ${filaDato('🍂', 'Cobertura de suelo', manejo.coberturaSuelo)}
    </section>

    <section class="ficha-seccion">
      <div class="section-title">Etapas</div>
      <div class="ficha-etapas">${pintarEtapas(etapas)}</div>
    </section>

    <section class="ficha-seccion">
      <div class="section-title">Cosecha 🧺</div>
      ${filaDato('🧺', 'Tipo', cosecha.tipo)}
      ${cosecha.indicadoresMadurez && cosecha.indicadoresMadurez.length ? `
        <div class="ficha-fila">
          <span class="ficha-fila-icono">✅</span>
          <div class="ficha-fila-texto">
            <span class="ficha-fila-label">Indicadores de madurez</span>
            <ul class="ficha-etapa-observar">${cosecha.indicadoresMadurez.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>
          </div>
        </div>
      ` : ''}
      ${filaDato('🔁', 'Frecuencia orientativa', formatRango(cosecha.frecuenciaOrientativaDias, ' días'))}
    </section>

    ${ecologia && ((ecologia.interaccionesAObservar || []).length || (ecologia.principiosManejo || []).length) ? `
    <section class="ficha-seccion">
      <div class="section-title">Relaciones a observar 🌎</div>
      ${(ecologia.interaccionesAObservar || []).length ? `<ul class="ficha-etapa-observar">${ecologia.interaccionesAObservar.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>` : ''}
    </section>
    ` : ''}

    <button type="button" id="btn-registrar-cultivo" class="btn-primary" style="margin-top:8px;">＋ Registrar este cultivo</button>
  `;

  root.querySelector('#btn-registrar-cultivo').addEventListener('click', () => {
    navigate(`#/nuevo?especie=${encodeURIComponent(especie.id)}`);
  });
}
