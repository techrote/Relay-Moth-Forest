/* Test-only row-read experiment. No production policy or pixel gate is changed.
 * Existing audit readbacks describe incoming requests. nativeReads below record
 * the arguments actually forwarded to the browser API by this innermost hook.
 * A fully out-of-bounds request is not proof that all GPU work was avoided.
 */
(function(root){
  'use strict';
  root.installRelayRowReadDiagnostic=function({mode='inbounds',timingAttribution=false}={}){
    const check=(ok,message)=>{if(!ok)throw Error('ROW-OOB diagnostic: '+message)};
    check(['inbounds','oob'].includes(mode),'unknown variant');
    check(!root.relayRowReadDiagnostic,'controller already installed');
    const canvasPrototype=OffscreenCanvas.prototype;
    const contextPrototype=Object.getPrototypeOf(new OffscreenCanvas(1,1).getContext('2d'));
    const painterPrototype=StaticPainter.prototype,probe=root.relayMothPerf;
    const original={getContext:canvasPrototype.getContext,read:contextPrototype.getImageData,
      build:painterPrototype.buildSurface,pattern:painterPrototype.patternDecor,
      begin:probe.begin,end:probe.end};
    let currentMode=mode,scope='setup',activeEvent=null,installed=true;
    let contextInfo=new WeakMap(),contexts=[],builds=[],nativeReads=[],events=[];
    let contextSerial=0,buildSerial=0,eventSerial=0;
    const stack=[],attribution=[],hookStatus=[];
    const own=Object.prototype.hasOwnProperty;

    function wrapAttribution(owner,key,label){
      if(!owner||typeof owner[key]!=='function'){hookStatus.push({label,installed:false,reason:'function unavailable'});return}
      const prior=owner[key],wasOwn=own.call(owner,key);
      const wrapped=function(...args){return probe.measure(label,()=>prior.apply(this,args))};
      try{owner[key]=wrapped;check(owner[key]===wrapped,'attribution assignment was not writable')}
      catch(error){hookStatus.push({label,installed:false,reason:String(error)});return}
      attribution.push({owner,key,prior,wrapped,wasOwn});hookStatus.push({label,installed:true});
    }

    const getContext=function(type,options){
      const context=original.getContext.call(this,type,options),frame=stack[stack.length-1];
      if(context&&type==='2d'&&options?.alpha===false&&options?.willReadFrequently===false&&!contextInfo.has(context)){
        const attributes=context.getContextAttributes();
        const firstProductionColor=!!frame&&!frame.color;
        const info={id:++contextSerial,kind:firstProductionColor?'production-buildSurface-color':'outside-first-production-color',
          buildId:firstProductionColor?frame.record.id:null,width:this.width,height:this.height,
          explicitCreation:{alpha:options.alpha,willReadFrequently:options.willReadFrequently},acceptedAttributes:{...attributes}};
        contexts.push(info);contextInfo.set(context,info);
        if(firstProductionColor){
          check(attributes.alpha===false&&attributes.willReadFrequently===false,'color creation attributes changed');
          frame.color=context;frame.record.colorContextId=info.id;
        }
      }
      return context;
    };

    const build=function(room,state,width,height,region){
      const bounds=region||{tx0:0,ty0:0,tx1:40,ty1:19};
      const record={id:++buildSerial,mode:currentMode,scope:activeEvent?'timed-event':scope,eventId:activeEvent?.id??null,
        room:room?.key??null,native:[width,height],kind:region?'patch':'full',
        region:region?{...region}:null,expectedRowCalls:bounds.tx0<bounds.tx1?bounds.ty1-bounds.ty0:0,
        colorContextId:null,rowAttempts:0,rowSuccesses:0,success:false};
      const frame={record,color:null,overlays:false};builds.push(record);stack.push(frame);
      try{const result=original.build.apply(this,arguments);record.success=true;return result}
      catch(error){record.error=String(error);throw error}
      finally{check(stack.pop()===frame,'build stack lost nesting')}
    };

    const pattern=function(context,...args){
      const frame=stack[stack.length-1];if(frame?.color===context)frame.overlays=true;
      return original.pattern.call(this,context,...args);
    };

    const read=function(...args){
      const frame=stack[stack.length-1],info=contextInfo.get(this);
      const onePixel=args.length===4&&args[0]===0&&args[1]===0&&args[2]===1&&args[3]===1;
      const productionRow=!!(frame&&frame.color===this&&!frame.overlays&&onePixel);
      const observed=productionRow||!!(info&&onePixel);
      if(!observed)return original.read.apply(this,args);
      const substituted=productionRow&&frame.record.mode==='oob';
      const forwarded=substituted?[-1,-1,1,1]:args;
      const observation={contextId:info.id,buildId:productionRow?frame.record.id:null,
        scope:activeEvent?'timed-event':scope,eventId:activeEvent?.id??null,
        mode:productionRow?frame.record.mode:currentMode,productionRow,
        insideActiveBuild:!!frame,
        requested:args.slice(),forwarded:forwarded.slice(),substituted,
        canvas:[this.canvas.width,this.canvas.height],
        forwardedRectangleOverlapPixels:substituted?0:1,success:false};
      nativeReads.push(observation);if(productionRow)frame.record.rowAttempts++;
      const started=performance.now();
      try{
        const result=original.read.apply(this,forwarded);
        observation.success=true;
        if(productionRow)frame.record.rowSuccesses++;
        if(substituted){
          observation.returnedBytes=result.data.length;
          observation.returnedTransparentZero=result.data.length===4&&Array.from(result.data).every(value=>value===0);
          check(observation.returnedTransparentZero,'out-of-bounds request did not return one transparent pixel');
        }
        return result;
      }catch(error){observation.error=String(error);throw error}
      finally{observation.ms=performance.now()-started}
    };

    const begin=function(name,meta){
      const token=original.begin.apply(this,arguments);
      if(token!==null&&token!==undefined){
        check(!activeEvent,'nested measured event');
        activeEvent={id:++eventSerial,token,name,meta:{...meta},mode:currentMode,scope,ended:false};events.push(activeEvent);
      }
      return token;
    };
    const end=function(token){
      try{return original.end.apply(this,arguments)}
      finally{if(activeEvent&&activeEvent.token===token){activeEvent.ended=true;activeEvent=null}}
    };

    canvasPrototype.getContext=getContext;contextPrototype.getImageData=read;
    painterPrototype.buildSurface=build;painterPrototype.patternDecor=pattern;probe.begin=begin;probe.end=end;
    if(timingAttribution){
      wrapAttribution(game.renderer.gl,'getError','diagnostic.gl.getError');
      wrapAttribution(game.renderer.gl,'isContextLost','diagnostic.gl.isContextLost');
      if(typeof releaseCanvasBacking==='function'&&root.releaseCanvasBacking===releaseCanvasBacking)
        wrapAttribution(root,'releaseCanvasBacking','diagnostic.releaseCanvasBacking');
      else hookStatus.push({label:'diagnostic.releaseCanvasBacking',installed:false,reason:'global call binding is not safely wrappable'});
    }

    const controller={
      setMode(value){check(!stack.length&&!activeEvent,'mode change during build/event');check(['inbounds','oob'].includes(value),'unknown variant');currentMode=value},
      setScope(value){check(!stack.length&&!activeEvent,'scope change during build/event');scope=String(value)},
      withMode(value,label,action){const before=currentMode,priorScope=scope;this.setMode(value);this.setScope(label);try{return action()}finally{this.setMode(before);this.setScope(priorScope)}},
      resetTrace(){check(!stack.length&&!activeEvent,'reset during build/event');contextInfo=new WeakMap();contexts=[];builds=[];nativeReads=[];events=[];contextSerial=buildSerial=eventSerial=0},
      snapshot(){
        const rows=nativeReads.filter(read=>read.productionRow),outside=nativeReads.filter(read=>!read.productionRow);
        return structuredClone({schema:'relay-row-read-diagnostic/v1',diagnosticOnly:true,
          productionColorPolicy:StaticPainter.COLOR_POLICY,mode:currentMode,scope,
          coordinateBasis:'nativeReads.forwarded is the innermost call forwarded to the browser; audit readbacks remain incoming requests',
          physicalReadbackClaim:false,contexts,builds,nativeReads,events,attributionHooks:hookStatus,
          counters:{productionRowAttempts:rows.length,productionRowSuccesses:rows.filter(read=>read.success).length,
            forwardedOutOfBounds:rows.filter(read=>read.substituted).length,
            forwardedInBounds:rows.filter(read=>!read.substituted).length,
            outsideBuildInBoundsColorCalls:outside.filter(read=>!read.insideActiveBuild).length,
            otherInBuildColorCalls:outside.filter(read=>read.insideActiveBuild).length,
            transparentOutOfBoundsReturns:rows.filter(read=>read.substituted&&read.returnedTransparentZero).length}});
      },
      uninstall(){
        check(installed&&!stack.length&&!activeEvent,'uninstall while active or already removed');
        for(const hook of attribution.reverse()){
          check(hook.owner[hook.key]===hook.wrapped,'attribution hook was replaced: '+hook.key);
          if(hook.wasOwn)hook.owner[hook.key]=hook.prior;else delete hook.owner[hook.key];
        }
        check(canvasPrototype.getContext===getContext&&contextPrototype.getImageData===read&&
          painterPrototype.buildSurface===build&&painterPrototype.patternDecor===pattern&&probe.begin===begin&&probe.end===end,
          'a scoped wrapper was not restored by the caller');
        canvasPrototype.getContext=original.getContext;contextPrototype.getImageData=original.read;
        painterPrototype.buildSurface=original.build;painterPrototype.patternDecor=original.pattern;probe.begin=original.begin;probe.end=original.end;
        installed=false;delete root.relayRowReadDiagnostic;
      }
    };
    root.relayRowReadDiagnostic=controller;return controller.snapshot();
  };
})(globalThis);
