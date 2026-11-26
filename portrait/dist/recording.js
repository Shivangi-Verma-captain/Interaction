(() => {
  const canvas=document.querySelector("#scene");
  const button=document.querySelector("#record"), label=document.querySelector("#record-label");
  const elapsed=document.querySelector("#elapsed"), feedback=document.querySelector("#feedback");
  const download=document.querySelector("#download");
  const auto=document.querySelector("#auto");
  auto.disabled=true;
  let recorder,stream,timer,previousURL;
  if (!canvas.dataset.ready) {
    feedback.textContent="The portrait could not be rendered. Try reloading this page.";
    return;
  }
  if (!canvas.captureStream || !window.MediaRecorder) {
    feedback.textContent="Open this page in a browser with canvas recording support to save a video.";
    return;
  }
  auto.disabled=false;
  button.disabled=false;
  button.setAttribute("aria-pressed","false");
  function cleanup(){
    studio.autoStart=null; auto.disabled=false;
    canvas.dispatchEvent(new Event("pointerleave"));
    clearInterval(timer);
    stream?.getTracks().forEach(track=>track.stop());
    recorder=null;
    delete canvas.dataset.recording;
    canvas.dispatchEvent(new Event("capturefinished"));
    button.disabled=false;
    button.setAttribute("aria-pressed","false");
    label.textContent="Record";
    elapsed.hidden=true;
  }
  function stop(){
    if (recorder?.state==="recording"){
      button.disabled=true;
      label.textContent="Saving…";
      recorder.stop();
    }
  }
  button.addEventListener("click",()=>{
    if (recorder) return stop();
    try {
      stream=canvas.captureStream(30);
      const mimeType=["video/webm;codecs=vp8","video/mp4","video/webm;codecs=vp9","video/webm"]
        .find(type=>MediaRecorder.isTypeSupported(type));
      const options={videoBitsPerSecond:10000000};
      if(mimeType) options.mimeType=mimeType;
      recorder=new MediaRecorder(stream,options);
      const chunks=[];
      let interrupted=false;
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{interrupted=true; stop();};
      recorder.onstop=()=>{
        const type=chunks[0]?.type || recorder.mimeType;
        cleanup();
        if (!chunks.length){
          feedback.textContent="No video was captured. Please try again.";
          return;
        }
        if(previousURL)URL.revokeObjectURL(previousURL);
        previousURL=URL.createObjectURL(new Blob(chunks,{type}));
        download.href=previousURL;
        download.download="particle-portrait-"+new Date().toISOString().replace(/[:.]/g,"-")+(type.includes("mp4")?".mp4":".webm");
        download.hidden=false;
        feedback.textContent=interrupted?"Recording interrupted. Your captured clip is ready.":"Your recording is ready.";
        download.focus({preventScroll:true});
      };
      recorder.start(1000);
      auto.disabled=true;
      canvas.dataset.recording="true";
      const start=performance.now();
      function tick(){
        const seconds=Math.floor((performance.now()-start)/1000);
        elapsed.textContent=Math.floor(seconds/60)+":"+String(seconds%60).padStart(2,"0");
      }
      tick(); timer=setInterval(tick,250);
      download.hidden=true; feedback.textContent="";
      elapsed.hidden=false; label.textContent="Stop recording";
      button.setAttribute("aria-pressed","true");
    } catch {
      cleanup();
      feedback.textContent="The browser couldn’t start a recording. Try again or open the page in another browser.";
    }
  });
  auto.addEventListener("click",()=>{
    canvas.scrollIntoView({block:"start"});
    button.click();
    if(recorder?.state==="recording")studio.autoStart=performance.now();
  });
  canvas.addEventListener("autofinished",stop);
  canvas.addEventListener("renderpaused",stop);
})();
