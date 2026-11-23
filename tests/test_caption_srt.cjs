const assert=require("node:assert/strict");
const {timecode,buildSrt,previewCue}=require("../caption-srt.js");
assert.equal(timecode(0),"00:00:00,000");
assert.equal(timecode(61.234),"00:01:01,234");
assert.equal(timecode(3600),"01:00:00,000");
assert.equal(buildSrt([{start:3,end:6,text:"second line"},{start:0,end:2.5,text:"Hello\nworld"}]),"1\n00:00:00,000 --> 00:00:02,500\nHello\nworld\n\n2\n00:00:03,000 --> 00:00:06,000\nsecond line\n");
for(const rows of [[],Array.from({length:13},(_,i)=>({start:i*2,end:i*2+1,text:"x"})),[{start:1,end:1,text:"x"}],[{start:-1,end:1,text:"x"}],[{start:0,end:2,text:"x"},{start:1,end:3,text:"y"}],[{start:0,end:2,text:""}],[{start:0,end:2,text:"x".repeat(501)}]])assert.throws(()=>buildSrt(rows));
console.log("PASS local SRT captions: ordering, timecode, newline, overlap/limits and invalid rows");

assert.deepEqual(previewCue([{start:0,end:2,text:"First"},{start:2,end:4,text:"Second"}],1),{text:"First",index:0,next:2,end:4});
assert.equal(previewCue([{start:0,end:2,text:"First"}],2).text,"");
assert.equal(previewCue([{start:5,end:7,text:"Later"}],1).next,5);
console.log("PASS caption timeline preview: active cue boundaries, gaps and upcoming cue");
