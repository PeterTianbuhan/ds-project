function parse(text){try{return JSON.parse(text);}catch{return null;}}
export function answeredQuestions(questions,result){
  if(result?.isError)return [];
  const payload=parse(result?.content?.filter(b=>b.type==='text').map(b=>b.text).join(''));
  if(!Array.isArray(payload?.answers)||payload.pending)return [];
  return (Array.isArray(questions)?questions:[]).flatMap(q=>{
    if(!q||typeof q.id!=='string'||typeof q.question!=='string')return [];
    const answer=payload.answers.find(a=>a?.id===q.id);
    if(!answer)return [];
    const values=Array.isArray(answer.selected)?answer.selected.filter(v=>typeof v==='string'):[];
    if(typeof answer.custom==='string'&&answer.custom.trim())values.push(answer.custom);
    return [{id:q.id,question:q.question,values}];
  });
}
// A view of an existing recorded answer, never a second message sent to the model.
export const questionAnswerDefinition={
  kind:'ds-project-question-answer',target:'chat',
  match(event){
    if(event.type==='tool/call'&&event.data.name==='ask_user_question')return {id:String(event.data.callId),role:'start'};
    if(event.type==='tool/result'&&event.surfaceOp==='append'){
      const payload=parse(event.data.message?.content?.filter(b=>b.type==='text').map(b=>b.text).join(''));
      if(Array.isArray(payload?.answers)&&!event.data.message.isError)return {id:String(event.data.message.source?.callId??event.data.message.toolCallId),role:'update'};
    }
    return null;
  },
  start(_context,match){return {questions:parse(match.event.data.arguments)?.questions||[]};},
  update(context,match){return {...context.state,answers:answeredQuestions(context.state?.questions,match.event.data.message),seq:match.event.seq,time:match.event.time};},
  buildViewNode(context){
    const data=context.state;if(!data?.answers?.length)return null;
    return {key:context.key,kind:'ds-project-question-answer',id:context.id,target:'chat',anchorSeq:data.seq,location:context.start?.location??{kind:'unresolved'},visibility:'visible',data};
  }
};
