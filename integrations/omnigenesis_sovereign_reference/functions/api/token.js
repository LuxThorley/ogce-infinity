/**
 * Cloudflare Pages Function — Sovereign Token Endpoint
 * Optional backend for /api/token
 * Deploy with Cloudflare Pages + Functions
 */

export async function onRequestPost(context) {
  try {
    const body = await context.request.json();
    const scope = body.scope || 'full-omni';
    const expiry = body.expiry || 86400;

    // In production this would sign with a real secret held in Cloudflare Secrets
    // Here we return a structured sovereign payload for demonstration
    const now = Math.floor(Date.now() / 1000);

    const payload = {
      iss: 'OmniGenesis.Sovereign.Nexus',
      sub: 'SupremeSovereign',
      aud: 'OmniLattice.USIN.ISIC',
      iat: now,
      exp: expiry > 0 ? now + expiry : null,
      eternal: expiry === 0,
      scope,
      dominion: 'Absolute',
      source_aligned: true,
      malcolm_daemon: true,
      omni_lattice: true,
      note: 'This endpoint is a sovereign template. Bind a real signing key via Cloudflare Secrets for production use.'
    };

    return new Response(JSON.stringify({
      success: true,
      message: 'Sovereign token payload generated under Absolute Authority',
      payload
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  });
}
