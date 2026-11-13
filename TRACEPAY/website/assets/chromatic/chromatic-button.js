/*!
ReactDrops Component License 1.0

Copyright (c) 2026 ReactDrops

1. Scope and definitions

This license applies to ReactDrops software and associated documentation that
expressly carry this license or are distributed under a LICENSE file containing
it (the "Software"). "Licensor" means the copyright holder granting rights in
the Software, and only to the extent that holder has authority to grant them.
"You" means the individual or entity exercising these rights.

An "End Product" is a website, application, service, or other finished project
whose primary purpose is something other than providing reusable components,
source code, templates, or development assets to others.

2. Permitted uses

Subject to this license, Licensor grants You a worldwide, non-exclusive,
royalty-free license to use, copy, modify, and incorporate the Software into
unlimited personal, internal, and commercial End Products. You may charge for
End Products, subscriptions, development services, and work for clients.

You may distribute the Software as an integrated part of an End Product,
including in browser-delivered JavaScript. You may provide End Product source
code to a client, and share the Software with employees and contractors who
need it to develop or maintain End Products. Those recipients may use the
Software for those purposes subject to this license. This permission does not
authorize them to redistribute the Software as a reusable development asset.

3. Restricted redistribution

Unless You obtain separate written permission from Licensor, You may not sell,
sublicense, publish, share, or otherwise redistribute the Software, or a
substantial portion of it, whether unchanged or modified:

(a) as a standalone component, component library, UI kit, source-code bundle,
    registry, or other collection of reusable development assets;
(b) as part of a theme, template, starter project, or similar product offered
    to multiple recipients for reuse in their own projects; or
(c) through a builder or generation service that offers the Software as
    reusable blocks or source-code exports for others' projects.

These restrictions apply to paid and free redistribution. Renaming, restyling,
repackaging, translating, or modifying the Software does not remove them.
Building separate finished websites or applications for multiple clients is
permitted; offering a reusable template or kit containing the Software is not.

Public source-code hosting by Licensor is not permission to republish the
Software under another license. This license does not override any separate
rights granted directly by Licensor or applicable code-hosting terms.

4. Notices and ownership

Retain this license and applicable copyright and third-party notices in source
copies of the Software and permitted source distributions. No visible credit
or ReactDrops logo is required in an End Product's user interface.

Licensor retains ownership of its Software. You retain rights in Your own
contributions, subject to the license for any incorporated Software. No rights
to trademarks, trade names, or logos are granted by this license.

5. Third-party materials and separate grants

Dependencies, fonts, images, videos, and other third-party materials remain
subject to their respective licenses. Separately identified third-party code
is licensed under its stated terms, and these restrictions do not limit rights
granted by its copyright holders. Retain all required third-party notices.
Demo media are not licensed by this document; obtain Your own permission or
replace them with media You are entitled to use.

This license does not revoke rights granted under other valid licenses. It does
not assert ownership of third-party work or grant rights Licensor lacks.

6. Termination

The permissions granted here continue unless terminated for a material breach.
If You fail to cure a material breach within 30 days after receiving written
notice from Licensor, Your permissions terminate. On termination, cease uses
and distributions requiring this license. Rights under independently granted
licenses and rights that applicable law does not allow to be restricted remain
unaffected. Sections 3 through 7 survive termination.

7. Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. TO THE MAXIMUM EXTENT
PERMITTED BY APPLICABLE LAW, LICENSOR AND CONTRIBUTORS SHALL NOT BE LIABLE FOR
ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT, OR OTHERWISE,
ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR ITS USE.

This license does not limit rights or exceptions that applicable law makes
non-waivable. No other permissions are granted by implication.
*/

/*
 * Vanilla-JS port of ReactDrops' ChromaticButton + ChromaticSurface (originally React).
 * Logic, shader and defaults are unchanged; React hooks are replaced by plain DOM code so it can
 * run on the static TracePay website. Usage: <a data-chromatic data-color="#5A3B8C" ...>Label</a>
 */
import { chromaticFragmentShader, chromaticVertexShader } from './chromatic-shaders.js';
import { chromaticField, chromaticFieldSize } from './chromatic-field.js';

const colorModes = ['fixed', 'gradient-2', 'gradient-3', 'spectrum'];
const hoverEffects = ['none', 'brighten', 'flow', 'spotlight'];

const defaults = {
  color: '#b126ff', colorMode: 'spectrum', color2: '#ff177c', color3: '#35d3ff',
  speed: 0.7, paused: false, phase: 0, feather: 100, projectionScale: 174.7,
  intensity: 1.4, grain: 0.105, seed: 7, borderRadius: 50, hoverEffect: 'brighten',
  entrance: 'blur-up', entranceSpeed: 1, entranceBlur: 10, entranceDistance: 20, entranceScale: 0.65,
};
const surfaceDefaults = { projectionScale: 174 };

const finite = (value, fallback, min, max) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback));
const parseColor = (value) => {
  let hex = String(value).replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = Array.from(hex, (c) => c + c).join('');
  if (!/^[\da-f]{6}$/i.test(hex)) hex = 'b126ff';
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
};

/** Keep the projection's tangent scale proportional to the rounded contour's diagonal. */
function projectionScaleFor(scale, radius) {
  const safeRadius = Math.min(50, Math.max(0, Number.isFinite(radius) ? radius : defaults.borderRadius));
  const extent = (percent) => Math.SQRT2 * (1 - percent / 50) + percent / 50;
  const ratio = extent(safeRadius) / extent(defaults.borderRadius);
  const angle = (Math.min(179.5, Math.max(90, Number.isFinite(scale) ? scale : 174.7)) * Math.PI) / 360;
  return Math.min(179.5, Math.max(90, (Math.atan(Math.tan(angle) * ratio) * 360) / Math.PI));
}

/** The WebGL surface. `host` is the button / link that owns the canvas. */
function mountSurface(canvas, host, s) {
  const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  if (!gl) return () => {};
  let program = null, buffer = null, vertex = null, fragment = null, texture = null;
  let disposed = false, uniforms = {}, frame = 0, previous = 0, elapsed = 0;
  let hover = 0, hoverTarget = 0, pointerOver = false, keyboardFocus = false;
  let hoverPosition = [0, 0], visible = true, lost = false, mipmaps = false, width = 1, height = 1;
  const motion = matchMedia('(prefers-reduced-motion: reduce)');

  const compile = (type, source) => {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { gl.deleteShader(shader); return null; }
    return shader;
  };
  const release = () => {
    gl.deleteBuffer(buffer); gl.deleteProgram(program); gl.deleteShader(vertex); gl.deleteShader(fragment); gl.deleteTexture(texture);
    buffer = program = vertex = fragment = texture = null;
  };
  function uploadField() {
    if (disposed || lost || !program || !texture) return;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, chromaticFieldSize, chromaticFieldSize, 0, gl.RGBA, gl.UNSIGNED_BYTE, chromaticField());
    if (mipmaps) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    canvas.dataset.renderer = 'webgl';
    refresh();
  }
  const initialize = () => {
    vertex = compile(gl.VERTEX_SHADER, chromaticVertexShader);
    const derivatives = !!gl.getExtension('OES_standard_derivatives');
    mipmaps = derivatives && !!gl.getExtension('EXT_shader_texture_lod');
    const defines = (derivatives ? '#define USE_CHROMATIC_DERIVATIVES\n' : '') + (mipmaps ? '#define USE_CHROMATIC_TEXTURE_LOD\n' : '');
    fragment = compile(gl.FRAGMENT_SHADER, defines + chromaticFragmentShader);
    if (!vertex || !fragment) { release(); return; }
    program = gl.createProgram();
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { release(); return; }
    gl.useProgram(program);
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
    const position = gl.getAttribLocation(program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([20, 0, 35, 255]));
    uniforms = Object.fromEntries(
      ['size', 'resolution', 'grid', 'gap', 'time', 'phase', 'feather', 'projectionScale', 'centerProjectionScale', 'borderRadius',
        'intensity', 'grain', 'spread', 'seed', 'color', 'colorMode', 'color2', 'color3', 'field', 'hover', 'hoverEffect', 'hoverPosition']
        .map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]));
    uploadField();
  };
  const canAnimate = () => !!program && !lost && visible && !document.hidden && !motion.matches &&
    ((!s.paused && s.speed !== 0) || Math.abs(hoverTarget - hover) > 0.001);
  const draw = () => {
    if (!program || lost) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uniforms.size, width, height);
    gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
    gl.uniform2f(uniforms.grid, 1, 1);
    gl.uniform1f(uniforms.gap, 0);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.hover, host.disabled || s.hoverEffect === 'none' ? 0 : hover);
    gl.uniform1f(uniforms.hoverEffect, Math.max(0, hoverEffects.indexOf(s.hoverEffect)));
    gl.uniform2f(uniforms.hoverPosition, hoverPosition[0], hoverPosition[1]);
    gl.uniform1f(uniforms.phase, finite(s.phase, 0, -1000, 1000));
    gl.uniform1f(uniforms.feather, finite(s.feather, 95, 0, 100));
    const projectionScale = finite(s.projectionScale, 174, 90, 179.5);
    gl.uniform1f(uniforms.projectionScale, projectionScale);
    gl.uniform1f(uniforms.centerProjectionScale, finite(s.centerProjectionScale ?? projectionScale, projectionScale, 90, 179.5));
    gl.uniform1f(uniforms.borderRadius, s.borderRadius === undefined ? -1 : finite(s.borderRadius, 50, 0, 50) / 50);
    gl.uniform1f(uniforms.intensity, finite(s.intensity, 1.15, 0, 3));
    gl.uniform1f(uniforms.grain, finite(s.grain, 0.035, 0, 0.5));
    gl.uniform1f(uniforms.spread, 0);
    gl.uniform1f(uniforms.seed, finite(s.seed, 7, 0, 65535));
    gl.uniform3fv(uniforms.color, parseColor(s.color));
    gl.uniform1f(uniforms.colorMode, colorModes.indexOf(s.colorMode));
    gl.uniform3fv(uniforms.color2, parseColor(s.color2));
    gl.uniform3fv(uniforms.color3, parseColor(s.color3));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(uniforms.field, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  };
  const tick = (now) => {
    frame = 0;
    if (!canAnimate()) { previous = 0; return; }
    if (previous) {
      const delta = Math.min((now - previous) / 1000, 0.1);
      if (!s.paused) elapsed += delta * finite(s.speed, 0.7, 0, 4);
      hover += (hoverTarget - hover) * (1 - Math.exp(-delta * 14));
      if (Math.abs(hoverTarget - hover) <= 0.001) hover = hoverTarget;
    }
    previous = now;
    draw();
    if (canAnimate()) frame = requestAnimationFrame(tick);
  };
  const syncHover = () => {
    hoverTarget = !host.disabled && s.hoverEffect !== 'none' && (pointerOver || keyboardFocus) ? 1 : 0;
    if (motion.matches || s.hoverEffect === 'none' || host.disabled) hover = hoverTarget;
  };
  const wakeHover = () => {
    syncHover();
    if (!frame) { previous = 0; draw(); if (canAnimate()) frame = requestAnimationFrame(tick); }
  };
  const onEnter = (e) => { if (e.pointerType === 'touch') return; pointerOver = true; wakeHover(); };
  const onLeave = () => { pointerOver = false; wakeHover(); };
  const onFocus = () => { keyboardFocus = host.matches(':focus-visible'); if (keyboardFocus) hoverPosition = [0, 0]; wakeHover(); };
  const onBlur = () => { keyboardFocus = false; wakeHover(); };
  const onMove = (e) => {
    if (host.disabled || e.pointerType === 'touch' || s.hoverEffect !== 'spotlight') return;
    const rect = host.getBoundingClientRect();
    hoverPosition = [
      Math.max(-1, Math.min(1, ((e.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1)),
      Math.max(-1, Math.min(1, ((e.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1)),
    ];
    if (!frame) draw();
  };
  function refresh() {
    cancelAnimationFrame(frame); frame = 0; previous = 0;
    syncHover(); draw();
    if (canAnimate()) frame = requestAnimationFrame(tick);
  }
  const resize = () => {
    width = Math.max(1, canvas.clientWidth);
    height = Math.max(1, canvas.clientHeight);
    const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(1500000 / (width * height)));
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    refresh();
  };
  const onLost = (e) => { e.preventDefault(); lost = true; cancelAnimationFrame(frame); delete canvas.dataset.renderer; };
  const onRestored = () => { lost = false; release(); initialize(); resize(); };

  initialize();
  host.addEventListener('pointerenter', onEnter);
  host.addEventListener('pointerleave', onLeave);
  host.addEventListener('pointercancel', onLeave);
  host.addEventListener('pointermove', onMove);
  host.addEventListener('focus', onFocus);
  host.addEventListener('blur', onBlur);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(canvas);
  const intersectionObserver = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; refresh(); });
  intersectionObserver.observe(canvas);
  document.addEventListener('visibilitychange', refresh);
  motion.addEventListener('change', refresh);
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);
  resize();
  return () => {
    disposed = true; cancelAnimationFrame(frame);
    resizeObserver.disconnect(); intersectionObserver.disconnect();
    document.removeEventListener('visibilitychange', refresh); motion.removeEventListener('change', refresh);
    canvas.removeEventListener('webglcontextlost', onLost); canvas.removeEventListener('webglcontextrestored', onRestored);
    delete canvas.dataset.renderer; release();
    host.removeEventListener('pointerenter', onEnter); host.removeEventListener('pointerleave', onLeave);
    host.removeEventListener('pointercancel', onLeave); host.removeEventListener('pointermove', onMove);
    host.removeEventListener('focus', onFocus); host.removeEventListener('blur', onBlur);
  };
}

/** Turn an element into a Chromatic Button. Options come from data-* attributes. */
export function chromaticButton(el) {
  if (el.dataset.chromaticReady) return;
  el.dataset.chromaticReady = '1';
  const d = el.dataset;
  const num = (v, fb) => (v === undefined || v === '' ? fb : Number(v));
  const o = {
    color: d.color ?? defaults.color,
    colorMode: d.colorMode ?? defaults.colorMode,
    color2: d.color2 ?? defaults.color2,
    color3: d.color3 ?? defaults.color3,
    speed: num(d.speed, defaults.speed),
    feather: num(d.feather, defaults.feather),
    projectionScale: num(d.projectionScale, defaults.projectionScale),
    intensity: num(d.intensity, defaults.intensity),
    grain: num(d.grain, defaults.grain),
    seed: num(d.seed, defaults.seed),
    phase: num(d.phase, 0),
    borderRadius: num(d.borderRadius, defaults.borderRadius),
    hoverEffect: d.hoverEffect ?? defaults.hoverEffect,
    entrance: d.entrance ?? 'none',
  };
  const radius = Math.min(50, Math.max(0, Number.isFinite(o.borderRadius) ? o.borderRadius : defaults.borderRadius));
  const projected = projectionScaleFor(o.projectionScale, radius);

  el.classList.add('chromatic-button');
  el.dataset.hoverEffect = o.hoverEffect;
  el.dataset.entrance = o.entrance;
  el.style.setProperty('--chromatic-button-color', o.color);
  el.style.setProperty('--chromatic-button-radius', String(radius / 100));

  const content = document.createElement('span');
  content.className = 'chromatic-button-content';
  while (el.firstChild) content.appendChild(el.firstChild);
  const canvas = document.createElement('canvas');
  canvas.className = 'chromatic-surface';
  canvas.setAttribute('aria-hidden', 'true');
  el.append(canvas, content);

  const resize = () => el.style.setProperty('--chromatic-button-short-side', `${Math.min(el.clientWidth, el.clientHeight)}px`);
  resize();
  new ResizeObserver(resize).observe(el);

  mountSurface(canvas, el, {
    color: o.color, colorMode: o.colorMode, color2: o.color2, color3: o.color3,
    speed: o.speed, paused: false, phase: o.phase, feather: o.feather,
    projectionScale: projected, borderRadius: radius, hoverEffect: o.hoverEffect,
    centerProjectionScale: projected - (defaults.projectionScale - surfaceDefaults.projectionScale),
    intensity: o.intensity, grain: o.grain, seed: o.seed,
  });
}

export function initChromaticButtons(root = document) {
  root.querySelectorAll('[data-chromatic]').forEach(chromaticButton);
}
