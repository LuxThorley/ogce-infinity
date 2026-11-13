// v9.0 photo mode: hides the interface, frees the camera (move it away from your explorer), adds filters, frames and a
// caption, then saves a PNG or shares it with the system share sheet. Nothing is uploaded by the game.
export const FILTERS = {
  none: { name: 'Natural', css: '' }, warm: { name: 'Golden hour', css: 'sepia(0.25) saturate(1.25) brightness(1.05)' },
  cool: { name: 'Frostveil', css: 'hue-rotate(-12deg) saturate(0.9) brightness(1.05) contrast(1.05)' },
  noir: { name: 'Noir', css: 'grayscale(1) contrast(1.35)' }, dream: { name: 'Dream', css: 'saturate(1.4) brightness(1.1) blur(0.6px)' },
  sepia: { name: 'Old chronicle', css: 'sepia(0.85) contrast(1.05)' }, vivid: { name: 'Vivid', css: 'saturate(1.7) contrast(1.12)' },
  astral: { name: 'Astral (mystical)', css: 'hue-rotate(40deg) saturate(1.3) brightness(1.05)' },
};
export const FRAMES = { none: 'No frame', vignette: 'Vignette', polaroid: 'Instant photo', cinema: 'Cinema bars' };
export function clampOffset(o, max = 14) { const c = (v) => Math.max(-max, Math.min(max, +v || 0)); return { dx: c(o.dx), dy: Math.max(-1, Math.min(10, +o.dy || 0)), dz: c(o.dz) }; }
export function initPhoto({ $, renderer, toast, onOpen, onClose }) {
  let dof = 'soft'; const DOF = { soft: 0.8, strong: 2.2 };
  let on = false, filter = 'none', frame = 'vignette', caption = '', prevFilter = '';
  const bar = $('photobar');
  function open() {
    if (!renderer) { toast('Photo mode needs the 3D view.'); return; }
    on = true; renderer.photo = { dx: 0, dy: 0, dz: 0 }; renderer.dof = dof === 'off' ? null : { auto: true, focus: 8, aperture: DOF[dof] }; prevFilter = renderer.canvas.style.filter;
    document.body.classList.add('photo'); bar.classList.remove('hidden'); onOpen?.(); render(); toast('📷 Photo mode: drag to orbit, WASD/arrows move the camera, R/F up/down, Esc to leave.');
  }
  function close() { if (!on) return; on = false; renderer.photo = null; renderer.dof = null; renderer.canvas.style.filter = prevFilter; document.body.classList.remove('photo'); bar.classList.add('hidden'); onClose?.(); }
  function move(dx, dy, dz) {
    const y = renderer.rig.yaw, f = [-Math.sin(y), -Math.cos(y)], r = [Math.cos(y), -Math.sin(y)];
    const p = renderer.photo; renderer.photo = clampOffset({ dx: p.dx + f[0] * dz + r[0] * dx, dy: p.dy + dy, dz: p.dz + f[1] * dz + r[1] * dx });
  }
  function onKey(k) {
    if (!on) return false;
    const st = 0.6, m = { w: [0, 0, st], arrowup: [0, 0, st], s: [0, 0, -st], arrowdown: [0, 0, -st], a: [-st, 0, 0], arrowleft: [-st, 0, 0], d: [st, 0, 0], arrowright: [st, 0, 0], r: [0, st, 0], f: [0, -st, 0] }[k];
    if (m) { move(...m); return true; }
    if (k === 'escape' || k === '0') { close(); return true; }
    if (k === ' ' || k === 'enter') { snap(); return true; }
    return true; // swallow other gameplay keys while composing
  }
  function render() {
    renderer.canvas.style.filter = FILTERS[filter].css;
    bar.innerHTML = `<b>📷 Photo mode</b>
      <label>Filter <select id="ph-filter">${Object.entries(FILTERS).map(([k, f]) => `<option value="${k}" ${k === filter ? 'selected' : ''}>${f.name}</option>`).join('')}</select></label>
      <label>Frame <select id="ph-frame">${Object.entries(FRAMES).map(([k, n]) => `<option value="${k}" ${k === frame ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Depth of field <select id="ph-dof">${[['off', 'Off'], ['soft', 'Soft'], ['strong', 'Strong']].map(([k, n]) => `<option value="${k}" ${k === dof ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <input id="ph-caption" maxlength="60" placeholder="Caption (optional)" value="${caption.replace(/"/g, '&quot;')}">
      <span class="phpad"><button data-mv="0,0,0.8" aria-label="Camera forward">▲</button><button data-mv="-0.8,0,0" aria-label="Camera left">◀</button><button data-mv="0,0,-0.8" aria-label="Camera back">▼</button><button data-mv="0.8,0,0" aria-label="Camera right">▶</button><button data-mv="0,0.6,0" aria-label="Camera up">⤒</button><button data-mv="0,-0.6,0" aria-label="Camera down">⤓</button></span>
      <button id="ph-reset">Reset camera</button><button id="ph-snap" class="primary">📸 Take photo</button><button id="ph-close">Done</button>`;
    $('ph-filter').onchange = (e) => { filter = e.target.value; renderer.canvas.style.filter = FILTERS[filter].css; };
    $('ph-dof').onchange = (e) => { dof = e.target.value; renderer.dof = dof === 'off' ? null : { auto: true, focus: 8, aperture: DOF[dof] }; };
    $('ph-frame').onchange = (e) => { frame = e.target.value; };
    $('ph-caption').oninput = (e) => { caption = e.target.value.replace(/[<>]/g, '').slice(0, 60); };
    bar.querySelectorAll('[data-mv]').forEach((b) => (b.onclick = () => move(...b.dataset.mv.split(',').map(Number))));
    $('ph-reset').onclick = () => { renderer.photo = { dx: 0, dy: 0, dz: 0 }; };
    $('ph-snap').onclick = snap; $('ph-close').onclick = close;
  }
  function compose(src) {
    const W = src.width, H = src.height, pad = frame === 'polaroid' ? Math.round(W * 0.04) : 0, foot = frame === 'polaroid' ? Math.round(H * 0.14) : 0;
    const c = document.createElement('canvas'); c.width = W + pad * 2; c.height = H + pad * 2 + foot; const g = c.getContext('2d');
    g.fillStyle = '#f7f3e8'; g.fillRect(0, 0, c.width, c.height);
    g.filter = FILTERS[filter].css || 'none'; g.drawImage(src, pad, pad); g.filter = 'none';
    if (frame === 'vignette') { const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.55)'); g.fillStyle = r; g.fillRect(0, 0, W, H); }
    if (frame === 'cinema') { g.fillStyle = '#000'; const b = Math.round(H * 0.11); g.fillRect(0, 0, W, b); g.fillRect(0, H - b, W, b); }
    const fs = Math.max(14, Math.round(W / 60));
    g.font = `600 ${fs}px system-ui, sans-serif`; g.textBaseline = 'bottom';
    if (frame === 'polaroid') { g.fillStyle = '#333'; g.fillText(caption || 'Strata: Lux Genesis', pad, c.height - foot / 2.5); g.fillStyle = '#8a6a10'; g.textAlign = 'right'; g.fillText('✦ Strata', c.width - pad, c.height - foot / 2.5); }
    else { g.fillStyle = 'rgba(255,255,255,0.9)'; g.shadowColor = 'rgba(0,0,0,0.6)'; g.shadowBlur = 6; if (caption) g.fillText(caption, fs, H - fs * (frame === 'cinema' ? 2.5 : 1)); g.textAlign = 'right'; g.fillText('✦ Strata: Lux Genesis', W - fs, H - fs * (frame === 'cinema' ? 2.5 : 1)); }
    return c;
  }
  function snap() {
    renderer.captureNext((src) => {
      const c = compose(src);
      c.toBlob(async (blob) => {
        if (!blob) { toast('Could not take the photo on this device.'); return; }
        const file = new File([blob], `strata-${Date.now()}.png`, { type: 'image/png' });
        window.__lastPhoto = { size: blob.size, w: c.width, h: c.height, filter, frame };
        try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Strata: Lux Genesis', text: caption || 'A view from the strata' }); toast('📸 Shared!'); return; } } catch { /* cancelled or unsupported → download */ }
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file.name; document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
        toast('📸 Photo saved to your downloads.');
      }, 'image/png');
    });
  }
  return { open, close, onKey, snap, get on() { return on; }, compose };
}
