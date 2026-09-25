# Relay Moth Forest 3.995.1 — portal-transition memory hotfix

## Observed field failure

A Windows/Python 3.11 run of 3.995 could enter a new room through an in-game portal and then lose the browser renderer. The localhost server subsequently printed repeated `MemoryError` exceptions from `shutil.copyfileobj()` while a recovery reload attempted to fetch project files.

The Python traceback is treated as a secondary symptom: the browser had already driven the machine into severe allocation pressure and 3.995 automatically retried a full page reload after WebGL context loss.

## Transition-time allocations fixed

3.995 retained the native-resolution static `OffscreenCanvas` after uploading it into the persistent WebGL background texture because F8 export reused that canvas. On the next room rebuild the old canvas therefore remained alive while a second native-resolution canvas was constructed. At high display resolution this creates a large avoidable transient allocation spike.

3.995.1 changes that ownership contract:

1. release any retained static canvas before starting a rebuild;
2. build the new native static room canvas;
3. upload it to the existing WebGL texture;
4. immediately shrink/release its CPU backing store;
5. retain only the small 640×360 water-mask canvas needed for SurfaceFX quality changes, releasing the previous mask on replacement;
6. build F8 export on demand at logical 640×360 instead of retaining the runtime native canvas;
7. explicitly release evicted HD tint-cache canvases and cap that cache at 96 entries.

The persistent GPU background texture remains unchanged, so normal rendering does not lose the static room after the CPU canvas is released.

## Framebuffer guard

The renderer now caps backing-store area at 8,294,400 pixels (3840×2160) and also obeys `MAX_TEXTURE_SIZE`. Normal 1080p/1440p rendering is unaffected. Pathological browser zoom / DPR / very-high-resolution combinations are scaled down while CSS presentation remains full-size. F10 diagnostics report requested and actual backing size plus render scale.

## Context-loss recovery

3.995 immediately reloaded the page after a WebGL context loss. Repeated losses could therefore create a reload/request storm while memory was still under pressure. 3.995.1 allows one automatic recovery reload in a 15-second window. A second loss suppresses further automatic reloads and leaves a visible status message so the user can save F10 diagnostics and refresh manually.

## Local server hardening

The Python server now:

- limits concurrent transfers to four by default;
- streams files with a fixed 32 KiB `readinto()` buffer;
- allows large image assets to remain browser-cached for five minutes;
- revalidates source/config files instead of forcing `no-store` on every request.

These server changes reduce the severity of a browser recovery storm, but they are not used as a substitute for the browser-side allocation fix.
