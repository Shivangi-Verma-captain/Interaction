// All scene layers are drawn into the same canvas so recordings include the light field.
function makeRenderer(canvas, count, appearance) {
  const opts = { alpha: false, antialias: false, depth: false, stencil: false };
  const gl = canvas.getContext("webgl", opts);
  if (!gl) return makeCanvasRenderer(canvas, count, appearance);

  function program(vertex, fragment) {
    const result = gl.createProgram();
    for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      gl.attachShader(result, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(result);
    if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(result));
    return result;
  }
  const field = program(`
    attribute vec2 vertex;
    varying vec2 uv;
    void main(){ uv = vertex * .5 + .5; gl_Position = vec4(vertex,0.,1.); }
  `, `
    precision mediump float;
    varying vec2 uv;
    uniform vec2 focus; uniform vec3 leftColor; uniform vec3 rightColor;
    uniform float aspect;
    void main(){
      vec2 p = vec2((uv.x-.5)*aspect, 1.-uv.y);
      vec2 violet = (p-vec2(-.13,.38)-focus)*vec2(2.8,2.2);
      vec2 gold = (p-vec2(.19,.85)+focus)*vec2(3.4,3.9);
      float noise = fract(sin(dot(mod(gl_FragCoord.xy,128.),vec2(.127,.317)))*437.1);
      vec2 plum = (uv-vec2(.08,.78))*vec2(1.8,1.5);
      vec2 amber = (uv-vec2(.96,.13))*vec2(1.9,1.7);
      vec3 c = vec3(.038,.031,.051)
             + leftColor*.72*exp(-dot(plum,plum)*1.65)
             + rightColor*.69*exp(-dot(amber,amber)*1.8)
             + vec3(.075,.051,.109)*exp(-dot(violet,violet)*2.)
             + vec3(.076,.068,.033)*exp(-dot(gold,gold)*1.8);
      gl_FragColor=vec4(c + (noise-.5)*.007,1.);
    }
  `);
  const points = program(`
    attribute vec2 position;
    attribute vec4 look; uniform vec3 brush; uniform vec3 tint;
    uniform vec2 screen;
    uniform float dotScale;
    uniform float bloom;
    varying vec4 color;
    void main(){
      gl_Position = vec4(position/screen*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
      gl_PointSize = max(1.,look.w*dotScale)*(1.+bloom*5.);
      float brushMix=1.-smoothstep(0.,max(1.,brush.z),distance(brush.xy,position));
      color=vec4(mix(look.rgb,tint*(.35+.65*look.r),brushMix*.85), mix(.99,.036,bloom));
    }
  `, `
    precision mediump float;
    varying vec4 color; uniform int shape;
    void main(){
      vec2 xy=gl_PointCoord*2.-1.;
      float r=dot(xy,xy);
      if(shape==1) r=xy.x*xy.x+2.8*xy.y*xy.y;
      if(shape==2) r=max(2.*abs(xy.x)-xy.y,xy.y);
      if(shape==3) r=max(abs(xy.x),abs(xy.y));
      gl_FragColor=vec4(color.rgb, color.a*(1.-smoothstep(.24,1.,r)));
    }
  `);
  function buffer(data, usage) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.bufferData(gl.ARRAY_BUFFER,data,usage);
    return b;
  }
  function bind(b, loc, size) {
    gl.bindBuffer(gl.ARRAY_BUFFER,b);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc,size,gl.FLOAT,false,0,0);
  }
  const tri = buffer(new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
  const colors = buffer(appearance,gl.STATIC_DRAW);
  const positions = buffer(count*8,gl.DYNAMIC_DRAW);
  const vertex = gl.getAttribLocation(field,"vertex");
  const position = gl.getAttribLocation(points,"position");
  const look = gl.getAttribLocation(points,"look");
  const uniform = (p,n) => gl.getUniformLocation(p,n);
  const focus = uniform(field,"focus"), aspect = uniform(field,"aspect");
  const screen = uniform(points,"screen"), dotScale = uniform(points,"dotScale"), bloom = uniform(points,"bloom");
  const left=uniform(field,"leftColor"), right=uniform(field,"rightColor");
  const brush=uniform(points,"brush"), tint=uniform(points,"tint"), shape=uniform(points,"shape");
  let revision=-1;
  return (xy, w, h, scale, dpr, aimX, aimY, px, py) => {
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(field);
    bind(tri,vertex,2);
    gl.uniform2f(focus,aimX*.012,aimY*.012);
    gl.uniform1f(aspect,w/h);
    gl.uniform3fv(left,studio.rgb.first); gl.uniform3fv(right,studio.rgb.second);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(vertex);
    gl.useProgram(points);
    bind(positions,position,2);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,xy);
    bind(colors,look,4);
    if(revision!==studio.revision){gl.bufferSubData(gl.ARRAY_BUFFER,0,appearance);revision=studio.revision;}
    gl.uniform3f(brush,px,py,scale*210); gl.uniform3fv(tint,studio.rgb.tint); gl.uniform1i(shape,studio.shape);
    gl.uniform2f(screen,w,h);
    gl.uniform1f(dotScale,scale*dpr*studio.size);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE);
    gl.uniform1f(bloom,1);
    gl.drawArrays(gl.POINTS,0,count);
    gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(bloom,0);
    gl.drawArrays(gl.POINTS,0,count);
    gl.disableVertexAttribArray(position);
    gl.disableVertexAttribArray(look);
  };
}

function makeCanvasRenderer(canvas,count,appearance) {
  const ctx = canvas.getContext("2d", {alpha:false});
  const buildColors = () => Array.from({length:count}, (_,i) => {
    const start = i*4;
    return "rgb("+Array.from(appearance.subarray(start,start+3), v => Math.round(v*255)).join(",")+")";
  });
  let background, size, colors, revision=-1;
  return (xy,w,h,scale,dpr,aimX,aimY,px,py) => {
    if(revision!==studio.revision){colors=buildColors();revision=studio.revision;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    const key=[w,h,studio.first,studio.second].join();
    if (size !== key) {
      size=key;
      // Paint the soft light once per size, then reuse it for each particle frame.
      background=document.createElement("canvas");
      background.width=512;
      background.height=Math.max(1,Math.round(512*h/w));
      const field=background.getContext("2d");
      field.scale(background.width,background.height);
      field.fillStyle="#100d16";
      field.fillRect(0,0,1,1);
      for (const [x,y,r,color] of [[.08,.22,.81,studio.first],[.96,.87,.76,studio.second],[.48,.38,.32,"#211c2e"]]) {
        const glow=field.createRadialGradient(x,y,0,x,y,r);
        glow.addColorStop(0,color);
        glow.addColorStop(1,color+"00");
        field.fillStyle=glow;
        field.fillRect(0,0,1,1);
      }
    }
    ctx.drawImage(background,0,0,w,h);
    for (let i=0;i<count;i++) {
      const s=appearance[i*4+3]*scale*.8*studio.size;
      const x=xy[i*2], y=xy[i*2+1];
      ctx.fillStyle=(x-px)**2+(y-py)**2<(scale*160)**2 ? studio.tint : colors[i];
      if(studio.shape===3){ctx.fillRect(x-s/2,y-s/2,s,s);continue;}
      ctx.beginPath();
      if(studio.shape===2){ctx.moveTo(x,y-s/2);ctx.lineTo(x+s/2,y+s/2);ctx.lineTo(x-s/2,y+s/2);}
      else ctx.ellipse(x,y,s/2,s*(studio.shape===1?.3:.5),0,0,Math.PI*2);
      ctx.fill();
    }
  };
}
