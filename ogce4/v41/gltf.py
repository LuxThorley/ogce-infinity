"""Safe glTF 2.0 JSON inspection and local-buffer validation; no remote fetching."""
import json
from pathlib import Path
class GLTFError(ValueError): pass
def inspect_gltf(path):
    p=Path(path).resolve()
    try: doc=json.loads(p.read_text(encoding="utf-8"))
    except Exception as e: raise GLTFError(f"Cannot parse glTF JSON: {e}") from e
    if doc.get("asset",{}).get("version")!="2.0": raise GLTFError("Only glTF 2.0 is supported")
    root=p.parent
    for i,b in enumerate(doc.get("buffers",[])):
        uri=b.get("uri","")
        if uri.startswith(("http:","https:")): raise GLTFError("Remote buffer URIs are disabled")
        if uri.startswith("data:"): continue
        if uri:
            q=(root/uri).resolve()
            if not q.is_relative_to(root): raise GLTFError("Buffer path escapes asset directory")
            if not q.is_file(): raise GLTFError(f"Missing buffer {uri}")
            if q.stat().st_size < int(b.get("byteLength",0)): raise GLTFError(f"Buffer {uri} shorter than byteLength")
    for i,v in enumerate(doc.get("bufferViews",[])):
        if not 0 <= int(v.get("buffer",-1)) < len(doc.get("buffers",[])): raise GLTFError(f"bufferView {i} references missing buffer")
    return {"version":"2.0","scenes":len(doc.get("scenes",[])),"nodes":len(doc.get("nodes",[])),
            "meshes":len(doc.get("meshes",[])),"materials":len(doc.get("materials",[])),
            "textures":len(doc.get("textures",[])),"buffers":len(doc.get("buffers",[]))}
