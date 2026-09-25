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
    def resolve(self,x,y,r=R):
        eps=.015;minX=TILE+r+eps;maxX=W-TILE-r-eps;minY=TILE+r+eps;maxY=PLAY_H-TILE-r-eps;x=clamp(x,minX,maxX);y=clamp(y,minY,maxY)
        for _ in range(5):
          changed=False
          for ty in range(max(0,int((y-r)//TILE)-1),min(GRID_H-1,int((y+r)//TILE)+1)+1):
            for tx in range(max(0,int((x-r)//TILE)-1),min(GRID_W-1,int((x+r)//TILE)+1)+1):
              z=self.rect(tx,ty)
              if not z:continue
              l,t,rt,b=z;qx=clamp(x,l,rt);qy=clamp(y,t,b);cx=x-qx;cy=y-qy;d2=cx*cx+cy*cy
              if d2>=r*r-1e-8:continue
              if d2>1e-10:
                d=math.sqrt(d2);push=r-d+eps;x+=cx/d*push;y+=cy/d*push
              else:
                ds=[abs(x-l),abs(rt-x),abs(y-t),abs(b-y)];m=min(ds);i=ds.index(m)
                if i==0:x=l-r-eps
                elif i==1:x=rt+r+eps
                elif i==2:y=t-r-eps
                else:y=b+r+eps
              x=clamp(x,minX,maxX);y=clamp(y,minY,maxY);changed=True
          if not changed:break
        return x,y
    def move(self,x,y,dx,dy,r=R):
        steps=max(1,math.ceil(max(abs(dx),abs(dy))/1.1));sx=dx/steps;sy=dy/steps
        for _ in range(steps):x,y=self.resolve(x+sx,y+sy,r)
        return x,y
    def move_player(self,x,y,dx,dy,r=R):
        mag=math.hypot(dx,dy)
        if mag<.0001:return x,y
        ux,uy=dx/mag,dy/mag;tx,ty=-uy,ux;c=[]
        def add(q,order):
          qx,qy=q[0]-x,q[1]-y;c.append((q,qx*ux+qy*uy,abs(qx*tx+qy*ty),order))
        add(self.move(x,y,dx,dy,r),0)
        q=self.move(x,y,dx,0,r);q=self.move(*q,0,dy,r);add(q,1)
        q=self.move(x,y,0,dy,r);q=self.move(*q,dx,0,r);add(q,2)
        if c[0][1]<mag*.62:
          assist=min(.16,mag*.18)
          for side,order in [(-1,3),(1,4)]:
            q=self.move(x,y,tx*assist*side,ty*assist*side,r);q=self.move(*q,dx,dy,r);add(q,order)
        c.sort(key=lambda z:(-(z[1]-z[2]*.42),z[2],z[3]));return c[0][0]

max_step=max_lateral=0;cases=0;bad=[]
for name,r in maps['rooms'].items():
    room=Room(r)
    # sample every clear path-cell centre plus small offsets
    for cell in r.get('path_cells',[]):
      cx,cy=cell[0]*16+8,cell[1]*16+8
      for ox,oy in [(-3,0),(3,0),(0,-3),(0,3),(0,0)]:
        sx,sy=cx+ox,cy+oy
        if not room.clear(sx,sy):continue
        for dx,dy in [(1.2,0),(-1.2,0),(0,1.2),(0,-1.2)]:
          x,y=room.move_player(sx,sy,dx,dy);step=math.hypot(x-sx,y-sy);lat=abs((y-sy) if dx else (x-sx));cases+=1;max_step=max(max_step,step);max_lateral=max(max_lateral,lat)
          if step>1.55 or lat>.42:bad.append((name,(sx,sy),(dx,dy),(x,y),step,lat))
assert not bad, bad[:10]
print('Relay Moth Forest 3.96 — keyboard jitter regression')
print('PASS')
print('cases:',cases)
print('maximum single-frame displacement:',round(max_step,4),'logical px')
print('maximum unintended lateral displacement:',round(max_lateral,4),'logical px')
print('legacy 2.75 px corner side-step: removed')
