// Run with the Cloudflare connector's execute tool AFTER the zone luxthorley.one exists in the account (Free plan).
// Creates every record from the GoDaddy snapshot as DNS-only (proxied:false), skipping ones already present, then returns the zone's records for the parity check.
async () => {
  const z = (await cloudflare.request({ method: 'GET', path: '/zones', query: { name: 'luxthorley.one' } })).result[0];
  if (!z) throw new Error('zone luxthorley.one not in account yet');
  const want = [
    ['A', 'luxthorley.one', '13.248.243.5'], ['A', 'luxthorley.one', '76.223.105.230'], ['A', 'luxthorley.one', '185.199.108.153'],
    ['A', 'luxthorley.one', '185.199.109.153'], ['A', 'luxthorley.one', '185.199.110.153'], ['A', 'luxthorley.one', '185.199.111.153'],
    ['CNAME', 'www.luxthorley.one', 'luxthorley.one'],
    ['MX', 'luxthorley.one', 'aspmx.l.google.com', 1], ['MX', 'luxthorley.one', 'alt1.aspmx.l.google.com', 5], ['MX', 'luxthorley.one', 'alt2.aspmx.l.google.com', 5],
    ['MX', 'luxthorley.one', 'alt3.aspmx.l.google.com', 10], ['MX', 'luxthorley.one', 'alt4.aspmx.l.google.com', 10],
    ['TXT', 'luxthorley.one', '"v=spf1 include:dc-aa8e722993._spfm.luxthorley.one ~all"'],
    ['TXT', 'luxthorley.one', '"google-site-verification=ch1RHKV1Ekj5_2CNbBwr8tnlulNXxWfLBlYF2DvEZpQ"'],
    ['TXT', 'dc-aa8e722993._spfm.luxthorley.one', '"v=spf1 include:_spf.google.com ~all"'],
    ['TXT', '_dmarc.luxthorley.one', '"v=DMARC1; p=quarantine; adkim=r; aspf=r; rua=mailto:dmarc_rua@onsecureserver.net;"'],
    ['CNAME', '_domainconnect.luxthorley.one', '_domainconnect.gd.domaincontrol.com'],
    ['TXT', '_github-pages-challenge-luxthorley.luxthorley.one', '"0cfb570140f12134608818b4079d19"'],
  ];
  const list = async () => (await cloudflare.request({ method: 'GET', path: `/zones/${z.id}/dns_records`, query: { per_page: 500 } })).result;
  const norm = (s) => String(s).replace(/\.$/, '').replace(/^"|"$/g, '').toLowerCase();
  let have = await list(); const made = [];
  for (const [type, name, content, priority] of want) {
    if (have.some((r) => r.type === type && r.name === name && norm(r.content) === norm(content))) continue;
    const body = { type, name, content, ttl: 3600, proxied: false, comment: 'copied from GoDaddy 13 Nov 2026' };
    if (type === 'MX') body.priority = priority; if (type === 'MX' || type === 'TXT') delete body.proxied;
    await cloudflare.request({ method: 'POST', path: `/zones/${z.id}/dns_records`, body }); made.push(`${type} ${name} ${content}`);
  }
  have = await list();
  return { zone: z.id, status: z.status, name_servers: z.name_servers, plan: z.plan?.name, created: made.length, records: have.map((r) => [r.type, r.name, r.type === 'MX' ? `${r.priority} ${r.content}` : r.content, r.ttl, r.proxied]) };
}
