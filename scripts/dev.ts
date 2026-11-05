import { spawn } from 'node:child_process';
import net from 'net';

const PORT = 3001;

function isPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(true));
    server.once('listening', () => {
      server.close();
      resolve(false);
    });
    server.listen(port);
  });
}

async function start() {
  if (await isPortInUse(PORT)) {
    console.error(
      `Port ${PORT} is already in use. Please stop the conflicting process or choose a different port.`,
    );
    process.exit(1);
  }

  // Use shell: true and a single string command to ensure arguments are parsed correctly
  // by the shell, just like running it in the terminal.
  const command = 'npx concurrently "npm run dev:server" "npm run dev:client"';

  const child = spawn(command, {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: String(PORT) },
  });

  // Ensure signals are forwarded
  process.on('SIGINT', () => {
    child.kill('SIGINT');
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    child.kill('SIGTERM');
    process.exit(0);
  });

  child.on('close', (code) => {
    process.exit(code ?? 0);
  });
}

start();
