import { mkdir, copyFile, readFile } from 'node:fs/promises';
const source = new URL('../node_modules/@vladmandic/face-api/', import.meta.url);
const output = new URL('../public/models/', import.meta.url);
await mkdir(output, {recursive:true});
for (const model of ['tiny_face_detector','face_landmark_68','face_recognition']) {
  const manifest = `${model}_model-weights_manifest.json`;
  const groups = JSON.parse(await readFile(new URL(`model/${manifest}`,source),'utf8'));
  for (const file of [manifest,...groups.flatMap(g=>g.paths)]) await copyFile(new URL(`model/${file}`,source),new URL(file,output));
}
await mkdir(new URL('../public/vendor/',import.meta.url),{recursive:true});
await copyFile(new URL('dist/face-api.js',source),new URL('../public/vendor/face-api.js',import.meta.url));
await copyFile(new URL('LICENSE',source),new URL('../public/vendor/face-api-LICENSE.txt',import.meta.url));
console.log('Face runtime and models copied locally.');
