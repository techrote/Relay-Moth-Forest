#!/usr/bin/env python3
from __future__ import annotations
import json, math, random
from pathlib import Path
from collections import deque
ROOT=Path(__file__).resolve().parent.parent
MAP=ROOT/'relay_moth_maps.json'; STORY=ROOT/'relay_moth_story.json'; ATLAS=ROOT/'hd_remake_atlas.json'
GW,GH=40,19

def lerp(a,b,t):return a+(b-a)*t
def door_tile(side,f,inset=1):
    xx=round(lerp(2,GW-3,max(0,min(1,f or .5)))); yy=round(lerp(1,GH-2,max(0,min(1,f or .5))))
    if side=='WEST':return(inset,yy)
    if side=='EAST':return(GW-1-inset,yy)
    if side=='NORTH':return(xx,inset)
    if side=='SOUTH':return(xx,GH-1-inset)
    return None

def dilate(cells,r=1):
    out=set(cells)
    for x,y in list(cells):
        for dy in range(-r,r+1):
            for dx in range(-r,r+1):
                if abs(dx)+abs(dy)<=r+1 and 0<=x+dx<GW and 0<=y+dy<GH:out.add((x+dx,y+dy))
    return out

def bfs(walls,water,start,target,bridge_open=set()):
    def ok(p):
        x,y=p
        return 0<x<GW-1 and 0<y<GH-1 and p not in walls and (p not in water or p in bridge_open)
    if not ok(start) or not ok(target):return False
    q=deque([start]);seen={start}
    while q:
        p=q.popleft()
        if p==target:return True
        x,y=p
        for n in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if n not in seen and ok(n):seen.add(n);q.append(n)
    return False

def nearest_open(walls,water,p):
    if p not in walls and p not in water and 0<p[0]<GW-1 and 0<p[1]<GH-1:return p
    q=deque([p]);seen={p}
    while q:
        x,y=q.popleft()
        for n in ((x+1,y),(x-1,y),(x,y+1),(x,y-1)):
            if n in seen or not (0<n[0]<GW-1 and 0<n[1]<GH-1):continue
            if n not in walls and n not in water:return n
            seen.add(n);q.append(n)
    return (2,2)

def valid_story_routes(room,spec,walls,water):
    # Conservative: all objectives and both door approach cells must be in one component.
    points=[]
    prev=door_tile(spec.get('previous_side'),spec.get('previous_fraction'),3) if spec.get('previous_side') else (round(lerp(2,GW-3,.16)),round(lerp(1,GH-2,.5)))
    points.append(nearest_open(walls,water,prev))
    for o in spec.get('objects',[]):
        t=tuple(room.get('objects',{}).get(o['object_id'],(2,2)));points.append(nearest_open(walls,water,t))
    if spec.get('next_side'):points.append(nearest_open(walls,water,door_tile(spec['next_side'],spec.get('next_fraction'),3)))
    # Tin Stream is progressive; use all bridge cells for connectivity test here.
    bridge=set(tuple(p) for p in room.get('bridge_cells',[]))|set(tuple(p) for p in room.get('bridge_island',[]))
    return all(bfs(walls,water,points[0],p,bridge) for p in points[1:])

def choose_open(rng,walls,water,protected,tries=100):
    for _ in range(tries):
        p=(rng.randrange(3,GW-3),rng.randrange(3,GH-3))
        if p not in walls and p not in water and p not in protected:return p
    return None

def main():
    maps=json.loads(MAP.read_text()); story=json.loads(STORY.read_text()); atlas=json.loads(ATLAS.read_text())
    tree_names=atlas['roles'].get('tree_blockers',[]); new_t=[n for n in tree_names if n.startswith('tree_v391_')] or tree_names
    foliage=[n for n in atlas['roles'].get('foliage_v391',[])]; blocker_f=[n for n in atlas['roles'].get('blocker_variants',[]) if 'foliage' in n]
    blocker_r=[n for n in atlas['roles'].get('blocker_variants',[]) if 'rock' in n or 'mixed' in n]
    variants=blocker_f+foliage+blocker_r
    specs={r['key']:r for r in story['rooms']}
    creature_kinds=['squirrel','rabbit','cat','pixie','gnome']
    mini_variants=['teal','pink','orange','lilac','mint','silver','charcoal','sky']

    for ri,(key,room) in enumerate(maps['rooms'].items()):
        spec=specs[key];rng=random.Random(39100+ri*877)
        walls=set(map(tuple,room.get('walls',[])));water=set(map(tuple,room.get('water',[])))
        protected=set(map(tuple,room.get('path_cells',[])))|set(map(tuple,room.get('objects',{}).values()))|set(map(tuple,room.get('bridge_cells',[])))|set(map(tuple,room.get('bridge_island',[])))
        protected|=set(tuple(x['tile']) for x in room.get('moth_pickups',[]))
        # Door corridors through second edge ring.
        gaps=set()
        for side,f in ((spec.get('previous_side'),spec.get('previous_fraction')),(spec.get('next_side'),spec.get('next_fraction'))):
            if side:
                for inset in (1,2,3):
                    t=door_tile(side,f,inset)
                    for dy in range(-1,2):
                        for dx in range(-1,2):gaps.add((t[0]+dx,t[1]+dy))
        protected=dilate(protected|gaps,1)

        # Two-sprite-deep forest boundary: outer hard border is implicit in Room;
        # this inner ring is explicit sprite-backed collision, with broad openings at gates.
        inner=set()
        for x in range(1,GW-1):inner.add((x,1));inner.add((x,GH-2))
        for y in range(1,GH-1):inner.add((1,y));inner.add((GW-2,y))
        inner={p for p in inner if p not in gaps}
        walls |= inner

        # Add irregular blocker clumps only away from authored paths. Each addition is
        # transactionally tested so organicizing the room can never cut story routes.
        target_add=18+ri*2
        added=0
        for attempt in range(120):
            if added>=target_add:break
            c=choose_open(rng,walls,water,protected)
            if not c:break
            blob=set();radius=rng.choice([1,1,2])
            for dy in range(-radius,radius+1):
                for dx in range(-radius,radius+1):
                    if dx*dx+dy*dy <= radius*radius+rng.random()*1.5:
                        p=(c[0]+dx,c[1]+dy)
                        if 1<=p[0]<GW-1 and 1<=p[1]<GH-1 and p not in protected and p not in water:blob.add(p)
            trial=walls|blob
            if valid_story_routes(room,spec,trial,water):walls=trial;added+=len(blob)

        # Remove a few square-ish interior wall cells when their removal increases irregularity.
        for p in list(walls):
            x,y=p
            if p in inner or p in protected or not (2<x<GW-3 and 2<y<GH-3):continue
            ns=sum(((x+dx,y+dy) in walls) for dx,dy in ((1,0),(-1,0),(0,1),(0,-1)))
            if ns>=3 and rng.random()<.16:walls.remove(p)

        # Blocker styles. Outer inner-ring is mostly trees / dense foliage.
        styles={}
        large=[]
        existing_tree_tiles={tuple(t['tile']) for t in room.get('large_trees',[])}
        for x,y in sorted(walls):
            seed=(x*73856093^y*19349663^ri*83492791)&0xffffffff
            edge=(x in (1,GW-2) or y in (1,GH-2))
            tree=(edge and seed%5 in (0,1)) or ((x,y) in existing_tree_tiles) or (not edge and seed%47==0)
            if tree and new_t:
                spr=new_t[seed%len(new_t)];styles[f'{x},{y}']={'sprite':spr,'kind':'tree','lut':'blockers','scale':1.0,'canopy':True};large.append({'tile':[x,y],'sprite':spr})
            else:
                if edge and foliage and seed%4!=0:spr=foliage[seed%len(foliage)]
                elif variants:spr=variants[seed%len(variants)]
                else:spr='blocker_foliage_00'
                styles[f'{x},{y}']={'sprite':spr,'kind':'blocker','lut':'blockers','scale':1.0}
        # Include existing large trees that still coincide with walls, with new art substitution.
        for i,t in enumerate(room.get('large_trees',[])):
            p=tuple(t['tile'])
            if p in walls:
                spr=new_t[(i+ri)%len(new_t)] if new_t else t['sprite'];styles[f'{p[0]},{p[1]}']={'sprite':spr,'kind':'tree','lut':'blockers','scale':1.0,'canopy':True}
                if not any(tuple(q['tile'])==p for q in large):large.append({'tile':list(p),'sprite':spr})

        # creature groups on reachable floor, biased toward paths/objective areas but never blocking.
        creature_groups=[]
        open_candidates=[tuple(p) for p in room.get('path_cells',[]) if tuple(p) not in walls and tuple(p) not in water]
        if not open_candidates:open_candidates=[(x,y) for y in range(2,GH-2) for x in range(2,GW-2) if (x,y) not in walls and (x,y) not in water]
        for gi in range(3 if ri<5 else 4):
            p=rng.choice(open_candidates);kind=creature_kinds[(ri+gi*2)%len(creature_kinds)]
            creature_groups.append({'id':f'{key}_wild_{gi}','kind':kind,'count':1+(1 if kind in ('pixie','rabbit') and gi%2==0 else 0),'spawn':list(p),'seed':39100+ri*31+gi})

        # More mini robots after Pip: two or three groups per room, each genuinely 2/3 members.
        mini=[]
        if ri>=3:
            group_count=2 if ri<6 else 3
            for gi in range(group_count):
                p=rng.choice(open_candidates);mini.append({'id':f'{key}_mini_v391_{gi}','count':2+(gi+ri)%2,'variant':mini_variants[(ri*2+gi)%len(mini_variants)],'spawn':list(p),'seed':49100+ri*37+gi,'requires':'pip'})

        # Keep live foreground canopy load bounded: retain interior/authored trees and
        # evenly sample the perimeter, converting excess edge trees back to foliage.
        if len(large)>18:
            interior=[t for t in large if t['tile'][0] not in (1,GW-2) and t['tile'][1] not in (1,GH-2)]
            edge=[t for t in large if t not in interior]
            want=max(0,18-len(interior)); edge=sorted(edge,key=lambda t:(t['tile'][1],t['tile'][0]))
            idxs=sorted(set(round(i*(len(edge)-1)/max(1,want-1)) for i in range(want))) if want and edge else []
            keep=interior+[edge[i] for i in idxs[:want]]; keep_tiles={tuple(t['tile']) for t in keep}
            for t in large:
                p=tuple(t['tile'])
                if p in keep_tiles: continue
                seed=(p[0]*73856093^p[1]*19349663^ri*83492791)&0xffffffff
                spr=foliage[seed%len(foliage)] if foliage else variants[seed%len(variants)]
                styles[f'{p[0]},{p[1]}']={'sprite':spr,'kind':'blocker','lut':'blockers','scale':1.0}
            large=keep

        room['walls']=[list(p) for p in sorted(walls)];room['blocker_styles']=styles;room['large_trees']=large
        room['mini_robots']=[] # explicitly retire old decorative robot-part placements
        room['mini_robot_groups']=mini;room['creature_groups']=creature_groups
        room['floor_microtile']=4;room['foliage_density']=round(max(1.55,float(room.get('foliage_density',1))*1.28),2)
        room['outer_border_depth']=2;room['organic_v391']=True
        if not valid_story_routes(room,spec,walls,water):raise SystemExit(f'route failure after remix: {key}')
        print(key,'walls',len(walls),'trees',len(large),'mini',sum(g['count'] for g in mini),'creatures',sum(g['count'] for g in creature_groups))

    maps['schema']='relay-moth-maps/v3.99';MAP.write_text(json.dumps(maps,indent=2)+'\n')

if __name__=='__main__':main()
