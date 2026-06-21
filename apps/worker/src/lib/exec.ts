import { spawn } from 'node:child_process';

/**
 * Spawn a command and stream every stdout/stderr line to `onLine`.
 * Resolves on exit code 0, rejects otherwise.
 */
export function execStream(
  cmd: string,
  args: string[],
  opts: { cwd?: string },
  onLine: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd: opts.cwd, shell: false });
    const handle = (buf: Buffer) => {
      for (const line of buf.toString().split('\n')) {
        if (line.trim()) onLine(line.replace(/\s+$/, ''));
      }
    };
    child.stdout.on('data', handle);
    child.stderr.on('data', handle);
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}
