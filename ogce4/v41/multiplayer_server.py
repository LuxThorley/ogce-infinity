"""Minimal authoritative UDP session loop scaffold; deployment hardening remains required."""
import socket, json, time
class AuthoritativeUDPServer:
    def __init__(self,host="127.0.0.1",port=7777,max_packet=4096):
        self.host=host; self.port=port; self.max_packet=max_packet; self.state={"tick":0,"players":{}}
    def validate_packet(self,data):
        if len(data)>self.max_packet: return None
        try: obj=json.loads(data.decode("utf-8"))
        except Exception: return None
        if not isinstance(obj,dict) or obj.get("type") not in {"join","input","leave"}: return None
        return obj
    def serve_once(self,timeout=0.05):
        with socket.socket(socket.AF_INET,socket.SOCK_DGRAM) as s:
            s.bind((self.host,self.port)); s.settimeout(timeout)
            try: data,addr=s.recvfrom(self.max_packet+1)
            except socket.timeout: return False
            msg=self.validate_packet(data)
            if msg is None: return False
            pid=str(addr)
            if msg["type"]=="join": self.state["players"].setdefault(pid,{"x":0.0,"y":0.0,"z":0.0})
            elif msg["type"]=="leave": self.state["players"].pop(pid,None)
            elif msg["type"]=="input" and pid in self.state["players"]:
                # Server clamps inputs; never accepts client-authored world coordinates.
                axis=msg.get("axis",{})
                if isinstance(axis,dict):
                    p=self.state["players"][pid]
                    for k in ("x","y","z"):
                        v=axis.get(k,0)
                        if isinstance(v,(int,float)) and abs(v)<=1: p[k]+=float(v)*0.05
            self.state["tick"]+=1
            s.sendto(json.dumps({"tick":self.state["tick"],"players":self.state["players"]}).encode(),addr)
            return True
