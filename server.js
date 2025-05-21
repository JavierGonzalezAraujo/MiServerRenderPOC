const express = require('express');
const axios = require('axios');
const app = express();

const authStates = {}; // { [state]: { code, accessToken, sessId, status, meStatus } }

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
            const state = 'web_2FA_' + Math.random().toString(36).substring(2);
            const res = await fetch('/get-auth-url?state=' + state);
            const data = await res.json();
            window.open(data.authUrl, '_blank');

            const interval = setInterval(async () => {
              const pollRes = await fetch('/poll?state=' + state);
              const pollData = await pollRes.json();
              if (pollData.ready) {
                clearInterval(interval);
                window.location.href = '/get-2FA?code=' + encodeURIComponent(pollData.code) + '&state=' + encodeURIComponent(state);
              }
            }, 1000);
          }
        </script>
      </body>
    </html>
  `);
});

// Obtener URL de autorización
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
    console.error('Error auth URL:', err.message);
    res.status(500).json({ error: 'Error obteniendo URL de autorización' });
  }
});

// Redirección tras login
app.get('/redirect', (req, res) => {
  const { code, state } = req.query;

  if (!state || !code) {
    return res.status(400).send('Faltan parámetros');
  }

  authStates[state] = { code, timestamp: Date.now() };

  res.send(`Redirección completada. Puedes cerrar esta pestaña.`);
});

// Polling
app.get('/poll', (req, res) => {
  const { state } = req.query;
  const data = authStates[state];
  if (data?.code) {
    res.json({ ready: true, code: data.code });
  } else {
    res.json({ ready: false });
  }
});

// Paso 2FA con meFull -> redirect -> meStatus
app.get('/get-2FA', async (req, res) => {
  const { state, code } = req.query;
  const record = authStates[state] || {};

  try {
    const tokenRes = await axios.post('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token',
      new URLSearchParams({
        client_id: '174765141853',
        client_secret: '293ff733e4a241d399bd6b26818ba203',
        grant_type: 'authorization_code',
        code,
        code_verifier: "ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg",
        redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const accessToken = tokenRes.data.access_token;
    authStates[state].accessToken = accessToken;

    const meFullRes = await axios.get('https://apis.es.bbvaapimarket.com/es/customers/v2/me-full', {
      headers: {
        'Host': 'apis.es.bbvaapimarket.com',
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken,
      },
      maxRedirects: 0,
      validateStatus: status => status === 302,
    });

    const location = meFullRes.headers.location;
    const sessId = meFullRes.headers['2fasessid'];

    const authUrl = `${location}?2FASESSID=${sessId}&digest=z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==&alg=SHA-512&state=${state}`;

    authStates[state].sessId = sessId;
    authStates[state].status = 'ok'; // simulamos éxito tras auth

    res.redirect(authUrl);
  } catch (err) {
    console.error('Error durante el flujo 2FA:', err.message);
    res.status(500).send('Error en proceso 2FA');
  }
});

// Mostrar resultado final
app.get('/show', async (req, res) => {
  const { state } = req.query;
  const record = authStates[state];

  if (!record || !record.accessToken || !record.sessId) {
    return res.status(400).send('Falta información');
  }

  try {
    const meStatusRes = await axios.get(
      `https://apis.es.bbvaapimarket.com/customer-sandbox/v1/customers/me/status?2FASESSID=${record.sessId}`,
      { headers: { 'Authorization': 'Bearer ' + record.accessToken } }
    );

    const meStatus = meStatusRes.data;
    authStates[state].meStatus = meStatus;

    res.send(`
      <html>
        <body>
          <h1>Onboarding 2FA completado</h1>
          <pre>${JSON.stringify(meStatus, null, 2)}</pre>
        </body>
      </html>
    `);
  } catch (e) {
    console.error('Error llamando a me/status:', e.message);
    res.status(500).send('Error al obtener estado del cliente');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor activo en puerto ${PORT}`));
