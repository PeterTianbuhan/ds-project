import React,{useState} from 'react';
import {FolderOpen} from 'lucide-react';
export function WorkspaceField({value,onChange,pickDirectory,disabled=false}){
  const [error,setError]=useState(''),[picking,setPicking]=useState(false);
  async function pick(){setPicking(true);setError('');try{const path=await pickDirectory();if(path)onChange(path);}catch(e){setError(e.message);}finally{setPicking(false);}}
  return <div className="workspace-field"><label htmlFor="project-base">工作目录</label><div className="workspace-path"><input id="project-base" aria-label="工作目录" value={value} onChange={e=>onChange(e.target.value)} placeholder="/Users/…/项目文件夹" disabled={disabled||picking}/>{pickDirectory&&<button type="button" disabled={disabled||picking} onClick={pick}><FolderOpen size={17}/>选择文件夹</button>}</div><p className="setting-description">主会话和子会话都在这个目录工作，使用 DSH 原生工作区权限。</p>{error&&<p className="form-error">{error}</p>}</div>;
}
