from __future__ import annotations
from dataclasses import dataclass

@dataclass(slots=True)
class UpdateManifest:
    version: str
    channel: str
    artifacts: list[str]
    notes: str = ""

def build_update_manifest(version: str, channel: str, notes: str = "") -> UpdateManifest:
    return UpdateManifest(version=version, channel=channel, artifacts=["launcher","editor","runtime","docs"], notes=notes)
