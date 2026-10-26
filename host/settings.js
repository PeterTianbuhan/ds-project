import {mkdirSync,readdirSync,readFileSync,writeFileSync,statSync,existsSync,lstatSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {checkAppearance} from './appearance.js';
import {within,relativeName} from './library.js';
import {text} from './store.js';
export async function updateProject(engine,b){
  const p=engine.store.project(b.projectId),patch={};
  for(const [key,max] of [['name',100],['description',8000],['instructions',16000]])if(b[key]!==undefined){if(typeof b[key]!=='string'||b[key].length>max||(key==='name'&&!b[key].trim()))throw new Error('无效'+key);patch[key]=b[key];}
  if(b.icon!==undefined||b.color!==undefined){checkAppearance(b.icon??p.icon??'folder',b.color??p.color??'blue');patch.icon=b.icon??p.icon??'folder';patch.color=b.color??p.color??'blue';}
  for(const key of ['archived','pinned','autoContinue'])if(b[key]!==undefined){if(typeof b[key]!=='boolean')throw new Error('无效设置');patch[key]=b[key];}
  if(b.coordinatorModel!==undefined||b.threadModel!==undefined)throw new Error('请在会话输入框旁选择模型');
  if(b.base!==undefined)await engine.setBase(p.id,b.base);
  Object.assign(p,patch);engine.store.save();return {ok:true};
}
export function memoryRoot(p){const dir=join(p.cwd,'memory');mkdirSync(dir,{recursive:true});if(lstatSync(dir).isSymbolicLink())throw new Error('记忆目录不能是符号链接');return dir;}
export function syncMemory(p){if(!p.cwd)return;writeFileSync(within(memoryRoot(p),'MEMORY.md',true),p.memories.filter(m=>m.status==='confirmed').map(m=>m.text).join('\n\n'),{mode:0o600});}
export function memoryFiles(p){
  const root=memoryRoot(p);if(!existsSync(join(root,'MEMORY.md')))syncMemory(p);
  return readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&e.name.endsWith('.md')).map(e=>{const s=statSync(within(root,e.name));return {name:e.name,size:s.size,updatedAt:s.mtime.toISOString(),description:e.name==='MEMORY.md'?p.name:''};});
}
export function readMemory(p,name){memoryFiles(p);const file=within(memoryRoot(p),relativeName(name));if(statSync(file).size>100000)throw new Error('记忆文件过大');return {name,content:readFileSync(file,'utf8')};}
export function saveMemory(store,p,{name,content,remove=false,confirmName}){
  relativeName(name);if(name.includes('/')||!name.endsWith('.md'))throw new Error('请使用 .md 文件名');const file=within(memoryRoot(p),name,true);
  if(remove){if(name==='MEMORY.md')throw new Error('可清空主记忆，不能删除主记忆文件');if(confirmName!==name)throw new Error('请确认删除');rmSync(file);}
  else{if(typeof content!=='string'||content.length>16000||content.includes('\0'))throw new Error('记忆最多 16000 字符');
    writeFileSync(file,content,{mode:0o600});
    if(name==='MEMORY.md'){for(const m of p.memories)if(m.status==='confirmed'){m.status='removed';m.revision++;}if(content.trim())store.memory(p.id,content,{type:'user',title:'Memory 编辑'},true);}
  }store.save();return {ok:true};
}
export async function usageView(engine,projectId){
  const threads=engine.store.data.threads.filter(t=>t.projectId===projectId);engine.store.project(projectId);
  const rows=[];
  // Read only this project's session projections, never start or resolve an Agent.
  for(const t of threads){let usage={input:0,output:0,cacheRead:0,cacheWrite:0},available=true,error;
    for(const id of [...(t.previousSessions||[]),t.sessionId].filter(Boolean))try{const value=await engine.adapter.usage?.(id);if(!value){available=false;continue;}for(const k of Object.keys(usage))usage[k]+=value[k]||0;}catch(e){available=false;error=e.message;}
    if(t.sessionId&&!engine.adapter.usage)available=false;
    rows.push({id:t.id,title:t.title,kind:t.kind,model:t.model,updatedAt:t.updatedAt,...usage,total:Object.values(usage).reduce((a,b)=>a+b,0),available,error});
  }
  const totals={input:0,output:0,cacheRead:0,cacheWrite:0};for(const r of rows)for(const k of Object.keys(totals))totals[k]+=r[k];
  return {rows,totals,total:Object.values(totals).reduce((a,b)=>a+b,0),complete:rows.every(r=>r.available),at:new Date().toISOString()};
}
