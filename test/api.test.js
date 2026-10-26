import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectEngine} from '../host/engine.js';
import {projectRequest,registerProjectApi} from '../host/api.js';

test('DSH channel creates and reads the existing project store and rejects invalid requests',async t=>{
  const home=mkdtempSync(join(tmpdir(),'dsproject-channel-'));
  t.after(()=>rmSync(home,{recursive:true,force:true}));
  const engine=new ProjectEngine(home,{});
  let route,disposed=false;
  const dispose=registerProjectApi({connection:{fetch:{register(value){route=value;return()=>{disposed=true;};}}}},engine);
  assert.equal(route.path,'/api/projects');
  assert.deepEqual(route.methods,['POST']);
  const request=body=>route.fetch(new Request('https://dsh.invalid/api/projects',{method:'POST',body:JSON.stringify(body)}));
  assert.equal((await request({endpoint:'projects',payload:{name:'Native project'}})).status,200);
  const state=await (await request({endpoint:'state'})).json();
  assert.equal(state.value.projects[0].name,'Native project');
  assert.equal(state.value.requests,undefined);
  const projectId=state.value.projects[0].id;
  await request({endpoint:'project/update',payload:{projectId,name:'Same store'}});
  assert.equal(engine.store.project(projectId).name,'Same store');
  const before=engine.store.data.revision;
  for(const body of [{endpoint:'unknown'},{endpoint:'project/update',payload:{projectId,name:''}},{endpoint:'state',payload:'x'.repeat(12*1024*1024+1)}]){
    assert.equal((await request(body)).status,400);
  }
  assert.equal(engine.store.data.revision,before);
  dispose();assert.equal(disposed,true);
});

test('session ownership includes current and previous project sessions without changing archive state',async t=>{
 const home=mkdtempSync(join(tmpdir(),'dsproject-owned-'));t.after(()=>rmSync(home,{recursive:true,force:true}));
 const engine=new ProjectEngine(home,{}),p=await engine.createProject({name:'Ownership'});
 const main=engine.store.thread(p.mainThreadId);main.sessionId='main';main.previousSessions=['old','old'];
 const child=engine.store.addThread(p.id,'Discussion','research');child.sessionId='child';child.status='archived';
 const before=JSON.stringify(engine.store.data);
 assert.deepEqual(await projectRequest(engine,'session-ownership'),['main','old','child']);
 assert.equal(JSON.stringify(engine.store.data),before);
});
