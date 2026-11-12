import json
from pathlib import Path
def run_preview(project_dir:Path):
    try:
        from direct.showbase.ShowBase import ShowBase
        from direct.gui.OnscreenText import OnscreenText
        from panda3d.core import AmbientLight,DirectionalLight,Vec4,Vec3,TextNode
    except ImportError as e:
        raise SystemExit("Install Panda3D: pip install -e '.[render]'") from e
    scene=json.loads((project_dir/"scenes/main.scene.json").read_text())
    class Preview(ShowBase):
        def __init__(self):
            super().__init__(); self.disableMouse()
            bg=scene.get("environment",{}).get("background",[.025,.035,.075])
            self.setBackgroundColor(*bg,1)
            self.distance=16; self.heading=0; self.pitch=-18; self.drag=False; self.last=None
            amb=AmbientLight("ambient"); amb.setColor(Vec4(.34,.34,.42,1))
            self.render.setLight(self.render.attachNewNode(amb))
            sun=DirectionalLight("key"); sun.setColor(Vec4(1,.94,.82,1))
            sn=self.render.attachNewNode(sun); sn.setHpr(-35,-55,0); self.render.setLight(sn)
            root=self.render.attachNewNode("OGCE-world")
            for e in scene.get("entities",[]):
                model=self.loader.loadModel("models/misc/sphere" if e.get("kind")=="sphere" else "models/box")
                model.reparentTo(root); model.setName(e.get("name","Entity"))
                model.setPos(*e.get("position",[0,0,0])); model.setScale(*e.get("scale",[1,1,1]))
                model.setColor(*e.get("color",[.7,.75,.9]),1)
            floor=self.loader.loadModel("models/misc/rgbCube"); floor.reparentTo(root)
            floor.setPos(0,0,-.15); floor.setScale(9,9,.08); floor.setColor(.1,.14,.22,1)
            OnscreenText(text="OGCE INFINITY | "+scene.get("name","Scene"),pos=(-1.28,.92),scale=.045,
                         fg=(.8,.9,1,1),align=TextNode.ALeft)
            OnscreenText(text="WASD move | drag orbit | wheel zoom | ESC exit",pos=(-1.28,-.94),
                         scale=.035,fg=(.75,.82,.95,1),align=TextNode.ALeft)
            self.accept("escape",self.userExit)
            for k in "wasdqe": self.accept(k,self.move,[k])
            self.accept("wheel_up",self.zoom,[-1]); self.accept("wheel_down",self.zoom,[1])
            self.accept("mouse1",self.start_drag); self.accept("mouse1-up",self.stop_drag)
            self.taskMgr.add(self.update_camera,"camera")
        def move(self,k):
            v={"w":(0,1,0),"s":(0,-1,0),"a":(-1,0,0),"d":(1,0,0),"q":(0,0,-1),"e":(0,0,1)}[k]
            self.camera.setPos(self.camera,Vec3(*v)*.8)
        def zoom(self,d): self.distance=max(3.5,min(50,self.distance+d))
        def start_drag(self):
            self.drag=True; self.last=self.mouseWatcherNode.getMouse() if self.mouseWatcherNode.hasMouse() else None
        def stop_drag(self): self.drag=False; self.last=None
        def update_camera(self,task):
            from math import radians,sin,cos
            if self.drag and self.mouseWatcherNode.hasMouse():
                m=self.mouseWatcherNode.getMouse()
                if self.last is not None:
                    delta=m-self.last; self.heading-=delta.x*110
                    self.pitch=max(-80,min(20,self.pitch+delta.y*90))
                self.last=m
            h,p=radians(self.heading),radians(self.pitch)
            self.camera.setPos(self.distance*sin(h)*cos(p),-self.distance*cos(h)*cos(p),self.distance*sin(p)+2)
            self.camera.lookAt(0,0,.8); return task.cont
    Preview().run()
