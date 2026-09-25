from __future__ import annotations
import json, math
from pathlib import Path
ROOT=Path(__file__).resolve().parents[2]
maps=json.loads((ROOT/'relay_moth_maps.json').read_text())
W,H,TILE,GRID_W,GRID_H,PLAY_H=640,360,16,40,19,304
R=2.40; INSET=4.10

def clamp(v,a,b): return max(a,min(b,v))
class Room:
    def __init__(self,r):
        self.walls={tuple(p) for p in r.get('walls',[])}; self.water={tuple(p) for p in r.get('water',[])}
        self.styles={tuple(map(int,k.split(','))):v for k,v in r.get('blocker_styles',{}).items()}
        self.border={(x,0) for x in range(GRID_W)}|{(x,GRID_H-1) for x in range(GRID_W)}|{(0,y) for y in range(GRID_H)}|{(GRID_W-1,y) for y in range(GRID_H)}
    def blocked(self,t): return t in self.border or t in self.walls or t in self.water
    def rect(self,tx,ty):
        k=(tx,ty)
        if not self.blocked(k): return None
        if k in self.border or k in self.water: return (tx*TILE,ty*TILE,(tx+1)*TILE,(ty+1)*TILE)
        inset=2.65 if self.styles.get(k,{}).get('kind')=='tree' else INSET
        def solid(x,y): return x<0 or y<0 or x>=GRID_W or y>=GRID_H or self.blocked((x,y))
        return (tx*TILE+(0 if solid(tx-1,ty) else inset),ty*TILE+(0 if solid(tx,ty-1) else inset),(tx+1)*TILE-(0 if solid(tx+1,ty) else inset),(ty+1)*TILE-(0 if solid(tx,ty+1) else inset))
    def clear(self,x,y,r=R):
        if x<TILE+r or x>W-TILE-r or y<TILE+r or y>PLAY_H-TILE-r:return False
        rr=r*r
        for ty in range(max(0,int((y-r-INSET)//TILE)-1),min(GRID_H-1,int((y+r+INSET)//TILE)+1)+1):
          for tx in range(max(0,int((x-r-INSET)//TILE)-1),min(GRID_W-1,int((x+r+INSET)//TILE)+1)+1):
            z=self.rect(tx,ty)
            if not z: continue
            l,t,rt,b=z; qx=clamp(x,l,rt); qy=clamp(y,t,b); cx=x-qx; cy=y-qy
            if cx*cx+cy*cy < rr-1e-6:return False
        return True
    def move_player(self,x,y,dx,dy,r=R):
        if math.hypot(dx,dy)<1e-7:return x,y
        step_max=.42;steps=max(1,math.ceil(max(abs(dx),abs(dy))/step_max));sx=dx/steps;sy=dy/steps
        px,py=x,y;x_first=abs(dx)>=abs(dy)
        for _ in range(steps):
            nx,ny=px+sx,py+sy
            if self.clear(nx,ny,r): px,py=nx,ny;continue
            if x_first:
                if abs(sx)>1e-9 and self.clear(px+sx,py,r): px+=sx
                if abs(sy)>1e-9 and self.clear(px,py+sy,r): py+=sy
            else:
                if abs(sy)>1e-9 and self.clear(px,py+sy,r): py+=sy
                if abs(sx)>1e-9 and self.clear(px+sx,py,r): px+=sx
        return px,py

STEP=1.2
D=STEP/math.sqrt(2)
directions=[(STEP,0),(-STEP,0),(0,STEP),(0,-STEP),(D,D),(D,-D),(-D,D),(-D,-D)]
cases=0;free_diag=0;diag_success=0;max_step=0;bad=[]
for name,r in maps['rooms'].items():
    room=Room(r)
    for cell in r.get('path_cells',[]):
        cx,cy=cell[0]*16+8,cell[1]*16+8
        for ox,oy in [(-4,0),(-2,0),(0,0),(2,0),(4,0),(0,-4),(0,4)]:
            sx,sy=cx+ox,cy+oy
            if not room.clear(sx,sy): continue
            for dx,dy in directions:
                x,y=room.move_player(sx,sy,dx,dy)
                step=math.hypot(x-sx,y-sy);max_step=max(max_step,step);cases+=1
                if step>STEP+1e-5: bad.append((name,'jump',(sx,sy),(dx,dy),(x,y),step))
                if dx and dy and room.clear(sx+dx,sy+dy):
                    free_diag+=1
                    if abs(x-sx)>.5*abs(dx) and abs(y-sy)>.5*abs(dy): diag_success+=1
                    else: bad.append((name,'free diagonal lost',(sx,sy),(dx,dy),(x,y)))
assert not bad, bad[:12]
assert free_diag and diag_success==free_diag,(free_diag,diag_success)
print('Relay Moth Forest 3.97 — direct movement regression')
print('PASS')
print('movement cases:',cases)
print('free diagonal cases:',free_diag)
print('free diagonals preserving both axes:',diag_success)
print('maximum single-step displacement:',round(max_step,6),'logical px')
print('mouse world-control: disabled by design')
print('per-frame player recovery snap: removed from gameplay update')
