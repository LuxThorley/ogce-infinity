"""OGCE Infinity v9.0: progression, story arcs, bounties, GCSE Codex, living-world events,
adaptive difficulty, teen-safe Malcolm companion (offline fallback). Canonical engine for the JS Worker port."""
from .chronicle import *  # noqa: F401,F403
from .safety import classify, redact_pii, safe_reply  # noqa: F401
from .companion import offline_reply  # noqa: F401
VERSION = "9.0.0"
