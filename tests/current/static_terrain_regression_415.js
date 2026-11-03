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
const context=(extra={})=>({...shared,renderWidth:640,renderHeight:360,lutSignature:'ground:a|water:b',resourceSignature:'atlas-v1',...extra});
function fixture(){return{key:'fixture',index:2,spec:{key:'fixture',pattern:'lane',objects:[{kind:'lamp',object_id:'a'}]},walls:new Set(),border:new Set(),water:new Set(),paths:new Set(),blockerStyles:{},largeTrees:[],decorLamps:[],decorExclusions:new Set(),patternExclusions:new Set(),bridgeCells:new Set(),bridgePhases:[],bridgeSegments:[],bridgeIsland:[],floorMicrotile:4}}
function clone(room){const copy={};for(const [key,value] of Object.entries(room))copy[key]=value instanceof Set?new Set(value):JSON.parse(JSON.stringify(value));return copy}
function capture(room,c=context()){const value=S.capture(room,c);assert(value.valid,value.reason);return value}
function plan(room,change,options,metadata=context()){const before=capture(room,metadata),next=clone(room);change(next);return S.plan(before,capture(next,metadata),options)}
let geometryCases=0,footprintCases=0,authorityCases=0;

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

function budgetAndValidation(){
  const room=fixture(),before=capture(room),changed=clone(room);changed.water.add('10,8');const after=capture(changed);
  assert.strictEqual(S.plan(null,after).reason,'missing-baseline');
  assert.strictEqual(S.plan({...before},after).reason,'invalid-baseline','untrusted/serialized snapshots must not claim rendered authority');
  assert(S.plan(before,{...after}).reason.startsWith('invalid-next'));
  const limits=[['maxChangedCells',0,'changed-cell-budget'],['maxRegions',0,'fragmentation'],['maxPixelRatio',0,'pixel-budget'],['maxRasterRatio',0,'raster-budget'],['maxScratchPixels',0,'scratch-budget']];
  for(const [key,value,reason] of limits)assert.strictEqual(S.plan(before,after,{[key]:value}).reason,reason);
  const fragmented=clone(room);for(const [x,y] of [[2,2],[12,2],[22,2],[32,2],[2,8],[12,8],[22,8],[32,8],[2,14]])fragmented.water.add(`${x},${y}`);
  assert.strictEqual(S.plan(before,capture(fragmented)).reason,'fragmentation');
  const oversized=clone(room);for(let x=1;x<18;x++)oversized.paths.add(`${x},4`);
  assert.strictEqual(S.plan(before,capture(oversized)).reason,'changed-cell-budget');
  for(const options of [null,{maxChangedCells:NaN},{maxRegions:-1},{maxPixelRatio:2},{maxRasterRatio:Infinity},{maxScratchPixels:1.5}])assert.strictEqual(S.plan(before,after,options).reason,'invalid-options');
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
  for(const type of ['ground','water','path','blocker']){p.baseTile(null,x,y,core.hash32(x,y,313),type);footprintCases++}
  footprintCache.set(key,bounds);return bounds;
}
function project(bounds,width,height){return{x0:Math.max(0,Math.floor(bounds.x0*width/640)-2),y0:Math.max(0,Math.floor(bounds.y0*height/360)-2),x1:Math.min(width,Math.ceil(bounds.x1*width/640)+2),y1:Math.min(height,Math.ceil(bounds.y1*height/360)+2)}}
function intersects(a,b){return a.x0<b.x1&&b.x0<a.x1&&a.y0<b.y1&&b.y0<a.y1}
function geometryOracle(){
  for(const [width,height,microtile] of [[640,360,4],[997,563,4],[1280,720,4],[2560,1440,4],[997,563,8],[997,563,16]]){
    const metadata=context({renderWidth:width,renderHeight:height}),room=fixture();room.floorMicrotile=microtile;const before=capture(room,metadata);
    for(let i=0;i<760;i++){
      const x=i%40,y=Math.floor(i/40),next=clone(room);next.water.add(`${x},${y}`);const delta=S.plan(before,capture(next,metadata));
      assert.strictEqual(delta.kind,'patch');assert.strictEqual(delta.regions.length,1);const r=delta.regions[0],output={x0:r.x,y0:r.y,x1:r.x+r.width,y1:r.y+r.height};
      for(const value of Object.values(r))assert(Number.isSafeInteger(value));
      assert(r.x>=0&&r.y>=0&&output.x1<=width&&output.y1<=height);
      assert.strictEqual(delta.nativeAlignment,16);
      assert(r.x%16===0&&r.y%16===0,'scratch top-left origin must preserve the qualified 16px raster grid and 8x8 dither phase');
      assert(output.x1===width||output.x1%16===0,'right edge is aligned or clipped to native bounds');
      assert(output.y1===height||output.y1%16===0,'bottom edge is aligned or clipped to native bounds');
      if(output.y1!==height)assert.strictEqual((height-output.y1)%16,height%16,'fractional-height GL upload flip must not change top-origin alignment');
      assert(r.tx0<=x&&r.tx1>x&&r.ty0<=y&&r.ty1>y);
      assert(delta.rasterCellCount<=25&&delta.rasterCellCount<760,'aligned single-cell work stays within five source tiles per axis at these native scales');
      assert(delta.pixelCount===r.width*r.height&&delta.scratchPixels===delta.pixelCount);
      assert.strictEqual(delta.uploadBytes,delta.pixelCount*12);assert.strictEqual(delta.uploadCalls,3);
      const visible=project(footprint(x,y,microtile),width,height);
      assert(output.x0<=visible.x0&&output.y0<=visible.y0&&output.x1>=visible.x1&&output.y1>=visible.y1,'output must cover all production floor primitive overdraw');
      if(i%31===0||x===39||y===18){
        // Examine every potential predecessor against actual primitive bounds,
        // independent of the planner's second halo/cell-range derivation.
        for(let cy=0;cy<19;cy++)for(let cx=0;cx<40;cx++)if(intersects(output,project(footprint(cx,cy,microtile),width,height)))assert(cx>=r.tx0&&cx<r.tx1&&cy>=r.ty0&&cy<r.ty1,'source range must replay every contributing floor cell');
      }
      if(y===18)assert(output.y1>Math.ceil(304*height/360),'last terrain row includes the footer boundary');
      geometryCases++;
    }
  }
  const adjacent=plan(fixture(),r=>{for(const key of ['8,8','9,8','10,8','10,9'])r.paths.add(key)});
  assert.strictEqual(adjacent.kind,'patch');assert.strictEqual(adjacent.regions.length,1,'adjacent outputs merge deterministically');
  const disjoint=plan(fixture(),r=>{r.water.add('3,3');r.paths.add('30,14')});assert.strictEqual(disjoint.regions.length,2);
  assert(disjoint.pixelCount<10000&&disjoint.rasterCellCount<=50,'two distant edits remain at most two bounded 25-cell inputs');
  const wet=fixture();wet.water.add('11,6');const dither=plan(wet,r=>r.water.delete('11,6')),r=dither.regions[0];
  assert.deepStrictEqual([r.x,r.y,r.width,r.height],[160,80,48,48],'observed 170,90 28x28 glow failure must expand outward to the 16px grid');
  assert.strictEqual(dither.pixelCount,2304);assert.strictEqual(dither.rasterCellCount,25);
  for(const oldPixels of [784,1024]){
    assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxScratchPixels:oldPixels}).reason,'scratch-budget','alignment expansion must count against scratch capacity');
    assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxPixelRatio:oldPixels/(640*360)}).reason,'pixel-budget','alignment expansion must count against upload work');
  }
  assert.strictEqual(plan(wet,r=>r.water.delete('11,6'),{maxRasterRatio:16/760}).reason,'raster-budget','expanded source input must count against the raster-work gate');
  const material=plan(fixture(),room=>room.paths.add('20,17')).regions[0];
  assert.deepStrictEqual([material.x,material.y,material.width,material.height],[304,256,48,48],'observed 312,264 32x32 specular-edge failure must use the measured 16px top-origin expansion');
  assert.deepStrictEqual(S.DEFAULT_LIMITS,{maxChangedCells:16,maxRegions:8,maxPixelRatio:.20,maxRasterRatio:.35,maxScratchPixels:262144},'native alignment must not weaken default work budgets');
  const edgeRoom=fixture(),edgeMeta=context({renderWidth:997,renderHeight:563,logicalHeight:304}),edgeBefore=capture(edgeRoom,edgeMeta);edgeRoom.water.add('39,18');
  const edge=S.plan(edgeBefore,capture(edgeRoom,edgeMeta)).regions[0];
  assert(edge.x%16===0&&edge.y%16===0);assert.strictEqual(edge.x+edge.width,997);assert.strictEqual(edge.y+edge.height,563,'nonmultiple native bounds must clip the outward-aligned output');
}

authorityAndNoops();dependencyFallbacks();budgetAndValidation();productionRoomAuthority();geometryOracle();
const browser={};vm.runInNewContext(fs.readFileSync(path.join(ROOT,'static_terrain.js'),'utf8'),browser);assert.strictEqual(typeof browser.RelayStaticTerrain.capture,'function');assert.strictEqual(browser.RelayStaticTerrain.VERSION,S.VERSION);
console.log('STATIC TERRAIN PLANNER REGRESSION PERF-004 PASS');
console.log('  authoritative classifications / invalidation checks:',authorityCases);
console.log('  native single-cell geometry cases:',geometryCases,'; production floor primitive footprints:',footprintCases);
console.log('  exact same-count moves, undo/redo, live-state noops, all static dependencies, identities, budgets and malformed/stale authority');
console.log('  1x / fractional / 2x / 4x halos, 16px top-origin raster alignment, clipped native edges, unchanged work budgets and footer boundary');
