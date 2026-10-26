import {mkdirSync,readFileSync,writeFileSync,readdirSync,statSync,lstatSync,realpathSync,existsSync,renameSync,rmSync} from 'node:fs';
import {join,dirname,basename,resolve,sep,isAbsolute,extname} from 'node:path';
import {uid,now,text} from './store.js';
export function relativeName(value,empty=false){
  if(empty&&value==='')return '';
  const name=text(value,'文件路径',500);
  if(name!==value||isAbsolute(name)||name.includes('\\')||name.includes('\0')||name.split('/').some(s=>!s||s==='.'||s==='..'||s.length>120))throw new Error('无效文件路径');
  return name;
}
// Walk each component. Never traverse symlinks, even ones pointing inside the root.
export function within(root,name='',missing=false){
  name=relativeName(name,true);if(lstatSync(root).isSymbolicLink())throw new Error('目录不能是符号链接');const base=realpathSync(root),dest=resolve(base,name);
  if(dest!==base&&!dest.startsWith(base+sep))throw new Error('文件不属于此目录');
  let current=base;
  for(const part of name.split('/').filter(Boolean)){current=join(current,part);try{if(lstatSync(current).isSymbolicLink())throw new Error('不能通过符号链接访问文件');}catch(e){if(e.code==='ENOENT'&&missing)continue;throw e;}}
  return dest;
}
export function libraryRoot(p){const root=join(p.cwd,'library');mkdirSync(root,{recursive:true});if(lstatSync(root).isSymbolicLink())throw new Error('资料目录不能是符号链接');return root;}
export function migrateLibrary(p){
  const root=libraryRoot(p);
  if(!p.libraryVersion){
    for(const f of p.files){let rel=f.kind==='output'?'Artifacts/'+f.name:f.name;relativeName(rel);if(existsSync(join(root,rel)))rel=f.id.slice(0,8)+'-'+f.name;
      const target=within(root,rel,true);mkdirSync(dirname(target),{recursive:true});
      if(f.path&&existsSync(f.path)&&resolve(f.path).startsWith(realpathSync(root)+sep)&&!lstatSync(f.path).isSymbolicLink())renameSync(f.path,target);
      else writeFileSync(target,f.content||'',{mode:0o600});
      f.relativePath=rel;f.path=target;
    }p.libraryVersion=1;
  }
  mkdirSync(within(root,'Artifacts',true),{recursive:true});p.mounts||=[];p.links||=[];
}
export function referenceEntry(input){
  const value=text(input,'本机路径',4000);if(!isAbsolute(value))throw new Error('请输入绝对路径');
  const path=realpathSync(value),s=statSync(path);if(!s.isFile()&&!s.isDirectory())throw new Error('请选择普通文件或文件夹');
  return {id:uid(),name:basename(path),path,type:s.isDirectory()?'folder':'file',createdAt:now()};
}
function mountFor(p,id){
  if(id==='workspace'&&p.base)return {id,name:basename(p.base),path:p.base,type:'folder',workspace:true};
  const mount=p.mounts.find(x=>x.id===id);if(id&&!mount)throw new Error('资料引用不存在');return mount;
}
export function libraryList(p,{path='',mountId}={}){
  migrateLibrary(p);const mount=mountFor(p,mountId);
  if(path==='Links'&&!mount)return {path,entries:p.links.map(l=>({...l,type:'link',relativePath:l.id})),total:p.links.length};
  const root=mount?mount.path:libraryRoot(p),dir=within(root,path);
  if(!statSync(dir).isDirectory())throw new Error('不是文件夹');
  const items=readdirSync(dir,{withFileTypes:true});
  const entries=items.filter(e=>!e.isSymbolicLink()).slice(0,2000).flatMap(e=>{
    try{const rel=path?path+'/'+e.name:e.name,s=statSync(within(root,rel));return [{name:e.name,relativePath:rel,type:s.isDirectory()?'folder':'file',size:s.isDirectory()?null:s.size,updatedAt:s.mtime.toISOString(),mountId}];}catch{return [];}
  });
  if(!path&&!mount){
    entries.push({name:'Links',relativePath:'Links',type:'folder',virtual:true});
    const mounts=[...p.base?[mountFor(p,'workspace')]:[],...p.mounts];
    for(const m of mounts){let info;try{info=statSync(m.path);}catch{}entries.push({name:m.name,relativePath:'',mountId:m.id,type:(m.type||'folder')==='folder'?'mount':'file',path:m.path,reference:true,workspace:m.workspace,size:info?.isFile()?info.size:null,updatedAt:info?.mtime.toISOString()});}
  }
  return {path,mountId,entries,total:entries.length,truncated:items.length>2000};
}
export function readLibrary(p,{path='',mountId,preview=false}={}){
  migrateLibrary(p);const mount=mountFor(p,mountId);
  const file=within(mount?mount.path:libraryRoot(p),path),s=statSync(file);
  if(!s.isFile())throw new Error('不是普通文件');
  const result={name:basename(file),path:file,size:s.size,kind:'binary'};
  if(s.size>8*1024*1024)return result;
  const bytes=readFileSync(file),ext=extname(file).toLowerCase();
  const mime={'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.avif':'image/avif'}[ext];
  if(mime){if(preview)Object.assign(result,{kind:'image',dataUrl:'data:'+mime+';base64,'+bytes.toString('base64')});return result;}
  if(bytes.length<=500000&&!bytes.includes(0))try{result.content=new TextDecoder('utf-8',{fatal:true}).decode(bytes);result.kind='text';return result;}catch{}
  if(preview)result.base64=bytes.toString('base64');return result;
}
export function importLibraryFile(store,p,name,base64){
  migrateLibrary(p);name=relativeName(name);
  if(name==='Links'||name.startsWith('Links/'))throw new Error('Links 用于保存链接');
  if(typeof base64!=='string'||base64.length>12*1024*1024||!/^[A-Za-z0-9+/]*={0,2}$/.test(base64))throw new Error('文件内容无效');
  const bytes=Buffer.from(base64,'base64');if(bytes.toString('base64')!==base64)throw new Error('文件内容无效');if(bytes.length>8*1024*1024)throw new Error('单个导入文件最多 8 MB，大文件可添加本机引用');
  if(p.files.length>=500)throw new Error('最多添加 500 份资料');
  const target=within(libraryRoot(p),name,true);if(existsSync(target))throw new Error('已有同名文件');
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes,{flag:'wx',mode:0o600});
  const f={id:uid(),name:basename(name),relativePath:name,path:target,createdAt:now(),size:bytes.length};p.files.push(f);store.save();return f;
}
export function addLibraryFile(store,p,name,content,description=''){
  migrateLibrary(p);name=relativeName(name);content=text(content,'资料内容',150000);if(content.includes('\0'))throw new Error('请选择文本文件');
  if(p.files.length>=500)throw new Error('最多添加 500 份资料');
  if(name==='Links'||name.startsWith('Links/'))throw new Error('Links 用于保存链接');
  const target=within(libraryRoot(p),name,true);if(existsSync(target))throw new Error('已有同名文件，请重命名后添加');
  mkdirSync(dirname(target),{recursive:true});writeFileSync(target,content,{mode:0o600,flag:'wx'});
  const f={id:uid(),name:basename(name),relativePath:name,content,description,createdAt:now(),path:target};p.files.push(f);store.save();return f;
}
export function libraryAction(store,p,b){
  migrateLibrary(p);const root=libraryRoot(p);
  if(b.action==='link-folder'||b.action==='link-path'){
    const entry=referenceEntry(b.path);
    if(b.action==='link-folder'&&entry.type!=='folder')throw new Error('不是文件夹');
    if(p.mounts.some(m=>m.path===entry.path))throw new Error('这个路径已经添加');p.mounts.push(entry);
  }else if(b.action==='unlink-folder'){
    if(!p.mounts.some(m=>m.id===b.mountId))throw new Error('关联文件夹不存在');p.mounts=p.mounts.filter(m=>m.id!==b.mountId);
  }else if(b.action==='add-link'){
    const url=new URL(text(b.url,'链接',4000));if(!['https:','http:'].includes(url.protocol))throw new Error('仅支持网页链接');p.links.push({id:uid(),name:text(b.name,'名称',120),url:url.href,updatedAt:now()});
  }else if(b.action==='delete-link'){
    const link=p.links.find(l=>l.id===b.id);if(!link||b.confirmName!==link.name)throw new Error('请确认删除链接');p.links=p.links.filter(l=>l.id!==b.id);
  }else{
    if(b.mountId)throw new Error('关联的本机文件夹仅供读取');
    const name=relativeName(b.path);if(name==='Links'||name==='Artifacts')throw new Error('不能修改系统分类文件夹');
    const dest=within(root,name,b.action==='mkdir');
    if(b.action==='mkdir'){mkdirSync(dest,{recursive:true});}
    else if(b.action==='delete'){
      if(b.confirmName!==basename(name))throw new Error('请确认删除');rmSync(dest,{recursive:true});p.files=p.files.filter(f=>f.relativePath!==name&&!f.relativePath?.startsWith(name+'/'));
    }else if(b.action==='rename'){
      const next=relativeName(b.to);if(next==='Links'||next.startsWith('Links/'))throw new Error('Links 用于保存链接');const target=within(root,next,true);if(existsSync(target))throw new Error('目标已经存在');mkdirSync(dirname(target),{recursive:true});renameSync(dest,target);
      for(const f of p.files)if(f.relativePath===name||f.relativePath?.startsWith(name+'/')){f.relativePath=next+f.relativePath.slice(name.length);f.name=basename(f.relativePath);f.path=join(root,f.relativePath);}
    }else throw new Error('未知资料操作');
  }
  store.save();return {ok:true};
}
