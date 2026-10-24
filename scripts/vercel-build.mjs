import { spawnSync } from 'node:child_process';

function run(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (process.env.VERCEL_ENV === 'production') {
  run('npx', ['prisma', 'migrate', 'deploy']);
}

run('node', ['scripts/copy-swagger-assets.mjs']);
run('npx', ['nest', 'build']);
