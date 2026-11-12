"""Rolling frame-time statistics and budget evaluation."""
from collections import deque
class FrameProfiler:
    def __init__(self,capacity=600):
        if capacity<10: raise ValueError("capacity must be >= 10")
        self.samples=deque(maxlen=capacity)
    def record(self,seconds):
        if seconds<0: raise ValueError("negative frame duration")
        self.samples.append(float(seconds))
    def snapshot(self):
        if not self.samples: return {"frames":0,"fps":0.0,"avg_ms":0.0,"p95_ms":0.0}
        s=sorted(self.samples); avg=sum(s)/len(s)
        return {"frames":len(s),"fps":1/avg if avg else float("inf"),"avg_ms":avg*1000,"p95_ms":s[min(len(s)-1,int((len(s)-1)*.95))]*1000}
    def within_budget(self,budget_ms=16.67):
        r=self.snapshot(); return bool(r["frames"] and r["p95_ms"]<=budget_ms)
