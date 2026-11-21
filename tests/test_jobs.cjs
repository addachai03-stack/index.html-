const assert = require("node:assert/strict");
const {labelFor, combineRuns, artifactFor, failedJobSteps, matchingOwnerRun} = require("../jobs.js");
assert.deepEqual(labelFor({status:"in_progress"}), ["PROCESSING","working"]);
assert.deepEqual(labelFor({status:"queued"}), ["QUEUED / WAITING","working"]);
assert.deepEqual(labelFor({status:"completed",conclusion:"success"}), ["SUCCESS","success"]);
assert.deepEqual(labelFor({status:"completed",conclusion:"failure"}), ["FAILED","failed"]);
assert.deepEqual(labelFor({status:"completed",conclusion:"skipped"}), ["SKIPPED","neutral"]);
assert.deepEqual(labelFor({status:"completed",conclusion:null}), ["UNKNOWN","neutral"]);
const a={id:12,created_at:"2026-11-21T00:00:00Z"};
const b={id:15,created_at:"2026-11-21T01:00:00Z"};
assert.deepEqual(combineRuns([{workflow_runs:[a,b]},{workflow_runs:[a,{id:"bad"}]}]),[b,a]);
assert.deepEqual(combineRuns([{}]),[]);
assert.equal(combineRuns([{workflow_runs:Array.from({length:15},(_,i)=>({id:i+1,created_at:String(i)}))}]).length,10);
console.log("PASS: render status mapping, valid run IDs, deduplication and history cap.");

const sample = {id:14669684793,name:"cutnova-issue-3",size_in_bytes:4442662,expired:false,expires_at:"2026-11-27T21:18:52Z"};
const now = Date.parse("2026-11-21T00:00:00Z");
assert.equal(artifactFor(sample,now).ready,true);
assert.equal(artifactFor(sample,now).size,"4.24 MB");
assert.equal(artifactFor(sample,Date.parse("2026-11-28T00:00:00Z")).expired,true);
assert.equal(artifactFor({...sample,expired:true},now).ready,false);
assert.equal(artifactFor({...sample,expired:undefined},now).ready,false);
assert.equal(artifactFor({id:"untrusted"},now),null);
console.log("PASS: artifact availability, age, size and invalid ID tests.");

const jobs=[{name:"generate",steps:[{name:"Checkout",conclusion:"success"},{name:"Generate real portrait Shorts",conclusion:"failure"}]},{name:"other",steps:[]}];
assert.deepEqual(failedJobSteps(jobs),[{job:"generate",step:"Generate real portrait Shorts"}]);
assert.deepEqual(failedJobSteps(null),[]);
assert.deepEqual(failedJobSteps([{name:"all-good",steps:[{name:"Done",conclusion:"success"}]}]),[]);
console.log("PASS: real failed-job step extraction for transparent Results diagnostics.");

const requestId="550e8400-e29b-41d4-a716-446655440000";
const ownerRun={id:999,display_title:"CutNova owner "+requestId,status:"in_progress"};
const otherRun={id:998,display_title:"CutNova owner manual",status:"completed"};
assert.equal(matchingOwnerRun([otherRun,ownerRun],requestId)?.id,999);
assert.equal(matchingOwnerRun([otherRun],requestId),null);
assert.equal(matchingOwnerRun([ownerRun],"invalid id"),null);
assert.equal(matchingOwnerRun(null,requestId),null);
console.log("PASS: tracked owner render requires exact UUID and real GitHub display title.");
