(() => {
  const $ = id => document.getElementById(id);
  const api = async (operation, extra={}) => {
    const res = await fetch(`/api/v82/world/${encodeURIComponent($("world")?.textContent.trim() || "AURELIA")}`, {
      method: "POST", headers: {"Content-Type":"application/json", "Authorization":"Bearer "+(window.getOGCESession?.() || "")},
      body: JSON.stringify({operation, ...extra})
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    if (data.world) render(data.world);
    return data.result;
  };
  const say = (id, value) => { const el=$(id); if(el) el.textContent=typeof value==="string"?value:JSON.stringify(value,null,2); };
  function render(w) {
    say("v82-tick",w.tick); say("v82-celestial",`${w.celestial.alignment} · ${w.celestial.omen}`);
    say("v82-civilization",Object.entries(w.civilization).map(([k,v])=>`${k}: ${v}`).join(" · "));
    say("v82-ledger",`${w.ledger.entries} entries · ${w.ledger.valid?"verified":"INVALID"}`);
    say("v82-characters",w.characters.map(c=>`${c.name} · Lv ${c.level} · HP ${c.health} · Mana ${c.mana} · XP ${c.xp}`).join("\n")||"No character yet.");
    say("v82-research-list",w.research.map(r=>`${r.id}: ${r.title} — ${r.status}`).join("\n")||"No research yet.");
    say("v82-inventions",Object.keys(w.inventions).join(", ")||"No inventions yet.");
  }
  async function run(fn, output="v82-status") { try { const v=await fn(); say(output,v); } catch(e){say(output,`Error: ${e.message}`);} }
  document.addEventListener("DOMContentLoaded", () => {
    if (!$("v82-create")) return;
    const cid=()=>($("v82-character-id").value.trim()||"wanderer");
    $("v82-create").onclick=()=>run(()=>api("character",{character_id:cid(),name:$("v82-name").value,path:$("v82-path").value,birth_cycle:+$("v82-birth").value}));
    $("v82-cast").onclick=()=>run(()=>api("cast",{character_id:cid(),spell:$("v82-spell").value,target:"self"}));
    $("v82-reading").onclick=()=>run(()=>api("reading",{character_id:cid()}));
    $("v82-hypothesis").onclick=()=>run(()=>api("hypothesis",{character_id:cid(),title:$("v82-title").value,discipline:$("v82-discipline").value,hypothesis:$("v82-hypothesis-text").value}));
    $("v82-experiment").onclick=()=>run(()=>api("experiment",{character_id:cid(),research_id:$("v82-research-id").value,observation:$("v82-observation").value,repeat:$("v82-repeat").checked}));
    $("v82-train").onclick=()=>run(()=>api("train",{character_id:cid(),discipline:$("v82-train-discipline").value,amount:5}));
    $("v82-invent").onclick=()=>run(()=>api("invent",{character_id:cid(),technology:$("v82-tech").value}));
    $("v82-tick-button").onclick=()=>run(()=>api("tick",{count:1}));
    fetch(`/api/v82/world/${encodeURIComponent($("world")?.textContent.trim() || "AURELIA")}`,{headers:{"Authorization":"Bearer "+(window.getOGCESession?.() || "")}}).then(r=>r.json()).then(render).catch(()=>{});
  });
})();
