"""Undo/redo command history for dictionary-backed scene property edits."""
class SetProperty:
    def __init__(self,target,key,value): self.target=target; self.key=key; self.value=value; self.old=None; self.existed=False
    def apply(self): self.existed=self.key in self.target; self.old=self.target.get(self.key); self.target[self.key]=self.value
    def revert(self):
        if self.existed: self.target[self.key]=self.old
        else: self.target.pop(self.key,None)
class CommandHistory:
    def __init__(self,limit=256): self.limit=limit; self.undo_stack=[]; self.redo_stack=[]
    def execute(self,c): c.apply(); self.undo_stack.append(c); self.undo_stack=self.undo_stack[-self.limit:]; self.redo_stack.clear()
    def undo(self):
        if not self.undo_stack: return False
        c=self.undo_stack.pop(); c.revert(); self.redo_stack.append(c); return True
    def redo(self):
        if not self.redo_stack: return False
        c=self.redo_stack.pop(); c.apply(); self.undo_stack.append(c); return True
