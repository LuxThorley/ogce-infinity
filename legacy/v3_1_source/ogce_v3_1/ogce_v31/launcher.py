from __future__ import annotations
import argparse, json
from pathlib import Path
from uuid import uuid4

from ogce_v31.assets import AssetRecord
from ogce_v31.biofeedback import BiofeedbackAdapter, ConsentManager, SAFETY_NOTE as BIO_SAFETY
from ogce_v31.config import Config
from ogce_v31.editor_viewport import ViewportState, describe_viewport
from ogce_v31.matchmaking import Matchmaker
from ogce_v31.metaphysics_engine import MetaphysicsEngine
from ogce_v31.project import ProjectManifest, save_project
from ogce_v31.runtime import Runtime

def scaffold_project(name: str, company: str, out: Path) -> Path:
    save_project(out, ProjectManifest(name=name, company=company))
    (out / "content" / "meshes").mkdir(parents=True, exist_ok=True)
    (out / "content" / "materials").mkdir(parents=True, exist_ok=True)
    (out / "scenes").mkdir(parents=True, exist_ok=True)
    (out / ".ogce").mkdir(parents=True, exist_ok=True)
    (out / "content" / "meshes" / "ground_plane.obj").write_text("o GroundPlane\nv 0 0 0\n", encoding="utf-8")
    (out / "content" / "materials" / "default_lit.material.json").write_text('{"name":"default_lit","shader":"gbuffer_surface"}\n', encoding="utf-8")
    (out / "scenes" / "main.scene.json").write_text(json.dumps({
        "name": "MainScene",
        "root_nodes": [
            {"name":"PlayerSpawn","node_id":"player_spawn_root","tags":["spawn","player"],"components":{"spawn":{"kind":"player"}}},
            {"name":"GroundPlane","node_id":"ground_plane_root","tags":["renderable"],"components":{"mesh":{"asset_ref":"content/meshes/ground_plane.obj","material":"default_lit"}}}
        ]
    }, indent=2), encoding="utf-8")
    records = [
        AssetRecord(asset_id=uuid4().hex, logical_path="content/meshes/ground_plane.obj", asset_type="mesh"),
        AssetRecord(asset_id=uuid4().hex, logical_path="content/materials/default_lit.material.json", asset_type="material"),
    ]
    (out / ".ogce" / "assets_db.json").write_text(json.dumps([r.model_dump() for r in records], indent=2), encoding="utf-8")
    return out

def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="ogce-v3-1", description="OGCE v3.1 launcher")
    sub = p.add_subparsers(dest="command", required=True)
    hc = sub.add_parser("healthcheck")
    hc.add_argument("--json", action="store_true")
    sp = sub.add_parser("scaffold-project")
    sp.add_argument("--name", required=True)
    sp.add_argument("--company", default="Unknown Studio")
    sp.add_argument("--out", required=True)
    run = sub.add_parser("run")
    run.add_argument("--project", default="./sample_project")
    run.add_argument("--ticks", type=int, default=3)
    dm = sub.add_parser("demo-matchmaking")
    db = sub.add_parser("demo-biofeedback")
    dv = sub.add_parser("demo-viewport")
    dmeta = sub.add_parser("demo-metaphysics")
    return p

def main() -> None:
    args = parser().parse_args()

    if args.command == "healthcheck":
        payload = {"status":"ok","product":"OGCE v3.1","version":"3.1.0"}
        print(json.dumps(payload, indent=2) if args.json else "OGCE v3.1 OK")
        return

    if args.command == "scaffold-project":
        print(scaffold_project(args.name, args.company, Path(args.out)))
        return

    if args.command == "run":
        rt = Runtime(Config(project_dir=Path(args.project)))
        rt.run(args.ticks)
        print(rt.snapshot())
        return

    if args.command == "demo-matchmaking":
        mm = Matchmaker()
        mm.enqueue("a", 50, "militia", "eu-west")
        mm.enqueue("b", 52, "militia", "eu-west")
        mm.enqueue("c", 48, "militia", "eu-west")
        match = mm.form_match("militia", "eu-west", 3)
        print(json.dumps(match.__dict__ if match else {"status":"waiting"}, indent=2))
        return

    if args.command == "demo-biofeedback":
        consent = ConsentManager()
        adapter = BiofeedbackAdapter(consent)
        consent.grant("player_a", "focus_stress_proxy", "adaptive_gameplay")
        sample = adapter.ingest_local_sample("player_a", "focus_stress_proxy", 80, 32, 0.93)
        print(json.dumps({"sample": sample.__dict__, "hint": adapter.adaptive_hint("player_a"), "safety_note": BIO_SAFETY}, indent=2))
        return

    if args.command == "demo-viewport":
        print(json.dumps(describe_viewport(ViewportState()), indent=2))
        return

    if args.command == "demo-metaphysics":
        engine = MetaphysicsEngine()
        engine.add_node("Astral Bastion", "astral", {"geometry":"non_euclidean"})
        engine.add_node("Echo Archive", "mnemonic", {"memory_density":"high"})
        engine.add_rule("astral", "mnemonic", "resonant_projection", 35)
        engine.manifest_event("Vault of Recursive Dawn", "astral", 71, ["symbolic","otherworldly"])
        print(json.dumps(engine.summarize(), indent=2))
        return

if __name__ == "__main__":
    main()
