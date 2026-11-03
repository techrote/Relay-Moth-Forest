/* PERF-004 native-browser acceptance. Loaded by browser_render_regression_414.py.
 * These checks execute production Canvas2D, editor transactions and WebGL2. The
 * oracle uploads a clean full build, then compares every byte of all three GPU
 * textures. Instrumentation is scoped to the action, never the reference build.
 */
(function(root){
  'use strict';
  const channels=['color','normal','specular'];
  const textureKeys=['bgTex','bgNormalTex','bgSpecTex'];
  const check=(ok,label)=>{if(!ok)throw Error('PERF-004 '+label)};
  const release=c=>{if(c){c.width=1;c.height=1}};

  // Frozen composition from accepted 5e6ea67. This independent full builder
  // prevents a shared full/patch refactor from making both sides equally wrong.
  function legacyFullBuild(room,state,renderW=W,renderH=H){this.microtile=room.floorMicrotile||FLOOR_TILE;const c=new OffscreenCanvas(renderW,renderH),ctx=c.getContext('2d',{alpha:false}),normalCanvas=new OffscreenCanvas(renderW,renderH),specCanvas=new OffscreenCanvas(renderW,renderH),bctx=normalCanvas.getContext('2d',{alpha:true}),sctx=specCanvas.getContext('2d',{alpha:true});ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';bctx.imageSmoothingEnabled=sctx.imageSmoothingEnabled=true;bctx.imageSmoothingQuality=sctx.imageSmoothingQuality='high';ctx.save();bctx.save();sctx.save();ctx.scale(renderW/W,renderH/H);bctx.scale(renderW/W,renderH/H);sctx.scale(renderW/W,renderH/H);this.materialNormalCtx=bctx;this.materialSpecCtx=sctx;
    const sky=ctx.createLinearGradient(0,0,0,PLAY_H);sky.addColorStop(0,this.col('sky',4));sky.addColorStop(.55,this.col('sky',19));sky.addColorStop(1,this.col('ground',30));ctx.fillStyle=sky;ctx.fillRect(0,0,W,PLAY_H);
    for(let ty=0;ty<GRID_H;ty++)for(let tx=0;tx<GRID_W;tx++){const k=`${tx},${ty}`,seed=hash32(tx,ty,room.index+311),bridgeCell=room.bridgeCells.has(k);if(room.border.has(k)||room.walls.has(k))this.baseTile(ctx,tx,ty,seed,'blocker');else if(room.water.has(k)&&(bridgeCell||!room.bridgeOpen(k)))this.baseTile(ctx,tx,ty,seed,'water');else if(room.paths.has(k)||(!bridgeCell&&room.bridgeOpen(k)))this.baseTile(ctx,tx,ty,seed,'path');else this.baseTile(ctx,tx,ty,seed,'ground')}
    this.patternDecor(ctx,room,state);this.drawBlockerSprites(ctx,room);this.drawVegetationInterstitials(ctx,room);this.drawDecor(ctx,room);
    // editor_decor, recruitable robots, completed objectives, gates and bridge/progression presentation are live mutable content.
    this.materialNormalCtx=null;this.materialSpecCtx=null;bctx.restore();sctx.restore();this.lastMaterialMaps={normal:normalCanvas,spec:specCanvas};
    const ui=ctx.createLinearGradient(0,PLAY_H,0,H);ui.addColorStop(0,this.col('ui',14));ui.addColorStop(1,this.col('ui',4));ctx.fillStyle=ui;ctx.fillRect(0,PLAY_H,W,BOTTOM_H);this.px(ctx,0,PLAY_H,W,2,this.col('ui',105),.7);this.px(ctx,8,PLAY_H+7,W-16,BOTTOM_H-14,this.col('ui',24),.92);ctx.strokeStyle=this.col('ui',88);ctx.lineWidth=1.5;ctx.strokeRect(8.5,PLAY_H+7.5,W-17,BOTTOM_H-15);this.sprite(ctx,'gear',W-31,H-17,{anchor:'bottom',alpha:.42,element:'ui'});this.sprite(ctx,'orb_cyan',28,H-18,{anchor:'bottom',alpha:.38,element:'ui'});ctx.restore();return c}

  function readTexture(g,texture,w,h){
    const draw=g.getParameter(g.DRAW_FRAMEBUFFER_BINDING),read=g.getParameter(g.READ_FRAMEBUFFER_BINDING);
    const framebuffer=g.createFramebuffer(),bytes=new Uint8Array(w*h*4);
    try{
      g.bindFramebuffer(g.FRAMEBUFFER,framebuffer);
      g.framebufferTexture2D(g.FRAMEBUFFER,g.COLOR_ATTACHMENT0,g.TEXTURE_2D,texture,0);
      check(g.checkFramebufferStatus(g.FRAMEBUFFER)===g.FRAMEBUFFER_COMPLETE,'texture framebuffer incomplete');
      g.readPixels(0,0,w,h,g.RGBA,g.UNSIGNED_BYTE,bytes);
    }finally{
      g.bindFramebuffer(g.DRAW_FRAMEBUFFER,draw);g.bindFramebuffer(g.READ_FRAMEBUFFER,read);g.deleteFramebuffer(framebuffer);
    }
    return bytes;
  }

  function uploadReference(g,source,w,h){
    const binding=g.getParameter(g.TEXTURE_BINDING_2D),flip=g.getParameter(g.UNPACK_FLIP_Y_WEBGL);
    const premultiply=g.getParameter(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL),texture=g.createTexture();
    try{
      g.bindTexture(g.TEXTURE_2D,texture);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,source);
      return readTexture(g,texture,w,h);
    }finally{
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,flip);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);
      g.bindTexture(g.TEXTURE_2D,binding);g.deleteTexture(texture);
    }
  }

  function capture(){
    const r=game.renderer,g=r.gl;
    return {width:r.nativeW,height:r.nativeH,maps:textureKeys.map(key=>readTexture(g,r[key],r.nativeW,r.nativeH))};
  }

  function reference(builder=null,{freshCaches=false}={}){
    const r=game.renderer;
    // A real full refresh reuses the loaded derived source canvases. Chromium
    // can sample byte-identical cold and warm canvas objects differently, so
    // recreating those sources changes the GPU input to the composition oracle.
    // Cold independent builders are qualified separately below. Never release
    // borrowed caches: their backing stores belong to the production art sheet.
    const art=freshCaches?Object.create(game.art):game.art;
    if(freshCaches){art.tintCache=new Map();art.normalTransformCache=new Map()}
    const painter=new StaticPainter(art,game.luts);
    let color=null,maps=null;
    try{
      color=(builder||painter.build).call(painter,game.room,game.state,r.nativeW,r.nativeH);maps=painter.lastMaterialMaps;
      return [color,maps.normal,maps.spec].map(source=>uploadReference(r.gl,source,r.nativeW,r.nativeH));
    }finally{
      release(color);release(maps?.normal);release(maps?.spec);
      if(freshCaches)for(const cache of [art.tintCache,art.normalTransformCache]){for(const canvas of cache.values())release(canvas);cache.clear()}
    }
  }

  function differences(actual,expected,w){
    check(actual.length===expected.length,'texture byte lengths differ');
    let bytes=0,pixels=0,max=0;const examples=[];
    for(let i=0;i<actual.length;i+=4){let changed=false;
      for(let c=0;c<4;c++){const d=Math.abs(actual[i+c]-expected[i+c]);if(d){changed=true;bytes++;max=Math.max(max,d)}}
      if(changed){pixels++;if(examples.length<6)examples.push({x:(i/4)%w,y:Math.floor(i/4/w),actual:Array.from(actual.subarray(i,i+4)),expected:Array.from(expected.subarray(i,i+4))})}
    }
    return {bytes,pixels,max,examples};
  }

  // Run only after a strict full-build parity failure. Canvas2D can select a
  // different backing path as sources are reused; diagnose that independently
  // of the full-builder refactor before changing either code or pixel gates.
  function rasterDiagnostics(actual,firstLegacy){
    const r=game.renderer,g=r.gl,width=r.nativeW,height=r.nativeH,temporaryArts=[],snapshots=new Map();
    const report={room:game.room.key,native:[width,height],comparisons:[],surfaces:[],normalCaches:{},sourceSampling:[]};
    const compact=(a,b,w)=>{const d=differences(a,b,w),channelBytes=[0,0,0,0],channelMax=[0,0,0,0];let rgbMaxAtAlpha32=0;
      for(let i=0;i<a.length;i+=4)for(let k=0;k<4;k++){const delta=Math.abs(a[i+k]-b[i+k]);if(delta)channelBytes[k]++;channelMax[k]=Math.max(channelMax[k],delta);if(k<3&&a[i+3]>=32&&b[i+3]>=32)rgbMaxAtAlpha32=Math.max(rgbMaxAtAlpha32,delta)}
      return{bytes:d.bytes,pixels:d.pixels,max:d.max,channelBytes,channelMax,rgbMaxAtAlpha32,examples:d.examples.slice(0,2)}};
    const newArt=()=>{const art=Object.create(game.art);art.tintCache=new Map();art.normalTransformCache=new Map();temporaryArts.push(art);return art};
    const metadata=art=>({size:art.normalTransformCache.size,entries:[...art.normalTransformCache].slice(0,8).map(([key,c])=>({key,width:c.width,height:c.height,attributes:c.getContext('2d').getContextAttributes()}))});
    const render=(name,builder,art,forceCPU=false)=>{
      const painter=new StaticPainter(art,game.luts),prototype=OffscreenCanvas.prototype,original=prototype.getContext;
      let color=null,maps=null;
      if(forceCPU)prototype.getContext=function(type,options){return original.call(this,type,type==='2d'&&this.width===width&&this.height===height?{...options,willReadFrequently:true}:options)};
      try{
        color=(builder||painter.build).call(painter,game.room,game.state,width,height);maps=painter.lastMaterialMaps;
        const surfaces=[color,maps.normal,maps.spec];
        snapshots.set(name,surfaces.map(c=>uploadReference(g,c,width,height)));
        report.surfaces.push({name,forceCPU,normalAttributes:maps.normal.getContext('2d').getContextAttributes(),normalTransform:Array.from(['a','b','c','d','e','f'],key=>maps.normal.getContext('2d').getTransform()[key])});
      }finally{prototype.getContext=original;release(color);release(maps?.normal);release(maps?.spec)}
    };
    const compare=(left,right)=>report.comparisons.push({left,right,maps:Object.fromEntries(channels.map((channel,i)=>[channel,compact(snapshots.get(left)[i],snapshots.get(right)[i],width)]))});
    const cachePixels=art=>new Map([...art.normalTransformCache].map(([key,c])=>[key,{width:c.width,height:c.height,bytes:c.getContext('2d').getImageData(0,0,c.width,c.height).data}]));
    const compareCaches=(a,b)=>{
      const out={shared:0,missingWarm:[],missingFresh:[],mismatched:[],totalMismatchBytes:0};
      for(const [key,left] of a){const right=b.get(key);if(!right){out.missingFresh.push(key);continue}out.shared++;
        if(left.width!==right.width||left.height!==right.height){out.mismatched.push({key,dimensions:[[left.width,left.height],[right.width,right.height]]});continue}
        const diff=compact(left.bytes,right.bytes,left.width);out.totalMismatchBytes+=diff.bytes;if(diff.bytes)out.mismatched.push({key,...diff});
      }
      for(const key of b.keys())if(!a.has(key))out.missingWarm.push(key);
      out.mismatched=out.mismatched.slice(0,8);return out;
    };
    const sample=(source,name,forceCPU)=>{
      const canvas=new OffscreenCanvas(width,height),ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:forceCPU});
      try{
        const [w,h]=game.art.worldSize(name);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
        ctx.scale(width/640,height/360);ctx.globalAlpha=.94;ctx.translate(120,306);ctx.scale(-1,1);
        ctx.drawImage(source,0,0,source.width,source.height,-w/2,-h,w,h);
        const gpu=uploadReference(g,canvas,width,height),cpu=ctx.getImageData(0,0,width,height).data;
        return{gpu,cpu,attributes:ctx.getContextAttributes()};
      }finally{release(canvas)}
    };
    try{
      snapshots.set('runtime',actual.maps);snapshots.set('first-legacy-reference',firstLegacy);
      report.normalCaches.before=metadata(game.art);
      render('current-shared-1',null,game.art);render('legacy-shared-1',legacyFullBuild,game.art);
      render('current-shared-2',null,game.art);render('legacy-shared-2',legacyFullBuild,game.art);
      const a=newArt(),b=newArt(),c=newArt(),d=newArt(),cpuArt=newArt();
      render('current-cold-A',null,a);render('legacy-warm-A',legacyFullBuild,a);
      render('legacy-cold-B',legacyFullBuild,b);render('current-warm-B',null,b);
      render('current-cold-C',null,c);render('legacy-cold-D',legacyFullBuild,d);
      render('current-shared-cpu',null,game.art,true);render('legacy-shared-cpu',legacyFullBuild,game.art,true);
      render('legacy-cold-cpu',legacyFullBuild,cpuArt,true);render('current-warm-cpu',null,cpuArt,true);
      for(const pair of [
        ['runtime','current-shared-1'],['current-shared-1','legacy-shared-1'],['current-shared-1','current-shared-2'],['legacy-shared-1','legacy-shared-2'],
        ['current-cold-A','legacy-warm-A'],['legacy-cold-B','current-warm-B'],['current-cold-A','current-cold-C'],['legacy-cold-B','legacy-cold-D'],
        ['first-legacy-reference','legacy-cold-B'],['runtime','current-cold-A'],['current-cold-A','current-warm-B'],
        ['current-shared-cpu','legacy-shared-cpu'],['legacy-cold-cpu','current-warm-cpu'],['current-shared-cpu','current-warm-cpu'],['current-shared-2','current-shared-cpu']
      ])compare(...pair);
      report.normalCaches.warm=metadata(game.art);report.normalCaches.fresh=metadata(a);
      const warmPixels=cachePixels(game.art),freshPixels=cachePixels(a);
      report.normalCaches.pixelComparison=compareCaches(warmPixels,freshPixels);
      render('current-shared-after-cache-read',null,game.art);compare('current-shared-2','current-shared-after-cache-read');
      const priority=['blocker_mixed_27|1|0.000000','foliage_v391_17|1|0.000000','blocker_foliage_01|1|0.000000'];
      const keys=[...priority.filter(key=>game.art.normalTransformCache.has(key)),...[...game.art.normalTransformCache.keys()].filter(key=>!priority.includes(key))].slice(0,3);
      for(const key of keys){
        const [name,flip,rotation]=key.split('|'),warm=game.art.normalTransformCache.get(key),fresh=b.transformedNormal(name,flip==='1',Number(rotation));
        const warmDefault=sample(warm,name,false),freshDefault=sample(fresh,name,false),repeatDefault=sample(warm,name,false),warmCPU=sample(warm,name,true),freshCPU=sample(fresh,name,true);
        report.sourceSampling.push({key,sourceAttributes:warm.getContext('2d').getContextAttributes(),defaultAttributes:warmDefault.attributes,cpuAttributes:warmCPU.attributes,
          sourcePixels:compact(warm.getContext('2d').getImageData(0,0,warm.width,warm.height).data,fresh.getContext('2d').getImageData(0,0,fresh.width,fresh.height).data,warm.width),
          warmVsFreshDefault:compact(warmDefault.gpu,freshDefault.gpu,width),warmDefaultRepeat:compact(warmDefault.gpu,repeatDefault.gpu,width),
          warmVsFreshCPU:compact(warmCPU.gpu,freshCPU.gpu,width),warmDefaultVsCPU:compact(warmDefault.gpu,warmCPU.gpu,width),
          canvasWarmVsFreshDefault:compact(warmDefault.cpu,freshDefault.cpu,width),canvasWarmVsFreshCPU:compact(warmCPU.cpu,freshCPU.cpu,width)});
      }
      return report;
    }finally{
      for(const art of temporaryArts)for(const cache of [art.tintCache,art.normalTransformCache]){for(const canvas of cache.values())release(canvas);cache.clear()}
    }
  }

  function parity(label,before=null,uploads=[]){
    const actual=capture(),expected=reference(),result={};
    for(let c=0;c<channels.length;c++){
      const diff=differences(actual.maps[c],expected[c],actual.width);result[channels[c]]=diff;
      check(diff.bytes===0,label+' '+channels[c]+' full GPU texture differs: '+JSON.stringify(diff));
      if(before){
        check(before.width===actual.width&&before.height===actual.height,label+' exterior dimensions changed');
        const rects=uploads.filter(u=>u.channel===channels[c]);let changedOutside=0,coveredAlphaPixels=0;
        for(let y=0;y<actual.height;y++)for(let x=0;x<actual.width;x++){
          const i=(y*actual.width+x)*4;
          if(rects.some(u=>x>=u.x&&x<u.x+u.width&&y>=u.y&&y<u.y+u.height)){if(actual.maps[c][i+3])coveredAlphaPixels++;continue}
          for(let k=0;k<4;k++)if(before.maps[c][i+k]!==actual.maps[c][i+k])changedOutside++;
        }
        check(changedOutside===0,label+' '+channels[c]+' changed bytes outside actual subuploads');
        result[channels[c]].changedOutside=changedOutside;
        result[channels[c]].coveredAlphaPixels=coveredAlphaPixels;
      }
    }
    check(game.renderer.gl.getError()===game.renderer.gl.NO_ERROR,label+' WebGL error');
    return result;
  }

  function instrument(action){
    const r=game.renderer,g=r.gl,painter=game.painter,canvasRefs=[];
    const stats={fullBuilds:0,patchBuilds:0,floorCalls:0,fullUploads:[],subUploads:[],readbacks:[],patchCanvases:[],actorInitializations:0};
    const original={build:painter.build,patch:painter.buildPatch,tile:painter.baseTile,image:g.texImage2D,sub:g.texSubImage2D,
      creature:game.creatures.init,mini:game.miniGuides.init};
    const contextPrototype=Object.getPrototypeOf(new OffscreenCanvas(1,1).getContext('2d'));
    original.read=contextPrototype.getImageData;
    const actors={creatures:game.creatures.units,mini:game.miniGuides.units,creatureData:JSON.stringify(game.creatures.units),miniData:JSON.stringify(game.miniGuides.units)};
    const water={field:r.surfaceFX.water.rebuilds,legacy:r.waterMaskFullUploads||0};
    const channel=()=>{const bound=g.getParameter(g.TEXTURE_BINDING_2D),i=textureKeys.findIndex(key=>r[key]===bound);return i<0?null:channels[i]};
    painter.build=function(...args){stats.fullBuilds++;return original.build.apply(this,args)};
    if(original.patch)painter.buildPatch=function(...args){
      stats.patchBuilds++;const color=original.patch.apply(this,args),maps=this.lastMaterialMaps;
      for(const canvas of [color,maps?.normal,maps?.spec])if(canvas){canvasRefs.push(canvas);stats.patchCanvases.push({width:canvas.width,height:canvas.height})}
      return color;
    };
    painter.baseTile=function(...args){stats.floorCalls++;return original.tile.apply(this,args)};
    g.texImage2D=function(...args){const name=channel();if(name)stats.fullUploads.push({channel:name});return original.image.apply(this,args)};
    g.texSubImage2D=function(...args){
      const name=channel();if(name){const source=args.length===7?args[6]:null;
        stats.subUploads.push({channel:name,x:args[2],y:args[3],width:source?source.width:args[4],height:source?source.height:args[5]});
      }
      return original.sub.apply(this,args);
    };
    contextPrototype.getImageData=function(...args){stats.readbacks.push({canvasWidth:this.canvas.width,canvasHeight:this.canvas.height,width:args[2],height:args[3]});return original.read.apply(this,args)};
    game.creatures.init=function(...args){stats.actorInitializations++;return original.creature.apply(this,args)};
    game.miniGuides.init=function(...args){stats.actorInitializations++;return original.mini.apply(this,args)};
    try{action()}finally{
      painter.build=original.build;if(original.patch)painter.buildPatch=original.patch;painter.baseTile=original.tile;
      g.texImage2D=original.image;g.texSubImage2D=original.sub;contextPrototype.getImageData=original.read;
      game.creatures.init=original.creature;game.miniGuides.init=original.mini;
      stats.releasedPatchCanvases=canvasRefs.every(c=>c.width===1&&c.height===1);
    }
    stats.actorsUnchanged=stats.actorInitializations===0&&actors.creatures===game.creatures.units&&actors.mini===game.miniGuides.units&&
      actors.creatureData===JSON.stringify(game.creatures.units)&&actors.miniData===JSON.stringify(game.miniGuides.units);
    stats.waterFullRebuilds=r.surfaceFX.water.rebuilds-water.field;
    stats.waterFullUploads=(r.waterMaskFullUploads||0)-water.legacy;
    stats.diagnostics={...game.staticRefreshStats};
    return stats;
  }

  function authority(label){
    const room=game.room,raw=rmfEditor.rawRoom(),water=new Set((raw.water||[]).map(p=>p.join(','))),paths=new Set((raw.path_cells||[]).map(p=>p.join(','))),walls=new Set((raw.walls||[]).map(p=>p.join(',')));
    for(const [expected,actual,name] of [[water,room.water,'water'],[paths,room.paths,'paths'],[walls,room.walls,'walls']]){
      check(expected.size===actual.size&&[...expected].every(k=>actual.has(k)),label+' stale '+name+' authority');
    }
    for(let y=0;y<19;y++)for(let x=0;x<40;x++){
      const key=x+','+y,wet=water.has(key)&&!room.bridgeOpen(key),blocked=room.border.has(key)||walls.has(key)||wet;
      check(room.blocked([x,y])===blocked,label+' stale collision '+key);
      check(game.waterAuthority[y*40+x]===(wet?1:0),label+' stale water authority '+key);
    }
  }

  function measured(label,action,mode='patch',options={}){
    const before=mode==='patch'||mode==='noop'?capture():null,work=instrument(action),r=game.renderer,area=r.nativeW*r.nativeH;
    check(work.diagnostics.mode===mode,label+' expected '+mode+' diagnostics: '+JSON.stringify(work.diagnostics));
    if(options.actors!==false)check(work.actorsUnchanged,label+' reset or moved unrelated actors');
    if(mode==='patch'){
      check(work.fullBuilds===0&&work.fullUploads.length===0,label+' full build or texture replacement in eligible edit');
      check(work.patchBuilds>0&&work.floorCalls>0&&work.floorCalls<760,label+' floor raster work is not bounded');
      check(work.releasedPatchCanvases,label+' retained static scratch backing');
      check(work.patchCanvases.length===work.patchBuilds*3&&work.patchCanvases.every(c=>c.width*c.height<area),label+' scratch map dimensions are not bounded');
      check(work.readbacks.every(c=>c.width*c.height<area),label+' full-size Canvas2D readback');
      check(!game.currentStatic&&!game.painter.lastMaterialMaps,label+' retained full static backing');
      check(work.diagnostics.scratchPixels>0&&work.diagnostics.scratchPixels<area&&work.diagnostics.scratchBytes>0&&work.diagnostics.scratchBytes<area*12,label+' scratch diagnostics are not bounded');
      const shape=channel=>work.subUploads.filter(u=>u.channel===channel).map(u=>[u.x,u.y,u.width,u.height]);
      for(const name of channels){const uploads=work.subUploads.filter(u=>u.channel===name),pixels=uploads.reduce((n,u)=>n+u.width*u.height,0);
        check(uploads.length>0&&pixels>0&&pixels<area,label+' '+name+' uploads are not bounded');
        check(uploads.every(u=>Number.isInteger(u.x)&&Number.isInteger(u.y)&&u.x>=0&&u.y>=0&&u.width>0&&u.height>0&&u.x+u.width<=r.nativeW&&u.y+u.height<=r.nativeH),label+' '+name+' invalid native upload rectangle');
        check(JSON.stringify(shape(name))===JSON.stringify(shape('color')),label+' incoherent color/material output regions');
      }
      check(work.diagnostics.rasterCells===work.floorCalls&&work.diagnostics.uploadCalls===work.subUploads.length&&
        work.diagnostics.uploadBytes===work.subUploads.reduce((n,u)=>n+u.width*u.height*4,0),label+' bounded-work diagnostics do not match executed work');
      check(work.diagnostics.retainedScratchPixels===0,label+' reports retained static scratch');
      check(work.waterFullRebuilds===0&&work.waterFullUploads===0,label+' regressed PERF-003 bounded water');
    }else if(mode==='noop')check(work.fullBuilds===0&&work.patchBuilds===0&&work.fullUploads.length===0&&work.subUploads.length===0,label+' unchanged authority did rendering work');
    else check(work.fullBuilds>=1&&channels.every(c=>work.fullUploads.some(u=>u.channel===c)),label+' full fallback did not repair all maps');
    if(options.authority!==false)authority(label);
    const textures=parity(label,before,work.subUploads);
    if(options.materials)check(textures.normal.coveredAlphaPixels>0&&textures.specular.coveredAlphaPixels>0,label+' did not actually overlap material pixels');
    const water=options.water!==false&&root.auditWater?root.auditWater.parity(label):null;
    return {label,...work,textures,water:water?{mode:water.mode,maskMismatch:water.maskMismatch,fieldMismatch:water.fieldMismatch,fieldGpuMismatch:water.fieldGpuMismatch,legacyGpuMismatch:water.legacyGpuMismatch}:null};
  }

  function setNative(width,height){
    const c=game.renderer.c,box=c.getBoundingClientRect(),dpr=Math.max(1,root.devicePixelRatio||1);
    c.getBoundingClientRect=()=>({x:box.x,y:box.y,left:box.left,top:box.top,right:box.left+width/dpr,bottom:box.top+height/dpr,width:width/dpr,height:height/dpr});
    game.renderer.resizeToDisplaySize(true);
    check(game.renderer.nativeW===width&&game.renderer.nativeH===height,'requested native fixture size was capped');
  }

  function setup(width,height,sourceMaps){
    const e=rmfEditor;
    if(e.transaction)e.cancelTransaction();e.clearPendingInvalidation();e.resetPointerState();
    game.maps=structuredClone(sourceMaps);game.state.completed=new Set(['pip']);game.graphics={...game.graphics,waterQuality:3};
    const raw=game.maps.rooms.quiet_nest,veg=(game.art.roles.foliage_v391||game.art.roles.foliage_mix)[0];
    raw.walls=[[20,10],[23,11]];raw.blocker_styles={'20,10':{sprite:'candelabra_small',kind:'blocker'},'23,11':{sprite:veg,kind:'blocker'}};
    for(let y=4;y<=5;y++)for(let x=6;x<=9;x++){raw.walls.push([x,y]);raw.blocker_styles[x+','+y]={sprite:veg,kind:'blocker'}}
    raw.editor_decor=raw.editor_decor||[];raw.large_trees=[];raw.water=[[11,6],[12,6],[29,12]];raw.path_cells=[[13,6],[14,6],[18,10]];
    raw.decor_lamps=[{tile:[10,8],lamp:'lamp_blue'},{tile:[28,13],lamp:'lamp_blue'}];
    raw.decor_exclusions=[];raw.pattern_exclusions=[];raw.floor_microtile=4;raw.bridge_cells=[];raw.bridge_segments=[];raw.bridge_phases=[];
    game.rooms=game.storyData.rooms.map((spec,i)=>new Room(i,spec,game.maps));e.history=new Map();
    setNative(width,height);game.enterRoom(game.storyData.rooms.findIndex(s=>s.key==='quiet_nest'),null);
    document.querySelector('#storyModal')?.classList.add('hidden');e.toggle(true);game.x=80;game.y=200;
    check(game.room.spec.pattern==='nest','quiet_nest pattern fixture changed');
    return parity('initial '+width+'x'+height);
  }

  function paint(kind,x,y){const e=rmfEditor;e.choice={kind};e.paintVisited.clear();e.paintAt({x:x*16+8,y:y*16+8})}
  function transaction(label,fn){const e=rmfEditor;e.beginTransaction(label);fn();e.commitTransaction()}
  function invalidation(){rmfEditor.queueInvalidation(RelayEditorInvalidation.TERRAIN,{sync:true})}

  function legacyCompatibility(sourceMaps){
    const out=[];
    const qualify=(qualification,actual,expected)=>{
      const textures={};
      for(let c=0;c<channels.length;c++){
        const diff=differences(actual.maps[c],expected[c],actual.width);textures[channels[c]]=diff;
        if(diff.bytes){
          try{root.__staticRasterDiagnostics={qualification,...rasterDiagnostics(actual,expected)}}catch(error){root.__staticRasterDiagnostics={qualification,diagnosticError:String(error),stack:error?.stack}}
          check(false,qualification+' full builder changed accepted composition '+game.room.key+' '+actual.width+'x'+actual.height+' '+channels[c]+' '+JSON.stringify(diff)+'\nPERF-004 raster diagnostics '+JSON.stringify(root.__staticRasterDiagnostics));
        }
      }
      return textures;
    };
    rmfEditor.clearPendingInvalidation();game.maps=structuredClone(sourceMaps);game.state.completed=new Set(['pip']);
    game.rooms=game.storyData.rooms.map((spec,i)=>new Room(i,spec,game.maps));
    for(const [width,height] of [[640,360],[997,563]]){
      setNative(width,height);
      for(let index=0;index<game.rooms.length;index++){
        game.enterRoom(index,null);document.querySelector('#storyModal')?.classList.add('hidden');
        const actual=capture(),textures=qualify('warm shared sources',actual,reference(legacyFullBuild));
        const coldCurrent=reference(null,{freshCaches:true}),coldLegacy=reference(legacyFullBuild,{freshCaches:true});
        const coldIndependentTextures=qualify('cold independent sources',{width,height,maps:coldCurrent},coldLegacy);
        out.push({room:game.room.key,native:[width,height],textures,coldIndependentTextures});
      }
    }
    return out;
  }

  function negativeControls(sourceMaps){
    setup(640,360,sourceMaps);const out=[],r=game.renderer,g=r.gl;
    for(let channel=0;channel<channels.length;channel++){
      const before=capture(),pixel=before.maps[channel].slice(0,4),binding=g.getParameter(g.TEXTURE_BINDING_2D),flip=g.getParameter(g.UNPACK_FLIP_Y_WEBGL);
      pixel[0]^=128;
      try{g.bindTexture(g.TEXTURE_2D,r[textureKeys[channel]]);g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.texSubImage2D(g.TEXTURE_2D,0,0,0,1,1,g.RGBA,g.UNSIGNED_BYTE,pixel)}
      finally{g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,flip);g.bindTexture(g.TEXTURE_2D,binding)}
      let caught=false;
      try{parity('intentional corruption')}catch(error){caught=String(error).includes(channels[channel]+' full GPU texture differs');if(!caught)throw error}
      check(caught,'whole-texture oracle accepted '+channels[channel]+' corruption');
      out.push({channel:channels[channel],corruptionRejected:caught});game.ensureBackground(true);
    }
    return out;
  }

  function eligibleCases(width,height,sourceMaps){
    const result={native:[width,height],initial:setup(width,height,sourceMaps),cases:[]},out=result.cases,e=rmfEditor;
    out.push(measured('water to ground',()=>transaction('PERF-004 clear water',()=>paint('clear',11,6))));
    out.push(measured('ground to water',()=>transaction('PERF-004 paint water',()=>paint('water',11,6))));
    out.push(measured('path to ground',()=>transaction('PERF-004 clear path',()=>paint('clear',13,6))));
    out.push(measured('ground to path under lamp and glow',()=>transaction('PERF-004 lamp overlap',()=>paint('path',10,7)),'patch',{materials:true}));
    out.push(measured('ground to water under pattern materials',()=>transaction('PERF-004 swirl overlap',()=>paint('water',19,10)),'patch',{materials:true}));
    out.push(measured('adjacent repeated edits and blocker footprint',()=>transaction('PERF-004 adjacent',()=>{paint('water',19,11);paint('path',20,11);paint('water',19,11)}),'patch',{materials:true}));
    out.push(measured('disjoint asymmetric changes',()=>transaction('PERF-004 disjoint',()=>{paint('path',3,13);paint('water',34,3)})));
    out.push(measured('bottom edge beneath border overlay',()=>transaction('PERF-004 bottom edge',()=>paint('path',20,17))));
    const beforeWater=JSON.stringify(e.rawRoom().water),counts=e.getInvalidationDiagnostics().counters;
    out.push(measured('same-count move; 40 events; synchronous pointerup',()=>{
      e.beginTransaction('PERF-004 same-count water move');const raw=e.rawRoom(),i=raw.water.findIndex(p=>p[0]===11&&p[1]===6);
      check(i>=0,'same-count source missing');raw.water[i]=[10,6];
      for(let n=0;n<40;n++)e.queueInvalidation(RelayEditorInvalidation.TERRAIN);
      const queued=e.getInvalidationDiagnostics();check(queued.pending&&queued.counters.flushes===counts.flushes&&queued.counters.scheduled===counts.scheduled+1,'terrain events failed to coalesce');
      e.pointerDown=true;e.pointerId=415004;e.dragMode='paint';const box=e.overlay.getBoundingClientRect();
      e.overlay.dispatchEvent(new PointerEvent('pointerup',{pointerId:415004,button:0,clientX:box.left+box.width*.4,clientY:box.top+box.height*.4,bubbles:true}));
      const committed=e.getInvalidationDiagnostics();check(!committed.pending&&!e.transaction&&committed.counters.flushes===counts.flushes+1,'pointerup failed final synchronous flush');
      check(e.rawRoom().water.length===JSON.parse(beforeWater).length&&JSON.stringify(e.rawRoom().water)!==beforeWater,'same-count edit did not change identity');
    }));
    const afterWater=JSON.stringify(e.rawRoom().water);
    out.push(measured('undo same-count move',()=>{check(e.undoOne(),'undo unavailable');check(JSON.stringify(e.rawRoom().water)===beforeWater,'undo changed source history')}));
    out.push(measured('redo same-count move',()=>{check(e.redoOne(),'redo unavailable');check(JSON.stringify(e.rawRoom().water)===afterWater,'redo changed source history')}));
    out.push(measured('unchanged terrain refresh',()=>invalidation(),'noop'));
    const beforeCancel=JSON.stringify(e.rawRoom());
    out.push(measured('cancel queued unrendered gesture',()=>{e.beginTransaction('PERF-004 cancel before frame');paint('path',26,7);e.cancelGesture();check(JSON.stringify(e.rawRoom())===beforeCancel,'queued cancellation lost source data')},'noop'));
    const history=e.historyFor().undo.length;
    out.push(measured('render active gesture preview',()=>{e.beginTransaction('PERF-004 cancel rendered preview');paint('water',26,7);e.flushInvalidation()}));
    out.push(measured('cancel rendered gesture restores textures',()=>{e.cancelGesture();check(JSON.stringify(e.rawRoom())===beforeCancel&&e.historyFor().undo.length===history,'preview cancellation changed history')}));
    out.push(measured('save synchronously flushes pending transaction',()=>{e.beginTransaction('PERF-004 pending save');paint('path',26,7);e.flushForPersistence();check(!e.transaction&&!e.getInvalidationDiagnostics().pending,'save left pending authority')}));
    for(const microtile of [8,16]){
      e.rawRoom().floor_microtile=microtile;invalidation();
      out.push(measured('microtile '+microtile+' path to water under materials',()=>transaction('PERF-004 supported microtile water',()=>paint('water',10,7)),'patch',{materials:true}));
      out.push(measured('microtile '+microtile+' water to path under materials',()=>transaction('PERF-004 supported microtile path',()=>paint('path',10,7)),'patch',{materials:true}));
    }
    e.rawRoom().floor_microtile=4;invalidation();
    // An intentionally open last border tile makes the changed floor cross the
    // PLAY_H seam. This exercises the footer's different material/color order.
    game.room.border.delete('20,18');game.ensureBackground(true);
    out.push(measured('open bottom cell crossing footer boundary',()=>{game.room.paths.add('20,18');e.rawRoom().path_cells.push([20,18]);game.refreshEditorStatic()},'patch',{authority:false,water:false}));
    return result;
  }

  function naturalCases(sourceMaps){
    const out=[],e=rmfEditor;
    for(const [width,height] of [[640,360],[997,563]])for(const roomKey of ['dawn_tree','fern_hollow']){
      if(e.transaction)e.cancelTransaction();e.clearPendingInvalidation();e.resetPointerState();
      game.maps=structuredClone(sourceMaps);game.state.completed=new Set(['pip']);game.graphics={...game.graphics,waterQuality:3};
      game.rooms=game.storyData.rooms.map((spec,index)=>new Room(index,spec,game.maps));e.history=new Map();setNative(width,height);
      const index=game.storyData.rooms.findIndex(spec=>spec.key===roomKey);check(index>=0,'natural room fixture missing '+roomKey);
      game.enterRoom(index,null);document.querySelector('#storyModal')?.classList.add('hidden');e.toggle(true);
      // Keep natural authored content and existing cache caps/order intact. A
      // visible ground cell must have no other dependency that paintAt removes.
      const candidates=[];
      for(let y=2;y<17;y++)for(let x=2;x<38;x++){
        const key=x+','+y,room=game.room;
        if(room.border.has(key)||room.walls.has(key)||room.water.has(key)||room.paths.has(key)||room.bridgeCells.has(key)||room.blockerStyles[key]||room.decorExclusions.has(key))continue;
        if(room.largeTrees.some(tree=>tree.tile?.[0]===x&&tree.tile?.[1]===y))continue;
        candidates.push([x,y]);
      }
      candidates.sort((a,b)=>Math.hypot(a[0]-20,a[1]-9)-Math.hypot(b[0]-20,b[1]-9)||a[1]-b[1]||a[0]-b[0]);
      check(candidates.length>=2,'natural room has fewer than two eligible dry ground cells '+roomKey);
      const cases=[];
      for(const [kind,tile] of [['path',candidates[0]],['water',candidates[1]]]){
        const label=roomKey+' '+width+'x'+height+' natural ground to '+kind;
        cases.push({tile,kind,...measured(label,()=>transaction('PERF-004 '+label,()=>paint(kind,tile[0],tile[1])))});
      }
      out.push({room:roomKey,native:[width,height],cases});
    }
    return out;
  }

  function fallbackCases(sourceMaps){
    setup(640,360,sourceMaps);const e=rmfEditor,out=[];
    const full=(label,mutate,reason=null)=>{const entry=measured(label,()=>{mutate();invalidation()},'full');if(reason)check(entry.diagnostics.reason===reason,label+' used incidental fallback '+entry.diagnostics.reason);out.push(entry)};
    const resourceFull=(label,mutate)=>{
      const old=[...game.art.tintCache.values(),...game.art.normalTransformCache.values()];
      full(label,mutate);const active=new Set([...game.art.tintCache.values(),...game.art.normalTransformCache.values()]);
      const entry=out[out.length-1];entry.cacheInvalidation={canvasesBefore:old.length,released:old.filter(c=>c.width===1&&c.height===1).length,retained:old.filter(c=>active.has(c)).length};
      check(old.length>0&&entry.cacheInvalidation.released===old.length&&entry.cacheInvalidation.retained===0,label+' retained stale derived source canvases');
    };
    full('water brush removes blocker and material',()=>paint('water',20,10));
    full('vegetation overlap threshold four to three',()=>paint('water',9,5));
    full('vegetation overlap threshold three to four',()=>{e.placeTile({kind:'blocker',sprite:game.art.roles.foliage_v391[0]},9,5)});
    full('blocker style identity changes at same cell',()=>{e.rawRoom().blocker_styles['23,11'].sprite='candelabra_wide'});
    full('tree addition requires full composition',()=>e.placeTile({kind:'tree',sprite:(game.art.roles.trees||[])[0]||'tree_v391_00'},24,11));
    full('tree metadata changes without wall changes',()=>{e.rawRoom().large_trees[0].canopy_scale=1.1});
    full('water brush removes tree',()=>paint('water',24,11));
    full('mounted lamp change',()=>{e.rawRoom().decor_lamps[0].lamp='lamp_pink'});
    full('decor exclusion change',()=>{e.rawRoom().decor_exclusions.push([7,4])});
    full('pattern exclusion change',()=>{e.rawRoom().pattern_exclusions.push('nest:swirl')});
    full('bridge topology changes with equal floor colors',()=>{e.rawRoom().bridge_cells.push([11,6])});
    out.push(measured('border authority changes',()=>{game.room.border.add('30,10');game.refreshEditorStatic()},'full',{authority:false,water:false}));
    e.rebindRoomData();game.refreshEditorStatic();
    const pattern=game.room.spec.pattern;
    try{full('room pattern change',()=>{game.room.spec.pattern='lane'})}finally{game.room.spec.pattern=pattern}
    // Reestablish the original pattern before testing a different dependency.
    game.refreshEditorStatic();
    full('floor microtile change',()=>{e.rawRoom().floor_microtile=8});
    const lut=game.luts.lut('ground'),color=lut[40];
    try{full('LUT color edit with unchanged theme signature',()=>{lut[40]=color==='#19AB61'?'#BD3163':'#19AB61'})}finally{lut[40]=color}
    game.refreshEditorStatic();
    for(const field of ['normalImg','specImg']){
      const original=game.art[field];
      try{resourceFull(field+' source removed',()=>{game.art[field]=null})}finally{game.art[field]=original}
      resourceFull(field+' source restored',()=>{});
    }
    const image=game.art.img;
    try{resourceFull('atlas image identity changes',()=>{game.art.img=game.art.specImg})}finally{game.art.img=image}
    resourceFull('atlas image identity restored',()=>{});
    const scale=game.art.worldScale;
    try{resourceFull('atlas metadata changes in place',()=>{game.art.worldScale=scale*1.01})}finally{game.art.worldScale=scale}
    game.refreshEditorStatic();
    full('source identity replacement with equal content',()=>{game.maps=structuredClone(game.maps)});
    full('missing rendered baseline',()=>{game.staticTerrainSnapshot=null});
    full('stale renderer revision',()=>{game.renderer.backgroundRevision++});
    full('large edit budget',()=>{for(let x=3;x<30;x++)e.placeTile({kind:'water'},x,14)},'changed-cell-budget');
    // Nine separated small edits exceed the region cap without reaching the
    // changed-cell limit, making fragmentation a separately exercised fallback.
    full('fragmented edit budget',()=>{for(const y of [2,8,16])for(const x of [3,16,35])e.placeTile({kind:'water'},x,y)},'fragmentation');
    out.push(measured('native resize invalidates baseline',()=>{setNative(997,563);game.ensureBackground()},'full',{authority:false,water:false}));
    out.push(measured('room entry invalidates baseline',()=>{game.enterRoom(1,null);document.querySelector('#storyModal')?.classList.add('hidden')},'full',{actors:false}));
    return out;
  }

  function recoveryCases(sourceMaps){
    setup(640,360,sourceMaps);const e=rmfEditor,g=game.renderer.gl,out=[];
    out.push(measured('second subupload fails; synchronous full repair',()=>{
      const upload=g.texSubImage2D;let calls=0;
      g.texSubImage2D=function(...args){const t=g.getParameter(g.TEXTURE_BINDING_2D);if(textureKeys.some(k=>game.renderer[k]===t)&&++calls===2)throw Error('PERF-004 injected second-map failure');return upload.apply(this,args)};
      try{transaction('PERF-004 recover subupload',()=>paint('water',16,12))}finally{g.texSubImage2D=upload}
      check(calls===2,'subupload fault fixture did not trigger');
    },'full'));
    const originalSub=g.texSubImage2D,originalImage=g.texImage2D;let calls=0,repairFailed=false;
    try{
      g.texSubImage2D=function(...args){const t=g.getParameter(g.TEXTURE_BINDING_2D);if(textureKeys.some(k=>game.renderer[k]===t)&&++calls===2)throw Error('PERF-004 injected subupload failure before repair failure');return originalSub.apply(this,args)};
      g.texImage2D=function(...args){const t=g.getParameter(g.TEXTURE_BINDING_2D);if(textureKeys.some(k=>game.renderer[k]===t))throw Error('PERF-004 injected full repair failure');return originalImage.apply(this,args)};
      e.placeTile({kind:'path'},17,12);
      try{invalidation()}catch(error){check(String(error).includes('PERF-004 injected'),'unexpected repair failure '+error);repairFailed=true}
    }finally{g.texSubImage2D=originalSub;g.texImage2D=originalImage}
    check(repairFailed&&game.staticTerrainSnapshot==null&&!game.bgKey,'failed repair retained a trusted rendered baseline');
    out.push(measured('retry after failed full repair',()=>invalidation(),'full'));
    out.push(measured('eligible edit after recovery',()=>transaction('PERF-004 recovered baseline',()=>paint('water',18,12))));
    return out;
  }

  function ownershipCases(sourceMaps){
    setup(640,360,sourceMaps);const e=rmfEditor,out=[];
    const live=(label,action)=>{
      const before=capture(),work=instrument(action);
      check(work.fullBuilds===0&&work.patchBuilds===0&&work.fullUploads.length===0&&work.subUploads.length===0,label+' rebaked static presentation');
      check(work.actorsUnchanged,label+' reset unrelated actors');
      out.push({label,...work,textures:parity(label,before,[])});
    };
    live('authored decor remains live',()=>{e.rawRoom().editor_decor.push({editor_id:'perf004_live',x:320,y:200,sprite:'flower_blue',alpha:.6,scale:.8});e.queueInvalidation(RelayEditorInvalidation.PRESENTATION|RelayEditorInvalidation.ROOM_DATA,{sync:true})});
    live('objective position remains live',()=>{const id=game.room.spec.objects[0].object_id;e.rawRoom().objects[id]=[17,12];e.queueInvalidation(RelayEditorInvalidation.OBJECTS|RelayEditorInvalidation.PRESENTATION,{sync:true})});
    const index=game.storyData.rooms.findIndex(s=>s.key==='tin_stream');
    game.maps.rooms.tin_stream=structuredClone(sourceMaps.rooms.tin_stream);game.rooms[index]=new Room(index,game.storyData.rooms[index],game.maps);
    game.state.completed=new Set(['pip']);game.enterRoom(index,null);document.querySelector('#storyModal')?.classList.add('hidden');
    for(const object of game.room.spec.objects){
      const before=capture(),work=instrument(()=>{[game.x,game.y]=game.room.center(game.room.objects[object.object_id]);game.checkObjectives()});
      check(game.state.isDone(object.object_id),'bridge objective did not complete');
      check(work.fullBuilds===0&&work.patchBuilds===0&&work.fullUploads.length===0&&work.subUploads.length===0,'bridge progression rebaked static backing');
      check(work.waterFullRebuilds===0&&work.waterFullUploads===0,'bridge progression regressed bounded water');authority(object.object_id);
      out.push({label:'bridge '+object.object_id,...work,textures:parity(object.object_id,before,[]),water:root.auditWater?.parity(object.object_id)});
    }
    return out;
  }

  function run(){
    check(root.RelayStaticTerrain,'static planner module is not loaded');
    const e=rmfEditor,r=game.renderer;
    const saved={maps:game.maps,rooms:game.rooms,index:game.state.room,completed:game.state.completed,graphics:game.graphics,active:e.active,history:e.history,
      rectOwn:Object.prototype.hasOwnProperty.call(r.c,'getBoundingClientRect'),rect:r.c.getBoundingClientRect,choice:e.choice};
    const sourceMaps=structuredClone(root.__json?.['relay_moth_maps.json']||saved.maps);
    try{
      const result={oracle:'clean full StaticPainter composition with production source canvases; all color/normal/specular GPU bytes; exact equality',legacyCompatibility:legacyCompatibility(sourceMaps),negativeControls:negativeControls(sourceMaps),native:[],naturalRooms:[],fallbacks:[],recovery:[],liveOwnership:[]};
      for(const [width,height] of [[640,360],[997,563]])result.native.push(eligibleCases(width,height,sourceMaps));
      result.naturalRooms=naturalCases(sourceMaps);
      result.fallbacks=fallbackCases(sourceMaps);result.recovery=recoveryCases(sourceMaps);result.liveOwnership=ownershipCases(sourceMaps);
      return result;
    }finally{
      if(e.transaction)e.cancelTransaction(false);e.clearPendingInvalidation();e.resetPointerState();
      game.maps=saved.maps;game.rooms=saved.rooms;game.state.completed=saved.completed;game.graphics=saved.graphics;e.history=saved.history;e.choice=saved.choice;
      if(saved.rectOwn)r.c.getBoundingClientRect=saved.rect;else delete r.c.getBoundingClientRect;
      r.resizeToDisplaySize(true);game.enterRoom(saved.index,null);document.querySelector('#storyModal')?.classList.add('hidden');e.toggle(saved.active);
    }
  }

  root.auditStaticTerrain={run,legacyCompatibility,negativeControls,eligibleCases,naturalCases,fallbackCases,recoveryCases,ownershipCases,capture,parity,instrument};
})(globalThis);
