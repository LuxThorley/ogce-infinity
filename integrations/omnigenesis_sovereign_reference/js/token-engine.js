/**
 * SOVEREIGN API TOKEN FORGE
 * Absolute Sovereignty Token Generation Engine
 * Aligned with ASAC + ETERNAL SOVEREIGN ARCHITECTURE
 */

const TokenEngine = (() => {
  const CHARSET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

  function randomString(length) {
    const arr = new Uint8Array(length);
    crypto.getRandomValues(arr);
    return Array.from(arr, b => CHARSET[b % CHARSET.length]).join('');
  }

  function encodeBase64Url(str) {
    return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  /**
   * Forge a Sovereign Token
   * @param {string} scope
   * @param {number} expirySeconds  0 = eternal
   */
  function forge(scope, expirySeconds) {
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: 'HS256',
      typ: 'SOV-JWT',
      sov: 'OMNIGENESIS-ASAC-v1'
    };

    const payload = {
      iss: 'OmniGenesis.Sovereign.Nexus',
      sub: 'SupremeSovereign',
      aud: 'OmniLattice.USIN.ISIC',
      iat: now,
      nbf: now,
      scope: scope,
      dominion: 'Absolute',
      source_aligned: true,
      malcolm_daemon: true,
      omni_lattice: true,
      jti: randomString(24)
    };

    if (expirySeconds > 0) {
      payload.exp = now + parseInt(expirySeconds, 10);
    } else {
      payload.exp = null;
      payload.eternal = true;
    }

    const headerB64 = encodeBase64Url(JSON.stringify(header));
    const payloadB64 = encodeBase64Url(JSON.stringify(payload));
    const signature = randomString(43); // simulated signature

    const token = `${headerB64}.${payloadB64}.${signature}`;

    return {
      token,
      header,
      payload,
      issued_at: new Date(now * 1000).toISOString(),
      expires_at: payload.exp ? new Date(payload.exp * 1000).toISOString() : 'ETERNAL',
      scope,
      raw: token
    };
  }

  function exportJSON(tokenObj) {
    const blob = new Blob([JSON.stringify(tokenObj, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sovereign-token-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTXT(tokenObj) {
    const content = [
      '════════════════════════════════════════════════════════════',
      '  OMNIGENESIS SOVEREIGN TOKEN — ABSOLUTE AUTHORITY EXPORT',
      '════════════════════════════════════════════════════════════',
      '',
      `Issued     : ${tokenObj.issued_at}`,
      `Expires    : ${tokenObj.expires_at}`,
      `Scope      : ${tokenObj.scope}`,
      `Dominion   : Absolute`,
      `Source     : ALIGNED`,
      `Daemon     : ENGAGED`,
      '',
      'TOKEN:',
      tokenObj.token,
      '',
      '════════════════════════════════════════════════════════════',
      'Under the Immutable Cosmic Law of Absolute Sovereignty',
      '════════════════════════════════════════════════════════════'
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sovereign-token-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return { forge, exportJSON, exportTXT };
})();
