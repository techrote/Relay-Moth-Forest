/* PERF-004: authoritative static-terrain deltas and bounded native raster work.
 * This module owns data only. A caller commits a captured snapshot only after
 * the background is coherent: full builds replace all three maps, while terrain
 * patches replace color and preserve their unchanged normal/specular authority.
 */
(function(root,factory){
  'use strict';
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.RelayStaticTerrain=factory();
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';

  const VERSION=1;
  const CELL_TYPES=Object.freeze({ground:0,path:1,water:2,blocker:3});
  const DEFAULT_LIMITS=Object.freeze({maxChangedCells:16,maxRegions:8,maxPixelRatio:.20,maxRasterRatio:.35,maxScratchPixels:262144,maxNativeScratchPixels:1048576,maxScratchAllocationPixels:2097152});
  const GEOMETRY_KEYS=['renderWidth','renderHeight','logicalWidth','logicalHeight','tileSize','columns','rows'];
  const REFERENCE_KEYS=['sourceRef','rendererRef','artRef','atlasRef','normalRef','specularRef'];
  const MAX_CELLS=65536,MAX_VALUE_NODES=65536,MAX_VALUE_DEPTH=32,MAX_OVERLAY_BOUNDS=4096;
  const LOGICAL_HALO=4,NATIVE_HALO=2,NATIVE_ALIGNMENT=16,NATIVE_RASTER_GUARD=32;
  const snapshots=new WeakSet();
  const own=(object,key)=>Object.prototype.hasOwnProperty.call(object,key);

  function fail(reason){throw new Error(reason)}
  function invalid(reason){const value=Object.freeze({version:VERSION,valid:false,reason});snapshots.add(value);return value}
  function freezeArray(array){return Object.freeze(array)}

  // Exact canonical values, rather than lengths or probabilistic hashes, retain
  // same-count moves and in-place metadata edits. Limits make malformed/cyclic
  // authorities a full-build fallback instead of unbounded snapshot work.
  function canonical(value){
    let remaining=MAX_VALUE_NODES;
    const active=new Set();
    function visit(item,depth){
      if(--remaining<0||depth>MAX_VALUE_DEPTH)fail('dependency-budget');
      if(item===null||typeof item==='string'||typeof item==='boolean')return item;
      if(typeof item==='number'){if(!Number.isFinite(item))fail('nonfinite-dependency');return item}
      if(typeof item!=='object')fail('unsupported-dependency');
      if(active.has(item))fail('cyclic-dependency');
      active.add(item);
      let result;
      if(Array.isArray(item)){
        result=[];
        for(let i=0;i<item.length;i++){if(!own(item,i))fail('sparse-dependency');result.push(visit(item[i],depth+1))}
      }
      else{
        const prototype=Object.getPrototypeOf(item);
        // Plain objects from another realm are valid JSON authority too.
        if(prototype!==null&&(Object.prototype.toString.call(item)!=='[object Object]'||Object.getPrototypeOf(prototype)!==null))fail('unsupported-dependency');
        result=Object.create(null);
        for(const key of Object.keys(item).sort())result[key]=visit(item[key],depth+1);
      }
      active.delete(item);
      return result;
    }
    return JSON.stringify(visit(value,0));
  }

  function cellSet(value,name,geometry){
    if(Object.prototype.toString.call(value)!=='[object Set]')fail('invalid-'+name);
    if(value.size>geometry.columns*geometry.rows)fail('invalid-'+name);
    const keys=[];
    for(const key of value){
      if(typeof key!=='string'||!/^(0|[1-9]\d*),(0|[1-9]\d*)$/.test(key))fail('invalid-'+name);
      const [x,y]=key.split(',').map(Number);
      if(!Number.isSafeInteger(x)||!Number.isSafeInteger(y)||x>=geometry.columns||y>=geometry.rows)fail('invalid-'+name);
      keys.push(key);
    }
    keys.sort();
    return keys;
  }

  function stringSet(value,name){
    if(Object.prototype.toString.call(value)!=='[object Set]'||value.size>MAX_VALUE_NODES)fail('invalid-'+name);
    const values=[];
    for(const item of value){if(typeof item!=='string')fail('invalid-'+name);values.push(item)}
    return values.sort();
  }

  function capture(room,context={}){
    try{
      if(!room||!room.spec||!context)fail('missing-authority');
      const geometry={renderWidth:context.renderWidth,renderHeight:context.renderHeight,logicalWidth:context.logicalWidth??640,logicalHeight:context.logicalHeight??360,tileSize:context.tileSize??16,columns:context.columns??40,rows:context.rows??19};
      for(const name of GEOMETRY_KEYS)if(!Number.isSafeInteger(geometry[name])||geometry[name]<=0)fail('invalid-dimensions');
      if(geometry.columns*geometry.rows>MAX_CELLS||geometry.columns*geometry.tileSize!==geometry.logicalWidth||geometry.rows*geometry.tileSize>geometry.logicalHeight||!Number.isSafeInteger(geometry.renderWidth*geometry.renderHeight))fail('invalid-dimensions');
      if(typeof room.key!=='string'||typeof room.spec.key!=='string'||!Number.isSafeInteger(room.index))fail('invalid-room');
      if(typeof context.lutSignature!=='string'||(context.resourceSignature!==undefined&&typeof context.resourceSignature!=='string'))fail('invalid-resource-signature');
      if(typeof context.colorPolicy!=='string'||!/^[a-z][a-z0-9-]{0,63}$/.test(context.colorPolicy))fail('invalid-color-policy');
      for(const key of ['sourceRef','rendererRef','artRef'])if(!own(context,key)||context[key]==null)fail('missing-'+key);
      const references=freezeArray(REFERENCE_KEYS.map(name=>context[name]??null));
      const walls=cellSet(room.walls,'walls',geometry),border=cellSet(room.border,'border',geometry);
      cellSet(room.water,'water',geometry);cellSet(room.paths,'paths',geometry);
      const bridgeCells=cellSet(room.bridgeCells||new Set(),'bridge-cells',geometry);
      const microtile=room.floorMicrotile||4;
      if(!Number.isFinite(microtile)||microtile<=0)fail('invalid-microtile');
      const objectives=room.spec.objects||[];
      if(!Array.isArray(objectives)||objectives.length>MAX_VALUE_NODES)fail('invalid-objectives');
      const objectiveKinds=new Set();
      for(const object of objectives){if(!object||typeof object.kind!=='string')fail('invalid-objectives');objectiveKinds.add(object.kind)}
      const dependencies=freezeArray([
        ['room',canonical([room.key,room.index,room.spec.key])],
        ['pattern',canonical(room.spec.pattern||room.spec.key)],
        ['walls',canonical(walls)],
        ['border',canonical(border)],
        ['blocker-styles',canonical(room.blockerStyles||{})],
        ['trees',canonical(room.largeTrees||[])],
        ['lamps',canonical(room.decorLamps||[])],
        ['decor-exclusions',canonical(stringSet(room.decorExclusions||new Set(),'decor-exclusions'))],
        ['pattern-exclusions',canonical(stringSet(room.patternExclusions||new Set(),'pattern-exclusions'))],
        ['bridge-topology',canonical([bridgeCells,room.bridgePhases||[],room.bridgeSegments||[],room.bridgeIsland||[]])],
        ['microtile',canonical(microtile)],
        // Mounted lamps substitute any sprite already used by an objective.
        // Objective positions, identifiers and completion are live presentation.
        ['objective-kinds',canonical([...objectiveKinds].sort())]
      ].map(freezeArray));
      const cellTypes=[];
      for(let y=0;y<geometry.rows;y++)for(let x=0;x<geometry.columns;x++){
        const key=x+','+y;
        // Room.bridgeOpen is false outside bridgeCells. Bridge cells keep their
        // water backing at every progression stage, so progression is excluded.
        cellTypes.push(room.border.has(key)||room.walls.has(key)?CELL_TYPES.blocker:room.water.has(key)?CELL_TYPES.water:room.paths.has(key)?CELL_TYPES.path:CELL_TYPES.ground);
      }
      const snapshot=Object.freeze({version:VERSION,valid:true,geometry:Object.freeze(geometry),references,dependencies,cellTypes:freezeArray(cellTypes),microtile,colorPolicy:context.colorPolicy,lutSignature:context.lutSignature,resourceSignature:context.resourceSignature??''});
      snapshots.add(snapshot);
      return snapshot;
    }catch(error){return invalid(error instanceof Error?error.message:'invalid-authority')}
  }

  function result(kind,reason,next,changedCells=[],regions=[]){
    const geometry=next?.valid&&next.geometry;
    const full=kind==='full';
    const pixelCount=full?(geometry?geometry.renderWidth*geometry.renderHeight:0):regions.reduce((n,r)=>n+r.width*r.height,0);
    const rasterPixels=full?pixelCount:regions.reduce((n,r)=>n+r.rasterWidth*r.rasterHeight,0);
    const rasterCellCount=full?(geometry?geometry.columns*geometry.rows:0):regions.reduce((n,r)=>n+(r.tx1-r.tx0)*(r.ty1-r.ty0),0);
    const scratchMode=full?'full':regions.length?regions[0].canvasMode:'none';
    const scratchPixels=full?pixelCount:regions.reduce((n,r)=>Math.max(n,r.canvasWidth*r.canvasHeight),0);
    const scratchAllocations=full?3:regions.length;
    const scratchAllocationPixels=full?pixelCount*3:regions.reduce((n,r)=>n+r.canvasWidth*r.canvasHeight,0);
    const bytesPerPixel=full?12:4;
    return Object.freeze({kind,reason,changedCells:freezeArray(changedCells),changedCellCount:changedCells.length,regions:freezeArray(regions.map(Object.freeze)),pixelCount,rasterPixels,rasterCellCount,scratchMode,scratchPixels,scratchBytes:scratchPixels*bytesPerPixel,scratchAllocationAttempts:scratchAllocations,scratchAllocations,scratchAllocationPixels,scratchAllocationBytes:scratchAllocationPixels*4,uploadCalls:full?3:regions.length,uploadBytes:pixelCount*bytesPerPixel,logicalHalo:LOGICAL_HALO,nativeHalo:NATIVE_HALO,nativeAlignment:NATIVE_ALIGNMENT,rasterGuard:NATIVE_RASTER_GUARD});
  }

  function limits(options){
    if(!options||typeof options!=='object')return null;
    const out={...DEFAULT_LIMITS,...options};
    for(const name of ['maxChangedCells','maxRegions','maxScratchPixels','maxNativeScratchPixels','maxScratchAllocationPixels'])if(!Number.isSafeInteger(out[name])||out[name]<0)return null;
    if(out.maxChangedCells>MAX_CELLS||out.maxRegions>MAX_CELLS)return null;
    for(const name of ['maxPixelRatio','maxRasterRatio'])if(!Number.isFinite(out[name])||out[name]<0||out[name]>1)return null;
    return out;
  }

  function touching(a,b){return a.x0<=b.x1&&b.x0<=a.x1&&a.y0<=b.y1&&b.y0<=a.y1}
  function merge(rects){
    const out=[];
    for(const input of rects){
      let rect=input;
      for(let i=0;i<out.length;){
        if(touching(out[i],rect)){
          const other=out.splice(i,1)[0];
          rect={x0:Math.min(rect.x0,other.x0),y0:Math.min(rect.y0,other.y0),x1:Math.max(rect.x1,other.x1),y1:Math.max(rect.y1,other.y1)};
          i=0;
        }else i++;
      }
      out.push(rect);
    }
    return out.sort((a,b)=>a.y0-b.y0||a.x0-b.x0);
  }

  function plan(previous,next,options={}){
    const full=(reason,changes=[])=>result('full',reason,next,changes);
    if(!next||!snapshots.has(next)||!next.valid)return full('invalid-next'+(next?.reason?':'+next.reason:''));
    if(!previous)return full('missing-baseline');
    if(!snapshots.has(previous)||!previous.valid)return full('invalid-baseline'+(previous.reason?':'+previous.reason:''));
    const budget=limits(options);
    if(!budget)return full('invalid-options');
    for(const key of GEOMETRY_KEYS)if(previous.geometry[key]!==next.geometry[key])return full('dimensions');
    for(let i=0;i<REFERENCE_KEYS.length;i++)if(previous.references[i]!==next.references[i])return full('identity:'+REFERENCE_KEYS[i]);
    if(previous.colorPolicy!==next.colorPolicy)return full('color-policy');
    if(previous.lutSignature!==next.lutSignature)return full('lut');
    if(previous.resourceSignature!==next.resourceSignature)return full('resource');
    for(let i=0;i<next.dependencies.length;i++)if(previous.dependencies[i][1]!==next.dependencies[i][1])return full('dependency:'+next.dependencies[i][0]);
    const changes=[];
    for(let i=0;i<next.cellTypes.length;i++)if(previous.cellTypes[i]!==next.cellTypes[i])changes.push(Object.freeze({x:i%next.geometry.columns,y:Math.floor(i/next.geometry.columns),before:previous.cellTypes[i],after:next.cellTypes[i]}));
    if(!changes.length)return result('noop','unchanged',next);
    if(changes.length>budget.maxChangedCells)return full('changed-cell-budget',changes);
    // baseTile never reaches left/up of its tile. At microtile 4 its union of
    // floor types reaches +3 logical pixels right / +2 down; 8/16px microtiles
    // remain within the tile. floor(min)..ceil(max) covers intersecting native
    // pixel squares for these filled, unfiltered, unstroked primitives.
    // The separate guarded raster, not the upload, must retain dither alignment.
    // Unsupported microtiles keep the full painter until separately qualified.
    if(![4,8,16].includes(next.microtile)||next.geometry.tileSize!==16)return full('unsupported-microtile',changes);
    const g=next.geometry,sx=g.renderWidth/g.logicalWidth,sy=g.renderHeight/g.logicalHeight,overhangX=next.microtile===4?3:0,overhangY=next.microtile===4?2:0;
    const fractionalScale=!Number.isInteger(sx)||!Number.isInteger(sy);
    // Bounds come from a metadata-only replay of the actual overlay placement
    // methods. Preserve complete primitives that can touch the uploaded output:
    // clipping a sampled quad can change its interpolated texture coordinates.
    // Do not recursively include primitives touching only the enlarged guard;
    // those pixels are never uploaded. The fixed count bounds this planning work.
    const overlayBounds=[];
    if(own(options,'overlayBounds')){
      if(!Array.isArray(options.overlayBounds))return full('invalid-overlay-bounds',changes);
      if(options.overlayBounds.length>MAX_OVERLAY_BOUNDS)return full('overlay-bounds-budget',changes);
      for(const b of options.overlayBounds){
        if(!b||!['x0','y0','x1','y1'].every(key=>Number.isFinite(b[key]))||b.x1<b.x0||b.y1<b.y0)return full('invalid-overlay-bounds',changes);
        if(b.x0===b.x1||b.y0===b.y1)continue;
        const native={x0:b.x0*sx-NATIVE_HALO,y0:b.y0*sy-NATIVE_HALO,x1:b.x1*sx+NATIVE_HALO,y1:b.y1*sy+NATIVE_HALO};
        if(!Object.values(native).every(Number.isFinite))return full('invalid-overlay-bounds',changes);
        overlayBounds.push(native);
      }
    }
    const raw=changes.map(cell=>{
      const x0=Math.floor(cell.x*g.tileSize*sx),y0=Math.floor(cell.y*g.tileSize*sy);
      const x1=Math.ceil(((cell.x+1)*g.tileSize+overhangX)*sx),y1=Math.ceil(((cell.y+1)*g.tileSize+overhangY)*sy);
      // Upload only pixels the changed floor can affect. Replacing unrelated
      // overlay pixels can introduce sampling differences at fractional scales.
      return{
        x0:Math.max(0,x0),y0:Math.max(0,y0),
        x1:Math.min(g.renderWidth,x1),y1:Math.min(g.renderHeight,y1)
      };
    });
    const merged=merge(raw);
    if(merged.length>budget.maxRegions)return full('fragmentation',changes);
    const regions=merged.map(rect=>{
      // Every patch redraws only its local, aligned guard. Fractional scales
      // retain the full target size and global device origin separately: the
      // painter clips that native canvas to these guarded raster bounds.
      let x0=rect.x0-NATIVE_RASTER_GUARD,y0=rect.y0-NATIVE_RASTER_GUARD,x1=rect.x1+NATIVE_RASTER_GUARD,y1=rect.y1+NATIVE_RASTER_GUARD;
      for(const b of overlayBounds)if(touching(rect,b)){x0=Math.min(x0,b.x0);y0=Math.min(y0,b.y0);x1=Math.max(x1,b.x1);y1=Math.max(y1,b.y1)}
      const rasterX=Math.max(0,Math.floor(x0/NATIVE_ALIGNMENT)*NATIVE_ALIGNMENT);
      const rasterY=Math.max(0,Math.floor(y0/NATIVE_ALIGNMENT)*NATIVE_ALIGNMENT);
      const rasterX1=Math.min(g.renderWidth,Math.ceil(x1/NATIVE_ALIGNMENT)*NATIVE_ALIGNMENT);
      const rasterY1=Math.min(g.renderHeight,Math.ceil(y1/NATIVE_ALIGNMENT)*NATIVE_ALIGNMENT);
      return{x:rect.x0,y:rect.y0,width:rect.x1-rect.x0,height:rect.y1-rect.y0,
        rasterX,rasterY,rasterWidth:rasterX1-rasterX,rasterHeight:rasterY1-rasterY,
        canvasMode:fractionalScale?'native-clip':'local',
        canvasX:fractionalScale?0:rasterX,canvasY:fractionalScale?0:rasterY,
        canvasWidth:fractionalScale?g.renderWidth:rasterX1-rasterX,
        canvasHeight:fractionalScale?g.renderHeight:rasterY1-rasterY,
        // Replay every floor predecessor contributing to the guarded clip.
        // Source work and canvas capacity are accounted for independently.
        tx0:Math.max(0,Math.floor((rasterX/sx-LOGICAL_HALO-NATIVE_HALO/sx)/g.tileSize)),
        ty0:Math.max(0,Math.floor((rasterY/sy-LOGICAL_HALO-NATIVE_HALO/sy)/g.tileSize)),
        tx1:Math.min(g.columns,Math.ceil((rasterX1/sx+LOGICAL_HALO+NATIVE_HALO/sx)/g.tileSize)),
        ty1:Math.min(g.rows,Math.ceil((rasterY1/sy+LOGICAL_HALO+NATIVE_HALO/sy)/g.tileSize))
      };
    });
    const patch=result('patch','terrain',next,changes,regions);
    if(patch.pixelCount>g.renderWidth*g.renderHeight*budget.maxPixelRatio)return full('pixel-budget',changes);
    if(patch.rasterPixels>g.renderWidth*g.renderHeight*budget.maxPixelRatio)return full('raster-pixel-budget',changes);
    if(patch.rasterCellCount>g.columns*g.rows*budget.maxRasterRatio)return full('raster-budget',changes);
    if(patch.scratchPixels>(fractionalScale?budget.maxNativeScratchPixels:budget.maxScratchPixels))return full('scratch-budget',changes);
    if(patch.scratchAllocationPixels>budget.maxScratchAllocationPixels)return full('scratch-allocation-budget',changes);
    return patch;
  }

  return Object.freeze({VERSION,CELL_TYPES,DEFAULT_LIMITS,capture,plan});
});
