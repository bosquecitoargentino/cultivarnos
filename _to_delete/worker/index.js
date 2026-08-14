// worker/index.js — proxy serverless para el asistente de IA de Cultivarnos.
//
// Este archivo NUNCA contiene la API key de Anthropic: se lee de
// env.ANTHROPIC_API_KEY, un secreto configurado en Cloudflare con
// `wrangler secret put ANTHROPIC_API_KEY` (ver docs/deploy-ia.md). Si en
// algún momento este archivo aparece con una key en texto plano, algo
// salió mal — hay que sacarla y rotarla.
//
// Se despliega por separado del sitio estático (GitHub Pages): la PWA le
// pega a la URL pública de este Worker, nunca a la API de Anthropic
// directamente.

import { AGRICULTOR_PROMPT } from './prompts/agricultor.js';

// Verificá en https://docs.claude.com/en/docs/about-claude/models que este
// sea el modelo vigente antes de desplegar — los identificadores de modelo
// cambian con el tiempo.
const MODELO = 'claude-sonnet-5';
const MAX_TOKENS = 600;

function buildCorsHeaders(origin, allowedOrigin) {
  const headers = {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Cultivarnos-Token',
    Vary: 'Origin',
  };
  if (origin && origin === allowedOrigin) {
    headers['Access-Control-Allow-Origin'] = allowedOrigin;
  }
  return headers;
}

function jsonResponse(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = buildCorsHeaders(origin, env.ALLOWED_ORIGIN);
    const { pathname } = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (pathname !== '/consultar' || request.method !== 'POST') {
      return jsonResponse({ error: 'No encontrado' }, 404, cors);
    }

    if (origin !== env.ALLOWED_ORIGIN) {
      return jsonResponse({ error: 'Origen no permitido' }, 403, cors);
    }

    // No es un secreto real (viaja en el cliente, cualquiera con acceso al
    // JS de la PWA puede verlo) — solo frena scraping casual del endpoint.
    // La protección de fondo sigue siendo: alertas de gasto en la cuenta
    // de Anthropic. Ver docs/arquitectura-ia.md, sección 7.
    const token = request.headers.get('X-Cultivarnos-Token');
    if (!token || token !== env.APP_TOKEN) {
      return jsonResponse({ error: 'No autorizado' }, 401, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch (err) {
      return jsonResponse({ error: 'JSON inválido' }, 400, cors);
    }

    // Límites duros de tamaño: el cliente ya arma un contexto acotado
    // (construirContextoCultivo / construirContextoHuerta), esto es solo
    // un resguardo adicional del lado del servidor.
    const contexto = String(body.contexto || '').slice(0, 6000);
    const mensaje = String(body.mensaje || '').slice(0, 2000);

    if (!mensaje.trim()) {
      return jsonResponse({ error: 'Falta el mensaje' }, 400, cors);
    }

    const contenidoUsuario = contexto ? `${contexto}\n\n---\n\n${mensaje}` : mensaje;

    let anthropicRes;
    try {
      anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODELO,
          max_tokens: MAX_TOKENS,
          system: AGRICULTOR_PROMPT,
          messages: [{ role: 'user', content: contenidoUsuario }],
        }),
      });
    } catch (err) {
      return jsonResponse({ error: 'No se pudo contactar a la IA' }, 502, cors);
    }

    if (!anthropicRes.ok) {
      const detalle = await anthropicRes.text().catch(() => '');
      console.error('Error de Anthropic:', anthropicRes.status, detalle);
      return jsonResponse({ error: 'La IA no pudo responder en este momento' }, 502, cors);
    }

    const data = await anthropicRes.json();
    const texto = (data.content || [])
      .map((bloque) => bloque.text || '')
      .join('')
      .trim();

    return jsonResponse({ respuesta: texto }, 200, cors);
  },
};
