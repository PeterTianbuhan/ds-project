import React,{useEffect,useRef,useState} from 'react';
import {CheckCircle2,RotateCcw,MoreHorizontal} from 'lucide-react';

export function threadState(thread){
  if(thread.status==='resolved')return 'Resolved';
  if(['waiting','approval','failed'].includes(thread.status))return 'Waiting on you';
  if(['running','queued'].includes(thread.status))return 'Working';
  return 'Idle';
}
export function ThreadActions({thread,act,shortcut=false}){
  const menu=useRef(null),[busy,setBusy]=useState(false);
  const resolved=thread.status==='resolved',working=['running','queued','approval'].includes(thread.status);
  const label=resolved?'重新打开':'标记已解决',Icon=resolved?RotateCcw:CheckCircle2;
  useEffect(()=>{
    const close=event=>{if(event.type==='keydown'?event.key==='Escape':!event.composedPath().includes(menu.current))menu.current?.removeAttribute('open');};
    document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);
    return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};
  },[]);
  async function change(){
    setBusy(true);menu.current?.removeAttribute('open');
    try{await act('thread/update',{projectId:thread.projectId,threadId:thread.id,action:resolved?'reopen':'resolve'});}catch{/* App shows the server error. */}finally{setBusy(false);}
  }
  return <div className="thread-actions">
    {shortcut&&<button className="icon" disabled={busy||working} aria-label={label} title={working?'先用输入框中的停止按钮结束当前轮次':label} onClick={change}><Icon size={18}/></button>}
    <details className="thread-menu" ref={menu}>
      <summary className="icon" aria-label={'线程菜单：'+thread.title} title="线程菜单"><MoreHorizontal size={18}/></summary>
      <div className="thread-menu-popover" role="menu" aria-label="线程操作">
        <span className="thread-state-label">{threadState(thread)}</span>
        <button role="menuitem" disabled={busy||working} onClick={change}><Icon size={16}/>{label}</button>
        {working&&<small>先用输入框中的停止按钮结束当前轮次。</small>}
      </div>
    </details>
  </div>;
}
