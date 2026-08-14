# Desplegar el proxy de IA (Etapa B)

Estos pasos son los únicos que tenés que hacer vos: crear la cuenta de Cloudflare, generar la API key de Anthropic, y cargarlas como secretos. Yo no puedo hacer nada de esto por vos — son cuentas y credenciales tuyas.

Corré todo esto en tu propia Terminal (no en esta conversación), parado en la carpeta del proyecto.

## 1. Conseguir la API key de Anthropic

1. Entrá a [console.anthropic.com](https://console.anthropic.com) con tu cuenta (o creá una si no tenés).
2. Andá a la sección de API Keys y generá una nueva.
3. Guardala en algún lugar seguro por un momento — la vas a pegar en el paso 5.
4. En la misma consola, configurá un límite de gasto mensual (Settings → Billing/Limits). Recomendado antes de seguir, no después.

## 2. Instalar Wrangler (la herramienta de Cloudflare)

```bash
npm install -g wrangler
```

Si preferís no instalarlo global, podés anteponer `npx` a cada comando de Wrangler de los pasos siguientes (`npx wrangler login`, etc.).

## 3. Iniciar sesión en Cloudflare

```bash
wrangler login
```

Esto abre el navegador. Si no tenés cuenta de Cloudflare, la creás ahí mismo (el plan gratuito alcanza de sobra para esto).

## 4. Pararte en la carpeta del Worker

```bash
cd ~/Cultivarnos/worker
```

## 5. Cargar los secretos

```bash
wrangler secret put ANTHROPIC_API_KEY
```
Pega la API key del paso 1 cuando lo pida y presioná Enter.

```bash
wrangler secret put APP_TOKEN
```
Elegí cualquier texto largo y difícil de adivinar (por ejemplo, generá uno con `openssl rand -hex 24`) y pegalo. Anotalo — lo vas a necesitar en el paso 7.

## 6. Desplegar

```bash
wrangler deploy
```

Al terminar, va a imprimir una URL parecida a:

```
https://cultivarnos-ia.tu-subdominio.workers.dev
```

Copiala.

## 7. Conectar la PWA con el Worker

Abrí `js/ia/proveedor-ia.js` y reemplazá estas dos líneas:

```js
const IA_ENDPOINT_URL = 'https://REEMPLAZAR-DESPUES-DEL-DEPLOY.workers.dev';
const IA_APP_TOKEN = 'REEMPLAZAR-CON-EL-MISMO-VALOR-DEL-WORKER';
```

- `IA_ENDPOINT_URL`: la URL que te dio `wrangler deploy` en el paso 6 (sin barra al final).
- `IA_APP_TOKEN`: el mismo texto que elegiste en el paso 5 para `APP_TOKEN`.

## 8. Confirmar el origen permitido

Abrí `worker/wrangler.toml` y confirmá que `ALLOWED_ORIGIN` sea exactamente la URL base de tu GitHub Pages (por ejemplo `https://bosquecitoargentino.github.io`, sin la parte del repo ni barra final). Si la cambiás, hay que correr `wrangler deploy` de nuevo desde `worker/`.

## 9. Commitear y subir

```bash
cd ~/Cultivarnos
git add -A
git commit -m "Etapa B: arquitectura de IA (proxy, contexto, proveedor)"
git push
```

El repo nunca va a tener ninguna API key adentro — solo el código que las usa. Las keys viven únicamente como secretos en Cloudflare.

## 10. Probar que el circuito completo funciona

Con la app ya actualizada en tu iPhone (o en cualquier navegador), abrí las herramientas de desarrollador → consola, y corré:

```js
construirContextoHuerta().then(c => consultarIA(c, '¿Qué debería mirar esta semana?')).then(console.log)
```

Si todo está bien conectado, después de unos segundos deberías ver la respuesta de la IA impresa en la consola. Si da error, revisá en este orden: que `IA_ENDPOINT_URL` y `IA_APP_TOKEN` en `proveedor-ia.js` coincidan con lo desplegado, que `ALLOWED_ORIGIN` en `wrangler.toml` coincida exactamente con el origen desde el que estás probando, y que la API key de Anthropic esté vigente y con crédito.

Nada de esto todavía tiene un botón en la interfaz — es intencional (ver `docs/arquitectura-ia.md`, Etapa B). El chat visible llega en la Etapa D.
