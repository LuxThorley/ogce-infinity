"""Provider-neutral, opt-in AI adapters. No provider is contacted until explicitly configured."""
from dataclasses import dataclass
import json, urllib.request, urllib.error
@dataclass
class AdapterConfig:
    name:str
    endpoint:str
    api_key:str|None=None
    timeout:float=20.0
class OpenAICompatibleAdapter:
    def __init__(self,config):
        if not config.endpoint.startswith("https://") and not config.endpoint.startswith("http://127.0.0.1") and not config.endpoint.startswith("http://localhost"):
            raise ValueError("Use HTTPS, or loopback for local development")
        self.config=config
    def generate(self,prompt,model,system="You are a helpful assistant."):
        body=json.dumps({"model":model,"messages":[{"role":"system","content":system},{"role":"user","content":prompt}]}).encode()
        headers={"Content-Type":"application/json"}
        if self.config.api_key: headers["Authorization"]="Bearer "+self.config.api_key
        req=urllib.request.Request(self.config.endpoint.rstrip("/")+"/chat/completions",data=body,headers=headers,method="POST")
        with urllib.request.urlopen(req,timeout=self.config.timeout) as r: data=json.loads(r.read())
        return data["choices"][0]["message"]["content"]
