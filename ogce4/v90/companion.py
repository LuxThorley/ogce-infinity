"""Deterministic offline Malcolm companion (used when the OmniAPI is off, rate-limited or down).

Canonical; mirrored in cloudflare/src/v90.js and parity-tested."""
from .chronicle import DATA, LESSONS, fnv, world_event
from .safety import classify, redact_pii, safe_reply

TOPICS = [
    (("ssr", "stratified", "source realism", "strata", "stratum"), "l4"),
    (("cra", "chronological", "realignment", "33 atoms", "atom"), "l5"),
    (("fixed point", "kleene", "if-then", "rule", "lattice"), "l3"),
    (("hash", "diary", "ledger", "tamper"), "l2"),
    (("population", "doubling", "exponential", "creature", "grow"), "l1"),
    (("coin", "144,000", "144000", "intention", "z-score", "zscore", "significan", "probability of heads"), "s5"),
    (("light", "metre", "meter", "299"), "s4"),
    (("gibbs", "melt", "ice", "entropy"), "s3"),
    (("uncertain", "error bar", "half the range"), "s2"),
    (("mean", "average", "range", "fair test", "variable"), "s1"),
    (("probabilit", "chance", "expected", "loot"), "a4"),
    (("speed", "distance", "fast"), "a3"),
    (("efficien", "campfire", "fire"), "a2"),
    (("kinetic", "energy", "joule"), "a1"),
]
HELP = [
    (("move", "walk", "control", "keys"), "Walk with W A S D or the arrow keys, or tap the ground. Drag to turn the camera and scroll or pinch to zoom."),
    (("health", "hurt", "heal", "potion", "faint"), "Low on health? Rest by a campfire (R) or drink a potion (Q). Make potions from 2 crystals (P)."),
    (("craft", "sword", "sabre", "weapon"), "Better weapons hit harder: Stone Sword (5 stone + 2 wood) deals 18 and Crystal Sabre (5 crystal + 3 stone + 2 wood) deals 27."),
    (("bount", "renown", "rank"), "Bounties on the Journal's board change every in-game day. Finish them for renown and climb the strata from Wanderer to Genesis Archon."),
    (("quest", "story", "chapter", "arc"), "Open the Journal (J) to see your three story arcs, one stratum for each mode. Each chapter tells you exactly what to do next."),
    (("codex", "lesson", "quiz", "learn"), "Open the Codex (K). Each lesson has an equation, a worked example and a graph. Answer two questions correctly to pass."),
    (("spell", "magic", "wizard"), "Spells in the Magic & Science tab are make-believe, part of the story. The science lab uses the real method: guess, test, repeat."),
]
NAMES = ["Ærwyn", "Tamsin", "Corvid", "Ilse", "Bram", "Nell", "Oriel", "Pip"]
PLACES = ["the Whispering Ford", "Crystal Hollow", "the Old Lantern Road", "Mossback Ridge", "the Glass Marsh", "Ember Camp"]
HOOKS = ["lost a lantern that still glows", "found strange tracks in the moss", "needs help testing an idea twice",
         "heard the crystals hum at night", "is mapping how far the wolves roam", "is counting creatures in the Life Lab"]


def _lesson_text(lid):
    l = LESSONS[lid]
    tag = l["grade"]
    return f"[{tag}] {l['title']}: {l['body'][0]} Equation: {l['equation']} ({l['units']}). Example: {l['example']}"


def offline_reply(mode, message, context=None):
    context = context or {}
    text, _ = redact_pii(message)
    cat = classify(text)
    if cat:
        return {"text": safe_reply(cat), "source": "offline", "safety": cat}
    low = text.lower()
    if mode == "lore":
        seed = fnv(f"{context.get('player', '')}:{context.get('tick', 0)}:{low}")
        ev = world_event(int(context.get("tick", 0) or 0))["event"]
        who, where, hook = NAMES[seed % len(NAMES)], PLACES[(seed >> 3) % len(PLACES)], HOOKS[(seed >> 6) % len(HOOKS)]
        return {"text": f"{ev['icon']} During the {ev['name']}, {who} at {where} {hook}. "
                        f"\"Help me, traveller, and Aurelia will remember your name.\" (Story text: make-believe.)",
                "source": "offline", "safety": None}
    for keys, lid in TOPICS:
        if any(k in low for k in keys):
            return {"text": _lesson_text(lid) + (" Remember: SSR and CRA are Oliver's theory, not established science." if lid in ("l4", "l5") else ""),
                    "source": "offline", "safety": None, "lesson": lid}
    for keys, tip in HELP:
        if any(k in low for k in keys):
            return {"text": tip, "source": "offline", "safety": None}
    hp, mh = context.get("health"), context.get("max_health")
    if isinstance(hp, int) and isinstance(mh, int) and mh and hp * 3 < mh:
        return {"text": "Your health is low. Head to a campfire and rest (R), or drink a potion (Q) before your next fight.", "source": "offline", "safety": None}
    ev = world_event(int(context.get("tick", 0) or 0))["event"]
    return {"text": f"I'm Malcolm, your guide through the Strata (offline right now). {ev['icon']} {ev['text']} Ask me about controls, bounties, the Codex, "
                    f"or Oliver's SSR and CRA ideas.", "source": "offline", "safety": None}
