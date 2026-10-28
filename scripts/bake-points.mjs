// Samples a GLB mesh surface into a compact binary point cloud.
// Usage: node scripts/bake-points.mjs <input.glb> <output.bin> [count] [minY]
// Points below minY (model units) are dropped — used to cut off the pedestal.
//
// Output layout (little-endian):
//   magic "DOTS" | u32 count | f32 min[3] | f32 max[3]
//   count * (i16 x, i16 y, i16 z, i8 nx, i8 ny, i8 nz, u8 flags)
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';

const [input, output, countArg, minYArg] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/bake-points.mjs <input.glb> <output.bin> [count]');
  process.exit(1);
}
const COUNT = Number(countArg) || 110000;
const MIN_Y = minYArg != null ? Number(minYArg) : -Infinity;

// --- minimal GLB reader (uncompressed meshes only) ---
const buf = fs.readFileSync(input);
if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('Not a GLB file');
const jsonLen = buf.readUInt32LE(12);
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
const binStart = 20 + jsonLen + 8;
const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLen));

const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 };
const TYPED = { 5121: Uint8Array, 5123: Uint16Array, 5125: Uint32Array, 5126: Float32Array };

function readAccessor(index) {
  const acc = gltf.accessors[index];
  const view = gltf.bufferViews[acc.bufferView];
  const Typed = TYPED[acc.componentType];
  const n = COMPONENTS[acc.type];
  const offset = (view.byteOffset || 0) + (acc.byteOffset || 0);
  const stride = view.byteStride || n * Typed.BYTES_PER_ELEMENT;
  const out = new Typed(acc.count * n);
  const dv = new DataView(bin.buffer, bin.byteOffset + offset);
  const get = {
    5121: (o) => dv.getUint8(o),
    5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true),
    5126: (o) => dv.getFloat32(o, true),
  }[acc.componentType];
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) out[i * n + c] = get(i * stride + c * Typed.BYTES_PER_ELEMENT);
  }
  return out;
}

// Collect every mesh primitive with its node's world transform.
const geometries = [];
function visit(nodeIndex, parentMatrix) {
  const node = gltf.nodes[nodeIndex];
  const local = new THREE.Matrix4();
  if (node.matrix) local.fromArray(node.matrix);
  else {
    local.compose(
      new THREE.Vector3(...(node.translation || [0, 0, 0])),
      new THREE.Quaternion(...(node.rotation || [0, 0, 0, 1])),
      new THREE.Vector3(...(node.scale || [1, 1, 1])),
    );
  }
  const world = parentMatrix.clone().multiply(local);
  if (node.mesh != null) {
    for (const prim of gltf.meshes[node.mesh].primitives) {
      if (prim.mode != null && prim.mode !== 4) continue; // triangles only
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(readAccessor(prim.attributes.POSITION), 3));
      if (prim.indices != null) geo.setIndex(new THREE.BufferAttribute(readAccessor(prim.indices), 1));
      geo.applyMatrix4(world);
      geometries.push(geo.index ? geo.toNonIndexed() : geo);
    }
  }
  for (const child of node.children || []) visit(child, world);
}
const scene = gltf.scenes[gltf.scene || 0];
for (const n of scene.nodes) visit(n, new THREE.Matrix4());
if (!geometries.length) throw new Error('No triangle meshes found');

// Merge into one non-indexed geometry with flat normals (the sampler interpolates them).
const total = geometries.reduce((s, g) => s + g.attributes.position.count, 0);
const merged = new Float32Array(total * 3);
let at = 0;
for (const g of geometries) {
  merged.set(g.attributes.position.array, at);
  at += g.attributes.position.array.length;
}
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(merged, 3));
geo.computeVertexNormals();

console.log(`Triangles: ${(total / 3).toLocaleString()} — sampling ${COUNT.toLocaleString()} points…`);
const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();

const p = new THREE.Vector3();
const n = new THREE.Vector3();
const pos = new Float32Array(COUNT * 3);
const nor = new Float32Array(COUNT * 3);
for (let i = 0; i < COUNT; i++) {
  do sampler.sample(p, n);
  while (p.y < MIN_Y);
  pos.set([p.x, p.y, p.z], i * 3);
  nor.set([n.x, n.y, n.z], i * 3);
}

// Quantize.
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < COUNT * 3; i++) {
  const c = i % 3;
  min[c] = Math.min(min[c], pos[i]);
  max[c] = Math.max(max[c], pos[i]);
}
const HEADER = 4 + 4 + 24;
const STRIDE = 10;
const out = Buffer.alloc(HEADER + COUNT * STRIDE);
out.write('DOTS', 0, 'ascii');
out.writeUInt32LE(COUNT, 4);
for (let c = 0; c < 3; c++) {
  out.writeFloatLE(min[c], 8 + c * 4);
  out.writeFloatLE(max[c], 20 + c * 4);
}
for (let i = 0; i < COUNT; i++) {
  const o = HEADER + i * STRIDE;
  for (let c = 0; c < 3; c++) {
    const t = (pos[i * 3 + c] - min[c]) / (max[c] - min[c] || 1);
    out.writeInt16LE(Math.round(t * 65535 - 32768), o + c * 2);
    out.writeInt8(Math.round(THREE.MathUtils.clamp(nor[i * 3 + c], -1, 1) * 127), o + 6 + c);
  }
  out.writeUInt8(0, o + 9); // flags: 0 = bust
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, out);
console.log(`Wrote ${output} (${(out.length / 1024).toFixed(0)} KB)`);
