#!/usr/bin/env python3
"""Rendered-pixel tests using production GLSL and real surfaceless GLES3.
--observe permits measuring an older baseline without asserting repaired contracts.
Optional --out stores machine-readable measurements and shader-rendered evidence.
"""
from pathlib import Path
import argparse, importlib.util, json, math, subprocess, sys
import numpy as np
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(ROOT/'tests/support'))
from gles import GLES, GpuUnavailable

def sprite(w=96,h=96,x=320,y=180,flip=False,rot=0,uv=(0,0,1,1)):
    pts=np.array([[-w/2,-h/2],[w/2,-h/2],[-w/2,h/2],[-w/2,h/2],[w/2,-h/2],[w/2,h/2]],dtype=np.float32)
    co,si=math.cos(rot),math.sin(rot);pts=pts@np.array([[co,si],[-si,co]],dtype=np.float32)+[x,y]
    u0,v0,u1,v1=uv
    if flip:u0,u1=u1,u0
    return {'aPos':pts,'aUV':np.array([[u0,v0],[u1,v0],[u0,v1],[u0,v1],[u1,v0],[u1,v1]],dtype=np.float32),'aColor':np.ones((6,4),dtype=np.float32)}

def quad():return {'aPos':np.array([[-1,-1],[1,-1],[-1,1],[-1,1],[1,-1],[1,1]]),'aUV':np.array([[0,0],[1,0],[0,1],[0,1],[1,0],[1,1]])}
def solid(w,h,value):return np.broadcast_to(np.array(value,dtype=np.uint8),(h,w,4)).copy()
def normal_flip(n):n=np.fliplr(n).copy();n[...,0]=np.clip(256-n[...,0].astype(int),0,255).astype('uint8');return n

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--root',type=Path,default=ROOT);ap.add_argument('--out',type=Path);ap.add_argument('--observe',action='store_true');args=ap.parse_args()
    try:g=GLES()
    except GpuUnavailable as e:print('SPRITE PIXEL TEST SKIP:',e);return
    failures=[];report={'driver':g.version,'checks':{},'compiled_programs':[]}
    def check(name,value,limit):
        val=float(value);report['checks'][name]={'measured':val,'maximum':limit,'pass':val<=limit}
        if val>limit:failures.append(name)
    if args.out:args.out.mkdir(parents=True,exist_ok=True)
    try:
        shaders=json.loads(subprocess.check_output(['node',str(ROOT/'tests/support/capture_shaders.js'),str(args.root)],text=True))
        progs={}
        for name,shader in shaders.items():
            try:progs[name]=g.program(shader['vertex'],shader['fragment'],name);report['compiled_programs'].append(name)
            except AssertionError as exc:
                if not args.observe:raise
                report.setdefault('shader_compile_failures',{})[name]=str(exc);failures.append(name+' compile')
        report['program_count']=len(progs)
        yy,xx=np.mgrid[:96,:96];height=np.clip(130+70*np.sin(xx/18)+30*np.cos(yy/19),0,255).astype('uint8')
        gy,gx=np.gradient(height.astype(float)/255.);n=np.dstack([-gx*10,gy*10,np.ones_like(gx)]);n/=np.linalg.norm(n,axis=2)[...,None]
        normals=np.dstack([np.round(n*127+128).clip(0,255).astype('uint8'),np.full((96,96),255,'uint8')])
        bump=np.dstack([height,height,height,np.full_like(height,255)]);col=solid(96,96,[80,150,110,255]);spec=solid(96,96,[90,90,90,255]);clear=(.07,.10,.13,1)
        textures={'uTex':col,'uBumpTex':bump,'uNormalTex':normals,'uSpecularTex':spec}
        uniforms={'uMainLightPos':[210.,90.],'uAtlasSize':[96.,96.],'uLogicalSize':[640.,360.],'uBumpStrength':1.35,'uSpecularStrength':.42,'uMaterialOn':1.,'uTintStrength':0.}
        def render(name='hdProg',at=None,tx=None,un=None,res=(640,360)):
            target=g.target(*res,clear=clear);g.draw(progs[name],at or sprite(),dict(uniforms,**(un or {})),textures if tx is None else tx,blend=True);return g.read(target)
        off1=render(un={'uBumpStrength':0.,'uSpecularStrength':0.,'uMaterialOn':0.,'uMainLightPos':[40.,70.]});off2=render(un={'uBumpStrength':0.,'uSpecularStrength':0.,'uMaterialOn':0.,'uMainLightPos':[610.,300.]})
        check('unlit_invariant_to_light_position',np.abs(off1.astype(int)-off2.astype(int)).max(),0)
        check('unlit_matches_source_rgb',np.abs(off1[145:215,285:355,:3].astype(int)-[80,150,110]).max(),1)
        mirror=render(at=sprite(flip=True));mt=dict(textures,uTex=np.fliplr(col).copy(),uBumpTex=np.fliplr(bump).copy(),uNormalTex=normal_flip(normals),uSpecularTex=np.fliplr(spec).copy());mirrorref=render(tx=mt)
        check('mirror_normal_orientation_error',np.abs(mirror.astype(int)-mirrorref.astype(int)).max(),2)
        # Positive screen-space rotation is clockwise in the top-down image convention.
        rn=np.rot90(normals,-1).copy();old=rn.copy();rn[...,0]=old[...,1];rn[...,1]=np.clip(256-old[...,0].astype(int),0,255).astype('uint8')
        rotate=render(at=sprite(rot=math.pi/2));rotref=render(tx={'uTex':np.rot90(col,-1).copy(),'uBumpTex':np.rot90(bump,-1).copy(),'uNormalTex':rn,'uSpecularTex':np.rot90(spec,-1).copy()})
        check('rotation_normal_orientation_error',np.abs(rotate.astype(int)-rotref.astype(int)).max(),2)
        base=render();big=render(res=(1280,720));down=np.array(Image.fromarray(big).resize((640,360),Image.Resampling.BOX))
        check('native_resolution_normal_error_mean',np.abs(base[134:226,274:366,:3].astype(float)-down[134:226,274:366,:3]).mean(),1.5)
        # Same source material rendered through the static world-material path.
        cc=solid(640,360,[18,26,33,255]);nn=solid(640,360,[128,128,255,0]);ss=solid(640,360,[0,0,0,0]);bb=ss.copy()
        cc[132:228,272:368]=col;nn[132:228,272:368]=normals;ss[132:228,272:368]=spec;bb[132:228,272:368]=bump
        bg=render('bgMaterialProg',quad(),{'uTex':np.flipud(cc).copy(),'uNormalTex':np.flipud(nn).copy(),'uSpecularTex':np.flipud(ss).copy(),'uBumpTex':np.flipud(bb).copy()})
        check('static_live_material_equivalence',np.abs(base[134:226,274:366,:3].astype(int)-bg[134:226,274:366,:3]).max(),2)
        # One sprite clipped into lower static and upper dynamic sections must reconstruct its material.
        top=48;cc[132:132+top,272:368]=[18,26,33,255];nn[132:132+top,272:368]=[128,128,255,0];ss[132:132+top,272:368]=0;bb[132:132+top,272:368]=0
        target=g.target(clear=clear)
        g.draw(progs['bgMaterialProg'],quad(),uniforms,{'uTex':np.flipud(cc).copy(),'uNormalTex':np.flipud(nn).copy(),'uSpecularTex':np.flipud(ss).copy(),'uBumpTex':np.flipud(bb).copy()})
        g.draw(progs['hdFlatProg'],sprite(w=96,h=48,y=156,uv=(0,0,1,.5)),uniforms,textures,blend=True);split=g.read(target)
        check('static_foreground_split_seam',np.abs(base[134:226,274:366,:3].astype(int)-split[134:226,274:366,:3]).max(),2)
        # Production instanced foliage program: total opacity must not increase as layer blend changes.
        mesh=[]
        for a,b in zip([0,.2,.4,.6,.8],[.2,.4,.6,.8,1]):mesh.extend([[-.5,a],[.5,a],[-.5,b],[-.5,b],[.5,a],[.5,b]])
        attrs={'aLocal':np.array(mesh),'aRootSize':(np.array([[320,228,96,96]]),1),'aUVRect':(np.array([[0,0,1,1]]),1),'aMotionA':(np.array([[0,1,.35,.78]]),1),'aMotionB':(np.array([[.18,8.8,.85,1]]),1),'aMaterial':(np.array([[.5,1.45,.07,0]]),1),'aExtra':(np.array([[.5,0,40,0]]),1)}
        fu={'uTime':1.,'uQuality':0,'uSourceCount':0,'uWindStrength':0.,'uWindSpeed':1.,'uInteractionStrength':0.,'uBendAmount':0.,'uShadingStrength':0.,'uBumpStrength':0.,'uSpecularStrength':0.,'uMaterialOn':0.,'uCategoryView':0,'uTintColor':[1.,1.,1.],'uMainLightPos':[320.,180.],'uAtlasSize':[96.,96.]}
        ft=dict(textures,uTex=solid(96,96,[90,170,95,128]));blends=[]
        for blend in [0.,.25,.5,.75,1.]:
            target=g.target(clear=clear);attrs['aExtra']=(np.array([[.5,0,40,blend]]),1)
            for pa in [0,1]:g.draw(progs['foliage'],attrs,dict(fu,uPass=pa),ft,blend=True,instances=1)
            blends.append(g.read(target))
        check('foliage_whole_sprite_fade_opacity_drift',max(np.abs(x.astype(int)-blends[0].astype(int)).max() for x in blends),2)
        # Root-lock region must remain pixel-identical under different strong wind phases.
        attrs['aExtra']=(np.array([[.5,0,40,0]]),1);roots=[]
        for time in [0.,4.,9.]:
            target=g.target(clear=clear);g.draw(progs['foliage'],attrs,dict(fu,uTime=time,uQuality=3,uWindStrength=4.,uBendAmount=3.,uPass=0),ft,blend=True,instances=1);roots.append(g.read(target))
        check('root_lock_pixel_motion',max(np.abs(x[197:228,:,:].astype(int)-roots[0][197:228,:,:].astype(int)).max() for x in roots),0)
        if args.out:
            for name,im in [('material_lit',base),('material_unlit',off1),('material_mirrored',mirror),('material_rotated',rotate),('static_live_compare',bg),('split_material',split),('foliage_layer0',blends[0]),('foliage_layer1',blends[-1])]:Image.fromarray(im).save(args.out/(name+'.png'))
        report['failures']=failures
    finally:g.close()
    if args.out:(args.out/'pixel_results.json').write_text(json.dumps(report,indent=2))
    print(json.dumps(report,indent=2))
    if failures and not args.observe:raise AssertionError('Rendered pixel failures: '+', '.join(failures))
    print('SPRITE PIXEL REGRESSION 4.14 '+('OBSERVED' if args.observe else 'PASS'))
if __name__=='__main__':main()
