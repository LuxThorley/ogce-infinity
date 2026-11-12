#!/usr/bin/env python3
"""μLux local smoke test.
Stage 1 (stdlib only): serve public/ on 127.0.0.1 with http.server and GET index.html plus every asset in the
service-worker cache list (expects HTTP 200, non-empty).
Stage 2 (optional, if the `playwright` Python package and a Chrome/Chromium are present): load every route in a
headless browser, record console errors and page errors, confirm the app booted and the Omni-Policy loaded, run
the 73-check Proof Ledger in its Web Worker, confirm the service worker serves the app OFFLINE, and save screenshots.
Nothing leaves the machine: the server binds to 127.0.0.1 and the app makes no network calls.
Usage: python3 tools/smoke.py [screenshot-dir]"""
import functools, http.server, json, os, re, shutil, sys, threading, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUB = os.path.join(ROOT, 'public')
SHOTS = sys.argv[1] if len(sys.argv) > 1 else None
ROUTES = ['', 'bloom', 'studio', 'strata', 'grade', 'mirror', 'observatory', 'chronos', 'symmetry', 'world', 'pulse', 'malcolm', 'omnigenesis', 'policy']

class Quiet(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript', '.mjs': 'text/javascript', '.webmanifest': 'application/manifest+json'}
    def log_message(self, *a): pass

def wait_js(page, expr, timeout=20000):
    # Poll with page.evaluate (CDP) instead of wait_for_function, which the app's strict CSP (no unsafe-eval) blocks.
    import time
    end = time.time() + timeout / 1000
    while time.time() < end:
        try:
            if page.evaluate(expr): return True
        except Exception:
            pass
        page.wait_for_timeout(100)
    raise TimeoutError(f'timed out waiting for: {expr}')

def stage_browser(base, results):
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        results['browser'] = 'skipped (playwright not installed)'; return True
    exe = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    ok = True
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=exe, args=['--no-sandbox', '--disable-gpu'], headless=True) if exe else p.chromium.launch(headless=True)
        ctx = b.new_context(viewport={'width': 1440, 'height': 1000}, locale='en-GB', timezone_id='Europe/London')
        page = ctx.new_page(); errors = []; external = []
        page.on('console', lambda m: errors.append(f'console.{m.type}: {m.text}') if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append(f'pageerror: {e}'))
        page.on('request', lambda r: external.append(r.url) if not r.url.startswith(base) and not r.url.startswith(('data:', 'blob:')) else None)
        bad_responses = []; api_offline = []
        page.on('response', lambda resp: (api_offline if '/api/' in resp.url else bad_responses).append(f'{resp.status} {resp.url}') if resp.status >= 400 else None)
        routes = {}
        for r in ROUTES:
            page.goto(f'{base}index.html#/{r}')
            wait_js(page, f"document.body.dataset.ready === '{r or 'home'}'", 20000)
            routes[r or 'home'] = {**routes.get(r or 'home', {}), 'h1': page.inner_text('main h1')[:70], 'policy_banner': 'Omni-Policy failed' in page.inner_text('#banner'),
                                   'render_error': page.locator('text=failed to render').count() > 0}
            if r == 'world':
                wait_js(page, "document.body.dataset.world === 'ready'", 20000)
                page.click('text=×144'); page.wait_for_timeout(2500)
                routes['world'] = {**routes.get('world', {}), 'ticks_after_x144': page.evaluate("(document.querySelector('main .kicker')||{}).textContent || ''")}
            if r == 'pulse':
                wait_js(page, "document.body.dataset.pulse === 'ready'", 30000)
                wait_js(page, "/Proof Ledger: \\d+ passed/.test(document.querySelector('main').innerText)", 60000)
                page.wait_for_timeout(5200)
                txt = page.inner_text('main')
                results['pulse'] = {'ceremonial_labels': txt.count('Ceremonial — generated, not received'), 'how_disclosures': txt.count('How this works'),
                                    'infinity_lines': txt.count('Infinity transmission #'), 'singularity_lines': txt.count('ULTIMATE OMEGA ::') + txt.count(':: OMEGA ::'),
                                    'ledger': re.search(r'Proof Ledger: [^\n]*', txt).group(0)[:80], 'integrity_ok': '✔ verified' in txt,
                                    'services': re.search(r'Service health[^\n]*', txt).group(0)[:120], 'doctrine_ssr': 'SSR INTERPRETATION' in txt}
            if r == 'malcolm':
                wait_js(page, "!!document.body.dataset.malcolm", 20000)
                page.click('text=Narrate the world'); page.wait_for_timeout(500)
                results['malcolm_status'] = page.evaluate('document.body.dataset.malcolm')
                results['malcolm_offline_narration'] = page.inner_text('main .card')[:160]
            if SHOTS and r in ('', 'bloom', 'mirror', 'grade', 'world', 'pulse', 'malcolm', 'omnigenesis'):
                if r == 'bloom':
                    for _ in range(9): page.click('text=Step ▶')
                page.screenshot(path=os.path.join(SHOTS, f'mulux-{r or "home"}.png'), full_page=False)
        results['routes'] = routes
        # Proof Ledger in the browser (Web Worker)
        page.goto(f'{base}index.html#/'); wait_js(page, "document.body.dataset.ready === 'home'")
        page.click('text=Run the Proof Ledger')
        wait_js(page, "/passed, .* failed, 73 total/.test(document.querySelector('main').innerText)", 120000)
        results['browser_proof_ledger'] = re.search(r'\d+ passed, \d+ failed, 73 total[^·]*· \d+ ms', page.inner_text('main')).group(0)
        if SHOTS: page.screenshot(path=os.path.join(SHOTS, 'mulux-home-ledger.png'))
        # Offline: service worker must serve the shell with the network cut
        page.evaluate("navigator.serviceWorker.ready.then(() => true)")
        page.reload(); wait_js(page, "navigator.serviceWorker.controller !== null", 20000)
        ctx.set_offline(True)
        page.goto(f'{base}index.html#/chronos'); page.reload()  # full reload with the network cut
        wait_js(page, "document.body.dataset.ready === 'chronos'", 20000)
        results['offline_render'] = page.inner_text('main h1')
        ctx.set_offline(False)
        # A 404 from /api/ is the expected "no mulux-api Worker on this static server" → offline mode; anything else is an error.
        if api_offline and not bad_responses:
            errors = [e for e in errors if 'Failed to load resource' not in e]
        results['console_or_page_errors'] = errors; results['external_requests'] = external
        results['api_offline_probes'] = len(api_offline); results['bad_responses'] = bad_responses
        b.close()
    ok = all(v['h1'] and not v['policy_banner'] and not v['render_error'] for v in results['routes'].values()) and not errors and not external and not results['bad_responses'] \
        and results['browser_proof_ledger'].startswith('73 passed, 0 failed') and results['offline_render'] == 'Chronos Clock'
    results['browser'] = 'ran'
    return ok

def main():
    if SHOTS: os.makedirs(SHOTS, exist_ok=True)
    handler = functools.partial(Quiet, directory=PUB)
    with http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler) as httpd:
        base = f'http://127.0.0.1:{httpd.server_address[1]}/'
        threading.Thread(target=httpd.serve_forever, daemon=True).start()
        assets = re.findall(r"'(\./[^']*)'", open(os.path.join(PUB, 'sw.js'), encoding='utf-8').read())
        results = {'server': 'python http.server (ThreadingHTTPServer) on 127.0.0.1', 'assets_checked': 0, 'assets_ok': 0, 'failures': []}
        for a in assets:
            results['assets_checked'] += 1
            try:
                with urllib.request.urlopen(base + a[2:], timeout=10) as r:
                    if r.status == 200 and r.read(): results['assets_ok'] += 1
                    else: results['failures'].append(a)
            except Exception as e:
                results['failures'].append(f'{a}: {e}')
        ok = not results['failures'] and results['assets_ok'] == len(assets)
        try:
            ok = stage_browser(base, results) and ok
        except Exception as e:
            results['browser_exception'] = str(e)[:500]; ok = False
        httpd.shutdown()
    results['ok'] = ok
    print(json.dumps(results, indent=1, ensure_ascii=False))
    sys.exit(0 if ok else 1)

if __name__ == '__main__':
    main()
