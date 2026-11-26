const studio = { size: 1, shape: 0, revision: 0, autoStart: null, rgb: {} };
const byId = id => document.getElementById(id);
for (const id of ["first", "second", "tint", "size", "shape"]) {
  const input = byId(id);
  function update() {
    if (id === "size") studio.size = Number(input.value) / 100;
    else if (id === "shape") studio.shape = input.selectedIndex;
    else {
      studio[id] = input.value;
      studio.rgb[id] = input.value.slice(1).match(/../g).map(v => parseInt(v,16)/255);
    }
    document.dispatchEvent(new Event("studiochange"));
  }
  input.addEventListener("input", update);
  update();
}

// Sample a centered head-and-shoulders crop. Flood only edge-connected pixels
// matching the background, so similarly colored details inside the face survive.
function samplePhoto(img, xs, ys, depths, looks) {
  const w=280, h=360, work=document.createElement("canvas");
  work.width=w; work.height=h;
  const ctx=work.getContext("2d",{willReadFrequently:true});
  const scale=Math.max(w/img.naturalWidth,h/img.naturalHeight);
  const dw=img.naturalWidth*scale, dh=img.naturalHeight*scale;
  ctx.drawImage(img,(w-dw)/2,(h-dh)*.32,dw,dh);
  const pixels=ctx.getImageData(0,0,w,h).data;
  const backgrounds=[0,w-1,w*(h-1),w*h-1].map(i=>pixels.slice(4*i,4*i+3));
  const visited=new Uint8Array(w*h), queue=[];
  function visit(i){
    if(visited[i]) return;
    visited[i]=1;
    const k=i*4;
    if(pixels[k+3]<24 || backgrounds.some(c=>Math.abs(pixels[k]-c[0])+Math.abs(pixels[k+1]-c[1])+Math.abs(pixels[k+2]-c[2])<58)){
      visited[i]=2;queue.push(i);
    }
  }
  for(let x=0;x<w;x++){visit(x);visit((h-1)*w+x);}
  for(let y=0;y<h;y++){visit(y*w);visit(y*w+w-1);}
  for(let j=0;j<queue.length;j++){
    const i=queue[j];
    if(i%w)visit(i-1); if(i%w<w-1)visit(i+1);
    if(i>=w)visit(i-w); if(i<w*(h-1))visit(i+w);
  }
  const samples=[];
  for(let i=0;i<w*h;i++){
    const x=(i%w+.5)/w, y=(Math.floor(i/w)+.5)/h;
    const edge=((x-.5)/(.47+.25*y*y))**2+((y-.55)/.59)**2;
    if(pixels[4*i+3]>32 && edge<1 && (visited[i]!==2 || queue.length>w*h*.92))samples.push(i);
  }
  if(samples.length<100)throw Error("Too few visible pixels");
  for(let j=0;j<xs.length;j++){
    const i=samples[Math.floor(j*samples.length/xs.length)], k=i*4;
    const x=(i%w+Math.random()*.75)/w,y=(Math.floor(i/w)+Math.random()*.75)/h;
    const tone=(.2126*pixels[k]+.7152*pixels[k+1]+.0722*pixels[k+2])/255;
    xs[j]=795+(x-.5)*1220; ys[j]=-370+y*1570;
    depths[j]=130*Math.exp(-8*(x-.5)**2-4*(y-.46)**2)+26*tone;
    const light=.15+.85*tone**.74, warm=Math.max(0,(y-.55)*2);
    looks.set([light*(.88+.12*warm),light*(.79+.18*warm),light*(1-.29*warm),1+3*tone**.55],j*4);
  }
}

let request=0;
const title=document.querySelector("h1"), note=document.querySelector(".portrait-note");
const originalTitle=title.innerHTML;
byId("photo").addEventListener("change",async e=>{
  const file=e.target.files[0];
  if(!file)return;
  const current=++request, url=URL.createObjectURL(file);
  byId("photo-status").textContent="Preparing your portrait…";
  try {
    const img=new Image(); img.src=url; await img.decode();
    if(current!==request)return;
    // Run synchronously so sampling failures reach this handler.
    studio.loadPhoto(img);
    title.textContent="Your portrait"; note.hidden=true; byId("restore").hidden=false;
    byId("photo-status").textContent="Portrait ready.";
    byId("scene").scrollIntoView({block:"start"});
  } catch {
    if(current===request)byId("photo-status").textContent="Choose a readable photo with a visible subject, such as a JPG or PNG.";
  } finally {URL.revokeObjectURL(url);e.target.value="";}
});
byId("restore").addEventListener("click",()=>{
  request++;studio.loadPhoto(null);title.innerHTML=originalTitle;note.hidden=false;
  byId("restore").hidden=true;byId("photo-status").textContent="Original restored.";
});
