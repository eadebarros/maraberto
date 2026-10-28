// Production server: serves dist/ on $PORT (Railway sets it), falling back to 3000.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const serveBin = require.resolve('serve/build/main.js');
const port = process.env.PORT || '3000';

const child = spawn(process.execPath, [serveBin, 'dist', '--listen', `tcp://0.0.0.0:${port}`, '--no-clipboard'], {
  stdio: 'inherit',
});
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => child.kill(sig));
child.on('exit', (code) => process.exit(code ?? 0));
