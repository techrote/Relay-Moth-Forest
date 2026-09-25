'use strict';
const ROOT=require('path').resolve(__dirname,'../..');
const fs=require('fs'),assert=require('assert');
const F=require(ROOT+'/foliagefx.js');
assert.strictEqual(F.VERSION,'4.14');
const dc=new F.DepthClassifier(40);
const back={index:0,x:100,rootY:101,w:24,h:32,depthBias:0,flags:0};
const front={index:1,x:100,rootY:118,w:24,h:32,depthBias:0,flags:0};
dc.setInstances([back,front]);
const lateral={id:'actor',x:100,y:110,vx:30,vy:0,halfW:10,halfH:12,frontBias:0};
assert.strictEqual(dc.classify(back,lateral),false);
assert.strictEqual(dc.classify(front,lateral),true);
// Directional bias: downward motion makes foliage just ahead easier to place in front; upward motion does the opposite.
const edge={index:2,x:100,rootY:114.5,w:24,h:32,depthBias:0,flags:0};
assert.strictEqual(dc.classify(edge,{...lateral,vy:30}),true);
assert.strictEqual(dc.classify(edge,{...lateral,vy:-30}),false);
// Conservative multi-actor policy: a whole plant is foreground only when it is clearly in front of every overlapping actor.
const multi=new F.DepthClassifier(40),plant={index:0,x:100,rootY:116,w:30,h:45,depthBias:0,flags:0};multi.setInstances([plant]);
const behind={id:'behind',x:100,y:100,vx:0,vy:0,halfW:10,halfH:12},ahead={id:'ahead',x:100,y:114,vx:0,vy:0,halfW:10,halfH:12};
for(let i=0;i<12;i++)multi.update(.016,[behind,ahead]);
assert(plant.flags<.02,'plant must stay background when any overlapping actor is in front of it');
// Stable dwell + fade: foreground relationship ramps in, then fades out without a hard layer pop.
const fade=new F.DepthClassifier(40),fp={index:0,x:100,rootY:122,w:30,h:45,depthBias:0,flags:0};fade.setInstances([fp]);
for(let i=0;i<12;i++)fade.update(.016,[behind]);
assert(fp.flags>.25&&fp.flags<=1,'foreground blend should ramp in after dwell');
const peak=fp.flags;for(let i=0;i<20;i++)fade.update(.016,[]);
assert(fp.flags<peak,'foreground blend should fade out when overlap ends');
const game=fs.readFileSync(ROOT+'/game.js','utf8');
const endStart=game.indexOf('  end(grade=');const endEnd=game.indexOf('\n  }\n}\n\nclass ParticleField',endStart);const render=game.slice(endStart,endEnd);
const fg=render.indexOf("foliageFX?.render('foreground'");const trees=render.indexOf('this.foregroundHDNormal');assert(fg>=0&&trees>fg);
const bg=render.indexOf("foliageFX?.render('background'");const shadow=render.indexOf('this.renderShadowOverlay');assert(shadow>=0&&bg>shadow);
const src=fs.readFileSync(ROOT+'/foliagefx.js','utf8');
assert(src.includes('frontBlend=aExtra.w')&&src.includes('uPass==1&&frontBlend<.01'),'foreground pass must consume a stable whole-sprite blend');
assert(src.includes('passOpacity(t.a,clamp(vFrontBlend,0.0,1.0))'),'foreground overlay must fade the whole plant as a unit');
for(const forbidden of ['plantForegroundAlpha()','foregroundOcclusionAlpha()','foregroundOcclusionMask()'])assert(!src.includes(forbidden),'partial foliage clipping must be removed: '+forbidden);
assert(src.includes('q&&q.count>0&&q.allFront?1:0'),'whole plant may foreground only when in front of all overlapping actors');
console.log('FOLIAGEFX DEPTH REGRESSION 4.14 PASS');
console.log('  lower-edge directional ordering + conservative whole-sprite fade validated');
