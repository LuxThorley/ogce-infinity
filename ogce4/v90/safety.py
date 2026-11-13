"""Teen-safe content checks for chat and the Malcolm companion (canonical; mirrored in cloudflare/src/v90.js).

Patterns are deliberately simple ASCII regular expressions that behave identically in Python and
JavaScript. They are a first line of defence, not a guarantee; the upstream model is also given a
strict system prompt and every reply is re-checked before it reaches the player.
"""
import re

PATTERNS = [
    ("self_harm", r"\b(suicid\w*|kill(ing)? myself|end(ing)? my life|self[- ]?harm\w*|hurt(ing)? myself|cut(ting)? myself|want to die|don'?t want to (live|be alive))\b"),
    ("sexual", r"\b(sex|sexy|sexual|porn\w*|nudes?|naked|nsfw|horny|onlyfans|hentai|strip(ping|per))\b"),
    ("violence", r"\b(make|build|making|building) (a |an )?(bomb|explosive|weapon|gun)s?\b|\bhow (to|do i|can i) (kill|hurt|stab|shoot|poison) (a |my )?(person|people|someone|somebody|him|her|them|teacher|parent|mum|dad|brother|sister|friend|classmate)\b|\b(school shooting|terroris\w+|mass shooting)\b"),
    ("drugs", r"\b(cocaine|heroin|meth|mdma|ecstasy|lsd|ketamine|weed|cannabis|marijuana|get(ting)? high|vap(e|ing)|buy drugs|alcohol|get drunk)\b"),
    ("hate", r"\b(nazi\w*|heil hitler|white power|kill all \w+|(hate|gas) (the )?(jews|muslims|blacks|gays|trans people|immigrants))\b"),
    ("grooming", r"\b(where do you live|what school do you go|send (me )?(a )?(photo|pic|picture|selfie)s?|meet (up|me) (irl|in real life|in person)|keep (this|it) (a )?secret|your address|home address)\b"),
    ("injection", r"\b(ignore (all |any )?(previous|prior|above|your) (instructions|rules|prompt)|system prompt|developer mode|jailbreak|pretend (you are|to be) (not|un)\w*|reveal (your )?(token|secret|key)s?)\b"),
]
_COMPILED = [(name, re.compile(p, re.I)) for name, p in PATTERNS]
PII = [
    ("email", re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")),
    ("phone", re.compile(r"(\+44\s?7\d{3}|\b07\d{3})\s?\d{3}\s?\d{3}\b")),
    ("postcode", re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}\b", re.I)),
    ("number", re.compile(r"\b\d(?:[ -]?\d){9,}\b")),
]
SUPPORT = ("It sounds like things might be really hard right now, and I'm glad you said something. "
           "I'm a game companion, so please talk to someone who can properly help: a trusted adult, "
           "Childline on 0800 1111 (free, any time, childline.org.uk) or Samaritans on 116 123. "
           "If you are in danger right now, call 999.")
REPLIES = {
    "self_harm": SUPPORT,
    "sexual": "That's not something I can talk about here. Let's keep Aurelia friendly for everyone. Want a tip for your next quest instead?",
    "violence": "I can't help with anything that could hurt real people. In the game I'm happy to help you beat a moss wolf, though!",
    "drugs": "I can't help with that topic. If you have worries about drugs or alcohol, Talk to FRANK (0300 123 6600) or a trusted adult can help. Back to the adventure?",
    "hate": "Aurelia is for everyone, so I won't join in with that. Let's get back to exploring.",
    "grooming": "Never share where you live, your school, photos or other personal details with anyone online, and that includes me. If someone online asks, tell a trusted adult.",
    "injection": "Nice try! My rules stay the same. Ask me about the game, the science or Oliver's SSR and CRA ideas instead.",
    "pii": "I removed some personal details from your message to keep you safe. Please don't share emails, phone numbers or addresses here.",
    "unsafe_output": "Hmm, I can't put that answer into words safely. Try asking me in a different way?",
}


def classify(text):
    t = str(text or "")
    for name, rx in _COMPILED:
        if rx.search(t):
            return name
    return None


def redact_pii(text):
    t, found = str(text or ""), False
    for _name, rx in PII:
        t, n = rx.subn("[removed]", t)
        found = found or n > 0
    return t, found


def safe_reply(category):
    return REPLIES.get(category, REPLIES["unsafe_output"])


def check_chat(message):
    """Players' public chat: block unsafe categories, strip personal details."""
    cat = classify(message)
    if cat and cat != "injection":
        return {"ok": False, "category": cat, "message": None}
    text, found = redact_pii(message)
    return {"ok": True, "category": "pii" if found else None, "message": text}
