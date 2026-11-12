"""Signed-update verification contract. Cryptographic signature uses optional Ed25519 backend."""
import base64,json,hashlib
class UpdateError(ValueError): pass
def verify_update_manifest(manifest,public_key_pem):
    try:
        from cryptography.hazmat.primitives.serialization import load_pem_public_key
        from cryptography.exceptions import InvalidSignature
    except ImportError as e: raise RuntimeError("Install cryptography to verify release signatures") from e
    data={k:v for k,v in manifest.items() if k!="signature"}
    raw=json.dumps(data,sort_keys=True,separators=(",",":")).encode()
    try:
        key=load_pem_public_key(public_key_pem.encode())
        key.verify(base64.b64decode(manifest["signature"]),raw)
    except Exception as e: raise UpdateError("Release signature invalid") from e
    for f in data.get("files",[]):
        if len(f.get("sha256",""))!=64: raise UpdateError("Malformed file digest")
    return {"valid":True,"version":data.get("version"),"file_count":len(data.get("files",[]))}
