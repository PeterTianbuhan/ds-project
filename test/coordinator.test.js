import test from 'node:test';
import assert from 'node:assert/strict';
import {registerCoordinatorPolicy} from '../host/coordinator.js';
function setup(){
 const threads=new Map([['main',{kind:'main'}],['worker',{kind:'research'}]]),listeners=new Map(),guards=[],dispose=[];
 const ctx={on:(name,cb)=>listeners.set(name,cb),effect:cb=>dispose.push(cb()),tools:{guard:cb=>{guards.push(cb);return()=>guards.splice(guards.indexOf(cb),1);}}};
 registerCoordinatorPolicy(ctx,id=>threads.get(id));
 const assembly={sections:[{name:'identity',text:'identity'}],contexts:[{name:'project-state',text:'context'}],tools:['bash','read','write','todo_write','subagent','workflow','project_library','project_finish_task','project_launch_task','project_send_to_thread','project_remember','ask_user_question','project_read_activity'].map(name=>({name}))};
 return {threads,assembly,dispose,guard:(id,name)=>guards[0]?.({agent:{id},name}),assemble:(id,a=assembly)=>listeners.get('system-prompt/assemble')(a,{agent:{id}},async()=>a)};
}
test('main tool catalog and dispatcher agree; worker and ordinary native sessions retain execution',async()=>{
 const s=setup(),main=await s.assemble('main');
 assert.deepEqual(main.tools.map(t=>t.name),['project_launch_task','project_send_to_thread','project_remember','ask_user_question','project_read_activity']);
 assert.equal(main.sections,s.assembly.sections);assert.equal(main.contexts,s.assembly.contexts);
 for(const {name} of main.tools)assert.equal(s.guard('main',name),undefined);
 for(const name of ['bash','read','write','todo_write','subagent','workflow','project_library','project_finish_task'])assert.match(s.guard('main',name),/子线程/);
 for(const id of ['worker','ordinary']){
  assert.equal(await s.assemble(id),s.assembly);assert.equal(s.guard(id,'bash'),undefined);assert.equal(s.guard(id,'project_launch_task'),undefined);
 }
});
test('late agent-local executor is hidden and cannot bypass main policy',async()=>{
 const s=setup(),extended={...s.assembly,tools:[...s.assembly.tools,{name:'late_scoped_executor'}]};
 assert.ok(!(await s.assemble('main',extended)).tools.some(t=>t.name==='late_scoped_executor'));
 assert.match(s.guard('main','late_scoped_executor'),/主会话/);
 assert.equal(s.guard('worker','late_scoped_executor'),undefined);
});
test('session membership is resolved at use time across creation and resume; disposal removes guard',async()=>{
 const s=setup();assert.equal(await s.assemble('resumed'),s.assembly);
 s.threads.set('resumed',{kind:'main'});
 assert.ok(!(await s.assemble('resumed')).tools.some(t=>t.name==='bash'));assert.match(s.guard('resumed','bash'),/主会话/);
 for(const dispose of s.dispose)dispose();assert.equal(s.guard('resumed','bash'),undefined);
});
