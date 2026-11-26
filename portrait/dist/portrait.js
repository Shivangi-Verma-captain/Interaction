(() => {
  const canvas = document.querySelector("#scene");
  const hint = document.querySelector("#hint");
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const bytes = Uint8Array.from(atob(PORTRAIT_POINTS), c => c.charCodeAt(0));
  const packed = new DataView(bytes.buffer);
  const count = bytes.length / 8;
  const homeX = new Float32Array(count), homeY = new Float32Array(count), depth = new Float32Array(count);
  const fold = new Float32Array(count), spring = new Float32Array(count);
  const dx = new Float32Array(count), dy = new Float32Array(count);
  const vx = new Float32Array(count), vy = new Float32Array(count);
  const appearance = new Float32Array(count*4), coords = new Float32Array(count*2);
  const clamp = (n,lo,hi) => Math.max(lo,Math.min(hi,n));
  for (let i=0;i<count;i++) {
    const x=packed.getInt16(i*8,true)/8, y=packed.getInt16(i*8+2,true)/8;
    const z=packed.getInt16(i*8+4,true)/16, tone=packed.getInt16(i*8+6,true)/4095;
    const noise = Math.sin(i*78.233)*4375.5453;
    const seed = noise-Math.floor(noise);
    homeX[i]=x; homeY[i]=y; depth[i]=z;
    fold[i]=.58+.22*Math.sin(y*.035+x*.009)+.12*Math.cos(x*.026-y*.018)+.18*seed;
    spring[i]=.88+.28*seed;
    const warmth=clamp((y-600)/440 + (x-860)/1460 + .13*Math.sin(x*.007+y*.003),0,1);
    const fade=clamp((1210-y)/195,0,1);
    const light=(.25+.83*Math.pow(tone,.74))*(.88+.17*seed)*fade;
    appearance[i*4]=clamp(light*(.87+.13*warmth),0,1);
    appearance[i*4+1]=clamp(light*(.77+.20*warmth),0,1);
    appearance[i*4+2]=clamp(light*(1.06-.37*warmth),0,1);
    appearance[i*4+3]=(.96+3.28*Math.sqrt(tone)+.55*seed)*(.5+.5*fade);
  }

  const originals=[homeX,homeY,depth,appearance].map(a=>a.slice());
  studio.loadPhoto=img=>{
    const arrays=[homeX,homeY,depth,appearance];
    if(img) samplePhoto(img,homeX,homeY,depth,appearance);
    else arrays.forEach((a,i)=>a.set(originals[i]));
    for(const a of [vx,vy,dx,dy]) a.fill(0);
    studio.revision++; wake();
  };
  document.addEventListener("studiochange",()=>wake());
  let draw = makeRenderer(canvas,count,appearance);
  let width,height,dpr,scale,ox,oy,settleUntil=0;
  function wake(){ settleUntil=performance.now()+3200; }
  function resize(){
    if (canvas.dataset.recording === "true") return;
    wake();
    width=canvas.clientWidth; height=canvas.clientHeight;
    dpr=Math.min(window.devicePixelRatio || 1,2,2560/Math.max(width,height));
    canvas.width=Math.max(2,2*Math.round(width*dpr/2));
    canvas.height=Math.max(2,2*Math.round(height*dpr/2));
    scale=Math.min(height*.80/1250,width*.86/950);
    ox=width*.5-795*scale;
    oy=height*.53-360*scale;
  }
  resize();
  new ResizeObserver(resize).observe(canvas);
  canvas.addEventListener("capturefinished",resize);
  const pointer={x:0,y:0,active:false,dx:0,dy:0};
  let used=false;
  function point(x,y){
    wake();
    if (pointer.active){
      pointer.dx=clamp(pointer.dx*.53+(x-pointer.x)*.94,-105,105);
      pointer.dy=clamp(pointer.dy*.53+(y-pointer.y)*.94,-105,105);
    }
    Object.assign(pointer,{x,y,active:true});
    if (!used && Math.abs(x-795)<470 && y>-360 && y<1100){
      used=true;
      hint.classList.add("used");
    }
  }
  function fromEvent(event){
    if(studio.autoStart!==null)return;
    const rect=canvas.getBoundingClientRect();
    const fit=Math.min(rect.width/width,rect.height/height);
    point(((event.clientX-rect.left-(rect.width-width*fit)/2)/fit-ox)/scale,
          ((event.clientY-rect.top-(rect.height-height*fit)/2)/fit-oy)/scale);
  }
  canvas.addEventListener("pointermove",fromEvent);
  canvas.addEventListener("pointerdown",e=>{canvas.setPointerCapture(e.pointerId); fromEvent(e);});
  const release=()=>{wake();pointer.active=false;pointer.dx=0;pointer.dy=0;};
  canvas.addEventListener("pointerleave",release);
  canvas.addEventListener("pointercancel",release);
  canvas.addEventListener("pointerup",e=>{if(e.pointerType!=="mouse")release();});
  canvas.addEventListener("blur",release);
  window.addEventListener("blur",release);
  canvas.addEventListener("keydown",e=>{
    if (e.key==="Escape") return release();
    const delta={ArrowLeft:[-46,0],ArrowRight:[46,0],ArrowUp:[0,-46],ArrowDown:[0,46]}[e.key];
    if (!delta) return;
    e.preventDefault();
    point(clamp((pointer.active?pointer.x:820)+delta[0],275,1215),
          clamp((pointer.active?pointer.y:340)+delta[1],-350,1080));
  });

  let aimX=0,aimY=0,previous=0,frameId;
  function frame(now){
    if (now>settleUntil && canvas.dataset.recording !== "true"){
      frameId=requestAnimationFrame(frame);
      return;
    }
    if(studio.autoStart!==null){
      const t=clamp((now-studio.autoStart)/16000,0,1);
      const x=width*(.5-.44*Math.cos(t*Math.PI*5));
      const y=height*(.09+.82*t);
      point((x-ox)/scale,(y-oy)/scale);
      if(t>=1){studio.autoStart=null;release();canvas.dispatchEvent(new Event("autofinished"));}
    }
    const dt=clamp((now-previous)/1000,.001,.033);
    previous=now;
    const follow=1-Math.exp(-4*dt);
    aimX+=((pointer.active?clamp((pointer.x-795)/700,-1,1):0)-aimX)*follow;
    aimY+=((pointer.active?clamp((pointer.y-300)/800,-1,1):0)-aimY)*follow;
    const reduced=motion.matches, strength=reduced ? .32 : 1;
    const yaw=aimX*.17*strength, pitch=aimY*.08*strength;
    const radius=230, damping=Math.exp(-dt*(reduced?21:10));
    const speedFade=Math.exp(-dt*6);
    pointer.dx*=speedFade; pointer.dy*=speedFade;
    for(let i=0;i<count;i++){
      const x=homeX[i]+(depth[i]-70)*yaw, y=homeY[i]+(depth[i]-70)*pitch;
      const rx=x-pointer.x, ry=y-pointer.y;
      let tx=0,ty=0;
      if(pointer.active && Math.abs(rx)<radius && Math.abs(ry)<radius){
        const dist=Math.sqrt(rx*rx+ry*ry);
        if(dist<radius){
          const weight=1-dist/radius;
          const force=weight*weight*(3-2*weight)*fold[i]*strength;
          // Pull the surface along a stroke and lift its lip around a resting pointer.
          tx=force*(rx*1.32+pointer.dx*2.5-38);
          ty=force*(ry*1.04+pointer.dy*2.5-76);
        }
      }
      const k=dt*125*spring[i];
      vx[i]=(vx[i]+(tx-dx[i])*k)*damping;
      vy[i]=(vy[i]+(ty-dy[i])*k)*damping;
      dx[i]+=vx[i]*dt; dy[i]+=vy[i]*dt;
      coords[i*2]=ox+(x+dx[i])*scale;
      coords[i*2+1]=oy+(y+dy[i])*scale;
    }
    draw(coords,width,height,scale,dpr,aimX,aimY,pointer.active?ox+pointer.x*scale:-10000,pointer.active?oy+pointer.y*scale:-10000);
    frameId=requestAnimationFrame(frame);
  }
  canvas.addEventListener("webglcontextlost",e=>{
    e.preventDefault();
    cancelAnimationFrame(frameId);
    canvas.dispatchEvent(new Event("renderpaused"));
  });
  canvas.addEventListener("webglcontextrestored",()=>{
    draw=makeRenderer(canvas,count,appearance);
    wake();
    frameId=requestAnimationFrame(frame);
  });
  frame(0);
  canvas.dataset.ready="true";
})();
