"""Secure, configurable Malcolm OmniAPI adapter.

Credentials are read only from environment variables. The supplied endpoint is a
base URL; routes can be overridden to match the provider's actual API contract.
"""
import json, os, urllib.request, urllib.error, urllib.parse, ssl
from dataclasses import dataclass

class MalcolmAPIError(RuntimeError): pass
class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl): return None

@dataclass
class MalcolmConfig:
    base_url: str = "https://malcolmai-live.oliverluxthorley.workers.dev"
    token: str = ""
    timeout: float = 20.0
    max_response_bytes: int = 1_000_000
    command_path: str = "/omni/command"
    health_path: str = "/healthz"
    stream_path: str = "/infinity/stream"
    optimize_path: str = "/optimize"
    @classmethod
    def from_env(cls):
        return cls(base_url=os.getenv("MALCOLM_OMNI_API_URL","https://malcolmai-live.oliverluxthorley.workers.dev").rstrip("/"),
                   token=os.getenv("MALCOLM_OMNI_API_TOKEN",""),
                   timeout=float(os.getenv("MALCOLM_OMNI_API_TIMEOUT","20")),
                   command_path=os.getenv("MALCOLM_OMNI_COMMAND_PATH","/omni/command"),
                   health_path=os.getenv("MALCOLM_OMNI_HEALTH_PATH","/healthz"),
                   stream_path=os.getenv("MALCOLM_OMNI_STREAM_PATH","/infinity/stream"),
                   optimize_path=os.getenv("MALCOLM_OMNI_OPTIMIZE_PATH","/optimize"))
    def validate(self):
        parsed=urllib.parse.urlparse(self.base_url)
        if parsed.scheme!="https" or not parsed.netloc or parsed.username or parsed.password:
            raise ValueError("Malcolm endpoint must be an HTTPS base URL without embedded credentials")
        if not 1<=self.timeout<=120 or not 1024<=self.max_response_bytes<=10_000_000: raise ValueError("unsafe API limits")
        for p in (self.command_path,self.health_path,self.stream_path,self.optimize_path):
            if not p.startswith("/") or p.startswith("//"): raise ValueError("API paths must be absolute paths on configured host")

class MalcolmOmniAPI:
    def __init__(self, config=None):
        self.config=config or MalcolmConfig.from_env(); self.config.validate()
        self.opener=urllib.request.build_opener(_NoRedirect(), urllib.request.HTTPSHandler(context=ssl.create_default_context()))
    @property
    def configured(self): return bool(self.config.token)
    def _request(self, path, payload=None, authenticated=True):
        if authenticated and not self.config.token: raise MalcolmAPIError("MALCOLM_OMNI_API_TOKEN is not configured")
        url=self.config.base_url+path
        body=None if payload is None else json.dumps(payload,separators=(",",":"),allow_nan=False).encode()
        headers={"Accept":"application/json","User-Agent":"OGCE/6.0"}
        if body is not None: headers["Content-Type"]="application/json"
        if authenticated: headers["Authorization"]="Bearer "+self.config.token
        req=urllib.request.Request(url,data=body,headers=headers,method="GET" if body is None else "POST")
        try:
            with self.opener.open(req,timeout=self.config.timeout) as resp:
                data=resp.read(self.config.max_response_bytes+1)
                if len(data)>self.config.max_response_bytes: raise MalcolmAPIError("Malcolm response exceeded configured size limit")
                content_type=resp.headers.get("Content-Type","")
                if "json" in content_type:
                    try: return json.loads(data.decode("utf-8"))
                    except Exception as e: raise MalcolmAPIError("Malcolm returned invalid JSON") from e
                return {"status":resp.status,"content_type":content_type,"body":data.decode("utf-8","replace")}
        except urllib.error.HTTPError as e:
            # Never include request headers, token, or response body in exception text.
            raise MalcolmAPIError(f"Malcolm API returned HTTP {e.code}") from None
        except urllib.error.URLError as e:
            raise MalcolmAPIError(f"Malcolm API connection failed: {type(e.reason).__name__}") from None
        except TimeoutError:
            raise MalcolmAPIError("Malcolm API request timed out") from None
    def health(self):
        return self._request(self.config.health_path,authenticated=False)
    def command(self, instruction, context=None, approved=False):
        if not isinstance(instruction,str) or not instruction.strip() or len(instruction)>12000: raise ValueError("instruction must be 1..12000 characters")
        # Requests that mutate engine state require explicit approval in local caller policy.
        return self._request(self.config.command_path,{"instruction":instruction,"context":context or {},"approval_granted":bool(approved)})
    def optimize(self, target, parameters=None, approved=False):
        if not approved: raise PermissionError("optimizer operation requires explicit local approval")
        if not isinstance(target,str) or len(target)>160: raise ValueError("invalid optimization target")
        return self._request(self.config.optimize_path,{"target":target,"parameters":parameters or {},"approval_granted":True})
    def stream(self, cursor=None):
        # Deliberately a bounded polling interface, not a long-lived unbounded socket.
        payload={"cursor":cursor} if cursor is not None else {"cursor":None}
        return self._request(self.config.stream_path,payload)
