import React,{useEffect,useRef,useState} from 'react';
import Markdown from 'react-markdown';
import {ThreadActions} from './ThreadActions.jsx';
import {ThreadList,ThreadRunning} from './ThreadList.jsx';
import {ResizeDivider} from './ResizeDivider.jsx';
import {NativeConversation} from './NativeConversation.jsx';
import {ProjectSettings} from './ProjectSettings.jsx';
import {LibraryPane} from './Library.jsx';
import {ProjectIcon} from './Icons.jsx';
import {ProjectBrowser,NewProjectDialog,DeleteProjectDialog,Dialog} from './Projects.jsx';
import {Plus,ArrowLeft,BookOpen,X,RefreshCw,ListTodo} from 'lucide-react';
export function App({api,view={},native}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[connected,setConnected]=useState(false),[projectId,setProjectId]=useState(localStorage.getItem('ds-project-selected')),[overview,setOverview]=useState(view.overview??true),[panel,setPanel]=useState(view.panel||'threads'),[threadId,setThreadId]=useState(view.threadId??null),[modal,setModal]=useState(null);
  useEffect(()=>{Object.assign(view,{overview,panel,threadId});},[overview,panel,threadId]);
  const [libraryExpanded,setLibraryExpanded]=useState(false),[libraryAdding,setLibraryAdding]=useState(0);
  const [screen,setScreen]=useState(view.screen||'projects');
  useEffect(()=>{view.screen=screen;},[screen]);
  const [splitRatio,setSplitRatio]=useState(()=>{try{const value=Number(localStorage.getItem('ds-project-split-ratio'));return value>=.2&&value<=.8?value:.55;}catch{return .55;}});
  const ratio=panel==='library'&&libraryExpanded?1/3:splitRatio;
  function resizeSplit(value){setLibraryExpanded(false);setSplitRatio(value);try{localStorage.setItem('ds-project-split-ratio',String(value));}catch{}}
  const latest=useRef(0);
  async function refresh(){try{const d=await api('state');if(d.revision>=latest.current){latest.current=d.revision;setData(d);}setConnected(true);}catch(e){setConnected(false);setError(e.message);}}
  useEffect(()=>{refresh();const timer=setInterval(refresh,1200);return()=>clearInterval(timer);},[]);
  const projects=data?.projects.filter(p=>!p.archived)||[],p=projects.find(p=>p.id===projectId)||projects[0];
  const threads=data?.threads.filter(t=>t.projectId===p?.id)||[],tasks=threads.filter(t=>t.kind!=='main'),main=threads.find(t=>t.id===p?.mainThreadId),detail=tasks.find(t=>t.id===threadId);
  const waiting=tasks.some(t=>['waiting','approval','failed'].includes(t.status));
  useEffect(()=>{if(p)localStorage.setItem('ds-project-selected',p.id);},[p?.id]);
  async function act(path,body){setError('');try{const r=await api(path,body);await refresh();return r;}catch(e){setError(e.message);throw e;}}
  const safe=(path,body)=>act(path,body).catch(()=>{});
  function openTask(id){setThreadId(id);setOverview(true);setPanel('threads');}
  function chooseProject(id){setProjectId(id);setThreadId(null);setScreen('conversation');}
  function showPanel(next){setThreadId(null);setPanel(next);setOverview(v=>panel===next&&!detail?!v:true);}
  if(!data)return <div className="loading"><div className="brand">DS Project</div><p>{error||'正在连接…'}</p><button onClick={refresh}><RefreshCw size={15}/>重新连接</button><small>请确认 DSH 已连接，且项目插件已启用。</small></div>;
  const dialog=modal?.type==='project'?<NewProjectDialog native={native} act={act} onClose={()=>setModal(null)} onCreated={id=>{chooseProject(id);setModal(null);}}/>:modal?.type==='delete'?<DeleteProjectDialog project={modal.project} threads={data.threads} act={act} onClose={()=>setModal(null)} onDeleted={()=>{setModal(null);setScreen('projects');setProjectId(null);}}/>:null;
  if(screen==='projects')return <><ProjectBrowser projects={projects} threads={data.threads} onOpen={chooseProject} onNew={()=>setModal({type:'project'})} onDelete={project=>setModal({type:'delete',project})} act={act}/>{dialog}</>;
  return <div style={overview&&p?{gridTemplateColumns:`minmax(280px,${ratio}fr) 7px minmax(280px,${1-ratio}fr)`}:undefined} className={'workspace '+(overview&&p?'with-overview':'')+(overview&&panel==='library'&&libraryExpanded?' library-expanded':'')}>
    <main id="project-main" className="main">
      <header className="project-header"><button className="icon" aria-label="返回项目列表" onClick={()=>setScreen('projects')}><ArrowLeft size={19}/></button><button className="project-title" aria-label="项目设置" title="项目设置" onClick={()=>setModal({type:'settings'})}>{p&&<ProjectIcon project={p} size={18}/>}<span>{p?.name||'DS Project'}</span></button><div className="header-actions">{!connected&&<span className="connection-error">已断开</span>}{p&&<><button className={'icon '+(overview&&panel==='threads'?'selected':'')} aria-label="线程概览" title="线程概览" onClick={()=>showPanel('threads')}><ListTodo size={20}/>{waiting&&<i className="attention-dot"/>}</button><button className={'icon '+(overview&&panel==='library'?'selected':'')} aria-label="资料库" title="资料库" onClick={()=>showPanel('library')}><BookOpen size={19}/></button></>}</div></header>
      {error&&<div role="alert" className="error-banner"><span>{error}</span><button className="icon" aria-label="关闭提示" onClick={()=>setError('')}><X size={16}/></button></div>}
      {p?.paused&&<div className="project-paused">项目已暂停，主对话消息会等待恢复后处理。<button onClick={()=>safe('project/pause',{projectId:p.id,paused:false})}>恢复</button></div>}
      {p?<NativeConversation key={main?.id+':'+main?.sessionId} thread={main} threads={threads} onOpenThread={openTask} paused={p.paused} api={api} native={native}/>:<div className="welcome"><h1>从一个项目开始</h1><button onClick={()=>setModal({type:'project'})}><Plus size={16}/>新建项目</button></div>}
    </main>
    {p&&overview&&<ResizeDivider ratio={ratio} onResize={resizeSplit}/>}
    {p&&overview&&<aside id="project-overview" className="overview">
      <header className="overview-header">{detail?<><button className="icon" aria-label="返回线程列表" onClick={()=>setThreadId(null)}><ArrowLeft size={18}/></button><span className="thread-detail-title">{detail.title}</span><ThreadRunning thread={detail}/><ThreadActions thread={detail} act={act} shortcut/></>:<span>{panel==='library'?'Library':'Threads'}</span>}<button className="icon close-overview" aria-label="关闭概览" onClick={()=>setOverview(false)}><X size={19}/></button></header>
      {detail?<NativeConversation key={detail.id+':'+detail.sessionId} thread={detail} threads={threads} onOpenThread={openTask} api={api} native={native}/>:panel==='library'?<LibraryPane native={native} addRequest={libraryAdding} key={p.id} project={p} api={api} act={act} onRead={file=>setModal({type:'readfile',file})} expanded={libraryExpanded} onExpand={()=>setLibraryExpanded(!libraryExpanded)}/>:<ThreadList key={p.id} tasks={tasks} projectId={p.id} act={act} onOpen={openTask}/>}
    </aside>}
    {dialog}
    {modal?.type==='settings'&&<ProjectSettings native={native} project={p} threads={threads} api={api} act={act} onClose={()=>setModal(null)}/>}
    {modal&&!['project','delete','settings'].includes(modal.type)&&<Modal key={modal.type+(modal.file?.id||'')} modal={modal} project={p} close={()=>setModal(null)} act={act} onProject={chooseProject}/>}
  </div>;
}
function FilePreview({file}){
  const download=()=>{const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0)),url=URL.createObjectURL(new Blob([bytes],{type:'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=file.name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  return <>{file.kind==='image'?<img className="file-preview-image" src={file.dataUrl} alt={file.name}/>:file.content!==undefined?<Markdown>{file.content}</Markdown>:<><p>{file.name} · {file.size?.toLocaleString()} 字节</p><p>这个文件类型不提供内嵌预览，资料已保留。</p>{file.base64&&<button onClick={download}>下载文件</button>}</>}<small>{file.path}</small></>;
}
function Modal({modal,close}){
  return <Dialog title={modal.file?.name||'资料'} onClose={close}><div className="file-reading"><FilePreview file={modal.file}/></div></Dialog>;
}
