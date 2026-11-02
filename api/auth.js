// GitHub login for the website editor (Decap CMS at /admin), step 1 of 2:
// send the browser to GitHub, with a one-time "state" value kept in a cookie.
// Needs the Vercel environment variable GITHUB_CLIENT_ID (see docs/deployment.md).
const crypto = require('crypto');

module.exports = (req, res) => {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('The editor login is not set up yet: GITHUB_CLIENT_ID is missing in the Vercel project settings.');
    return;
  }
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const state = crypto.randomBytes(16).toString('hex');

  const url = new URL('https://github.com/login/oauth/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', `${proto}://${host}/api/callback`);
  url.searchParams.set('scope', 'repo');
  url.searchParams.set('state', state);

  res.statusCode = 302;
  res.setHeader('Set-Cookie', `editor_oauth_state=${state}; Path=/api; HttpOnly; Secure; SameSite=Lax; Max-Age=600`);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Location', url.toString());
  res.end();
};
