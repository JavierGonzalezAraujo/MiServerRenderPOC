const express = require('express');
const app = express();

// Ruta que renderiza el HTML con el code y state
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
          <p><strong>Code:</strong> ${code || 'N/A'}</p>
          <p><strong>State:</strong> ${state || 'N/A'}</p>
        </div>
      </body>
    </html>
  `);
});

// Ruta que redirige según el tipo de dispositivo
app.get('/redirect', (req, res) => {
    const { code, state } = req.query;
    const userAgent = req.headers['user-agent'] || '';

    const isAndroid = /Android/.test(userAgent);
    const isIOS = /iPhone|iPad/.test(userAgent);

    if (isAndroid || isIOS) {
        const uri = `bbvapoc://callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        console.log('Redirigiendo a app:', uri);
        return res.redirect(uri);
    } else {
        const uri = `/show?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`;
        console.log('Redirigiendo al HTML de POC:', uri);
        return res.redirect(uri);
    }
});

// Escuchar en el puerto asignado por Render o el 3000 localmente
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor de redirección corriendo en el puerto ${PORT}`);
}); 
