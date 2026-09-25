'use strict';
/* v4.14: one source of truth for static/live sprite lighting. Normal maps are
 * source-space vectors, not world-height images differentiated after resizing. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.RelaySpriteMaterial=api;})(typeof globalThis!=='undefined'?globalThis:this,function(){
  const vertex=`#version 300 es
precision highp float;
in vec2 aPos;in vec2 aUV;in vec4 aColor;
out vec2 vUV;out vec4 vColor;out vec2 vWorld;
void main(){gl_Position=vec4(aPos.x/640.0*2.0-1.0,1.0-aPos.y/360.0*2.0,0,1);vUV=aUV;vColor=aColor;vWorld=aPos;}`;
  const quadVertex=`#version 300 es
precision highp float;
in vec2 aPos;in vec2 aUV;out vec2 vUV;
void main(){vUV=aUV;gl_Position=vec4(aPos,0,1);}`;
  const normalGLSL=`
vec3 decodeSpriteNormal(vec3 encoded){return normalize((encoded*255.0-128.0)/127.0);}
vec3 spriteNormalToWorld(vec3 source,vec2 uv,vec2 world){
  vec2 u1=dFdx(uv),u2=dFdy(uv),p1=dFdx(world),p2=dFdy(world);
  float determinant=u1.x*u2.y-u1.y*u2.x;
  if(abs(determinant)<1e-12)return vec3(0,0,1);
  vec2 right=(p1*u2.y-p2*u1.y)/determinant,down=(p2*u1.x-p1*u2.x)/determinant;
  right/=max(length(right),1e-8);down/=max(length(down),1e-8);
  vec2 screen=right*source.x-down*source.y;
  return normalize(vec3(screen.x,-screen.y,source.z));
}`;
  const uniforms=`uniform sampler2D uTex;uniform sampler2D uNormalTex;uniform sampler2D uSpecularTex;
uniform vec2 uMainLightPos;uniform float uBumpStrength;uniform float uSpecularStrength;uniform float uMaterialOn;`;
  const lightGLSL=`
vec3 shadeSprite(vec3 base,vec3 n,float specMask,vec2 world){
  if(uMaterialOn<.5)return base;
  n=normalize(vec3(n.xy*max(uBumpStrength,0.0),max(n.z,.001)));
  vec2 delta=uMainLightPos-world;
  vec3 L=normalize(vec3(delta.x,-delta.y,86.0+length(delta)*.16));
  float ndl=max(dot(n,L),0.0),fill=max(dot(n,normalize(vec3(-.30,-.42,.86))),0.0)*.07;
  float diffuse=.70+ndl*.30+fill;
  float spec=pow(max(dot(reflect(-L,n),vec3(0,0,1)),0.0),7.0)*max(uSpecularStrength,0.0)*clamp(specMask,0.0,1.0);
  return max(base*diffuse+vec3(spec),vec3(0));
}`;
  function fragment(kind='hd'){
    const base=kind==='tint'?'float lum=dot(t.rgb,vec3(.26,.62,.12));vec3 base=vColor.rgb*(.28+lum*.98)+pow(max(t.rgb,0.0),vec3(2.4))*.12;':kind==='flat'?'vec3 tint=floor(clamp(vColor.rgb,0.0,1.0)*15.0)/15.0;vec3 base=mix(t.rgb,tint,clamp(uTintStrength,0.0,1.0));':'vec3 base=mix(t.rgb,t.rgb*vColor.rgb,.07);';
    return `#version 300 es
precision highp float;
${uniforms}
uniform float uTintStrength;
in vec2 vUV;in vec4 vColor;in vec2 vWorld;out vec4 o;
${normalGLSL}
${lightGLSL}
void main(){vec4 t=texture(uTex,vUV);if(t.a<.002)discard;
${base}
vec3 n=spriteNormalToWorld(decodeSpriteNormal(texture(uNormalTex,vUV).rgb),vUV,vWorld);
o=vec4(shadeSprite(base,n,texture(uSpecularTex,vUV).r,vWorld),t.a*vColor.a);}`;
  }
  const background=`#version 300 es
precision highp float;
${uniforms}
uniform vec2 uLogicalSize;
in vec2 vUV;out vec4 o;
${normalGLSL}
${lightGLSL}
void main(){vec4 base=texture(uTex,vUV),normal=texture(uNormalTex,vUV);
if(uMaterialOn<.5||normal.a<.01){o=base;return;}
vec2 world=vec2(vUV.x*uLogicalSize.x,(1.0-vUV.y)*uLogicalSize.y);
vec3 shaded=shadeSprite(base.rgb,decodeSpriteNormal(normal.rgb),texture(uSpecularTex,vUV).r,world);
o=vec4(mix(base.rgb,shaded,clamp(normal.a,0.0,1.0)),base.a);}`;
  function materialState(settings={}){const enabled=settings.lighting!==false&&settings.bump!==false;return {enabled,bump:enabled?Math.max(0,Number(settings.bumpStrength??1.35)):0,specular:enabled?Math.max(0,Number(settings.specular??.42)):0};}
  return {vertex,quadVertex,fragment,background,normalGLSL,lightGLSL,materialState};
});
