const express = require('express');
const app = express();
const path = require('path');

// En memoria, solo para pruebas (se reinicia con cada arranque del server)
const sessions = {};

// Para servir archivos estáticos si quieres
app.use(express.static('public'));

// Ruta que recibe la redirección de authorize.com
app.get('/redirect', (req, res) => {
  const { code, state } = req.query;

  if (!state) {
    return res.status(400).send('Missing state');
  }

  // Guardamos los datos temporalmente
  sessions[state] = { code, receivedAt: Date.now() };

  // Redirigimos a la página del cliente que está escuchando
  return res.redirect(`/show?state=${encodeURIComponent(state)}`);
});

// Ruta que muestra una página que hace polling para obtener su code
app.get('/show', (req, res) => {
  const { state } = req.query;

  if (!state) {
    return res.status(400).send('Missing state');
  }

  res.send(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>Esperando autorización...</title>
        <style>
          body { font-family: Arial; padding: 2rem; background-color: #f5f5f5; }
          .box { background: white; padding: 1rem; border-radius: 8px; box-shadow: 0 0 10px rgba(0,0,0,0.1); }
        </style>
      </head>
      <body>
        <div class="box">
          <h1>Esperando autenticación...</h1>
          <div id="result">Esperando respuesta del servidor...</div>
        </div>

        <script>
          const state = "${state}";
          async function checkStatus() {
            try {
              const res = await fetch("/status?state=" + state);
              const data = await res.json();

              if (data.code) {
                document.getElementById("result").innerHTML = 
                  "<p><strong>Code:</strong> " + data.code + "</p>";
              } else {
                setTimeout(checkStatus, 2000); // Reintenta en 2 segundos
              }
            } catch (err) {
              console.error(err);
              document.getElementById("result").textContent = "Error consultando el estado.";
            }
          }

          checkStatus();
        </script>
      </body>
    </html>
  `);
});

// Endpoint que devuelve el estado actual del state
app.get('/status', (req, res) => {
  const { state } = req.query;
  if (state && sessions[state]) {
    return res.json(sessions[state]);
  }
  res.json({ code: null });
});

// Inicializa el servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Servidor corriendo en http://localhost:' + PORT);
});
