"""Security primitives for local development and deployment adapters."""
import hashlib,hmac,secrets,time
def hash_password(password,salt=None):
    if not isinstance(password,str) or len(password)<12: raise ValueError("Password must be at least 12 characters")
    salt=salt or secrets.token_bytes(16)
    digest=hashlib.pbkdf2_hmac("sha256",password.encode(),salt,310000)
    return {"salt":salt.hex(),"digest":digest.hex(),"iterations":310000}
def verify_password(password,record):
    try: got=hashlib.pbkdf2_hmac("sha256",password.encode(),bytes.fromhex(record["salt"]),int(record["iterations"])).hex()
    except Exception: return False
    return hmac.compare_digest(got,record["digest"])
def issue_dev_token(subject,secret,ttl=900):
    if len(secret)<32: raise ValueError("Token secret must be at least 32 bytes")
    payload=f"{subject}|{int(time.time())+ttl}"
    sig=hmac.new(secret.encode(),payload.encode(),hashlib.sha256).hexdigest()
    return payload+"|"+sig
def verify_dev_token(token,secret):
    try:
        subject,exp,sig=token.rsplit("|",2); payload=f"{subject}|{exp}"
        expected=hmac.new(secret.encode(),payload.encode(),hashlib.sha256).hexdigest()
        return int(exp)>=int(time.time()) and hmac.compare_digest(sig,expected)
    except Exception: return False
