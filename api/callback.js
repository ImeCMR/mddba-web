// GitHub login for the website editor (Decap CMS at /admin), step 2 of 2:
// GitHub sends the browser back here with a code; swap it for an access token
// and hand the token to the editor window that opened this popup. The token is
// only ever posted to this site's own address.
// Needs the Vercel environment variables GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET.

function page(res, status, kind, payload) {
  // JSON inside <script>: escape "<" so the text can't close the tag
  const message = JSON.stringify(`authorization:github:${kind}:${JSON.stringify(payload)}`).replace(/</g, '\\u003c');
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Set-Cookie', 'editor_oauth_state=; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=0');
  res.end(`<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><title>Signing in…</title></head>
<body><p>${kind === 'success' ? 'Signed in. You can close this window.' : 'Sign-in failed. Close this window and try again.'}</p>
<script>
(function () {
  var origin = window.location.origin;
  var message = ${message};
  if (!window.opener) return;
  window.addEventListener('message', function reply(e) {
    if (e.origin !== origin) return;
    window.removeEventListener('message', reply);
    window.opener.postMessage(message, origin);
  });
  window.opener.postMessage('authorizing:github', origin);
})();
</script>
</body></html>`);
}

module.exports = async (req, res) => {
  const { GITHUB_CLIENT_ID: clientId, GITHUB_CLIENT_SECRET: clientSecret } = process.env;
  const url = new URL(req.url, 'http://localhost');
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookie = (req.headers.cookie || '').split(';').map((c) => c.trim()).find((c) => c.startsWith('editor_oauth_state='));
  const expected = cookie ? cookie.slice('editor_oauth_state='.length) : '';

  if (!clientId || !clientSecret) return page(res, 500, 'error', { message: 'The editor login is not set up yet (GitHub app settings missing).' });
  if (!code || !state || state !== expected) return page(res, 400, 'error', { message: 'The sign-in link expired or was not started here. Please try again.' });

  try {
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const r = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: `${proto}://${host}/api/callback` })
    });
    const data = await r.json();
    if (!r.ok || data.error || !data.access_token) {
      return page(res, 401, 'error', { message: data.error_description || 'GitHub did not accept the sign-in.' });
    }
    return page(res, 200, 'success', { token: data.access_token, provider: 'github' });
  } catch (err) {
    return page(res, 502, 'error', { message: 'Could not reach GitHub. Please try again.' });
  }
};
