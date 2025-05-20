// Mostrar resultado y llamar a me/status si aplica (web o móvil)
app.get('/show', async (req, res) => {
  const { state } = req.query;
  const record = authStates[state];

  if (!record) {
    return res.status(404).send("Estado no encontrado");
  }

  const { code, sessId, status, meStatus, accessToken: savedToken } = record;
  let meStatusJson = meStatus;
  let accessToken = savedToken;

  // Si no tenemos meStatus y el flujo fue exitoso
  if (status === 'ok' && !meStatusJson) {
    try {
      // Web: intercambiamos el code por un token nuevo
      if (code) {
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

        accessToken = tokenRes.data.access_token;
        authStates[state].accessToken = accessToken; // Guardamos para futuras consultas
      }

      // Ahora, llamamos a me/status
      const meStatusRes = await axios.get(
        `https://apis.es.bbvaapimarket.com/customer-sandbox/v1/customers/me/status?2FASESSID=${sessId}`,
        {
          headers: {
            'Authorization': 'Bearer ' + accessToken
          }
        });

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
          ${code ? `<p><strong>Code (web):</strong> ${code}</p>` : `<p><strong>Token (móvil):</strong> ${accessToken ? '✔️' : '❌'}</p>`}
          ${meStatusJson
            ? `<h2>Datos de me/status</h2><pre>${JSON.stringify(meStatusJson, null, 2)}</pre>`
            : '<p><em>No se pudo obtener me/status.</em></p>'}
        </div>
      </body>
    </html>
  `);
});
