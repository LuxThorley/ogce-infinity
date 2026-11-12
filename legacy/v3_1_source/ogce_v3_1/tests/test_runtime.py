from pathlib import Path
from ogce_v31.config import Config
from ogce_v31.runtime import Runtime

def test_runtime_snapshot():
    rt = Runtime(Config(project_dir=Path("./sample_project")))
    rt.run(2)
    snap = rt.snapshot()
    assert snap.exists()
