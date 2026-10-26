import React,{useState} from 'react';
import {Check,CheckCircle2,ChevronDown,MessageCircle,RotateCcw,X,LaptopMinimal} from 'lucide-react';
import {ThreadActions,threadState} from './ThreadActions.jsx';

export function ThreadRunning({thread}){
  if(thread.status!=='running')return null;
  return <span className="thread-running" role="img" aria-label="正在运行" title="正在运行"><LaptopMinimal size={15}/><i/></span>;
}
export function ThreadList({tasks,projectId,act,onOpen}){
  const [ids,setIds]=useState(new Set()),[busy,setBusy]=useState(false);
  const selected=tasks.filter(t=>ids.has(t.id)),selecting=selected.length>0;
  const action=selected.every(t=>t.status==='resolved')?'reopen':'resolve';
  const blocked=selected.some(t=>['running','queued','approval'].includes(t.status));
  function toggle(id){setIds(previous=>{const next=new Set(previous);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  async function apply(){
    setBusy(true);
    try{await act('threads/update',{projectId,threadIds:selected.map(t=>t.id),action});setIds(new Set());}
    catch{/* Keep selection; App displays the server error. */}finally{setBusy(false);}
  }
  return <div className={'thread-overview'+(selecting?' selecting':'')} onKeyDown={event=>{if(event.key==='Escape'&&!busy){setIds(new Set());event.stopPropagation();}}}>
    <div className="thread-list">{['Waiting on you','Working','Idle','Resolved'].map(label=>{
      const items=tasks.filter(t=>threadState(t)===label);
      return items.length>0&&<details className="thread-group" key={label} open={label!=='Resolved'}>
        <summary>{label} · {items.length}<ChevronDown size={12}/></summary>
        {items.map(t=><div className="thread-row" data-selected={ids.has(t.id)||undefined} key={t.id}>
          <button className="thread-select" role="checkbox" aria-checked={ids.has(t.id)} aria-label={'选择线程：'+t.title} title={selecting?'选择线程':threadState(t)+' · 点击选择'} disabled={busy} onClick={()=>toggle(t.id)}>
            <span className={'status-icon '+t.status}>{ids.has(t.id)?<Check size={13}/>:['waiting','approval','failed'].includes(t.status)?<span className="status-mark">!</span>:null}</span>
          </button>
          <button className="thread-open" onClick={()=>onOpen(t.id)}><span className="thread-info"><strong>{t.title}<ThreadRunning thread={t}/></strong>
            {['waiting','failed'].includes(t.status)&&<small>{t.error||t.outcome?.summary?.slice(0,120)}</small>}
            <span className="reply-count"><MessageCircle size={11}/>{t.messages.filter(m=>m.role==='assistant').length}</span></span>
            <time>{new Date(t.updatedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time>
          </button><ThreadActions thread={t} act={act}/>
        </div>)}
      </details>;
    })}{!tasks.length&&<p className="empty-note">从对话中开始工作，线程会出现在这里。</p>}</div>
    {selecting&&<div className="thread-selection-bar" role="toolbar" aria-label="批量线程操作">
      <span aria-live="polite">已选 {selected.length} 项</span>
      <button disabled={busy||blocked} onClick={apply} title={blocked?'先停止选中的运行或等待审批线程':undefined}>{action==='resolve'?<CheckCircle2 size={16}/>:<RotateCcw size={16}/>} {action==='resolve'?'Resolve':'Reopen'}</button>
      <button className="icon" disabled={busy} aria-label="取消选择" title="取消选择" onClick={()=>setIds(new Set())}><X size={17}/></button>
      {blocked&&<small>请先停止选中的运行或等待审批线程。</small>}
    </div>}
  </div>;
}
