"""Asset manifest path, dependency and license checks."""
from pathlib import Path
def validate_manifest(project_root, manifest):
    root=Path(project_root).resolve(); errors=[]; assets=manifest.get("assets",[])
    ids=[a.get("id") for a in assets]
    if len(ids)!=len(set(ids)): errors.append("Duplicate asset IDs")
    known=set(ids)
    for a in assets:
        aid=a.get("id","<missing-id>"); rel=a.get("path","")
        if not rel: errors.append(f"{aid}: missing path"); continue
        path=(root/rel).resolve()
        if not path.is_relative_to(root): errors.append(f"{aid}: path escapes project"); continue
        if not path.is_file(): errors.append(f"{aid}: file not found: {rel}")
        if not a.get("license"): errors.append(f"{aid}: missing license metadata")
        for dep in a.get("depends_on",[]):
            if dep not in known: errors.append(f"{aid}: unknown dependency {dep}")
    return {"valid":not errors,"asset_count":len(assets),"errors":errors}
