"""Optional local TF-IDF-like lexical vector index; no external model dependency."""
import math, re
class LocalSemanticIndex:
    def __init__(self): self.documents={}
    def _terms(self,text):
        return [t for t in re.findall(r"[a-z0-9_]+",text.lower()) if len(t)>1]
    def add(self,doc_id,text,metadata=None):
        if not doc_id or not isinstance(text,str) or len(text)>10000: raise ValueError("invalid document")
        self.documents[doc_id]={"text":text,"metadata":metadata or {},"terms":self._terms(text)}
    def search(self,query,limit=10):
        if not 1<=limit<=100: raise ValueError("limit outside 1..100")
        q=set(self._terms(query)); ranked=[]
        for did,d in self.documents.items():
            terms=d["terms"]; vocab=set(terms); overlap=len(q&vocab)
            score=overlap/(math.sqrt(max(1,len(q))*max(1,len(vocab))))
            if score: ranked.append((score,did,d))
        ranked.sort(key=lambda x:(-x[0],x[1]))
        return [{"id":i,"score":round(s,5),"text":d["text"],"metadata":d["metadata"]} for s,i,d in ranked[:limit]]
