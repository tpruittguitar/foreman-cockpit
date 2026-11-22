import * as THREE from 'three';

// Shared Office humanoid gait: shoulder counter-swing, opposing hips and bent knees.
export function walkLimbPose(t, phase) {
  const p = t * 9 + phase, s = Math.sin(p);
  return { armR: -s * 0.5, armL: s * 0.5, hipR: s * 0.6, hipL: -s * 0.6, bob: Math.abs(Math.cos(p)) * 0.03 };
}
export const walkKneeAngle = hip => Math.max(0, -hip) * 0.5 + 0.08;

export function setSkinWeights(geometry, weightsAt) {
  const p = geometry.attributes.position, n = p.count, indices = new Uint16Array(n * 4), weights = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const top = weightsAt(p.getX(i), p.getY(i)).map((v, k) => [v, k]).sort((a, b) => b[0] - a[0]).slice(0, 4);
    const sum = top.reduce((a, b) => a + b[0], 0) || 1;
    top.forEach(([v, k], j) => { indices[i * 4 + j] = k; weights[i * 4 + j] = v / sum; });
  }
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}
