import json, tempfile
from pathlib import Path
import pytest
from ogce4.v51.world_runtime import WorldRuntime
from ogce4.v51.asset_build import build_manifest
from ogce4.v51.auth import APIKeyStore
from ogce4.v51.licensing import LicenceVerifier
from ogce4.v51.ai_adapters import AdapterConfig, OpenAICompatibleAdapter
from ogce4.v51.billing import DisabledBillingProvider, CheckoutRequest
from ogce4.v5.worldgen import generate_world

def test_world_generation_reproducible():
    a=generate_world(seed=99,width=8,height=8); b=generate_world(seed=99,width=8,height=8)
    assert a==b

def test_world_persistence_and_ticks(tmp_path):
    r=WorldRuntime(tmp_path/"w.db"); r.create("a",{"tick":0,"name":"x"})
    out=r.tick("a",[{"kind":"weather","payload":{"rain":True}}])
    assert out["tick"]==1 and r.load("a")["revision"]==1
    assert r.history("a")[0]["kind"]=="weather"

def test_world_rejects_unknown_event(tmp_path):
    r=WorldRuntime(tmp_path/"w.db"); r.create("a",{})
    with pytest.raises(ValueError): r.tick("a",[{"kind":"execute_code"}])

def test_asset_manifest_hash(tmp_path):
    (tmp_path/"x.obj").write_text("mesh")
    m=build_manifest(tmp_path); assert m["assets"][0]["sha256"]

def test_api_key_scopes():
    s=APIKeyStore(); k=s.issue("user",["world:read"])
    assert s.verify(k,"world:read")["subject"]=="user"
    assert s.verify(k,"world:write") is None

def test_licence_expiry_and_signature():
    v=LicenceVerifier(b"x"*32); token=v.issue("c","ogce",200,["pro"])
    assert v.verify(token,"ogce",now=100)["valid"]
    assert not v.verify(token,"ogce",now=201)["valid"]
    assert not v.verify(token+"x","ogce",now=100)["valid"]

def test_ai_adapter_transport_policy():
    with pytest.raises(ValueError): OpenAICompatibleAdapter(AdapterConfig("bad","http://example.com"))
    OpenAICompatibleAdapter(AdapterConfig("local","http://127.0.0.1:9999"))

def test_billing_disabled_by_default():
    with pytest.raises(RuntimeError): DisabledBillingProvider().create_checkout(CheckoutRequest("c","p","https://x","https://y"))
