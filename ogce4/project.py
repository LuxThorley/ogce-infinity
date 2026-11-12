import json
from pathlib import Path
DEFAULT={"name":"Infinity Realm","environment":{"background":[0.025,0.035,0.075]},
"entities":[
{"id":"sun","name":"Sun Core","kind":"sphere","position":[0,0,2],"scale":[1.2,1.2,1.2],"color":[1,.62,.18]},
{"id":"anchor","name":"World Anchor","kind":"box","position":[3,0,.7],"scale":[1.2,1.2,1.2],"color":[.22,.55,.95]},
{"id":"relic","name":"Moon Relic","kind":"sphere","position":[-3,0,1],"scale":[.8,.8,.8],"color":[.65,.82,1]}]}
def create_project(path:Path,name:str):
    path.mkdir(parents=True,exist_ok=True)
    for d in ("scenes","assets",".ogce"): (path/d).mkdir(exist_ok=True)
    (path/"project.ogce.json").write_text(json.dumps({"name":name,"engine_version":"4.0.0","startup_scene":"scenes/main.scene.json"},indent=2))
    (path/"scenes/main.scene.json").write_text(json.dumps(DEFAULT,indent=2))
    (path/".ogce/assets.json").write_text("[]")
    return path
def load_scene(project:Path):
    data=json.loads((project/"scenes/main.scene.json").read_text())
    if not isinstance(data.get("entities"),list): raise ValueError("entities must be a list")
    return data
def save_scene(project:Path,scene:dict):
    (project/"scenes/main.scene.json").write_text(json.dumps(scene,indent=2))
