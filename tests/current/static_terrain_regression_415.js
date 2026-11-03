'use strict';
const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const ROOT=path.resolve(__dirname,'../..');
const S=require(path.join(ROOT,'static_terrain.js'));
const game=fs.readFileSync(path.join(ROOT,'game.js'),'utf8');
const source=(start,end)=>{const a=game.indexOf(start),b=game.indexOf(end,a+start.length);assert(a>=0&&b>a);return game.slice(a,b)};
// Execute the production Room/baseTile implementation to check the planner's
// geometry and stage-invariant classification independently of its formulas.
const core=vm.runInNewContext(`
  const W=640,H=360,TILE=16,FLOOR_TILE=4,GRID_W=40,GRID_H=19,PLAY_H=304,BOTTOM_H=56,TAU=Math.PI*2;
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
  ${source('function hash32(','\nfunction h01(')}
  ${source('class Room{','\n// Low-cost steering helpers')}
  ${source('class StaticPainter{','\nclass SpriteAtlas')}
  ({Room,StaticPainter,hash32});
`);
const shared={sourceRef:{},rendererRef:{},artRef:{},atlasRef:{},normalRef:{},specularRef:{}};
const context=(extra={})=>({...shared,renderWidth:640,renderHeight:360,lutSignature:'ground:a|water:b',resourceSignature:'atlas-v1',colorPolicy:'canvas2d-row-sync-v1',...extra});
function fixture(){return{key:'fixture',index:2,spec:{key:'fixture',pattern:'lane',objects:[{kind:'lamp',object_id:'a'}]},walls:new Set(),border:new Set(),water:new Set(),paths:new Set(),blockerStyles:{},largeTrees:[],decorLamps:[],decorExclusions:new Set(),patternExclusions:new Set(),bridgeCells:new Set(),bridgePhases:[],bridgeSegments:[],bridgeIsland:[],floorMicrotile:4}}
function clone(room){const copy={};for(const [key,value] of Object.entries(room))copy[key]=value instanceof Set?new Set(value):JSON.parse(JSON.stringify(value));return copy}
function capture(room,c=context()){const value=S.capture(room,c);assert(value.valid,value.reason);return value}
function plan(room,change,options,metadata=context()){const before=capture(room,metadata),next=clone(room);change(next);return S.plan(before,capture(next,metadata),options)}
let geometryCases=0,geometryPatches=0,geometryFallbacks=0,footprintCases=0,authorityCases=0;

function authorityAndNoops(){
  const room=fixture();room.water.add('5,5');room.paths.add('7,7');room.walls.add('8,8');room.blockerStyles={'8,8':{sprite:'foliage_a',kind:'blocker'}};
  const before=capture(room),moved=clone(room);moved.water.delete('5,5');moved.water.add('12,9');
  const after=capture(moved),delta=S.plan(before,after);
  assert.strictEqual(delta.kind,'patch');assert.strictEqual(delta.changedCellCount,2);
  assert.deepStrictEqual(delta.changedCells.map(c=>[c.x,c.y]),[[5,5],[12,9]]);
  assert.strictEqual(delta.regions.length,2,'distant same-count move remains two small uploads');
  assert.strictEqual(S.plan(after,before).kind,'patch','undo uses authoritative reverse delta');
  assert.strictEqual(S.plan(before,after).kind,'patch','redo uses authoritative forward delta');
  assert.strictEqual(S.plan(before,capture(clone(room))).kind,'noop','equivalent rebound Room remains unchanged');
  const reordered=clone(room);reordered.blockerStyles={'8,8':{kind:'blocker',sprite:'foliage_a'}};
  assert.strictEqual(S.plan(before,capture(reordered)).kind,'noop','object property order is not a static change');
  assert.strictEqual(plan(room,r=>r.paths.add('5,5')).kind,'noop','path beneath water has no visible static effect');
  assert.strictEqual(plan(room,r=>r.water.add('8,8')).kind,'noop','water beneath unchanged blocker has no static effect');
  assert.strictEqual(plan(room,r=>{r.water.add('9,8');r.water.delete('9,8')}).kind,'noop','cancelled/coalesced edit');
  const live=clone(room);Object.assign(live,{bridgeBuilt:true,bridgeProgress:9,objects:{a:[23,15]},decorRobots:[{tile:[6,9]}],editorDecor:[{x:87,y:52,sprite:'lamp_blue'}],objectFxHidden:new Set(['a']),creatureGroups:[{id:'new'}],miniRobotGroups:[{id:'new'}],grassClumps:[{x:99,y:88}]});live.spec.objects[0].object_id='renamed';live.spec.objects[0].x_fraction=.8;
  assert.strictEqual(S.plan(before,capture(live)).kind,'noop','mutable presentation/progression must stay live');
  assert.strictEqual(plan(room,r=>r.spec.objects.push({kind:'lamp',object_id:'another'})).kind,'noop','mounted-lamp substitution depends on objective kind set');
  room.water.add('14,6');room.blockerStyles['8,8'].sprite='foliage_b';
  assert.strictEqual(before.cellTypes[6*40+14],S.CELL_TYPES.ground,'snapshot keeps the previous authoritative contents');
  assert.strictEqual(S.plan(before,capture(room)).reason,'dependency:blocker-styles','in-place same-length metadata edit is visible');
  assert(Object.isFrozen(before)&&Object.isFrozen(before.cellTypes)&&Object.isFrozen(before.dependencies));
  assert.throws(()=>{before.cellTypes[0]=99},TypeError);assert.throws(()=>{before.dependencies[0][1]='bad'},TypeError);
  assert(Object.isFrozen(delta)&&Object.isFrozen(delta.regions[0])&&Object.isFrozen(delta.changedCells[0]));
  assert(Object.entries(delta.regions[0]).every(([key,value])=>key==='canvasMode'?value==='local':Number.isSafeInteger(value)),'patch geometry remains an immutable flat record with an explicit source mode');
  authorityCases+=14;
}

function dependencyFallbacks(){
  const edits=[
    ['room',r=>{r.key='changed';r.spec.key='changed'}],['room',r=>r.index++],
    ['pattern',r=>r.spec.pattern='nest'],['walls',r=>r.walls.add('10,10')],['border',r=>r.border.add('10,10')],
    ['blocker-styles',r=>r.blockerStyles['10,10']={kind:'tree',sprite:'tree'}],['trees',r=>r.largeTrees.push({tile:[9,9],sprite:'tree'})],
    ['lamps',r=>r.decorLamps.push({tile:[9,9],lamp:'lamp_blue'})],['decor-exclusions',r=>r.decorExclusions.add('5,5')],
    ['pattern-exclusions',r=>r.patternExclusions.add('lane:lamp:0')],['bridge-topology',r=>r.bridgeCells.add('5,5')],
    ['bridge-topology',r=>r.bridgePhases.push(['5,5'])],['bridge-topology',r=>r.bridgeSegments.push([[5,5]])],
    ['bridge-topology',r=>r.bridgeIsland.push([5,5])],['microtile',r=>r.floorMicrotile=8],
    ['objective-kinds',r=>r.spec.objects[0].kind='beacon']
  ];
  for(const [reason,edit] of edits){const delta=plan(fixture(),r=>{r.water.add('5,5');edit(r)});assert.strictEqual(delta.kind,'full');assert.strictEqual(delta.reason,'dependency:'+reason);authorityCases++}
  const room=fixture(),before=capture(room);
  for(const key of Object.keys(shared)){const delta=S.plan(before,capture(room,context({[key]:{}})));assert.strictEqual(delta.reason,'identity:'+key);authorityCases++}
  for(const [change,reason] of [[{renderWidth:641},'dimensions'],[{renderHeight:361},'dimensions'],[{logicalHeight:400},'dimensions'],[{logicalWidth:800,columns:50},'dimensions'],[{rows:18},'dimensions'],[{tileSize:8,columns:80},'dimensions'],[{lutSignature:'ground:b|water:a'},'lut'],[{resourceSignature:'atlas-v2'},'resource']]){assert.strictEqual(S.plan(before,capture(room,context(change))).reason,reason);authorityCases++}
  for(const direction of [1,-1]){
    const vegetation=fixture();for(const y of [6,7])for(const x of [6,7,8]){vegetation.walls.add(`${x},${y}`);vegetation.blockerStyles[`${x},${y}`]={sprite:'foliage_a'}}
    const four=clone(vegetation);for(const y of [6,7]){four.walls.add(`9,${y}`);four.blockerStyles[`9,${y}`]={sprite:'foliage_a'}}
    const a=capture(direction===1?vegetation:four),b=capture(direction===1?four:vegetation);
    assert.strictEqual(S.plan(a,b).reason,'dependency:walls','3↔4 shared-column interstitial threshold must fully rebuild');authorityCases++;
  }
}

function colorPolicyAuthority(){
  const room=fixture(),metadata=context(),before=capture(room,metadata);
  assert.strictEqual(core.StaticPainter.COLOR_POLICY,'canvas2d-row-sync-v1','planner fixture identifies the production color raster policy');
  assert.strictEqual(before.colorPolicy,metadata.colorPolicy);
  assert(Object.isFrozen(before));assert.throws(()=>{before.colorPolicy='canvas2d-row-sync-v2'},TypeError);
  const missing=context();delete missing.colorPolicy;
  for(const bad of [missing,...[undefined,null,false,0,{},[],new String('canvas2d-row-sync-v1'),'','Canvas2d-row-sync-v1','1canvas','-canvas','canvas_policy','canvas policy','canvas\n','canvas\t','canvas/row','café','a'.repeat(65)].map(colorPolicy=>context({colorPolicy}))]){
    const next=S.capture(room,bad);
    assert.strictEqual(next.valid,false,'missing, non-string or malformed policy must fail capture');
    assert.strictEqual(next.reason,'invalid-color-policy');
    const delta=S.plan(before,next);assert.strictEqual(delta.kind,'full');assert.strictEqual(delta.reason,'invalid-next:invalid-color-policy');
    authorityCases++;
  }
  for(const colorPolicy of ['a','canvas2d-row-sync-v1','a'.repeat(64)]){
    const accepted=capture(room,context({colorPolicy}));assert.strictEqual(accepted.colorPolicy,colorPolicy);authorityCases++;
  }
  for(const floorChanged of [false,true]){
    const nextRoom=clone(room);if(floorChanged)nextRoom.water.add('10,8');
    const next=capture(nextRoom,context({colorPolicy:'canvas2d-row-sync-v2'}));
    assert.strictEqual(next.resourceSignature,before.resourceSignature,'destination policy must not invalidate source art caches through the resource signature');
    assert.strictEqual(next.lutSignature,before.lutSignature);
    assert.deepStrictEqual(next.dependencies,before.dependencies,'policy remains separate from room and material dependencies');
    next.references.forEach((reference,index)=>assert.strictEqual(reference,before.references[index],'policy change must retain every source/renderer identity'));
    const delta=S.plan(before,next);
    assert.strictEqual(delta.kind,'full');assert.strictEqual(delta.reason,'color-policy','policy invalidation precedes both unchanged-floor noops and eligible terrain patches');
    assert.strictEqual(delta.regions.length,0);assert.strictEqual(delta.uploadCalls,3);assert.strictEqual(delta.uploadBytes,640*360*12);
    assert.strictEqual(S.plan(before,capture(nextRoom,metadata)).kind,floorChanged?'patch':'noop','a rejected policy transition must not mutate the previous authority');
    authorityCases++;
  }
  const changedResources=capture(room,context({colorPolicy:'canvas2d-row-sync-v2',lutSignature:'changed-lut',resourceSignature:'changed-art'}));
  assert.strictEqual(S.plan(before,changedResources).reason,'color-policy','explicit policy difference takes precedence over LUT/resource differences');
  metadata.colorPolicy='canvas2d-row-sync-v2';
  assert.strictEqual(before.colorPolicy,'canvas2d-row-sync-v1','snapshot owns its captured token independently of subsequent context mutation');
  assert.strictEqual(before.resourceSignature,'atlas-v1');assert.deepStrictEqual(before.dependencies,capture(room).dependencies);
  assert.strictEqual(S.plan(before,capture(room,metadata)).reason,'color-policy');
  assert.strictEqual(S.plan(before,capture(room)).kind,'noop');
  authorityCases+=2;
}

function budgetAndValidation(){
  const room=fixture(),before=capture(room),changed=clone(room);changed.water.add('10,8');const after=capture(changed);
  assert.strictEqual(S.plan(null,after).reason,'missing-baseline');
  const full=S.plan(null,after),noop=S.plan(before,before);
  assert.strictEqual(full.pixelCount,640*360);assert.strictEqual(full.rasterPixels,full.pixelCount);assert.strictEqual(full.scratchPixels,full.pixelCount);assert.strictEqual(full.scratchBytes,full.pixelCount*12);
  assert.strictEqual(full.scratchMode,'full');assert.strictEqual(full.scratchAllocationAttempts,3);assert.strictEqual(full.scratchAllocations,3);assert.strictEqual(full.scratchAllocationPixels,full.pixelCount*3);assert.strictEqual(full.scratchAllocationBytes,full.pixelCount*12);
  assert.strictEqual(full.uploadCalls,3);assert.strictEqual(full.uploadBytes,full.pixelCount*12,'full rebuild retains the complete three-map contract');
  assert.strictEqual(noop.scratchMode,'none');
  for(const key of ['pixelCount','rasterPixels','rasterCellCount','scratchPixels','scratchBytes','scratchAllocationAttempts','scratchAllocations','scratchAllocationPixels','scratchAllocationBytes','uploadCalls','uploadBytes'])assert.strictEqual(noop[key],0,`noop ${key} must report no work`);
  assert.strictEqual(S.plan({...before},after).reason,'invalid-baseline','untrusted/serialized snapshots must not claim rendered authority');
  assert(S.plan(before,{...after}).reason.startsWith('invalid-next'));
  const limits=[['maxChangedCells',0,'changed-cell-budget'],['maxRegions',0,'fragmentation'],['maxPixelRatio',0,'pixel-budget'],['maxRasterRatio',0,'raster-budget'],['maxScratchPixels',0,'scratch-budget'],['maxScratchAllocationPixels',0,'scratch-allocation-budget']];
  for(const [key,value,reason] of limits)assert.strictEqual(S.plan(before,after,{[key]:value}).reason,reason);
  const fragmented=clone(room);for(const [x,y] of [[2,2],[12,2],[22,2],[32,2],[2,8],[12,8],[22,8],[32,8],[2,14]])fragmented.water.add(`${x},${y}`);
  assert.strictEqual(S.plan(before,capture(fragmented)).reason,'fragmentation');
  const oversized=clone(room);for(let x=1;x<18;x++)oversized.paths.add(`${x},4`);
  assert.strictEqual(S.plan(before,capture(oversized)).reason,'changed-cell-budget');
  for(const options of [null,{maxChangedCells:NaN},{maxRegions:-1},{maxPixelRatio:2},{maxRasterRatio:Infinity},{maxScratchPixels:1.5},{maxNativeScratchPixels:-1},{maxNativeScratchPixels:Infinity},{maxScratchAllocationPixels:1.5},{maxScratchAllocationPixels:NaN}])assert.strictEqual(S.plan(before,after,options).reason,'invalid-options');
  for(const microtile of [3,5,6,7,12]){const unusual=fixture();unusual.floorMicrotile=microtile;assert.strictEqual(plan(unusual,r=>r.water.add('8,8')).reason,'unsupported-microtile');assert.strictEqual(plan(unusual,()=>{}).kind,'noop')}
  for(const microtile of [4,8,16]){const supported=fixture();supported.floorMicrotile=microtile;assert.strictEqual(plan(supported,r=>r.water.add('8,8')).kind,'patch')}
  const invalidRooms=[r=>r.paths.add('40,0'),r=>r.water.add('-1,1'),r=>r.water.add('01,1'),r=>r.walls=new Set(['2,3','bad']),r=>r.border=[],r=>r.floorMicrotile=Infinity,r=>r.decorLamps.push({tile:[2,3],alpha:NaN}),r=>r.blockerStyles.loop=r.blockerStyles,r=>r.decorLamps.push(new Date()),r=>r.largeTrees=new Array(2)];
  for(const edit of invalidRooms){const bad=fixture();edit(bad);const captured=S.capture(bad,context());assert.strictEqual(captured.valid,false);assert(S.plan(before,captured).reason.startsWith('invalid-next'))}
  for(const change of [{renderWidth:0},{renderWidth:3.5},{renderHeight:NaN},{columns:39},{logicalHeight:303},{sourceRef:null},{rendererRef:null},{artRef:null},{lutSignature:null},{resourceSignature:{}}])assert.strictEqual(S.capture(room,context(change)).valid,false);
  const blocked=fixture();blocked.blockerStyles={};let tail=blocked.blockerStyles;for(let i=0;i<34;i++)tail=tail.next={};assert.strictEqual(S.capture(blocked,context()).reason,'dependency-budget');
  assert.strictEqual(S.plan(before,after).kind,'patch','invalid requests do not mutate a valid baseline');
}

function productionRoomAuthority(){
  const story=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_story.json'),'utf8'));
  const maps=JSON.parse(fs.readFileSync(path.join(ROOT,'relay_moth_maps.json'),'utf8'));
  for(const spec of story.rooms){
    const room=new core.Room(spec.index,spec,maps),baseline=capture(room);
    for(let stage=0;stage<=room.bridgePhases.length+1;stage++)for(const built of [false,true]){
      room.bridgeProgress=stage;room.bridgeBuilt=built;const got=capture(room);
      assert.strictEqual(S.plan(baseline,got).kind,'noop',`${spec.key} stage ${stage} static invariant`);
      for(let y=0;y<19;y++)for(let x=0;x<40;x++){
        const key=`${x},${y}`,bridge=room.bridgeCells.has(key);
        const want=room.border.has(key)||room.walls.has(key)?S.CELL_TYPES.blocker:room.water.has(key)&&(bridge||!room.bridgeOpen(key))?S.CELL_TYPES.water:room.paths.has(key)||(!bridge&&room.bridgeOpen(key))?S.CELL_TYPES.path:S.CELL_TYPES.ground;
        assert.strictEqual(got.cellTypes[y*40+x],want,`${spec.key} ${key} stage ${stage}`);authorityCases++;
      }
    }
  }
}

const footprintCache=new Map();
function footprint(x,y,microtile){
  const key=[x,y,microtile].join(','),existing=footprintCache.get(key);if(existing)return existing;
  const p=new core.StaticPainter({},{}),bounds={x0:Infinity,y0:Infinity,x1:-Infinity,y1:-Infinity};p.microtile=microtile;p.col=()=>'';
  const add=(x0,y0,x1,y1)=>{bounds.x0=Math.min(bounds.x0,x0);bounds.y0=Math.min(bounds.y0,y0);bounds.x1=Math.max(bounds.x1,x1);bounds.y1=Math.max(bounds.y1,y1)};
  p.px=(_ctx,x,y,w,h)=>add(Math.floor(x),Math.floor(y),Math.floor(x)+Math.ceil(w),Math.floor(y)+Math.ceil(h));
  p.dot=(_ctx,x,y,_colour,size)=>add(x-size/2,y-size/2,x+size/2,y+size/2);
  for(const type of ['ground','water','path','blocker']){
    p.baseTile(null,x,y,core.hash32(x,y,313),type);footprintCases++;
    assert(bounds.x0>=x*16&&bounds.y0>=y*16,'production floor primitive reaches left/up outside its tile');
    assert(bounds.x1<=(x+1)*16+(microtile===4?3:0)&&bounds.y1<=(y+1)*16+(microtile===4?2:0),'production floor primitive exceeds the type-union right/down envelope');
  }
  footprintCache.set(key,bounds);return bounds;
}
function project(bounds,width,height,halo=0,logicalHeight=360){return{x0:Math.max(0,Math.floor(bounds.x0*width/640)-halo),y0:Math.max(0,Math.floor(bounds.y0*height/logicalHeight)-halo),x1:Math.min(width,Math.ceil(bounds.x1*width/640)+halo),y1:Math.min(height,Math.ceil(bounds.y1*height/logicalHeight)+halo)}}
function intersects(a,b){return a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1}
function expectedRegion(x,y,microtile,width,height,logicalHeight=360){
  const output=project({x0:x*16,y0:y*16,x1:(x+1)*16+(microtile===4?3:0),y1:(y+1)*16+(microtile===4?2:0)},width,height,0,logicalHeight);
  const nativeCanvas=width!==640||height!==360||logicalHeight!==360;
  const raster={x0:Math.max(0,Math.floor((output.x0-32)/16)*16),y0:Math.max(0,Math.floor((output.y0-32)/16)*16),x1:Math.min(width,Math.ceil((output.x1+32)/16)*16),y1:Math.min(height,Math.ceil((output.y1+32)/16)*16)};
  // Find the source strip by intersecting logical tile intervals with the
  // expanded input bounds, rather than reusing the production index formula.
  const axis=(lo,hi,scale,count)=>{
    const indices=[];
    for(let i=0;i<count;i++)if((i+1)*16>lo/scale-4-2/scale&&i*16<hi/scale+4+2/scale)indices.push(i);
    return[indices[0],indices[indices.length-1]+1];
  };
  const [tx0,tx1]=axis(raster.x0,raster.x1,width/640,40),[ty0,ty1]=axis(raster.y0,raster.y1,height/logicalHeight,19);
  return{x:output.x0,y:output.y0,width:output.x1-output.x0,height:output.y1-output.y0,rasterX:raster.x0,rasterY:raster.y0,rasterWidth:raster.x1-raster.x0,rasterHeight:raster.y1-raster.y0,canvasMode:nativeCanvas?'native-clip':'local',canvasX:nativeCanvas?0:raster.x0,canvasY:nativeCanvas?0:raster.y0,canvasWidth:nativeCanvas?width:raster.x1-raster.x0,canvasHeight:nativeCanvas?height:raster.y1-raster.y0,tx0,ty0,tx1,ty1};
}
function defaultBudgetReason(regions,width,height){
  const outputPixels=regions.reduce((n,r)=>n+r.width*r.height,0),rasterPixels=regions.reduce((n,r)=>n+r.rasterWidth*r.rasterHeight,0),sourceCells=regions.reduce((n,r)=>n+(r.tx1-r.tx0)*(r.ty1-r.ty0),0),peakPixels=Math.max(...regions.map(r=>r.canvasWidth*r.canvasHeight)),allocatedPixels=regions.reduce((n,r)=>n+r.canvasWidth*r.canvasHeight,0);
  if(outputPixels>width*height*.20)return'pixel-budget';
  if(rasterPixels>width*height*.20)return'raster-pixel-budget';
  if(sourceCells>760*.35)return'raster-budget';
  if(peakPixels>(regions[0].canvasMode==='native-clip'?1048576:262144))return'scratch-budget';
  if(allocatedPixels>2097152)return'scratch-allocation-budget';
  return'terrain';
}
function assertCrop(region,nativeHeight){
  const cropX=region.x-region.canvasX,cropY=region.y-region.canvasY;
  const skipRows=region.canvasHeight-cropY-region.height;
  assert(cropX>=0&&cropY>=0&&skipRows>=0);
  assert(cropX+region.width<=region.canvasWidth&&cropY+region.height<=region.canvasHeight);
  assert(region.x>=region.rasterX&&region.y>=region.rasterY&&region.x+region.width<=region.rasterX+region.rasterWidth&&region.y+region.height<=region.rasterY+region.rasterHeight,'uploaded output stays inside the guarded redraw clip');
  // WebGL2 TexImageSource skip rows count from the bottom when FLIP_Y is
  // enabled. Check the crop against top-origin geometry, including unequal
  // clipped guards, independently of the planner's tile-input formulas.
  assert.strictEqual(region.canvasHeight-skipRows-region.height,cropY);
  const glY=nativeHeight-region.y-region.height;
  for(const row of [0,region.height-1]){
    const sourceY=region.canvasY+region.canvasHeight-1-skipRows-row;
    const destinationY=nativeHeight-1-glY-row;
    assert.strictEqual(sourceY,destinationY,'flipped source crop and destination texture rows must agree');
  }
  assert.strictEqual(region.canvasX+cropX,region.x);
  assert.strictEqual(region.canvasX+cropX+region.width-1,region.x+region.width-1);
  return{cropX,cropY,skipRows};
}
function geometryOracle(){
  for(const [width,height,microtile] of [[640,360,4],[997,563,4],[1280,720,4],[1280,360,4],[640,720,4],[2560,1440,4],[997,563,8],[997,563,16]]){
    const metadata=context({renderWidth:width,renderHeight:height}),room=fixture();room.floorMicrotile=microtile;const before=capture(room,metadata);
    for(let i=0;i<760;i++){
      const x=i%40,y=Math.floor(i/40),next=clone(room);next.water.add(`${x},${y}`);const delta=S.plan(before,capture(next,metadata));
      const expected=expectedRegion(x,y,microtile,width,height),wantReason=defaultBudgetReason([expected],width,height),output={x0:expected.x,y0:expected.y,x1:expected.x+expected.width,y1:expected.y+expected.height};
      const visible=project(footprint(x,y,microtile),width,height);
      assert(output.x0<=visible.x0&&output.y0<=visible.y0&&output.x1>=visible.x1&&output.y1>=visible.y1,'output envelope must cover all production floor primitive overdraw, including cells which exceed the patch budgets');
      if(y===18)assert(output.y1>=Math.ceil(304*height/360),'last terrain row covers its shared footer boundary pixel without unrelated output padding');
      assert.strictEqual(delta.reason,wantReason,`${width}x${height} microtile${microtile} cell${x},${y} default eligibility`);
      assert.strictEqual(delta.nativeAlignment,16);assert.strictEqual(delta.rasterGuard,32);
      geometryCases++;
      if(wantReason!=='terrain'){
        geometryFallbacks++;
        assert.strictEqual(delta.kind,'full');assert.strictEqual(delta.regions.length,0,'an over-budget canvas must not expose a partial upload');
        assert.strictEqual(delta.changedCellCount,1);assert.strictEqual(delta.pixelCount,width*height);assert.strictEqual(delta.rasterPixels,width*height);assert.strictEqual(delta.rasterCellCount,760);assert.strictEqual(delta.scratchBytes,width*height*12);assert.strictEqual(delta.uploadCalls,3);assert.strictEqual(delta.uploadBytes,width*height*12);
        assert.strictEqual(delta.scratchMode,'full');assert.strictEqual(delta.scratchAllocationAttempts,3);assert.strictEqual(delta.scratchAllocations,3);assert.strictEqual(delta.scratchAllocationPixels,width*height*3);assert.strictEqual(delta.scratchAllocationBytes,width*height*12);
        continue;
      }
      geometryPatches++;
      assert.strictEqual(delta.kind,'patch');assert.strictEqual(delta.regions.length,1);const r=delta.regions[0],raster={x0:r.rasterX,y0:r.rasterY,x1:r.rasterX+r.rasterWidth,y1:r.rasterY+r.rasterHeight};
      for(const [key,value] of Object.entries(r))if(key!=='canvasMode')assert(Number.isSafeInteger(value));
      assert.deepStrictEqual(r,expected,'tight upload, raster origin, guarded maxima and source strip must match independently derived geometry');
      assert(r.x>=0&&r.y>=0&&output.x1<=width&&output.y1<=height);
      assert(raster.x0%16===0&&raster.y0%16===0,'guarded scratch retains the top-origin raster grid and dither phase');
      assert(raster.x1===width||raster.x1%16===0);assert(raster.y1===height||raster.y1%16===0);
      assert(r.canvasX>=0&&r.canvasY>=0&&r.canvasX+r.canvasWidth<=width&&r.canvasY+r.canvasHeight<=height);
      assert(raster.x0>=r.canvasX&&raster.y0>=r.canvasY&&raster.x1<=r.canvasX+r.canvasWidth&&raster.y1<=r.canvasY+r.canvasHeight,'guard clip stays inside its separate source canvas');
      assertCrop(r,height);
      assert(r.tx0<=x&&r.tx1>x&&r.ty0<=y&&r.ty1>y);
      if(width!==640||height!==360){assert.strictEqual(r.canvasMode,'native-clip');assert.strictEqual(r.canvasX,0);assert.strictEqual(r.canvasY,0);assert.strictEqual(r.canvasWidth,width);assert.strictEqual(r.canvasHeight,height);assert.strictEqual(delta.scratchPixels,width*height)}
      else{assert.strictEqual(r.canvasMode,'local');assert.deepStrictEqual([r.canvasX,r.canvasY,r.canvasWidth,r.canvasHeight],[r.rasterX,r.rasterY,r.rasterWidth,r.rasterHeight])}
      assert(delta.rasterCellCount<=81,'all-scale local single-cell redraw stays within nine source tiles per axis at these native scales');
      assert.strictEqual(delta.scratchMode,r.canvasMode);assert.strictEqual(delta.pixelCount,r.width*r.height);assert.strictEqual(delta.rasterPixels,r.rasterWidth*r.rasterHeight);assert.strictEqual(delta.scratchPixels,r.canvasWidth*r.canvasHeight);assert.strictEqual(delta.scratchBytes,delta.scratchPixels*4);
      assert.strictEqual(delta.scratchAllocationAttempts,1);assert.strictEqual(delta.scratchAllocations,1);assert.strictEqual(delta.scratchAllocationPixels,delta.scratchPixels);assert.strictEqual(delta.scratchAllocationBytes,delta.scratchBytes);
      assert.strictEqual(delta.uploadBytes,delta.pixelCount*4);assert.strictEqual(delta.uploadCalls,1,'eligible terrain patch uploads color once and retains unchanged material maps');
      if(i%31===0||x===39||y===18){
        // Examine every potential predecessor against actual primitive bounds,
        // independent of the planner's second halo/cell-range derivation.
        for(let cy=0;cy<19;cy++)for(let cx=0;cx<40;cx++)if(intersects(raster,project(footprint(cx,cy,microtile),width,height,2)))assert(cx>=r.tx0&&cx<r.tx1&&cy>=r.ty0&&cy<r.ty1,'source range must retain its two-native-pixel margin around every floor cell contributing to the guarded scratch');
      }
    }
  }
  const adjacent=plan(fixture(),r=>{for(const key of ['8,8','9,8','10,8','10,9'])r.paths.add(key)});
  assert.strictEqual(adjacent.kind,'patch');assert.strictEqual(adjacent.regions.length,1,'adjacent outputs merge deterministically');
  const disjoint=plan(fixture(),r=>{r.water.add('3,3');r.paths.add('30,14')});assert.strictEqual(disjoint.regions.length,2);
  assert(disjoint.pixelCount<10000&&disjoint.rasterCellCount<=162,'two distant edits remain at most two bounded 81-cell guarded inputs');
  const wet=fixture();wet.water.add('11,6');const dither=plan(wet,r=>r.water.delete('11,6')),r=dither.regions[0];
  assert.deepStrictEqual([r.x,r.y,r.width,r.height],[176,96,19,18],'color upload is independent of the scratch origin needed by the observed glow-dither case');
  assert.deepStrictEqual([r.rasterX,r.rasterY,r.rasterWidth,r.rasterHeight],[144,64,96,96]);
  assert.strictEqual(dither.pixelCount,342);assert.strictEqual(dither.rasterPixels,9216);assert.strictEqual(dither.scratchPixels,9216);assert.strictEqual(dither.rasterCellCount,64);
  assert.deepStrictEqual(assertCrop(r,360),{cropX:32,cropY:32,skipRows:46});
  for(const oldPixels of [784,1024]){
    assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxScratchPixels:oldPixels}).reason,'scratch-budget','guarded raster must count against scratch capacity');
  }
  assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxPixelRatio:(dither.pixelCount-1)/(640*360)}).reason,'pixel-budget','tightened output pixels still count against upload work');
  assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxScratchPixels:2304}).reason,'scratch-budget','upload size is insufficient scratch capacity for a guarded raster');
  assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxPixelRatio:(dither.pixelCount+1)/(640*360)}).reason,'raster-pixel-budget','a fitting upload must still charge guarded raster pixels to the unchanged ratio limit');
  assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxRasterRatio:25/760}).reason,'raster-budget','guarded source input must count against the raster-work gate');
  const material=plan(fixture(),room=>room.paths.add('20,17')).regions[0];
  assert.deepStrictEqual([material.x,material.y,material.width,material.height],[320,272,19,18],'the measured border-overlay case uploads only the changed floor envelope');
  assert.deepStrictEqual([material.rasterX,material.rasterY,material.rasterWidth,material.rasterHeight],[288,240,96,96]);
  const normal=plan(fixture(),room=>{room.water.add('10,6');room.water.add('11,6')}).regions[0];
  assert.deepStrictEqual([normal.x,normal.y,normal.width,normal.height],[160,96,35,18],'adjacent changed floor envelopes merge without adding upload alignment');
  assert.deepStrictEqual([normal.rasterX,normal.rasterY,normal.rasterWidth,normal.rasterHeight],[128,64,112,96]);
  assert.deepStrictEqual(assertCrop(normal,360),{cropX:32,cropY:32,skipRows:46});
  const fractionalPlan=plan(wet,r=>r.water.delete('11,6'),undefined,context({renderWidth:997,renderHeight:563})),fractional=fractionalPlan.regions[0];
  assert.deepStrictEqual([fractional.x,fractional.y,fractional.width,fractional.height],[274,150,30,29]);
  assert.deepStrictEqual([fractional.rasterX,fractional.rasterY,fractional.rasterWidth,fractional.rasterHeight],[240,112,96,112]);
  assert.deepStrictEqual([fractional.canvasX,fractional.canvasY,fractional.canvasWidth,fractional.canvasHeight],[0,0,997,563]);
  assert.strictEqual(fractionalPlan.rasterPixels,10752);assert.strictEqual(fractionalPlan.rasterCellCount,30);assert.strictEqual(fractionalPlan.scratchBytes,997*563*4);assert.strictEqual(fractionalPlan.uploadBytes,870*4);
  for(const [x,y] of [[289,187],[266,178]])assert(!(x>=fractional.x&&x<fractional.x+fractional.width&&y>=fractional.y&&y<fractional.y+fractional.height),'observed fractional mismatch outside the changed floor must remain untouched');
  assert.deepStrictEqual(assertCrop(fractional,563),{cropX:274,cropY:150,skipRows:384},'source crop uses full canvas height rather than local guard height');
  const pathRoom=fixture();pathRoom.paths.add('13,6');
  const pathErase=plan(pathRoom,r=>r.paths.delete('13,6'),undefined,context({renderWidth:997,renderHeight:563})).regions[0];
  assert.deepStrictEqual([pathErase.x,pathErase.y,pathErase.width,pathErase.height],[324,150,30,29]);
  assert.deepStrictEqual([pathErase.rasterX,pathErase.rasterY,pathErase.rasterWidth,pathErase.rasterHeight],[288,112,112,112]);
  assert(149<pathErase.y,'observed top-edge mismatch at348,149 must remain untouched');
  const overlappingChange=room=>{room.paths.add('9,10');room.paths.add('13,10')},overlapping=plan(fixture(),overlappingChange);
  assert.strictEqual(overlapping.kind,'patch');assert.strictEqual(overlapping.regions.length,2,'overlapping raster guards must not merge disjoint upload rectangles');
  const [a,b]=overlapping.regions;
  assert.deepStrictEqual(overlapping.regions.map(r=>[r.x,r.y,r.width,r.height]),[[144,160,19,18],[208,160,19,18]]);
  assert(a.rasterX+a.rasterWidth>b.rasterX,'fixture must overlap guarded raster work');
  assert.strictEqual(overlapping.pixelCount,684);assert.strictEqual(overlapping.rasterPixels,18432);assert.strictEqual(overlapping.rasterCellCount,128);assert.strictEqual(overlapping.scratchPixels,9216);assert.strictEqual(overlapping.scratchBytes,9216*4);assert.strictEqual(overlapping.uploadBytes,684*4);assert.strictEqual(overlapping.uploadCalls,2);
  assert.strictEqual(overlapping.scratchMode,'local');assert.strictEqual(overlapping.scratchAllocationAttempts,2);assert.strictEqual(overlapping.scratchAllocations,2);assert.strictEqual(overlapping.scratchAllocationPixels,18432);assert.strictEqual(overlapping.scratchAllocationBytes,18432*4);
  assert.strictEqual(plan(fixture(),overlappingChange,{maxPixelRatio:(overlapping.rasterPixels-1)/(640*360)}).reason,'raster-pixel-budget','overlapping guards are charged independently rather than as their geometric union');
  const sparseGuard=plan(fixture(),room=>{for(const key of ['5,5','15,5','25,5','35,5','5,13','15,13'])room.water.add(key)});
  assert.strictEqual(sparseGuard.reason,'raster-pixel-budget','six sparse small uploads can exceed the unchanged 20% guarded raster work gate');
  assert.deepStrictEqual(S.DEFAULT_LIMITS,{maxChangedCells:16,maxRegions:8,maxPixelRatio:.20,maxRasterRatio:.35,maxScratchPixels:262144,maxNativeScratchPixels:1048576,maxScratchAllocationPixels:2097152},'preserve existing work/local limits while explicitly separating the 4MiB native peak and 8MiB cumulative policy');
  const edgeRoom=fixture(),edgeMeta=context({renderWidth:997,renderHeight:563,logicalHeight:304}),edgeBefore=capture(edgeRoom,edgeMeta);edgeRoom.water.add('39,18');
  const edge=S.plan(edgeBefore,capture(edgeRoom,edgeMeta));
  assert.strictEqual(edge.kind,'patch');assert.deepStrictEqual(edge.regions[0],expectedRegion(39,18,4,997,563,304),'bottom-right fractional edit retains bounded local redraw');
  assert.strictEqual(edge.regions.length,1);assert.strictEqual(edge.uploadCalls,1);
  for(const [x,y] of [[39,18],[39,0],[0,18]]){
    const clipped=plan(fixture(),room=>room.water.add(`${x},${y}`),undefined,edgeMeta);assert.strictEqual(clipped.kind,'patch');
    const r=clipped.regions[0];assert.deepStrictEqual(r,expectedRegion(x,y,4,997,563,304));
    const crop=assertCrop(r,563);
    if(x===39){assert.strictEqual(r.x+r.width,997);assert.strictEqual(r.rasterX+r.rasterWidth,997);assert.strictEqual(crop.cropX+r.width,r.canvasWidth)}
    if(y===18){assert.strictEqual(r.y+r.height,563);assert.strictEqual(r.rasterY+r.rasterHeight,563);assert.strictEqual(crop.skipRows,0,'bottom-clipped source crop must skip zero flipped rows')}
  }
}

function canvasCapacityBudgets(){
  const metadata=context({renderWidth:997,renderHeight:563}),nativePixels=997*563;
  // Every target other than the original 640x360 retains full dimensions on
  // both axes, including integer and integer-anisotropic scaling. Its guarded
  // redraw and floor input still remain local to the changed cell.
  for(const [width,height,cells] of [[640,563,48],[997,360,40],[1280,720,25],[1280,360,40],[640,720,40]]){
    const delta=plan(fixture(),room=>room.water.add('11,6'),undefined,context({renderWidth:width,renderHeight:height}));
    assert.strictEqual(delta.kind,'patch');const r=delta.regions[0];
    assert.deepStrictEqual(r,expectedRegion(11,6,4,width,height));assert(r.rasterX>0&&r.rasterY>0&&r.tx0>0&&r.ty0>0);
    assert.strictEqual(r.canvasMode,'native-clip');assert.deepStrictEqual([r.canvasX,r.canvasY,r.canvasWidth,r.canvasHeight],[0,0,width,height]);
    assert.strictEqual(delta.scratchPixels,width*height);assert.strictEqual(delta.scratchBytes,width*height*4);assert.strictEqual(delta.rasterCellCount,cells);
    assert(delta.rasterPixels<delta.scratchPixels,'redraw work must not be mislabeled as canvas capacity');assertCrop(r,height);
  }
  const doubled=plan(fixture(),room=>room.paths.add('20,18'),undefined,context({renderWidth:1280,renderHeight:720})),bottom=doubled.regions[0];
  assert.strictEqual(doubled.kind,'patch');assert.strictEqual(bottom.canvasMode,'native-clip','the observed integer-scale footer case must retain the complete native target');
  assert.deepStrictEqual([bottom.x,bottom.y,bottom.width,bottom.height],[640,576,38,36],'target policy does not enlarge the actual changed floor envelope');
  assert.deepStrictEqual([bottom.rasterX,bottom.rasterY,bottom.rasterWidth,bottom.rasterHeight],[608,544,112,112]);
  assert.deepStrictEqual([bottom.canvasX,bottom.canvasY,bottom.canvasWidth,bottom.canvasHeight],[0,0,1280,720]);
  assert.deepStrictEqual([bottom.tx0,bottom.ty0,bottom.tx1,bottom.ty1],[18,16,23,19]);
  assert.strictEqual(doubled.rasterCellCount,15);assert.strictEqual(doubled.rasterPixels,12544);assert.strictEqual(doubled.scratchBytes,1280*720*4);assert.strictEqual(doubled.uploadBytes,38*36*4);
  assert.deepStrictEqual(assertCrop(bottom,720),{cropX:640,cropY:576,skipRows:108});
  const alternateLogical=plan(fixture(),room=>room.water.add('11,6'),undefined,context({logicalHeight:304}));
  assert.strictEqual(alternateLogical.kind,'patch');assert.strictEqual(alternateLogical.scratchMode,'native-clip','a custom logical extent must not masquerade as the qualified original 1x target');
  const mounted=fixture();mounted.decorLamps.push({tile:[10,8],lamp:'lamp_blue'});
  const underLamp=plan(mounted,room=>room.water.add('10,7'),undefined,metadata);
  assert.strictEqual(underLamp.kind,'patch','unchanged mounted art does not change local redraw or target policy');
  assert.deepStrictEqual(underLamp.regions[0],expectedRegion(10,7,4,997,563));
  assert.strictEqual(underLamp.rasterPixels,12544);assert.strictEqual(underLamp.rasterCellCount,36);
  const far=plan(fixture(),room=>room.paths.add('19,10'),undefined,metadata);
  assert.strictEqual(far.kind,'patch','far fractional edits use local clips, not oversized prefixes');assert.deepStrictEqual(far.regions[0],expectedRegion(19,10,4,997,563));
  assert.strictEqual(far.rasterPixels,12544);assert.strictEqual(far.rasterCellCount,42);assert.strictEqual(far.scratchPixels,nativePixels);
  const overlapChange=room=>{room.water.add('3,2');room.water.add('6,2')},overlap=plan(fixture(),overlapChange,undefined,metadata);
  assert.strictEqual(overlap.kind,'patch');assert.strictEqual(overlap.regions.length,2,'overlapping guarded clips must not merge disjoint outputs');
  assert.deepStrictEqual(overlap.regions.map(r=>[r.rasterX,r.rasterY,r.rasterWidth,r.rasterHeight]),[[32,16,112,96],[112,16,112,96]]);
  assert.strictEqual(overlap.pixelCount,1798);assert.strictEqual(overlap.rasterPixels,21504);assert.strictEqual(overlap.rasterCellCount,65);
  assert.strictEqual(overlap.scratchMode,'native-clip');assert.strictEqual(overlap.scratchPixels,nativePixels);assert.strictEqual(overlap.scratchBytes,nativePixels*4);
  assert.strictEqual(overlap.scratchAllocationAttempts,2);assert.strictEqual(overlap.scratchAllocations,2);assert.strictEqual(overlap.scratchAllocationPixels,nativePixels*2);assert.strictEqual(overlap.scratchAllocationBytes,nativePixels*8);
  assert.strictEqual(overlap.uploadCalls,2);assert.strictEqual(overlap.uploadBytes,1798*4);
  assert.strictEqual(plan(fixture(),overlapChange,{maxPixelRatio:(overlap.rasterPixels-1)/nativePixels},metadata).reason,'raster-pixel-budget','overlapping clips are charged separately, not as their geometric union');
  for(const limit of [nativePixels*2-1,nativePixels*2]){
    const bounded=plan(fixture(),overlapChange,{maxScratchAllocationPixels:limit},metadata);
    assert.strictEqual(bounded.reason,limit===nativePixels*2?'terrain':'scratch-allocation-budget','cumulative capacity charges both actual full-native canvases');
  }
  assert.strictEqual(plan(fixture(),room=>room.water.add('11,6'),{maxScratchPixels:0},metadata).kind,'patch','fractional peak uses the explicit native policy, not the local cap');
  for(const limit of [nativePixels-1,nativePixels])assert.strictEqual(plan(fixture(),room=>room.water.add('11,6'),{maxNativeScratchPixels:limit},metadata).reason,limit===nativePixels?'terrain':'scratch-budget');
  const local=plan(fixture(),room=>room.water.add('11,6'),{maxNativeScratchPixels:0});assert.strictEqual(local.kind,'patch');assert.strictEqual(local.scratchMode,'local');
  assert.strictEqual(plan(fixture(),room=>room.water.add('11,6'),{maxScratchPixels:local.scratchPixels}).kind,'patch');
  assert.strictEqual(plan(fixture(),room=>room.water.add('11,6'),{maxScratchPixels:local.scratchPixels-1}).reason,'scratch-budget','original 640x360 local capacity retains its separate peak gate');
  assert.strictEqual(plan(fixture(),room=>room.water.add('11,6'),undefined,context({renderWidth:25600,renderHeight:14400})).reason,'scratch-budget','large integral targets must satisfy the unchanged full-native 4MiB peak');
  // Repeated full-native canvases can fit peak and all redraw limits while
  // exceeding cumulative allocation. This is an additional preflight gate.
  const keys=['3,3','13,3','23,3','33,3','3,13'];
  for(const [width,height,allowed] of [[997,563,3],[1278,718,2],[1280,720,2],[1280,360,4],[640,720,4],[1024,1024,2]]){
    const meta=context({renderWidth:width,renderHeight:height}),area=width*height;
    const accepted=plan(fixture(),room=>{for(const key of keys.slice(0,allowed))room.water.add(key)},undefined,meta);
    assert.strictEqual(accepted.kind,'patch');assert.strictEqual(accepted.scratchAllocationAttempts,allowed);assert.strictEqual(accepted.scratchAllocations,allowed);
    assert.strictEqual(accepted.scratchPixels,area);assert.strictEqual(accepted.scratchBytes,area*4);assert.strictEqual(accepted.scratchAllocationPixels,area*allowed);assert.strictEqual(accepted.scratchAllocationBytes,area*allowed*4);
    assert(accepted.scratchBytes<=4*1024*1024&&accepted.scratchAllocationBytes<=8*1024*1024);
    const rejected=plan(fixture(),room=>{for(const key of keys.slice(0,allowed+1))room.water.add(key)},undefined,meta);
    assert.strictEqual(rejected.kind,'full');assert.strictEqual(rejected.reason,'scratch-allocation-budget');assert.strictEqual(rejected.regions.length,0);
    assert.strictEqual(rejected.changedCellCount,allowed+1);assert.strictEqual(rejected.scratchMode,'full');assert.strictEqual(rejected.scratchAllocationAttempts,3);assert.strictEqual(rejected.scratchAllocations,3);
    assert.strictEqual(rejected.scratchPixels,area);assert.strictEqual(rejected.scratchBytes,area*12);assert.strictEqual(rejected.scratchAllocationPixels,area*3);assert.strictEqual(rejected.scratchAllocationBytes,area*12);
    assert.strictEqual(rejected.uploadCalls,3);assert.strictEqual(rejected.uploadBytes,area*12,'full fallback reports the actual three-map rebuild, not hypothetical partial work');
  }
  for(const [width,height] of [[1025,1024],[1400,800],[2000,1000],[1920,1080],[1920,720],[1280,1080],[2560,1440]])for(const key of ['0,0','11,6','39,18']){
    const rejected=plan(fixture(),room=>room.water.add(key),undefined,context({renderWidth:width,renderHeight:height}));
    assert.strictEqual(rejected.kind,'full');assert.strictEqual(rejected.reason,'scratch-budget','oversized native target must fall back at every location before allocation');assert.strictEqual(rejected.regions.length,0);
  }
  const unchanged=fixture(),baseline=capture(unchanged,metadata),noop=S.plan(baseline,capture(clone(unchanged),metadata),{maxNativeScratchPixels:0,maxScratchAllocationPixels:0});
  assert.strictEqual(noop.kind,'noop');assert.strictEqual(noop.scratchMode,'none');assert.strictEqual(noop.scratchAllocationAttempts,0);assert.strictEqual(noop.scratchAllocations,0);assert.strictEqual(noop.scratchAllocationPixels,0);assert.strictEqual(noop.scratchAllocationBytes,0,'unchanged authority needs no canvas despite a zero capacity budget');
}

function overlayGeometryBudgets(){
  const metadata=context({renderWidth:997,renderHeight:563}),change=room=>room.paths.add('11,6'),base=plan(fixture(),change,undefined,metadata);
  const bounds={x0:130,y0:60,x1:240,y1:145},expanded=plan(fixture(),change,{overlayBounds:[bounds]},metadata),r=expanded.regions[0];
  assert.strictEqual(expanded.kind,'patch');
  assert.deepStrictEqual([r.x,r.y,r.width,r.height],[base.regions[0].x,base.regions[0].y,base.regions[0].width,base.regions[0].height],'whole-primitive guards never enlarge the uploaded output');
  assert.deepStrictEqual([r.rasterX,r.rasterY,r.rasterWidth,r.rasterHeight],[192,80,192,160]);
  assert.deepStrictEqual([r.tx0,r.ty0,r.tx1,r.ty1],[7,2,16,10],'expanded guard must recompute every required floor input');
  assert.strictEqual(expanded.rasterPixels,30720);assert.strictEqual(expanded.rasterCellCount,72);
  assert.strictEqual(expanded.scratchPixels,997*563,'geometry cannot relabel clipped work as native capacity');
  assert.strictEqual(expanded.scratchAllocationBytes,base.scratchAllocationBytes);
  const unrelated={x0:230,y0:90,x1:500,y1:130};
  assert.deepStrictEqual(plan(fixture(),change,{overlayBounds:[unrelated]},metadata),base,'an unrelated large primitive does not enlarge the dirty guard');
  assert.deepStrictEqual(plan(fixture(),change,{overlayBounds:[bounds,unrelated]},metadata),expanded,'do not recursively expand through primitives touching only the guard');
  assert.deepStrictEqual(plan(fixture(),change,{overlayBounds:[{x0:176,y0:96,x1:176,y1:114}]},metadata),base,'zero-area primitives contribute no pixels');
  bounds.x0=-100;assert.strictEqual(r.rasterX,192,'plans retain numeric geometry rather than mutable caller bounds');
  const huge={x0:-100,y0:-100,x1:800,y1:500};
  assert.strictEqual(plan(fixture(),change,{overlayBounds:[huge]},metadata).reason,'raster-pixel-budget','whole-primitive geometry must retain the existing redraw limit');
  assert.strictEqual(plan(fixture(),change,{overlayBounds:[{x0:130,y0:60,x1:240,y1:145}],maxRasterRatio:71/760},metadata).reason,'raster-budget','expanded inputs must retain the existing floor-work gate');
  for(const bad of [null,{},[null],[{x0:0,y0:0,x1:NaN,y1:1}],[{x0:2,y0:0,x1:1,y1:1}],[{x0:0,y0:0,x1:1.7e308,y1:1}]]){
    assert.strictEqual(plan(fixture(),change,{overlayBounds:bad},metadata).reason,'invalid-overlay-bounds');
  }
  assert.strictEqual(plan(fixture(),change,{overlayBounds:Array(4097).fill(huge)},metadata).reason,'overlay-bounds-budget','bound data-only geometry traversal before any raster allocation');
}

authorityAndNoops();dependencyFallbacks();colorPolicyAuthority();budgetAndValidation();productionRoomAuthority();geometryOracle();canvasCapacityBudgets();overlayGeometryBudgets();
const browser={};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'static_terrain.js'),'utf8'),browser);assert.strictEqual(typeof browser.RelayStaticTerrain.capture,'function');assert.strictEqual(browser.RelayStaticTerrain.VERSION,S.VERSION);
console.log('STATIC TERRAIN PLANNER REGRESSION PERF-004 PASS');
console.log('  authoritative classifications / invalidation checks:',authorityCases);
console.log('  native single-cell geometry cases:',geometryCases,'; production floor primitive footprints:',footprintCases);
console.log('  default-budget geometry outcomes:',geometryPatches,'patches /',geometryFallbacks,'full fallbacks');
console.log('  exact same-count moves, undo/redo, live-state noops, all static dependencies, identities, budgets and malformed/stale authority');
console.log('  original 640x360 local / fractional / 2x / integer-anisotropic / over-cap 4x floor envelopes, guarded redraw and native target crops');
console.log('  1MiB local / 4MiB native peak, 8MiB cumulative allocation, separate attempted/allocation counts, clipped edges and unchanged redraw budgets');
console.log('  bounded color-only bytes/calls, unchanged material authority, complete three-map full-build accounting');
console.log('  explicit bounded color-policy tokens, immutable capture and full invalidation independent of source caches/material dependencies');
console.log('  complete overlay geometry, nonrecursive guards, recomputed floor inputs, immutable plans and unchanged work/capacity limits');
