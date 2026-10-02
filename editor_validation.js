'use strict';

(function(root,factory){
  const identity=(typeof module!=='undefined'&&module.exports)?require('./editor_identity.js'):root.RelayEditorIdentity;
  const api=factory(identity);
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RelayEditorValidation=api;
})(typeof globalThis!=='undefined'?globalThis:window,function(Identity){
  const GRID_W=40,GRID_H=19,TILE=16;
  const SEVERITY_ORDER={error:0,warning:1};

  function canonical(value){
    if(value===null||typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  }
  function fingerprint(value){return canonical(value)}
  function snapshot(maps){
    const rooms={};
    for(const key of Object.keys(maps?.rooms||{}).sort())rooms[key]=fingerprint(maps.rooms[key]);
    return Object.freeze({project:fingerprint(maps),rooms:Object.freeze(rooms)});
  }
  function dirtyState(maps,baseline,currentRoomKey=null){
    const now=snapshot(maps),dirtyRooms=[];
    const keys=[...new Set([...Object.keys(baseline?.rooms||{}),...Object.keys(now.rooms)])].sort();
    for(const key of keys)if(now.rooms[key]!==baseline?.rooms?.[key])dirtyRooms.push(key);
    return{project:now.project!==baseline?.project,room:currentRoomKey?dirtyRooms.includes(currentRoomKey):false,dirtyRooms,fingerprint:now.project};
  }
  const key=t=>Array.isArray(t)?`${t[0]},${t[1]}`:String(t);
  const validTile=t=>Array.isArray(t)&&t.length===2&&Number.isInteger(t[0])&&Number.isInteger(t[1])&&t[0]>=0&&t[0]<GRID_W&&t[1]>=0&&t[1]<GRID_H;
  function sideTile(side,f,inset=1){
    f=Math.max(0,Math.min(1,Number(f)||0));
    const x=Math.round(2+(GRID_W-3-2)*f),y=Math.round(1+(GRID_H-2-1)*f);
    if(side==='WEST')return[inset,y];
    if(side==='EAST')return[GRID_W-1-inset,y];
    if(side==='NORTH')return[x,inset];
    if(side==='SOUTH')return[x,GRID_H-1-inset];
    return null;
  }
  function normalizeArray(v){return Array.isArray(v)?v:[]}
  function diag(severity,code,roomKey,message,ref=null){return{severity,code,roomKey:roomKey??null,message,ref:ref||null}}
  function refSort(ref){
    if(!ref)return'';
    return [ref.type,ref.id,Array.isArray(ref.tile)?ref.tile.join(','):ref.tile,ref.field].filter(v=>v!=null).join('|');
  }
  function orderDiagnostics(list,roomOrder){
    const roomRank=new Map(roomOrder.map((k,i)=>[k,i]));
    return [...list].sort((a,b)=>
      (SEVERITY_ORDER[a.severity]-SEVERITY_ORDER[b.severity])||
      ((roomRank.get(a.roomKey)??9999)-(roomRank.get(b.roomKey)??9999))||
      String(a.roomKey||'').localeCompare(String(b.roomKey||''))||
      a.code.localeCompare(b.code)||
      refSort(a.ref).localeCompare(refSort(b.ref))||
      a.message.localeCompare(b.message));
  }
  function blockedSet(room){
    const out=new Set();
    for(const p of normalizeArray(room?.walls))if(validTile(p))out.add(key(p));
    for(const p of normalizeArray(room?.water))if(validTile(p))out.add(key(p));
    for(let x=0;x<GRID_W;x++){out.add(key([x,0]));out.add(key([x,GRID_H-1]))}
    for(let y=0;y<GRID_H;y++){out.add(key([0,y]));out.add(key([GRID_W-1,y]))}
    return out;
  }
  function approachable(tile,room){
    if(!validTile(tile))return false;
    const blocked=blockedSet(room);
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      const t=[tile[0]+dx,tile[1]+dy];
      if(validTile(t)&&!blocked.has(key(t)))return true;
    }
    return false;
  }
  function structuralSignature(room){
    const norm=v=>normalizeArray(v).map(p=>Array.isArray(p)?p.map(Number):p).sort((a,b)=>canonical(a).localeCompare(canonical(b)));
    return canonical({bridge_cells:norm(room?.bridge_cells),bridge_segments:normalizeArray(room?.bridge_segments).map(norm),bridge_island:norm(room?.bridge_island)});
  }
  function roomSequence(maps,story){
    const storyKeys=normalizeArray(story?.rooms).map(r=>r?.key).filter(Boolean),known=new Set(storyKeys);
    const extra=Object.keys(maps?.rooms||{}).filter(k=>!known.has(k)).sort();
    return [...storyKeys,...extra];
  }
  function validate(maps,story,meta={},options={}){
    const diagnostics=[],rooms=maps?.rooms||{},storyRooms=normalizeArray(story?.rooms),roomOrder=roomSequence(maps,story);
    const roles=meta?.roles||{},regions=meta?.regions||{},baselineMaps=options?.baselineMaps||null;
    const regionExists=name=>!!(name&&regions&&Object.prototype.hasOwnProperty.call(regions,name));
    const emit=(severity,code,roomKey,message,ref)=>diagnostics.push(diag(severity,code,roomKey,message,ref));

    // Reuse the E415-04 identity authority rather than growing a second ID scanner.
    const idReport=Identity?.scan?Identity.scan(maps):null;
    const dupCodes={moth:'DUPLICATE_MOTH_ID',robot:'DUPLICATE_ROBOT_ID',wildlife:'DUPLICATE_WILDLIFE_ID',mini:'DUPLICATE_MINI_ID'};
    if(idReport)for(const type of Object.keys(dupCodes)){
      for(const d of idReport.duplicates?.[type]||[]){
        const roomsList=[...new Set(d.items.map(x=>x.roomKey))].sort();
        emit('error',dupCodes[type],roomsList[0]||null,`Duplicate ${type} ID "${d.id}" across ${roomsList.join(', ')}.`,{type,id:d.id,rooms:roomsList});
      }
    }
    if(idReport)for(const d of idReport.crossTypeDuplicates||[]){
      const types=[...new Set(d.items.map(x=>x.type))].sort();
      if(types.length>1)emit('error','DUPLICATE_PERSISTENT_ID',d.items.map(x=>x.roomKey).sort()[0]||null,`Persistent ID "${d.id}" is reused across ${types.join(', ')}.`,{type:'persistent',id:d.id,types});
    }

    function checkTile(roomKey,tile,ref,field='tile'){
      if(!validTile(tile)){emit('error','TILE_OUT_OF_BOUNDS',roomKey,`Malformed or out-of-grid ${field}: ${canonical(tile)}.`,{...ref,field,tile});return false}
      return true;
    }
    function checkSprite(roomKey,name,ref,label='sprite'){
      if(name&&!regionExists(name))emit('error','MISSING_SPRITE',roomKey,`Referenced ${label} "${name}" is absent from the runtime atlas.`,{...ref,sprite:name});
    }

    for(const sp of storyRooms){
      if(!sp?.key)continue;
      const roomKey=sp.key,room=rooms[roomKey]||{};
      const storyObjects=new Map(normalizeArray(sp.objects).map(o=>[String(o.object_id),o]));
      for(const [objectId,obj] of storyObjects){
        const tile=room.objects?.[objectId];
        if(tile==null){emit('error','MISSING_OBJECTIVE_PLACEMENT',roomKey,`Story objective "${objectId}" has no map placement.`,{type:'objective',id:objectId});continue}
        if(checkTile(roomKey,tile,{type:'objective',id:objectId},'objective tile')&&!approachable(tile,room))
          emit('error','OBJECTIVE_UNAPPROACHABLE',roomKey,`Objective "${objectId}" has no deterministically approachable adjacent/current tile.`,{type:'objective',id:objectId,tile});
        const sprite=roles.objective?.[obj?.kind];
        if(!sprite)emit('error','UNKNOWN_OBJECTIVE_KIND',roomKey,`Objective "${objectId}" kind "${obj?.kind}" has no runtime objective role.`,{type:'objective',id:objectId,kind:obj?.kind});
        else checkSprite(roomKey,sprite,{type:'objective',id:objectId},'objective sprite');
      }
      for(const [objectId,tile] of Object.entries(room.objects||{})){
        if(!storyObjects.has(String(objectId)))emit('error','UNKNOWN_MAP_OBJECTIVE',roomKey,`Map objective "${objectId}" is absent from the story room definition.`,{type:'objective',id:objectId,tile});
        checkTile(roomKey,tile,{type:'objective',id:objectId},'objective tile');
      }

      const tileArrays=['walls','water','path_cells','bridge_cells','bridge_island'];
      for(const field of tileArrays)for(let i=0;i<normalizeArray(room[field]).length;i++)checkTile(roomKey,room[field][i],{type:field,id:String(i)},field);
      for(let i=0;i<normalizeArray(room.decor_exclusions).length;i++){const raw=room.decor_exclusions[i],tile=Array.isArray(raw)?raw:String(raw).split(',').map(Number);checkTile(roomKey,tile,{type:'decor_exclusions',id:String(i)},'decor_exclusions')}
      for(let gi=0;gi<normalizeArray(room.bridge_segments).length;gi++)for(let i=0;i<normalizeArray(room.bridge_segments[gi]).length;i++)checkTile(roomKey,room.bridge_segments[gi][i],{type:'bridge_segment',id:`${gi}:${i}`},'bridge segment');
      for(let i=0;i<normalizeArray(room.large_trees).length;i++){const t=room.large_trees[i];checkTile(roomKey,t?.tile,{type:'tree',id:String(i)},'tree tile');checkSprite(roomKey,t?.sprite,{type:'tree',id:String(i)},'tree sprite')}
      for(const [tileKey,style] of Object.entries(room.blocker_styles||{})){
        const tile=tileKey.split(',').map(Number);checkTile(roomKey,tile,{type:'blocker',id:tileKey},'blocker style tile');checkSprite(roomKey,style?.sprite,{type:'blocker',id:tileKey},'blocker sprite');
      }
      for(let i=0;i<normalizeArray(room.editor_decor).length;i++){const d=room.editor_decor[i];checkSprite(roomKey,d?.sprite,{type:'decor',id:d?.editor_id||String(i)},'authored decor sprite')}
      for(let i=0;i<normalizeArray(room.decor_lamps).length;i++){const d=room.decor_lamps[i];checkTile(roomKey,d?.tile,{type:'lamp',id:String(i)},'lamp tile');checkSprite(roomKey,d?.lamp,{type:'lamp',id:String(i)},'lamp sprite')}
      for(let i=0;i<normalizeArray(room.decor_robots).length;i++){
        const d=room.decor_robots[i],variant=d?.variant||'cream';checkTile(roomKey,d?.tile,{type:'robot',id:d?.id||String(i)},'robot tile');
        const sprite=roles.robot_variants?.[variant]?.idle;if(!roles.robot_variants?.[variant])emit('error','UNKNOWN_ROBOT_VARIANT',roomKey,`Robot variant "${variant}" has no runtime role.`,{type:'robot',id:d?.id||String(i),variant});else checkSprite(roomKey,sprite,{type:'robot',id:d?.id||String(i)},'robot sprite');
      }
      for(let i=0;i<normalizeArray(room.moth_pickups).length;i++){
        const d=room.moth_pickups[i],variant=Number(d?.variant??0);checkTile(roomKey,d?.tile,{type:'moth',id:d?.id||String(i)},'moth tile');
        const sprite=roles.moths?.[variant];if(!Number.isInteger(variant)||!sprite)emit('error','UNKNOWN_MOTH_VARIANT',roomKey,`Moth variant "${d?.variant}" is not renderable.`,{type:'moth',id:d?.id||String(i),variant:d?.variant});else checkSprite(roomKey,sprite,{type:'moth',id:d?.id||String(i)},'moth sprite');
      }
      for(let i=0;i<normalizeArray(room.creature_groups).length;i++){
        const g=room.creature_groups[i],id=g?.id||String(i),count=Number(g?.count),kind=g?.kind;
        const spawnOk=checkTile(roomKey,g?.spawn,{type:'wildlife',id},'wildlife spawn');
        if(!spawnOk||!Number.isInteger(count)||count<1)emit('error','MALFORMED_GROUP',roomKey,`Wildlife group "${id}" has invalid spawn/count.`,{type:'wildlife',id,spawn:g?.spawn,count:g?.count});
        const sprite=roles.creatures?.[kind]?.idle;if(!roles.creatures?.[kind])emit('error','UNKNOWN_WILDLIFE_KIND',roomKey,`Wildlife kind "${kind}" has no runtime role.`,{type:'wildlife',id,kind});else checkSprite(roomKey,sprite,{type:'wildlife',id},'wildlife sprite');
      }
      for(let i=0;i<normalizeArray(room.mini_robot_groups).length;i++){
        const g=room.mini_robot_groups[i],id=g?.id||String(i),count=Number(g?.count),variant=g?.variant;
        const spawnOk=checkTile(roomKey,g?.spawn,{type:'mini',id},'mini-robot spawn');
        if(!spawnOk||!Number.isInteger(count)||count<1)emit('error','MALFORMED_GROUP',roomKey,`Mini-robot group "${id}" has invalid spawn/count.`,{type:'mini',id,spawn:g?.spawn,count:g?.count});
        const sprite=roles.mini_robots?.[variant]?.idle;if(!roles.mini_robots?.[variant])emit('error','UNKNOWN_MINI_VARIANT',roomKey,`Mini-robot variant "${variant}" has no runtime role.`,{type:'mini',id,variant});else checkSprite(roomKey,sprite,{type:'mini',id},'mini-robot sprite');
      }

      const blocked=blockedSet(room);
      for(const d of normalizeArray(room.moth_pickups))if(validTile(d?.tile)&&blocked.has(key(d.tile)))emit('warning','PICKUP_BLOCKED',roomKey,`Moth "${d?.id||'?'}" is on a blocked tile.`,{type:'moth',id:d?.id,tile:d.tile});
      for(const d of normalizeArray(room.decor_robots))if(d?.id&&validTile(d.tile)&&blocked.has(key(d.tile)))emit('warning','PICKUP_BLOCKED',roomKey,`Recruitable robot "${d.id}" is on a blocked tile.`,{type:'robot',id:d.id,tile:d.tile});

      for(const [name,side,fraction] of [['previous',sp.previous_side,sp.previous_fraction],['next',sp.next_side,sp.next_fraction]]){
        if(!side)continue;
        const footprints=[sideTile(side,fraction,1),sideTile(side,fraction,2)].filter(Boolean);
        if(footprints.some(t=>blocked.has(key(t))))emit('warning','TRANSITION_OBSTRUCTED',roomKey,`${name} transition footprint is obstructed.`,{type:'transition',id:name,tiles:footprints});
      }

      const reserved=new Set([...normalizeArray(room.bridge_cells),...normalizeArray(room.bridge_island),...Object.values(room.objects||{})].filter(validTile).map(key));
      for(const [side,fraction] of [[sp.previous_side,sp.previous_fraction],[sp.next_side,sp.next_fraction]])if(side)for(const inset of [1,2]){const t=sideTile(side,fraction,inset);if(t)reserved.add(key(t))}
      const baselineRoom=baselineMaps?.rooms?.[roomKey]||{},baselineAuthored=new Set();
      const remember=(type,id,tile)=>{if(validTile(tile))baselineAuthored.add(`${type}|${id}|${key(tile)}`)};
      normalizeArray(baselineRoom.editor_decor).forEach((d,i)=>remember('decor',d?.editor_id||i,[Math.floor(Number(d?.x||0)/TILE),Math.floor(Number(d?.y||0)/TILE)]));
      normalizeArray(baselineRoom.decor_lamps).forEach((d,i)=>remember('lamp',i,d?.tile));
      normalizeArray(baselineRoom.decor_robots).forEach((d,i)=>remember('robot',d?.id||i,d?.tile));
      normalizeArray(room.editor_decor).forEach((d,i)=>{const tile=[Math.floor(Number(d?.x||0)/TILE),Math.floor(Number(d?.y||0)/TILE)],id=d?.editor_id||i;if(validTile(tile)&&reserved.has(key(tile))&&!baselineAuthored.has(`decor|${id}|${key(tile)}`))emit('warning','AUTHORED_RESERVED_SURFACE',roomKey,`Authored decor "${id}" occupies a reserved gameplay surface.`,{type:'decor',id,tile})});
      normalizeArray(room.decor_lamps).forEach((d,i)=>{if(validTile(d?.tile)&&reserved.has(key(d.tile))&&!baselineAuthored.has(`lamp|${i}|${key(d.tile)}`))emit('warning','AUTHORED_RESERVED_SURFACE',roomKey,`Lamp ${i} occupies a reserved gameplay surface.`,{type:'lamp',id:String(i),tile:d.tile})});
      normalizeArray(room.decor_robots).forEach((d,i)=>{const id=d?.id||i;if(validTile(d?.tile)&&reserved.has(key(d.tile))&&!baselineAuthored.has(`robot|${id}|${key(d.tile)}`))emit('warning','AUTHORED_RESERVED_SURFACE',roomKey,`Robot "${id}" occupies a reserved gameplay surface.`,{type:'robot',id,tile:d.tile})});
    }

    // Map-only rooms still get coordinate/render checks for persistent IDs through Identity;
    // their absence from story is itself useful diagnostics rather than silently ignored.
    const storyKeys=new Set(storyRooms.map(r=>r?.key).filter(Boolean));
    for(const roomKey of Object.keys(rooms).sort())if(!storyKeys.has(roomKey))emit('warning','MAP_ROOM_WITHOUT_STORY',roomKey,`Map room "${roomKey}" has no story room definition.`,{type:'room',id:roomKey});

    if(baselineMaps?.rooms?.tin_stream&&rooms.tin_stream&&structuralSignature(baselineMaps.rooms.tin_stream)!==structuralSignature(rooms.tin_stream))
      emit('warning','TIN_STREAM_BRIDGE_GEOMETRY_CHANGED','tin_stream','Tin Stream bridge structural geometry differs from the loaded baseline.',{type:'bridge',id:'tin_stream'});

    return orderDiagnostics(diagnostics,roomOrder);
  }

  function summary(diagnostics){
    const errors=diagnostics.filter(d=>d.severity==='error').length,warnings=diagnostics.filter(d=>d.severity==='warning').length;
    return{errors,warnings,total:errors+warnings,ok:errors===0};
  }

  return Object.freeze({validate,summary,fingerprint,snapshot,dirtyState,validTile,sideTile,GRID_W,GRID_H});
});
