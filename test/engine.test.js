import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectEngine} from '../host/engine.js';
const tick=()=>new Promise(r=>setTimeout(r,10));
function setup(t){const home=mkdtempSync(join(tmpdir(),'dsproject-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const sent=[];let e;const adapter={create:async thread=>'session-'+thread.id,send:async(thread,text)=>sent.push({thread,text}),stop:async thread=>e.end(thread.id,{cancelled:true})};e=new ProjectEngine(home,adapter);return {e,home,adapter,sent};}
test('three tasks run concurrently while main stays independent; queued cancellation does not execute',async t=>{
  const {e,sent}=setup(t),p=await e.createProject({name:'parallel'});
  const tasks=[];for(let i=0;i<4;i++)tasks.push(await e.launch(p.id,{title:'Task '+i,brief:'Do work',requestId:'launch'+i}));
  await e.send(p.mainThreadId,'Keep thinking','main');await tick();
  assert.equal(sent.length,4);assert.equal(e.store.thread(tasks[3].taskId).status,'queued');
  await e.stop(tasks[3].taskId);e.end(tasks[0].taskId);await tick();assert.equal(sent.length,4);assert.equal(e.store.thread(tasks[3].taskId).status,'stopped');
});
test('launch idempotency prevents duplicate children; cross-project source is refused',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'A'}),q=await e.createProject({name:'B'});
  const args={title:'Same',brief:'Do work',requestId:'same'};
  const [a,b]=await Promise.all([e.launch(p.id,args),e.launch(p.id,args)]);assert.deepEqual(a,b);assert.equal(e.store.data.threads.filter(t=>t.kind!=='main').length,1);
  await assert.rejects(e.launch(p.id,{...args,requestId:'cross',sourceThreadId:q.mainThreadId}));
  await assert.rejects(e.launch(p.id,{title:'No id',brief:'No'}));
});
test('turn end alone is not completion; explicit result returns to main, local conversation can resume',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'work'}),{taskId}=await e.launch(p.id,{title:'Research',brief:'Think',requestId:'x'});await tick();
  const task=e.store.thread(taskId);e.onEvent(task.sessionId,{type:'turn/end',data:{}});assert.equal(task.status,'ready');assert.equal(p.reports.length,0);
  await e.send(taskId,'Continue','next');await tick();e.finish(task.sessionId,'Need your decision',true);e.end(taskId);assert.equal(task.status,'waiting');assert.equal(p.reports.length,1);
  await e.send(taskId,'Choose A','third');await tick();e.finish(task.sessionId,'Verified A');e.end(taskId);assert.equal(task.status,'idle');assert.equal(p.reports.length,2);
  assert.equal(e.store.thread(p.mainThreadId).messages.filter(m=>m.role==='report').length,2);
});
test('memory proposals excluded until confirmed; stale approval rejected; contexts scoped to project',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'A'}),q=await e.createProject({name:'B'});
  const a=e.store.thread(p.mainThreadId),b=e.store.thread(q.mainThreadId);await e.ensureSession(a);await e.ensureSession(b);
  const m=e.store.memory(p.id,'UNIQUE FACT',{threadId:a.id});assert.ok(!e.runtimeContext(a.sessionId).includes('UNIQUE FACT'));
  e.store.decideMemory(p.id,m.id,'confirmed',1);assert.ok(e.runtimeContext(a.sessionId).includes('UNIQUE FACT'));assert.ok(!e.runtimeContext(b.sessionId).includes('UNIQUE FACT'));
  assert.throws(()=>e.store.decideMemory(p.id,m.id,'removed',1));
  const f=e.addFile(p.id,'doc.md','Private project fact');assert.throws(()=>e.readContext(b.sessionId,{file_id:f.id}));assert.throws(()=>e.readContext(b.sessionId,{task_id:a.id}));
});
test('restart preserves history and marks in-flight work interrupted without automatic replay',async t=>{
  const {e,home,adapter,sent}=setup(t),p=await e.createProject({name:'persist'});await e.send(p.mainThreadId,'saved message','r');await tick();
  const restored=new ProjectEngine(home,adapter);assert.equal(restored.store.thread(p.mainThreadId).status,'interrupted');assert.equal(restored.store.thread(p.mainThreadId).messages[0].text,'saved message');restored.pump();await tick();assert.equal(sent.length,1);
});
test('adapter errors retain user message and allow retry; stopped tasks do not publish success',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'errors'});e.adapter.create=async()=>{throw new Error('no model');};await e.send(p.mainThreadId,'do it','a');await tick();assert.equal(e.store.thread(p.mainThreadId).status,'failed');assert.equal(e.store.thread(p.mainThreadId).messages.length,1);
  e.adapter.create=async t=>'s-'+t.id;const {taskId}=await e.launch(p.id,{title:'cancel',brief:'work',requestId:'b'});await tick();e.finish(e.store.thread(taskId).sessionId,'Partial output');await e.stop(taskId);assert.equal(e.store.thread(taskId).status,'stopped');assert.equal(p.reports.length,0);
});
test('worker can dispatch a child and route follow-ups to peers; cross-project dispatch is rejected',async t=>{
  const {e,sent}=setup(t),p=await e.createProject({name:'team'}),q=await e.createProject({name:'other'});
  const {taskId}=await e.launch(p.id,{title:'Worker',brief:'Work',requestId:'worker'});await tick();
  const worker=e.store.thread(taskId),child=await e.launch(p.id,{title:'Child',brief:'Subtask',sourceThreadId:worker.id,requestId:'child'});await tick();
  assert.equal(e.store.thread(child.taskId).source.threadId,worker.id);
  const routed=await e.route(worker.sessionId,child.taskId,'More context','route');assert.equal(routed.queued,true);
  assert.equal(sent.filter(s=>s.thread.id===child.taskId).length,1);
  e.end(child.taskId);await tick();assert.equal(sent.filter(s=>s.thread.id===child.taskId).length,2);
  await assert.rejects(e.route(worker.sessionId,q.mainThreadId,'Cross project','cross'));
});
test('child results wake originating worker rather than silently waiting for a user click',async t=>{
  const {e,sent}=setup(t);e.adapter.notifyReports=true;
  const p=await e.createProject({name:'callback'}),{taskId}=await e.launch(p.id,{title:'Parent',brief:'Coordinate',requestId:'p'});await tick();
  const parent=e.store.thread(taskId),{taskId:childId}=await e.launch(p.id,{title:'Child',brief:'Analyze',requestId:'c',sourceThreadId:parent.id});await tick();e.end(parent.id);
  e.finish(e.store.thread(childId).sessionId,'Verified child result');e.end(childId);await tick();
  assert.equal(sent.filter(s=>s.thread.id===parent.id).length,2);
  assert.equal(parent.turnSource.role,'report');assert.match(sent.at(-1).text,/Verified child result/);
  assert.equal(parent.messages.filter(m=>m.role==='report').length,1);
  assert.equal(e.store.thread(p.mainThreadId).messages.filter(m=>m.role==='report').length,0);
});
test('automatic shared memory is immediately visible in other threads and can be forgotten with version checks',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'memory'});const a=e.store.thread(p.mainThreadId);await e.ensureSession(a);
  const {taskId}=await e.launch(p.id,{title:'Peer',brief:'Read context',requestId:'peer'});await tick();
  const m=e.store.memory(p.id,'User prefers one conversational entry',{threadId:taskId},true);
  assert.match(e.runtimeContext(a.sessionId),/User prefers one conversational entry/);
  e.store.decideMemory(p.id,m.id,'removed',m.revision);assert.ok(!e.runtimeContext(a.sessionId).includes('User prefers one conversational entry'));
});
test('replayed session events do not duplicate messages or result notifications',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'replay'});
  await e.ensureSession(e.store.thread(p.mainThreadId));
  const {taskId}=await e.launch(p.id,{title:'Worker',brief:'Work',requestId:'worker'});await tick();
  const worker=e.store.thread(taskId),session=worker.sessionId;
  const message={seq:2,type:'assistant/message',data:{message:{content:[{type:'text',text:'Done'}]}}};
  e.onEvent(session,{seq:1,type:'turn/start'});e.onEvent(session,message);e.onEvent(session,message);
  e.finish(session,'Unique report',false,true);
  e.onEvent(session,{seq:3,type:'turn/end',data:{}});e.onEvent(session,{seq:3,type:'turn/end',data:{}});
  assert.equal(worker.messages.filter(m=>m.role==='assistant').length,1);assert.equal(p.reports.length,1);
  assert.equal(worker.status,'resolved');
  assert.ok(!e.context(e.store.thread(p.mainThreadId).sessionId).includes('Unique report'));
});
test('report wakeup preserves resolved status and does not resend previous outcome',async t=>{
  const {e}=setup(t),p=await e.createProject({name:'settled'});
  const {taskId}=await e.launch(p.id,{title:'Worker',brief:'Work',requestId:'worker'});await tick();
  const worker=e.store.thread(taskId);e.finish(worker.sessionId,'Already finished',false,true);e.end(taskId);
  await e.send(taskId,'Late child result','late',{silent:true,source:{kind:'ds-project',role:'report'}});await tick();
  e.onEvent(worker.sessionId,{type:'turn/start'});e.end(taskId);
  assert.equal(worker.status,'resolved');assert.equal(p.reports.length,1);
});
