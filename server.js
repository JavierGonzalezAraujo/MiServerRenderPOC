const express = require('express');
const axios = require('axios');
const app = express();

const authStates = {}; // { [state]: { code, timestamp, sessId, status, meStatus, accessToken } }

app.use(express.static('public'));

// Página de inicio
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
            const state = 'web_OAuth' + Math.random().toString(36).substring(2);
            const res = await fetch('/get-auth-url?state=' + state);
            const data = await res.json();
            window.open(data.authUrl, '_blank');

            const interval = setInterval(async () => {
              const pollRes = await fetch('/poll?state=' + state);
              const pollData = await pollRes.json();
              if (pollData.ready) {
                clearInterval(interval);
                window.location.href = '/show?state=' + encodeURIComponent(state);
              }
            }, 1000);
          }
        </script>
      </body>
    </html>
  `);
});

// Generar URL de login
app.get('/get-auth-url', async (req, res) => {
  const { state } = req.query;

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

    res.json({ authUrl: response.headers.location });
  } catch (err) {
    console.error('Error obteniendo auth URL:', err.message);
    res.status(500).json({ error: 'Error obteniendo URL de autorización' });
  }
});

// Redirección de BBVA OAuth
app.get('/redirect', async (req, res) => {
  const { code, state } = req.query;

  if (!state || !code) {
    return res.status(400).send('Faltan parámetros');
  }

  try {
    // 1. Intercambio de code por access token
    const tokenRes = await axios.post('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token',
      new URLSearchParams({
        client_id: '174765141853',
        client_secret: '293ff733e4a241d399bd6b26818ba203',
        grant_type: 'authorization_code',
        code,
        code_verifier: "ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg",
        redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*',
          'Host': 'apis.es.bbvaapimarket.com'
        }
      });

    const accessToken = tokenRes.data.access_token;

    // 2. Llamada a me/full
    const meFullCall = await axios.get('https://apis.es.bbvaapimarket.com/customer-sandbox/v1/customers/me/full', {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Host': 'apis.es.bbvaapimarket.com'
      },
      maxRedirects: 0,
      validateStatus: status => status === 302,
    });

    const sessId = meFullCall.headers['2fasessid'] || meFullCall.headers['2FASESSID'];
    const location = meFullCall.headers.location;

    const digest = "z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==";
    const authUrl = `${location}?2FASESSID=${sessId}&digest=${encodeURIComponent(digest)}&alg=SHA-512&state=${state}`;

    // Guardar el estado
    authStates[state] = {
      code,
      accessToken,
      sessId,
      status: 'ok',
      timestamp: Date.now(),
      meStatus: null
    };

    res.redirect(authUrl);
  } catch (err) {
    console.error("Error en redirección /redirect:", err.message);
    res.status(500).send("Error procesando la redirección");
  }
});

// Polling del cliente para saber si se completó el proceso
app.get('/poll', (req, res) => {
  const { state } = req.query;
  const data = authStates[state];
  if (data?.status === 'ok') {
    res.json({ ready: true });
  } else {
    res.json({ ready: false });
  }
});

// Mostrar resultado y llamar a me/status si aplica
app.get('/show', async (req, res) => {
  const { state } = req.query;
  const record = authStates[state];

  if (!record) {
    return res.status(404).send("Estado no encontrado");
  }

  const { sessId, status, meStatus, accessToken } = record;
  let meStatusJson = meStatus;

  if (status === 'ok' && sessId && accessToken && !meStatusJson) {
    try {
      const meStatusRes = await axios.get(
        `https://apis.es.bbvaapimarket.com/customer-sandbox/v1/customers/me/status?2FASESSID=${sessId}`,
        {
          headers: {
            'Authorization': 'Bearer ' + accessToken
          }
        }
      );

      meStatusJson = meStatusRes.data;
      authStates[state].meStatus = meStatusJson;

    } catch (e) {
      console.error("Error obteniendo me/status:", e.message);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Resultado del Onboarding</title>
        <style>
          body { font-family: Arial; padding: 2rem; background-color: #f5f5f5; }
          .box { background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          pre { background: #eee; padding: 1rem; border-radius: 5px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Resultado del Onboarding 2FA</h1>
          <p><strong>State:</strong> ${state || 'N/A'}</p>
          <p><strong>2FA Status:</strong> ${status || 'N/A'}</p>
          <p><strong>2FASESSID:</strong> ${sessId || 'N/A'}</p>
          ${meStatusJson
            ? `<h2>Datos de me/status</h2><pre>${JSON.stringify(meStatusJson, null, 2)}</pre>`
            : '<p><em>No se pudo obtener me/status.</em></p>'}
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
