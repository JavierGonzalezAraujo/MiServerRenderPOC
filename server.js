const express = require('express');
const path = require('path');
const app = express();

// Servir archivos estáticos si los usas
app.use(express.static('public'));

// Página inicial del onboarding
app.get('/start', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Inicio del Onboarding</title>
        <style>
          body { font-family: Arial; padding: 2rem; }
          button { padding: 1rem; font-size: 1rem; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>Iniciar Onboarding</h1>
        <button onclick="startOnboarding()">Iniciar</button>

        <script>
          function generateState() {
            return 'state_' + Math.random().toString(36).substr(2, 9);
          }

          function startOnboarding() {
            const state = generateState();

            // Abrimos la ventana que quedará escuchando el resultado
            window.open('/show?state=' + state, '_blank');

            // Redirigimos al usuario a la URL de autorización
            const authUrl = new URL('https://apis.es.bbvaapimarket.com/auth/oauth/v2/authorize');
            authUrl.searchParams.set('response_type', 'code');
            authUrl.searchParams.set('client_id', '170773573158');
            authUrl.searchParams.set('redirect_uri', 'https://miserverrenderpoc.onrender.com/redirect');
            authUrl.searchParams.set('scope', 'openid');
            authUrl.searchParams.set('code_challenge_method', 'S256');
            authUrl.searchParams.set('state', state);

            window.location.href = authUrl.toString();
          }
        </script>
      </body>
    </html>
  `);
});

// Página que muestra el resultado
app.get('/show', (req, res) => {
  const { code, state } = req.query;

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Callback Info</title>
        <style>
          body { font-family: Arial; padding: 2rem; background-color: #f5f5f5; }
          h1 { color: #0070f3; }
          .box { background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Code y State recibidos</h1>
          <p><strong>Code:</strong> ${code || 'Esperando...'}</p>
          <p><strong>State:</strong> ${state || 'Desconocido'}</p>
        </div>
      </body>
    </html>
  `);
});

// Redirección tras login
app.get('/redirect', (req, res) => {
  const { code, state } = req.query;
  const userAgent = req.headers['user-agent'] || '';

  const isAndroid = /Android/.test(userAgent);
  const isIOS = /iPhone|iPad/.test(userAgent);

  if (isAndroid || isIOS) {
    const uri = `bbvapoc://callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    return res.redirect(uri);
  } else {
    const uri = `/show?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
    return res.redirect(uri);
  }
});

// Puerto de escucha
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo');
});
