"""Strata v9.0 "Bard" conversations: open, AI-driven talk with Shakespeare-inspired NPCs (canonical; mirrored in
cloudflare/src/bard.js and checked by parity fixtures).

* Every NPC has a persona sheet in bard.json (personality, intentions, secret agenda, relationships, speech style,
  voice profile, quests, trade stock, short public-domain quotations and a large pool of offline lines).
* Per player, each NPC remembers: relationship, notes, the last few exchanges, active quest, finished quests,
  whether it has allied with you or told you its secret.
* A turn is either answered by Malcolm (Worker only; the parsed reply is passed in as `live`) or by the deterministic
  offline persona engine below. Either way, any actions (give_quest, complete_quest, trade, betray, ally,
  reveal_secret, gift) are validated here against a whitelist and the game state before they change anything.
* A seeded roll (0-99, from the player, NPC and turn) adds unpredictability: each persona has a "temper" that sets how
  often it does something surprising. Same seed, same story.
* Input and output pass the same teen-safety checks as Malcolm. All of it is simulated: NPCs are not real or conscious.
"""
import json
import re
from pathlib import Path

from .omniverse import OmniError, h3, seed_of, _clamp
from .safety import classify, redact_pii, safe_reply

BARD = json.loads((Path(__file__).with_name("bard.json")).read_text(encoding="utf-8"))
CAST = BARD["cast"]
LIM = BARD["limits"]
VALUES = BARD["values"]
INTENTS = [(name, re.compile(rx, re.I)) for name, rx in BARD["intents"]]
ACTION_KEYS = {"give_quest": {"type", "quest"}, "complete_quest": {"type"}, "trade": {"type", "give", "get"},
               "betray": {"type"}, "ally": {"type"}, "reveal_secret": {"type"}, "gift": {"type", "item"}}
TRADE_RX = re.compile(r"(\d+)?\s*([a-z_ ]+?)s?\s+for\s+(\d+)?\s*([a-z_ ]+?)s?\b", re.I)
ITEM_NAMES = {"herbal tea": "herbal_tea", "tea": "herbal_tea", "lux mote": "lux_mote", "mote": "lux_mote", "berry": "berries", "berrie": "berries"}


def tier(rel: int) -> int:
    return 0 if rel < 15 else 1 if rel < 40 else 2


def public_cast() -> list:
    """What the browser may know. Secrets, agendas and intentions stay on the server."""
    out = []
    for k in sorted(CAST):
        c = CAST[k]
        out.append({"id": k, "name": c["name"], "short": c["short"], "title": c["title"], "model": c["model"], "realm": c["realm"],
                    "x": c["x"], "y": c["y"], "faction": c["faction"], "personality": c["personality"], "speech_style": c["speech_style"],
                    "voice": c["voice"], "quotes": c["quotes"], "aliases": c["aliases"]})
    return out


def memory(p: dict, npc_id: str) -> dict:
    m = p["npc"].setdefault(npc_id, {"rel": 0, "times": 0, "last": None, "gifts": 0})
    for k, v in (("turns", 0), ("notes", []), ("hist", []), ("secret", False), ("ally", False), ("quest", None), ("done", []),
                 ("last_betray", -999), ("last_gift", -999)):
        if k not in m or type(m[k]) is not type(v) and not (k == "quest" and (m[k] is None or isinstance(m[k], str))):
            m[k] = list(v) if isinstance(v, list) else v
    return m


def mentioned(text: str, me: str):
    t = " " + re.sub(r"[^a-z ]", " ", text.lower()) + " "
    for k in sorted(CAST):
        if k == me:
            continue
        for a in CAST[k]["aliases"]:
            if f" {a} " in t:
                return k
    return None


def intent(text: str, npc_id: str) -> str:
    for name, rx in INTENTS:
        if rx.search(text):
            return name
    if mentioned(text, npc_id):
        return "other"
    low = text.lower()
    if any(w in low for w in CAST[npc_id]["likes_topics"]):
        return "topic"
    return "ask" if "?" in text else "chat"


def roll_for(seed: int, npc_id: str, turn: int, text: str) -> int:
    return h3(seed_of(f"{seed}:{npc_id}"), turn, len(text)) % 100


def _quest(c: dict, qid):
    return next((q for q in c["quests"] if q["id"] == qid), None)


def goal_met(p: dict, q: dict) -> bool:
    g = q["goal"]
    if "bring" in g:
        return all(p["bag"].get(k, 0) >= v for k, v in g["bring"].items())
    if "talk" in g:
        o = p["npc"].get(g["talk"], {})
        return o.get("turns", 0) > 0 or o.get("times", 0) > 0
    return False


def allowed(p: dict, npc_id: str) -> list:
    c, m = CAST[npc_id], memory(p, npc_id)
    a = ["trade"]
    if m["quest"] is None and any(q["id"] not in m["done"] for q in c["quests"]):
        a.append("give_quest")
    if m["quest"] is not None and _quest(c, m["quest"]) and goal_met(p, _quest(c, m["quest"])):
        a.append("complete_quest")
    if c["can_betray"] and m["turns"] - m["last_betray"] >= LIM["betray_gap"] and m["rel"] < 30:
        a.append("betray")
    if m["rel"] >= 40 and not m["ally"]:
        a.append("ally")
    if m["rel"] >= c["secret_at"] and not m["secret"]:
        a.append("reveal_secret")
    if m["turns"] - m["last_gift"] >= LIM["gift_gap"]:
        a.append("gift")
    return a


def _item(word: str):
    w = (word or "").strip().lower()
    w = ITEM_NAMES.get(w, w).replace(" ", "_")
    if w in VALUES:
        return w
    if w + "s" in VALUES:
        return w + "s"
    return None


def parse_trade(text: str):
    m = TRADE_RX.search(text.lower())
    if not m:
        return None
    give_w = m.group(2).split()[-2:] if m.group(2) else []
    get_w = m.group(4).split()[:2] if m.group(4) else []
    gi = _item(" ".join(give_w)) or (_item(give_w[-1]) if give_w else None)
    ge = _item(" ".join(get_w)) or (_item(get_w[0]) if get_w else None)
    if not gi or not ge:
        return None
    return {"type": "trade", "give": {gi: int(m.group(1) or 1)}, "get": {ge: int(m.group(3) or 1)}}


def _counted(d) -> bool:
    return isinstance(d, dict) and 1 <= len(d) <= 2 and all(isinstance(k, str) and k in VALUES and type(v) is int and 1 <= v <= LIM["max_trade"] for k, v in d.items())


def validate_actions(p: dict, npc_id: str, actions) -> dict:
    """Whitelist plus game-state checks. Returns {'ok': [...], 'rejected': [{'action', 'reason'}]}."""
    c, ok, rej, seen = CAST[npc_id], [], [], set()
    can = allowed(p, npc_id)
    for a in (actions if isinstance(actions, list) else [])[:LIM["max_actions"] + 2]:
        t = a.get("type") if isinstance(a, dict) else None
        if not isinstance(t, str) or t not in ACTION_KEYS:
            rej.append({"action": t[:20] if isinstance(t, str) else "None", "reason": "not_allowed"})
            continue
        if set(a) != ACTION_KEYS[t]:
            rej.append({"action": t, "reason": "bad_shape"})
            continue
        if t in seen or len(ok) >= LIM["max_actions"]:
            rej.append({"action": t, "reason": "duplicate_or_too_many"})
            continue
        if t not in can:
            rej.append({"action": t, "reason": "not_now"})
            continue
        if t == "give_quest" and not (isinstance(a["quest"], str) and _quest(c, a["quest"]) and a["quest"] not in memory(p, npc_id)["done"]):
            rej.append({"action": t, "reason": "unknown_quest"})
            continue
        if t == "gift" and a["item"] not in c["gifts"]:
            rej.append({"action": t, "reason": "not_theirs"})
            continue
        if t == "trade":
            if not (_counted(a["give"]) and _counted(a["get"])):
                rej.append({"action": t, "reason": "bad_items"})
                continue
            if not all(k in c["stock"]["wants"] for k in a["give"]) or not all(k in c["stock"]["offers"] for k in a["get"]):
                rej.append({"action": t, "reason": "not_in_stock"})
                continue
            if any(p["bag"].get(k, 0) < v for k, v in a["give"].items()):
                rej.append({"action": t, "reason": "missing_item"})
                continue
            vg = sum(VALUES[k] * v for k, v in a["give"].items())
            vt = sum(VALUES[k] * v for k, v in a["get"].items())
            if vt > vg + (1 if memory(p, npc_id)["rel"] >= 40 else 0):
                rej.append({"action": t, "reason": "unfair"})
                continue
            a = {"type": "trade", "give": dict(sorted(a["give"].items())), "get": dict(sorted(a["get"].items()))}
        seen.add(t)
        ok.append(dict(a))
    return {"ok": ok, "rejected": rej}


def _note(m: dict, text: str) -> None:
    m["notes"].append(text[:80])
    del m["notes"][:-LIM["memory"]]


def apply_actions(p: dict, npc_id: str, actions: list) -> list:
    c, m, out = CAST[npc_id], memory(p, npc_id), []
    for a in actions:
        t = a["type"]
        if t == "give_quest":
            m["quest"] = a["quest"]
            q = _quest(c, a["quest"])
            _note(m, f"gave quest: {q['title']}")
            out.append({"type": t, "quest": q["id"], "title": q["title"], "ask": q["ask"]})
        elif t == "complete_quest":
            q = _quest(c, m["quest"])
            if "bring" in q["goal"]:
                for k, v in q["goal"]["bring"].items():
                    p["bag"][k] -= v
                    if p["bag"][k] <= 0:
                        del p["bag"][k]
            r = q["reward"]
            m["rel"] = _clamp(m["rel"] + r.get("rel", 0), -100, 100)
            for f, v in sorted(r.get("rep", {}).items()):
                p["rep"][f] = _clamp(p["rep"].get(f, 0) + v, -100, 100)
            for k, v in sorted(r.get("item", {}).items()):
                p["bag"][k] = p["bag"].get(k, 0) + v
            m["done"].append(q["id"])
            m["quest"] = None
            _note(m, f"player finished: {q['title']}")
            out.append({"type": t, "quest": q["id"], "title": q["title"], "reward": r})
        elif t == "trade":
            for k, v in a["give"].items():
                p["bag"][k] -= v
                if p["bag"][k] <= 0:
                    del p["bag"][k]
            for k, v in a["get"].items():
                p["bag"][k] = p["bag"].get(k, 0) + v
            m["rel"] = _clamp(m["rel"] + BARD["rel"]["trade"], -100, 100)
            _note(m, "traded fairly with the player")
            out.append(dict(a))
        elif t == "betray":
            m["last_betray"] = m["turns"]
            took = None
            if c["betray_kind"] == "steal":
                common = sorted((k for k, v in p["bag"].items() if v > 0 and VALUES.get(k, 9) <= 2), key=lambda k: (-p["bag"][k], k))
                if common:
                    took = common[0]
                    p["bag"][took] -= 1
                    if p["bag"][took] <= 0:
                        del p["bag"][took]
            if took:
                out.append({"type": t, "kind": "steal", "item": took})
            else:
                others = sorted((f for f in p["rep"] if f != c["faction"]), key=lambda f: (-p["rep"][f], f))
                f = others[0]
                p["rep"][f] = _clamp(p["rep"][f] - 5, -100, 100)
                out.append({"type": t, "kind": "rumour", "faction": f})
            _note(m, "I played a trick on the player")
        elif t == "ally":
            m["ally"] = True
            p["rep"][c["faction"]] = _clamp(p["rep"].get(c["faction"], 0) + 10, -100, 100)
            if f"ally_{npc_id}" not in p["flags"]:
                p["flags"].append(f"ally_{npc_id}")
            _note(m, "we are allies now")
            out.append({"type": t, "faction": c["faction"]})
        elif t == "reveal_secret":
            m["secret"] = True
            if f"secret_{npc_id}" not in p["flags"]:
                p["flags"].append(f"secret_{npc_id}")
            _note(m, "I told the player my secret")
            out.append({"type": t, "secret": c["secret"]})
        elif t == "gift":
            p["bag"][a["item"]] = p["bag"].get(a["item"], 0) + 1
            m["last_gift"] = m["turns"]
            out.append({"type": t, "item": a["item"]})
    return out


def offline_turn(p: dict, npc_id: str, text: str, seed: int) -> dict:
    """Deterministic persona dialogue engine: picks lines and actions from the persona sheet."""
    c, m = CAST[npc_id], memory(p, npc_id)
    L, can, it = c["lines"], allowed(p, npc_id), intent(text, npc_id)
    r = roll_for(seed, npc_id, m["turns"], text)
    acts, say = [], ""
    if it == "greet":
        say = L["greet"][tier(m["rel"])]
    elif it == "farewell":
        say = L["farewell"][r % 2]
    elif it == "secret":
        if "reveal_secret" in can:
            say, acts = c["secret"], [{"type": "reveal_secret"}]
        else:
            say = L["secret_hint"]
    elif it == "quest":
        q = _quest(c, m["quest"]) if m["quest"] else None
        if "complete_quest" in can:
            say, acts = q["done"], [{"type": "complete_quest"}]
        elif q:
            say = f"Still waiting, friend: {q['ask']}"
        elif "give_quest" in can:
            nq = next(q for q in c["quests"] if q["id"] not in m["done"])
            say, acts = nq["ask"], [{"type": "give_quest", "quest": nq["id"]}]
        else:
            say = f"I've no more tasks for thee today. {L['small'][r % 4]}"
    elif it == "trade":
        t = parse_trade(text)
        if t:
            v = validate_actions(p, npc_id, [t])
            if v["ok"]:
                say, acts = L["trade"][r % 2], [t]
            elif v["rejected"][0]["reason"] == "missing_item":
                say = L["trade_no"]
            else:
                say = f"Not that deal. I'll trade {', '.join(c['stock']['offers'])} for {', '.join(c['stock']['wants'])}, fair value for fair value."
        else:
            o, w = c["stock"]["offers"], c["stock"]["wants"]
            say = f"I've {', '.join(x.replace('_', ' ') for x in o)} to trade, and I'm after {', '.join(x.replace('_', ' ') for x in w)}. Say, for example, “trade 1 {w[0].replace('_', ' ')} for 1 {o[0].replace('_', ' ')}”."
    elif it == "ally":
        say, acts = (L["ally"][0], [{"type": "ally"}]) if "ally" in can else (L["ally"][1], [])
    elif it == "insult":
        if "betray" in can and r < c["temper"]:
            say, acts = L["betray"], [{"type": "betray"}]
        else:
            say = L["insult"][r % 2]
    elif it == "compliment":
        say = L["compliment"][r % 2]
    elif it == "quote":
        q = c["quotes"][r % len(c["quotes"])]
        say = f"As the old words go: “{q['text']}” ({q['src']})"
    elif it == "self":
        say = L["self"][r % 2]
    elif it == "other":
        o = mentioned(text, npc_id)
        rel = c["relationships"].get(o)
        say = f"{CAST[o]['name']}? Ask anyone: {c['short']} {rel}." if rel else f"{CAST[o]['name']}? I know of them, but our paths seldom cross."
    elif it == "topic":
        say = L["small"][r % 4]
    elif it == "ask":
        say = L["unknown"][r % 3] if r % 2 else L["small"][r % 4]
    else:
        say = L["small"][r % 4]
    twist = it not in ("farewell", "secret", "quest", "trade", "greet") and not acts and r < c["temper"] // 2
    if twist:
        say = L["twist"][r % 3]
        if "gift" in can and r % 2 == 0:
            acts = [{"type": "gift", "item": c["gifts"][r % len(c["gifts"])]}]
    return {"say": say, "actions": acts, "intent": it, "roll": r, "twist": twist}


def turn_context(p: dict, npc_id: str, text: str, seed: int) -> dict:
    """Facts the Worker hands to Malcolm (no secret unless it may be revealed now)."""
    c, m = CAST[npc_id], memory(p, npc_id)
    can = allowed(p, npc_id)
    return {"intent": intent(text, npc_id), "roll": roll_for(seed, npc_id, m["turns"], text), "allowed": can, "rel": m["rel"],
            "tier": tier(m["rel"]), "quest": m["quest"], "done": list(m["done"]), "ally": m["ally"], "secret_known": m["secret"],
            "may_reveal": "reveal_secret" in can, "notes": list(m["notes"]), "hist": [dict(h) for h in m["hist"]]}


def check_location(p: dict, npc_id: str) -> None:
    if npc_id not in CAST:
        raise OmniError("unknown_npc")
    c = CAST[npc_id]
    if p["realm"] != c["realm"] or abs(p["x"] - c["x"]) + abs(p["y"] - c["y"]) > 3:
        raise OmniError("too_far")


def converse(p: dict, npc_id: str, text, seed: int, live: dict | None = None) -> dict:
    """One conversation turn. `live` is Malcolm's parsed reply ({say, actions, remember}) or None for offline."""
    check_location(p, npc_id)
    if not isinstance(text, str) or not text.strip():
        raise OmniError("empty_message")
    if len(text) > LIM["max_chars"]:
        raise OmniError("message_too_long")
    c, m = CAST[npc_id], memory(p, npc_id)
    msg, had_pii = redact_pii(text)
    cat = classify(msg)
    base = {"npc": npc_id, "name": c["name"], "voice": c["voice"]}
    if cat:
        return {**base, "say": safe_reply(cat), "actions": [], "rejected": [], "intent": "safety", "rel": m["rel"], "tier": tier(m["rel"]),
                "source": "safety", "safety": cat, "quest": m["quest"], "secret_known": m["secret"], "roll": 0, "twist": False}
    off = offline_turn(p, npc_id, msg, seed)
    source, say, acts = "offline", off["say"], off["actions"]
    if live is not None:
        lsay = live.get("say") if isinstance(live.get("say"), str) else ""
        lsay = redact_pii(lsay[:600])[0].strip()
        if lsay and not classify(lsay):
            source, say, acts = "malcolm", lsay, live.get("actions") if isinstance(live.get("actions"), list) else []
    v = validate_actions(p, npc_id, acts)
    applied = apply_actions(p, npc_id, v["ok"])
    if any(a["type"] == "reveal_secret" for a in applied) and c["secret"] not in say:
        say = f"{say} {c['secret']}".strip()
    it = off["intent"]
    delta = {"greet": BARD["rel"]["greet"] if m["turns"] == 0 else 0, "compliment": BARD["rel"]["compliment"], "insult": BARD["rel"]["insult"],
             "topic": BARD["rel"]["like"]}.get(it, 0)
    m["rel"] = _clamp(m["rel"] + delta, -100, 100)
    if it in ("insult", "compliment", "ally", "secret", "other") and not applied:
        _note(m, {"insult": "player was rude to me", "compliment": "player was kind to me", "ally": "player asked to be allies",
                  "secret": "player asked about my secret", "other": f"player asked about {mentioned(msg, npc_id)}"}[it])
    if live is not None and source == "malcolm" and isinstance(live.get("remember"), str):
        rem = redact_pii(live["remember"][:80])[0].strip()
        if rem and not classify(rem):
            _note(m, rem)
    m["turns"] += 1
    m["hist"].append({"u": msg[:200], "a": say[:200]})
    del m["hist"][:-LIM["history"]]
    q = _quest(c, m["quest"]) if m["quest"] else None
    return {**base, "say": say, "actions": applied, "rejected": v["rejected"], "intent": it, "rel": m["rel"], "tier": tier(m["rel"]),
            "source": source, "quest": ({"id": q["id"], "title": q["title"], "ask": q["ask"], "ready": goal_met(p, q)} if q else None),
            "secret_known": m["secret"], "roll": off["roll"], "twist": off["twist"] and source == "offline",
            **({"notice": "pii_removed"} if had_pii else {})}


def bard_view(p: dict, npc_id: str) -> dict:
    c, m = CAST[npc_id], memory(p, npc_id)
    q = _quest(c, m["quest"]) if m["quest"] else None
    return {"npc": npc_id, "rel": m["rel"], "tier": tier(m["rel"]), "turns": m["turns"], "ally": m["ally"], "secret_known": m["secret"],
            "secret": c["secret"] if m["secret"] else None, "done": list(m["done"]), "notes": list(m["notes"]), "hist": [dict(h) for h in m["hist"]],
            "quest": ({"id": q["id"], "title": q["title"], "ask": q["ask"], "ready": goal_met(p, q)} if q else None)}
