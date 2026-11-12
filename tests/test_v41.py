import json
import pytest
from ogce4.v41.materials import PBRMaterial
from ogce4.v41.terrain import generate_heightfield
from ogce4.v41.profiler import FrameProfiler
from ogce4.v41.editor_history import CommandHistory, SetProperty
from ogce4.v41.gltf import inspect_gltf, GLTFError
from ogce4.v41.lighting import LightingProfile
from ogce4.v41.gi import IrradianceProbe, interpolate_probes
from ogce4.v41.content_pipeline import validate_manifest
from ogce4.v41.security import hash_password, verify_password
from ogce4.v41.release_manifest import build_manifest, verify_manifest
from ogce4.v41.platform_qa import evaluate_checks

def test_pbr_validation():
    assert PBRMaterial(metallic=.7,roughness=.2).to_dict()["metallic"] == .7
    with pytest.raises(ValueError): PBRMaterial(metallic=2)

def test_terrain_deterministic():
    assert generate_heightfield(8,8,42)==generate_heightfield(8,8,42)
    assert len(generate_heightfield(8,8))==8

def test_profiler_budget():
    p=FrameProfiler()
    for _ in range(30): p.record(1/60)
    assert p.within_budget(17)
    assert p.snapshot()["frames"]==30

def test_history_undo_redo():
    d={"x":1}; h=CommandHistory(); h.execute(SetProperty(d,"x",2))
    assert d["x"]==2 and h.undo() and d["x"]==1
    assert h.redo() and d["x"]==2

def test_gltf_safe_inspection(tmp_path):
    f=tmp_path/"scene.gltf"
    f.write_text(json.dumps({"asset":{"version":"2.0"},"scenes":[{}],"nodes":[{}]}))
    assert inspect_gltf(f)["nodes"]==1
    f.write_text(json.dumps({"asset":{"version":"2.0"},"buffers":[{"uri":"https://evil","byteLength":1}]}))
    with pytest.raises(GLTFError): inspect_gltf(f)

def test_lighting_and_probe():
    LightingProfile()
    p=IrradianceProbe((0,0,0),(1,2,3))
    assert interpolate_probes((0,0,0),[p])==(1,2,3)

def test_content_pipeline(tmp_path):
    (tmp_path/"a.bin").write_bytes(b"x")
    assert validate_manifest(tmp_path,{"assets":[{"id":"a","path":"a.bin","license":"CC0"}]})["valid"]
    assert not validate_manifest(tmp_path,{"assets":[{"id":"a","path":"../bad","license":"x"}]})["valid"]

def test_password_hash():
    rec=hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple",rec)
    assert not verify_password("incorrect password",rec)

def test_manifest_integrity(tmp_path):
    (tmp_path/"a").write_text("x")
    m=build_manifest(tmp_path)
    assert verify_manifest(tmp_path,m)["valid"]
    (tmp_path/"a").write_text("tampered")
    assert not verify_manifest(tmp_path,m)["valid"]

def test_platform_checks():
    assert not evaluate_checks({})["passed"]
    assert evaluate_checks({k:True for k in ["import","project_io","scene_io","renderer_init","asset_validation"]})["passed"]
