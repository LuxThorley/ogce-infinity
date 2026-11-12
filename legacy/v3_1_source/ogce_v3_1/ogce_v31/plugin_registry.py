from __future__ import annotations
from pydantic import BaseModel, Field

class PluginPackage(BaseModel):
    package_id: str
    name: str
    version: str
    summary: str
    tags: list[str] = Field(default_factory=list)

class PluginRegistry:
    def __init__(self) -> None:
        self.packages: dict[str, PluginPackage] = {}

    def publish(self, package: PluginPackage) -> None:
        self.packages[package.package_id] = package
