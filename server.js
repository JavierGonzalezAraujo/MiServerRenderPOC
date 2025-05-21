const express = require('express');
const axios = require('axios');
const app = express();

const authStates = {}; // { [state]: { code, timestamp, sessId, status } }

app.use(express.static('public'));

let jsonTokenGlobal;

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
    // Paso 1: Solicitar el code
    const authResponse = await axios.get('https://apis.es.bbvaapimarket.com/auth/oauth/v2/authorize', {
      params: {
        response_type: 'code',
        client_id: '174765141853',
        redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
        code_challenge: 'ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg',
        code_challenge_method: 'S256',
        scope: 'openid',
        state,
      },
      maxRedirects: 0,
      validateStatus: status => status === 302,
    });

    const location = authResponse.headers.location;
    console.log("Redirect Location:", location);

    // Extraer el "code" de la URL de redirección
    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get('code');

    if (!code) {
      return res.status(400).json({ error: 'No se encontró el parámetro code en la redirección' });
    }

    // Paso 2: Intercambiar el code por un token
    const body = new URLSearchParams({
      client_id: '174765141853',
      client_secret: '293ff733e4a241d399bd6b26818ba203',
      grant_type: 'authorization_code',
      code,
      code_verifier: 'ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg',
      redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
    }).toString();

    const tokenResponse = await fetch('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'apis.es.bbvaapimarket.com',
        'Accept': '*/*'
      },
      body
    });

app.get('/get-auth-url', async (req, res) => {
  const { state } = req.query;

  try {
    // Paso 1: Solicitar el code
    const authResponse = await axios.get('https://apis.es.bbvaapimarket.com/auth/oauth/v2/authorize', {
      params: {
        response_type: 'code',
        client_id: '174765141853',
        redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
        code_challenge: 'ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg',
        code_challenge_method: 'S256',
        scope: 'openid',
        state,
      },
      maxRedirects: 0,
      validateStatus: status => status === 302,
    });

    const location = authResponse.headers.location;
    console.log("Redirect Location:", location);

    // Extraer el "code" de la URL de redirección
    const redirectUrl = new URL(location);
    const code = redirectUrl.searchParams.get('code');

    if (!code) {
      return res.status(400).json({ error: 'No se encontró el parámetro code en la redirección' });
    }

    // Paso 2: Intercambiar el code por un token
    const body = new URLSearchParams({
      client_id: '174765141853',
      client_secret: '293ff733e4a241d399bd6b26818ba203',
      grant_type: 'authorization_code',
      code,
      code_verifier: 'ns4X6fzxbwAGpW3VoccetElEmldbLHChSMjfDACiHhg',
      redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect',
    }).toString();

    const tokenResponse = await fetch('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Host': 'apis.es.bbvaapimarket.com',
        'Accept': '*/*'
      },
      body
    });

    const jsonToken = await tokenResponse.json();
    jsonTokenGlobal = jsonToken;
    console.log('Access Token:', jsonToken);

    res.json({
      access_token: jsonToken.access_token,
      full_token_response: jsonToken,
    });

  } catch (err) {
    console.error('Error en flujo OAuth:', err.message);
    res.status(500).json({ error: 'Error durante el flujo de autorización' });
  }
});
    console.log('Access Token:', jsonToken);

    res.json({
      access_token: jsonToken.access_token,
      full_token_response: jsonToken,
    });

  } catch (err) {
    console.error('Error en flujo OAuth:', err.message);
    res.status(500).json({ error: 'Error durante el flujo de autorización' });
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
            const res = await fetch('/get-2FA?state=' + state);
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
  const { state } = req.query;

  try {
    const meFullCall = await fetch('https://apis.es.bbvaapimarket.com/es/customers/v2/me-full', {
  method: 'GET',
  headers: {
    'Host': 'apis.es.bbvaapimarket.com',
    'Accept': '*/*',
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + accessToken
  }
});

if (!meFullCall.ok) {
  throw new Error(`Error llamando a me-full: ${meFullCall.status}`);
}

// Para Node.js, necesitas acceder a los headers de forma diferente
const location = meFullCall.headers.get('location');
const sessId = meFullCall.headers.get('2fasessid');

// Verifica que se recibieron
console.log('Location:', location);
console.log('2FASESSID:', sessId);

// Construir URL para 2FA
const authUrl = `${location}?2FASESSID=${sessId}&digest=z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==&alg=SHA-512&state=${state}`;
console.log('2FA URL generada:', authUrl);

  } catch (err) {
    console.error('Error obteniendo auth URL:', err.message);
    res.status(500).json({ error: 'Error obteniendo URL de autorización' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
