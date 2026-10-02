'use strict';

(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.RelayEditorIdentity=api;
})(typeof globalThis!=='undefined'?globalThis:window,function(){
  const SOURCES=Object.freeze({
    moth:'moth_pickups',
    robot:'decor_robots',
    wildlife:'creature_groups',
    mini:'mini_robot_groups'
  });

  function entries(maps,type){
    const field=SOURCES[type];
    if(!field)return[];
    const out=[];
    for(const [roomKey,room] of Object.entries(maps?.rooms||{})){
      for(const obj of room?.[field]||[]){
        const id=String(obj?.id||'').trim();
        if(id)out.push({type,roomKey,id,obj});
      }
    }
    return out;
  }

  function scan(maps){
    const byType={},duplicates={},all=new Map();
    for(const type of Object.keys(SOURCES)){
      const seen=new Map();
      byType[type]=entries(maps,type);
      for(const entry of byType[type]){
        const bucket=seen.get(entry.id)||[];
        bucket.push(entry);
        seen.set(entry.id,bucket);
        const cross=all.get(entry.id)||[];
        cross.push(entry);
        all.set(entry.id,cross);
      }
      duplicates[type]=[...seen.entries()].filter(([,items])=>items.length>1).map(([id,items])=>({id,items}));
    }
    const crossTypeDuplicates=[...all.entries()].filter(([,items])=>items.length>1).map(([id,items])=>({id,items}));
    return {byType,duplicates,crossTypeDuplicates};
  }

  function usedIds(maps){
    const used=new Set();
    const report=scan(maps);
    for(const rows of Object.values(report.byType))for(const entry of rows)used.add(entry.id);
    return used;
  }

  function allocate(maps,type,prefix){
    if(!SOURCES[type])throw new Error(`Unknown persistent identity type: ${type}`);
    const stem=String(prefix||`editor_${type}`).replace(/_+$/,'')||`editor_${type}`;
    const used=usedIds(maps);
    let n=1,id=`${stem}_${n}`;
    while(used.has(id))id=`${stem}_${++n}`;
    return id;
  }

  function isUnique(maps,id,ignore=null){
    id=String(id||'').trim();
    if(!id)return false;
    let count=0;
    for(const type of Object.keys(SOURCES)){
      for(const entry of entries(maps,type)){
        if(entry.id!==id)continue;
        if(ignore&&entry.type===ignore.type&&entry.roomKey===ignore.roomKey&&entry.obj===ignore.obj)continue;
        count++;
      }
    }
    return count===0;
  }

  return Object.freeze({SOURCES,entries,scan,usedIds,allocate,isUnique});
});
