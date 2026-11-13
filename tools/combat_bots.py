"""Scripted duel players used for combat balance tests and parity fixtures (deterministic)."""
from ogce4.v90 import combat as C
CB=C.CB
def bot(kind):
    def f(S):
        t=S['t'];P=S['P'];E=S['E']
        if kind=='spam_light': return ['light'] if t%4==0 else []
        if kind=='spam_heavy': return ['heavy'] if t%4==0 else []
        if kind=='turtle': return ['block_on'] if t==0 else []
        if kind=='skilled':
            spec=CB['enemies'][S['cfg']['enemy']['species']]
            acts=[]
            if E['phase']=='windup':
                left=E['dur']-E['pt']
                if E['move']['kind']=='heavy' and left==2 and P['phase'] in ('idle','recovery'): return ['dodge']
                if E['move']['kind']=='light' and left==1 and P['phase']=='idle': return ['block_on']
            if P['blocking'] and E['phase']!='windup': acts.append('block_off')
            if E['phase'] in ('stun','recovery','wait','idle') and P['phase'] in ('idle','recovery'):
                if P['focus']>=60 and S['cfg']['loadout']: acts.append('special1')
                elif P['st']>30: acts.append('heavy' if P['combo']>=2 else 'light')
            return acts
        if kind=='masher':  # light-light-heavy, blocks after
            return [['light','light','heavy','block_on','block_off','light'][(t//5)%6]] if t%5==0 else []
    return f
def play(cfg, kind):
    S=C.new_fight(cfg); f=bot(kind); log=[]
    while not S['over']:
        a=f(S); log+= [[S['t'],x] for x in a]; C.step(S,a)
    return C.summary(S), log
