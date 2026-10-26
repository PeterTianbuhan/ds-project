import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {ProjectEngine} from '../host/engine.js';
import {recentConversation,recentThreads,CONTEXT_LIMITS} from '../host/context.js';
const tick=()=>new Promise(r=>setTimeout(r,15));
function setup(t){const home=mkdtempSync(join(tmpdir(),'ds-context-'));t.after(()=>rmSync(home,{recursive:true,force:true}));const sent=[];const e=new ProjectEngine(home,{create:async x=>'s-'+x.id,send:async(thread,text)=>sent.push({id:thread.id,text})});return {e,home,sent};}

test('coordinator history stays bounded without deleting older searchable messages',async t=>{
 const {e}=setup(t),p=await e.createProject({name:'History'}),main=e.store.thread(p.mainThreadId);
 await e.ensureSession(main);
 e.store.message(main,'user','ARCHIVED-DECISION: use the blue folder');
 for(let i=0;i<60;i++)e.store.message(main,i%2?'assistant':'user',`entry-${i} `+'x'.repeat(6000));
 const recent=recentConversation(main);
 assert.ok(recent.messages.length<=CONTEXT_LIMITS.recentMessages);
 assert.ok(JSON.stringify(recent.messages).length<=CONTEXT_LIMITS.historyChars);
 assert.ok(recent.omittedMessages>0);assert.ok(!JSON.stringify(recent).includes('ARCHIVED-DECISION'));
 assert.match(recent.messages.at(-1).text,/entry-59/);
 assert.equal(recent.messages.at(-1).text,'entry-59 '+'x'.repeat(6000));
 const search=e.searchHistory(main.sessionId,{query:'ARCHIVED-DECISION'});
 assert.equal(search.totalMatches,1);assert.equal(main.messages.length,61);
 const first=e.readContext(main.sessionId,{task_id:main.id,limit:20});
 const second=e.readContext(main.sessionId,{task_id:main.id,limit:20,before_message_id:first.nextBeforeMessageId});
 assert.ok(first.hasMore);assert.ok(second.messages.length>0);
 assert.ok(!first.messages.some(a=>second.messages.some(b=>a.id===b.id)));
});

test('history keeps whole messages at the budget boundary and stops before an oversized message',()=>{
 const row={id:'boundary',at:'now',role:'user',text:''};
 // Include JSON metadata and array framing in the existing character budget.
 const capacity=CONTEXT_LIMITS.historyChars-JSON.stringify([row]).length-1;
 row.text='x'.repeat(capacity);
 assert.deepEqual(recentConversation({messages:[row]}).messages,[row]);
 const oversized={...row,text:row.text+'xx'};
 const older={id:'old',role:'user',text:'Older context'};
 const latest={id:'new',role:'assistant',text:'Latest complete answer'};
 const snapshot=recentConversation({messages:[older,oversized,latest]});
 assert.deepEqual(snapshot.messages.map(m=>m.text),[latest.text]);
 assert.equal(snapshot.omittedMessages,2);
 assert.deepEqual(recentConversation({messages:[oversized]}),{messages:[],omittedMessages:1});
 assert.equal(oversized.text.length,capacity+2);
});

test('only admitted past messages enter history; current and queued input are not duplicated',async t=>{
 const {e}=setup(t),p=await e.createProject({name:'Inbox'}),main=e.store.thread(p.mainThreadId);
 await e.send(main.id,'CURRENT INPUT','first');await tick();
 assert.ok(!JSON.stringify(main.turnSnapshot.history).includes('CURRENT INPUT'));
 await e.send(main.id,'FUTURE INPUT','future');
 assert.ok(!JSON.stringify(recentConversation(main)).includes('FUTURE INPUT'));
 e.store.message(main,'assistant','First answer');e.end(main.id);await tick();
 assert.match(JSON.stringify(main.turnSnapshot.history),/CURRENT INPUT/);
 assert.ok(!JSON.stringify(main.turnSnapshot.history).includes('FUTURE INPUT'));
 assert.equal(main.messages.filter(m=>m.role==='user').length,2);
});

test('main receives local human/assistant activity, including nested threads, without waking or rerouting work',async t=>{
 const {e,sent}=setup(t),p=await e.createProject({name:'Awareness'}),q=await e.createProject({name:'Other'});
 const main=e.store.thread(p.mainThreadId);await e.ensureSession(main);
 const child=e.store.addThread(p.id,'Local conversation','research');await e.ensureSession(child);
 e.store.message(child,'user','Changed deadline to Friday');
 e.onEvent(child.sessionId,{seq:1,type:'assistant/message',data:{message:{content:[{type:'text',text:'I will use Friday'}]}}});
 e.store.message(e.store.thread(q.mainThreadId),'user','PRIVATE OTHER PROJECT');
 await e.send(main.id,'What changed?','main');await tick();
 const snapshot=e.runtimeContext(main.sessionId);
 assert.match(snapshot,/Changed deadline to Friday/);assert.match(snapshot,/I will use Friday/);
 assert.ok(!snapshot.includes('PRIVATE OTHER PROJECT'));assert.equal(sent.length,1);
 e.store.message(child,'assistant','LATER SNAPSHOT');
 assert.ok(!e.runtimeContext(main.sessionId).includes('LATER SNAPSHOT'));
 assert.ok(e.readActivity(main.sessionId).events.some(a=>a.text==='LATER SNAPSHOT'));
});

test('activity cursors survive restart, report truncation, and refuse cross-project history',async t=>{
 const {e,home}=setup(t),p=await e.createProject({name:'A'}),q=await e.createProject({name:'B'});
 const main=e.store.thread(p.mainThreadId);await e.ensureSession(main);
 for(let i=0;i<270;i++)e.store.message(main,'user','message-'+i);
 const page=e.readActivity(main.sessionId,{after:1,limit:3});
 assert.equal(page.events.length,3);assert.equal(page.historyTruncated,true);assert.equal(page.hasMore,true);
 const next=e.readActivity(main.sessionId,{after:page.nextCursor,limit:3});
 assert.ok(next.events[0].cursor>page.nextCursor);
 const restored=new ProjectEngine(home,e.adapter);
 assert.equal(restored.readActivity(main.sessionId).latestCursor,270);
 assert.throws(()=>e.searchHistory(main.sessionId,{query:'x',thread_id:q.mainThreadId}));
 assert.throws(()=>e.readContext(main.sessionId,{task_id:q.mainThreadId}));
 assert.throws(()=>e.readContext(main.sessionId,{task_id:main.id,before_message_id:'bad-cursor'}));
});

test('thread snapshot has a fixed size and identifies queued human messages',()=>{
 const threads=Array.from({length:60},(_,i)=>({id:String(i),title:'t'+i,status:'running',updatedAt:new Date(i*1000).toISOString(),messages:[{id:'u'+i,role:'user',text:'x'.repeat(10000),admitted:false},{id:'a'+i,role:'assistant',text:'y'.repeat(10000)}]}));
 const s=recentThreads(threads,'main');assert.ok(s.threads.length<=12);assert.ok(JSON.stringify(s.threads).length<=16000);
 assert.equal(s.threads[0].id,'59');assert.equal(s.threads[0].latestUser.pending,true);assert.ok(s.omittedThreads>0);
});
