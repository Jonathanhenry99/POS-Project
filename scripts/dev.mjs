// Menjalankan server API dan web (Vite) sekaligus untuk development.
import { spawn } from 'node:child_process';

const procs = [
  ['server', ['run', 'dev', '-w', '@mourden/server']],
  ['web', ['run', 'dev', '-w', '@mourden/web']],
].map(([name, args]) => {
  const p = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    console.log(`[${name}] berhenti (kode ${code})`);
    procs.forEach((other) => other !== p && other.kill());
    process.exit(code ?? 0);
  });
  return p;
});

process.on('SIGINT', () => procs.forEach((p) => p.kill('SIGINT')));
