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
  let normalBaseline=null;

  function captureNormalBaseline(action){
    const art=game.art,own=Object.prototype.hasOwnProperty.call(art,'transformedNormal'),original=art.transformedNormal,sources=new Map();
    let calls=0,peakCacheSize=art.normalTransformCache.size;normalBaseline=null;
    art.transformedNormal=function(name,flip=false,rot=0){
      const canvas=original.call(this,name,flip,rot);if(!canvas)return canvas;
      const key=name+'|'+(flip?1:0)+'|'+rot.toFixed(6),previous=sources.get(key);calls++;
      check(!previous||previous.canvas===canvas,'baseline recreated transformed normal source '+key);
      sources.set(key,{canvas,width:canvas.width,height:canvas.height});peakCacheSize=Math.max(peakCacheSize,art.normalTransformCache.size);
      check(peakCacheSize<=96,'transformed normal cache exceeded 96 during baseline');return canvas;
    };
    try{action()}finally{if(own)art.transformedNormal=original;else delete art.transformedNormal}
    normalBaseline={art,room:game.room.key,width:game.renderer.nativeW,height:game.renderer.nativeH,sources,calls,peakCacheSize};
    return assertNormalSources('full baseline');
  }

  function assertNormalSources(label){
    const baseline=normalBaseline,art=game.art;
    check(baseline&&baseline.art===art&&baseline.room===game.room.key&&baseline.width===game.renderer.nativeW&&baseline.height===game.renderer.nativeH,label+' has no matching full normal-source baseline');
    check(baseline.sources.size>0&&art.normalTransformCache.size<=96,label+' transformed normal cache is empty or exceeds 96');
    for(const [key,source] of baseline.sources){
      check(art.normalTransformCache.get(key)===source.canvas,label+' replaced transformed normal source '+key);
      check(source.canvas.width===source.width&&source.canvas.height===source.height,label+' resized borrowed transformed normal source '+key);
    }
    return{uniqueSources:baseline.sources.size,baselineCalls:baseline.calls,baselinePeakCacheSize:baseline.peakCacheSize,cacheSize:art.normalTransformCache.size,stable:true};
  }

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
    const premultiply=g.getParameter(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL),skipPixels=g.getParameter(g.UNPACK_SKIP_PIXELS),skipRows=g.getParameter(g.UNPACK_SKIP_ROWS),texture=g.createTexture();
    try{
      g.bindTexture(g.TEXTURE_2D,texture);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,false);
      g.pixelStorei(g.UNPACK_SKIP_PIXELS,0);g.pixelStorei(g.UNPACK_SKIP_ROWS,0);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,g.RGBA,g.UNSIGNED_BYTE,source);
      return readTexture(g,texture,w,h);
    }finally{
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,flip);g.pixelStorei(g.UNPACK_PREMULTIPLY_ALPHA_WEBGL,premultiply);
      g.pixelStorei(g.UNPACK_SKIP_PIXELS,skipPixels);g.pixelStorei(g.UNPACK_SKIP_ROWS,skipRows);
      g.bindTexture(g.TEXTURE_2D,binding);g.deleteTexture(texture);
    }
  }

  function uploadCroppedReference(g,source,region){
    const binding=g.getParameter(g.TEXTURE_BINDING_2D),flip=g.getParameter(g.UNPACK_FLIP_Y_WEBGL),skipPixels=g.getParameter(g.UNPACK_SKIP_PIXELS),skipRows=g.getParameter(g.UNPACK_SKIP_ROWS);
    const texture=g.createTexture(),{x,y,width,height}=region,rx=region.canvasX??region.rasterX??x,ry=region.canvasY??region.rasterY??y,rh=region.canvasHeight??region.rasterHeight??height;
    try{
      g.bindTexture(g.TEXTURE_2D,texture);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.LINEAR);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.LINEAR);
      g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.pixelStorei(g.UNPACK_SKIP_PIXELS,0);g.pixelStorei(g.UNPACK_SKIP_ROWS,0);
      g.texImage2D(g.TEXTURE_2D,0,g.RGBA,width,height,0,g.RGBA,g.UNSIGNED_BYTE,null);
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,true);g.pixelStorei(g.UNPACK_SKIP_PIXELS,x-rx);g.pixelStorei(g.UNPACK_SKIP_ROWS,rh-(y-ry)-height);
      g.texSubImage2D(g.TEXTURE_2D,0,0,0,width,height,g.RGBA,g.UNSIGNED_BYTE,source);
      return readTexture(g,texture,width,height);
    }finally{
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,flip);g.pixelStorei(g.UNPACK_SKIP_PIXELS,skipPixels);g.pixelStorei(g.UNPACK_SKIP_ROWS,skipRows);
      g.bindTexture(g.TEXTURE_2D,binding);g.deleteTexture(texture);
    }
  }

  function nativeCropCases(){
    const g=game.renderer.gl,width=19,height=17,textures=[],canvases=[],expected=[],out=[];
    const saved={binding:g.getParameter(g.TEXTURE_BINDING_2D),flip:g.getParameter(g.UNPACK_FLIP_Y_WEBGL),skipPixels:g.getParameter(g.UNPACK_SKIP_PIXELS),skipRows:g.getParameter(g.UNPACK_SKIP_ROWS),image:g.texImage2D,sub:g.texSubImage2D};
    const unpack=()=>({flip:g.getParameter(g.UNPACK_FLIP_Y_WEBGL),skipPixels:g.getParameter(g.UNPACK_SKIP_PIXELS),skipRows:g.getParameter(g.UNPACK_SKIP_ROWS)});
    const pattern=(w,h,map,seed)=>{
      const bytes=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){
        const i=(y*w+x)*4;bytes[i]=(37*x+11*y+53*map+seed)%256;bytes[i+1]=(7*x+41*y+29*map+seed*3)%256;bytes[i+2]=(73*x+5*y+47*map+seed*7)%256;bytes[i+3]=255;
      }return bytes;
    };
    const cases=[
      ['interior',{x:6,y:6,width:5,height:4,rasterX:3,rasterY:2,rasterWidth:12,rasterHeight:11}],
      ['clipped-top',{x:2,y:0,width:6,height:3,rasterX:0,rasterY:0,rasterWidth:11,rasterHeight:8}],
      ['clipped-bottom',{x:10,y:14,width:7,height:3,rasterX:7,rasterY:11,rasterWidth:12,rasterHeight:6}],
      ['native-canvas-local-clip',{x:7,y:4,width:5,height:6,rasterX:4,rasterY:2,rasterWidth:11,rasterHeight:11,canvasMode:'native-clip',canvasX:0,canvasY:0,canvasWidth:width,canvasHeight:height}]
    ];
    try{
      g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,false);g.pixelStorei(g.UNPACK_SKIP_PIXELS,0);g.pixelStorei(g.UNPACK_SKIP_ROWS,0);
      for(let map=0;map<3;map++){
        const texture=g.createTexture(),bytes=pattern(width,height,map,193);textures.push(texture);expected.push(bytes.slice());
        g.bindTexture(g.TEXTURE_2D,texture);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MIN_FILTER,g.NEAREST);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_MAG_FILTER,g.NEAREST);
        g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_S,g.CLAMP_TO_EDGE);g.texParameteri(g.TEXTURE_2D,g.TEXTURE_WRAP_T,g.CLAMP_TO_EDGE);
        g.texImage2D(g.TEXTURE_2D,0,g.RGBA,width,height,0,g.RGBA,g.UNSIGNED_BYTE,bytes);
      }
      const renderer=Object.create(game.renderer);Object.assign(renderer,{nativeW:width,nativeH:height,bgTex:textures[0],bgNormalTex:textures[1],bgSpecTex:textures[2],backgroundReady:true,backgroundSize:[width,height],backgroundRevision:0,backgroundUploadCalls:0,backgroundUploadBytes:0});
      for(let index=0;index<cases.length;index++){
        const [label,region]=cases[index],sources=[],sourcePixels=[],cx=region.canvasX??region.rasterX,cy=region.canvasY??region.rasterY,cw=region.canvasWidth??region.rasterWidth,ch=region.canvasHeight??region.rasterHeight;
        for(let map=0;map<1;map++){
          const canvas=new OffscreenCanvas(cw,ch),ctx=canvas.getContext('2d'),bytes=pattern(canvas.width,canvas.height,map,17+index*31),pixels=ctx.createImageData(canvas.width,canvas.height);
          // Opaque bytes make this a crop/addressing oracle; fractional-alpha
          // composition remains covered by the full production material suite.
          pixels.data.set(bytes);ctx.putImageData(pixels,0,0);canvases.push(canvas);sources.push(canvas);sourcePixels.push(bytes);
        }
        const desired={flip:index===1,skipPixels:index+1,skipRows:4-index};
        g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,desired.flip);g.pixelStorei(g.UNPACK_SKIP_PIXELS,desired.skipPixels);g.pixelStorei(g.UNPACK_SKIP_ROWS,desired.skipRows);
        let fullUploads=0;const uploads=[];
        g.texImage2D=function(...args){if(textures.includes(g.getParameter(g.TEXTURE_BINDING_2D)))fullUploads++;return saved.image.apply(this,args)};
        g.texSubImage2D=function(...args){const map=textures.indexOf(g.getParameter(g.TEXTURE_BINDING_2D));if(map>=0)uploads.push({map,argumentCount:args.length,x:args[2],y:args[3],width:args[4],height:args[5],...unpack()});return saved.sub.apply(this,args)};
        try{renderer.patchBackground(region,sources[0])}
        catch(error){root.__staticRasterDiagnostics={kind:'native-asymmetric-crop',label,region,desiredState:desired,restoredState:unpack(),uploads,error:String(error)};throw error}
        finally{g.texImage2D=saved.image;g.texSubImage2D=saved.sub}
        check(JSON.stringify(unpack())===JSON.stringify(desired),'native '+label+' crop did not restore nondefault unpack state');
        check(fullUploads===0&&uploads.length===1&&uploads.every(u=>u.map===0&&u.argumentCount===9&&u.flip===true&&u.x===region.x&&u.y===height-region.y-region.height&&u.width===region.width&&u.height===region.height&&u.skipPixels===region.x-cx&&u.skipRows===ch-(region.y-cy)-region.height),'native '+label+' crop used incorrect upload bounds/state');
        check(renderer.bgNormalTex===textures[1]&&renderer.bgSpecTex===textures[2],'native '+label+' replaced preserved material texture handles');
        const maps={};
        for(let map=0;map<3;map++){
          if(map===0)for(let y=0;y<region.height;y++)for(let x=0;x<region.width;x++){
            const source=((region.y-cy+y)*cw+region.x-cx+x)*4;
            const target=((height-1-region.y-y)*width+region.x+x)*4;
            expected[map].set(sourcePixels[map].subarray(source,source+4),target);
          }
          const diff=differences(readTexture(g,textures[map],width,height),expected[map],width);maps[channels[map]]=diff;
          check(diff.bytes===0,'native '+label+' '+channels[map]+' asymmetric crop differs '+JSON.stringify(diff));
        }
        check(g.getError()===g.NO_ERROR,'native '+label+' crop WebGL error');out.push({label,region,unpackRestored:true,restoredState:unpack(),materialTexturesPreserved:true,uploads,maps});
        for(const canvas of sources)release(canvas);
      }
      return{native:[width,height],cases:out};
    }finally{
      g.texImage2D=saved.image;g.texSubImage2D=saved.sub;g.pixelStorei(g.UNPACK_FLIP_Y_WEBGL,saved.flip);g.pixelStorei(g.UNPACK_SKIP_PIXELS,saved.skipPixels);g.pixelStorei(g.UNPACK_SKIP_ROWS,saved.skipRows);
      g.bindTexture(g.TEXTURE_2D,saved.binding);for(const texture of textures)g.deleteTexture(texture);for(const canvas of canvases)release(canvas);
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

  function patchRasterDiagnostics(actual,expected,uploads){
    const width=actual.width,height=actual.height,sx=width/640,sy=height/360;
    const upload=uploads.find(item=>item.channel==='color');if(!upload)return[];
    const original={x:upload.x,y:height-upload.y-upload.height,width:upload.width,height:upload.height};
    const inputs=(rect,padding=0)=>{
      const rx=padding?Math.max(0,Math.floor((rect.x-padding)/16)*16):rect.x,ry=padding?Math.max(0,Math.floor((rect.y-padding)/16)*16):rect.y;
      const right=padding?Math.min(width,Math.ceil((rect.x+rect.width+padding)/16)*16):rect.x+rect.width;
      const bottom=padding?Math.min(height,Math.ceil((rect.y+rect.height+padding)/16)*16):rect.y+rect.height;
      return{...rect,rasterX:rx,rasterY:ry,rasterWidth:right-rx,rasterHeight:bottom-ry,
        tx0:Math.max(0,Math.floor((rx/sx-4-2/sx)/16)),ty0:Math.max(0,Math.floor((ry/sy-4-2/sy)/16)),
        tx1:Math.min(40,Math.ceil((right/sx+4+2/sx)/16)),ty1:Math.min(19,Math.ceil((bottom/sy+4+2/sy)/16))};
    };
    const aligned=(grid,bottomOrigin)=>{
      const x0=Math.max(0,Math.floor(original.x/grid)*grid),x1=Math.min(width,Math.ceil((original.x+original.width)/grid)*grid);
      const y0=bottomOrigin?Math.max(0,height-Math.ceil((height-original.y)/grid)*grid):Math.max(0,Math.floor(original.y/grid)*grid);
      const y1=bottomOrigin?Math.min(height,height-Math.floor((height-original.y-original.height)/grid)*grid):Math.min(height,Math.ceil((original.y+original.height)/grid)*grid);
      return{x:x0,y:y0,width:x1-x0,height:y1-y0};
    };
    const crop=(bytes,sourceWidth,x,y,w,h)=>{
      const out=new Uint8Array(w*h*4);for(let row=0;row<h;row++)out.set(bytes.subarray(((y+row)*sourceWidth+x)*4,((y+row)*sourceWidth+x+w)*4),row*w*4);return out;
    };
    const originalExpected=expected.map(bytes=>crop(bytes,width,original.x,height-original.y-original.height,original.width,original.height));
    const production=game.staticRefreshStats?.regions?.find(rect=>rect.x===original.x&&rect.y===original.y&&rect.width===original.width&&rect.height===original.height)||inputs(original,32);
    const variants=[['production-1',production,false],['production-2',production,false],['unguarded-original',inputs(original),false],
      ['guard-16',inputs(original,16),false],['guard-32',inputs(original,32),false],['guard-64',inputs(original,64),false],
      ['unguarded-8-top',inputs(aligned(8,false)),false],['unguarded-16-top',inputs(aligned(16,false)),false],
      ['unguarded-8-bottom',inputs(aligned(8,true)),false],['unguarded-16-bottom',inputs(aligned(16,true)),false],['production-cpu',production,true]];
    const out=[];
    for(const [name,region,forceCPU] of variants){
      const painter=new StaticPainter(game.art,game.luts),prototype=OffscreenCanvas.prototype,getContext=prototype.getContext;
      const generationBefore=game.art.normalTransformGeneration;let color=null,maps=null;
      if(forceCPU)prototype.getContext=function(type,options){return getContext.call(this,type,type==='2d'&&this.width===(region.canvasWidth??region.rasterWidth??region.width)&&this.height===(region.canvasHeight??region.rasterHeight??region.height)?{...options,willReadFrequently:true}:options)};
      try{
        color=painter.buildPatch(game.room,game.state,width,height,region);maps=painter.lastMaterialMaps;
        const sources=[color,maps?.normal,maps?.spec],entry={name,region,forceCPU,generationBefore,generationAfter:game.art.normalTransformGeneration,
          colorAttributes:color.getContext('2d').getContextAttributes(),maps:{}};
        for(let c=0;c<channels.length;c++){
          if(!sources[c]){entry.maps[channels[c]]={preserved:true,fullTexture:differences(actual.maps[c],expected[c],width)};continue}
          const bytes=uploadCroppedReference(game.renderer.gl,sources[c],region);
          const fullCrop=crop(expected[c],width,region.x,height-region.y-region.height,region.width,region.height);
          const originalCrop=crop(bytes,region.width,original.x-region.x,region.y+region.height-original.y-original.height,original.width,original.height);
          entry.maps[channels[c]]={wholeRegion:differences(bytes,fullCrop,region.width),originalCrop:differences(originalCrop,originalExpected[c],original.width)};
        }
        out.push(entry);
      }finally{prototype.getContext=getContext;release(color);release(maps?.normal);release(maps?.spec)}
    }
    return out;
  }

  // Diagnostic hypotheses only: isolate the first composition stage which
  // differs without changing the production renderer or the exact pixel gate.
  function compositionStageDiagnostics(actual,uploads,failurePixels){
    const width=actual.width,height=actual.height,first=failurePixels[0];
    const upload=uploads.find(u=>u.channel==='color'&&first&&first.x>=u.x&&first.x<u.x+u.width&&first.y>=u.y&&first.y<u.y+u.height)||uploads.find(u=>u.channel==='color');
    if(!upload)return[];
    const region=game.staticRefreshStats?.regions?.find(r=>r.x===upload.x&&r.y===height-upload.y-upload.height&&r.width===upload.width&&r.height===upload.height);
    check(region,'composition diagnostic has no matching planned raster');
    const points=failurePixels.filter(p=>p.x>=upload.x&&p.x<upload.x+upload.width&&p.y>=upload.y&&p.y<upload.y+upload.height);
    const overlays=['patternDecor','drawBlockerSprites','drawVegetationInterstitials','drawDecor'];
    const stages=[
      {name:'floor-only',prefix:0},{name:'floor+pattern',prefix:1},{name:'floor+pattern+blockers',prefix:2},
      {name:'floor+pattern+blockers+interstitials',prefix:3},{name:'all-overlays',prefix:4},
      {name:'all-overlays-no-glow',prefix:4,noGlow:true},{name:'all-overlays-no-sprites',prefix:4,noSprites:true},
      {name:'hypothesis-global-native-sprite-translation',prefix:4,quantizeSprites:true}
    ];
    const art=game.art,cache=art.normalTransformCache,entries=[...cache],generation=art.normalTransformGeneration;
    const cachedSources=new Map(entries),sourceSizes=entries.map(([key,canvas])=>[key,canvas.width,canvas.height]);
    const normalOwn=Object.prototype.hasOwnProperty.call(art,'transformedNormal'),normal=art.transformedNormal;
    // Full color prefixes still use the production full builder. Every normal
    // source was warmed by the preceding full oracle; prohibit a new source so
    // these diagnostic builds cannot evict or resize production normal inputs.
    art.transformedNormal=function(name,flip=false,rot=0){
      if(this===art&&this.normalImg&&(flip||rot)){
        const key=name+'|'+(flip?1:0)+'|'+rot.toFixed(6);
        check(cachedSources.has(key)&&cache.get(key)===cachedSources.get(key),'composition diagnostic would replace normal source '+key);
      }
      return normal.call(this,name,flip,rot);
    };
    const cropFull=bytes=>{
      const out=new Uint8Array(upload.width*upload.height*4);
      for(let y=0;y<upload.height;y++)out.set(bytes.subarray(((upload.y+y)*width+upload.x)*4,((upload.y+y)*width+upload.x+upload.width)*4),y*upload.width*4);
      return out;
    };
    const configure=(painter,stage,patch,corrections)=>{
      for(let i=stage.prefix;i<overlays.length;i++)painter[overlays[i]]=()=>{};
      if(stage.noGlow)painter.glow=()=>{};
      if(stage.noSprites){painter.sprite=()=>[0,0];painter.spriteSubrect=()=>[0,0]}
      if(stage.quantizeSprites&&patch)for(const method of ['sprite','spriteSubrect']){
        const draw=painter[method];
        painter[method]=function(ctx,...args){
          check(ctx.canvas.width===(region.canvasWidth??region.rasterWidth)&&ctx.canvas.height===(region.canvasHeight??region.rasterHeight)&&ctx.getContextAttributes().alpha===false,'translation hypothesis received a non-patch color context');
          const ownTranslate=Object.prototype.hasOwnProperty.call(ctx,'translate'),translate=ctx.translate;
          ctx.translate=function(x,y){
            translate.call(this,x,y);
            const m=this.getTransform(),cx=region.canvasX??region.rasterX,cy=region.canvasY??region.rasterY,e=Math.fround(m.e+cx)-cx,f=Math.fround(m.f+cy)-cy;
            this.setTransform(m.a,m.b,m.c,m.d,e,f);
            const applied=this.getTransform();
            corrections.push({method,sprite:args[0],anchor:[x,y],before:[m.e,m.f],requested:[e,f],applied:[applied.e,applied.f],delta:[applied.e-m.e,applied.f-m.f]});
          };
          try{return draw.call(this,ctx,...args)}finally{if(ownTranslate)ctx.translate=translate;else delete ctx.translate}
        };
      }
    };
    const results=[];let floorReference=null,patternReference=null,overlayReference=null;
    try{
      for(const stage of stages){
        const fullPainter=new StaticPainter(art,game.luts),patchPainter=new StaticPainter(art,game.luts),corrections=[];
        const entry={name:stage.name,diagnosticOnly:true,region,footerRetained:true,normalGenerationBefore:art.normalTransformGeneration};
        let fullColor=null,fullMaps=null,patchColor=null,patchMaps=null;
        try{
          configure(fullPainter,stage,false,corrections);configure(patchPainter,stage,true,corrections);
          fullColor=fullPainter.build(game.room,game.state,width,height);fullMaps=fullPainter.lastMaterialMaps;
          const fullBytes=uploadReference(game.renderer.gl,fullColor,width,height),fullCrop=cropFull(fullBytes);
          if(stage.name==='floor-only')floorReference={bytes:fullBytes,crop:fullCrop};
          if(stage.name==='floor+pattern')patternReference={bytes:fullBytes,crop:fullCrop};
          if(stage.name==='all-overlays')overlayReference={bytes:fullBytes,crop:fullCrop};
          patchColor=patchPainter.buildPatch(game.room,game.state,width,height,region);patchMaps=patchPainter.lastMaterialMaps;
          const patchBytes=uploadCroppedReference(game.renderer.gl,patchColor,region);
          entry.color=differences(patchBytes,fullCrop,upload.width);
          entry.failurePixels=points.map(p=>{
            const f=(p.y*width+p.x)*4,l=((p.y-upload.y)*upload.width+p.x-upload.x)*4;
            return{x:p.x,y:p.y,canvasY:height-1-p.y,full:Array.from(fullBytes.subarray(f,f+4)),patch:Array.from(patchBytes.subarray(l,l+4))};
          });
          entry.normalGenerationAfter=art.normalTransformGeneration;
          if(stage.quantizeSprites){entry.canvasOrigin=[region.canvasX??region.rasterX,region.canvasY??region.rasterY];entry.translationCorrections=corrections}
        }catch(error){entry.error=String(error);entry.stack=error?.stack}
        finally{release(fullColor);release(fullMaps?.normal);release(fullMaps?.spec);release(patchColor);release(patchMaps?.normal);release(patchMaps?.spec)}
        results.push(entry);
      }
      const fullTarget={...region,rasterX:0,rasterY:0,rasterWidth:width,rasterHeight:height,canvasMode:'local',canvasX:0,canvasY:0,canvasWidth:width,canvasHeight:height};
      // Failure-only textured-quad controls. Recording actual pattern sprite
      // geometry does not draw, populate caches or change production policy.
      // The enclosing clip uses a diagnostic two-native-pixel margin; it is
      // deliberately independent of the planner's fixed guard and budgets.
      const geometryPainter=new StaticPainter(art,game.luts),patternSprites=[];
      const recordSprite=(name,x,y,w,h,options)=>{
        const anchor=options.anchor||'bottom',top=anchor==='bottom'?-h:anchor==='top'?0:-h/2,angle=options.rot||0,co=Math.cos(angle),si=Math.sin(angle),flip=options.flip?-1:1;
        const corners=[[-w/2,top],[w/2,top],[-w/2,top+h],[w/2,top+h]].map(([px,py])=>[(x+co*px*flip-si*py)*width/640,(y+si*px*flip+co*py)*height/360]);
        patternSprites.push({name,anchor,logical:[x,y,w,h],rotation:angle,flip:!!options.flip,
          nativeBounds:{x0:Math.min(...corners.map(p=>p[0])),y0:Math.min(...corners.map(p=>p[1])),x1:Math.max(...corners.map(p=>p[0])),y1:Math.max(...corners.map(p=>p[1]))}});
        return[w,h];
      };
      geometryPainter.sprite=function(ctx,name,x,y,options={}){
        if(!name||!art.regions[name])return[0,0];
        const [w,h]=art.worldSize(name,this.spriteScale(name,options.scale??1));return recordSprite(name,x,y,w,h,options);
      };
      geometryPainter.spriteSubrect=(ctx,name,sx,sy,sw,sh,x,y,w,h,options={})=>recordSprite(name,x,y,w,h,options);
      geometryPainter.glow=()=>{};geometryPainter.patternDecor(null,game.room,game.state);
      const guard={x:region.rasterX,y:region.rasterY,width:region.rasterWidth,height:region.rasterHeight},margin=2;
      const x0=Math.max(0,Math.min(guard.x,...patternSprites.map(s=>Math.floor(s.nativeBounds.x0-margin))));
      const y0=Math.max(0,Math.min(guard.y,...patternSprites.map(s=>Math.floor(s.nativeBounds.y0-margin))));
      const x1=Math.min(width,Math.max(guard.x+guard.width,...patternSprites.map(s=>Math.ceil(s.nativeBounds.x1+margin))));
      const y1=Math.min(height,Math.max(guard.y+guard.height,...patternSprites.map(s=>Math.ceil(s.nativeBounds.y1+margin))));
      const enclosingClip={x:x0,y:y0,width:x1-x0,height:y1-y0};
      const nativeGuard={...region,canvasMode:'native-clip',canvasX:0,canvasY:0,canvasWidth:width,canvasHeight:height};
      const textureVariants=[];
      for(const [prefix,referenceStage] of [[1,'floor+pattern'],[4,'all-overlays']]){
        const label=prefix===1?'pattern':'overlays';
        textureVariants.push(
          {name:label+'-full-target-bounded-list-no-clip',prefix,referenceStage,region:fullTarget},
          {name:label+'-full-target-bounded-list-enclosing-pattern-clip',prefix,referenceStage,region:fullTarget,clip:enclosingClip},
          {name:label+'-full-target-guarded-floor-unclipped-overlays',prefix,referenceStage,region:nativeGuard,clip:guard,productionClip:true,restoreOverlayClip:true}
        );
      }
      textureVariants.push({name:'pattern-full-target-full-list-guard-clip',prefix:1,referenceStage:'floor+pattern',
        region:{...nativeGuard,tx0:0,ty0:0,tx1:40,ty1:19},clip:guard,productionClip:true});
      for(const variant of textureVariants){
        const painter=new StaticPainter(art,game.luts),prototype=OffscreenCanvas.prototype,getContext=prototype.getContext;
        const reference=variant.prefix===1?patternReference:overlayReference;
        const entry={name:variant.name,diagnosticOnly:true,referenceStage:variant.referenceStage,region:variant.region,
          nativeClip:variant.clip||null,patternSprites,patternClipMargin:margin,footerRetained:true,floorCalls:0,clipApplications:0,overlayClipRestores:0,normalGenerationBefore:art.normalTransformGeneration};
        let color=null,maps=null,patchContext=null,clipMethod=null,clipOwn=false;
        try{
          check(reference,'textured-quad diagnostic has no matching full reference');configure(painter,{prefix:variant.prefix},true,[]);
          const baseTile=painter.baseTile;painter.baseTile=function(...args){entry.floorCalls++;return baseTile.apply(this,args)};
          if(variant.restoreOverlayClip){
            const pattern=painter.patternDecor;
            painter.patternDecor=function(ctx,...args){
              const m=ctx.getTransform(),properties=['fillStyle','strokeStyle','globalAlpha','globalCompositeOperation','lineWidth','imageSmoothingEnabled','imageSmoothingQuality'],state=Object.fromEntries(properties.map(key=>[key,ctx[key]]));
              // Production saved this context immediately before its native
              // guard clip. Restore that state, then repeat the original full
              // save/scale protocol; do not substitute setTransform().
              ctx.restore();ctx.save();ctx.scale(width/640,height/360);
              for(const key of properties)ctx[key]=state[key];
              const after=ctx.getTransform(),keys=['a','b','c','d','e','f'];
              check(keys.every(key=>m[key]===after[key]),'unclipped overlay control changed its transform');
              entry.overlayClipRestores++;entry.overlayTransform=Object.fromEntries(keys.map(key=>[key,after[key]]));
              return pattern.call(this,ctx,...args);
            };
          }
          prototype.getContext=function(type,options){
            const ctx=getContext.call(this,type,options);
            if(!patchContext&&type==='2d'&&options?.alpha===false&&this.width===width&&this.height===height){
              patchContext=ctx;
              if(variant.productionClip){
                clipOwn=Object.prototype.hasOwnProperty.call(ctx,'clip');clipMethod=ctx.clip;
                ctx.clip=function(...args){entry.clipApplications++;return clipMethod.apply(this,args)};
              }else if(variant.clip){
                const clip=variant.clip;ctx.beginPath();ctx.rect(clip.x,clip.y,clip.width,clip.height);ctx.clip();entry.clipApplications++;
              }
            }
            return ctx;
          };
          try{color=painter.buildPatch(game.room,game.state,width,height,variant.region);maps=painter.lastMaterialMaps}
          finally{prototype.getContext=getContext;if(clipMethod){if(clipOwn)patchContext.clip=clipMethod;else delete patchContext.clip}}
          check(entry.floorCalls===(variant.region.tx1-variant.region.tx0)*(variant.region.ty1-variant.region.ty0),'textured-quad diagnostic floor list differs');
          check(entry.clipApplications===(variant.clip?1:0)&&entry.overlayClipRestores===(variant.restoreOverlayClip?1:0),'textured-quad diagnostic clip protocol differs');
          entry.canvasSize=[color.width,color.height];entry.colorAttributes=color.getContext('2d').getContextAttributes();
          const bytes=uploadCroppedReference(game.renderer.gl,color,variant.region);
          entry.color=differences(bytes,reference.crop,upload.width);
          entry.failurePixels=points.map(p=>{
            const f=(p.y*width+p.x)*4,l=((p.y-upload.y)*upload.width+p.x-upload.x)*4;
            return{x:p.x,y:p.y,canvasY:height-1-p.y,full:Array.from(reference.bytes.subarray(f,f+4)),patch:Array.from(bytes.subarray(l,l+4))};
          });
          entry.normalGenerationAfter=art.normalTransformGeneration;
        }catch(error){entry.error=String(error);entry.stack=error?.stack}
        finally{prototype.getContext=getContext;if(clipMethod){if(clipOwn)patchContext.clip=clipMethod;else delete patchContext.clip}release(color);release(maps?.normal);release(maps?.spec)}
        results.push(entry);
      }
      // Failure-only target/clip/command-stream discrimination. Reuse the exact
      // floor-only full readback above, the production builder and shared art.
      // These four diagnostic surfaces never replace a production texture.
      const variants=[
        {name:'floor-full-target-bounded-list',region:fullTarget},
        {name:'floor-full-target-bounded-list-guard-clip',region:fullTarget,clip:{x:region.rasterX,y:region.rasterY,width:region.rasterWidth,height:region.rasterHeight}},
        {name:'floor-full-target-bounded-list-output-clip',region:fullTarget,clip:{x:region.x,y:region.y,width:region.width,height:region.height}},
        {name:'floor-small-target-full-list',region:{...region,canvasMode:'local',canvasX:region.rasterX,canvasY:region.rasterY,canvasWidth:region.rasterWidth,canvasHeight:region.rasterHeight,tx0:0,ty0:0,tx1:40,ty1:19}}
      ];
      for(const variant of variants){
        const painter=new StaticPainter(art,game.luts),prototype=OffscreenCanvas.prototype,getContext=prototype.getContext;
        const entry={name:variant.name,diagnosticOnly:true,referenceStage:'floor-only',region:variant.region,nativeClip:variant.clip||null,
          footerRetained:true,floorCalls:0,clipApplications:0,normalGenerationBefore:art.normalTransformGeneration};
        let color=null,maps=null;
        try{
          check(floorReference,'target diagnostic has no floor-only full reference');
          configure(painter,{prefix:0},true,[]);
          const baseTile=painter.baseTile;
          painter.baseTile=function(...args){entry.floorCalls++;return baseTile.apply(this,args)};
          // Clip the new color context in native coordinates before the
          // production save/scale sequence, without adding a translation.
          if(variant.clip)prototype.getContext=function(type,options){
            const ctx=getContext.call(this,type,options);
            if(!entry.clipApplications&&type==='2d'&&options?.alpha===false&&this.width===width&&this.height===height){
              const clip=variant.clip;ctx.beginPath();ctx.rect(clip.x,clip.y,clip.width,clip.height);ctx.clip();entry.clipApplications++;
            }
            return ctx;
          };
          try{color=painter.buildPatch(game.room,game.state,width,height,variant.region);maps=painter.lastMaterialMaps}
          finally{prototype.getContext=getContext}
          check(entry.floorCalls===(variant.region.tx1-variant.region.tx0)*(variant.region.ty1-variant.region.ty0),'target diagnostic floor list differs');
          check(entry.clipApplications===(variant.clip?1:0),'target diagnostic clip was not applied');
          entry.canvasSize=[color.width,color.height];entry.colorAttributes=color.getContext('2d').getContextAttributes();
          const bytes=uploadCroppedReference(game.renderer.gl,color,variant.region);
          entry.color=differences(bytes,floorReference.crop,upload.width);
          entry.failurePixels=points.map(p=>{
            const f=(p.y*width+p.x)*4,l=((p.y-upload.y)*upload.width+p.x-upload.x)*4;
            return{x:p.x,y:p.y,canvasY:height-1-p.y,full:Array.from(floorReference.bytes.subarray(f,f+4)),patch:Array.from(bytes.subarray(l,l+4))};
          });
          entry.normalGenerationAfter=art.normalTransformGeneration;
        }catch(error){entry.error=String(error);entry.stack=error?.stack}
        finally{prototype.getContext=getContext;release(color);release(maps?.normal);release(maps?.spec)}
        results.push(entry);
      }
    }finally{
      if(normalOwn)art.transformedNormal=normal;else delete art.transformedNormal;
      const stable=art.normalTransformCache===cache&&art.normalTransformGeneration===generation&&cache.size===entries.length&&
        sourceSizes.every(([key,w,h])=>cache.get(key)===cachedSources.get(key)&&cache.get(key).width===w&&cache.get(key).height===h);
      // Restore the pre-diagnostic LRU order as well as retaining every source.
      cache.clear();for(const [key,canvas] of entries)cache.set(key,canvas);
      check(stable,'composition diagnostic changed production normal cache');
    }
    return results;
  }

  function parity(label,before=null,uploads=[]){
    const actual=capture(),expected=reference(),result={};let firstFailure=null;
    for(let c=0;c<channels.length;c++){
      const diff=differences(actual.maps[c],expected[c],actual.width);result[channels[c]]=diff;
      if(diff.bytes&&!firstFailure)firstFailure=label+' '+channels[c]+' full GPU texture differs: '+JSON.stringify(diff);
      if(before){
        check(before.width===actual.width&&before.height===actual.height,label+' exterior dimensions changed');
        const rects=uploads.filter(u=>u.channel===channels[c]),coverageRects=uploads.filter(u=>u.channel==='color');let changedOutside=0,coveredAlphaPixels=0;
        for(let y=0;y<actual.height;y++)for(let x=0;x<actual.width;x++){
          const i=(y*actual.width+x)*4;
          // Material presence is measured under the color output; material
          // textures themselves have no upload rectangles and must not change.
          if(coverageRects.some(u=>x>=u.x&&x<u.x+u.width&&y>=u.y&&y<u.y+u.height)&&actual.maps[c][i+3])coveredAlphaPixels++;
          if(rects.some(u=>x>=u.x&&x<u.x+u.width&&y>=u.y&&y<u.y+u.height))continue;
          for(let k=0;k<4;k++)if(before.maps[c][i+k]!==actual.maps[c][i+k])changedOutside++;
        }
        if(changedOutside&&!firstFailure)firstFailure=label+' '+channels[c]+' changed bytes outside actual subuploads';
        result[channels[c]].changedOutside=changedOutside;
        result[channels[c]].coveredAlphaPixels=coveredAlphaPixels;
      }
    }
    const glError=game.renderer.gl.getError();
    if(firstFailure||glError!==game.renderer.gl.NO_ERROR){
      // Failure-only: distinguish replacement of unchanged pixels from an
      // incorrect required edit, using the already captured pre-edit textures.
      if(before)for(let c=0;c<channels.length;c++){
        const diff=result[channels[c]],prior=before.maps[c],current=actual.maps[c],wanted=expected[c];
        let mismatchReferenceUnchangedPixels=0,mismatchReferenceChangedPixels=0,referenceChangedPixels=0;
        let x0=actual.width,y0=actual.height,x1=0,y1=0;
        for(let i=0;i<current.length;i+=4){
          const changed=prior[i]!==wanted[i]||prior[i+1]!==wanted[i+1]||prior[i+2]!==wanted[i+2]||prior[i+3]!==wanted[i+3];
          const mismatch=current[i]!==wanted[i]||current[i+1]!==wanted[i+1]||current[i+2]!==wanted[i+2]||current[i+3]!==wanted[i+3];
          if(changed){const x=(i/4)%actual.width,y=Math.floor(i/4/actual.width);referenceChangedPixels++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x+1);y1=Math.max(y1,y+1)}
          if(mismatch){if(changed)mismatchReferenceChangedPixels++;else mismatchReferenceUnchangedPixels++}
        }
        for(const sample of diff.examples){
          const i=(sample.y*actual.width+sample.x)*4;sample.before=Array.from(prior.subarray(i,i+4));
          sample.referenceChanged=sample.before.some((value,k)=>value!==sample.expected[k]);
        }
        Object.assign(diff,{mismatchReferenceUnchangedPixels,mismatchReferenceChangedPixels,referenceChangedPixels,
          referenceChangedBounds:referenceChangedPixels?{x:x0,y:y0,width:x1-x0,height:y1-y0}:null});
      }
      root.__staticRasterDiagnostics={kind:uploads.length?'patch-vs-full':before?'unchanged-vs-full':'full-vs-full',label,room:game.room.key,
        native:[actual.width,actual.height],beforeNative:before?[before.width,before.height]:null,maps:result,glError,
        pixelCoordinates:'WebGL bottom-left',uploadCoordinates:'WebGL bottom-left',subUploads:uploads.map(rect=>({...rect})),staticRefreshStats:JSON.parse(JSON.stringify(game.staticRefreshStats||{}))};
      if(uploads.length)try{root.__staticRasterDiagnostics.patchVariants=patchRasterDiagnostics(actual,expected,uploads)}catch(error){root.__staticRasterDiagnostics.patchVariantError=String(error)}
      if(uploads.length)try{root.__staticRasterDiagnostics.compositionStages=compositionStageDiagnostics(actual,uploads,result.color.examples)}catch(error){root.__staticRasterDiagnostics.compositionStageError=String(error)}
      check(false,(firstFailure||label+' WebGL error '+glError)+'\nPERF-004 raster diagnostics '+JSON.stringify(root.__staticRasterDiagnostics));
    }
    return result;
  }

  function instrument(action){
    const r=game.renderer,g=r.gl,painter=game.painter,canvasRefs=[];
    const stats={fullBuilds:0,patchBuilds:0,patchMaterialMaps:0,normalTransformRequests:0,floorCalls:0,fullUploads:[],subUploads:[],readbacks:[],patchCanvases:[],patchContextAllocations:[],patchBaseTransforms:[],patchBaseTranslations:[],patchClips:[],peakLiveScratchPixels:0,actorInitializations:0};
    const patchContexts=new WeakSet(),patchColorContexts=new WeakSet(),contextAllocations=new WeakSet(),paths=new WeakMap(),observedScratch=[];let patchDepth=0;
    const materialHandles=[r.bgNormalTex,r.bgSpecTex],normalGeneration=game.art.normalTransformGeneration;
    const unpack=()=>({flipY:g.getParameter(g.UNPACK_FLIP_Y_WEBGL),skipPixels:g.getParameter(g.UNPACK_SKIP_PIXELS),skipRows:g.getParameter(g.UNPACK_SKIP_ROWS)});
    stats.unpackBefore=unpack();
    const original={build:painter.build,patch:painter.buildPatch,tile:painter.baseTile,image:g.texImage2D,sub:g.texSubImage2D,
      creature:game.creatures.init,mini:game.miniGuides.init,normal:game.art.transformedNormal,normalOwn:Object.prototype.hasOwnProperty.call(game.art,'transformedNormal')};
    const canvasPrototype=OffscreenCanvas.prototype,contextPrototype=Object.getPrototypeOf(new OffscreenCanvas(1,1).getContext('2d'));
    Object.assign(original,{getContext:canvasPrototype.getContext,read:contextPrototype.getImageData,beginPath:contextPrototype.beginPath,rect:contextPrototype.rect,clip:contextPrototype.clip,translate:contextPrototype.translate});
    const matrix=ctx=>{const m=ctx.getTransform();return{a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f}};
    const patchColor=ctx=>patchDepth&&patchColorContexts.has(ctx);
    const actors={creatures:game.creatures.units,mini:game.miniGuides.units,creatureData:JSON.stringify(game.creatures.units),miniData:JSON.stringify(game.miniGuides.units)};
    const water={field:r.surfaceFX.water.rebuilds,legacy:r.waterMaskFullUploads||0};
    const channel=()=>{const bound=g.getParameter(g.TEXTURE_BINDING_2D),i=textureKeys.findIndex(key=>r[key]===bound);return i<0?null:channels[i]};
    canvasPrototype.getContext=function(type,options){
      const ctx=original.getContext.call(this,type,options);
      if(patchDepth&&ctx&&type==='2d'&&!contextAllocations.has(this)){
        contextAllocations.add(this);stats.patchContextAllocations.push({patchIndex:stats.patchBuilds-1,width:this.width,height:this.height,alpha:ctx.getContextAttributes().alpha,explicitAlpha:options?.alpha??null});
        if(options?.alpha===false){
          patchColorContexts.add(ctx);
          observedScratch.push(this);stats.peakLiveScratchPixels=Math.max(stats.peakLiveScratchPixels,observedScratch.reduce((n,c)=>n+(c.width===1&&c.height===1?0:c.width*c.height),0));
        }
      }
      return ctx;
    };
    contextPrototype.beginPath=function(...args){if(patchColor(this))paths.set(this,[]);return original.beginPath.apply(this,args)};
    contextPrototype.rect=function(...args){if(patchColor(this)){if(!paths.has(this))paths.set(this,[]);paths.get(this).push(args.slice())}return original.rect.apply(this,args)};
    contextPrototype.clip=function(...args){
      if(patchColor(this))stats.patchClips.push({patchIndex:stats.patchBuilds-1,width:this.canvas.width,height:this.canvas.height,rectangles:(paths.get(this)||[]).map(rect=>rect.slice()),matrix:matrix(this),beforeFloor:!patchContexts.has(this),argumentCount:args.length});
      return original.clip.apply(this,args);
    };
    contextPrototype.translate=function(...args){if(patchColor(this)&&!patchContexts.has(this))stats.patchBaseTranslations.push({patchIndex:stats.patchBuilds-1,args:args.slice()});return original.translate.apply(this,args)};
    painter.build=function(...args){stats.fullBuilds++;return original.build.apply(this,args)};
    if(original.patch)painter.buildPatch=function(...args){
      stats.patchBuilds++;patchDepth++;
      try{
        const color=original.patch.apply(this,args),maps=this.lastMaterialMaps;
        if(maps)stats.patchMaterialMaps++;
        for(const canvas of [color,maps?.normal,maps?.spec])if(canvas){canvasRefs.push(canvas);stats.patchCanvases.push({width:canvas.width,height:canvas.height})}
        return color;
      }finally{patchDepth--}
    };
    painter.baseTile=function(...args){
      stats.floorCalls++;const ctx=args[0];
      if(patchDepth&&!patchContexts.has(ctx)){
        patchContexts.add(ctx);const m=ctx.getTransform();
        stats.patchBaseTransforms.push({patchIndex:stats.patchBuilds-1,a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f,width:ctx.canvas.width,height:ctx.canvas.height});
      }
      return original.tile.apply(this,args);
    };
    g.texImage2D=function(...args){const name=channel();if(name)stats.fullUploads.push({channel:name});return original.image.apply(this,args)};
    g.texSubImage2D=function(...args){
      const name=channel();if(name){const source=args.length===7?args[6]:args[8],dom=source&&Number.isFinite(source.width)&&Number.isFinite(source.height);
        stats.subUploads.push({channel:name,x:args[2],y:args[3],width:args.length===7?source.width:args[4],height:args.length===7?source.height:args[5],
          argumentCount:args.length,sourceWidth:dom?source.width:null,sourceHeight:dom?source.height:null,...unpack()});
      }
      return original.sub.apply(this,args);
    };
    contextPrototype.getImageData=function(...args){stats.readbacks.push({staticPatch:patchDepth>0||patchColorContexts.has(this),canvasWidth:this.canvas.width,canvasHeight:this.canvas.height,width:args[2],height:args[3]});return original.read.apply(this,args)};
    game.creatures.init=function(...args){stats.actorInitializations++;return original.creature.apply(this,args)};
    game.miniGuides.init=function(...args){stats.actorInitializations++;return original.mini.apply(this,args)};
    game.art.transformedNormal=function(...args){stats.normalTransformRequests++;return original.normal.apply(this,args)};
    try{action()}finally{
      painter.build=original.build;if(original.patch)painter.buildPatch=original.patch;painter.baseTile=original.tile;
      g.texImage2D=original.image;g.texSubImage2D=original.sub;canvasPrototype.getContext=original.getContext;contextPrototype.getImageData=original.read;
      contextPrototype.beginPath=original.beginPath;contextPrototype.rect=original.rect;contextPrototype.clip=original.clip;contextPrototype.translate=original.translate;
      game.creatures.init=original.creature;game.miniGuides.init=original.mini;
      if(original.normalOwn)game.art.transformedNormal=original.normal;else delete game.art.transformedNormal;
      stats.releasedPatchCanvases=[...canvasRefs,...observedScratch].every(c=>c.width===1&&c.height===1);
      stats.unpackAfter=unpack();stats.unpackRestored=JSON.stringify(stats.unpackBefore)===JSON.stringify(stats.unpackAfter);
    }
    stats.actorsUnchanged=stats.actorInitializations===0&&actors.creatures===game.creatures.units&&actors.mini===game.miniGuides.units&&
      actors.creatureData===JSON.stringify(game.creatures.units)&&actors.miniData===JSON.stringify(game.miniGuides.units);
    stats.waterFullRebuilds=r.surfaceFX.water.rebuilds-water.field;
    stats.waterFullUploads=(r.waterMaskFullUploads||0)-water.legacy;
    stats.materialHandlesUnchanged=materialHandles[0]===r.bgNormalTex&&materialHandles[1]===r.bgSpecTex;
    stats.normalSourceGenerationUnchanged=normalGeneration===game.art.normalTransformGeneration;
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
    if(mode==='patch'||mode==='noop')assertNormalSources(label+' before action');
    const before=mode==='patch'||mode==='noop'?capture():null,work=instrument(action),r=game.renderer,area=r.nativeW*r.nativeH;
    if(mode==='patch'||mode==='noop')assertNormalSources(label+' after action');
    check(work.diagnostics.mode===mode,label+' expected '+mode+' diagnostics: '+JSON.stringify(work.diagnostics));
    if(options.actors!==false)check(work.actorsUnchanged,label+' reset or moved unrelated actors');
    if(mode==='patch'){
      const fractional=!Number.isInteger(r.nativeW/640)||!Number.isInteger(r.nativeH/360),scratchMode=fractional?'native-clip':'local';
      const allocations=work.patchContextAllocations.filter(c=>c.explicitAlpha===false),peak=Math.max(...allocations.map(c=>c.width*c.height)),allocatedPixels=allocations.reduce((n,c)=>n+c.width*c.height,0);
      check(work.fullBuilds===0&&work.fullUploads.length===0,label+' full build or texture replacement in eligible edit');
      check(work.patchBuilds>0&&work.floorCalls>0&&work.floorCalls<760,label+' floor raster work is not bounded');
      check(work.releasedPatchCanvases,label+' retained static scratch backing');
      check(work.unpackRestored,label+' changed WebGL unpack state');
      check(work.patchMaterialMaps===0&&work.patchCanvases.length===work.patchBuilds&&allocations.length===work.patchBuilds&&work.patchContextAllocations.every(c=>c.explicitAlpha!==true),label+' expected one color context and no material contexts per region');
      check(work.readbacks.every(read=>!read.staticPatch),label+' performed Canvas2D readback in the partial renderer');
      check(!game.currentStatic&&!game.painter.lastMaterialMaps,label+' retained full static backing');
      check(work.diagnostics.scratchMode===scratchMode&&peak>0&&peak<=(fractional?1048576:262144)&&allocatedPixels<=2097152,label+' exceeded the explicit local/native peak or cumulative canvas capacity policy');
      check(work.diagnostics.scratchPixels===peak&&work.diagnostics.scratchBytes===peak*4&&work.peakLiveScratchPixels===peak,label+' peak scratch capacity differs from actual sequential color canvases');
      check(work.diagnostics.scratchAllocations===allocations.length&&work.diagnostics.scratchAllocationAttempts===allocations.length&&work.diagnostics.scratchAllocationPixels===allocatedPixels&&work.diagnostics.scratchAllocationBytes===allocatedPixels*4,label+' scratch allocation counters differ from actual color canvases');
      check(work.materialHandlesUnchanged&&work.normalSourceGenerationUnchanged&&work.normalTransformRequests===0&&work.subUploads.every(u=>u.channel==='color'),label+' rerendered or replaced unchanged material resources');
      check(work.diagnostics.regions.length===work.patchBuilds&&work.patchBaseTransforms.length===work.patchBuilds,label+' missing patch region or base transform observations');
      let observedRasterPixels=0;
      for(let index=0;index<work.diagnostics.regions.length;index++){
        const region=work.diagnostics.regions[index],canvas=allocations[index],returned=work.patchCanvases[index],base=work.patchBaseTransforms[index];
        const cx=fractional?0:region.rasterX,cy=fractional?0:region.rasterY,cw=fractional?r.nativeW:region.rasterWidth,ch=fractional?r.nativeH:region.rasterHeight;
        check(region.canvasMode===scratchMode&&region.canvasX===cx&&region.canvasY===cy&&region.canvasWidth===cw&&region.canvasHeight===ch,label+' planner conflates source canvas and guarded raster geometry');
        check(canvas.patchIndex===index&&canvas.width===cw&&canvas.height===ch&&returned.width===cw&&returned.height===ch,label+' allocated color canvas differs from the required source dimensions');
        check(base.patchIndex===index&&base.width===cw&&base.height===ch&&base.a===Math.fround(r.nativeW/640)&&base.b===0&&base.c===0&&base.d===Math.fround(r.nativeH/360)&&base.e===-cx&&base.f===-cy,label+' patch base transform differs from the full native scale/origin contract');
        const clips=work.patchClips.filter(c=>c.patchIndex===index),translations=work.patchBaseTranslations.filter(t=>t.patchIndex===index);
        if(fractional){
          check(translations.length===0&&clips.length===1,label+' native clip path translated the canvas or lacks its single guard clip');
          const clip=clips[0],m=clip.matrix;
          check(clip.width===cw&&clip.height===ch&&clip.beforeFloor&&clip.argumentCount===0&&clip.rectangles.length===1&&JSON.stringify(clip.rectangles[0])===JSON.stringify([region.rasterX,region.rasterY,region.rasterWidth,region.rasterHeight])&&m.a===1&&m.b===0&&m.c===0&&m.d===1&&m.e===0&&m.f===0,label+' actual native guard clip differs from the planned redraw region');
          observedRasterPixels+=clip.rectangles[0][2]*clip.rectangles[0][3];
        }else{
          check(clips.length===0&&translations.length===((cx||cy)?1:0)&&translations.every(t=>t.args[0]===-cx&&t.args[1]===-cy),label+' local canvas transform/implicit clip changed');
          check(cw*ch<area,label+' local path allocated a native-size canvas');observedRasterPixels+=cw*ch;
        }
      }
      for(const name of ['color']){const uploads=work.subUploads.filter(u=>u.channel===name),pixels=uploads.reduce((n,u)=>n+u.width*u.height,0);
        check(uploads.length>0&&pixels>0&&pixels<area,label+' '+name+' uploads are not bounded');
        check(uploads.every(u=>Number.isInteger(u.x)&&Number.isInteger(u.y)&&u.x>=0&&u.y>=0&&u.width>0&&u.height>0&&u.x+u.width<=r.nativeW&&u.y+u.height<=r.nativeH),label+' '+name+' invalid native upload rectangle');
        for(const upload of uploads){
          const top=r.nativeH-upload.y-upload.height,region=work.diagnostics.regions.find(rect=>rect.x===upload.x&&rect.y===top&&rect.width===upload.width&&rect.height===upload.height);
          check(region&&upload.argumentCount===9&&upload.flipY===true,label+' did not use the explicit DOM-source crop overload');
          check(upload.sourceWidth===region.canvasWidth&&upload.sourceHeight===region.canvasHeight&&upload.skipPixels===region.x-region.canvasX&&
            upload.skipRows===region.canvasHeight-(region.y-region.canvasY)-region.height,label+' upload skips were not derived from the actual source canvas');
          const left=region.x-region.rasterX,right=region.rasterX+region.rasterWidth-region.x-region.width,above=region.y-region.rasterY,bottom=region.rasterY+region.rasterHeight-region.y-region.height;
          check(left>=Math.min(32,upload.x)&&right>=Math.min(32,r.nativeW-upload.x-upload.width)&&above>=Math.min(32,top)&&bottom>=Math.min(32,upload.y),label+' upload reaches an unguarded scratch edge');
        }
      }
      check(work.diagnostics.rasterCells===work.floorCalls&&work.diagnostics.uploadCalls===work.subUploads.length&&
        work.diagnostics.uploadBytes===work.subUploads.reduce((n,u)=>n+u.width*u.height*4,0),label+' bounded-work diagnostics do not match executed work');
      check(work.diagnostics.rasterPixels===observedRasterPixels&&
        work.diagnostics.pixels===work.subUploads.filter(u=>u.channel==='color').reduce((n,u)=>n+u.width*u.height,0),label+' raster/output/scratch metrics conflate guarded source with uploaded pixels');
      check(work.diagnostics.pixels<=area*.20&&observedRasterPixels<=area*.20&&work.floorCalls<=760*.35,label+' exceeded the unchanged output/clipped-redraw/floor budgets');
      check(work.diagnostics.retainedScratchPixels===0,label+' reports retained static scratch');
      check(work.waterFullRebuilds===0&&work.waterFullUploads===0,label+' regressed PERF-003 bounded water');
    }else if(mode==='noop')check(work.fullBuilds===0&&work.patchBuilds===0&&work.fullUploads.length===0&&work.subUploads.length===0,label+' unchanged authority did rendering work');
    else check(work.fullBuilds>=1&&channels.every(c=>work.fullUploads.some(u=>u.channel===c)),label+' full fallback did not repair all maps');
    if(options.authority!==false)authority(label);
    const textures=parity(label,before,work.subUploads);
    if(mode==='patch'){check(textures.normal.changedOutside===0&&textures.specular.changedOutside===0,label+' modified material texture bytes');work.materialContentsUnchanged=true}
    if(mode==='patch'||mode==='noop')work.normalSources=assertNormalSources(label+' after full reference');
    // Coverage is defined by actual subuploads. A qualified full fallback has
    // no subupload footprint; its three complete textures are checked above.
    if(options.materials&&mode==='patch')check(textures.normal.coveredAlphaPixels>0&&textures.specular.coveredAlphaPixels>0,label+' did not actually overlap material pixels');
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
    setNative(width,height);captureNormalBaseline(()=>game.enterRoom(game.storyData.rooms.findIndex(s=>s.key==='quiet_nest'),null));
    document.querySelector('#storyModal')?.classList.add('hidden');e.toggle(true);game.x=80;game.y=200;
    check(game.room.spec.pattern==='nest','quiet_nest pattern fixture changed');
    const textures=parity('initial '+width+'x'+height);assertNormalSources('initial full reference');return textures;
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
        captureNormalBaseline(()=>game.enterRoom(index,null));document.querySelector('#storyModal')?.classList.add('hidden');
        const actual=capture(),textures=qualify('warm shared sources',actual,reference(legacyFullBuild));
        const coldCurrent=reference(null,{freshCaches:true}),coldLegacy=reference(legacyFullBuild,{freshCaches:true});
        const coldIndependentTextures=qualify('cold independent sources',{width,height,maps:coldCurrent},coldLegacy);
        out.push({room:game.room.key,native:[width,height],textures,coldIndependentTextures,normalSources:assertNormalSources('legacy compatibility references')});
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
      delete root.__staticRasterDiagnostics;
      out.push({channel:channels[channel],corruptionRejected:caught});game.ensureBackground(true);
    }
    return out;
  }

  function eligibleCases(width,height,sourceMaps){
    const result={native:[width,height],initial:setup(width,height,sourceMaps),cases:[]},out=result.cases,e=rmfEditor;
    // Keep every original edit at both native sizes. Local guarded redraws
    // fit the fixed20% raster/35% floor budgets; fractional canvases preserve
    // the full native target and transform while clipping to those redraws.
    // At997x563 each transient color canvas is561311pixels (2245244bytes),
    // below the explicit4MiB peak; the two-region case also fits8MiB cumulative.
    // Native run41578077693 independently isolated target-size sensitivity:
    // full native target + bounded floor list + guard clip was pixel exact.
    out.push(measured('water to ground',()=>transaction('PERF-004 clear water',()=>paint('clear',11,6))));
    out.push(measured('ground to water',()=>transaction('PERF-004 paint water',()=>paint('water',11,6))));
    out.push(measured('path to ground',()=>transaction('PERF-004 clear path',()=>paint('clear',13,6))));
    // The unchanged row5 foliage sprite at8,5 has world bounds
    // x127.7056..144.2944,y85.04..98, intersecting this dry cell below it.
    // Output640 [128,96,19,18], raster [96,64,96,96],64 source cells;
    // output997 [199,150,30,29], raster [160,112,112,112],36 source cells.
    // Both material maps must have actual nonzero alpha in the upload footprint.
    out.push(measured('ground to path beneath unchanged foliage row',()=>{
      const raw=e.rawRoom(),walls=JSON.stringify(raw.walls),styles=JSON.stringify(raw.blocker_styles);
      check(!game.room.blocked([8,6])&&!game.room.paths.has('8,6')&&!game.room.water.has('8,6')&&
        game.room.walls.has('8,5')&&raw.blocker_styles['8,5']?.sprite==='foliage_v391_00','foliage overlap fixture moved or is not dry ground');
      transaction('PERF-004 unchanged foliage overlap',()=>paint('path',8,6));
      check(JSON.stringify(e.rawRoom().walls)===walls&&JSON.stringify(e.rawRoom().blocker_styles)===styles,'terrain edit changed the overlapping blocker dependency');
    },'patch',{materials:true}));
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
    game.room.border.delete('20,18');captureNormalBaseline(()=>game.ensureBackground(true));
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
      captureNormalBaseline(()=>game.enterRoom(index,null));document.querySelector('#storyModal')?.classList.add('hidden');e.toggle(true);
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
      const expectedTiles=roomKey==='dawn_tree'?[[20,9],[20,8]]:[[20,10],[19,8]];
      check(JSON.stringify(candidates.slice(0,2))===JSON.stringify(expectedTiles),'natural terrain fixture moved '+roomKey);
      // Keep these exact authored cells and require bounded patches at both
      // sizes, including their unchanged overlays and natural source caches.
      const cases=[];
      for(const [kind,tile] of [['path',candidates[0]],['water',candidates[1]]]){
        const label=roomKey+' '+width+'x'+height+' natural ground to '+kind;
        const entry=measured(label,()=>transaction('PERF-004 '+label,()=>paint(kind,tile[0],tile[1])));
        cases.push({tile,kind,...entry});
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
    out.push(measured('second disjoint color subupload fails; synchronous full repair',()=>{
      const upload=g.texSubImage2D;let calls=0;
      g.texSubImage2D=function(...args){const t=g.getParameter(g.TEXTURE_BINDING_2D);if(textureKeys.some(k=>game.renderer[k]===t)&&++calls===2)throw Error('PERF-004 injected second-region failure');return upload.apply(this,args)};
      try{transaction('PERF-004 recover subupload',()=>{paint('water',16,12);paint('water',30,5)})}finally{g.texSubImage2D=upload}
      check(calls===2,'subupload fault fixture did not trigger');
    },'full'));
    const originalSub=g.texSubImage2D,originalImage=g.texImage2D;let calls=0,repairFailed=false;
    try{
      g.texSubImage2D=function(...args){const t=g.getParameter(g.TEXTURE_BINDING_2D);if(textureKeys.some(k=>game.renderer[k]===t)&&++calls===2)throw Error('PERF-004 injected subupload failure before repair failure');return originalSub.apply(this,args)};
      g.texImage2D=function(...args){const t=g.getParameter(g.TEXTURE_BINDING_2D);if(textureKeys.some(k=>game.renderer[k]===t))throw Error('PERF-004 injected full repair failure');return originalImage.apply(this,args)};
      e.placeTile({kind:'path'},17,12);e.placeTile({kind:'path'},31,5);
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
      const result={oracle:'clean full StaticPainter composition with production source canvases; all color/normal/specular GPU bytes; exact equality',nativeCrop:nativeCropCases(),legacyCompatibility:legacyCompatibility(sourceMaps),negativeControls:negativeControls(sourceMaps),native:[],naturalRooms:[],fallbacks:[],recovery:[],liveOwnership:[]};
      for(const [width,height] of [[640,360],[997,563]])result.native.push(eligibleCases(width,height,sourceMaps));
      result.naturalRooms=naturalCases(sourceMaps);
      result.fallbacks=fallbackCases(sourceMaps);result.recovery=recoveryCases(sourceMaps);result.liveOwnership=ownershipCases(sourceMaps);
      return result;
    }finally{
      normalBaseline=null;
      if(e.transaction)e.cancelTransaction(false);e.clearPendingInvalidation();e.resetPointerState();
      game.maps=saved.maps;game.rooms=saved.rooms;game.state.completed=saved.completed;game.graphics=saved.graphics;e.history=saved.history;e.choice=saved.choice;
      if(saved.rectOwn)r.c.getBoundingClientRect=saved.rect;else delete r.c.getBoundingClientRect;
      r.resizeToDisplaySize(true);game.enterRoom(saved.index,null);document.querySelector('#storyModal')?.classList.add('hidden');e.toggle(saved.active);
    }
  }

  root.auditStaticTerrain={run,nativeCropCases,legacyCompatibility,negativeControls,eligibleCases,naturalCases,fallbackCases,recoveryCases,ownershipCases,capture,parity,instrument};
})(globalThis);
