const express = require('express');
const axios = require('axios');
const app = express();
const qs = require('qs'); // Necesario para codificar el body correctamente

const authStates = {}; // { [state]: { code, timestamp, sessId, status } }

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
            const state = 'web_OAuth_' + Math.random().toString(36).substring(2);
            const res = await fetch('/get-auth-url?state=' + state);
            const data = await res.json();
            window.open(data.authUrl, '_blank');

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

// Generar URL de login
app.get('/get-auth-url', async (req, res) => {
  const { state } = req.query;

  try {
    const response = await axios.get('https://apis.es.bbvaapimarket.com/auth/oauth/v2/authorize', {
      params: {
        response_type: 'code',
        client_id: '170773573158',
        redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
        code_challenge: "47DEQpj8HBSa-_TImW-5JCeuQeRkm5NMpJWZG3hSuFU",
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

// Redirección de BBVA OAuth y 2FA
app.get('/redirect', (req, res) => {
  console.log(req.query);
  const { code, state, status, '2FASESSID': sessId } = req.query;

  if (!state) {
    return res.status(400).send('Estado inválido');
  }

  authStates[state] = {
    code: code || null,
    sessId: sessId || null,
    status: status || null,
    timestamp: Date.now()
  };

  const ua = req.headers['user-agent'] || '';
  const isMobileUA = /iphone|ipad|android/i.test(ua);
  const isFromApp = state.startsWith('mobile_');

  console.log(isFromApp);

  const params = new URLSearchParams();
  if (code) params.append('code', code);
  if (state) params.append('state', state);
  if (sessId) params.append('2FASESSID', sessId);
  if (status) params.append('status', status);

  const callbackUrl = `bbvapoc://callback${params.toString() ? '?' + params.toString() : ''}`;

  console.log(`Redirect recibido | UA: ${ua} | State: ${state} | Code: ${code} | 2FASESSID: ${sessId} | Status: ${status}`);

  if (isMobileUA || isFromApp) {
    console.log('Redirigiendo a la app con deep link:', callbackUrl);
    res.send(`
      <html>
        <head><title>Redirigiendo...</title></head>
        <body>
          <script>window.location = "${callbackUrl}";</script>
        </body>
      </html>
    `);
  } else {
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

// Polling del cliente para saber si se completó el proceso
app.get('/poll', (req, res) => {
  const { state } = req.query;
  const data = authStates[state];
  if (data?.code) {
    res.json({ ready: true, code: data.code });
  } else {
    res.json({ ready: false });
  }
});

// Mostrar resultado final (solo para debug o vista web)
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
        <h1>Me Full</h1>
        <button onclick="startFlow()">Me Full</button>

        <script>
          async function startFlow() {
            const state = 'web_2FA_' + Math.random().toString(36).substring(2);
            const res = await fetch('/get-2FA?code=' + encodeURIComponent(pollData.code) + '&state=' + encodeURIComponent(state));
            const data = await res.json();
            window.open(data.authUrl, '_blank');

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

app.get('/get-2FA', async (req, res) => {
  const { code, state } = req.query;

  try {
    // 1. Solicitar access_token a BBVA
    const tokenBody = qs.stringify({
      client_id: '174765141853',
      client_secret: '293ff733e4a241d399bd6b26818ba203',
      grant_type: 'authorization_code',
      code: code,
      code_verifier: "01AmgdmIuI54GNvwREgLOEXAcr0XiWe1azV3z04PVyo",
      redirect_uri: "https://miserverrenderpoc.onrender.com/redirect"
    });

    const tokenResponse = await axios.post(
      'https://apis.es.bbvaapimarket.com/auth/oauth/v2/token',
      tokenBody,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': '*/*'
        }
      }
    );

    const accessToken = tokenResponse.data.access_token;

    if (!accessToken) {
      throw new Error('No se recibió access_token del servidor de BBVA');
    }

    console.log('Access Token recibido:', accessToken);

    // 2. Llamar al endpoint me-full con el token
    const meFullCall = await axios.get('https://apis.es.bbvaapimarket.com/es/customers/v2/me-full', {
      headers: {
        'Accept': '*/*',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      }
    });

    const location = meFullCall.headers['location'];
    const sessId = meFullCall.headers['2fasessid'];

    if (!location || !sessId) {
      throw new Error('Faltan headers necesarios de la respuesta de /me-full');
    }

    // 3. Construir y devolver la URL 2FA
    const authUrl = `${location}?2FASESSID=${sessId}&digest=z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==&alg=SHA-512&state=${state}`;
    console.log('2FA URL generada:', authUrl);

    res.json({ authUrl });

  } catch (err) {
    console.error('Error en /get-2FA:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error obteniendo URL 2FA' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
