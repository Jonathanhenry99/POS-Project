// Development: nyalakan PostgreSQL lokal (bila belum ada), lalu server API dan web sekaligus.
// Cukup satu perintah: npm run dev
import { spawn } from 'node:child_process';
import { connect } from 'node:net';

const DB_PORT = 54329;
const procs = [];
let stopping = false;

function portOpen(port) {
  return new Promise((resolve) => {
    const s = connect(port, '127.0.0.1');
    s.once('connect', () => (s.end(), resolve(true)));
    s.once('error', () => resolve(false));
  });
}

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const p of procs) p.kill('SIGINT');
  setTimeout(() => process.exit(code), 1500);
}

function run(name, args) {
  const p = spawn('npm', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  p.on('exit', (code) => {
    if (stopping) return;
    console.error(`\n[${name}] berhenti (kode ${code}). Menghentikan semua proses...`);
    stopAll(code ?? 1);
  });
  procs.push(p);
  return p;
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));

// Aplikasi mungkin sudah berjalan di terminal lain.
const busy = [];
for (const [port, name] of [[5180, 'web'], [8787, 'server API']]) if (await portOpen(port)) busy.push(`${name} (port ${port})`);
if (busy.length) {
  console.error(`\nPort sudah dipakai: ${busy.join(', ')}.`);
  console.error('Kemungkinan Mourden POS sudah berjalan di terminal lain: buka http://localhost:5180');
  console.error('Atau hentikan dulu proses itu (Ctrl+C di terminalnya), lalu jalankan npm run dev lagi.\n');
  process.exit(1);
}

// Pakai database lokal bawaan kecuali DATABASE_URL diisi sendiri.
if (!process.env.DATABASE_URL && !(await portOpen(DB_PORT))) {
  console.log('Menyalakan PostgreSQL lokal...');
  run('database', ['run', 'db:dev', '-w', '@mourden/server']);
  for (let i = 0; i < 60 && !(await portOpen(DB_PORT)); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await portOpen(DB_PORT))) {
    console.error('PostgreSQL lokal gagal menyala.');
    stopAll(1);
  }
}

run('server', ['run', 'dev', '-w', '@mourden/server']);
run('web', ['run', 'dev', '-w', '@mourden/web']);
