"""OGCE v5.3 living-world simulation CLI."""
import argparse, json
from pathlib import Path
from .v53.simulation import create_world, world_tick

def main():
    p = argparse.ArgumentParser(prog="ogce53", description="OGCE v5.3 Omniversal Intelligence & Living Civilizations")
    s = p.add_subparsers(dest="cmd", required=True)
    w = s.add_parser("simulate-world"); w.add_argument("--ticks", type=int, default=10); w.add_argument("--seed", type=int, default=53); w.add_argument("--name", default="Aurelia"); w.add_argument("--out")
    n = s.add_parser("npc-demo"); n.add_argument("--ticks", type=int, default=5)
    e = s.add_parser("event"); e.add_argument("--seed", type=int, default=53); e.add_argument("--tick", type=int, default=1); e.add_argument("--region", default="the frontier")
    x = p.parse_args()
    if x.cmd == "simulate-world":
        if not 0 <= x.ticks <= 10000: p.error("--ticks must be between 0 and 10000")
        state = create_world(x.seed, x.name)
        for _ in range(x.ticks): state = world_tick(state)
        payload = json.dumps(state, indent=2)
        if x.out: Path(x.out).write_text(payload + "\n", encoding="utf-8")
        print(payload)
    elif x.cmd == "npc-demo":
        from .v53.npc import NPC
        npc = NPC("demo-1", "Mira", role="scout", needs={"hunger": .7, "safety": .2, "belonging": .3, "curiosity": .8})
        if not 0 <= x.ticks <= 10000: p.error("--ticks must be between 0 and 10000")
        for tick in range(1, x.ticks + 1): print(json.dumps(npc.tick(tick)))
    elif x.cmd == "event":
        from .v53.events import generate_event
        print(json.dumps(generate_event(x.seed, x.tick, x.region), indent=2))
if __name__ == "__main__": main()
