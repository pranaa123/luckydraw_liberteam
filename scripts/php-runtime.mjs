// Alat pengembangan saja: PHP 8.3 portabel untuk mesin tanpa PHP native.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPHPLoaderModule } from '@php-wasm/node-8-3';
import { PHP, loadPHPRuntime } from '@php-wasm/universal';

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export async function createPHP() {
  const php = new PHP(await loadPHPRuntime(await getPHPLoaderModule()));
  php.mkdir('/app');
  await php.mount('/app', (_php, filesystem, mountPoint) => {
    filesystem.mount(filesystem.filesystems.NODEFS, { root: projectRoot }, mountPoint);
    return () => filesystem.unmount(mountPoint);
  });
  return php;
}
