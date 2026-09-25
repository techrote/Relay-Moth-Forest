#!/usr/bin/env python3
import json, collections
from pathlib import Path
R=Path(__file__).resolve().parents[2]
maps=json.loads((R/'relay_moth_maps.json').read_text())
r=maps['rooms']['tin_stream']
segs=r['bridge_segments']; island={tuple(p) for p in r['bridge_island']}; cells={tuple(p) for p in r['bridge_cells']}; water={tuple(p) for p in r['water']}; walls={tuple(p) for p in r['walls']}
assert len(segs)==4 and all(len(s)==4 for s in segs)
assert all(len({y for x,y in s})==4 for s in segs)
assert {y for s in segs for x,y in s}=={8,9,10,11}
assert len(cells)==16 and len(island)==16
assert all(p in water for p in cells), 'closed bridge cells must remain authoritative water until their stage opens'
assert not island & water, 'maintenance island must remain dry/walkable'
assert r.get('bridge_visual')=='dedicated-v39952-four-row'
hd=json.loads((R/'hd_remake_atlas.json').read_text());assert hd['roles']['bridge']['deck']=='bridge_deck_tile';assert hd['roles']['bridge']['island']=='bridge_island_tile';assert hd['roles']['bridge']['complete']=='bridge_complete';assert hd['region_meta']['bridge_deck_tile'].get('material')=='wood';assert hd['region_meta']['bridge_complete'].get('material')=='wood';assert hd['regions']['bridge_complete'][2:]==[512,256]
# Reachability across the four-row crossing only after all four segments are open.
def walk(stage):
 opened={tuple(p) for s in segs[:stage] for p in s}
 def ok(p):
  x,y=p;return 0<x<39 and 0<y<18 and p not in walls and (p not in water or p in opened)
 start=(15,9);end=(24,9);q=collections.deque([start]);seen={start}
 while q:
  p=q.popleft()
  if p==end:return True
  for n in ((p[0]+1,p[1]),(p[0]-1,p[1]),(p[0],p[1]+1),(p[0],p[1]-1)):
   if n not in seen and ok(n):seen.add(n);q.append(n)
 return False
assert not walk(0);assert not walk(1);assert not walk(2);assert not walk(3);assert walk(4)
print('TIN STREAM BRIDGE REGRESSION 3.995.4 PASS')
print('  coherent completed wooden bridge + four-row crossing + staged water authority validated')
