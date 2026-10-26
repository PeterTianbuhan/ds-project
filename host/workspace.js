import {realpathSync,statSync} from 'node:fs';
import {isAbsolute,join,sep} from 'node:path';
export function workspacePath(value,home){
  if(typeof value!=='string'||!value.trim()||!isAbsolute(value)||value.includes('\0'))throw new Error('请选择工作目录，或填写绝对路径');
  const path=realpathSync(value);
  const managed=home?join(realpathSync(home),'workspaces'):null;
  if(managed&&(path===managed||path.startsWith(managed+sep)))throw new Error('请选择自己的项目文件夹，不能把插件内部数据目录设为工作目录');
  if(!statSync(path).isDirectory())throw new Error('工作目录必须是文件夹');
  return path;
}
