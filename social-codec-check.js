/* CutNova V4.1 — inspect ISO BMFF sample-description entries locally.
 * Read only MP4 box headers and the bounded moov atom. Never trust extension,
 * MIME strings, MediaRecorder.isTypeSupported or a successful download as
 * evidence of the actual encoded video/audio codecs. No networking or uploads.
 */
(function(root){
  "use strict";
  const MAX_MOOV=8*1024*1024;
  const MAX_BOXES=4000;
  const CODECS={
    avc1:"H.264",avc3:"H.264",hvc1:"HEVC",hev1:"HEVC",
    "vp09":"VP9",vp08:"VP8",av01:"AV1",encv:"Encrypted/unknown video",
    mp4a:"AAC/MP4 audio entry",Opus:"Opus",opus:"Opus",
    "ac-3":"AC-3","ec-3":"E-AC-3",enca:"Encrypted/unknown audio"
  };
  function fourcc(bytes,offset){
    if(offset<0||offset+4>bytes.length)return "";
    return String.fromCharCode(...bytes.subarray(offset,offset+4));
  }
  function u32(v,o){return v.getUint32(o,false)}
  function boxes(bytes,begin=0,end=bytes.length){
    const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),items=[];
    let pos=begin,iterations=0;
    while(pos+8<=end&&iterations++<MAX_BOXES){
      let len=u32(view,pos),header=8;
      const type=fourcc(bytes,pos+4);
      if(len===1){
        if(pos+16>end)break;
        const high=u32(view,pos+8),low=u32(view,pos+12);
        if(high>0)break; // Only parse bounded atoms below 4GiB
        len=low;header=16;
      }else if(len===0)len=end-pos;
      if(len<header||pos+len>end)break;
      items.push({type,start:pos+header,end:pos+len});
      pos+=len;
    }
    return items;
  }
  function child(parent,bytes,type){
    return boxes(bytes,parent.start,parent.end).filter(x=>x.type===type);
  }
  function codecsInMoov(moovBytes){
    const rootBox=boxes(moovBytes).find(x=>x.type==="moov");
    if(!rootBox)return {video:[],audio:[],incomplete:true};
    const found={video:[],audio:[],incomplete:false};
    const data=new DataView(moovBytes.buffer,moovBytes.byteOffset,moovBytes.byteLength);
    for(const trak of child(rootBox,moovBytes,"trak")){
      let handler="";
      let samples=[];
      for(const mdia of child(trak,moovBytes,"mdia")){
        for(const hdlr of child(mdia,moovBytes,"hdlr")){
          if(hdlr.start+12<=hdlr.end)handler=fourcc(moovBytes,hdlr.start+8);
        }
        for(const minf of child(mdia,moovBytes,"minf"))
          for(const stbl of child(minf,moovBytes,"stbl"))
            for(const stsd of child(stbl,moovBytes,"stsd")){
              if(stsd.start+8>stsd.end){found.incomplete=true;continue;}
              let offset=stsd.start+8;const count=Math.min(20,u32(data,stsd.start+4));
              for(let i=0;i<count&&offset+8<=stsd.end;i++){
                const len=u32(data,offset),entry=fourcc(moovBytes,offset+4);
                if(len<8||offset+len>stsd.end){found.incomplete=true;break}
                samples.push(entry);offset+=len;
              }
            }
      }
      if(!samples.length){found.incomplete=true;continue}
      for(const sample of samples){
        const kind=handler==="vide"?"video":handler==="soun"?"audio":
          ["avc1","avc3","hvc1","hev1","vp09","vp08","av01","encv"].includes(sample)?"video":
          ["mp4a","Opus","opus","ac-3","ec-3","enca"].includes(sample)?"audio":null;
        if(kind&&!found[kind].includes(sample))found[kind].push(sample);
        if(!kind)found.incomplete=true;
      }
    }
    return found;
  }
  async function readRange(blob,start,size){
    return new Uint8Array(await blob.slice(start,start+size).arrayBuffer());
  }
  async function inspect(blob){
    if(!(blob instanceof Blob)||blob.size<16)return {container:"unknown",video:[],audio:[],incomplete:true};
    const head=await readRange(blob,0,16);
    if(head[0]===0x1a&&head[1]===0x45&&head[2]===0xdf&&head[3]===0xa3)
      return {container:"WebM",video:[],audio:[],incomplete:true};
    let offset=0,ftyp=false,moov=null;
    // Skip large mdat without fetching it. Supports moov-at-end MP4s.
    for(let n=0;n<MAX_BOXES&&offset+8<=blob.size;n++){
      const h=await readRange(blob,offset,16);
      if(h.length<8)break;
      const dv=new DataView(h.buffer,h.byteOffset,h.byteLength);
      let len=dv.getUint32(0,false),type=fourcc(h,4),header=8;
      if(len===1){
        if(h.length<16)break;
        const hi=dv.getUint32(8,false),lo=dv.getUint32(12,false);
        if(hi>Number.MAX_SAFE_INTEGER/4294967296)break;
        len=hi*4294967296+lo;header=16;
      }else if(len===0)len=blob.size-offset;
      if(len<header||offset+len>blob.size)break;
      if(type==="ftyp")ftyp=true;
      if(type==="moov"){
        if(len>MAX_MOOV)return {container:ftyp?"MP4":"unknown",video:[],audio:[],incomplete:true};
        moov=await readRange(blob,offset,len);
        break;
      }
      offset+=len;
    }
    if(!ftyp)return {container:"unknown",video:[],audio:[],incomplete:true};
    if(!moov)return {container:"MP4",video:[],audio:[],incomplete:true};
    return {container:"MP4",...codecsInMoov(moov)};
  }
  function classify(info){
    const videos=info.video||[],audios=info.audio||[];
    if(info.container!=="MP4")return {
      code:"not-recommended",label:"NOT SOCIAL-READY FORMAT",
      detail:"This file is not a verified MP4 container. Use a trusted converter to H.264 video + AAC audio before social publishing."
    };
    if(info.incomplete||!videos.length||!audios.length)return {
      code:"unverified",label:"CODECS NOT VERIFIED",
      detail:"MP4 container detected, but complete video/audio sample entries could not be read. Do not infer compatibility from the filename."
    };
    if(videos.some(x=>["vp09","vp08","av01","encv"].includes(x))||
       audios.some(x=>["Opus","opus","ac-3","ec-3","enca"].includes(x)))return {
      code:"not-recommended",label:"SOCIAL CODEC WARNING",
      detail:"Detected codecs are not the standard H.264/AAC combination used for widely compatible uploads. Keep your original; re-encode through a trusted tool when needed."
    };
    const avc=videos.every(x=>["avc1","avc3"].includes(x));
    const hevc=videos.every(x=>["hev1","hvc1"].includes(x));
    const aac=audios.every(x=>x==="mp4a");
    if((avc||hevc)&&aac)return {
      code:"basic-match",label:"BASIC CODEC MATCH",
      detail:"MP4 track entries appear to be "+(avc?"H.264":"HEVC")+" + MP4 audio (usually AAC). Audio object type, sample rate, bit rate, frame rate, metadata and actual platform upload were NOT verified."
    };
    return {code:"unverified",label:"CODEC COMBINATION NOT VERIFIED",
      detail:"This combination is not a confirmed H.264/AAC or HEVC/AAC export. Verify with a trusted media inspector before posting."};
  }
  function honorsStrictSocialRequest(info){
    return info?.container==="MP4"&&!info.incomplete&&
      Array.isArray(info.video)&&info.video.length>0&&info.video.every(x=>["avc1","avc3"].includes(x))&&
      Array.isArray(info.audio)&&info.audio.length>0&&info.audio.every(x=>x==="mp4a");
  }
  function label(info){
    const v=(info.video||[]).map(x=>CODECS[x]||x).join(", ")||"unverified";
    const a=(info.audio||[]).map(x=>CODECS[x]||x).join(", ")||"unverified";
    return info.container+" · Video: "+v+" · Audio: "+a;
  }
  if(typeof module!=="undefined"&&module.exports){
    module.exports={boxes,codecsInMoov,inspect,classify,label,honorsStrictSocialRequest};
    return;
  }
  const status=document.getElementById("edit-social-status");
  if(!status)return;
  let version=0;
  root.addEventListener("cutnova:export-reset",()=>{
    version++;
    status.dataset.result="unverified";
    status.textContent="No export inspected. Record a Short to check its real video and audio codec entries.";
  });
  root.addEventListener("cutnova:export-ready",async event=>{
    const current=++version,blob=event.detail?.blob;
    status.textContent="Inspecting actual local export codec entries… Nothing is uploaded.";
    try{
      const info=await inspect(blob);
      if(current!==version)return;
      const verdict=classify(info);
      let reportCode="unverified";
      const strict=event.detail?.strictSocial===true;
      if(strict&&!honorsStrictSocialRequest(info)){
        status.textContent="STRICT SOCIAL CODEC REQUEST NOT MET — "+label(info)+". The browser did not output verified H.264 + MP4 audio sample entries. Do not treat this as social-ready; the exported file is still available for review and download.";
        status.dataset.result="not-recommended";
        reportCode="not-recommended";
      }else if(strict){
        status.textContent="STRICT FORMAT BASIC MATCH — "+label(info)+". H.264 + MP4 audio sample entries detected. AAC audio object type, bitrate, frame rate and actual social upload are not verified.";
        status.dataset.result="basic-match";
        reportCode="basic-match";
      }else{
        status.textContent=verdict.label+" — "+label(info)+". "+verdict.detail;
        status.dataset.result=verdict.code;
        reportCode=verdict.code;
      }
      root.dispatchEvent(new CustomEvent("cutnova:codec-check",{detail:{code:reportCode,message:label(info)+"; actual container entries inspected, codec and social compatibility may still be unverified."}}));
    }catch(e){
      if(current!==version)return;
      status.textContent="CODECS NOT VERIFIED — "+String(e?.message||"Could not read MP4 atoms").slice(0,120)+". Do not assume social upload compatibility.";
      status.dataset.result="unverified";
      root.dispatchEvent(new CustomEvent("cutnova:codec-check",{detail:{code:"unverified",message:"Codec inspection failed; no verified H.264/AAC claim."}}));
    }
  });
})(typeof window!=="undefined"?window:null);
