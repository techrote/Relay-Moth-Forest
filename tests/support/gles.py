"""Minimal surfaceless GLES3 pixel-test harness. No browser claims or shader mocks.
Raises GpuUnavailable only if a context cannot be made. Shader/render errors fail.
"""
import ctypes as C, ctypes.util
import numpy as np
U,I,F,P=C.c_uint,C.c_int,C.c_float,C.c_void_p
class GpuUnavailable(RuntimeError): pass
class GLES:
    def __init__(self):
        lib=C.util.find_library('EGL')
        if not lib:raise GpuUnavailable('libEGL missing')
        self.egl=C.CDLL(lib);e=self.egl
        e.eglGetProcAddress.argtypes=[C.c_char_p];e.eglGetProcAddress.restype=P
        ptr=e.eglGetProcAddress(b'eglGetPlatformDisplayEXT')
        if not ptr:raise GpuUnavailable('surfaceless EGL entrypoint missing')
        platform=C.CFUNCTYPE(P,U,P,C.POINTER(I))(ptr)
        self.display=platform(0x31DD,None,(I*1)(0x3038));major,minor=I(),I()
        e.eglInitialize.argtypes=[P,C.POINTER(I),C.POINTER(I)];e.eglInitialize.restype=U
        if not e.eglInitialize(self.display,C.byref(major),C.byref(minor)):raise GpuUnavailable('surfaceless EGL initialization failed')
        e.eglBindAPI.argtypes=[U];e.eglBindAPI.restype=U
        e.eglBindAPI(0x30A0)
        attrs=(I*13)(0x3033,1,0x3040,0x40,0x3024,8,0x3023,8,0x3022,8,0x3021,8,0x3038)
        cfg=P();count=I();e.eglChooseConfig.argtypes=[P,C.POINTER(I),C.POINTER(P),I,C.POINTER(I)];e.eglChooseConfig.restype=U
        if not e.eglChooseConfig(self.display,attrs,C.byref(cfg),1,C.byref(count)) or not count.value:raise GpuUnavailable('no ES3 RGBA EGL config')
        e.eglCreateContext.argtypes=[P,P,P,C.POINTER(I)];e.eglCreateContext.restype=P
        self.context=e.eglCreateContext(self.display,cfg,None,(I*3)(0x3098,3,0x3038))
        e.eglCreatePbufferSurface.argtypes=[P,P,C.POINTER(I)];e.eglCreatePbufferSurface.restype=P
        self.surface=e.eglCreatePbufferSurface(self.display,cfg,(I*5)(0x3057,8,0x3056,8,0x3038))
        e.eglMakeCurrent.argtypes=[P,P,P,P];e.eglMakeCurrent.restype=U
        if not e.eglMakeCurrent(self.display,self.surface,self.surface,self.context):raise GpuUnavailable('ES3 make-current failed')
        self.cache={};self.resources=[]
        self.version=self.fn('glGetString',C.c_char_p,U)(0x1F02).decode()
    def fn(self,name,ret,*args):
        if name not in self.cache:
            ptr=self.egl.eglGetProcAddress(name.encode());assert ptr,name
            self.cache[name]=C.CFUNCTYPE(ret,*args)(ptr)
        return self.cache[name]
    def check(self,where=''):
        error=self.fn('glGetError',U)();assert error==0,f'GL error 0x{error:x} {where}'
    def program(self,vs,fs,label='shader'):
        compiled=[]
        for src,typ in [(vs,0x8B31),(fs,0x8B30)]:
            sh=self.fn('glCreateShader',U,U)(typ);raw=src.encode();a=(C.c_char_p*1)(raw)
            self.fn('glShaderSource',None,U,I,C.POINTER(C.c_char_p),P)(sh,1,a,None);self.fn('glCompileShader',None,U)(sh)
            ok=I();self.fn('glGetShaderiv',None,U,U,C.POINTER(I))(sh,0x8B81,C.byref(ok))
            if not ok.value:
                buf=C.create_string_buffer(16384);self.fn('glGetShaderInfoLog',None,U,I,P,P)(sh,len(buf),None,buf)
                raise AssertionError(f'{label} compile: {buf.value.decode()}')
            compiled.append(sh)
        pr=self.fn('glCreateProgram',U)()
        for sh in compiled:self.fn('glAttachShader',None,U,U)(pr,sh)
        self.fn('glLinkProgram',None,U)(pr);ok=I();self.fn('glGetProgramiv',None,U,U,C.POINTER(I))(pr,0x8B82,C.byref(ok))
        if not ok.value:
            buf=C.create_string_buffer(16384);self.fn('glGetProgramInfoLog',None,U,I,P,P)(pr,len(buf),None,buf)
            raise AssertionError(f'{label} link: {buf.value.decode()}')
        for sh in compiled:self.fn('glDeleteShader',None,U)(sh)
        self.resources.append(('Program',pr));return pr
    def new(self,kind):
        obj=U();self.fn('glGen'+kind+'s',None,I,C.POINTER(U))(1,C.byref(obj));self.resources.append((kind,obj.value));return obj.value
    def texture(self,pixels):
        p=np.ascontiguousarray(pixels,dtype=np.uint8);assert p.ndim==3 and p.shape[2]==4
        tex=self.new('Texture');self.fn('glBindTexture',None,U,U)(0x0DE1,tex)
        for what,value in [(0x2801,0x2601),(0x2800,0x2601),(0x2802,0x812F),(0x2803,0x812F)]:self.fn('glTexParameteri',None,U,U,I)(0x0DE1,what,value)
        self.fn('glTexImage2D',None,U,I,I,I,I,I,U,U,P)(0x0DE1,0,0x8058,p.shape[1],p.shape[0],0,0x1908,0x1401,p.ctypes.data_as(P));return tex
    def target(self,w=640,h=360,clear=(.04,.07,.09,1)):
        tex=self.texture(np.zeros((h,w,4),dtype=np.uint8));fbo=self.new('Framebuffer');self.fn('glBindFramebuffer',None,U,U)(0x8D40,fbo);self.fn('glFramebufferTexture2D',None,U,U,U,U,I)(0x8D40,0x8CE0,0x0DE1,tex,0)
        assert self.fn('glCheckFramebufferStatus',U,U)(0x8D40)==0x8CD5
        self.fn('glViewport',None,I,I,I,I)(0,0,w,h);self.fn('glClearColor',None,F,F,F,F)(*clear);self.fn('glClear',None,U)(0x4000);return (fbo,w,h)
    def draw(self,pr,attributes,uniforms,textures,blend=False,instances=None):
        self.fn('glUseProgram',None,U)(pr)
        vao=self.new('VertexArray');self.fn('glBindVertexArray',None,U)(vao)
        count=None
        for name,values in attributes.items():
            divisor=0
            if isinstance(values,tuple):values,divisor=values
            arr=np.ascontiguousarray(values,dtype=np.float32);arr=arr.reshape(len(arr),-1)
            loc=self.fn('glGetAttribLocation',I,U,C.c_char_p)(pr,name.encode())
            if loc<0:continue
            buf=self.new('Buffer');self.fn('glBindBuffer',None,U,U)(0x8892,buf);self.fn('glBufferData',None,U,C.c_ssize_t,P,U)(0x8892,arr.nbytes,arr.ctypes.data_as(P),0x88E4)
            self.fn('glEnableVertexAttribArray',None,U)(loc);self.fn('glVertexAttribPointer',None,U,I,U,U,I,P)(loc,arr.shape[1],0x1406,0,0,None);self.fn('glVertexAttribDivisor',None,U,U)(loc,divisor)
            if divisor==0:count=len(arr)
        for unit,(name,pixels) in enumerate(textures.items()):
            self.fn('glActiveTexture',None,U)(0x84C0+unit);tex=pixels if isinstance(pixels,int) else self.texture(pixels);self.fn('glBindTexture',None,U,U)(0x0DE1,tex)
            loc=self.fn('glGetUniformLocation',I,U,C.c_char_p)(pr,name.encode());self.fn('glUniform1i',None,I,I)(loc,unit)
        for name,value in uniforms.items():
            loc=self.fn('glGetUniformLocation',I,U,C.c_char_p)(pr,name.encode())
            if loc<0:continue
            if isinstance(value,(int,np.integer)):self.fn('glUniform1i',None,I,I)(loc,int(value))
            elif isinstance(value,(float,np.floating)):self.fn('glUniform1f',None,I,F)(loc,float(value))
            else:
                ar=np.ascontiguousarray(value,dtype=np.float32)
                if ar.ndim==1 and len(ar)<=4:self.fn(f'glUniform{len(ar)}f',None,I,*([F]*len(ar)))(loc,*ar)
                else:
                    ar=ar.reshape(len(ar),-1);self.fn(f'glUniform{ar.shape[1]}fv',None,I,I,P)(loc,len(ar),ar.ctypes.data_as(P))
        self.fn('glDisable',None,U)(0x0B71)
        if blend:self.fn('glEnable',None,U)(0x0BE2);self.fn('glBlendEquation',None,U)(0x8006);self.fn('glBlendFuncSeparate',None,U,U,U,U)(0x0302,0x0303,1,0x0303)
        else:self.fn('glDisable',None,U)(0x0BE2)
        if instances is None:self.fn('glDrawArrays',None,U,I,I)(4,0,count or 6)
        else:self.fn('glDrawArraysInstanced',None,U,I,I,I)(4,0,count or 6,instances)
        self.check('draw');self.fn('glBindVertexArray',None,U)(0)
    def read(self,target):
        fb,w,h=target;self.fn('glBindFramebuffer',None,U,U)(0x8D40,fb);p=np.zeros((h,w,4),dtype=np.uint8);self.fn('glReadPixels',None,I,I,I,I,U,U,P)(0,0,w,h,0x1908,0x1401,p.ctypes.data_as(P));self.check('readPixels');return np.flipud(p).copy()
    def close(self):
        for kind,obj in reversed(self.resources):
            if kind=='Program':self.fn('glDeleteProgram',None,U)(obj)
            else:self.fn('glDelete'+kind+'s',None,I,C.POINTER(U))(1,C.byref(U(obj)))
        self.egl.eglMakeCurrent(self.display,None,None,None)
        self.egl.eglDestroyContext.argtypes=[P,P];self.egl.eglDestroyContext(self.display,self.context)
        self.egl.eglDestroySurface.argtypes=[P,P];self.egl.eglDestroySurface(self.display,self.surface)
        self.egl.eglTerminate.argtypes=[P];self.egl.eglTerminate(self.display)
