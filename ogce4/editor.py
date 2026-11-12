import subprocess,sys
from pathlib import Path
import tkinter as tk
from tkinter import ttk,messagebox
from ogce4.project import load_scene,save_scene
class Editor:
    def __init__(self,project):
        self.project=Path(project).resolve(); self.scene=load_scene(self.project); self.selected=None
        self.root=tk.Tk(); self.root.title("OGCE Infinity Editor — "+self.scene.get("name","Scene")); self.root.geometry("1100x700")
        self.build(); self.refresh()
    def build(self):
        bar=ttk.Frame(self.root,padding=6); bar.pack(fill="x")
        for label,cmd in [("Save",self.save),("Add Box",lambda:self.add("box")),("Add Sphere",lambda:self.add("sphere")),("Delete",self.delete),("Run 3D Preview",self.preview)]:
            ttk.Button(bar,text=label,command=cmd).pack(side="left",padx=3)
        panes=ttk.Panedwindow(self.root,orient="horizontal"); panes.pack(fill="both",expand=True,padx=8,pady=8)
        left=ttk.Frame(panes,padding=5); mid=ttk.Frame(panes,padding=5); right=ttk.Frame(panes,padding=5)
        panes.add(left,weight=1); panes.add(mid,weight=3); panes.add(right,weight=2)
        ttk.Label(left,text="SCENE HIERARCHY").pack(anchor="w")
        self.tree=ttk.Treeview(left,columns=("kind",),show="tree headings"); self.tree.heading("#0",text="Entity"); self.tree.heading("kind",text="Type")
        self.tree.pack(fill="both",expand=True); self.tree.bind("<<TreeviewSelect>>",self.select)
        ttk.Label(mid,text="TOP-DOWN SCENE OVERVIEW").pack(anchor="w")
        self.canvas=tk.Canvas(mid,bg="#10182a",highlightthickness=0); self.canvas.pack(fill="both",expand=True)
        self.canvas.bind("<Configure>",lambda e:self.draw())
        ttk.Label(right,text="INSPECTOR").pack(anchor="w"); self.fields={}
        for key in ("name","kind","x","y","z","sx","sy","sz","r","g","b"):
            row=ttk.Frame(right); row.pack(fill="x",pady=3); ttk.Label(row,text=key.upper(),width=6).pack(side="left")
            ent=ttk.Entry(row); ent.pack(side="left",fill="x",expand=True); self.fields[key]=ent
        ttk.Button(right,text="Apply Changes",command=self.apply).pack(fill="x",pady=8)
        self.status=tk.StringVar(value="Ready"); ttk.Label(self.root,textvariable=self.status,relief="sunken").pack(fill="x")
    def refresh(self):
        self.tree.delete(*self.tree.get_children())
        for e in self.scene["entities"]: self.tree.insert("","end",iid=e["id"],text=e["name"],values=(e["kind"],))
        self.draw()
    def draw(self):
        if not hasattr(self,"canvas"): return
        c=self.canvas;c.delete("all");w=max(1,c.winfo_width());h=max(1,c.winfo_height())
        c.create_text(15,15,text="Scene XY projection • edit precise transforms in Inspector",fill="#d7e7ff",anchor="nw")
        c.create_line(w/2,40,w/2,h-20,fill="#263c5c");c.create_line(20,h/2,w-20,h/2,fill="#263c5c")
        for e in self.scene["entities"]:
            p=e["position"];x=w/2+p[0]*35;y=h/2-p[1]*35;r=max(8,min(26,e["scale"][0]*14))
            col="#"+"".join(f"{int(max(0,min(1,v))*255):02x}" for v in e["color"])
            c.create_oval(x-r,y-r,x+r,y+r,fill=col,outline="#e6f0ff",width=2)
            c.create_text(x,y+r+12,text=e["name"],fill="#e5edff")
    def select(self,_=None):
        sel=self.tree.selection()
        if not sel:return
        self.selected=sel[0];e=next(x for x in self.scene["entities"] if x["id"]==self.selected)
        vals={"name":e["name"],"kind":e["kind"],"x":e["position"][0],"y":e["position"][1],"z":e["position"][2],
        "sx":e["scale"][0],"sy":e["scale"][1],"sz":e["scale"][2],"r":e["color"][0],"g":e["color"][1],"b":e["color"][2]}
        for k,v in vals.items(): self.fields[k].delete(0,"end");self.fields[k].insert(0,str(v))
    def apply(self):
        if not self.selected:return
        e=next(x for x in self.scene["entities"] if x["id"]==self.selected)
        try:
            e["name"]=self.fields["name"].get();kind=self.fields["kind"].get().lower()
            if kind not in ("box","sphere"): raise ValueError("Type must be box or sphere")
            e["kind"]=kind;e["position"]=[float(self.fields[k].get()) for k in ("x","y","z")]
            e["scale"]=[max(.05,float(self.fields[k].get())) for k in ("sx","sy","sz")]
            e["color"]=[max(0,min(1,float(self.fields[k].get()))) for k in ("r","g","b")]
            self.refresh();self.tree.selection_set(self.selected);self.status.set("Applied; save to persist.")
        except ValueError as ex: messagebox.showerror("Invalid property",str(ex))
    def add(self,kind):
        i=len(self.scene["entities"])+1;eid=f"{kind}_{i}"
        self.scene["entities"].append({"id":eid,"name":f"{kind.title()} {i}","kind":kind,"position":[i*1.5,0,.6],
                                       "scale":[.8,.8,.8],"color":[.35,.72,.9]})
        self.refresh();self.tree.selection_set(eid);self.select()
    def delete(self):
        if not self.selected:return
        self.scene["entities"]=[e for e in self.scene["entities"] if e["id"]!=self.selected];self.selected=None;self.refresh()
    def save(self):
        save_scene(self.project,self.scene);self.status.set("Scene saved.")
    def preview(self):
        self.save();subprocess.Popen([sys.executable,"-m","ogce4.cli","preview","--project",str(self.project)])
    def run(self): self.root.mainloop()
def launch_editor(project): Editor(project).run()
