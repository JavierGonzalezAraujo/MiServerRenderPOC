const express = require('express');
const axios = require('axios');
const app = express();

const authStates = {}; // { [state]: { accessToken, sessId, status, meStatus } }

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
        <h1>Iniciar Onboarding Web (2FA)</h1>
        <button onclick="startFlow()">Iniciar</button>

        <script>
          async function startFlow() {
            const state = 'web_2FA_' + Math.random().toString(36).substring(2);
            const res = await fetch('/start-me-full?state=' + state);
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

// Paso 1: me-full y generar authUrl con 2FASESSID
app.get('/start-me-full', async (req, res) => {
  const { state } = req.query;

  try {
    // Obtener token primero (usamos dummy code, puedes usar real)
    const tokenRes = await axios.post('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token',
      new URLSearchParams({
        client_id: '174765141853',
        client_secret: '293ff733e4a241d399bd6b26818ba203',
        grant_type: 'client_credentials',
        scope: 'openid',
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*'
        }
      });

    const accessToken = tokenRes.data.access_token;

    const meFullRes = await axios.get('https://apis.es.bbvaapimarket.com/es/customers/v2/me-full', {
      headers: {
        'Authorization': 'Bearer ' + accessToken,
        'Accept': '*/*',
        'Host': 'apis.es.bbvaapimarket.com'
      },
      validateStatus: () => true
    });

    const location = meFullRes.headers['location'] || meFullRes.headers['map.location'];
    const sessId = meFullRes.headers['2fasessid'] || meFullRes.headers['map.2fasessid'];

    if (!location || !sessId) {
      return res.status(400).json({ error: 'No se pudo obtener location o 2FASESSID' });
    }

    // Guardamos datos para el state
    authStates[state] = {
      accessToken,
      sessId,
      status: null,
      meStatus: null
    };

    const authUrl = `${location}?2FASESSID=${sessId}&digest=z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==&alg=SHA-512&state=${state}`;
    res.json({ authUrl });

  } catch (e) {
    console.error("Error en start-me-full:", e.message);
    res.status(500).json({ error: 'Error llamando a me-full' });
  }
});

// Redirección después del 2FA
app.get('/redirect', (req, res) => {
  const { state, status, '2FASESSID': sessId } = req.query;

  if (!state || !authStates[state]) {
    return res.status(400).send('Estado inválido');
  }

  authStates[state].status = status;
  if (sessId) authStates[state].sessId = sessId;

  console.log(`Redirect 2FA recibido | State: ${state} | Status: ${status} | SessID: ${sessId}`);

  res.send(`
    <html>
      <head><title>Redirigiendo...</title></head>
      <body>
        <script>window.close();</script>
        <p>Proceso completado. Puedes cerrar esta pestaña.</p>
      </body>
    </html>
  `);
});

// Polling
app.get('/poll', (req, res) => {
  const { state } = req.query;
  const data = authStates[state];
  if (data?.status === 'ok') {
    res.json({ ready: true });
  } else {
    res.json({ ready: false });
  }
});

// Mostrar resultado final y llamar a me/status
app.get('/show', async (req, res) => {
  const { state } = req.query;
  const record = authStates[state];

  if (!record || !record.status) {
    return res.status(400).send('Datos insuficientes');
  }

  let meStatusJson = record.meStatus;

  if (record.status === 'ok' && !meStatusJson) {
    try {
      const meStatusRes = await axios.get(`https://apis.es.bbvaapimarket.com/auth/2fa/v1/status?2FASESSID=${record.sessId}`, {
        headers: {
          'Authorization': 'Bearer ' + record.accessToken
        }
      });
      meStatusJson = meStatusRes.data;
      authStates[state].meStatus = meStatusJson;
    } catch (err) {
      console.error("Error en me/status:", err.message);
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Resultado del Onboarding 2FA</title>
        <style>
          body { font-family: Arial; padding: 2rem; background-color: #f5f5f5; }
          .box { background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
          pre { background: #eee; padding: 1rem; border-radius: 5px; white-space: pre-wrap; }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Resultado del flujo 2FA</h1>
          <p><strong>State:</strong> ${state}</p>
          <p><strong>Status 2FA:</strong> ${record.status}</p>
          <p><strong>2FASESSID:</strong> ${record.sessId}</p>
          ${meStatusJson ? `<h2>me/status:</h2><pre>${JSON.stringify(meStatusJson, null, 2)}</pre>` : '<p><em>No se pudo obtener me/status.</em></p>'}
        </div>
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
