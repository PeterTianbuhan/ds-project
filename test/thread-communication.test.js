import test from 'node:test';
import assert from 'node:assert/strict';
import {receivedCommunication,sentCommunication,threadCommunicationDefinition as def} from '../src/thread-communication.js';
const message=(text,source={})=>({id:'m',content:[{type:'text',text}],source});
const result=(payload,isError=false)=>({...message(JSON.stringify(payload),{callId:'c'}),isError});
test('received communication includes full text but excludes internal context and report instructions',()=>{
 for(const role of ['relay','dispatch'])assert.equal(receivedCommunication(message('a'.repeat(25000),{kind:'ds-project',role,threadId:'t',title:'Peer'})).body.length,25000);
 for(const role of ['recent-history','onboarding','resume','retry'])assert.equal(receivedCommunication(message('secret',{kind:'ds-project',role})),null);
 assert.equal(receivedCommunication(message('user',{kind:'user'})),null);
 const legacy='线程「Child」发来结果（状态 idle，线程 ID t）：\nFull\nresult\n这是线程结果通知，不是用户的新请求。internal';
 assert.equal(receivedCommunication(message(legacy,{kind:'ds-project',role:'report'})).body,'Full\nresult');
 assert.equal(receivedCommunication(message(legacy,{kind:'ds-project',role:'report',summary:'Clean'})).body,'Clean');
 assert.equal(receivedCommunication(message('internal',{kind:'ds-project',role:'report'})).body,'收到线程结果');
});
test('send cards only claim accepted communication, retain queued state, and distinguish submitted results',()=>{
 const args={thread_id:'t',message:'Follow up'};
 assert.equal(sentCommunication('project_send_to_thread',args,result({messageId:'m',queued:true})).queued,true);
 assert.equal(sentCommunication('project_send_to_thread',args,result({messageId:'m'},true)),null);
 assert.equal(sentCommunication('project_send_to_thread',args,result({error:'Failed'})),null);
 assert.equal(sentCommunication('bash',args,result({messageId:'m'})),null);
 assert.equal(sentCommunication('project_launch_task',{title:'Peer',brief:'Work'},result({taskId:'t'})).threadId,'t');
 assert.equal(sentCommunication('project_finish_task',{summary:'Done'},result('结果已记录')).direction,'submitted');
});
test('native replay preserves communication position without projecting replacement history',()=>{
 const event={type:'user/message',seq:12,surfaceOp:'append',data:message('Hello',{kind:'ds-project',role:'relay',threadId:'t'})};
 assert.equal(def.match({...event,surfaceOp:'replace'}),null);
 const ctx={key:'k',id:'m',start:{location:{kind:'unresolved'}},state:def.start({}, {event})};
 assert.equal(def.buildViewNode(ctx).anchorSeq,12);
 const call={type:'tool/call',seq:20,data:{name:'project_send_to_thread',callId:'c',arguments:JSON.stringify({thread_id:'t',message:'Ping'})}};
 const state=def.start({}, {event:call});assert.equal(def.buildViewNode({...ctx,state}),null);
 const reply={type:'tool/result',seq:22,surfaceOp:'append',data:{message:result({messageId:'m'})}};
 assert.equal(def.match(call).id,def.match(reply).id);
 const updated=def.update({state},{event:reply});assert.equal(def.buildViewNode({...ctx,state:updated}).data.body,'Ping');
 assert.equal(def.buildViewNode({...ctx,state:def.update({state},{event:{...reply,data:{message:result('failure',true)}}})}),null);
});
