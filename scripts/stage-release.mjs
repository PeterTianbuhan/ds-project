import {readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const dir=`runtime/v${pkg.version}`;
mkdirSync(dir,{recursive:true});cpSync('index.js',`${dir}/index.js`);cpSync('host',`${dir}/host`,{recursive:true});cpSync('dist-client/client.js',`${dir}/client.js`);
pkg.main=`${dir}/index.js`;pkg.exports['.']=`./${dir}/index.js`;pkg.exports['./client']=`./${dir}/client.js`;pkg.files=[dir,'dist','cordis.patch.yml','README.md','LICENSE','THIRD_PARTY_NOTICES.md'];
writeFileSync('package.json',JSON.stringify(pkg,null,2)+'\n');
