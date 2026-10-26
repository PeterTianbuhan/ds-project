const kind='ds-project-communication';
const outgoing=new Set(['project_send_to_thread','project_launch_task','project_finish_task']);
const incoming=new Set(['relay','dispatch','report']);
const textOf=message=>(message?.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('');
function parse(text){try{return JSON.parse(text);}catch{return null;}}
export function receivedCommunication(message){
  const source=message?.source;
  if(source?.kind!=='ds-project'||!incoming.has(source.role))return null;
  let body=textOf(message),title=source.title;
  if(source.role==='report'){
    // Older logs contain the report envelope followed by coordinator instructions.
    const legacy=/^线程「([\s\S]*?)」发来结果（状态 [^\n]*）：\n([\s\S]*)\n这是线程结果通知，不是用户的新请求。/.exec(body);
    body=typeof source.summary==='string'?source.summary:legacy?.[2]??'收到线程结果';
    title=title||legacy?.[1];
  }
  return {direction:'received',role:source.role,threadId:source.threadId,title,body};
}
export function sentCommunication(name,args,result){
  if(result?.isError||!args)return null;
  const payload=parse(textOf(result));
  if(name==='project_send_to_thread'&&payload?.messageId)return {direction:'sent',role:'relay',threadId:args.thread_id,title:payload.title,body:args.message,queued:!!payload.queued};
  if(name==='project_launch_task'&&payload?.taskId)return {direction:'sent',role:'dispatch',threadId:payload.taskId,title:args.title,body:args.brief};
  if(name==='project_finish_task'&&typeof payload==='string')return {direction:'submitted',role:'report',body:args.summary};
  return null;
}
// A read-only view of durable native events, never another model input.
export const threadCommunicationDefinition={
  kind,target:'chat',
  match(event){
    if(event.type==='user/message'&&event.surfaceOp==='append'&&receivedCommunication(event.data))return {id:'message:'+event.data.id,role:'start'};
    if(event.type==='tool/call'&&outgoing.has(event.data.name))return {id:'call:'+event.data.callId,role:'start'};
    if(event.type==='tool/result'&&event.surfaceOp==='append'){
      const id=event.data.message?.source?.callId??event.data.message?.toolCallId;
      if(id)return {id:'call:'+id,role:'update'};
    }
    return null;
  },
  start(_context,{event}){
    return event.type==='user/message'?{communication:receivedCommunication(event.data),seq:event.seq}:{name:event.data.name,args:parse(event.data.arguments)};
  },
  update(context,{event}){return {...context.state,communication:sentCommunication(context.state?.name,context.state?.args,event.data.message),seq:event.seq};},
  buildViewNode(context){
    if(!context.state?.communication)return null;
    return {key:context.key,kind,id:context.id,target:'chat',anchorSeq:context.state.seq,location:context.start?.location??{kind:'unresolved'},visibility:'visible',data:context.state.communication};
  }
};
