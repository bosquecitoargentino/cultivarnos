// ia/proveedor-ia.js — único punto que sabe hablar con el proxy de IA.
//
// El resto de la app nunca llama a un proveedor específico directamente:
// siempre pasa por consultarIA(contexto, mensaje). Si el día de mañana
// cambiamos de proveedor o de plataforma serverless, este es el único
// archivo que hay que tocar.
//
// IMPORTANTE: estas dos constantes son placeholders. Hay que reemplazarlas
// después de desplegar el Worker — ver docs/deploy-ia.md.

// URL del Worker desplegado, sin barra al final. Ejemplo real:
// 'https://cultivarnos-ia.tu-subdominio.workers.dev'
const IA_ENDPOINT_URL = 'https://REEMPLAZAR-DESPUES-DEL-DEPLOY.workers.dev';

// Mismo valor elegido al correr `wrangler secret put APP_TOKEN`. No es un
// secreto real (viaja en el cliente, cualquiera puede verlo en el JS de la
// PWA) — es solo una fricción básica contra scraping casual del endpoint.
const IA_APP_TOKEN = 'REEMPLAZAR-CON-EL-MISMO-VALOR-DEL-WORKER';

// Devuelve el texto de la respuesta, o lanza un Error con uno de estos
// mensajes cortos para que la interfaz decida qué mostrar:
//   'sin-conexion'   -> no hay internet, o el endpoint no está configurado
//   'error-servidor' -> el proxy respondió pero con un error
async function consultarIA(contexto, mensaje) {
  if (!navigator.onLine) {
    throw new Error('sin-conexion');
  }

  let respuesta;
  try {
    respuesta = await fetch(`${IA_ENDPOINT_URL}/consultar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cultivarnos-Token': IA_APP_TOKEN,
      },
      body: JSON.stringify({ contexto, mensaje }),
    });
  } catch (err) {
    // Sin red, endpoint todavía no desplegado, CORS mal configurado, etc.
    throw new Error('sin-conexion');
  }

  if (!respuesta.ok) {
    throw new Error('error-servidor');
  }

  const data = await respuesta.json();
  return data.respuesta;
}

window.consultarIA = consultarIA;
