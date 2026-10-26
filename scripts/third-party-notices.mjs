import {readFileSync,readdirSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,join,dirname,parse} from 'node:path';
const root=process.cwd(),seen=new Set(),entries=[];
function locate(name,from){
  let dir=from;
  while(true){const target=join(dir,'node_modules',name);if(existsSync(join(target,'package.json')))return target;if(dir===parse(dir).root)throw new Error(`Missing dependency: ${name}`);dir=dirname(dir);}
}
function visit(name,from=root){
  const dir=locate(name,from),pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
  const key=`${pkg.name}@${pkg.version}`;if(seen.has(key))return;seen.add(key);
  const files=readdirSync(dir).filter(file=>/^(licen[cs]e|copying|notice)(\..*)?$/i.test(file));
  if(!files.length)throw new Error(`No license notice found: ${key}`);
  entries.push(`## ${key}\n\nLicense: ${pkg.license??'See notice below'}\n\n`+files.map(file=>readFileSync(join(dir,file),'utf8').trim()).join('\n\n'));
  for(const dependency of Object.keys(pkg.dependencies??{}))visit(dependency,dir);
}
// Runtime libraries bundled by the browser and embedded-client builds.
for(const name of ['react','react-dom','lucide-react','react-markdown'])visit(name);
writeFileSync(resolve('THIRD_PARTY_NOTICES.md'),'# Third-party notices\n\nNotices for the open-source runtime libraries used in the compiled UI. DeepSeek Harness is supplied by the host and is not included in this package.\n\n'+entries.sort().join('\n\n---\n\n')+'\n');
console.log(`Collected ${entries.length} dependency notices`);
