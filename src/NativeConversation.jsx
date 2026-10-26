import React,{useEffect,useMemo,useState} from 'react';
import {createPortal} from 'react-dom';
import {ConversationDisplayContext} from './ConversationDisplay.jsx';
// Render DSH's complete conversation slot with an explicitly retained Session.
// Native markup stays in light DOM so its styles, menus and focus behavior work.
export function NativeConversation({thread,api,native,paused=false,threads,onOpenThread}){
  const [target,setTarget]=useState(null),[reference,setReference]=useState(null),[error,setError]=useState('');
  const modeKey='ds-project-display:'+thread.id;
  const [mode,setMode]=useState(()=>{try{return localStorage.getItem(modeKey)==='full'?'full':'simple';}catch{return 'simple';}});
  const display=useMemo(()=>({mode,kind:thread.kind,threads,onOpenThread}),[mode,thread.kind,threads,onOpenThread]);
  function changeMode(value){setMode(value);try{localStorage.setItem(modeKey,value);}catch{}}
  const slot='ds-project-conversation-'+thread.id;
  useEffect(()=>{
    if(!native?.element)return;
    const node=document.createElement('div');node.slot=slot;node.style.cssText='height:100%;min-height:0;min-width:0;display:flex;flex-direction:column';native.element.append(node);setTarget(node);
    return()=>node.remove();
  },[native?.element,slot]);
  useEffect(()=>{
    let live=true,ref;setReference(null);setError('');
    if(!native?.sessions)return;
    (async()=>{const id=(await api('thread/open',{threadId:thread.id})).sessionId;if(!live)return;
      ref=native.sessions.retain(id,{source:'ds-project'});await ref.ready;if(live)setReference(ref);
    })().catch(e=>{if(live)setError(e.message);});
    return()=>{live=false;ref?.release();};
  },[thread.id,native?.sessions,api]);
  useEffect(()=>{
    const blocks=native?.blocks,id=thread.sessionId,reason='项目已暂停，请先恢复';
    if(!blocks||!id||!paused)return;
    if(blocks.storeFor(id).getSnapshot())return;
    blocks.set(id,{reason});
    return()=>{if(blocks.storeFor(id).getSnapshot()?.reason===reason)blocks.set(id,undefined);};
  },[native?.blocks,thread.sessionId,paused]);
  if(!native)return <div className="empty-note">请在 DeepSeek Harness 的“项目”入口中打开原生会话。</div>;
  const Provider=native.SessionProvider;
  return <div className="native-conversation"><div className="conversation-display-switch"><label>显示 <select aria-label="会话显示模式" value={mode} onChange={event=>changeMode(event.target.value)}><option value="simple">简洁</option><option value="full">全部展示 · DSH</option></select></label></div>{error?<p role="alert" className="form-error">{error}</p>:!reference?<p className="empty-note">正在连接会话…</p>:<slot name={slot}/>}
    {target&&reference&&createPortal(<ConversationDisplayContext.Provider value={display}><div data-ds-project-display={mode}><Provider session={reference}>{native.renderSlot('ds-project.conversation',{})}</Provider></div></ConversationDisplayContext.Provider>,target)}
  </div>;
}
