'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RelayProceduralDecor=api;
})(typeof globalThis!=='undefined'?globalThis:window,function(){
  const TILE=16,GRID_W=40,GRID_H=19;

  function hash32(a,b=0,c=0){
    let x=(a*374761393+b*668265263+c*2246822519)>>>0;
    x=(x^(x>>>13))*1274126177>>>0;
    return (x^(x>>>16))>>>0;
  }
  const key=(x,y)=>`${x},${y}`;
  const cellKey=p=>Array.isArray(p)?key(Number(p[0]),Number(p[1])):String(p);
  const addCells=(set,value)=>{
    if(!value)return;
    if(value instanceof Set){for(const v of value)set.add(String(v));return}
    for(const v of value||[])set.add(cellKey(v));
  };
  const asSet=value=>{
    const out=new Set();addCells(out,value);return out;
  };
  const roomIndex=room=>Number(room?.index??room?.spec?.index??0)||0;
  const roomKey=room=>String(room?.key??room?.spec?.key??`room_${roomIndex(room)}`);
  const rawOrRuntime=(room,runtimeName,rawName)=>room?.[runtimeName]??room?.[rawName];

  function fractionX(f){
    const q=Math.max(0,Math.min(1,Number(f)||0));
    return Math.round(2+(GRID_W-5)*q);
  }
  function fractionY(f){
    const q=Math.max(0,Math.min(1,Number(f)||0));
    return Math.round(1+(GRID_H-3)*q);
  }
  function doorTile(side,f,inset=1){
    if(side==='WEST')return[inset,fractionY(f)];
    if(side==='EAST')return[GRID_W-1-inset,fractionY(f)];
    if(side==='NORTH')return[fractionX(f),inset];
    if(side==='SOUTH')return[fractionX(f),GRID_H-1-inset];
    return null;
  }

  function reservedKeys(room,extraReserved=null){
    const out=new Set();
    addCells(out,rawOrRuntime(room,'bridgeCells','bridge_cells'));
    addCells(out,rawOrRuntime(room,'bridgeIsland','bridge_island'));
    const objects=room?.objects||{};
    for(const tile of Object.values(objects))if(Array.isArray(tile))out.add(cellKey(tile));
    addCells(out,room?.proceduralDecorReserved);
    addCells(out,room?.procedural_decor_reserved);
    addCells(out,room?.procedural_decor_reserved_tiles);
    addCells(out,extraReserved);

    // Current gates sit on inset 1, but their sprite footprint reaches the first
    // generator-eligible interior row/column. Reserve both cells so generic clutter
    // cannot grow under a transition while authored decoration remains unrestricted.
    const spec=room?.spec||{};
    for(const [side,f] of [[spec.previous_side,spec.previous_fraction],[spec.next_side,spec.next_fraction]]){
      if(!side)continue;
      for(const inset of [1,2]){const t=doorTile(side,f,inset);if(t)out.add(cellKey(t))}
    }
    return out;
  }

  function suppress(rawRoom,item){
    const tile=item?.tile;
    if(!rawRoom||!Array.isArray(tile)||tile.length<2)return false;
    const k=cellKey(tile);
    rawRoom.decor_exclusions=rawRoom.decor_exclusions||[];
    if(!rawRoom.decor_exclusions.some(q=>cellKey(q)===k))rawRoom.decor_exclusions.push([Number(tile[0]),Number(tile[1])]);
    return true;
  }

  function restore(rawRoom,itemOrTile){
    const tile=Array.isArray(itemOrTile)?itemOrTile:itemOrTile?.tile;
    if(!rawRoom||!Array.isArray(tile)||tile.length<2)return false;
    const k=cellKey(tile),before=(rawRoom.decor_exclusions||[]).length;
    rawRoom.decor_exclusions=(rawRoom.decor_exclusions||[]).filter(q=>cellKey(q)!==k);
    return rawRoom.decor_exclusions.length!==before;
  }

  function enumerate(room,roles={},options={}){
    if(!room)return[];
    const index=roomIndex(room),rkey=roomKey(room),spec=room.spec||options.spec||{};
    const objectiveRole=roles.objective||{};
    const objectiveSprites=new Set((spec.objects||[]).map(o=>objectiveRole[o.kind]).filter(Boolean));
    const plants=[...(roles.decor_plants||[]),...(roles.foliage_mix||[])].filter(n=>!objectiveSprites.has(n));
    const standing=['candelabra_wide','candelabra_small'].filter(n=>!objectiveSprites.has(n));
    const walls=asSet(rawOrRuntime(room,'walls','walls'));
    const water=asSet(rawOrRuntime(room,'water','water'));
    const paths=asSet(rawOrRuntime(room,'paths','path_cells'));
    const exclusions=asSet(rawOrRuntime(room,'decorExclusions','decor_exclusions'));
    const border=asSet(room.border);
    if(!border.size){
      for(let x=0;x<GRID_W;x++){border.add(key(x,0));border.add(key(x,GRID_H-1))}
      for(let y=0;y<GRID_H;y++){border.add(key(0,y));border.add(key(GRID_W-1,y))}
    }
    const reserved=reservedKeys(room,options.reserved);
    const density=Number(room.foliageDensity??room.foliage_density??1)||1;
    const count=Math.floor(78*density),out=[];

    for(let i=0;i<count;i++){
      const seed=hash32(index+91,i,731);
      const tx=2+seed%(GRID_W-4),ty=2+(seed>>>8)%(GRID_H-4),k=key(tx,ty);
      const suppressed=exclusions.has(k);if(walls.has(k)||water.has(k)||border.has(k)||reserved.has(k)||(suppressed&&!options.includeSuppressed))continue;
      const nearPath=paths.has(k),baseX=tx*TILE+4+(seed>>>16)%9,baseY=ty*TILE+7+(seed>>>21)%7;
      const common={
        id:`generated:${rkey}:${i}`,
        generatorIndex:i,
        roomKey:rkey,
        tile:[tx,ty],
        x:baseX,
        y:baseY+10,
        source:'procedural',
        order:i,
        scale:1,
        reserved:false,
        suppressed
      };
      if(seed%17===0&&standing.length){
        const sprite=standing[seed%standing.length];
        out.push({...common,sprite,generatedKind:'standing',alpha:.95,element:'tree_lights',tintIndex:180,flip:false,
          glow:{x:baseX,y:baseY-12,element:'tree_lights',index:162+(seed%86),radius:27,alpha:.20}});
      }else if(seed%3===0||nearPath){
        const sprite=plants[seed%Math.max(1,plants.length)];
        if(sprite)out.push({...common,sprite,generatedKind:'plant',alpha:nearPath ? .82 : .92,element:'far_forest',flip:!!(seed&1),nearPath});
      }
    }
    return out;
  }

  return Object.freeze({enumerate,reservedKeys,suppress,restore,doorTile,hash32,TILE,GRID_W,GRID_H});
});
