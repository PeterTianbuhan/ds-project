import React,{createContext,useContext,useState} from 'react';
import {CheckCircle2,Circle,Ellipsis} from 'lucide-react';

export const ConversationDisplayContext=createContext(null);

// Read DSH's durable todo projection. Display mode never changes agent state.
export function ProjectTodoDock({useProjection}){
  const display=useContext(ConversationDisplayContext);
  const todos=useProjection('todos')??[];
  const [collapsed,setCollapsed]=useState(false);
  if(display?.mode!=='simple'||display.kind==='main'||!todos.length)return null;
  const done=todos.filter(item=>item.status==='completed').length;
  return <section className="ds-project-todos" aria-label="任务进展">
    <button type="button" className="ds-project-todo-heading" aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}>任务进展 <span>{done} / {todos.length}</span></button>
    {!collapsed&&<ul>{todos.map((item,index)=>{
      const Icon=item.status==='completed'?CheckCircle2:item.status==='in_progress'?Ellipsis:Circle;
      const label=item.status==='completed'?'已完成':item.status==='in_progress'?'进行中':'待办';
      return <li key={index} data-status={item.status}><Icon size={16} role="img" aria-label={label}/><span>{item.content}</span></li>;
    })}</ul>}
  </section>;
}

export function ProjectQuestionAnswer({node}){
  const display=useContext(ConversationDisplayContext);
  if(display?.mode!=='simple')return null;
  return <div className="ds-project-answer" aria-label="你的选择"><dl>{node.data.answers.map(answer=><div key={answer.id}><dt>{answer.question}</dt><dd>{answer.values.length?answer.values.join('、'):'已跳过'}</dd></div>)}</dl></div>;
}

export function ProjectCommunication({node}){
  const display=useContext(ConversationDisplayContext);
  if(display?.mode!=='simple')return null;
  const data=node.data,peer=display.threads?.find(t=>t.id===data.threadId);
  const title=peer?.title||data.title||'项目线程';
  const label=data.direction==='submitted'?'已提交结果，轮次结束后回报':data.direction==='received'?(data.role==='report'?'收到结果 · 来自':data.role==='dispatch'?'收到任务 · 来自':'来自'):(data.role==='dispatch'?'已新建线程':'发往');
  return <details className="ds-project-communication"><summary><span>{label}</span>{data.direction!=='submitted'&&<>{' '}{peer?<button type="button" onClick={event=>{event.preventDefault();display.onOpenThread?.(peer.id);}}>{title}</button>:<strong>{title}</strong>}</>}{data.queued&&<small>已排队</small>}</summary><div>{data.body}</div></details>;
}
