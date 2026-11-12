from __future__ import annotations
import json
from pathlib import Path
from pydantic import BaseModel, Field

class AssetRecord(BaseModel):
    asset_id: str
    logical_path: str
    asset_type: str
    metadata: dict = Field(default_factory=dict)

class AssetRegistry:
    def __init__(self, path: Path) -> None:
        self.records: dict[str, AssetRecord] = {}
        if path.exists():
            raw = json.loads(path.read_text(encoding="utf-8"))
            self.records = {x["asset_id"]: AssetRecord.model_validate(x) for x in raw}
