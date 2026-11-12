"""Panda3D runtime bridge: render seeded OGCE heightfields as triangle meshes."""
from ogce4.v5.worldgen import generate_world
def run_world_preview(name="Sovereign World",seed=144,width=48,height=48):
    try:
        from direct.showbase.ShowBase import ShowBase
        from panda3d.core import Geom,GeomNode,GeomVertexData,GeomVertexFormat,GeomVertexWriter,GeomTriangles,AmbientLight,DirectionalLight,Vec4,TextNode
        from direct.gui.OnscreenText import OnscreenText
    except ImportError as e: raise SystemExit("Install Panda3D with: pip install -e '.[render]'") from e
    world=generate_world(name,seed,width,height,poi_count=30); heights=world["terrain"]
    class App(ShowBase):
        def __init__(self):
            super().__init__(); self.disableMouse(); self.setBackgroundColor(.012,.02,.055,1)
            v=GeomVertexData("terrain",GeomVertexFormat.getV3n3c4(),Geom.UHStatic); v.setNumRows(width*height)
            vw=GeomVertexWriter(v,"vertex"); nw=GeomVertexWriter(v,"normal"); cw=GeomVertexWriter(v,"color")
            for z in range(height):
                for x in range(width):
                    h=heights[z][x]; vw.addData3(x-width/2,z-height/2,h); nw.addData3(0,0,1)
                    cw.addData4(.12+max(0,h)/35,.28+max(0,h)/45,.20+max(0,h)/55,1)
            tris=GeomTriangles(Geom.UHStatic)
            for z in range(height-1):
                for x in range(width-1):
                    a=z*width+x; b=a+1; c=a+width; d=c+1
                    tris.addVertices(a,b,c); tris.addVertices(b,d,c)
            g=Geom(v); g.addPrimitive(tris); node=GeomNode("generated-heightfield"); node.addGeom(g)
            self.render.attachNewNode(node)
            amb=AmbientLight("ambient"); amb.setColor(Vec4(.4,.4,.48,1)); self.render.setLight(self.render.attachNewNode(amb))
            sun=DirectionalLight("sun"); sun.setColor(Vec4(1,.91,.75,1)); sn=self.render.attachNewNode(sun); sn.setHpr(-40,-55,0); self.render.setLight(sn)
            self.camera.setPos(0,-height*1.3,height*.95); self.camera.lookAt(0,0,0)
            OnscreenText(text=f"OGCE v5.1 | {name} | seed={seed}",pos=(-1.28,.92),scale=.045,fg=(.9,.88,.72,1),align=TextNode.ALeft)
            OnscreenText(text="WASD/QE move | ESC exit",pos=(-1.28,-.94),scale=.035,fg=(.8,.85,.95,1),align=TextNode.ALeft)
            self.accept("escape",self.userExit)
            for k in "wasdqe": self.accept(k,self.move,[k])
        def move(self,k):
            from panda3d.core import Vec3
            delta={"w":(0,2,0),"s":(0,-2,0),"a":(-2,0,0),"d":(2,0,0),"q":(0,0,-2),"e":(0,0,2)}[k]; self.camera.setPos(self.camera,Vec3(*delta))
    App().run()
