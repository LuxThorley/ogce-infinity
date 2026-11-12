"""Platform fingerprint and explicit release smoke-check report."""
import platform,sys
def environment_report():
    return {"python":sys.version.split()[0],"os":platform.system(),"os_release":platform.release(),"machine":platform.machine()}
def evaluate_checks(checks):
    required={"import","project_io","scene_io","renderer_init","asset_validation"}
    missing=sorted(required-set(checks)); failed=sorted(k for k,v in checks.items() if v is False)
    return {"passed":not missing and not failed,"missing":missing,"failed":failed,"checks":dict(checks)}
