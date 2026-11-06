const { spawn } = require('child_process');
const path = require('path');

const tsxCmd = path.join(__dirname, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');
const serverTs = path.join(__dirname, 'server', 'server.ts');

const child = spawn(tsxCmd, [serverTs], { stdio: 'inherit', shell: true });

child.on('close', (code) => {
  process.exit(code);
});
