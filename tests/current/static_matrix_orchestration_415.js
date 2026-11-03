#!/usr/bin/env node
'use strict';

// Exercise the native fixture's real byte oracle and collection/repair control
// flow with tiny in-memory textures. This is not Canvas/WebGL pixel evidence.
// Native work/capacity gates remain in the browser fixture without substitution.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const sourcePath=process.argv[2]||path.join(__dirname,'static_terrain_browser_415.js');
const source=fs.readFileSync(sourcePath,'utf8');
const marker='  root.auditStaticTerrain=';
assert.equal(source.split(marker).length,2,'native fixture export marker must be unique');
const hooks=`
  root.matrixTest={parity,collectedParity,completeParityCase,collectParityMatrix,repairParityBaseline,
    captureNormalBaseline,assertNormalSources,measured,negativeControls,run,
    active:()=>parityMatrix,normal:()=>normalBaseline,
    replace(overrides){
      if(overrides.capture)capture=overrides.capture;
      if(overrides.reference)reference=overrides.reference;
      if(overrides.instrument)instrument=overrides.instrument;
      if(overrides.authority)authority=overrides.authority;
      if(overrides.fullFrameTerrainDiagnostics)fullFrameTerrainDiagnostics=overrides.fullFrameTerrainDiagnostics;
      if(overrides.patchRasterDiagnostics)patchRasterDiagnostics=overrides.patchRasterDiagnostics;
      if(overrides.compositionStageDiagnostics)compositionStageDiagnostics=overrides.compositionStageDiagnostics;
      if(overrides.setup)setup=overrides.setup;
      if(overrides.nativeCropCases)nativeCropCases=overrides.nativeCropCases;
      if(overrides.legacyCompatibility)legacyCompatibility=overrides.legacyCompatibility;
      if(overrides.eligibleCases)eligibleCases=overrides.eligibleCases;
      if(overrides.naturalCases)naturalCases=overrides.naturalCases;
      if(overrides.fallbackCases)fallbackCases=overrides.fallbackCases;
      if(overrides.recoveryCases)recoveryCases=overrides.recoveryCases;
      if(overrides.ownershipCases)ownershipCases=overrides.ownershipCases;
    }
  };
`;
const instrumentedSource=source.replace(marker,hooks+marker);
const channels=['color','normal','specular'];
const cloneMaps=maps=>maps.map(bytes=>new Uint8Array(bytes));
const plain=value=>JSON.parse(JSON.stringify(value));
let passed=0;
function test(label,body){body();passed++;console.log('PASS '+label)}

function fixture(){
  const width=4,height=3,pixels=width*height;
  const fresh=()=>channels.map((name,c)=>Uint8Array.from({length:pixels*4},(_,i)=>i%4===3?255:10+c*30+i%7));
  const f={wanted:fresh(),actual:null,events:[],repairs:0,referenceCalls:0,colorPolicy:'canvas2d-row-sync-v1',heavy:{terrain:0,patch:0,stages:0},referenceHook:null,repairHook:null,work:null};
  f.actual=cloneMaps(f.wanted);
  const sourceRef={},rendererRef={},artRef={},canvas={width:8,height:9};
  const key='lamp|0|0.000000';
  const art={normalImg:{},normalTransformCache:new Map([[key,canvas]]),transformedNormal(name,flip=false,rot=0){return this.normalTransformCache.get(name+'|'+(flip?1:0)+'|'+rot.toFixed(6))}};
  const g={NO_ERROR:0,error:0,TEXTURE_2D:3553,TEXTURE_BINDING_2D:32873,UNPACK_FLIP_Y_WEBGL:37440,RGBA:6408,UNSIGNED_BYTE:5121,binding:null,flip:true,
    getError(){const error=this.error;this.error=0;return error},
    getParameter(name){return name===this.TEXTURE_BINDING_2D?this.binding:this.flip},
    bindTexture(target,texture){this.binding=texture},pixelStorei(name,value){if(name===this.UNPACK_FLIP_Y_WEBGL)this.flip=value},
    texSubImage2D(target,level,x,y,w,h,format,type,data){assert.equal(data.length,4);f.actual[this.binding.channel].set(data,0)}};
  const game={room:{key:'tiny-room'},art,renderer:{nativeW:width,nativeH:height,backgroundReady:true,gl:g,
      bgTex:{channel:0},bgNormalTex:{channel:1},bgSpecTex:{channel:2},c:{},resizeToDisplaySize(){}},
    painter:{lastMaterialMaps:null},currentStatic:null,staticRefreshStats:{mode:'noop',colorSyncAttempts:0,colorSyncReads:0,readbackPixels:0},staticTerrainSnapshot:{label:'previous'},
    maps:{rooms:{}},rooms:[],state:{room:0,completed:new Set()},graphics:{},staticTerrainContext(){return{}},
    enterRoom(){f.events.push('restore room')},
    refreshEditorStatic(options){
      assert.equal(options.force,true);f.repairs++;f.events.push('diagnostic repair');
      f.actual=cloneMaps(f.wanted);if(art.normalImg)art.transformedNormal('lamp');
      game.staticRefreshStats={mode:'full',reason:'forced',rasterCells:760};
      if(f.work){f.work.fullBuilds++;f.work.fullUploads=channels.map(channel=>({channel}));f.work.floorCalls=760}
      if(f.repairHook)f.repairHook();
    },
    ensureBackground(force){assert.equal(force,true);f.actual=cloneMaps(f.wanted)}};
  const snapshot=()=>({valid:true,geometry:{renderWidth:game.renderer.nativeW,renderHeight:game.renderer.nativeH},cellTypes:[0,0,0],
    dependencies:[['room','tiny-room']],lutSignature:'lut',resourceSignature:'resource',colorPolicy:f.colorPolicy,references:[sourceRef,rendererRef,artRef]});
  const editor={active:true,history:new Map(),choice:{},transaction:null,clearPendingInvalidation(){},resetPointerState(){},toggle(){}};
  const context=vm.createContext({game,rmfEditor:editor,StaticPainter:{COLOR_POLICY:f.colorPolicy},RelayStaticTerrain:{capture:snapshot},document:{querySelector(){return null}},structuredClone,Uint8Array});
  vm.runInContext(instrumentedSource,context,{filename:sourcePath});
  const api=context.matrixTest;
  const capture=()=>({width:game.renderer.nativeW,height:game.renderer.nativeH,maps:cloneMaps(f.actual)});
  const reference=()=>{f.referenceCalls++;if(art.normalImg)art.transformedNormal('lamp');if(f.referenceHook)f.referenceHook();return cloneMaps(f.wanted)};
  const work=()=>({fullBuilds:0,patchBuilds:0,floorCalls:0,fullUploads:[],subUploads:[],actorsUnchanged:true,diagnostics:{...game.staticRefreshStats}});
  const instrument=action=>{assert.equal(f.work,null,'case/repair instrumentation must be separate');f.work=work();try{action();f.work.diagnostics={...game.staticRefreshStats};return f.work}finally{f.work=null}};
  api.replace({capture,reference,instrument,authority(){f.events.push('authority checked')},
    fullFrameTerrainDiagnostics(){f.heavy.terrain++;return{testOnly:true}},patchRasterDiagnostics(){f.heavy.patch++;return{testOnly:true}},compositionStageDiagnostics(){f.heavy.stages++;return{testOnly:true}},
    setup(){f.events.push(api.active()?'setup in collection':'setup outside collection');f.actual=cloneMaps(f.wanted)}});
  api.captureNormalBaseline(()=>art.transformedNormal('lamp'));
  Object.assign(f,{api,context,game,art,g,key,canvas,capture,makeWork:work,snapshot});
  f.case=(label,mode='patch',change=()=>{},uploads=[{channel:'color',x:0,y:0,width:1,height:1}])=>{
    const before=capture(),beforeSnapshot=game.staticTerrainSnapshot;
    change();const observed=work();observed.patchBuilds=mode==='patch'?1:0;observed.floorCalls=mode==='patch'?25:0;observed.subUploads=mode==='patch'?uploads:[];
    observed.diagnostics={mode,rasterCells:observed.floorCalls,pixels:mode==='patch'?1:0};game.staticRefreshStats=observed.diagnostics;
    const checked=api.collectedParity(label,mode,before,observed,beforeSnapshot);
    return api.completeParityCase({label,...observed,textures:checked.textures},mode,checked.failure);
  };
  return f;
}

test('exact byte oracle accepts a complete clean collection',()=>{
  const f=fixture(),result=f.api.collectParityMatrix(()=>({cases:[f.case('patch'),f.case('noop','noop')]}));
  assert.equal(result.parityMatrix.completed,true);assert.equal(result.parityMatrix.aborted,false);
  assert.equal(result.parityMatrix.failures.length,0);assert.equal(result.parityMatrix.cases.length,2);
  assert(result.cases.every(row=>row.parityPassed));assert.equal(f.repairs,0);assert.equal(f.api.active(),null);
  assert.doesNotThrow(()=>JSON.stringify(result));
});

test('two mismatches stay fatal after independent repairs and later passing cases',()=>{
  const f=fixture(),rows=[];
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    rows.push(f.case('first failed patch','patch',()=>{f.wanted[0][0]++}));
    assert.deepEqual(f.actual,f.wanted,'repair must restore the current baseline before continuing');
    rows.push(f.case('passing after repair'));
    rows.push(f.case('second failed patch','patch',()=>{f.wanted[2][4]++}));
    rows.push(f.case('passing final noop','noop'));
    return{cases:rows};
  }),/native parity matrix rejected 2\/4 cases/);
  const diagnostic=f.context.__staticRasterDiagnostics,matrix=diagnostic.matrix;
  assert.equal(diagnostic.label,'first failed patch');assert.equal(matrix.completed,true);assert.equal(matrix.aborted,false);
  assert.deepEqual(rows.map(row=>row.parityPassed),[false,true,false,true]);assert.equal(matrix.failures.length,2);
  assert.deepEqual(f.heavy,{terrain:1,patch:1,stages:1});assert.equal(f.repairs,2);
  assert.equal(rows[0].fullBuilds,0);assert.equal(rows[0].patchBuilds,1);assert.equal(rows[0].floorCalls,25);
  assert.equal(rows[0].diagnostics.mode,'patch');assert.equal(rows[0].diagnosticRepair.outsideMeasuredWork,true);
  assert.equal(rows[0].diagnosticRepair.fullBuilds,1);assert.equal(rows[0].diagnosticRepair.patchBuilds,0);
  assert.equal(rows[0].diagnosticRepair.fullUploads.length,3);assert.equal(rows[0].diagnosticRepair.diagnostics.mode,'full');
  assert.equal(matrix.cases[0].parityPassed,false);assert.equal(matrix.failures[1].maps.specular.bytes,1);
  assert.equal(matrix.failures[1].maps.color.bytes,0);assert.equal(matrix.failures[1].maps.normal.bytes,0);
  assert.equal(matrix.failures[0].maps.color.examples[0].referenceChanged,true);
  assert.equal(matrix.failures[0].maps.color.changedOutside,0);
  assert.equal(diagnostic.matrixResult.cases,rows,'the complete original result must accompany aggregate failure');
  assert.doesNotThrow(()=>JSON.stringify(diagnostic),'the retained first diagnostic and complete report must not cycle');
  assert.equal(f.api.active(),null);
});

test('unintended exterior writes remain failures even when whole textures match the reference',()=>{
  const f=fixture();let row;
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    row=f.case('exterior corruption','patch',()=>{f.actual[0][8]++;f.wanted[0][8]++});return{};
  }),/native parity matrix rejected 1\/1 cases/);
  assert.equal(row.textures.color.bytes,0);assert.equal(row.textures.color.changedOutside,1);
  assert.equal(row.textures.color.changedOutsidePixels,1);assert.equal(row.textures.color.exteriorExamples.length,1);
  assert.equal(row.textures.color.exteriorExamples[0].x,2);assert.equal(row.parityPassed,false);
  assert.equal(f.repairs,1);
});

test('direct parity and explicit collection wrapper still throw outside collecting mode',()=>{
  const f=fixture();f.actual[1][0]++;
  assert.throws(()=>f.api.parity('strict direct'),/normal full GPU texture differs/);
  assert.throws(()=>f.api.collectedParity('strict wrapper','patch',f.capture(),f.makeWork()),/normal full GPU texture differs/);
  assert.equal(f.api.active(),null);assert.equal(f.repairs,0);
});

test('the actual three-channel corruption controls execute outside collection and reject corruption',()=>{
  const f=fixture(),result=f.api.negativeControls({});
  assert.deepEqual(plain(result),channels.map(channel=>({channel,singleBitCorruptionRejected:true,corruptionRejected:true})));
  assert.deepEqual(f.events,['setup outside collection']);assert.equal(f.api.active(),null);
  assert.equal(f.context.__staticRasterDiagnostics,undefined);assert.deepEqual(f.actual,f.wanted);
});

test('a direct setup parity failure still stops an active collection without interception',()=>{
  const f=fixture();let continued=false;
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    f.actual[0][0]++;f.api.parity('initial baseline');continued=true;return{};
  }),/initial baseline color full GPU texture differs/);
  assert.equal(continued,false);assert.equal(f.repairs,0);
  assert.equal(f.context.__staticRasterDiagnostics.matrix.aborted,true);
  assert.equal(f.context.__staticRasterDiagnostics.matrix.failures.length,0);
});

test('a WebGL error aborts immediately even if pixels also mismatch',()=>{
  const f=fixture();let continued=false;
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    f.case('GL failure','patch',()=>{f.wanted[0][0]++;f.g.error=1282});continued=true;return{};
  }),/GL failure color full GPU texture differs/);
  assert.equal(continued,false);assert.equal(f.repairs,0);assert.equal(f.api.active(),null);
  const diagnostic=f.context.__staticRasterDiagnostics;
  assert.equal(diagnostic.glError,1282);assert.equal(diagnostic.matrix.aborted,true);assert.equal(diagnostic.matrix.failures.length,0);
});

test('an unrelated reference exception is never classified as a pixel mismatch',()=>{
  const f=fixture();f.referenceHook=()=>{throw Error('reference construction failed')};
  assert.throws(()=>f.api.collectParityMatrix(()=>{f.case('bad reference');return{}}),/reference construction failed/);
  const matrix=f.context.__staticRasterDiagnostics.matrix;
  assert.equal(matrix.aborted,true);assert.equal(matrix.failures.length,0);assert.equal(f.repairs,0);
});

test('a later structural abort preserves the first diagnostic and partially completed original result',()=>{
  const f=fixture(),partial={legacyCompatibility:[{accepted:'prelude'}],native:[]};
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    partial.native.push(f.case('earlier failed patch','patch',()=>{f.wanted[0][0]++}));
    throw Error('later capacity gate failed');
  },partial),/later capacity gate failed/);
  const diagnostic=f.context.__staticRasterDiagnostics;
  assert.equal(diagnostic.label,'earlier failed patch');assert.equal(diagnostic.matrix.aborted,true);
  assert.equal(diagnostic.matrix.completed,false);assert.equal(diagnostic.matrix.failures.length,1);
  assert.equal(diagnostic.matrixResult,partial);assert.equal(partial.native[0].parityPassed,false);
  assert.equal(partial.legacyCompatibility[0].accepted,'prelude');assert.equal(f.api.active(),null);
  assert.doesNotThrow(()=>JSON.stringify(diagnostic));
});

test('the real measured-work gate remains fatal before pixel collection',()=>{
  const f=fixture();
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    f.api.measured('bad noop',()=>{f.work.fullBuilds++;f.game.staticRefreshStats.mode='noop'},'noop');return{};
  }),/unchanged authority did rendering work/);
  assert.equal(f.referenceCalls,0);assert.equal(f.repairs,0);
  assert.equal(f.context.__staticRasterDiagnostics.matrix.failures.length,0);
});

test('normal-source mutation by a reference aborts before repair can replace its baseline',()=>{
  const f=fixture();f.referenceHook=()=>{f.art.normalTransformCache.set(f.key,{width:8,height:9})};
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    f.api.measured('cache identity',()=>{f.wanted[0][0]++;f.game.staticRefreshStats.mode='noop'},'noop');return{};
  }),/after full reference replaced transformed normal source/);
  assert.equal(f.repairs,0);assert.equal(f.context.__staticRasterDiagnostics.matrix.aborted,true);
  assert.equal(f.context.__staticRasterDiagnostics.matrix.failures.length,1);
});

test('a failed full repair stops the matrix without erasing its original failed outcome',()=>{
  const f=fixture();f.repairHook=()=>{f.actual[0][0]^=1};let continued=false;
  assert.throws(()=>f.api.collectParityMatrix(()=>{
    f.case('original patch failure','patch',()=>{f.wanted[0][0]++});continued=true;return{};
  }),/diagnostic full baseline repair color full GPU texture differs/);
  const diagnostic=f.context.__staticRasterDiagnostics,matrix=diagnostic.matrix;
  assert.equal(continued,false);assert.equal(diagnostic.label,'original patch failure');
  assert.equal(matrix.aborted,true);assert.equal(matrix.completed,false);assert.equal(matrix.failures.length,1);
  assert.equal(matrix.cases[0].parityPassed,false);assert.equal(matrix.cases[0].measuredWork.diagnostics.mode,'patch');
  assert.match(matrix.failures[0].repairError,/diagnostic full baseline repair/);assert.equal(matrix.failures[0].repair,null);
  assert.deepEqual(f.heavy,{terrain:1,patch:1,stages:1});assert.equal(f.api.active(),null);
});

test('repair requires all three channels and unchanged authoritative references',()=>{
  for(const failure of ['missing channel','changed authority','changed color policy']){
    const f=fixture();
    f.repairHook=()=>{if(failure==='missing channel')f.work.fullUploads.pop();else if(failure==='changed authority')f.game.room={key:'different room'};else f.colorPolicy='different color policy'};
    assert.throws(()=>f.api.collectParityMatrix(()=>{f.case(failure,'patch',()=>{f.wanted[0][0]++});return{}}),
      failure==='missing channel'?/did not fully replace all three textures/:/baseline repair changed current authority/);
    assert.equal(f.context.__staticRasterDiagnostics.matrix.aborted,true);
    assert.equal(f.context.__staticRasterDiagnostics.matrix.failures.length,1);
  }
});

test('repair revalidates normal source identity after its own full reference',()=>{
  const f=fixture();f.referenceHook=()=>{if(f.repairs)f.art.normalTransformCache.set(f.key,{width:8,height:9})};
  assert.throws(()=>f.api.collectParityMatrix(()=>{f.case('repair source drift','patch',()=>{f.wanted[0][0]++});return{}}),
    /after diagnostic full repair reference replaced transformed normal source/);
  assert.equal(f.context.__staticRasterDiagnostics.matrix.aborted,true);assert.equal(f.repairs,1);
});

test('a legitimate missing-normal-source full case repairs without inventing a source baseline',()=>{
  const f=fixture();f.art.normalImg=null;let row;
  assert.throws(()=>f.api.collectParityMatrix(()=>{row=f.case('normal source removed','full',()=>{f.wanted[1][0]++});return{}}),
    /native parity matrix rejected 1\/1 cases/);
  assert.equal(row.parityPassed,false);assert.equal(row.diagnosticRepair.normalSources,null);assert.equal(f.api.normal(),null);
  assert.equal(f.context.__staticRasterDiagnostics.matrix.completed,true);assert.deepEqual(f.actual,f.wanted);
});

test('run keeps original negative controls strict, then visits every matrix group despite pixel failures',()=>{
  const f=fixture(),groups=[],legacy=[{observed:'legacy',defaultCompatibility:{qualified:true},coldDefaultCompatibility:{qualified:true}}];
  const group=name=>()=>{assert(f.api.active(),name+' must run inside the matrix');groups.push(name);return[f.case(name)]};
  f.api.replace({nativeCropCases(){assert.equal(f.api.active(),null);return[{observed:'crop'}]},legacyCompatibility(){assert.equal(f.api.active(),null);return legacy},
    eligibleCases(width,height){assert(f.api.active());groups.push([width,height]);return{cases:[f.case(width+'x'+height,'patch',()=>{if(width===640)f.wanted[0][0]++})]}},
    naturalCases:group('natural'),fallbackCases:group('fallback'),recoveryCases:group('recovery'),ownershipCases:group('live')});
  assert.throws(()=>f.api.run(),/native parity matrix rejected 1\/7 cases/);
  assert.deepEqual(groups,[[640,360],[997,563],[1280,720],'natural','fallback','recovery','live']);
  assert.equal(f.events[0],'setup outside collection');assert.equal(f.events.at(-1),'restore room');
  const matrix=f.context.__staticRasterDiagnostics.matrix;
  assert.equal(matrix.completed,true);assert.equal(matrix.cases.length,7);assert.equal(matrix.cases[0].parityPassed,false);
  assert(matrix.cases.slice(1).every(row=>row.parityPassed));assert.equal(f.api.active(),null);
  const result=f.context.__staticRasterDiagnostics.matrixResult;
  assert.deepEqual(plain(result.legacyCompatibility),legacy);assert.deepEqual(plain(result.nativeCrop),[{observed:'crop'}]);
  assert.deepEqual(plain(result.legacyPolicyNegativeControls.map(entry=>entry.accepted)),[true,false,false,false,false]);
  assert.equal(result.negativeControls.length,3);assert.equal(result.native.length,3);assert.equal(result.liveOwnership.length,1);
  assert.doesNotThrow(()=>JSON.stringify(f.context.__staticRasterDiagnostics));
});

test('a collected old-default policy violation remains fatal after all matrix groups pass',()=>{
  const f=fixture(),groups=[],legacy=[{defaultCompatibility:{qualified:false,textures:{color:{max:2}}},coldDefaultCompatibility:{qualified:true}}];
  const group=name=>()=>{groups.push(name);return[f.case(name)]};
  f.api.replace({nativeCropCases(){return[]},legacyCompatibility(){return legacy},
    eligibleCases(w,h){groups.push([w,h]);return{cases:[f.case(w+'x'+h)]}},naturalCases:group('natural'),fallbackCases:group('fallback'),recoveryCases:group('recovery'),ownershipCases:group('live')});
  assert.throws(()=>f.api.run(),/selected color policy exceeded its explicit default-legacy compatibility bound in 1 room\/size cases/);
  assert.equal(groups.length,7);const diagnostic=f.context.__staticRasterDiagnostics;
  assert.equal(diagnostic.matrix.aborted,true);assert.equal(diagnostic.matrix.failures.length,0);assert.equal(diagnostic.matrix.cases.length,7);
  assert(diagnostic.matrix.cases.every(row=>row.parityPassed));assert.deepEqual(plain(diagnostic.matrixResult.legacyCompatibility),legacy);
  assert.deepEqual(plain(diagnostic.legacyDefaultPolicyRejected),legacy);
});

console.log('Static native matrix orchestration PASS ('+passed+' scenarios; synthetic byte/control-flow checks, not native raster evidence).');
