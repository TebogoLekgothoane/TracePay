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
 * Vanilla-JS port of ReactDrops' <TopographicFlow />. The renderer, field, contour tracing and surface
 * modules next to this file are the original implementation (transpiled from TypeScript, unchanged).
 * Only the React wrapper is replaced: it resolves the same props into a config and drives
 * createTopographicRenderer, with the same entrance fade and theme re-sync.
 */
import { topographicDefaults, topographicPresets } from './topographic-presets.js';
import { createTopographicRenderer } from './topographic-renderer.js';

export function topographicFlow(host, props = {}) {
  if (host.dataset.topoReady) return;
  host.dataset.topoReady = '1';
  const {
    animateEntrance = topographicDefaults.animateEntrance, preset = 'paper', backgroundColor, backgroundImage,
    gradientColors, gradientDiffusion, grain, scale, density, speed, distortion, lineWidth, opacity, dashLength,
    dashGap, seed, paused, lineColor, accentColor, lineStyle, hover, hoverRadius, hoverFollow, hoverFade, hoverEffect,
  } = props;
  const palette = topographicPresets[preset] ?? topographicPresets.paper;
  const customImage = backgroundImage;
  const gradient = customImage ?? palette.backgroundImage;
  const colors = customImage === 'none'
    ? topographicPresets.paper.gradientColors
    : (gradientColors ?? (customImage === undefined || customImage === palette.backgroundImage ? palette.gradientColors : topographicPresets.paper.gradientColors));
  const grainAmount = Math.max(0, Math.min(1, Number.isFinite(grain ?? palette.grain) ? (grain ?? palette.grain) : palette.grain));
  const textured = (colors.length >= 2 || gradient !== 'none') && grainAmount > 0;
  const config = {
    scale: scale ?? palette.scale, density: density ?? palette.density,
    speed: speed ?? topographicDefaults.speed, distortion: distortion ?? topographicDefaults.distortion,
    lineWidth: lineWidth ?? palette.lineWidth, opacity: opacity ?? palette.opacity,
    dashLength: dashLength ?? topographicDefaults.dashLength, dashGap: dashGap ?? topographicDefaults.dashGap,
    seed: seed ?? topographicDefaults.seed, paused: paused ?? false,
    lineColor: lineColor ?? (preset === 'paper' ? 'var(--topographic-flow-ink)' : palette.lineColor),
    accentColor: accentColor ?? (preset === 'paper' ? 'var(--topographic-flow-ink)' : palette.accentColor),
    lineStyle: lineStyle ?? palette.lineStyle,
    hover: hover ?? topographicDefaults.hover, hoverRadius: hoverRadius ?? topographicDefaults.hoverRadius,
    hoverFollow: hoverFollow ?? topographicDefaults.hoverFollow, hoverFade: hoverFade ?? topographicDefaults.hoverFade,
    hoverEffect: hoverEffect ?? palette.hoverEffect,
    grain: textured ? grainAmount : 0, gradientColors: colors,
    gradientDiffusion: gradientDiffusion ?? palette.gradientDiffusion,
    backgroundColor: backgroundColor ?? (preset === 'paper' ? 'var(--topographic-flow-background)' : palette.backgroundColor),
  };

  host.classList.add('topographic-flow');
  host.dataset.ready = 'false';
  host.dataset.animateEntrance = String(animateEntrance);
  host.style.backgroundColor = backgroundColor ?? (preset === 'paper' ? 'var(--topographic-flow-background)' : palette.backgroundColor);
  host.style.backgroundImage = backgroundImage ?? palette.backgroundImage;

  const content = document.createElement('div');
  content.className = 'topographic-flow-content';
  while (host.firstChild) content.appendChild(host.firstChild);
  const canvas = document.createElement('canvas');
  canvas.className = 'topographic-flow-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  host.append(canvas, content);

  const renderer = createTopographicRenderer(canvas, host, config, undefined, () => { host.dataset.ready = 'true'; });
  const syncTheme = () => renderer.update(config);
  new MutationObserver(syncTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class'] });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', syncTheme);
  return renderer;
}
