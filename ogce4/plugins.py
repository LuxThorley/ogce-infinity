class PluginRegistry:
    def __init__(self):self.plugins={}
    def register(self,manifest):
        pid=manifest["id"]
        if pid in self.plugins:raise ValueError("Duplicate plugin id")
        self.plugins[pid]=manifest
