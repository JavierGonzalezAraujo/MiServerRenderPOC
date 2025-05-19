const express = require('express');
const axios = require('axios');
const app = express();

const authStates = {}; // { [state]: { code, timestamp } }

app.use(express.static('public'));

// Paso 1: página de inicio
app.get('/start', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Iniciar Onboarding</title>
        <style>
          body { font-family: Arial; padding: 2rem; }
          button { padding: 1rem; font-size: 1rem; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Iniciar Onboarding</h1>
        <button onclick="startFlow()">Iniciar</button>

        <script>
          async function startFlow() {
            const state = 'state_' + Math.random().toString(36).substring(2);

            // Pide la URL del login
            const res = await fetch('/get-auth-url?state=' + state);
            const data = await res.json();

            // Abre nueva pestaña al login
            window.open(data.authUrl, '_blank');

            // Empieza a hacer polling hasta que esté listo
            const interval = setInterval(async () => {
              const pollRes = await fetch('/poll?state=' + state);
              const pollData = await pollRes.json();
              if (pollData.ready) {
                clearInterval(interval);
                window.location.href = '/show?code=' + encodeURIComponent(pollData.code) + '&state=' + encodeURIComponent(state);
              }
            }, 1000);
          }
        </script>
      </body>
    </html>
  `);
});

// Paso 2: generar la URL de login
app.get('/get-auth-url', async (req, res) => {
  const { state } = req.query;

  // Aquí iría tu petición real a authorize.com si fuera POST. Suponiendo que puedes hacer un GET y te responde con 302:
  try {
    const response = await axios.get('https://apis.es.bbvaapimarket.com/auth/oauth/v2/authorize', {
      params: {
        response_type: 'code',
        client_id: '170773573158',
        redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
        code_challenge: "ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg",
        code_challenge_method: 'S256',
        scope: 'openid',
        state,
      },
      maxRedirects: 0,
      validateStatus: status => status === 302,
    });

    const authUrl = response.headers.location;
    res.json({ authUrl });
  } catch (err) {
    res.status(500).json({ error: 'Error obteniendo URL de autorización' });
  }
});

// Paso 3: login redirige aquí
app.get('/redirect', (req, res) => {
  const { code, state } = req.query;
  authStates[state] = { code, timestamp: Date.now() };

  console.log('Redirect recibido:', { code, state });

  const ua = req.headers['user-agent'] || '';
  const isMobileUA = /iphone|ipad|android/i.test(ua);
  const isFromApp = state && state.startsWith('mobile_');  // Detectamos por el prefijo

  console.log(`Redirect received. UA: ${ua}, State: ${state}, 2FASESSID: ${sessId}, Status: ${status}`);

  // Construir deep link
  let callbackUrl = `bbvapoc://callback`;

  const params = new URLSearchParams();
  if (code) params.append('code', code);
  if (state) params.append('state', state);
  if (sessId) params.append('2FASESSID', sessId);
  if (status) params.append('status', status);

  if ([...params].length > 0) {
    callbackUrl += `?${params.toString()}`;
  }

  // Redirección a la app si viene de mobile
  if (isMobileUA || isFromApp) {
    console.log('Redireccionando a la app con URL:', callbackUrl);
    res.send(`
      <html>
        <head><title>Redirigiendo a la app...</title></head>
        <body>
          <script>window.location = "${callbackUrl}";</script>
        </body>
      </html>
    `);
  } else {
    // Para navegadores (OAuth desde web)
    res.send(`
      <html>
        <head><title>Onboarding completado</title></head>
        <body>
          <script>window.close();</script>
          <p>Proceso completado. Puedes cerrar esta pestaña.</p>
        </body>
      </html>
    `);
  }
});

// Paso 4: polling del navegador original
app.get('/poll', (req, res) => {
  const { state } = req.query;
  const result = authStates[state];
  if (result) {
    res.json({ ready: true, code: result.code });
  } else {
    res.json({ ready: false });
  }
});

// Paso 5: página que muestra el resultado final
app.get('/show', (req, res) => {
  const { code, state } = req.query;
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Resultado del Onboarding</title>
        <style>
          body { font-family: Arial; padding: 2rem; background-color: #f5f5f5; }
          .box { background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Autenticación completada</h1>
          <p><strong>Code:</strong> ${code || 'N/A'}</p>
          <p><strong>State:</strong> ${state || 'N/A'}</p>
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo');
});
