"""Minimal API-key authentication primitives; production identity requires an external IdP."""
import hashlib,hmac,secrets,time
class APIKeyStore:
    def __init__(self): self._keys={}
    def issue(self,subject,scopes=("world:read",)):
        key=secrets.token_urlsafe(32); digest=hashlib.sha256(key.encode()).hexdigest()
        self._keys[digest]={"subject":subject,"scopes":tuple(scopes),"created":int(time.time())}; return key
    def verify(self,key,scope):
        digest=hashlib.sha256(key.encode()).hexdigest()
        record=self._keys.get(digest)
        if not record or scope not in record["scopes"]: return None
        return {"subject":record["subject"],"scopes":record["scopes"]}
