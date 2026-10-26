import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync,readFileSync,existsSync,realpathSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectEngine} from '../host/engine.js';
import {projectRequest} from '../host/api.js';
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup(t){const root=mkdtempSync(join(tmpdir(),'dsproject-local-'));t.after(()=>rmSync(root,{recursive:true,force:true}));const home=join(root,'state'),base=join(root,'work');mkdirSync(base);const calls=[];const adapter={create:async(t)=>{calls.push(t.cwd);return 's'+calls.length;},send:async()=>{},retire:async()=>{},validateModel:async s=>{if(s.model==='bad')throw new Error('invalid');}};const e=new ProjectEngine(home,adapter);return {e,adapter,base,root,home,calls,api:(ep,b)=>projectRequest(e,ep,b)};}
test('project base is the cwd of main, workers and nested workers; deleting project preserves user files',async t=>{
 const {e,base,calls}=setup(t);writeFileSync(join(base,'keep.bin'),Buffer.from([0,1,2]));const p=await e.createProject({name:'Local',base});
 await e.ensureSession(e.store.thread(p.mainThreadId));const child=await e.launch(p.id,{title:'child',brief:'work',requestId:'one'});await tick();await e.launch(p.id,{title:'nested',brief:'work',sourceThreadId:child.taskId,requestId:'two'});await tick();
 assert.deepEqual(calls,[realpathSync(base),realpathSync(base),realpathSync(base)]);assert.notEqual(p.cwd,p.base);
 await e.deleteProject(p.id,p.name);assert.deepEqual(readFileSync(join(base,'keep.bin')),Buffer.from([0,1,2]));assert.ok(!existsSync(p.cwd));
});
test('invalid base creates nothing; base changes require idle sessions, preserve history, and are atomic with other settings',async t=>{
 const {e,base,root,api}=setup(t);await assert.rejects(e.createProject({name:'bad',base:join(root,'missing')}));assert.equal(e.store.data.projects.length,0);
 const p=await e.createProject({name:'local',base}),main=e.store.thread(p.mainThreadId);await e.send(main.id,'old conversation','one');await tick();const before=main.sessionId;
 const next=join(root,'next');mkdirSync(next);
 await assert.rejects(api('project/update',{projectId:p.id,name:'changed',base:next}),/当前轮次/);assert.equal(p.name,'local');assert.equal(p.base,realpathSync(base));
 e.end(main.id);await api('project/update',{projectId:p.id,base:next});assert.equal(main.sessionId,null);assert.deepEqual(main.previousSessions,[before]);assert.match(main.messages[0].text,/old conversation/);
 await e.ensureSession(main);assert.equal(main.cwd,realpathSync(next));assert.equal(e.makeTurnSnapshot(main).history.messages.length,1);
});
test('native model selections belong to one conversation, persist and are inherited by new child threads',async t=>{
 const {e,adapter,home}=setup(t),p=await e.createProject({name:'Models'}),main=e.store.thread(p.mainThreadId);await e.ensureSession(main);
 const first={provider:'p',model:'one',reasoningEffort:'high'};e.onEvent(main.sessionId,{type:'model/selection',data:first});
 const child=await e.launch(p.id,{title:'child',brief:'work',requestId:'one'});await tick();const worker=e.store.thread(child.taskId);assert.deepEqual(worker.modelSelection,first);
 e.onEvent(main.sessionId,{type:'model/selection',data:{provider:'p',model:'two'}});assert.equal(worker.modelSelection.model,'one');
 const restored=new ProjectEngine(home,adapter);assert.equal(restored.store.thread(main.id).modelSelection.model,'two');assert.equal(restored.store.thread(worker.id).modelSelection.model,'one');
});
test('native user input and attachments enter project activity once, and queued messages only enter history on admission',async t=>{
 const {e}=setup(t),p=await e.createProject({name:'Native'}),main=e.store.thread(p.mainThreadId);await e.ensureSession(main);
 const message={id:'native-1',source:{kind:'user',rpcId:'rpc-1'},content:[{type:'text',text:'Please review the attachment'},{type:'image',image:{}}]};
 e.observeNativeInput(main.sessionId,message,false);assert.equal(main.messages.length,1);assert.equal(e.makeTurnSnapshot(main).history.messages.length,0);
 e.onEvent(main.sessionId,{type:'user/message',seq:1,data:message});e.onEvent(main.sessionId,{type:'user/message',seq:1,data:message});assert.equal(main.messages.length,1);assert.equal(e.makeTurnSnapshot(main).history.messages.length,1);assert.match(main.messages[0].text,/图片附件/);assert.equal(main.turnSource.kind,'user');
});
test('old coordinator selection migrates once and obsolete project model defaults disappear',async t=>{
 const {e,adapter,home}=setup(t),p=await e.createProject({name:'Legacy'});p.coordinatorModel={provider:'p',model:'saved'};p.threadModel={provider:'p',model:'old-default'};e.store.save();
 const restored=new ProjectEngine(home,adapter),q=restored.store.project(p.id);assert.equal(q.coordinatorModel,undefined);assert.equal(q.threadModel,undefined);assert.equal(restored.store.thread(q.mainThreadId).modelSelection.model,'saved');
});
test('binary imports and file references retain bytes; large references remain indexed without reading entire files',async t=>{
 const {e,api,base}=setup(t),p=await e.createProject({name:'Files',base});const bytes=Buffer.from([0,255,1,2,3]);
 await api('files/import',{projectId:p.id,name:'files/data.bin',base64:bytes.toString('base64')});assert.deepEqual(readFileSync(p.files[0].path),bytes);
 const preview=await api('library/read',{projectId:p.id,path:'files/data.bin'});assert.equal(preview.base64,bytes.toString('base64'));
 await assert.rejects(api('files/import',{projectId:p.id,name:'../bad',base64:'AA=='}));await assert.rejects(api('files/import',{projectId:p.id,name:'broken',base64:'AA=A'}));
 const pdf=join(base,'source.pdf');writeFileSync(pdf,Buffer.from('%PDF-1.7\n\0binary'));
 await api('library/action',{projectId:p.id,action:'link-path',path:pdf});const entry=p.mounts[0];const list=await api('library/list',{projectId:p.id});assert.ok(list.entries.some(e=>e.workspace&&e.mountId==='workspace'));assert.equal(list.entries.find(e=>e.mountId===entry.id).type,'file');
 assert.equal((await api('library/read',{projectId:p.id,mountId:entry.id})).kind,'binary');await api('library/action',{projectId:p.id,action:'unlink-folder',mountId:entry.id});assert.ok(existsSync(pdf));
 const bulk=Buffer.alloc(1024*1024,7);await api('files/import',{projectId:p.id,name:'large.bin',base64:bulk.toString('base64')});assert.deepEqual(readFileSync(p.files.at(-1).path),bulk);
});
test('native turn start captures current sibling activity before DSH assembles the prompt',async t=>{
 const {e}=setup(t),p=await e.createProject({name:'Awareness'}),main=e.store.thread(p.mainThreadId);await e.ensureSession(main);
 const child=await e.launch(p.id,{title:'child',brief:'work',requestId:'one'});await tick();const worker=e.store.thread(child.taskId);e.end(worker.id);
 e.onEvent(main.sessionId,{type:'turn/start',data:{turn:1}});e.end(main.id);
 const message={id:'worker-native-update',source:{kind:'user'},content:[{type:'text',text:'The deadline moved to Friday'}]};
 e.observeNativeInput(worker.sessionId,message,true);e.onEvent(main.sessionId,{type:'turn/start',data:{turn:2}});
 assert.match(JSON.stringify(main.turnSnapshot.threads),/deadline moved to Friday/);
});
test('native paused inbox is woken once on resume while project queues remain paused',async t=>{
 const {e,adapter}=setup(t),p=await e.createProject({name:'Pause'}),main=e.store.thread(p.mainThreadId);await e.ensureSession(main);let wakes=0;adapter.wake=async()=>{wakes++;};
 await e.pause(p.id,true);main.nativePausedPending=true;await e.pause(p.id,false);await e.pause(p.id,false);assert.equal(wakes,1);assert.equal(main.nativePausedPending,undefined);
});
test('opening an empty main triggers one attributed kickoff across concurrent opens and reloads',async t=>{
 const {e,adapter,home}=setup(t),p=await e.createProject({name:'Welcome'}),main=e.store.thread(p.mainThreadId),sent=[];
 adapter.send=async(t,body,source)=>sent.push({body,source});
 await Promise.all([e.openThread(main.id),e.openThread(main.id)]);await tick();
 assert.equal(sent.length,1);assert.equal(sent[0].source.role,'onboarding');assert.equal(main.messages.length,0);assert.ok(main.onboardingStartedAt);
 assert.match(e.context(main.sessionId),/尚无具体任务时，简短询问用户想先推进什么/);
 e.end(main.id);const restored=new ProjectEngine(home,adapter);await restored.openThread(main.id);await tick();assert.equal(sent.length,1);
});
test('onboarding respects prior user input, paused projects and worker conversations',async t=>{
 const {e,adapter}=setup(t);let sends=0;adapter.send=async()=>sends++;
 const p=await e.createProject({name:'Already started'}),main=e.store.thread(p.mainThreadId);
 e.store.message(main,'user','Start with this task',{admitted:false});await e.openThread(main.id);await tick();assert.equal(sends,0);
 const blank=await e.createProject({name:'Paused'});blank.paused=true;await e.openThread(blank.mainThreadId);assert.equal(sends,0);
 blank.paused=false;const worker=e.store.addThread(blank.id,'worker','research');await e.openThread(worker.id);assert.equal(sends,0);
 await e.openThread(blank.mainThreadId);await tick();assert.equal(sends,1);
});
test('a user message arriving while opening the native session takes priority over onboarding',async t=>{
 const {e,adapter}=setup(t),p=await e.createProject({name:'Race'}),main=e.store.thread(p.mainThreadId);let release,sends=0;
 adapter.create=()=>new Promise(r=>release=r);adapter.send=async()=>sends++;
 const opening=e.openThread(main.id);e.store.message(main,'user','My first request',{admitted:false});release('race-session');await opening;await tick();assert.equal(sends,0);assert.equal(main.onboardingStartedAt,undefined);
});
