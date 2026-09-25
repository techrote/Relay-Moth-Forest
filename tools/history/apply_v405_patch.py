from pathlib import Path
ROOT=Path('.').resolve()

# Patch foliage shader to restrict local overlay to lower-body band.
fp=ROOT/'foliagefx.js'
t=fp.read_text()
t=t.replace('Relay Moth FoliageFX v4.04','Relay Moth FoliageFX v4.05')
t=t.replace("const VERSION='4.04';","const VERSION='4.05';")
old="""bool foregroundOcclusionMask(){int mask=int(vFrontMask+.5);for(int i=0;i<8;i++){if(i>=uSourceCount)break;if((mask&(1<<i))==0)continue;vec2 hp=max(uSourceData[i].zw,vec2(1.0));vec2 d=(vWorld-uSourcePos[i])/hp;vec2 a=abs(d);float superEllipse=a.x*a.x*a.x*a.x+a.y*a.y*a.y*a.y;if(superEllipse<=1.08)return true;}return false;}"""
new="""bool foregroundOcclusionMask(){int mask=int(vFrontMask+.5);for(int i=0;i<8;i++){if(i>=uSourceCount)break;if((mask&(1<<i))==0)continue;vec2 hp=max(uSourceData[i].zw,vec2(1.0));float actorBottom=uSourcePos[i].y+hp.y;float bandTop=actorBottom-hp.y*0.90;float bandBottom=actorBottom+min(2.0,hp.y*0.10);if(vWorld.y<bandTop||vWorld.y>bandBottom)continue;vec2 bandCenter=vec2(uSourcePos[i].x,(bandTop+bandBottom)*0.5);vec2 bandHalf=vec2(hp.x,max(1.0,(bandBottom-bandTop)*0.5));vec2 d=(vWorld-bandCenter)/bandHalf;vec2 a=abs(d);float superEllipse=a.x*a.x*a.x*a.x+a.y*a.y*a.y*a.y;if(superEllipse<=1.08)return true;}return false;}"""
if old not in t:
    raise SystemExit('foregroundOcclusionMask pattern not found')
t=t.replace(old,new)
fp.write_text(t)

# Update regression to ensure lower-body band clipping exists and no face-level coverage.
rp=ROOT/'foliagefx_occlusion_regression_404.js'
rt=rp.read_text()
rt=rt.replace("assert.strictEqual(F.VERSION,'4.04');","assert.strictEqual(F.VERSION,'4.05');")
rt=rt.replace("const src=fs.readFileSync(__dirname+'/foliagefx.js','utf8');\nassert(src.includes('if(uPass==1&&!foregroundOcclusionMask())discard;'),'foreground overlay must clip fragments outside actor-local silhouettes');\nassert(src.includes('superEllipse<=1.08'),'actor-local clipping should use a compact rounded silhouette rather than whole-plant redraw');\nassert(!src.includes('(uPass==0&&front)'),'background foliage must never pop out when classification changes');\nconsole.log('FOLIAGEFX OCCLUSION REGRESSION 4.04 PASS');",
"const src=fs.readFileSync(__dirname+'/foliagefx.js','utf8');\nassert(src.includes('if(uPass==1&&!foregroundOcclusionMask())discard;'),'foreground overlay must clip fragments outside actor-local silhouettes');\nassert(src.includes('superEllipse<=1.08'),'actor-local clipping should use a compact rounded silhouette rather than whole-plant redraw');\nassert(src.includes('float bandTop=actorBottom-hp.y*0.90;') && src.includes('if(vWorld.y<bandTop||vWorld.y>bandBottom)continue;'),'foreground overlay must be constrained to the actor lower-body band so floor plants cannot cover the face');\nassert(!src.includes('(uPass==0&&front)'),'background foliage must never pop out when classification changes');\nconsole.log('FOLIAGEFX OCCLUSION REGRESSION 4.05 PASS');")
rp.write_text(rt)

# Update self-test version/schema/summary.
sp=ROOT/'self_test.py'
st=sp.read_text()
st=st.replace("const VERSION='4.04'","const VERSION='4.05'")
st=st.replace("relay-moth-hd-atlas/v4.04","relay-moth-hd-atlas/v4.05")
st=st.replace('Relay Moth Forest — Pretty Graphics Edition 4.04','Relay Moth Forest — Pretty Graphics Edition 4.05')
st=st.replace('GPU-instanced rooted FoliageFX + v4.04 actor-local foliage occlusion / no-pop ordering + unified MAX-composed shadows validated','GPU-instanced rooted FoliageFX + v4.05 lower-body foliage occlusion / face-safe ordering + unified MAX-composed shadows validated')
sp.write_text(st)

# Atlas schema bump.
ap=ROOT/'hd_remake_atlas.json'
at=ap.read_text().replace('relay-moth-hd-atlas/v4.04','relay-moth-hd-atlas/v4.05')
ap.write_text(at)

# Update user-facing version strings and diagnostics version.
gp=ROOT/'game.js'
gt=gp.read_text().replace('Pretty Graphics Edition 4.04','Pretty Graphics Edition 4.05').replace("version:'4.02'","version:'4.05'")
gp.write_text(gt)
for fn in ['VERSION.txt','index.html','relay_moth_server.py','README.txt','CHANGELOG.txt','V404_FOLIAGE_OCCLUSION_FIX.md']:
    p=ROOT/fn
    if not p.exists():
        continue
    x=p.read_text().replace('Pretty Graphics Edition 4.04','Pretty Graphics Edition 4.05').replace('v4.04','v4.05')
    p.write_text(x)

# New doc.
(ROOT/'V405_FOLIAGE_FACE_CLIP_FIX.md').write_text('''# Relay Moth Forest v4.05 — Face-safe Foliage Occlusion Fix\n\n## Problem\nThe v4.04 actor-local foliage occlusion removed whole-sprite popping, but its local overlay still used the actor\'s full silhouette. This allowed a short floor plant to draw over a robot\'s face when their projected screen regions overlapped.\n\n## Fix\nForeground foliage overlay is now restricted to a lower-body occlusion band derived from each actor source. The overlay can cover the lower body / feet region, but is rejected above that band so ground plants cannot cover the face or head. The background pass remains fully continuous and stable.\n\n## Technical change\nInside `foregroundOcclusionMask()` the per-source local mask is clipped to a lower-body band (`bandTop` .. `bandBottom`) and the compact rounded occlusion shape is evaluated within that band.\n\n## Result\nPlants on the floor can still appear in front of the lower body when appropriate, but they no longer draw over robot faces.\n''')

# Changelog prepend.
cp=ROOT/'CHANGELOG.txt'
if cp.exists():
    ct=cp.read_text()
    if not ct.startswith('4.05 —'):
        cp.write_text('4.05 — FACE-SAFE FOLIAGE OCCLUSION\n- Fixed a remaining v4.04 occlusion bug where floor plants could draw over robot faces.\n- Constrained actor-local foliage overlay to a lower-body band instead of the full actor silhouette.\n- Updated diagnostics/version strings to 4.05.\n\n'+ct)

print('Applied v4.05 patch')
