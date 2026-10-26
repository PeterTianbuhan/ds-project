import test from 'node:test';
import assert from 'node:assert/strict';
import {answeredQuestions,questionAnswerDefinition as definition} from '../src/question-answers.js';
const questions=[{id:'a',question:'先做什么？'},{id:'b',question:'输出格式？'}];
const message=(value,isError=false)=>({content:[{type:'text',text:JSON.stringify(value)}],isError,source:{callId:'choice-1'}});
test('recorded question answers preserve multiple selections, custom text, and skipped answers',()=>{
 assert.deepEqual(answeredQuestions(questions,message({answers:[{id:'a',selected:['研究','讨论'],custom:'先不改文件'},{id:'b',selected:[]}]})),[{id:'a',question:'先做什么？',values:['研究','讨论','先不改文件']},{id:'b',question:'输出格式？',values:[]}]);
 for(const data of [{pending:true,answers:[]},{answers:'bad'},null])assert.deepEqual(answeredQuestions(questions,message(data)),[]);
 assert.deepEqual(answeredQuestions(questions,message({answers:[{id:'a',selected:['bad']}]},true)),[]);
 assert.deepEqual(answeredQuestions(questions,{content:[{type:'text',text:'broken json'}]}),[]);
});
test('answer view uses the recorded result position and does not claim tool events exclusively',()=>{
 const call={type:'tool/call',seq:10,data:{name:'ask_user_question',callId:'choice-1',arguments:JSON.stringify({questions})}};
 const result={type:'tool/result',seq:12,time:1234,surfaceOp:'append',data:{message:message({answers:[{id:'a',selected:['研究']}]})}};
 assert.deepEqual(definition.match(call),{id:'choice-1',role:'start'});
 assert.deepEqual(definition.match(result),{id:'choice-1',role:'update'});
 const state=definition.update({state:definition.start({}, {event:call})},{event:result});
 const node=definition.buildViewNode({state,key:'answer-key',id:'choice-1',start:{location:{kind:'unresolved'}}});
 assert.equal(node.anchorSeq,12);assert.equal(node.data.answers[0].values[0],'研究');
 assert.equal(definition.buildViewNode({state:{questions}}),null);
 assert.equal(definition.match({type:'user/message',data:{source:{kind:'user-question-reply'}}}),null);
 assert.equal(definition.match({...call,data:{...call.data,name:'bash'}}),null);
});
