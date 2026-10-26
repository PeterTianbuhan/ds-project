import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,existsSync,rmSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {ProjectEngine} from '../host/engine.js';
const setup=t=>{const home=mkdtempSync(join(tmpdir(),'dsproject-lifecycle-'));t.after(()=>rmSync(home,{recursive:true,force:true}));return new ProjectEngine(home,{});};
test('new project stores icon, goal and real context files; invalid material creates nothing',async t=>{
 const e=setup(t);
 await assert.rejects(e.createProject({name:'Invalid',files:[{name:'empty.txt',content:''}]}));assert.equal(e.store.data.projects.length,0);
 const p=await e.createProject({name:'Blue project',description:'Make API faster',icon:'code',color:'blue',files:[{name:'context.md',content:'A documented constraint.'}]});
 assert.equal(p.description,'Make API faster');assert.equal(p.icon,'code');assert.equal(p.files.length,1);
 assert.equal(readFileSync(p.files[0].path,'utf8'),'A documented constraint.');
});
test('confirmed delete removes project, conversations, memory, files and request keys without affecting another project',async t=>{
 const e=setup(t),p=await e.createProject({name:'Delete me',files:[{name:'note.md',content:'Private project context'}]}),keep=await e.createProject({name:'Keep me'});
 e.store.message(e.store.thread(p.mainThreadId),'user','A private message');e.store.memory(p.id,'A decision',{},true);
 e.store.data.requests[`send:${p.mainThreadId}:test`]={messageId:'test'};
 await assert.rejects(e.deleteProject(p.id,'Wrong name'));assert.ok(existsSync(p.cwd));
 await e.deleteProject(p.id,p.name);
 assert.ok(!existsSync(p.cwd));assert.ok(existsSync(keep.cwd));
 const saved=readFileSync(e.store.path,'utf8');assert.ok(!saved.includes('Private project context'));assert.ok(!saved.includes('A private message'));assert.ok(!saved.includes(p.id));assert.ok(!saved.includes(p.mainThreadId));
 assert.equal(new ProjectEngine(e.store.home,{}).store.data.projects.length,1);
});
test('delete blocks new work and late callbacks while stopping an active thread; failed shutdown does not delete data',async t=>{
 const e=setup(t),p=await e.createProject({name:'Running'}),thread=e.store.thread(p.mainThreadId);
 thread.sessionId='test-running';thread.status='running';e.active.add(thread.id);thread.inbox=[{text:'queued'}];
 let release;e.adapter.retire=()=>new Promise(resolve=>{release=resolve;});
 const deleting=e.deleteProject(p.id,p.name);
 await new Promise(r=>setImmediate(r));
 await assert.rejects(e.send(thread.id,'more','more'),/正在删除/);
 e.onEvent(thread.sessionId,{type:'assistant/message',seq:1,data:{content:[{type:'text',text:'late result'}]}});
 assert.equal(thread.messages.length,0);assert.equal(thread.inbox.length,0);assert.ok(existsSync(p.cwd));
 release();await deleting;e.end(thread.id);assert.equal(e.active.size,0);
 const next=await e.createProject({name:'Stop failed'});e.store.thread(next.mainThreadId).sessionId='failed';e.adapter.retire=async()=>{throw new Error('cancel failed');};
 await assert.rejects(e.deleteProject(next.id,next.name),/cancel failed/);assert.ok(existsSync(next.cwd));assert.equal(e.store.project(next.id).name,'Stop failed');
});
