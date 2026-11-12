from __future__ import annotations
import json
from pathlib import Path

from ogce_v31.anti_cheat import AntiCheatHooks
from ogce_v31.assets import AssetRegistry
from ogce_v31.biofeedback import BiofeedbackAdapter, ConsentManager, SAFETY_NOTE as BIO_SAFETY
from ogce_v31.config import Config
from ogce_v31.coordination import SquadCoordinator
from ogce_v31.editor import EditorShell
from ogce_v31.editor_viewport import ViewportState, describe_viewport
from ogce_v31.integrations import IntegrationManifest
from ogce_v31.matchmaking import Matchmaker
from ogce_v31.metaphysics_engine import MetaphysicsEngine
from ogce_v31.multiplayer import MultiplayerAuthority
from ogce_v31.persistence import Persistence
from ogce_v31.platform import PlatformStore
from ogce_v31.plugin_registry import PluginPackage, PluginRegistry
from ogce_v31.project import load_project
from ogce_v31.renderer import Renderer
from ogce_v31.reports import ReportBuilder
from ogce_v31.scene_io import load_scene_file
from ogce_v31.updater import build_update_manifest

class Runtime:
    def __init__(self, config: Config) -> None:
        self.config = config
        self.project = load_project(config.project_dir)
        self.scene = load_scene_file(config.project_dir / self.project.startup_scene)
        self.assets = AssetRegistry(config.project_dir / ".ogce" / "assets_db.json")
        self.persistence = Persistence(config.database_path)
        self.renderer = Renderer(config.render_backend)
        self.editor = EditorShell()
        self.viewport = ViewportState(render_backend=config.viewport_backend)
        self.matchmaker = Matchmaker()
        self.multiplayer = MultiplayerAuthority()
        self.coordinator = SquadCoordinator()
        self.anti_cheat = AntiCheatHooks()
        self.consent = ConsentManager()
        self.biofeedback = BiofeedbackAdapter(self.consent)
        self.registry = PluginRegistry()
        self.platform = PlatformStore()
        self.metaphysics = MetaphysicsEngine()
        self.report_builder = ReportBuilder()
        self.integrations = IntegrationManifest()
        self.tick_count = 0
        self.last_frame = None
        self.last_report = None
        self.update_manifest = build_update_manifest("3.1.0", "stable", "Commercial completion foundation build.")

    def bootstrap(self) -> None:
        self.persistence.initialize()
        self.renderer.initialize()
        self.registry.publish(PluginPackage(package_id="builtin_reports", name="Builtin Reports", version="1.0.0", summary="Core after-action reporting.", tags=["reports","analytics"]))
        self.registry.publish(PluginPackage(package_id="builtin_metaphysics", name="Builtin Metaphysics", version="1.0.0", summary="Symbolic dimensional simulation.", tags=["metaphysics","lore"]))
        a = self.multiplayer.register_player("Astra")
        b = self.multiplayer.register_player("Nyx")
        c = self.multiplayer.register_player("Titan")
        self.players = [a.player_id, b.player_id, c.player_id]
        for pid in self.players:
            self.matchmaker.enqueue(pid, 50, "militia", "eu-west")
        self.match = self.matchmaker.form_match("militia", "eu-west", 3)
        self.session_id = self.match.candidate_id if self.match else "demo_session"
        self.persistence.execute("INSERT OR IGNORE INTO sessions(session_id, mode, map_name, status) VALUES (?, ?, ?, ?)", (self.session_id, "militia", "Citadel Basin", "active"))
        for p in [a,b,c]:
            self.persistence.execute("INSERT OR IGNORE INTO players(player_id, display_name) VALUES (?, ?)", (p.player_id, p.display_name))
        self.coordinator.link(a.player_id, b.player_id, trust=75, cohesion=68, bandwidth=80)
        self.coordinator.link(a.player_id, c.player_id, trust=67, cohesion=72, bandwidth=70)
        self.consent.grant(a.player_id, "focus_stress_proxy", "adaptive_gameplay")
        self.biofeedback.ingest_local_sample(a.player_id, "focus_stress_proxy", 82, 33, 0.90)
        acct = self.platform.register_account("owner@example.com", "Owner")
        org = self.platform.create_org("OGCE Demo Studio", acct.account_id)
        self.invoice = self.platform.create_invoice(org.org_id, 99)
        self.metaphysics.add_node("Astral Bastion", "astral", {"geometry":"non_euclidean", "tone":"numinous"})
        self.metaphysics.add_node("Echo Archive", "mnemonic", {"memory_density":"high"})
        self.metaphysics.add_rule("astral", "mnemonic", "resonant_projection", 35)
        self.metaphysics.manifest_event("Vault of Recursive Dawn", "astral", 71, ["symbolic","otherworldly","quest"])

    def tick(self) -> None:
        self.tick_count += 1
        draw_calls = sum(1 for n in self.scene.root_nodes if "renderable" in n.tags or "mesh" in n.components)
        self.last_frame = self.renderer.frame(self.scene.name, draw_calls).__dict__
        self.coordinator.propagate(self.players[0], 60)
        self.multiplayer.apply_stats(self.players[0], {"combat": 8, "leadership": 6, "cohesion": 7, "strategy": 6})
        self.multiplayer.apply_stats(self.players[1], {"combat": 5, "leadership": 4, "cohesion": 6, "strategy": 5})
        self.multiplayer.apply_stats(self.players[2], {"combat": 6, "leadership": 5, "cohesion": 8, "strategy": 7})

    def run(self, ticks: int = 3) -> None:
        self.bootstrap()
        for _ in range(ticks):
            self.tick()
        stats = {
            pid: {
                "combat": self.multiplayer.players[pid].combat,
                "leadership": self.multiplayer.players[pid].leadership,
                "cohesion": self.multiplayer.players[pid].cohesion,
            } for pid in self.players
        }
        cohesion_scores = [self.multiplayer.players[pid].cohesion for pid in self.players]
        self.last_report = self.report_builder.build("militia", stats, cohesion_scores)
        self.persistence.execute("INSERT OR IGNORE INTO reports(report_id, title, summary) VALUES (?, ?, ?)", ("report_v31", self.last_report.title, self.last_report.summary))
        self.persistence.execute("INSERT OR IGNORE INTO updates(update_id, version, channel) VALUES (?, ?, ?)", ("update_v31", self.update_manifest.version, self.update_manifest.channel))

    def snapshot(self) -> Path:
        self.config.save_dir.mkdir(parents=True, exist_ok=True)
        out = self.config.save_dir / "ogce_v31_snapshot.json"
        combat_top = self.multiplayer.leaderboard("combat")
        signals = self.anti_cheat.inspect(combat_top[0].score if combat_top else 0, command_rate=5)
        out.write_text(json.dumps({
            "project": self.project.name,
            "engine_version": "3.1.0",
            "tick_count": self.tick_count,
            "session_id": self.session_id,
            "renderer_frame": self.last_frame,
            "editor": self.editor.status(),
            "viewport": describe_viewport(self.viewport),
            "player_count": len(self.multiplayer.players),
            "leaderboards": {
                "combat": [r.__dict__ for r in self.multiplayer.leaderboard("combat")],
                "leadership": [r.__dict__ for r in self.multiplayer.leaderboard("leadership")],
                "cohesion": [r.__dict__ for r in self.multiplayer.leaderboard("cohesion")],
            },
            "coordination": self.coordinator.summary(),
            "biofeedback_safety_note": BIO_SAFETY,
            "adaptive_hint": self.biofeedback.adaptive_hint(self.players[0]),
            "plugin_registry_count": len(self.registry.packages),
            "platform": {
                "accounts": len(self.platform.accounts),
                "organizations": len(self.platform.organizations),
                "invoices": len(self.platform.invoices),
            },
            "invoice_status": self.invoice.status,
            "update_manifest": self.update_manifest.__dict__,
            "metaphysics": self.metaphysics.summarize(),
            "integrations": self.integrations.build(),
            "after_action_report": {
                "title": self.last_report.title,
                "summary": self.last_report.summary,
                "highlights": self.last_report.highlights,
                "recommendations": self.last_report.recommendations,
            } if self.last_report else None,
            "anti_cheat_signals": [s.__dict__ for s in signals],
        }, indent=2), encoding="utf-8")
        return out
