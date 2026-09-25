#!/usr/bin/env python3
from __future__ import annotations
import json, math, random
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance

ROOT=Path(__file__).resolve().parent.parent
AS=ROOT/'assets'
MAN=ROOT/'hd_remake_atlas.json'
SHEET_MAN=ROOT/'sprite_sheet_manifest.json'

# ---------- common helpers ----------
def height_map(im:Image.Image)->Image.Image:
    rgba=im.convert('RGBA'); alpha=rgba.getchannel('A'); lum=rgba.convert('RGB').convert('L')
    # stronger rounded volume, broad base height and local material detail.
    # v3.99: height data is intentionally broad and low-frequency. Fine painted
    # luminance is not allowed to become noisy micro-normal detail that shimmers.
    soft=alpha.filter(ImageFilter.GaussianBlur(7.5)); core=alpha.filter(ImageFilter.GaussianBlur(2.4))
    edge=alpha.filter(ImageFilter.MaxFilter(9));
    out=Image.new('L',rgba.size,0); op=out.load(); lp=lum.load(); ap=alpha.load(); sp=soft.load(); cp=core.load(); ep=edge.load()
    w,h=rgba.size
    for y in range(h):
        for x in range(w):
            if ap[x,y]<4: continue
            # Shape gets most of the height; painted light contributes surface relief.
            v=.10*lp[x,y]+.48*sp[x,y]+.34*cp[x,y]+.08*ep[x,y]
            op[x,y]=max(0,min(255,int(v)))
    return out.filter(ImageFilter.GaussianBlur(1.35))

def pack(sprites,width=4096,pad=8):
    ordered=sorted(sprites.items(),key=lambda kv:(-kv[1].height,kv[0]))
    x=pad;y=pad;rh=0;pos={};maxy=pad
    for n,im in ordered:
        w,h=im.size
        if x+w+pad>width:x=pad;y+=rh+pad;rh=0
        pos[n]=(x,y,w,h);x+=w+pad;rh=max(rh,h);maxy=max(maxy,y+h+pad)
    H=1
    while H<maxy:H*=2
    return pos,(width,H)

def grid_overlay(sheet,pos,grid=16):
    c=sheet.copy();d=ImageDraw.Draw(c,'RGBA');w,h=c.size;font=ImageFont.load_default()
    for x in range(0,w,grid):d.line((x,0,x,h),fill=(0,220,255,65),width=1)
    for y in range(0,h,grid):d.line((0,y,w,y),fill=(0,220,255,65),width=1)
    for name,(x,y,rw,rh) in pos.items():
        d.rectangle((x-1,y-1,x+rw,y+rh),outline=(255,80,150,220),width=1)
        label=f'{name} @{x},{y} {rw}x{rh}'
        bb=d.textbbox((0,0),label,font=font);tw=bb[2]-bb[0]
        d.rectangle((x,max(0,y-10),min(w-1,x+tw+3),y),fill=(0,0,0,195))
        d.text((x+1,max(0,y-9)),label,font=font,fill=(255,255,255,240))
    return c

def rgba(c,a=255): return (*c[:3],a)
def mix(a,b,t): return tuple(int(a[i]*(1-t)+b[i]*t) for i in range(3))

def ellipse_grad(d,box,outer,inner,steps=10,outline=None):
    x0,y0,x1,y1=box
    for i in range(steps,0,-1):
        t=i/steps; c=rgba(mix(outer,inner,t),255)
        dx=(x1-x0)*(1-t)*.34;dy=(y1-y0)*(1-t)*.34
        d.ellipse((x0+dx,y0+dy,x1-dx,y1-dy),fill=c)
    if outline:d.ellipse(box,outline=outline,width=max(1,int((x1-x0)/35)))

def antialiased_draw(size, fn, scale=3):
    im=Image.new('RGBA',(size[0]*scale,size[1]*scale),(0,0,0,0)); d=ImageDraw.Draw(im,'RGBA')
    fn(d,scale)
    return im.resize(size,Image.Resampling.LANCZOS)

# ---------- foliage ----------
FOLIAGE_PALETTES=[
    ((7,55,58),(12,116,92),(48,174,121),(114,221,139),(49,206,222),(238,82,180)),
    ((12,42,71),(17,90,116),(28,146,133),(94,202,139),(99,91,206),(232,95,211)),
    ((13,62,54),(32,115,72),(95,159,77),(171,196,75),(40,181,179),(255,132,80)),
    ((26,42,70),(40,88,118),(50,137,115),(84,189,133),(114,88,205),(241,119,224)),
]

def make_foliage(seed:int, size=(128,100)):
    rng=random.Random(9100+seed); pal=FOLIAGE_PALETTES[seed%len(FOLIAGE_PALETTES)]
    dark,mid,leaf,hi,glow,flower=pal
    def draw(d,S):
        W,H=size[0]*S,size[1]*S
        # rooted moss/rock base
        for i in range(5+rng.randrange(5)):
            cx=(12+rng.random()*(size[0]-24))*S; cy=(size[1]-12+rng.uniform(-3,4))*S
            rx=rng.uniform(9,20)*S; ry=rng.uniform(5,11)*S
            d.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=rgba(mix(dark,mid,rng.random()*.55)))
        # stems
        stems=[]
        for i in range(5+rng.randrange(7)):
            bx=(15+rng.random()*(size[0]-30))*S; by=(size[1]-17+rng.uniform(-2,3))*S
            topy=(20+rng.random()*52)*S; sway=rng.uniform(-15,15)*S
            d.line((bx,by,bx+sway,topy),fill=rgba(mix(dark,leaf,.5)),width=max(2,int(2.2*S)))
            stems.append((bx+sway,topy))
        # clustered leaves, deliberately asymmetric
        for i in range(25+rng.randrange(26)):
            if stems and rng.random()<.7:
                sx,sy=rng.choice(stems); cx=sx+rng.gauss(0,16*S);cy=sy+rng.gauss(9*S,18*S)
            else:
                cx=(10+rng.random()*(size[0]-20))*S;cy=(30+rng.random()*(size[1]-40))*S
            rx=rng.uniform(4,11)*S;ry=rng.uniform(3,8)*S; ang=rng.uniform(-.7,.7)
            c=mix(mid,leaf,rng.uniform(.25,.95));
            # ellipse rather than rotated leaf to keep build dependency simple
            d.ellipse((cx-rx,cy-ry,cx+rx,cy+ry),fill=rgba(c),outline=rgba(dark,210),width=max(1,S))
            if rng.random()<.45:d.ellipse((cx-rx*.35,cy-ry*.55,cx+rx*.18,cy-ry*.12),fill=rgba(mix(c,hi,.55),125))
        # flowers / relay bulbs
        for i in range(2+rng.randrange(5)):
            cx=(15+rng.random()*(size[0]-30))*S; cy=(25+rng.random()*48)*S
            if rng.random()<.45:
                rr=rng.uniform(4.5,7.5)*S
                d.ellipse((cx-rr,cy-rr,cx+rr,cy+rr),fill=rgba(glow),outline=rgba(dark),width=max(1,S))
                d.ellipse((cx-rr*.45,cy-rr*.45,cx+rr*.45,cy+rr*.45),fill=(205,255,255,245))
            else:
                rr=rng.uniform(3.5,6.5)*S
                for a in range(5):
                    th=a*math.tau/5+rng.random()*.12
                    px=cx+math.cos(th)*rr*.8;py=cy+math.sin(th)*rr*.8
                    d.ellipse((px-rr*.55,py-rr*.4,px+rr*.55,py+rr*.4),fill=rgba(flower),outline=rgba(dark,190),width=max(1,S))
                d.ellipse((cx-rr*.32,cy-rr*.32,cx+rr*.32,cy+rr*.32),fill=(255,226,110,255))
    return antialiased_draw(size,draw,3)

# ---------- trees ----------
TREE_PALETTES=[
    ((30,25,47),(74,47,67),(118,72,76),(9,70,79),(12,119,108),(43,166,135),(44,182,209)),
    ((31,27,48),(91,53,66),(139,83,72),(15,63,91),(15,113,126),(35,164,151),(210,81,220)),
    ((28,31,39),(84,61,53),(128,84,63),(24,72,56),(50,125,65),(112,170,80),(255,168,61)),
    ((37,28,55),(87,52,79),(131,77,91),(28,52,92),(63,91,148),(118,83,189),(74,227,210)),
]

def make_tree(seed:int,size=(260,282)):
    rng=random.Random(12300+seed);p=TREE_PALETTES[seed%len(TREE_PALETTES)]
    bark0,bark1,bark2,leaf0,leaf1,leaf2,glow=p
    def draw(d,S):
        W,H=size[0]*S,size[1]*S;cx=W*.5;base=H*.94
        # roots
        for i in range(7):
            a=(i-3)*.36+rng.uniform(-.11,.11);ln=rng.uniform(35,70)*S
            x2=cx+math.sin(a)*ln;y2=base-math.cos(a)*ln*.20
            d.line((cx,base-22*S,x2,y2),fill=rgba(bark0),width=int(rng.uniform(8,15)*S))
            d.line((cx,base-24*S,x2,y2-2*S),fill=rgba(bark1),width=int(rng.uniform(3,6)*S))
        # trunk with tapered segments
        pts=[(cx-30*S,base),(cx-23*S,150*S),(cx-34*S,95*S),(cx-10*S,44*S),(cx+12*S,45*S),(cx+30*S,98*S),(cx+24*S,151*S),(cx+34*S,base)]
        d.polygon(pts,fill=rgba(bark1),outline=rgba(bark0))
        # bark streaks
        for i in range(16):
            x=cx+rng.uniform(-22,22)*S;y=rng.uniform(80,size[1]-40)*S
            d.line((x,y,x+rng.uniform(-5,5)*S,y+rng.uniform(18,42)*S),fill=rgba(mix(bark1,bark2,.7),150),width=max(1,int(rng.uniform(1,3)*S)))
        # branches
        for side in (-1,1):
            for j in range(4):
                sy=(115-j*20+rng.uniform(-5,5))*S; ex=cx+side*rng.uniform(52,93)*S;ey=(70-j*7+rng.uniform(-10,10))*S
                d.line((cx+side*12*S,sy,ex,ey),fill=rgba(bark0),width=int((10-j)*S))
                d.line((cx+side*10*S,sy-2*S,ex,ey-2*S),fill=rgba(bark2),width=int(max(2,(4-j*.5)*S)))
        # canopy clusters
        centers=[]
        for i in range(20):
            ang=rng.random()*math.tau;r=(rng.random()**.55)*90*S
            x=cx+math.cos(ang)*r; y=74*S+math.sin(ang)*r*.42+rng.uniform(-10,10)*S
            centers.append((x,y,rng.uniform(22,42)*S))
        for x,y,r in centers:
            c=mix(leaf0,leaf2,rng.random()*.95);d.ellipse((x-r,y-r*.68,x+r,y+r*.68),fill=rgba(c),outline=rgba(leaf0,190),width=max(1,S))
            if rng.random()<.7:d.ellipse((x-r*.42,y-r*.45,x+r*.12,y-r*.05),fill=rgba(mix(c,(150,240,190),.35),75))
        # vines
        for i in range(4):
            x=(cx+rng.uniform(-78,78)*S);y=82*S
            pts=[]
            for j in range(6):pts.append((x+math.sin(j*.8+i)*5*S,y+j*18*S))
            d.line(pts,fill=rgba((27,119,84),190),width=max(2,S*2))
        # relay inset
        ry=177*S;rr=14*S
        d.ellipse((cx-rr*1.25,ry-rr*1.25,cx+rr*1.25,ry+rr*1.25),fill=rgba(bark0),outline=(8,18,31,255),width=2*S)
        d.ellipse((cx-rr,ry-rr,cx+rr,ry+rr),fill=rgba(glow),outline=(220,255,255,230),width=S)
        d.ellipse((cx-rr*.45,ry-rr*.5,cx+rr*.1,ry+rr*.05),fill=(255,255,255,105))
        # moss & flowers at foot
        for i in range(16):
            x=cx+rng.uniform(-75,75)*S;y=base-rng.uniform(0,18)*S;r=rng.uniform(3,8)*S
            d.ellipse((x-r,y-r*.6,x+r,y+r*.6),fill=rgba(mix(leaf0,leaf2,rng.random())))
    return antialiased_draw(size,draw,3)

def remix_tree_base(base:Image.Image, seed:int, size=(260,282)):
    """Create same-style tree variations by remixing the original painted trees.

    This deliberately avoids the previous procedural-vector look. Geometry, bark texture,
    canopy edge language and painted highlights come directly from the original source art.
    """
    rng=random.Random(18400+seed)
    src=base.copy().convert('RGBA')
    # preserve aspect while fitting common authoring size
    scale=min(size[0]/src.width,size[1]/src.height)
    nw=max(1,int(src.width*scale));nh=max(1,int(src.height*scale))
    src=src.resize((nw,nh),Image.Resampling.LANCZOS)
    if seed&1: src=src.transpose(Image.Transpose.FLIP_LEFT_RIGHT)
    # restrained colour/contrast variation; still recognisably the same art family
    rgb=src.convert('RGB')
    rgb=ImageEnhance.Color(rgb).enhance(0.88+rng.random()*.34)
    rgb=ImageEnhance.Contrast(rgb).enhance(0.94+rng.random()*.15)
    rgb=ImageEnhance.Brightness(rgb).enhance(0.93+rng.random()*.12)
    hsv=rgb.convert('HSV'); h,sat,val=hsv.split()
    shift=int((-10+seed*3)%24)-12
    h=h.point(lambda v:(v+shift)%256)
    rgb=Image.merge('HSV',(h,sat,val)).convert('RGB')
    src=Image.merge('RGBA',(*rgb.split(),src.getchannel('A')))
    out=Image.new('RGBA',size,(0,0,0,0))
    ox=(size[0]-nw)//2;oy=size[1]-nh
    out.alpha_composite(src,(ox,oy))
    # small foliage underplant variation uses the same palette vocabulary
    if seed%3==0:
        patch=make_foliage(80+seed,(96,72)).resize((82,61),Image.Resampling.LANCZOS)
        out.alpha_composite(patch,(max(0,ox-10),size[1]-64))
    elif seed%3==1:
        patch=make_foliage(90+seed,(88,68)).resize((72,56),Image.Resampling.LANCZOS)
        out.alpha_composite(patch,(min(size[0]-72,ox+nw-58),size[1]-59))
    return out

def split_tree(full:Image.Image):
    # Canopy is the upper 58%; trunk image hides canopy but preserves exact coordinates.
    w,h=full.size; cut=int(h*.55)
    canopy=Image.new('RGBA',(w,cut),(0,0,0,0));canopy.alpha_composite(full.crop((0,0,w,cut)),(0,0))
    trunk=full.copy(); mask=Image.new('L',(w,h),255); md=ImageDraw.Draw(mask);md.rectangle((0,0,w,cut-12),fill=0)
    # soft transition avoids visible seam at overlap
    mask=mask.filter(ImageFilter.GaussianBlur(4));a=trunk.getchannel('A');import PIL.ImageChops as IC
    trunk.putalpha(IC.multiply(a,mask))
    return trunk,canopy

# ---------- creatures ----------
CREATURE_PALETTES={
 'squirrel':((114,70,52),(188,114,68),(242,184,104)),
 'rabbit':((69,74,96),(149,159,181),(236,236,239)),
 'cat':((40,51,68),(102,139,150),(215,221,200)),
 'pixie':((41,75,77),(76,196,164),(230,123,230)),
 'gnome':((66,48,56),(184,58,75),(56,136,105)),
 'mushroom_pixie':((42,49,65),(111,93,174),(245,132,218)),
}

def make_creature(kind:str, frame:int,size=(72,72)):
    pal=CREATURE_PALETTES[kind];dark,mid,hi=pal;rng=random.Random(hash(kind)*97+frame*13)
    def draw(d,S):
        C=36*S; bob=(1 if frame==3 else 0)*S
        # ground shadow
        d.ellipse((16*S,57*S,56*S,66*S),fill=(5,15,19,80))
        if kind=='squirrel':
            # large tail behind
            d.ellipse((40*S,22*S,70*S,58*S),fill=rgba(dark),outline=(20,20,29,255),width=S)
            d.ellipse((44*S,25*S,66*S,52*S),fill=rgba(mid))
            d.ellipse((20*S,30*S+bob,49*S,58*S+bob),fill=rgba(mid),outline=rgba(dark),width=2*S)
            d.ellipse((22*S,17*S+bob,46*S,40*S+bob),fill=rgba(hi),outline=rgba(dark),width=2*S)
            d.polygon([(24*S,19*S),(27*S,9*S),(32*S,19*S)],fill=rgba(mid),outline=rgba(dark)); d.polygon([(38*S,19*S),(43*S,10*S),(44*S,22*S)],fill=rgba(mid),outline=rgba(dark))
        elif kind=='rabbit':
            d.ellipse((22*S,30*S+bob,50*S,59*S+bob),fill=rgba(mid),outline=rgba(dark),width=2*S)
            d.ellipse((24*S,18*S+bob,49*S,42*S+bob),fill=rgba(hi),outline=rgba(dark),width=2*S)
            d.ellipse((26*S,3*S+bob,34*S,24*S+bob),fill=rgba(mid),outline=rgba(dark),width=S);d.ellipse((39*S,2*S+bob,47*S,24*S+bob),fill=rgba(mid),outline=rgba(dark),width=S)
            d.ellipse((49*S,44*S,60*S,55*S),fill=(245,245,245,255))
        elif kind=='cat':
            d.ellipse((19*S,30*S+bob,52*S,59*S+bob),fill=rgba(mid),outline=rgba(dark),width=2*S)
            d.ellipse((20*S,17*S+bob,51*S,44*S+bob),fill=rgba(hi),outline=rgba(dark),width=2*S)
            d.polygon([(21*S,20*S),(24*S,8*S),(33*S,20*S)],fill=rgba(mid),outline=rgba(dark));d.polygon([(40*S,20*S),(48*S,8*S),(51*S,23*S)],fill=rgba(mid),outline=rgba(dark))
            d.arc((45*S,35*S,67*S,61*S),240,80,fill=rgba(dark),width=3*S)
        elif kind=='pixie':
            # luminous wings
            d.ellipse((5*S,22*S,30*S,48*S),fill=(133,255,231,125),outline=(200,255,246,190),width=S);d.ellipse((42*S,18*S,67*S,47*S),fill=(238,128,255,125),outline=(255,220,255,190),width=S)
            d.ellipse((23*S,24*S+bob,49*S,56*S+bob),fill=rgba(mid),outline=rgba(dark),width=2*S);d.ellipse((25*S,13*S+bob,47*S,36*S+bob),fill=rgba(hi),outline=rgba(dark),width=2*S)
            d.line((36*S,13*S,36*S,6*S),fill=rgba(dark),width=S);d.ellipse((33*S,3*S,39*S,9*S),fill=(255,143,241,255))
        elif kind=='mushroom_pixie':
            # A tiny woodland sprite with a broad luminous mushroom cap.
            d.ellipse((8*S,24*S,29*S,48*S),fill=(116,238,205,112),outline=(208,255,239,185),width=S);d.ellipse((43*S,24*S,64*S,48*S),fill=(225,126,255,112),outline=(255,224,255,185),width=S)
            d.ellipse((24*S,29*S+bob,48*S,57*S+bob),fill=rgba(mid),outline=rgba(dark),width=2*S)
            d.ellipse((26*S,18*S+bob,46*S,40*S+bob),fill=rgba((231,207,184)),outline=rgba(dark),width=2*S)
            # mushroom cap, intentionally wider than the head and dotted
            d.ellipse((14*S,7*S+bob,58*S,28*S+bob),fill=rgba(hi),outline=rgba(dark),width=2*S)
            for px,py in ((24,13),(35,10),(46,15),(31,19),(50,20)):
                rr=2.2*S;d.ellipse(((px*S)-rr,(py*S+bob)-rr,(px*S)+rr,(py*S+bob)+rr),fill=(255,239,246,230))
        else: # gnome
            d.ellipse((20*S,37*S+bob,52*S,60*S+bob),fill=rgba(mid),outline=rgba(dark),width=2*S)
            d.ellipse((23*S,23*S+bob,49*S,47*S+bob),fill=(233,192,153,255),outline=rgba(dark),width=2*S)
            d.polygon([(22*S,27*S),(36*S,4*S),(51*S,28*S)],fill=rgba((195,54,75)),outline=rgba(dark))
            d.ellipse((28*S,39*S,44*S,54*S),fill=(245,238,219,235))
        # face (common; blink frame 1)
        ey=29*S+bob
        if kind=='gnome':ey=31*S+bob
        if frame==1:
            d.line((29*S,ey,33*S,ey),fill=(23,23,31,255),width=S);d.line((40*S,ey,44*S,ey),fill=(23,23,31,255),width=S)
        else:
            d.ellipse((28*S,ey-2*S,33*S,ey+3*S),fill=(16,19,27,255));d.ellipse((40*S,ey-2*S,45*S,ey+3*S),fill=(16,19,27,255));d.ellipse((29*S,ey-1*S,30*S,ey),fill=(255,255,255,235));d.ellipse((41*S,ey-1*S,42*S,ey),fill=(255,255,255,235))
        d.arc((34*S,ey+1*S,40*S,ey+7*S),0,180,fill=(30,31,37,255),width=S)
        # walk pose feet
        if frame in (2,3):
            shift=3*S if frame==2 else -3*S;d.ellipse((22*S+shift,55*S,32*S+shift,63*S),fill=rgba(dark));d.ellipse((40*S-shift,55*S,50*S-shift,63*S),fill=rgba(dark))
    return antialiased_draw(size,draw,3)

# ---------- build ----------
def category(name):
    if name.startswith('creature_'):return 'creatures'
    if name.startswith('foliage_v391_'):return 'foliage'
    if name.startswith(('tree_v391_','tree_v391trunk_','tree_v391canopy_')):return 'trees'
    if name.startswith('mini_'):return 'minirobots'
    if name.startswith(('robot_','chibi_','moth_')) or name in ('robot_warm','robot_green'):return 'characters'
    if name.startswith(('blocker_','stone_')) or name in ('bridge','grass_patch','stump'):return 'terrain'
    if name.startswith(('tree_','canopy_')) or name in ('tree_pair','gate','tree_purple','tree_green'):return 'large'
    if name.startswith(('swirl','spiral','moon_','spark_','guide_','orb_')):return 'fx'
    if name.startswith('theme_') or name=='gear':return 'ui'
    return 'small'

def main():
    m=json.loads(MAN.read_text());src=Image.open(ROOT/m['image']).convert('RGBA')
    sprites={n:src.crop((r[0],r[1],r[0]+r[2],r[1]+r[3])) for n,r in m['regions'].items()}
    meta=m.setdefault('region_meta',{}); roles=m.setdefault('roles',{})

    # Unique foliage.
    new_f=[]
    for i in range(24):
        name=f'foliage_v391_{i:02d}';sprites[name]=make_foliage(i);meta[name]={'element':'far_forest','world_scale':.72+(i%4)*.025,'tint_strength':.035,'category':'foliage'};new_f.append(name)

    # New large trees, each split into exact-position trunk/canopy pair.
    new_t=[]
    tree_trunks=dict(roles.get('tree_trunks') or {});tree_canopies=dict(roles.get('tree_canopies') or {})
    original_tree_bases=[sprites[n] for n in ('tree_purple','tree_green') if n in sprites]
    for i in range(8):
        whole=f'tree_v391_{i:02d}';tr=f'tree_v391trunk_{i:02d}';ca=f'tree_v391canopy_{i:02d}'
        im=remix_tree_base(original_tree_bases[i%len(original_tree_bases)],i) if original_tree_bases else make_tree(i)
        trunk,can=split_tree(im);sprites[whole]=im;sprites[tr]=trunk;sprites[ca]=can
        meta[whole]={'element':'blockers','world_scale':.72,'tint_strength':.02,'category':'trees'}
        meta[tr]={'element':'blockers','world_scale':.72,'tint_strength':.025,'category':'trees','parent':whole,'split':'trunk'}
        meta[ca]={'element':'far_forest','world_scale':.72,'tint_strength':.02,'category':'trees','parent':whole,'split':'canopy'}
        tree_trunks[whole]=tr;tree_canopies[whole]=ca;new_t.append(whole)
    roles['tree_trunks']=tree_trunks;roles['tree_canopies']=tree_canopies;roles['tree_blockers']=list(dict.fromkeys((roles.get('tree_blockers') or [])+new_t))

    # Creature animation families.
    creature_roles={}
    for kind in CREATURE_PALETTES:
        frames={}
        for fi,fr in enumerate(('idle','blink','walk_a','walk_b')):
            name=f'creature_{kind}_{fr}';sprites[name]=make_creature(kind,fi);meta[name]={'element':'discoveries','world_scale':.62,'tint_strength':.02,'category':'creatures'};frames[fr]=name
        creature_roles[kind]=frames
    roles['creatures']=creature_roles

    # Remove any ambiguous parts/robots from decor vocabularies, then add only explicit plant names.
    safe_base=[n for n in (roles.get('decor_plants') or []) if n in sprites and not n.startswith('foliage_extra_') and not any(q in n.lower() for q in ('robot','mini_','face','head','eye','chibi','part','moth'))]
    roles['foliage_v391']=new_f
    roles['decor_plants']=list(dict.fromkeys(safe_base+new_f))
    roles['foliage_mix']=list(dict.fromkeys((roles.get('foliage_mix') or [])+new_f))

    # Repack master atlas + bump.
    pos,size=pack(sprites,4096,8);master=Image.new('RGBA',size,(0,0,0,0));bump=Image.new('L',size,0)
    for n,im in sprites.items():
        x,y,w,h=pos[n];master.alpha_composite(im,(x,y));bump.paste(height_map(im),(x,y))
    master.save(AS/'sprite_runtime_atlas.png',optimize=True);bump.save(AS/'sprite_bumpmap.png',optimize=True)
    m['schema']='relay-moth-hd-atlas/v3.91';m['image']='assets/sprite_runtime_atlas.png';m['bump_image']='assets/sprite_bumpmap.png';m['source_size']=list(size);m['regions']={n:list(v) for n,v in pos.items()}
    notes=m.get('notes',{});notes = notes if isinstance(notes,dict) else {};notes['v391']='24 unique foliage sprites, 8 unique split large trees, six animated woodland creature families, stronger bump maps, decor vocabulary sanitized.';m['notes']=notes
    MAN.write_text(json.dumps(m,indent=2)+'\n')

    # Dedicated category sheets including new foliage/creatures/trees.
    cats={}
    for n,im in sprites.items():cats.setdefault(category(n),{})[n]=im
    sm={'schema':'relay-moth-sprite-sheets/v3.91','grid_px':16,'categories':{},'notes':['Runtime sheets transparent; edit grids contain 16px guides, region outlines, names and coordinates.','Foliage, trees and creatures have dedicated external-edit sheets in v3.91.']}
    for cat,ss in sorted(cats.items()):
        p,sz=pack(ss,2048,8);sheet=Image.new('RGBA',sz,(0,0,0,0));bm=Image.new('L',sz,0)
        for n,im in ss.items():x,y,w,h=p[n];sheet.alpha_composite(im,(x,y));bm.paste(height_map(im),(x,y))
        sheet.save(AS/f'sprites_{cat}.png',optimize=True);bm.save(AS/f'sprites_{cat}_bump.png',optimize=True);grid_overlay(sheet,p).save(AS/f'sprites_{cat}_edit_grid.png',optimize=True)
        sm['categories'][cat]={'image':f'assets/sprites_{cat}.png','edit_image':f'assets/sprites_{cat}_edit_grid.png','bump_image':f'assets/sprites_{cat}_bump.png','size':list(sz),'regions':{n:list(v) for n,v in p.items()}}
    SHEET_MAN.write_text(json.dumps(sm,indent=2)+'\n')
    print('v3.91 atlas',size,'regions',len(sprites),'foliage',len(new_f),'trees',len(new_t),'creatures',len(creature_roles))

if __name__=='__main__':main()
