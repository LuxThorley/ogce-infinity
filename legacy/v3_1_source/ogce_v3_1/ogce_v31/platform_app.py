from fastapi import FastAPI
import uvicorn

from ogce_v31.biofeedback import SAFETY_NOTE as BIO_SAFETY
from ogce_v31.metaphysics_engine import SAFETY_NOTE as META_SAFETY
from ogce_v31.platform import PlatformStore
from ogce_v31.updater import build_update_manifest

app = FastAPI(title="OGCE v3.1 Platform", version="3.1.0")
platform_store = PlatformStore()

@app.get("/health")
def health():
    return {"status":"ok","service":"ogce-v31-platform","version":"3.1.0"}

@app.post("/accounts/register")
def register_account(email: str, display_name: str, role: str = "developer"):
    return platform_store.register_account(email, display_name, role).model_dump()

@app.post("/orgs/create")
def create_org(name: str, owner_account_id: str, plan: str = "indie"):
    return platform_store.create_org(name, owner_account_id, plan).model_dump()

@app.post("/billing/invoices")
def create_invoice(org_id: str, amount_usd: int):
    return platform_store.create_invoice(org_id, amount_usd).model_dump()

@app.get("/updates/latest")
def latest_update():
    return build_update_manifest("3.1.0", "stable", "Commercial completion foundation build.").__dict__

@app.get("/safety/biofeedback")
def biofeedback_note():
    return {"note": BIO_SAFETY}

@app.get("/safety/metaphysics")
def metaphysics_note():
    return {"note": META_SAFETY}

def main():
    uvicorn.run("ogce_v31.platform_app:app", host="127.0.0.1", port=8000, reload=False)

if __name__ == "__main__":
    main()
