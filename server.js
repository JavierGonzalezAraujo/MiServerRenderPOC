// server.js
const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const qs = require('qs');
const app = express();

const authStates = {}; // { [state]: { codeVerifier, code, sessId, status } }

app.use(express.static('public'));

function generateCodeVerifierAndChallenge() {
  const codeVerifier = crypto.randomBytes(32).toString('hex');
  const hash = crypto.createHash('sha256').update(codeVerifier).digest();
  const codeChallenge = hash.toString('base64url');
  return { codeVerifier, codeChallenge };
}

// Página inicial
app.get('/start', (req, res) => {
  res.send(`
    <html>
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

// Obtener auth URL
app.get('/get-auth-url', (req, res) => {
  const { state } = req.query;
  const { codeVerifier, codeChallenge } = generateCodeVerifierAndChallenge();
  authStates[state] = { codeVerifier };

  const authUrl = new URL('https://apis.es.bbvaapimarket.com/auth/oauth/v2/authorize');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', '174765141853');
  authUrl.searchParams.set('redirect_uri', 'https://miserverrenderpoc.onrender.com/redirect');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('scope', 'openid');
  authUrl.searchParams.set('state', state);

  res.json({ authUrl: authUrl.toString() });
});

// Redirección BBVA
app.get('/redirect', async (req, res) => {
  const { code, state, status, '2FASESSID': sessId } = req.query;

if (!state) {
  return res.status(400).send('Falta parámetro state');
}

if (!authStates[state]) {
  // Permitir flujo de app sin haber pasado por /get-auth-url
  if (state.startsWith('mobile_')) {
    authStates[state] = {};
  } else {
    return res.status(400).send('Estado inválido');
  }
}


  const stateData = authStates[state];
  Object.assign(stateData, { code, status, sessId, timestamp: Date.now() });

  let json2FA = null;

  if (sessId) {
    try {
      const result = await axios.get(`https://apis.es.bbvaapimarket.com/auth/2fa/v1/status?2FASESSID=${sessId}`, {
        headers: {
          'Authorization': `Bearer ${stateData.accessToken}`,
          'Accept': '*/*'
        },
        validateStatus: () => true
      });

      json2FA = result.data;
      stateData.json2FA = json2FA;
      console.log('✅ Respuesta de 2FA status:', json2FA);
    } catch (e) {
      console.error('❌ Error en /auth/2fa/v1/status:', e.response?.data || e.message);
    }
  }

  const isMobileUA = /iphone|ipad|android/i.test(req.headers['user-agent'] || '');
  const isFromApp = state.startsWith('mobile_');

  const params = new URLSearchParams();
  if (code) params.append('code', code);
  if (state) params.append('state', state);
  if (sessId) params.append('2FASESSID', sessId);
  if (status) params.append('status', status);

  const callbackUrl = `bbvapoc://callback?${params.toString()}`;

  if (isMobileUA || isFromApp) {
    res.send(`<script>window.location = "${callbackUrl}";</script>`);
  } else {
    res.send(`<script>window.close();</script><p>Proceso completado.</p>`);
  }
});


// Poll
app.get('/poll', (req, res) => {
  const data = authStates[req.query.state];

  const isAwaiting2FA = !!data?.awaiting2FA;

  const ready = isAwaiting2FA
    ? !!data?.code && !!data?.json2FA // Segunda fase: espera json2FA
    : !!data?.code;                   // Primera fase: basta con code

  res.json({ ready, code: data?.code });
});



// Mostrar resultado y botón 2FA
app.get('/show', (req, res) => {
  const { code, state } = req.query;
  res.send(`
    <html>
      <body>
        <h1>Autenticado</h1>
        <p><b>Code:</b> ${code}</p>
        <button onclick="start2FA()">Me Full</button>
        <div id="response"></div>

        <script>
          async function start2FA() {
            const res = await fetch('/get-2FA?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}');
            const data = await res.json();
            if (data.authUrl) {
              window.open(data.authUrl, '_blank');

              const interval = setInterval(async () => {
                const r = await fetch('/show-data?state=${encodeURIComponent(state)}');
                const d = await r.json();
                if (d.json2FA) {
                  clearInterval(interval);
                  document.getElementById("response").innerHTML =
                    "<h3>Respuesta 2FA:</h3><pre style='background:#eee;padding:1rem;border-radius:8px;'>" +
                    JSON.stringify(d.json2FA, null, 2) + "</pre>";
                }
              }, 1000);
            } else {
              alert('Error en 2FA');
            }
          }
        </script>
      </body>
    </html>
  `);
});

app.get('/show-data', (req, res) => {
  const { state } = req.query;
  const data = authStates[state];
  res.json({ json2FA: data?.json2FA || null });
});

// get-2FA
app.get('/get-2FA', async (req, res) => {
  const { code, state } = req.query;
  const stateData = authStates[state];

  authStates[state].awaiting2FA = true;

  if (!stateData || !stateData.codeVerifier) {
    return res.status(400).json({ error: 'Estado inválido o faltan datos' });
  }

  try {
    const tokenBody = qs.stringify({
      client_id: '174765141853',
      client_secret: '293ff733e4a241d399bd6b26818ba203',
      grant_type: 'authorization_code',
      code,
      code_verifier: stateData.codeVerifier,
      redirect_uri: 'https://miserverrenderpoc.onrender.com/redirect'
    });

    const tokenResponse = await axios.post('https://apis.es.bbvaapimarket.com/auth/oauth/v2/token', tokenBody, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const accessToken = tokenResponse.data.access_token;
    stateData.accessToken = accessToken;
    if (!accessToken) throw new Error('No se recibió access_token');

    // Llamar me-full
    const meFullResponse = await axios.get('https://apis.es.bbvaapimarket.com/es/customers/v2/me-full', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': '*/*',
        'Content-Type': 'application/json'
      },
      validateStatus: () => true
    });

    if (meFullResponse.status === 401 && meFullResponse.headers['location'] && meFullResponse.headers['2fasessid']) {
      const location = meFullResponse.headers['location'];
      const sessId = meFullResponse.headers['2fasessid'];
      const authUrl = `${location}?2FASESSID=${sessId}&digest=z4PhNX7vuL3xVChQ1m2AB9Yg5AULVxXcg/SpIdNs6c5H0NE8XYXysP+DGNKHfuwvY7kxvUdBeoGlODJ6+SfaPg==&alg=SHA-512&state=${state}`;
      return res.json({ authUrl });
    }

    throw new Error('me-full no requirió 2FA o faltan headers');

  } catch (err) {
    console.error('Error en /get-2FA:', err.response?.data || err.message);
    res.status(500).json({ error: 'Error obteniendo URL 2FA' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en puerto ${PORT}`));
