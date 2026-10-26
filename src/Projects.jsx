import React,{useEffect,useRef,useState} from 'react';
import {Folder,GraduationCap,Hammer,Coffee,House,Code,BookOpen,Search,Plus,X,Ellipsis,Pin,Trash2,FileText,ChevronDown} from 'lucide-react';

import {WorkspaceField} from './WorkspaceField.jsx';
import {ProjectIcon,IconPicker} from './Icons.jsx';
export {ProjectIcon} from './Icons.jsx';
export function ProjectBrowser({projects,threads,onOpen,onNew,onDelete,act}){
  const [searching,setSearching]=useState(false),[query,setQuery]=useState(''),[sort,setSort]=useState('created'),[menu,setMenu]=useState(null),[error,setError]=useState('');
  const activity=p=>threads.filter(t=>t.projectId===p.id).reduce((at,t)=>t.updatedAt>at?t.updatedAt:at,p.createdAt);
  const visible=projects.filter(p=>p.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'zh-CN'):sort==='updated'?activity(b).localeCompare(activity(a)):b.createdAt.localeCompare(a.createdAt));
  const pinned=visible.filter(p=>p.pinned),others=visible.filter(p=>!p.pinned);
  async function pin(p){setMenu(null);try{await act('project/update',{projectId:p.id,pinned:!p.pinned});}catch(e){setError(e.message);}}
  const cards=items=><div className="project-grid">{items.map(p=><article className="project-card" key={p.id}>
    <button className="project-card-open" onClick={()=>onOpen(p.id)}><ProjectIcon project={p}/><span><strong>{p.name}</strong><time>{new Date(p.createdAt).toLocaleDateString('zh-CN',{month:'short',day:'numeric'})}</time></span></button>
    <button className="icon card-menu-trigger" aria-label={`${p.name}的更多操作`} aria-expanded={menu===p.id} onClick={()=>setMenu(menu===p.id?null:p.id)}><Ellipsis size={18}/></button>
    {menu===p.id&&<><button className="card-menu-dismiss" aria-label="关闭项目操作" onClick={()=>setMenu(null)}/><div className="card-menu" role="menu"><button role="menuitem" onClick={()=>pin(p)}><Pin size={15}/>{p.pinned?'取消置顶':'置顶项目'}</button><button role="menuitem" className="danger-text" onClick={()=>{setMenu(null);onDelete(p);}}><Trash2 size={15}/>删除项目</button></div></>}
  </article>)}</div>;
  return <section className="projects-page"><div className="projects-page-inner"><header className="projects-toolbar"><h1>Projects</h1><div className="projects-actions">{searching?<input autoFocus aria-label="搜索项目" placeholder="搜索项目" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Escape'){setSearching(false);setQuery('');}}}/>:<button className="icon" aria-label="搜索项目" onClick={()=>setSearching(true)}><Search size={20}/></button>}<label className="project-sort"><span>排序</span><select aria-label="项目排序" value={sort} onChange={e=>setSort(e.target.value)}><option value="created">创建时间</option><option value="updated">最近活动</option><option value="name">名称</option></select></label><button className="primary new-project" onClick={onNew}>新建项目</button></div></header>
    {error&&<p role="alert" className="form-error">{error}</p>}
    {!!pinned.length&&<section className="projects-group"><h2>置顶</h2>{cards(pinned)}</section>}
    {!!others.length&&<section className="projects-group"><h2>{pinned.length?'其他项目':'全部项目'}</h2>{cards(others)}</section>}
    {!visible.length&&<div className="projects-empty">{query?'没有匹配的项目':'创建一个项目，把对话、资料和正在推进的事放在一起。'}</div>}
  </div></section>;
}
export function Dialog({title,children,onClose,busy=false,className=''}){
  const ref=useRef(null);
  useEffect(()=>{const old=ref.current?.getRootNode().activeElement;(ref.current?.querySelector('input:not([type=file])')||ref.current?.querySelector('button'))?.focus();return()=>old?.focus();},[]);
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><section ref={ref} className={'modal project-dialog '+className} role="dialog" aria-modal="true" aria-label={title} onKeyDown={e=>{
    if(e.key==='Escape'&&!busy)onClose();
    if(e.key==='Tab'){const els=[...e.currentTarget.querySelectorAll('button:not(:disabled),input:not([type=file]),textarea,select')].filter(x=>x.getClientRects().length);const active=e.currentTarget.getRootNode().activeElement;if(e.shiftKey&&active===els[0]){e.preventDefault();els.at(-1)?.focus();}else if(!e.shiftKey&&active===els.at(-1)){e.preventDefault();els[0]?.focus();}}
  }}><header><h2>{title}</h2><button className="icon" aria-label="关闭" disabled={busy} onClick={onClose}><X size={22}/></button></header>{children}</section></div>;
}
export function NewProjectDialog({act,onClose,onCreated,native}){
  const [name,setName]=useState(''),[goal,setGoal]=useState(''),[base,setBase]=useState(''),[icon,setIcon]=useState('folder'),[color,setColor]=useState('blue'),[picking,setPicking]=useState(false),[references,setReferences]=useState([]),[adding,setAdding]=useState(false),[refPath,setRefPath]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  async function submit(e){e.preventDefault();if(!name.trim()||!base.trim()||busy)return;setBusy(true);setError('');try{const p=await act('projects',{name,description:goal,icon,color,base,references:[...references,...refPath.trim()?[refPath.trim()]:[]]});onCreated(p.id);}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <Dialog title="新建项目" onClose={onClose} busy={busy}><form onSubmit={submit}>
    <label htmlFor="project-name">名称</label><div className="project-name-field"><button type="button" className="project-icon-picker" aria-label="选择项目图标" aria-expanded={picking} onClick={()=>setPicking(!picking)}><ProjectIcon project={{icon,color}} size={20}/></button><input id="project-name" autoFocus required maxLength={100} placeholder="给这个项目一个名字" value={name} onChange={e=>setName(e.target.value)}/></div>
    {picking&&<IconPicker icon={icon} color={color} onChange={(i,c)=>{setIcon(i);setColor(c);}}/>}
    <label className="goal-label" htmlFor="project-goal">目标 <span>（可选）</span></label><textarea id="project-goal" rows={3} maxLength={8000} value={goal} onChange={e=>setGoal(e.target.value)}/>
    <WorkspaceField value={base} onChange={setBase} pickDirectory={native?.pickDirectory} disabled={busy}/>
    <section className="project-context"><header><span>资料引用 <small>（可选）</small></span><button type="button" className="icon" aria-label="添加资料引用" onClick={()=>setAdding(true)}><Plus size={20}/></button></header>
    {references.map((path,i)=><div className="context-file" key={i}><FileText size={16}/><span>{path}</span><button type="button" className="icon" aria-label={`移除 ${path}`} onClick={()=>setReferences(v=>v.filter((_,j)=>j!==i))}><X size={15}/></button></div>)}
    {adding?<div className="reference-input"><input aria-label="资料文件或文件夹路径" placeholder="文件或文件夹的绝对路径" value={refPath} onChange={e=>setRefPath(e.target.value)}/><button type="button" disabled={!refPath.trim()} onClick={()=>{setReferences(v=>[...v,refPath.trim()]);setRefPath('');}}>添加</button></div>:<p className="setting-description">可以引用任意类型的本机文件或文件夹，也可以创建后在 Library 导入。</p>}</section>
    {error&&<p role="alert" className="form-error">{error}</p>}<footer><button type="button" disabled={busy} onClick={onClose}>取消</button><button className="primary" disabled={!name.trim()||!base.trim()||busy}>{busy?'创建中…':'创建项目'}</button></footer>
  </form></Dialog>;
}
export function DeleteProjectDialog({project,threads,act,onClose,onDeleted}){
  const [busy,setBusy]=useState(false),[error,setError]=useState('');
  async function remove(){setBusy(true);try{await act('project/delete',{projectId:project.id,confirmName:project.name});onDeleted();}catch(e){setError(e.message);setBusy(false);}}
  return <Dialog title={`删除「${project.name}」？`} onClose={onClose} busy={busy} className="delete-project-dialog"><p>将永久删除这个项目的 {threads.filter(t=>t.projectId===project.id).length} 个会话、共享记忆、导入资料及插件内部数据。正在执行的任务会停止。</p><p>你选择的工作目录和引用的原始文件会保留。</p><p><strong>删除后无法恢复。</strong></p><small>DSH 底层运行日志不在删除范围内。</small>{error&&<p role="alert" className="form-error">{error}</p>}<footer><button disabled={busy} onClick={onClose}>取消</button><button className="danger" disabled={busy} onClick={remove}>{busy?'正在删除…':'删除项目'}</button></footer></Dialog>;
}
