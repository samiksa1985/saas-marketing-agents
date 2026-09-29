import { spawnSync } from 'node:child_process';

const image = process.argv[2];
if (!image) throw new Error('Pass an immutable image reference to verify');

const scan = String.raw`const fs=require('node:fs');const path=require('node:path');const root='/workspace';const forbidden=/(^|\/)(?:\.env(?:$|\.)|\.npmrc|\.git-credentials|\.aws|secrets|credentials|id_rsa|id_ed25519|credentials\.json)$|\.(?:pem|key|p12|pfx|jks|crt|cer|p8)$/i;const visit=(dir)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const item=path.join(dir,entry.name);const rel=path.relative(root,item).replaceAll(path.sep,'/');if(forbidden.test(rel))throw new Error('Forbidden secret-like file in image: '+rel);if(entry.isDirectory())visit(item)}};visit(root);`;
const result = spawnSync('docker', ['run', '--rm', '--entrypoint', 'node', image, '-e', scan], {
  stdio: 'inherit',
});
if (result.error) throw result.error;
if (result.status !== 0)
  throw new Error(`Container image content verification failed: ${result.status}`);
