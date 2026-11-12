"""Offline licence entitlement verifier; not a payment processor."""
import base64,hmac,hashlib,json,time
class LicenceVerifier:
    def __init__(self,secret):
        if len(secret)<32: raise ValueError("secret must be at least 32 bytes")
        self.secret=secret
    def issue(self,customer,product,expires,features=()):
        payload={"customer":customer,"product":product,"expires":int(expires),"features":sorted(set(features))}
        raw=json.dumps(payload,sort_keys=True,separators=(",",":")).encode(); sig=hmac.new(self.secret,raw,hashlib.sha256).digest()
        return base64.urlsafe_b64encode(raw).decode().rstrip("=")+"."+base64.urlsafe_b64encode(sig).decode().rstrip("=")
    def verify(self,token,product,now=None):
        try:
            a,b=token.split("."); raw=base64.urlsafe_b64decode(a+"="*(-len(a)%4)); sig=base64.urlsafe_b64decode(b+"="*(-len(b)%4))
            if not hmac.compare_digest(sig,hmac.new(self.secret,raw,hashlib.sha256).digest()): return {"valid":False,"reason":"signature"}
            p=json.loads(raw); now=int(time.time()) if now is None else int(now)
            return {"valid":p["product"]==product and p["expires"]>=now,"reason":"ok" if p["product"]==product and p["expires"]>=now else "expired_or_wrong_product","claims":p}
        except Exception: return {"valid":False,"reason":"malformed"}
