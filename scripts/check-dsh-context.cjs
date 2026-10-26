// Run with the host's Node/Electron runtime and its @deepseek-ai module directory.
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const root=process.argv[2];if(!root)throw new Error('Pass the host @deepseek-ai module directory');
 const {Session}=require(path.join(root,'dsh-session/lib/index.js'));
 const {createUserMessage,createSystemMessage}=require(path.join(root,'dsh-llm/lib/index.js'));
 const {replaceCoordinatorHistory}=await import('../host/context.js');
 const s=new Session('session-ds-context-isolated');
 s.append('system/message',{message:createSystemMessage({source:{kind:'system-prompt'},content:[{type:'text',text:'Required host system instructions'}]})},{surfaceOp:'append'});
 for(let i=0;i<40;i++)s.append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text:'old-'+i}]}),{surfaceOp:'append'});
 const snapshot={messages:[{role:'user',text:'recent only'}],omittedMessages:39};
 replaceCoordinatorHistory(s,snapshot,createUserMessage);
 assert.equal(s.deriveMessages().length,2);
 assert.equal(s.deriveMessages()[0].role,'system');
 assert.match(JSON.stringify(s.deriveMessages()),/Required host system instructions/);
 assert.match(JSON.stringify(s.deriveMessages()),/recent only/);
 assert.ok(!JSON.stringify(s.deriveMessages()).includes('old-0'));
 assert.equal(s.snapshotEvents().length,42);
 const restored=new Session(s.id,s.snapshotEvents(),s.header);
 assert.equal(restored.deriveMessages().length,2);
 restored.append('user/message',createUserMessage({source:{kind:'user'},content:[{type:'text',text:'new request'}]}),{surfaceOp:'append'});
 assert.equal(restored.deriveMessages().length,3);
 replaceCoordinatorHistory(restored,snapshot,createUserMessage);
 assert.equal(restored.deriveMessages().length,2);
 assert.equal(restored.deriveMessages()[0].role,'system');
 console.log('PASS: real DSH surface replacement preserves system anchor, full log, restart and subsequent turns');
})().catch(e=>{console.error(e);process.exitCode=1});
