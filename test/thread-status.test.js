import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectEngine} from '../host/engine.js';
import {projectRequest} from '../host/api.js';
function setup(t){const home=mkdtempSync(join(tmpdir(),'ds-status-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const e=new ProjectEngine(home,{create:async()=>{throw Error('Unexpected model startup');}});return {e,home};}
test('user can resolve and reopen via API without opening a model session; status survives restart',async t=>{
 const {e,home}=setup(t),p=await e.createProject({name:'Status'}),worker=e.store.addThread(p.id,'Task','research');
 e.store.message(worker,'assistant','A result');worker.outcome={summary:'A result',needsInput:true};worker.status='waiting';
 const args={projectId:p.id,threadId:worker.id};
 assert.equal((await projectRequest(e,'thread/update',{...args,action:'resolve'})).status,'resolved');
 assert.equal(worker.messages.length,1);assert.equal(worker.outcome.summary,'A result');assert.equal(worker.outcome.needsInput,false);
 assert.equal(e.store.project(p.id).activities.at(-1).status,'resolved');
 const revision=e.store.data.revision;await projectRequest(e,'thread/update',{...args,action:'resolve'});assert.equal(e.store.data.revision,revision);
 const restored=new ProjectEngine(home,{});assert.equal(restored.store.thread(worker.id).status,'resolved');
 await projectRequest(restored,'thread/update',{...args,action:'reopen'});assert.equal(restored.store.thread(worker.id).status,'ready');assert.equal(restored.store.thread(worker.id).sessionId,null);
});
test('status API rejects cross-project, main, invalid actions and active/queued/approval races',async t=>{
 const {e}=setup(t),p=await e.createProject({name:'A'}),q=await e.createProject({name:'B'}),worker=e.store.addThread(p.id,'Task','research');
 const update=body=>projectRequest(e,'thread/update',{projectId:p.id,threadId:worker.id,action:'resolve',...body});
 await assert.rejects(update({projectId:q.id}));await assert.rejects(update({threadId:p.mainThreadId}));await assert.rejects(update({action:'anything'}));
 for(const status of ['running','queued','approval']){worker.status=status;await assert.rejects(update({}),/先停止/);assert.equal(worker.status,status);}
 worker.status='ready';e.active.add(worker.id);await assert.rejects(update({}),/先停止/);e.active.clear();
 e.creating.set(worker.id,Promise.resolve());await assert.rejects(update({}),/先停止/);e.creating.clear();
 assert.equal(worker.status,'ready');
});
test('model tools and user actions share status changes; resolving a failed thread cancels retry only',async t=>{
 const {e}=setup(t),p=await e.createProject({name:'A'}),main=e.store.thread(p.mainThreadId),worker=e.store.addThread(p.id,'Task','research');main.sessionId='main';
 worker.status='failed';worker.error='rate limited';worker.retryAt=Date.now()-100;worker.retryCount=1;worker.inbox=[{text:'Old queued request'}];
 e.updateThread('main',worker.id,'resolve');assert.equal(worker.status,'resolved');assert.equal(worker.retryAt,null);assert.equal(worker.error,null);assert.deepEqual(worker.inbox,[]);assert.equal(worker.interruptedInbox[0].text,'Old queued request');
 e.updateThread('main',worker.id,'reopen');assert.equal(worker.status,'ready');assert.equal(p.reports.length,0);
});
test('bulk status changes validate the whole selection and persist once without partial results',async t=>{
 const {e,home}=setup(t),p=await e.createProject({name:'Batch'}),q=await e.createProject({name:'Other'});
 const a=e.store.addThread(p.id,'A','research'),b=e.store.addThread(p.id,'B','research'),outside=e.store.addThread(q.id,'Other','research');
 const change=ids=>projectRequest(e,'threads/update',{projectId:p.id,threadIds:ids,action:'resolve'});
 b.status='running';let revision=e.store.data.revision;
 await assert.rejects(change([a.id,b.id]),/先停止/);assert.equal(a.status,'ready');assert.equal(e.store.data.revision,revision);
 b.status='ready';
 for(const ids of [[],[a.id,outside.id],[a.id,'missing'],[a.id,p.mainThreadId],null,[null]]){
   await assert.rejects(change(ids));assert.equal(a.status,'ready');assert.equal(e.store.data.revision,revision);
 }
 const result=await change([a.id,b.id,a.id]);assert.equal(result.length,2);assert.ok(result.every(x=>x.status==='resolved'));assert.equal(e.store.data.revision,revision+1);
 const restored=new ProjectEngine(home,{});assert.equal(restored.store.thread(a.id).status,'resolved');assert.equal(restored.store.thread(b.id).status,'resolved');
 await projectRequest(restored,'threads/update',{projectId:p.id,threadIds:[a.id,b.id],action:'reopen'});assert.equal(restored.store.thread(a.id).status,'ready');assert.equal(restored.store.thread(b.id).status,'ready');
});
