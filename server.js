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
        <div id="result"></div>

        <script>
          async function startFlow() {
            const state = 'web_2FA_' + Math.random().toString(36).substring(2);

            try {
              const tokenRes = await fetch('/get-token?state=' + state);
              const { accessToken, discovery } = await tokenRes.json();

              const meFullCall = await fetch(discovery.meFull, {
                method: 'GET',
                headers: {
                  'Host': 'apis.es.bbvaapimarket.com',
                  'Accept': '*/*',
                  'Content-Type': 'application/json',
                  'Authorization': 'Bearer ' + accessToken
                }
              });

              const location = meFullCall.headers.get('location');
              const sessId = meFullCall.headers.get('2fasessid');

              if (!location || !sessId) {
                alert("No se pudo obtener 2FASESSID o location de me-full");
                return;
              }

              const digest = "z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==";
              const authUrl = `${location}?2FASESSID=${sessId}&digest=${encodeURIComponent(digest)}&alg=SHA-512&state=${state}`;

              window.open(authUrl, '_blank');

              const interval = setInterval(async () => {
                try {
                  const pollRes = await fetch('/poll?state=' + state);
                  const pollData = await pollRes.json();

                  if (pollData.ready) {
                    clearInterval(interval);

                    const statusRes = await fetch(`/get-status?2FASESSID=${pollData.sessId}&state=${state}`);
                    const statusData = await statusRes.json();

                    const container = document.getElementById('result');
                    container.innerHTML = `
                      <h2>Resultado del Onboarding</h2>
                      <pre>${JSON.stringify(statusData, null, 2)}</pre>
                    `;
                  }
                } catch (err) {
                  console.error('Error en el polling:', err);
                }
              }, 1000);

            } catch (err) {
              console.error('Error en el flujo de autenticación:', err);
              alert("Error en el flujo de autenticación. Ver consola.");
            }
          }
        </script>
      </body>
    </html>
  `);
});

// Obtener token de acceso
app.get('/get-token', async (req, res) => {
  try {
    const tokenRes = await axios.post('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token',
      new URLSearchParams({
        client_id: '174765141853',
        client_secret: '293ff733e4a241d399bd6b26818ba203',
        grant_type: 'client_credentials',
        scope: 'openid'
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*',
          'Host': 'apis.es.bbvaapimarket.com'
        }
      });

    const accessToken = tokenRes.data.access_token;
    const state = req.query.state;
    authStates[state] = { accessToken, timestamp: Date.now() };

    res.json({
      accessToken,
      discovery: {
        meFull: 'https://apis.es.bbvaapimarket.com/es/customers/v2/me-full',
        meStatus: 'https://apis.es.bbvaapimarket.com/customer-sandbox/v1/customers/me/status'
      }
    });
  } catch (err) {
    console.error('Error obteniendo token:', err);
    res.status(500).json({ error: 'No se pudo obtener token' });
  }
});

// Polling para saber si el usuario completó el 2FA
app.get('/poll', (req, res) => {
  const { state } = req.query;
  const data = authStates[state];
  if (data?.sessId && data?.status === 'ok') {
    res.json({ ready: true, sessId: data.sessId });
  } else {
    res.json({ ready: false });
  }
});

// Endpoint que registra el redirect 2FA
app.get('/redirect', (req, res) => {
  const { code, state, status, '2FASESSID': sessId } = req.query;

  if (!state) return res.status(400).send('Falta el parámetro state');

  if (!authStates[state]) authStates[state] = {};
  authStates[state].sessId = sessId;
  authStates[state].status = status;

  res.send(`<script>window.close();</script>`);
});

// Obtener me/status
app.get('/get-status', async (req, res) => {
  const { state, '2FASESSID': sessId } = req.query;
  const record = authStates[state];
  if (!record || !record.accessToken) return res.status(400).json({ error: 'Faltan datos' });

  try {
    const meStatusRes = await axios.get(`https://apis.es.bbvaapimarket.com/customer-sandbox/v1/customers/me/status?2FASESSID=${sessId}`, {
      headers: {
        Authorization: 'Bearer ' + record.accessToken
      }
    });
    res.json(meStatusRes.data);
  } catch (err) {
    console.error('Error llamando a me/status:', err);
    res.status(500).json({ error: 'Error en llamada a me/status' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
