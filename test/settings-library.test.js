import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync,symlinkSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectEngine} from '../host/engine.js';
import {projectRequest} from '../host/api.js';
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup(t){const home=mkdtempSync(join(tmpdir(),'dsproject-settings-'));t.after(()=>rmSync(home,{recursive:true,force:true}));let e;let serial=0;const sent=[];const adapter={create:async()=>`session-${++serial}`,send:async(t,text)=>sent.push({id:t.id,text}),stop:async t=>e.end(t.id,{cancelled:true}),retire:async()=>{}};e=new ProjectEngine(home,adapter);return {e,home,adapter,sent,api:(endpoint,b)=>projectRequest(e,endpoint,b)};}
test('editable appearance and settings persist; invalid combined updates are atomic',async t=>{
 const {e,home,adapter,api}=setup(t),p=await e.createProject({name:'Original'});
 await api('project/update',{projectId:p.id,name:'Updated',icon:'rocket',color:'teal',description:'Goal',instructions:'Rules'});
 await assert.rejects(api('project/update',{projectId:p.id,name:'Bad',icon:'invalid'}));assert.equal(p.name,'Updated');
 const restored=new ProjectEngine(home,adapter).store.project(p.id);assert.equal(restored.icon,'rocket');assert.equal(restored.instructions,'Rules');
 await assert.rejects(api('project/update',{projectId:p.id,coordinatorModel:{provider:'p',model:'m'}}),/输入框/);
});
test('folder imports, rename and confirmed delete operate on real nested files; traversal and symlinks refused',async t=>{
 const {e,api}=setup(t),p=await e.createProject({name:'Files',files:[{name:'notes/week1/plan.md',content:'Plan'}]});
 const file=p.files[0];assert.equal(readFileSync(join(p.cwd,'library/notes/week1/plan.md'),'utf8'),'Plan');
 assert.ok((await api('library/list',{projectId:p.id})).entries.some(e=>e.name==='notes'));
 await api('library/action',{projectId:p.id,action:'rename',path:'notes',to:'research'});assert.equal(file.relativePath,'research/week1/plan.md');
 assert.equal((await api('library/read',{projectId:p.id,path:file.relativePath})).content,'Plan');
 await assert.rejects(api('library/action',{projectId:p.id,action:'delete',path:'research',confirmName:'wrong'}));assert.ok(existsSync(file.path));
 for(const name of ['../secret','/tmp/secret','ok/../../bad','foo\\bar'])assert.throws(()=>e.addFile(p.id,name,'No'));
 symlinkSync(tmpdir(),join(p.cwd,'library/escape'));await assert.rejects(api('library/list',{projectId:p.id,path:'escape'}));assert.throws(()=>e.addFile(p.id,'escape/no.md','No'));
 await api('library/action',{projectId:p.id,action:'delete',path:'research',confirmName:'research'});assert.equal(p.files.length,0);assert.ok(!existsSync(join(p.cwd,'library/research')));
});
test('linked directories are read-only; unlink and project delete never remove source files',async t=>{
 const {e,api,home}=setup(t),p=await e.createProject({name:'Linked'}),source=join(home,'source');mkdirSync(source);writeFileSync(join(source,'original.md'),'Keep');
 await api('library/action',{projectId:p.id,action:'link-folder',path:source});const id=p.mounts[0].id;
 assert.equal((await api('library/read',{projectId:p.id,mountId:id,path:'original.md'})).content,'Keep');
 await assert.rejects(api('library/action',{projectId:p.id,mountId:id,action:'delete',path:'original.md',confirmName:'original.md'}));
 await api('library/action',{projectId:p.id,action:'unlink-folder',mountId:id});assert.ok(existsSync(join(source,'original.md')));
 await e.deleteProject(p.id,p.name);assert.ok(existsSync(join(source,'original.md')));
});
test('memory files and instructions are shared, editable, and scoped to their own project',async t=>{
 const {e,api}=setup(t),p=await e.createProject({name:'Memory'}),q=await e.createProject({name:'Other'});await e.ensureSession(e.store.thread(p.mainThreadId));await e.ensureSession(e.store.thread(q.mainThreadId));
 e.store.memory(p.id,'Old preference',{type:'user'},true);
 await api('memory/save',{projectId:p.id,name:'MEMORY.md',content:'New preference'});
 await api('memory/save',{projectId:p.id,name:'research.md',content:'Evidence'});
 assert.equal((await api('memory/read',{projectId:p.id,name:'MEMORY.md'})).content,'New preference');
 const context=e.runtimeContext(e.store.thread(p.mainThreadId).sessionId);assert.match(context,/New preference/);assert.ok(!context.includes('Old preference'));assert.match(context,/research.md/);
 assert.ok(!e.runtimeContext(e.store.thread(q.mainThreadId).sessionId).includes('New preference'));
 await assert.rejects(api('memory/save',{projectId:p.id,name:'../bad.md',content:'Bad'}));
 await api('memory/save',{projectId:p.id,name:'MEMORY.md',content:''});assert.equal((await api('memory/read',{projectId:p.id,name:'MEMORY.md'})).content,'');
});
test('pause blocks coordinator and launches but preserves workers; restart is scoped and retains usage history',async t=>{
 const {e,api,sent}=setup(t),p=await e.createProject({name:'Running'});const {taskId}=await e.launch(p.id,{title:'Worker',brief:'Go',requestId:'work'});await tick();
 await api('project/pause',{projectId:p.id,paused:true});await e.send(p.mainThreadId,'Queued','msg');await tick();assert.equal(sent.length,1);assert.equal(e.store.thread(taskId).status,'running');
 await assert.rejects(e.launch(p.id,{title:'No',brief:'No',requestId:'blocked'}));await api('project/pause',{projectId:p.id,paused:false});await tick();assert.equal(sent.length,2);
 const main=e.store.thread(p.mainThreadId),old=main.sessionId;await api('project/restart',{projectId:p.id});assert.equal(main.sessionId,null);assert.deepEqual(main.previousSessions,[old]);assert.equal(main.messages.find(m=>m.role==='user').text,'Queued');assert.equal(e.store.thread(taskId).status,'running');
});
test('usage sums disjoint provider buckets across coordinator restarts and marks missing stats',async t=>{
 const {e,api,adapter}=setup(t),p=await e.createProject({name:'Usage'}),main=e.store.thread(p.mainThreadId);main.sessionId='new';main.previousSessions=['old'];adapter.usage=async()=>({input:100,output:50,cacheRead:300,cacheWrite:20});
 const first=await api('usage',{projectId:p.id}),second=await api('usage',{projectId:p.id});assert.equal(first.total,940);assert.equal(second.total,940);assert.equal(first.totals.cacheRead,600);
 adapter.usage=async()=>null;assert.equal((await api('usage',{projectId:p.id})).complete,false);
});
test('auto continuation only runs after explicit provider delay and while enabled; pause prevents retry',async t=>{
 const {e,api,sent}=setup(t),p=await e.createProject({name:'Retry'});await api('project/update',{projectId:p.id,autoContinue:true});await e.send(p.mainThreadId,'Work','work');await tick();const main=e.store.thread(p.mainThreadId);
 e.onEvent(main.sessionId,{type:'turn/end',data:{reason:{kind:'error',failure:{message:'Rate limit',status:429,providerRetryAfterMs:2000}}}});const due=main.retryAt;
 e.retryDue(due-1);await tick();assert.equal(sent.length,1);
 await e.pause(p.id,true);e.retryDue(due+1);await tick();assert.equal(sent.length,1);
 await e.pause(p.id,false);e.retryDue(due+1);await tick();assert.equal(sent.length,2);assert.equal(main.messages.filter(m=>m.role==='user').length,1);
 e.onEvent(main.sessionId,{type:'turn/end',data:{reason:{kind:'error',failure:{message:'Unknown failure',status:500}}}});e.retryDue(Date.now()+999999);await tick();assert.equal(sent.length,2);
});
test('legacy flat files migrate once without losing content and nested creation conflicts leave no project',async t=>{
 const {e,home,adapter}=setup(t),p=await e.createProject({name:'Legacy'});const file=e.addFile(p.id,'legacy.md','Original');
 const legacy=join(p.cwd,'library',file.id+'-legacy.md');writeFileSync(legacy,'Original');rmSync(file.path);file.path=legacy;delete file.relativePath;delete p.libraryVersion;e.store.save();
 const first=new ProjectEngine(home,adapter),next=first.store.project(p.id).files[0];assert.equal(readFileSync(next.path,'utf8'),'Original');assert.equal(next.relativePath,'legacy.md');
 const second=new ProjectEngine(home,adapter);assert.equal(second.store.project(p.id).files[0].path,next.path);
 await assert.rejects(e.createProject({name:'Bad',files:[{name:'a.md',content:'A'},{name:'a.md/b.md',content:'B'}]}));assert.equal(e.store.data.projects.length,1);
});
