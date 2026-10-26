import React from 'react';
import {createRoot} from 'react-dom/client';
import {App} from './App.jsx';
import './style.css';
const hash=new URLSearchParams(location.hash.slice(1));
if(hash.has('token')){sessionStorage.setItem('ds-project-token',hash.get('token'));history.replaceState(null,'',location.pathname);}
async function api(path,body){const r=await fetch('/api/'+path,{method:path==='state'?'GET':'POST',headers:{Authorization:'Bearer '+sessionStorage.getItem('ds-project-token'),'Content-Type':'application/json'},body:path==='state'?undefined:JSON.stringify(body||{})});const result=await r.json();if(!r.ok)throw new Error(result.error||'请求失败');return result;}
createRoot(document.getElementById('root')).render(<App api={api}/>);
