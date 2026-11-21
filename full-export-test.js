/* CutNova full editor proof: create a NEW original 5-second local source;
 * feed it to the existing video editor. No upload, cloud AI or private media.
 * Only explicit user clicks can start oscillator/recorder.
 */
(function(root){
  "use strict";
  const MIME=["video/mp4;codecs=avc1.42001f,mp4a.40.2","video/mp4",
    "video/webm;codecs=vp8,opus","video/webm"];
  function mediaSupport(w){
    if(!w?.MediaRecorder||typeof w.MediaRecorder.isTypeSupported!=="function")return "";
    try{return MIME.find(t=>w.MediaRecorder.isTypeSupported(t))||""}catch{return ""}
  }
  function originalDemoName(mime){
    return "CutNova_Original_Test_Source."+(mime.includes("mp4")?"mp4":"webm");
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={mediaSupport,originalDemoName};
    return;
  }
  const button=document.getElementById("edit-prepare-test");
  const status=document.getElementById("edit-prepare-status");
  if(!button||!status)return;
  let preparing=false;
  button.addEventListener("click",async()=>{
    if(preparing)return;
    const mime=mediaSupport(root);
    const Audio=root.AudioContext||root.webkitAudioContext;
    if(!mime||!Audio||typeof document.createElement("canvas").captureStream!=="function"){
      status.textContent="UNSUPPORTED — this browser cannot prepare a local video with audio. Choose your own permitted MP4/MOV from Photos or Files.";
      return;
    }
    preparing=true;button.disabled=true;
    status.textContent="Creating an original 5-second demo on this phone. Do not switch apps; no uploads.";
    let recorder=null,stream=null,ctx=null,osc=null,level=null,ticker=null,stopper=null;
    let hidden=false;
    const hiddenListener=()=>{if(document.hidden)hidden=true;};
    document.addEventListener("visibilitychange",hiddenListener);
    try{
      const canvas=document.createElement("canvas");
      canvas.width=360;canvas.height=640;
      const brush=canvas.getContext("2d",{alpha:false});
      if(!brush)throw Error("Unable to draw original frames");
      const started=Date.now();
      function frame(){
        const elapsed=(Date.now()-started)/1000;
        brush.fillStyle="#112333";brush.fillRect(0,0,360,640);
        brush.fillStyle="#d4ee5c";brush.fillRect((Math.round(elapsed*48)%250)+8,220,80,135);
        brush.fillStyle="#ffffff";
        brush.font="bold 22px sans-serif";
        brush.fillText("CUTNOVA TEST",72,115);
        brush.font="18px sans-serif";
        brush.fillText("ORIGINAL / LOCAL",91,160);
      }
      frame();
      ctx=new Audio();
      const destination=ctx.createMediaStreamDestination();
      level=ctx.createGain();level.gain.value=.03;
      osc=ctx.createOscillator();osc.type="sine";osc.frequency.value=220;
      osc.connect(level);level.connect(destination);
      stream=canvas.captureStream(15);
      const audioTracks=destination.stream.getAudioTracks().map(t=>t.clone());
      for(const track of audioTracks)stream.addTrack(track);
      if(!stream.getVideoTracks().length||!stream.getAudioTracks().length)
        throw Error("Could not create both audio and video tracks");
      recorder=new root.MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:500000,audioBitsPerSecond:64000});
      const chunks=[];
      const completed=new Promise((resolve,reject)=>{
        let done=false;
        const finish=(error,blob)=>{
          if(done)return;done=true;
          clearTimeout(stopper);
          error?reject(error):resolve(blob);
        };
        recorder.ondataavailable=e=>{if(e.data?.size)chunks.push(e.data)};
        recorder.onerror=()=>finish(Error("Video recorder reported an error"));
        recorder.onstop=()=>{
          const blob=new Blob(chunks,{type:recorder.mimeType||mime});
          if(blob.size<2048)finish(Error("Video recorder returned an empty sample"));
          else finish(null,blob);
        };
        stopper=setTimeout(()=>finish(Error("Recording did not complete in time")),14000);
      });
      await ctx.resume();
      recorder.start(500);
      osc.start();
      ticker=setInterval(frame,66);
      await new Promise(resolve=>setTimeout(resolve,5200));
      if(hidden)throw Error("Recording was interrupted when the app went into background");
      if(recorder.state!=="inactive")recorder.stop();
      const blob=await completed;
      const video=document.getElementById("edit-video");
      if(!video)throw Error("Editor video element missing");
      const originalFile=new File([blob],originalDemoName(mime),{type:blob.type});
      status.textContent="Generated "+(blob.size/1024).toFixed(0)+" KiB demo · opening it in the real editor…";
      const playable=new Promise((resolve,reject)=>{
        let timer=setTimeout(()=>{clean();reject(Error("Editor did not open the sample; choose your own video instead"))},12000);
        function clean(){clearTimeout(timer);video.removeEventListener("loadedmetadata",check);video.removeEventListener("error",fail)}
        function check(){
          // A recorder may produce WebM without a finite duration header;
          // report this genuinely rather than claiming a usable trimmed clip.
          if(!Number.isFinite(video.duration)||video.duration<3)
            return fail(Error("Recorded video has no usable 3-second duration metadata in this browser"));
          clean();resolve();
        }
        function fail(error){clean();reject(error instanceof Error?error:Error("Generated video failed to decode"))}
        video.addEventListener("loadedmetadata",check);
        video.addEventListener("error",fail);
      });
      root.dispatchEvent(new CustomEvent("cutnova:open-cut",{
        detail:{file:originalFile,start:0,end:3}
      }));
      await playable;
      // User consent stays explicit; never tick rights or export automatically.
      status.textContent="DEMO READY ✓ — Original source loaded. Set trim 0–3 s, confirm your rights, tap EXPORT SHORT, then DOWNLOAD SHORT. A usable file is only proven after playing the downloaded video.";
      document.getElementById("edit-rights")?.scrollIntoView({block:"center",behavior:"smooth"});
    }catch(error){
      status.textContent="DEMO PREPARATION FAILED — "+String(error?.message||error).slice(0,180)+". Local export is not verified; choose your own short permitted video instead.";
    }finally{
      clearInterval(ticker);clearTimeout(stopper);
      document.removeEventListener("visibilitychange",hiddenListener);
      try{if(recorder?.state==="recording")recorder.stop()}catch(_){}
      try{osc?.stop();osc?.disconnect();level?.disconnect()}catch(_){}
      try{stream?.getTracks().forEach(t=>t.stop())}catch(_){}
      try{if(ctx?.state!=="closed")await ctx.close()}catch(_){}
      preparing=false;button.disabled=false;
    }
  });
})(typeof window!=="undefined"?window:null);
