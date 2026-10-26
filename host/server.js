import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {projectRequest} from './api.js';

let packageRoot=dirname(fileURLToPath(import.meta.url));
while(!existsSync(join(packageRoot,'package.json')) && dirname(packageRoot)!==packageRoot)packageRoot=dirname(packageRoot);
const root=join(packageRoot,'dist');
export function startServer(engine,port=43821) {
  const token=randomBytes(32).toString('hex');
  const server=createServer(async(req,res)=>{
    const host=`127.0.0.1:${server.address()?.port}`;
    const send=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    if(req.headers.host!==host || (req.headers.origin && req.headers.origin!==`http://${host}`))return send(403,{error:'Origin refused'});
    try {
      const url=new URL(req.url,`http://${host}`);
      if(url.pathname.startsWith('/api/')) {
        if(req.headers.authorization!==`Bearer ${token}`)return send(401,{error:'请从 DS Project 启动器重新打开'});
        if(req.method==='GET' && url.pathname==='/api/state')return send(200,engine.store.snapshot());
        if(req.method!=='POST')return send(405,{error:'Method not allowed'});
        const chunks=[];let size=0;
        for await(const chunk of req){size+=chunk.length;if(size>12*1024*1024)throw new Error('请求内容太大');chunks.push(chunk);}
        const b=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');
        const result=await projectRequest(engine,url.pathname.slice(5),b);
        return send(200,result);
      }
      if(req.method!=='GET')return send(405,{error:'Method not allowed'});
      const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
      if(!path.startsWith(root+sep)||!existsSync(path))return send(404,{error:'Not found'});
      const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
      res.writeHead(200,{'Content-Type':types[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(readFileSync(path));
    }catch(e){send(400,{error:String(e.message||e)});}
  });
  server.once('error',e=>{if(e.code==='EADDRINUSE')server.listen(0,'127.0.0.1');else console.error('DS Project server:',e.message);});
  server.on('listening',()=>{
    writeFileSync(join(engine.store.home,'connection.json'),JSON.stringify({url:`http://127.0.0.1:${server.address().port}`,token,pid:process.pid,startedAt:new Date().toISOString()}),{mode:0o600});
    console.info(`DS Project listening on 127.0.0.1:${server.address().port}`);
  });
  server.listen(port,'127.0.0.1');return server;
}
