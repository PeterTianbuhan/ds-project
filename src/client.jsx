import React,{useLayoutEffect,useState} from 'react';
import {createPortal} from 'react-dom';
import {Folder} from 'lucide-react';
import {App} from './App.jsx';
import css from './style.css?inline';
import conversationCss from './conversation-display.css?inline';
import {threadCommunicationDefinition} from './thread-communication.js';
import {questionAnswerDefinition} from './question-answers.js';
import {ProjectTodoDock,ProjectQuestionAnswer,ProjectCommunication} from './ConversationDisplay.jsx';

export const inject=['slots','layout','theme','uiWorkspace','sessions','conversation','uiConversation'];
const PANEL='ds-project';
const light=css.match(/:root\{([^}]+)\}/)[1];
const dark=css.match(/@media\s*\(prefers-color-scheme:\s*dark\)\s*\{\s*:root\{([^}]+)\}/)[1];
const embeddedCss=css.replaceAll(':root',':host')
  .replace(/@media\s*\(max-width:/g,'@container(max-width:')+`
  :host([data-theme=light]){${light};color-scheme:light}
  :host([data-theme=dark]){${dark};color-scheme:dark}
  :host{display:block;height:100%;min-height:0;min-width:0;contain:layout style;container-type:inline-size}
  .workspace,.main{height:100%}.loading{min-height:100%;height:100%}
  .project-header{padding-left:max(20px,calc(var(--dsh-frame-leading-clearance,0px) - 36px))}
`;

// DSH rc.3's shell.leading has sidebar-toggle followed by new-session.
// Scope this adapter to our mounted panel; native conversations keep their chrome.
const projectChromeCss=`
  [data-sidebar-collapsed]:has([data-ds-project-panel]) [data-shell-leading]{top:16px}
  [data-sidebar-collapsed]:has([data-ds-project-panel]) [data-slot="shell.leading"] button+button{display:none}
  @media(max-width:650px){
    [data-sidebar-collapsed]:has([data-ds-project-panel]) [data-shell-leading]{top:13.5px}
  }
`;

async function api(endpoint,payload){
  const response=await fetch('api/projects',{
    method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({endpoint,payload})
  });
  const result=await response.json();
  if(!response.ok||!result.ok)throw new Error(result.error||'项目连接失败');
  return result.value;
}

export function apply(ctx){
  // Kept by the plugin, so switching to another DSH panel preserves drafts and
  // the local thread being viewed. Work continues in the host independently.
  const view={};
  ctx.uiConversation.events.register(threadCommunicationDefinition);
  ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key:'ds-project-communication'},ProjectCommunication));
  ctx.uiConversation.events.register(questionAnswerDefinition);
  ctx.slots.inject('conversation.chat.node',()=>ctx.slots.register({name:'conversation.chat.node',key:'ds-project-question-answer'},ProjectQuestionAnswer));
  // Project ownership is separate from native archive state. Keep the native
  // session catalog intact and hide only its ordinary sidebar row occurrences.
  ctx.effect(()=>{
    const style=document.createElement('style');
    style.dataset.dsProjectOwnership='';document.head.append(style);
    let disposed=false,pending=false;
    const controller=new AbortController();
    async function refresh(){
      if(pending||disposed)return;pending=true;
      try{
        const response=await fetch('api/projects',{method:'POST',credentials:'same-origin',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({endpoint:'session-ownership'})});
        const result=await response.json();
        if(!disposed&&response.ok&&result.ok)style.textContent=result.value.map(id=>'[data-row-key="'+CSS.escape('session:'+id)+'"]{display:none!important}').join('\n');
      }catch{/* Preserve the last known ownership during a reconnect. */}
      finally{pending=false;}
    }
    const unsubscribe=ctx.sessions.list.subscribe(refresh);
    const timer=setInterval(refresh,3000);refresh();
    return()=>{disposed=true;controller.abort();clearInterval(timer);unsubscribe();style.remove();};
  },'ds-project: owned sessions sidebar visibility');
  function Projects({SessionProvider,renderSlot}){
    const [shadow,setShadow]=useState(null);
    const [element,setElement]=useState(null);
    useLayoutEffect(()=>{
      if(!element)return;
      const root=element.shadowRoot||element.attachShadow({mode:'open'});
      setShadow(root);
      const update=()=>{element.dataset.theme=ctx.theme.getTheme().active.colorScheme;};
      update();return ctx.on('theme/change',update);
    },[element]);
    return <div ref={setElement} style={{height:'100%',minHeight:0,minWidth:0}} data-ds-project-panel="">
      <style>{conversationCss+projectChromeCss}</style>
      {shadow&&createPortal(<><style>{embeddedCss}</style><App api={api} view={view} native={{element,SessionProvider,renderSlot,sessions:ctx.sessions,blocks:ctx.conversation.blocks,pickDirectory:()=>globalThis.__DSH_DIRECTORY_PICKER__?.pick()??ctx.uiWorkspace.pickDirectory()}}/></>,shadow)}
    </div>;
  }
  ctx.slots.inject('main',()=>ctx.slots.register({name:'main',key:PANEL,children:{'ds-project.conversation':{kind:'single',scope:'session'}}},Projects));
  ctx.slots.inject('ds-project.conversation',()=>ctx.slots.register({name:'ds-project.conversation'},function Conversation({useSession,renderFactorySlot}){
    const loading=useSession(s=>s.openState)==='loading';
    return renderFactorySlot('conversation.content',{variant:'embedded',phase:loading?'settling':'active',hero:false});
  }));
  ctx.slots.inject('conversation.input.dock',()=>ctx.slots.register({name:'conversation.input.dock',id:'ds-project-progress',order:-10},ProjectTodoDock));
  ctx.slots.inject('sidebar.panellist',()=>ctx.slots.register({
    name:'sidebar.panellist',id:PANEL,order:-50,label:'项目'
  },({size})=><Folder size={size}/>));
}
