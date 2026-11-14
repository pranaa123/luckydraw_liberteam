import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { projectRoot } from './php-runtime.mjs';

const directory = resolve(projectRoot, 'public/assets/vendor/exceljs');
await mkdir(directory, { recursive: true });
await copyFile(resolve(projectRoot, 'node_modules/exceljs/dist/exceljs.min.js'), resolve(directory, 'exceljs.min.js'));
await copyFile(resolve(projectRoot, 'node_modules/exceljs/LICENSE'), resolve(directory, 'LICENSE'));

const pdf = resolve(projectRoot,'public/assets/vendor/pdfmake');
await mkdir(pdf,{ recursive: true });
for (const file of ['pdfmake.min.js','vfs_fonts.js']) await copyFile(resolve(projectRoot,'node_modules/pdfmake/build',file),resolve(pdf,file));
await copyFile(resolve(projectRoot,'node_modules/pdfmake/LICENSE'),resolve(pdf,'LICENSE'));
