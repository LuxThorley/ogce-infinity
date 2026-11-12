"""Panda3D spherical planet preview from the v5.2 procedural generator."""
def preview_planet(name="Sovereign Planet",seed=52,rings=48,sectors=96):
    try:
        from direct.showbase.ShowBase import ShowBase
        from panda3d.core import (Geom,GeomNode,GeomVertexData,GeomVertexFormat,GeomVertexWriter,
            GeomTriangles,AmbientLight,DirectionalLight,Vec4,TextNode)
        from direct.gui.OnscreenText import OnscreenText
    except ImportError as e: raise SystemExit("Install Panda3D: pip install -e '.[render]'") from e
    from .planet import generate_planet
    p=generate_planet(name,seed,rings,sectors); radius=p["radius"]; elev=p["elevation"]
    class App(ShowBase):
        def __init__(self):
            super().__init__(); self.disableMouse(); self.setBackgroundColor(.006,.012,.04,1)
            fmt=GeomVertexFormat.getV3n3c4(); data=GeomVertexData("planet",fmt,Geom.UHStatic); data.setNumRows((rings+1)*sectors)
            vw=GeomVertexWriter(data,"vertex"); nw=GeomVertexWriter(data,"normal"); cw=GeomVertexWriter(data,"color")
            from math import sin,cos,pi
            for i in range(rings+1):
                lat=-pi/2+pi*i/rings
                for j in range(sectors):
                    lon=2*pi*j/sectors; rr=radius+elev[i][j]
                    x=rr*cos(lat)*cos(lon); y=rr*cos(lat)*sin(lon); z=rr*sin(lat)
                    vw.addData3(x,y,z); nw.addData3(x/radius,y/radius,z/radius)
                    biome=p["biomes"][i][j]
                    colors={"ocean":(.04,.18,.48,1),"ice":(.72,.84,.94,1),"desert":(.72,.52,.25,1),"forest":(.08,.34,.16,1),"jungle":(.08,.48,.22,1),"volcanic":(.36,.16,.12,1),"tundra":(.38,.52,.52,1),"grassland":(.32,.48,.2,1)}
                    cw.addData4(*colors[biome])
            tri=GeomTriangles(Geom.UHStatic)
            for i in range(rings):
                for j in range(sectors):
                    a=i*sectors+j; b=i*sectors+(j+1)%sectors; c=(i+1)*sectors+j; d=(i+1)*sectors+(j+1)%sectors
                    tri.addVertices(a,c,b); tri.addVertices(b,c,d)
            geom=Geom(data); geom.addPrimitive(tri); node=GeomNode("planet"); node.addGeom(geom); self.render.attachNewNode(node)
            amb=AmbientLight("ambient"); amb.setColor(Vec4(.35,.38,.48,1)); self.render.setLight(self.render.attachNewNode(amb))
            sun=DirectionalLight("sun"); sun.setColor(Vec4(1,.91,.78,1)); sn=self.render.attachNewNode(sun); sn.setHpr(-35,-45,0); self.render.setLight(sn)
            self.camera.setPos(0,-radius*3,radius*1.25); self.camera.lookAt(0,0,0)
            OnscreenText(text=f"OGCE v5.2 | {name} | seed={seed}",pos=(-1.28,.92),scale=.045,fg=(.9,.9,.8,1),align=TextNode.ALeft)
            self.accept("escape",self.userExit)
    App().run()
