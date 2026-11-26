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
    uniform vec2 focus;
    uniform float aspect;
    void main(){
      vec2 p = vec2((uv.x-.5)*aspect, 1.-uv.y);
      vec2 violet = (p-vec2(-.13,.38)-focus)*vec2(2.8,2.2);
      vec2 gold = (p-vec2(.19,.85)+focus)*vec2(3.4,3.9);
      float noise = fract(sin(dot(mod(gl_FragCoord.xy,128.),vec2(.127,.317)))*437.1);
      vec3 c = vec3(.023,.023,.033) + vec3(.075,.051,.109)*exp(-dot(violet,violet)*2.)
             + vec3(.076,.068,.033)*exp(-dot(gold,gold)*1.8);
      gl_FragColor=vec4(c + (noise-.5)*.007,1.);
    }
  `);
  const points = program(`
    attribute vec2 position;
    attribute vec4 look;
    uniform vec2 screen;
    uniform float dotScale;
    uniform float bloom;
    varying vec4 color;
    void main(){
      gl_Position = vec4(position/screen*vec2(2.,-2.)+vec2(-1.,1.),0.,1.);
      gl_PointSize = max(1.,look.w*dotScale)*(1.+bloom*5.);
      color=vec4(look.rgb, mix(.99,.036,bloom));
    }
  `, `
    precision mediump float;
    varying vec4 color;
    void main(){
      vec2 xy=gl_PointCoord*2.-1.;
      float r=dot(xy,xy);
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
  return (xy, w, h, scale, dpr, aimX, aimY) => {
    gl.viewport(0,0,canvas.width,canvas.height);
    gl.disable(gl.BLEND);
    gl.useProgram(field);
    bind(tri,vertex,2);
    gl.uniform2f(focus,aimX*.012,aimY*.012);
    gl.uniform1f(aspect,w/h);
    gl.drawArrays(gl.TRIANGLES,0,3);
    gl.disableVertexAttribArray(vertex);
    gl.useProgram(points);
    bind(positions,position,2);
    gl.bufferSubData(gl.ARRAY_BUFFER,0,xy);
    bind(colors,look,4);
    gl.uniform2f(screen,w,h);
    gl.uniform1f(dotScale,scale*dpr);
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
  const colors = Array.from({length:count}, (_,i) => {
    const start = i*4;
    return "rgb("+Array.from(appearance.subarray(start,start+3), v => Math.round(v*255)).join(",")+")";
  });
  let background, size;
  return (xy,w,h,scale,dpr) => {
    ctx.setTransform(dpr,0,0,dpr,0,0);
    if (size !== w+"x"+h) {
      size = w+"x"+h;
      background=ctx.createRadialGradient(w*.52,h*.58,0,w*.52,h*.58,h*.78);
      background.addColorStop(0,"#241d2d");
      background.addColorStop(.55,"#17141c");
      background.addColorStop(1,"#060609");
    }
    ctx.fillStyle=background;
    ctx.fillRect(0,0,w,h);
    for (let i=0;i<count;i++) {
      const s=appearance[i*4+3]*scale*.8;
      ctx.fillStyle=colors[i];
      ctx.fillRect(xy[i*2]-s/2,xy[i*2+1]-s/2,s,s);
    }
  };
}
