// Procedural textures drawn on canvases, so the game ships without image files.
import * as THREE from 'three';

function canvas(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  return c;
}

function texture(c, repeat = 1, color = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Deterministic noise, so textures look the same on every load.
function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

const cache = new Map();
function cached(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// Linen-like weave: fine threads in both directions plus a little slub.
export function fabric() {
  return cached('fabric', () => {
    const r = rng(7);
    const c = canvas(256, (g, n) => {
      g.fillStyle = '#808080';
      g.fillRect(0, 0, n, n);
      for (let y = 0; y < n; y += 2) {
        g.fillStyle = `rgba(255,255,255,${0.05 + r() * 0.08})`;
        g.fillRect(0, y, n, 1);
      }
      for (let x = 0; x < n; x += 2) {
        g.fillStyle = `rgba(0,0,0,${0.04 + r() * 0.08})`;
        g.fillRect(x, 0, 1, n);
      }
      for (let i = 0; i < 260; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '255,255,255' : '0,0,0'},0.07)`;
        g.fillRect(r() * n, r() * n, 4 + r() * 18, 1);
      }
    });
    return { bump: texture(c, 3, false) };
  });
}

// Quilted mattress cover: diamond stitching with a tuft at each crossing.
export function quilt() {
  return cached('quilt', () => {
    const c = canvas(256, (g, n) => {
      g.fillStyle = '#c8c8c8';
      g.fillRect(0, 0, n, n);
      const s = n / 4;
      for (let i = -1; i <= 4; i++) {
        for (let j = -1; j <= 4; j++) {
          const grd = g.createRadialGradient(i * s + s / 2, j * s + s / 2, 2, i * s + s / 2, j * s + s / 2, s * 0.62);
          grd.addColorStop(0, '#ffffff');
          grd.addColorStop(1, '#9a9a9a');
          g.fillStyle = grd;
          g.beginPath();
          g.moveTo(i * s + s / 2, j * s);
          g.lineTo(i * s + s, j * s + s / 2);
          g.lineTo(i * s + s / 2, j * s + s);
          g.lineTo(i * s, j * s + s / 2);
          g.closePath();
          g.fill();
        }
      }
      g.strokeStyle = '#6a6a6a';
      g.lineWidth = 1.5;
      for (let k = -n; k <= 2 * n; k += s) {
        g.beginPath();
        g.moveTo(k, 0);
        g.lineTo(k + n, n);
        g.moveTo(k, n);
        g.lineTo(k + n, 0);
        g.stroke();
      }
    });
    const t = texture(c, 1, false);
    t.repeat.set(5, 2.5);
    return t;
  });
}

// Brown corrugated cardboard with a strip of packing tape across every face.
export function cardboard() {
  return cached('cardboard', () => {
    const r = rng(13);
    const c = canvas(256, (g, n) => {
      g.fillStyle = '#c49a6a';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 400; i++) {
        g.fillStyle = `rgba(${r() < 0.5 ? '90,60,30' : '255,240,210'},0.06)`;
        g.fillRect(r() * n, r() * n, 2 + r() * 30, 1);
      }
      g.fillStyle = 'rgba(214,180,120,0.85)';
      g.fillRect(0, n * 0.42, n, n * 0.16);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, n * 0.43, n, n * 0.03);
      g.fillStyle = 'rgba(60,40,20,0.55)';
      g.font = `bold ${n * 0.09}px sans-serif`;
      g.fillText('↑↑', n * 0.08, n * 0.2);
    });
    return texture(c);
  });
}

export function woodGrain() {
  return cached('wood', () => {
    const r = rng(3);
    const c = canvas(256, (g, n) => {
      g.fillStyle = '#c8955a';
      g.fillRect(0, 0, n, n);
      for (let i = 0; i < 70; i++) {
        const x = r() * n;
        g.strokeStyle = `rgba(110,60,20,${0.08 + r() * 0.18})`;
        g.lineWidth = 0.5 + r() * 2;
        g.beginPath();
        g.moveTo(x, 0);
        g.bezierCurveTo(x + r() * 10 - 5, n / 3, x + r() * 10 - 5, (2 * n) / 3, x + r() * 6 - 3, n);
        g.stroke();
      }
    });
    return texture(c);
  });
}

// Brown phenolic plywood with the typical hexagon anti-slip print.
export function phenolic() {
  return cached('phenolic', () => {
    const c = canvas(256, (g, n) => {
      g.fillStyle = '#6b5240';
      g.fillRect(0, 0, n, n);
      const s = 16;
      for (let row = 0; row * s * 0.86 < n + s; row++) {
        for (let col = 0; col * s < n + s; col++) {
          const x = col * s + (row % 2) * (s / 2);
          const y = row * s * 0.86;
          g.beginPath();
          for (let k = 0; k < 6; k++) {
            const a = (Math.PI / 3) * k + Math.PI / 6;
            g.lineTo(x + Math.cos(a) * s * 0.38, y + Math.sin(a) * s * 0.38);
          }
          g.closePath();
          g.fillStyle = 'rgba(40,25,15,0.35)';
          g.fill();
        }
      }
    });
    return texture(c);
  });
}

// Extruded aluminium board profile: horizontal ribs.
export function aluBoard() {
  return cached('alu', () => {
    const c = canvas(64, (g, n) => {
      const grd = g.createLinearGradient(0, 0, 0, n);
      grd.addColorStop(0, '#9a9a9a');
      grd.addColorStop(0.45, '#d0d0d0');
      grd.addColorStop(0.55, '#c4c4c4');
      grd.addColorStop(0.92, '#a8a8a8');
      grd.addColorStop(1, '#5a5a5a');
      g.fillStyle = grd;
      g.fillRect(0, 0, n, n);
    });
    return texture(c, 1, false);
  });
}

export function cobble() {
  return cached('cobble', () => {
    const r = rng(11);
    const draw = (bump) => canvas(512, (g, n) => {
      g.fillStyle = bump ? '#202020' : '#4a4743';
      g.fillRect(0, 0, n, n);
      const k = 10;
      const s = n / k;
      for (let j = 0; j < k; j++) {
        for (let i = -1; i < k; i++) {
          const x = i * s + (j % 2) * s * 0.5 + (r() - 0.5) * 3;
          const y = j * s + (r() - 0.5) * 3;
          const w = s - 5 - r() * 3;
          const h = s - 5 - r() * 3;
          if (bump) {
            const grd = g.createRadialGradient(x + w / 2, y + h / 2, 2, x + w / 2, y + h / 2, w * 0.7);
            grd.addColorStop(0, '#f0f0f0');
            grd.addColorStop(1, '#707070');
            g.fillStyle = grd;
          } else {
            const v = 100 + Math.floor(r() * 45);
            const warm = Math.floor(r() * 10);
            g.fillStyle = `rgb(${v + warm},${v},${v - 6})`;
          }
          g.beginPath();
          g.roundRect(x + 2.5, y + 2.5, w, h, 9);
          g.fill();
        }
      }
    });
    return { map: texture(draw(false), 50), bump: texture(draw(true), 50, false) };
  });
}

export function planks() {
  return cached('planks', () => {
    const r = rng(5);
    const c = canvas(256, (g, n) => {
      const w = n / 8;
      for (let i = 0; i < 8; i++) {
        const v = 90 + Math.floor(r() * 30);
        g.fillStyle = `rgb(${v + 30},${v - 10},${v - 35})`;
        g.fillRect(i * w, 0, w, n);
        g.fillStyle = 'rgba(30,15,5,0.7)';
        g.fillRect(i * w, 0, 2, n);
        for (let k = 0; k < 6; k++) {
          g.fillStyle = `rgba(40,20,5,${0.1 + r() * 0.15})`;
          g.fillRect(i * w + 4 + r() * (w - 8), 0, 1, n);
        }
      }
    });
    return texture(c);
  });
}

export function roofTiles() {
  return cached('tiles', () => {
    const r = rng(9);
    const c = canvas(256, (g, n) => {
      g.fillStyle = '#9c3f1c';
      g.fillRect(0, 0, n, n);
      const w = n / 8;
      const h = n / 6;
      for (let j = 0; j < 6; j++) {
        for (let i = 0; i < 9; i++) {
          const x = i * w - (j % 2) * (w / 2);
          const v = r() * 25;
          const grd = g.createLinearGradient(x, 0, x + w, 0);
          grd.addColorStop(0, `rgb(${170 + v},${70 + v / 2},${35})`);
          grd.addColorStop(0.5, `rgb(${215 + v},${105 + v / 2},${55})`);
          grd.addColorStop(1, `rgb(${165 + v},${68 + v / 2},${32})`);
          g.fillStyle = grd;
          g.beginPath();
          g.roundRect(x + 1, j * h + 1, w - 2, h - 3, [0, 0, w / 2, w / 2]);
          g.fill();
        }
      }
    });
    return texture(c);
  });
}

export function skyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      top: { value: new THREE.Color(0x6f9fd8) },
      mid: { value: new THREE.Color(0xb9d3ec) },
      horizon: { value: new THREE.Color(0xfbe3c4) },
      sunDir: { value: new THREE.Vector3(-0.6, 0.35, 0.5).normalize() },
    },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 sunDir;
      varying vec3 vDir;
      void main() {
        float h = max(vDir.y, 0.0);
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.18, h));
        col = mix(col, top, smoothstep(0.18, 0.7, h));
        float s = max(dot(normalize(vDir), sunDir), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(s, 600.0) * 1.5 + pow(s, 12.0) * 0.25);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}
