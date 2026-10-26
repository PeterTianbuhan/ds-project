import {updateProject,memoryFiles,readMemory,saveMemory,usageView} from './settings.js';
import {libraryList,readLibrary,libraryAction,importLibraryFile} from './library.js';
import {text} from './store.js';

export async function projectRequest(engine, endpoint, b={}) {
  if(endpoint==='session-ownership')return [...new Set(engine.store.data.threads.flatMap(t=>[t.sessionId,...(t.previousSessions||[])]).filter(Boolean))];
  if(endpoint==='state')return engine.store.snapshot();
if(b.projectId&&endpoint!=='project/delete'&&engine.store.project(b.projectId).deleting)throw new Error('项目正在删除');
let result;
        switch('/api/'+endpoint){
          case '/api/projects': result=await engine.createProject(b);break;
          case '/api/project/delete': {
            const p=engine.store.project(b.projectId);
            if(b.confirmName!==p.name)throw new Error('请确认要删除的项目');
            result=await engine.deleteProject(p.id,b.confirmName);break;
          }
          case '/api/project/update':result=await updateProject(engine,b);break;
          case '/api/project/pause':result=await engine.pause(b.projectId,b.paused);break;
          case '/api/project/restart':result=await engine.restartCoordinator(b.projectId);break;
          case '/api/threads/update':result=engine.setThreadsStatus(b.projectId,b.threadIds,b.action);break;
          case '/api/thread/update':result=engine.setThreadStatus(b.projectId,b.threadId,b.action);break;
          case '/api/thread/open':result=await engine.openThread(b.threadId);break;
          case '/api/usage':result=await usageView(engine,b.projectId);break;
          case '/api/library/list':result=libraryList(engine.store.project(b.projectId),b);break;
          case '/api/library/read':result=readLibrary(engine.store.project(b.projectId),{...b,preview:true});break;
          case '/api/library/action':result=libraryAction(engine.store,engine.store.project(b.projectId),b);break;
          case '/api/memory/files':result=memoryFiles(engine.store.project(b.projectId));break;
          case '/api/memory/read':result=readMemory(engine.store.project(b.projectId),b.name);break;
          case '/api/memory/save':result=saveMemory(engine.store,engine.store.project(b.projectId),b);break;
          case '/api/memory/edit':result=await engine.send(engine.store.project(b.projectId).mainThreadId,'请更新项目共享记忆：'+text(b.text,'记忆修改要求',4000),b.requestId);break;
          case '/api/launch': result=await engine.launch(b.projectId,b);break;
          case '/api/send':result=await engine.send(b.threadId,b.text,b.requestId);break;
          case '/api/stop':await engine.stop(b.threadId);result={ok:true};break;
          case '/api/artifact':result=engine.artifact(b.threadId,b.path);break;
          case '/api/memory/add':result=engine.store.memory(b.projectId,b.text,{type:'user',title:'用户确认'},true);break;
          case '/api/memory/decide':result=engine.store.decideMemory(b.projectId,b.id,b.status,b.revision);break;
          case '/api/files/import':result=importLibraryFile(engine.store,engine.store.project(b.projectId),b.name,b.base64);break;
          case '/api/files':result=engine.addFile(b.projectId,b.name,b.content,b.description);break;
          default:throw new Error('Not found');
        }

  return result;
}

export function registerProjectApi(ctx, engine) {
  return ctx.connection.fetch.register({
    path:'/api/projects',methods:['POST'],requestBody:'buffered',
    async fetch(request) {
      try {
        const raw=await request.text();
        if(raw.length>12*1024*1024)throw new Error('请求内容太大');
        const {endpoint,payload}=JSON.parse(raw);
        if(typeof endpoint!=='string')throw new Error('无效操作');
        const value=await projectRequest(engine,endpoint,payload??{});
        return Response.json({ok:true,value});
      } catch(error) {
        return Response.json({ok:false,error:String(error.message||error)},{status:400});
      }
    }
  });
}
