"""Real HMAC-SHA256 scoped tokens. Requires an operator-supplied secret; no eternal tokens."""
import base64,hashlib,hmac,json,secrets,time
def _b64(data): return base64.urlsafe_b64encode(data).rstrip(b"=").decode()
def issue_token(secret,subject,scopes,ttl_seconds=3600):
    if not secret or len(secret)<32: raise ValueError("Signing secret must contain at least 32 bytes")
    if not subject or not scopes: raise ValueError("subject and scopes are required")
    if not 60<=int(ttl_seconds)<=31_536_000: raise ValueError("TTL must be between 60 seconds and one year")
    now=int(time.time())
    header={"alg":"HS256","typ":"JWT"}
    payload={"iss":"OGCE-v5","sub":subject,"scope":sorted(set(scopes)),"iat":now,"nbf":now,"exp":now+int(ttl_seconds),"jti":secrets.token_urlsafe(18)}
    body=f"{_b64(json.dumps(header,separators=(',',':')).encode())}.{_b64(json.dumps(payload,separators=(',',':')).encode())}"
    sig=_b64(hmac.new(secret.encode(),body.encode(),hashlib.sha256).digest())
    return body+"."+sig
def verify_token(secret,token,required_scope=None,now=None):
    try:
        h,p,s=token.split("."); body=h+"."+p
        expected=_b64(hmac.new(secret.encode(),body.encode(),hashlib.sha256).digest())
        if not hmac.compare_digest(expected,s): return {"valid":False,"reason":"signature"}
        header=json.loads(base64.urlsafe_b64decode(h+"===")); payload=json.loads(base64.urlsafe_b64decode(p+"==="))
        t=int(time.time() if now is None else now)
        if header.get("alg")!="HS256" or payload["nbf"]>t or payload["exp"]<=t: return {"valid":False,"reason":"time_or_algorithm"}
        if required_scope and required_scope not in payload.get("scope",[]): return {"valid":False,"reason":"scope"}
        return {"valid":True,"payload":payload}
    except Exception: return {"valid":False,"reason":"malformed"}
