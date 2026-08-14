/* =====================================================================
   Patrik Components  -  external rendering script
   ---------------------------------------------------------------------
   The HTML pages are SCRIPTLESS. They contain only markup + data-*
   config and load this single file:

       <script src="patrik-components.js"></script>

   Components (all auto-render, all configured from HTML):
     1) .patrik-radar-chart   -> the "performance" octagon
     2) .patrik-range-bar     -> the "feel" / "rider goals" range sliders
     3) .patrik-layout        -> the section layout (rows & columns)

   Design defaults are DARK-NATIVE and TRANSPARENT: the components draw
   nothing behind themselves and default to a smooth teal palette
   (Patrik brand ~#269EBC) with light hairline grids and light labels,
   so they drop straight onto the dark patrikinternational.com pages
   with a transparent background. Put them on a light surface? Override
   the label / grid / text colours via the data-* attributes below.

   RESPONSIVENESS IS ELEMENT-DRIVEN, NOT VIEWPORT-DRIVEN. Every
   component watches its own rendered width (ResizeObserver) and adapts
   to the space it actually has - a chart squeezed into a half-width
   column on a desktop behaves exactly like one on a phone. Radar axis
   labels are scale-compensated so they render at a readable size no
   matter how small the chart is drawn; range bars step their type down
   as they narrow; the layout scales its gaps, paddings and headings
   fluidly from the section's own width.

   All input values, labels and colours live in the HTML via data-*
   attributes. This file holds rendering + styling logic only, so it can
   be shared across every page and scales cleanly down to mobile.
   ===================================================================== */
(function () {
    "use strict";

    const NS = "http://www.w3.org/2000/svg";

    // Brand teal used to derive the default gradient fill / outline.
    const TEAL = "#38b6d3";

    let gradSeq = 0; // unique <linearGradient> ids when several charts share a page

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function num(value, fallback) {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : fallback;
    }
    function splitList(str) {
        return (str || "").split(",").map(s => s.trim()).filter(Boolean);
    }
    // Parse a hex (#rgb / #rrggbb) or rgb()/rgba() colour into {r,g,b,a}.
    // Returns null for anything else (named colours, gradients) so callers can
    // fall back to using the value verbatim.
    function parseColor(c) {
        if (!c) return null;
        c = String(c).trim();
        if (c[0] === "#") {
            let h = c.slice(1);
            if (h.length === 3) h = h.split("").map(x => x + x).join("");
            if (h.length !== 6) return null;
            const n = parseInt(h, 16);
            if (!Number.isFinite(n)) return null;
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1, hasAlpha: false };
        }
        const m = c.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const p = m[1].split(",").map(s => parseFloat(s.trim()));
            // hasAlpha distinguishes an explicit alpha (incl. exactly 1) from an
            // opaque hex/rgb, so a fill intensity of 1 is honoured, not reset.
            return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p[3] != null ? p[3] : 1, hasAlpha: p[3] != null };
        }
        return null;
    }
    function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }
    // A translucent left-to-right fade of one colour — the range-bar band fill,
    // echoing the radar polygon's gradient in the horizontal direction.
    function fillGradientCss(c, peak) {
        return `linear-gradient(90deg,${rgba(c, peak)},${rgba(c, Math.max(0.04, peak * 0.34))})`;
    }
    function injectStyles(id, css) {
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
    }

    /* ---- shared element-width watcher ---------------------------------
       One ResizeObserver for every component. A WeakMap keys callbacks by
       element, so re-rendered / discarded DOM (the builder preview swaps its
       markup constantly) never leaks observers. The observer fires once on
       observe(), which doubles as the initial measurement. */
    let widthRO = null;
    const widthCbs = typeof WeakMap === "function" ? new WeakMap() : null;
    function observeWidth(el, cb) {
        if (typeof ResizeObserver !== "function" || !widthCbs) {
            cb(el.getBoundingClientRect ? el.getBoundingClientRect().width : 0);
            return;
        }
        if (!widthRO) {
            widthRO = new ResizeObserver((entries) => {
                entries.forEach((en) => {
                    const f = widthCbs.get(en.target);
                    if (f) f(en.contentRect.width);
                });
            });
        }
        const had = widthCbs.has(el);
        widthCbs.set(el, cb);
        if (!had) widthRO.observe(el);
    }


    /* ==================================================================
       1) RADAR CHART  (performance octagon)
       ------------------------------------------------------------------
       Single dataset:
         <div class="patrik-radar-chart"
              data-axes="LIGHTWIND,FREERIDE,FOIL,WAVE"
              data-values="100,90,70,95"></div>

       Switchable datasets (dropdown lives in the HTML):
         <div class="patrik-radar-chart" data-axes="Lowend,Directness,Riding">
             <select class="patrik-radar-select">
                 <option value="100,70,100">Model A</option>
                 <option value="90,95,85">Model B</option>
             </select>
         </div>

       Optional colour attributes (any subset):
         data-fill  data-stroke  data-point  data-grid
         data-axis-color  data-label-color

       Setting data-fill switches off the default gradient and uses that
       flat colour instead. Leave it unset for the smooth teal gradient.
       ================================================================== */

    function injectRadarStyles() {
        injectStyles("patrik-radar-styles", `
        .patrik-radar-chart{
            --rc-grid:rgba(255,255,255,0.12);
            --rc-axis:rgba(255,255,255,0.10);
            --rc-fill:rgba(56,182,211,0.28);
            --rc-stroke:${TEAL};
            --rc-point:#eaf7fb;
            --rc-label:#c7dce4;
            font-family:inherit;
        }
        /* The viewBox is grown at render time to contain the axis labels (see
           fitRadarViewBox), so the component never paints outside its own box
           and cannot be clipped by a host container with overflow:hidden.
           overflow:visible stays as a belt-and-braces fallback for the case
           where the SVG cannot be measured (e.g. rendered while display:none). */
        .patrik-radar-svg{ display:block; width:100%; max-width:460px; height:auto; margin:0 auto; overflow:visible; background:transparent; }
        .patrik-radar-chart[data-align="left"] .patrik-radar-svg{ margin-left:0; margin-right:auto; }
        .patrik-radar-chart[data-align="right"] .patrik-radar-svg{ margin-left:auto; margin-right:0; }
        /* Inside a layout column a default-size chart fills its column share —
           this is what keeps a chart visually balanced against whatever sits
           beside it. Alone in a full-width row it is capped so it does not
           blow up to the whole section; sharing a row with other columns
           (:not(:only-child)) the cap is lifted entirely, because the column
           itself is already the size limit. An explicit data-size still wins:
           it is applied as an inline max-width. */
        .patrik-layout-col .patrik-radar-svg{ max-width:min(100%, 560px); }
        .patrik-layout-col:not(:only-child) .patrik-radar-svg{ max-width:100%; }
        .patrik-radar-chart .rc-grid-line{ fill:none; stroke:var(--rc-grid); stroke-width:1; }
        .patrik-radar-chart .rc-axis-line{ stroke:var(--rc-axis); stroke-width:1; }
        .patrik-radar-chart .rc-data-poly{ fill:var(--rc-fill); stroke:var(--rc-stroke); stroke-width:var(--rc-sw,2px); stroke-linejoin:round; }
        .patrik-radar-chart .rc-data-point{ fill:var(--rc-point); }
        .patrik-radar-chart .rc-label{ fill:var(--rc-label); font-size:var(--rc-fs,11px); font-weight:700; letter-spacing:.04em; text-anchor:middle; }
        `);
    }

    // Shared styling for the custom dropdown + the compare switcher, used by BOTH
    // the radar chart and the range-bar group. Injected on demand so a page that
    // has a range-bar comparison but no radar chart still gets it.
    function injectSelectStyles() {
        injectStyles("patrik-select-styles", `
        .patrik-radar-select, .patrik-range-select{
            -webkit-appearance:none; -moz-appearance:none; appearance:none;
            font-family:inherit; font-size:14px; font-weight:700;
            color:#eaf7fb; background-color:rgba(255,255,255,0.06);
            border:1px solid rgba(255,255,255,0.18); border-radius:10px;
            padding:9px 40px 9px 14px; cursor:pointer; outline:none; line-height:1.2;
            max-width:100%;
            background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23c7dce4' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
            background-repeat:no-repeat; background-position:right 13px center; background-size:14px;
            transition:border-color .15s, background-color .15s, box-shadow .15s;
        }
        .patrik-radar-select:hover, .patrik-range-select:hover{ background-color:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.28); }
        .patrik-radar-select:focus-visible, .patrik-range-select:focus-visible{ border-color:${TEAL}; box-shadow:0 0 0 3px rgba(56,182,211,0.28); }
        .patrik-radar-select option, .patrik-range-select option{ color:#0b131c; background:#eaf7fb; }
        /* Fully custom dropdown (built by JS, replaces the native select so the
           closed control AND the open list are themed). */
        .patrik-rc-select{ position:relative; display:inline-block; font-family:inherit; max-width:100%; }
        .patrik-rc-select-btn{
            -webkit-appearance:none; appearance:none;
            display:inline-flex; align-items:center; gap:10px;
            font-family:inherit; font-size:14px; font-weight:700; color:#eaf7fb;
            background-color:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.18);
            border-radius:10px; padding:9px 14px; cursor:pointer; outline:none; line-height:1.2;
            max-width:100%;
            transition:border-color .15s, background-color .15s, box-shadow .15s;
        }
        .patrik-rc-select-btn:hover{ background-color:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.30); }
        .patrik-rc-select-btn:focus-visible{ border-color:${TEAL}; box-shadow:0 0 0 3px rgba(56,182,211,0.28); }
        .patrik-rc-select-btn::after{
            content:""; width:12px; height:12px; margin-left:2px; flex:0 0 auto;
            background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23c7dce4' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") center/12px no-repeat;
            transition:transform .18s;
        }
        .patrik-rc-select-btn[aria-expanded="true"]::after{ transform:rotate(180deg); }
        .patrik-rc-select-label{ white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
        .patrik-rc-select-menu{
            position:absolute; z-index:60; top:calc(100% + 6px); left:0; min-width:100%;
            max-width:min(94vw, 360px);
            background:#0e1a22; border:1px solid rgba(255,255,255,0.14); border-radius:12px;
            padding:6px; box-shadow:0 18px 44px rgba(0,0,0,0.55); max-height:260px; overflow:auto;
        }
        .patrik-rc-select-menu[hidden]{ display:none; }
        .patrik-rc-select-opt{
            display:block; width:100%; text-align:left; white-space:nowrap;
            overflow:hidden; text-overflow:ellipsis;
            font-family:inherit; font-size:13.5px; font-weight:600; color:#c7dce4;
            background:transparent; border:0; border-radius:8px; padding:8px 12px; cursor:pointer;
            transition:background-color .12s, color .12s;
        }
        .patrik-rc-select-opt:hover, .patrik-rc-select-opt.is-active{ background:rgba(56,182,211,0.16); color:#eaf7fb; }
        .patrik-rc-select-opt[aria-selected="true"]{ background:rgba(56,182,211,0.30); color:#ffffff; }
        /* Compare-models switcher: a centred eyebrow + prominent dropdown pill. */
        .patrik-rc-compare{
            display:flex; flex-direction:column; align-items:center; gap:9px;
            margin:0 auto 20px; text-align:center; max-width:100%;
        }
        .patrik-rc-compare-label{
            font-family:inherit; font-size:10.5px; font-weight:700; letter-spacing:.2em;
            text-transform:uppercase; color:#7fb4c4;
        }
        .patrik-rc-compare .patrik-rc-select-btn{
            min-width:min(220px, 100%); justify-content:space-between; font-size:15px; padding:11px 16px;
        }
        .patrik-rc-compare .patrik-rc-select-menu{ left:50%; transform:translateX(-50%); }
        /* Alignment: data-align="left|center|right" on the component (radar chart
           or range group) shifts the compare switcher (and, for the radar, the
           chart). Default is centred. */
        [data-align="left"] > .patrik-rc-compare{ align-items:flex-start; text-align:left; margin-left:0; margin-right:auto; }
        [data-align="right"] > .patrik-rc-compare{ align-items:flex-end; text-align:right; margin-left:auto; margin-right:0; }
        [data-align="left"] > .patrik-rc-compare .patrik-rc-select-menu{ left:0; transform:none; }
        [data-align="right"] > .patrik-rc-compare .patrik-rc-select-menu{ left:auto; right:0; transform:none; }
        `);
    }

    /* ---- axis-label layout --------------------------------------------
       Labels sit OUTSIDE the 300x300 octagon, so with a fixed "0 0 400 400"
       viewBox a long label (e.g. "HIGH-END CONTROL") runs past the edge of
       the SVG box and gets cut off by whatever host container clips it.
       Three things keep every label inside the component's own box:
         1. side-aware text-anchor  - a label beside the chart starts/ends at
            its axis instead of straddling it, so it reaches half as far out;
         2. wrapping                - a label that would still leave the box is
            split over two lines at the space nearest its middle (side labels
            wrap eagerly — their width is subtracted from the polygon's);
         3. fitRadarViewBox()       - the viewBox is shrink-wrapped to what was
            actually drawn, measured with getBBox(), so the polygon claims as
            much of the rendered width as the labels leave it.
       Everything is drawn in the original 0..400 coordinates; only the
       viewBox changes, so the chart keeps its geometry and just scales
       with the room its labels leave.

       READABILITY AT SMALL RENDERED SIZES. Font-size inside an SVG is in
       user units: a chart squeezed into a 300px column renders an 11-unit
       label at ~7px — unreadable, and the single biggest mobile problem.
       The renderer therefore SCALE-COMPENSATES: after drawing it measures
       how many real pixels one user unit is worth (rendered width /
       viewBox width) and, if the labels would land below the readable
       target, redraws them at a larger user-unit size (which also wraps
       them earlier). Point radius, outline width and label offsets scale
       along with the type so the chart stays proportionate. The host is
       width-watched, so entering/leaving a narrow column re-runs this.
       -------------------------------------------------------------------- */
    const FIT_PAD = 6;    // breathing room left around the fitted drawing

    // Width of a rendered <text>, with a character-count fallback for when the
    // SVG is not laid out (hidden tab / display:none) and measuring returns 0.
    function textWidth(node, str, fontSize) {
        let w = 0;
        try { w = node.getComputedTextLength(); } catch (e) { w = 0; }
        return w || str.length * fontSize * 0.66;
    }

    // Split a label into two balanced lines at the space nearest its middle.
    // Returns a single-element array when there is nothing to break on.
    function wrapLabel(str) {
        const words = String(str).split(/\s+/).filter(Boolean);
        if (words.length < 2) return [str];
        let at = 1, best = Infinity;
        for (let i = 1; i < words.length; i++) {
            const diff = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
            if (diff < best) { best = diff; at = i; }
        }
        return [words.slice(0, at).join(" "), words.slice(at).join(" ")];
    }

    // SHRINK-WRAP the viewBox to what was actually drawn (+FIT_PAD). Growing
    // catches labels that run past the 0..400 box; shrinking matters just as
    // much — the polygon is only 300 of the base 400 units, so keeping the
    // empty base margins would waste ~12% of the rendered width and make the
    // chart look smaller than whatever sits beside it.
    function fitRadarViewBox(svg) {
        let box = null;
        try { box = svg.getBBox(); } catch (e) { box = null; }
        if (!box || !box.width || !box.height) {
            svg.setAttribute("viewBox", "0 0 400 400");
            return;
        }
        const x0 = box.x - FIT_PAD;
        const y0 = box.y - FIT_PAD;
        const w = box.width + FIT_PAD * 2;
        const h = box.height + FIT_PAD * 2;
        svg.setAttribute("viewBox", x0 + " " + y0 + " " + w + " " + h);
    }

    // Re-draw every chart when webfonts finish loading (they change the text
    // metrics the wrapping is computed from). Width changes are handled per
    // chart by observeWidth.
    function watchRadarMetrics() {
        if (watchRadarMetrics.done) return;
        watchRadarMetrics.done = true;
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                document.querySelectorAll("svg.patrik-radar-svg").forEach((svg) => {
                    if (typeof svg.pcRedraw === "function") svg.pcRedraw();
                });
            });
        }
    }

    // Low-level renderer. `target` is an <svg> element or an element id.
    // `opts` (optional): { fillColor:{r,g,b}, fillPeak:Number } — the polygon is
    // ALWAYS a smooth vertical fade of fillColor, from fillPeak opacity at the
    // top down to a faint tail. Changing the colour keeps the gradient; only the
    // hue changes.
    function renderRadarChart(target, data, opts, _depth) {
        const svg = typeof target === "string" ? document.getElementById(target) : target;
        if (!svg || !Array.isArray(data) || !data.length) return;
        opts = opts || {};
        _depth = _depth || 0;

        // Scale-compensated label size (user units), carried across redraws so a
        // resize starts from the last good value. k scales the chart furniture
        // (points, outline, offsets) in step with the type.
        const fontUser = clamp(svg.__pcFont || 11, 10, 26);
        const k = clamp(fontUser / 11, 1, 2);
        const lineH = Math.round(fontUser * 1.18);
        svg.style.setProperty("--rc-fs", fontUser.toFixed(2) + "px");
        svg.style.setProperty("--rc-sw", (2 * k).toFixed(2) + "px");

        svg.innerHTML = "";
        const centerX = 200, centerY = 200, maxRadius = 150;
        const numAxes = data.length;

        // Smooth fill gradient (the "signature" look) — always on, hue-driven.
        let fillRef = null;
        {
            const c = opts.fillColor || { r: 56, g: 182, b: 211 };
            const peak = opts.fillPeak != null ? opts.fillPeak : 0.45;
            const gid = "pc-rc-grad-" + (++gradSeq);
            const defs = document.createElementNS(NS, "defs");
            const lg = document.createElementNS(NS, "linearGradient");
            lg.setAttribute("id", gid);
            lg.setAttribute("x1", "0"); lg.setAttribute("y1", "0");
            lg.setAttribute("x2", "0"); lg.setAttribute("y2", "1");
            [[0, peak], [1, Math.max(0.04, peak * 0.18)]].forEach(([offset, alpha]) => {
                const stop = document.createElementNS(NS, "stop");
                stop.setAttribute("offset", (offset * 100) + "%");
                stop.setAttribute("stop-color", "rgb(" + c.r + "," + c.g + "," + c.b + ")");
                stop.setAttribute("stop-opacity", alpha);
                lg.appendChild(stop);
            });
            defs.appendChild(lg);
            svg.appendChild(defs);
            fillRef = "url(#" + gid + ")";
        }

        const getXY = (angle, radius) => ({
            x: centerX + radius * Math.cos(angle - Math.PI / 2),
            y: centerY + radius * Math.sin(angle - Math.PI / 2)
        });

        // 1. Grid
        for (let i = 1; i <= 5; i++) {
            const r = (maxRadius / 5) * i;
            const points = data.map((_, a) => {
                const p = getXY((Math.PI * 2 / numAxes) * a, r);
                return p.x + "," + p.y;
            }).join(" ");

            const poly = document.createElementNS(NS, "polygon");
            poly.setAttribute("points", points);
            poly.setAttribute("class", "rc-grid-line");
            svg.appendChild(poly);
        }

        // 2. Axes & Labels
        data.forEach((item, i) => {
            const angle = (Math.PI * 2 / numAxes) * i;
            const outer = getXY(angle, maxRadius);

            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", centerX); line.setAttribute("y1", centerY);
            line.setAttribute("x2", outer.x); line.setAttribute("y2", outer.y);
            line.setAttribute("class", "rc-axis-line");
            svg.appendChild(line);

            // Which side of the chart the axis points to. A label out to the
            // side is anchored at its inner edge (start/end) so it only grows
            // outward; one above or below the chart stays centred on its axis.
            const dirX = Math.cos(angle - Math.PI / 2);
            const dirY = Math.sin(angle - Math.PI / 2);
            const side = Math.abs(dirX) < 0.25 ? 0 : (dirX > 0 ? 1 : -1);
            // Offsets grow with the compensated type so bigger labels keep
            // clearing the octagon — kept as tight as legibility allows,
            // because every unit of side offset is a unit the polygon loses.
            const labelPos = getXY(angle, maxRadius + (side ? 5 + fontUser * 0.4 : 8 + fontUser));

            const text = document.createElementNS(NS, "text");
            text.setAttribute("class", "rc-label");
            // Inline style, not the text-anchor attribute: the stylesheet's
            // `text-anchor:middle` rule would otherwise win over it.
            text.style.textAnchor = side === 0 ? "middle" : (side > 0 ? "start" : "end");
            text.textContent = item.label;
            svg.appendChild(text);

            // Measure in place. SIDE labels wrap eagerly (any multi-word label
            // wider than ~8 characters): they extend the viewBox sideways, and
            // every unit of label width is a unit of polygon width lost — the
            // main reason charts used to look small next to other blocks.
            // Top/bottom labels sit over empty air, so they only wrap when
            // they would actually run outside the box.
            const w = textWidth(text, item.label, fontUser);
            const x0 = side > 0 ? labelPos.x : side < 0 ? labelPos.x - w : labelPos.x - w / 2;
            const lines = (side !== 0 && w > fontUser * 7) || (x0 < FIT_PAD || x0 + w > 400 - FIT_PAD)
                ? wrapLabel(item.label)
                : [item.label];

            // Keep the block where the single line used to sit: labels above the
            // chart grow upward, labels below grow downward, side ones centre.
            const grow = dirY < -0.25 ? (lines.length - 1) : dirY > 0.25 ? 0 : (lines.length - 1) / 2;
            text.setAttribute("x", labelPos.x);
            text.setAttribute("y", labelPos.y + 5 - grow * lineH);

            if (lines.length > 1) {
                text.textContent = "";
                lines.forEach((ln, j) => {
                    const tspan = document.createElementNS(NS, "tspan");
                    tspan.setAttribute("x", labelPos.x);
                    if (j) tspan.setAttribute("dy", lineH);
                    tspan.textContent = ln;
                    text.appendChild(tspan);
                });
            }
        });

        // 3. Data Polygon
        const dataPoints = data.map((item, i) => {
            const p = getXY((Math.PI * 2 / numAxes) * i, (item.value / 100) * maxRadius);
            return p.x + "," + p.y;
        }).join(" ");

        const dataPoly = document.createElementNS(NS, "polygon");
        dataPoly.setAttribute("points", dataPoints);
        dataPoly.setAttribute("class", "rc-data-poly");
        // Inline style, not a presentation attribute: a CSS `fill:var(--rc-fill)`
        // rule would otherwise win over an SVG fill attribute and hide the gradient.
        if (fillRef) dataPoly.style.fill = fillRef;
        svg.appendChild(dataPoly);

        // 4. Data Points
        data.forEach((item, i) => {
            const p = getXY((Math.PI * 2 / numAxes) * i, (item.value / 100) * maxRadius);
            const circle = document.createElementNS(NS, "circle");
            circle.setAttribute("cx", p.x); circle.setAttribute("cy", p.y);
            circle.setAttribute("r", (4 * k).toFixed(2));
            circle.setAttribute("class", "rc-data-point");
            svg.appendChild(circle);
        });

        // 5. Size the box around what was actually drawn, labels included.
        fitRadarViewBox(svg);

        // 6. Scale compensation: how many real pixels is one user unit worth?
        //    If the labels land below the readable target, redraw at a larger
        //    user-unit size (capped at two passes — the wrap changes the
        //    viewBox, so the value converges rather than lands exactly).
        //    clientWidth, not getBoundingClientRect: the layout box ignores CSS
        //    transforms, so a preview thumbnail scaled down with transform:scale
        //    keeps the same label proportions as the full-size component.
        const rect = { width: svg.clientWidth || (svg.getBoundingClientRect ? svg.getBoundingClientRect().width : 0) };
        if (rect.width > 1 && _depth < 2) {
            const vb = (svg.getAttribute("viewBox") || "0 0 400 400").split(/[\s,]+/);
            const vbW = num(vb[2], 400) || 400;
            const scale = rect.width / vbW;
            // Readable target in real px: ~11px on a desktop-size chart, easing
            // down to 10px on a small one, never below.
            const targetPx = clamp(rect.width * 0.03, 10, 11.5);
            const want = clamp(targetPx / scale, 10, 26);
            if (Math.abs(want - fontUser) > 0.75) {
                svg.__pcFont = want;
                return renderRadarChart(svg, data, opts, _depth + 1);
            }
        }

        // Remember how to re-draw this chart (font loads, width changes).
        svg.pcRedraw = function () { renderRadarChart(svg, data, opts, 0); };
        watchRadarMetrics();

        // Watch the host's width: a chart first drawn hidden (tab, accordion)
        // redraws the moment it gets a size, and any later resize re-runs the
        // scale compensation. Redrawing changes the chart's height, never the
        // host's width, so this cannot loop.
        const host = svg.parentElement;
        if (host && !svg.__pcObserved) {
            svg.__pcObserved = true;
            svg.__pcW = Math.round(rect.width);
            observeWidth(host, function (w) {
                const nw = Math.round(w);
                if (Math.abs(nw - (svg.__pcW || 0)) > 2) {
                    svg.__pcW = nw;
                    if (typeof svg.pcRedraw === "function") svg.pcRedraw();
                }
            });
        }
    }

    // Replace a native <select> with a fully custom, themed dropdown. The native
    // element is kept (hidden) as the source of truth and for no-JS / accessibility
    // fallback; `onChange` fires with the chosen value. Shared by the radar chart's
    // and the range group's compare switchers.
    function buildCustomSelect(nativeSelect, onChange) {
        if (nativeSelect.dataset.pcEnhanced) return;
        nativeSelect.dataset.pcEnhanced = "1";
        injectSelectStyles();

        const opts = Array.from(nativeSelect.options).map(o => ({ value: o.value, label: o.textContent }));
        if (!opts.length) return;
        let sel = nativeSelect.selectedIndex < 0 ? 0 : nativeSelect.selectedIndex;
        let active = sel;

        const wrap = document.createElement("div");
        wrap.className = "patrik-rc-select";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "patrik-rc-select-btn";
        btn.setAttribute("aria-haspopup", "listbox");
        btn.setAttribute("aria-expanded", "false");
        const label = document.createElement("span");
        label.className = "patrik-rc-select-label";
        label.textContent = opts[sel].label;
        btn.appendChild(label);

        const menu = document.createElement("div");
        menu.className = "patrik-rc-select-menu";
        menu.setAttribute("role", "listbox");
        menu.hidden = true;

        const optEls = opts.map((o, i) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "patrik-rc-select-opt";
            b.setAttribute("role", "option");
            b.setAttribute("aria-selected", i === sel ? "true" : "false");
            b.textContent = o.label;
            b.addEventListener("click", () => choose(i));
            b.addEventListener("mousemove", () => setActive(i));
            menu.appendChild(b);
            return b;
        });

        function setActive(i) {
            active = clamp(i, 0, opts.length - 1);
            optEls.forEach((e, j) => e.classList.toggle("is-active", j === active));
            optEls[active].scrollIntoView({ block: "nearest" });
        }
        function open() {
            if (!menu.hidden) return;
            menu.hidden = false;
            btn.setAttribute("aria-expanded", "true");
            setActive(sel);
            document.addEventListener("mousedown", onDoc);
            document.addEventListener("keydown", onKey);
        }
        function close() {
            if (menu.hidden) return;
            menu.hidden = true;
            btn.setAttribute("aria-expanded", "false");
            document.removeEventListener("mousedown", onDoc);
            document.removeEventListener("keydown", onKey);
        }
        function choose(i) {
            sel = i;
            label.textContent = opts[i].label;
            optEls.forEach((e, j) => e.setAttribute("aria-selected", j === i ? "true" : "false"));
            nativeSelect.selectedIndex = i;
            close();
            btn.focus();
            onChange(opts[i].value);
        }
        function onDoc(e) { if (!wrap.contains(e.target)) close(); }
        function onKey(e) {
            if (e.key === "Escape") { close(); btn.focus(); }
            else if (e.key === "ArrowDown") { e.preventDefault(); setActive(active + 1); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive(active - 1); }
            else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(active); }
        }

        btn.addEventListener("click", () => (menu.hidden ? open() : close()));
        btn.addEventListener("keydown", (e) => {
            if (menu.hidden && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ")) {
                e.preventDefault();
                open();
            }
        });

        wrap.appendChild(btn);
        wrap.appendChild(menu);
        nativeSelect.style.display = "none";
        nativeSelect.parentNode.insertBefore(wrap, nativeSelect.nextSibling);
    }

    function renderRadarComponent(el) {
        injectRadarStyles();
        const d = el.dataset;

        // colour overrides -> CSS variables
        if (d.fill)       el.style.setProperty("--rc-fill", d.fill);
        if (d.stroke)     el.style.setProperty("--rc-stroke", d.stroke);
        if (d.point)      el.style.setProperty("--rc-point", d.point);
        if (d.grid)       el.style.setProperty("--rc-grid", d.grid);
        if (d.axisColor)  el.style.setProperty("--rc-axis", d.axisColor);
        if (d.labelColor) el.style.setProperty("--rc-label", d.labelColor);

        const axes = splitList(d.axes);
        if (!axes.length) return;

        // The fill is always a gradient; the chosen colour is just its hue. Take
        // the hue from data-fill (or the outline, or teal). If data-fill carries
        // an alpha (e.g. rgba(...)), that alpha becomes the gradient's peak.
        const baseColor = parseColor(d.fill) || parseColor(d.stroke) || parseColor(TEAL);
        // An explicit alpha (from the builder's intensity slider) sets the peak,
        // monotonically across 0..1; a bare hex fill keeps the default peak.
        const fillPeak = d.fill && baseColor && baseColor.hasAlpha ? baseColor.a : 0.45;
        const gradientOpts = { fillColor: baseColor, fillPeak };

        // ensure an <svg> exists (created here, not in HTML)
        let svg = el.querySelector("svg.patrik-radar-svg");
        if (!svg) {
            svg = document.createElementNS(NS, "svg");
            svg.setAttribute("class", "patrik-radar-svg");
            svg.setAttribute("viewBox", "0 0 400 400");
            el.appendChild(svg);
        }
        // data-size caps the chart's width in px. Without it the stylesheet
        // rules apply: 460px standalone, the column share inside a layout.
        if (d.size) svg.style.maxWidth = "min(" + num(d.size, 460) + "px, 100%)";

        const build = (valuesStr) => {
            const values = splitList(valuesStr).map(v => num(v, 0));
            const data = axes.map((label, i) => ({ label, value: values[i] != null ? values[i] : 0 }));
            renderRadarChart(svg, data, gradientOpts);
        };

        const select = el.querySelector("select.patrik-radar-select");
        if (select) {
            const idx = select.selectedIndex < 0 ? 0 : select.selectedIndex;
            build(select.options[idx].value);
            // Native change (keyboard / no-JS fallback) still re-renders.
            select.addEventListener("change", () => build(select.options[select.selectedIndex].value));
            // Upgrade to the custom themed dropdown.
            buildCustomSelect(select, (value) => build(value));
        } else if (d.values) {
            build(d.values);
        }
    }


    /* ==================================================================
       2) RANGE BARS  (feel / rider goals)
       ------------------------------------------------------------------
       Two-pole:
         <div class="patrik-range-bar"
              data-title="Power delivery"
              data-left="Direct" data-right="Smooth"
              data-min="20" data-max="60"></div>

       Scale (evenly spaced stop labels under the bar):
         <div class="patrik-range-bar"
              data-title="Rider level"
              data-scale="Entry,Intermediate,Advanced,Pro"
              data-scale-index="true"
              data-min="1" data-max="3"></div>

       Optional: data-value (single marker 0-100)
       Colours: data-track  data-range  data-text  data-border
       (data-range accepts a solid colour; leave it unset for the smooth
       teal gradient fill.)

       Each bar watches its own width and steps its type/track down as it
       narrows (data-pc-w = md / sm / xs), so a bar in a phone column and
       a bar in a narrow desktop column both stay legible.
       ================================================================== */

    function injectRangeBarStyles() {
        injectStyles("patrik-range-bar-styles", `
        .patrik-range-bar{
            --rb-track:rgba(255,255,255,0.06);
            /* Same translucent teal fill + crisp edge as the radar polygon,
               faded left-to-right along the band. */
            --rb-range:linear-gradient(90deg,rgba(56,182,211,0.65),rgba(56,182,211,0.22));
            --rb-range-edge:rgba(56,182,211,0.65);
            --rb-text:#c7dce4;
            --rb-border:rgba(255,255,255,0.10);
            font-family:inherit;
            margin:0 0 22px;
            color:var(--rb-text);
        }
        .patrik-rb-title{
            font-size:12px; font-weight:700; letter-spacing:.06em;
            text-transform:uppercase; text-align:right; margin:0 2px 6px 0; opacity:.85;
        }
        .patrik-rb-track{
            position:relative; height:40px; background:var(--rb-track);
            border:1px solid var(--rb-border); border-radius:10px; overflow:hidden;
        }
        .patrik-rb-range{
            position:absolute; top:0; bottom:0; background:var(--rb-range); border-radius:8px;
            box-shadow:inset 0 0 0 1px var(--rb-range-edge);
        }
        .patrik-rb-marker{
            position:absolute; top:-2px; bottom:-2px; width:3px;
            background:var(--rb-text); border-radius:2px; transform:translateX(-50%);
        }
        .patrik-rb-pole{
            position:absolute; top:50%; transform:translateY(-50%);
            font-size:14px; font-weight:700; z-index:2; pointer-events:none; white-space:nowrap;
        }
        .patrik-rb-pole.left{ left:12px; }
        .patrik-rb-pole.right{ right:12px; }
        .patrik-rb-scale{ position:relative; margin-top:6px; height:16px; }
        .patrik-rb-stop{
            position:absolute; top:0; transform:translateX(-50%);
            font-size:10px; font-weight:600; opacity:.7; white-space:nowrap;
        }
        .patrik-rb-stop:first-child{ transform:translateX(0); }
        .patrik-rb-stop:last-child{ transform:translateX(-100%); }
        /* Width steps (set by JS from the bar's own rendered width). */
        .patrik-range-bar[data-pc-w="sm"] .patrik-rb-pole{ font-size:12px; }
        .patrik-range-bar[data-pc-w="sm"] .patrik-rb-pole.left{ left:10px; }
        .patrik-range-bar[data-pc-w="sm"] .patrik-rb-pole.right{ right:10px; }
        .patrik-range-bar[data-pc-w="xs"] .patrik-rb-track{ height:34px; }
        .patrik-range-bar[data-pc-w="xs"] .patrik-rb-title{ font-size:11px; }
        .patrik-range-bar[data-pc-w="xs"] .patrik-rb-pole{ font-size:11px; }
        .patrik-range-bar[data-pc-w="xs"] .patrik-rb-pole.left{ left:8px; }
        .patrik-range-bar[data-pc-w="xs"] .patrik-rb-pole.right{ right:8px; }
        .patrik-range-bar[data-pc-w="xs"] .patrik-rb-stop{ font-size:9px; }
        `);
    }

    // Step a bar's type down as it narrows. Attribute, not inline styles, so
    // the stylesheet stays the single source of what each step looks like.
    function watchRangeBarWidth(el) {
        if (el.__pcObserved) return;
        el.__pcObserved = true;
        observeWidth(el, function (w) {
            const step = w <= 0 ? "" : w < 340 ? "xs" : w < 520 ? "sm" : "md";
            if (step && el.dataset.pcW !== step) el.dataset.pcW = step;
        });
    }

    function renderRangeBar(el) {
        injectRangeBarStyles();
        const d = el.dataset;

        // colour overrides -> CSS variables
        if (d.track)  el.style.setProperty("--rb-track", d.track);
        if (d.range) {
            // The band is always a gradient of the chosen colour (same fade look
            // as the radar fill), not a flat block — changing it re-hues, never
            // drops the gradient.
            const c = parseColor(d.range);
            if (c) {
                el.style.setProperty("--rb-range", fillGradientCss(c, 0.65));
                el.style.setProperty("--rb-range-edge", rgba(c, 0.7));
            } else {
                el.style.setProperty("--rb-range", d.range);
                el.style.setProperty("--rb-range-edge", d.range);
            }
        }
        if (d.text)   el.style.setProperty("--rb-text", d.text);
        if (d.border) el.style.setProperty("--rb-border", d.border);

        const scale = d.scale ? splitList(d.scale) : null;

        // Resolve band start/end as percentages 0..100
        let minPct, maxPct;
        if (scale && d.scaleIndex !== undefined) {
            const last = scale.length - 1 || 1;
            minPct = (num(d.min, 0) / last) * 100;
            maxPct = (num(d.max, last) / last) * 100;
        } else {
            minPct = num(d.min, 0);
            maxPct = num(d.max, 100);
        }
        minPct = clamp(minPct, 0, 100);
        maxPct = clamp(maxPct, 0, 100);
        if (maxPct < minPct) { const t = minPct; minPct = maxPct; maxPct = t; }

        el.innerHTML = "";

        if (d.title) {
            const title = document.createElement("div");
            title.className = "patrik-rb-title";
            title.textContent = d.title;
            el.appendChild(title);
        }

        const track = document.createElement("div");
        track.className = "patrik-rb-track";

        const band = document.createElement("div");
        band.className = "patrik-rb-range";
        band.style.left = minPct + "%";
        band.style.width = (maxPct - minPct) + "%";
        track.appendChild(band);

        if (d.value !== undefined) {
            const marker = document.createElement("div");
            marker.className = "patrik-rb-marker";
            marker.style.left = clamp(num(d.value, 0), 0, 100) + "%";
            track.appendChild(marker);
        }

        if (!scale) {
            if (d.left) {
                const l = document.createElement("span");
                l.className = "patrik-rb-pole left";
                l.textContent = d.left;
                track.appendChild(l);
            }
            if (d.right) {
                const r = document.createElement("span");
                r.className = "patrik-rb-pole right";
                r.textContent = d.right;
                track.appendChild(r);
            }
        }

        el.appendChild(track);

        if (scale && scale.length) {
            const row = document.createElement("div");
            row.className = "patrik-rb-scale";
            const last = scale.length - 1 || 1;
            scale.forEach((label, i) => {
                const stop = document.createElement("span");
                stop.className = "patrik-rb-stop";
                stop.style.left = (i / last) * 100 + "%";
                stop.textContent = label;
                row.appendChild(stop);
            });
            el.appendChild(row);
        }

        watchRangeBarWidth(el);
    }


    /* ==================================================================
       RANGE BAR GROUP  (model comparison for a set of bars)
       ------------------------------------------------------------------
       A group holds several .patrik-range-bar (their titles / poles /
       scale stay fixed) plus a selector whose options switch every bar's
       band at once. Each option value is one "min:max" pair per bar, in
       bar order:

         <div class="patrik-range-bar-group">
             <div class="patrik-rc-compare">
                 <span class="patrik-rc-compare-label">Compare models</span>
                 <select class="patrik-range-select">
                     <option value="25:62,45:80,1:3">Model A</option>
                     <option value="30:70,55:85,2:3">Model B</option>
                 </select>
             </div>
             <div class="patrik-range-bar" data-title="Power delivery"
                  data-left="Direct" data-right="Smooth"></div>
             <div class="patrik-range-bar" data-title="Rider level"
                  data-scale="Entry,Intermediate,Advanced,Pro"
                  data-scale-index="true"></div>
         </div>
       ================================================================== */
    function renderRangeGroup(group) {
        const select = group.querySelector("select.patrik-range-select");
        const bars = Array.from(group.querySelectorAll(".patrik-range-bar"));
        if (!bars.length) return;

        // data-size caps the group's width (never past its container);
        // alignment then places it.
        if (group.dataset.size) {
            group.style.maxWidth = "min(" + num(group.dataset.size, 720) + "px, 100%)";
            const al = group.dataset.align;
            group.style.marginLeft = al === "left" ? "0" : "auto";
            group.style.marginRight = al === "right" ? "0" : "auto";
        }

        const apply = (value) => {
            const pairs = splitList(value).map(p => p.split(":"));
            bars.forEach((bar, i) => {
                const pair = pairs[i];
                if (pair) {
                    if (pair[0] != null && pair[0].trim() !== "") bar.dataset.min = pair[0].trim();
                    if (pair[1] != null && pair[1].trim() !== "") bar.dataset.max = pair[1].trim();
                }
                renderRangeBar(bar);
            });
        };

        if (select && select.options.length) {
            const idx = select.selectedIndex < 0 ? 0 : select.selectedIndex;
            apply(select.options[idx].value);
            select.addEventListener("change", () => apply(select.options[select.selectedIndex].value));
            buildCustomSelect(select, apply);
        } else {
            // No selector: just render the bars with their own min/max.
            bars.forEach(renderRangeBar);
        }
    }


    /* ==================================================================
       3) SECTION LAYOUT  (rows & columns)
       ------------------------------------------------------------------
       The layout markup is pure structure — classes + data-* config, no
       inline styles. This script owns ALL of its styling, including the
       responsive behaviour, so the pasted HTML stays clean and every
       page picks up layout improvements from the shared script.

         <div class="patrik-layout" data-max="1200" data-row-gap="56">
             <div class="patrik-layout-row" data-gap="32" data-wrap="320">
                 <div class="patrik-layout-col" data-span="2" data-inset-x="10">
                     <div class="patrik-layout-cell">
                         ...any patrik component / heading / text...
                     </div>
                 </div>
                 <div class="patrik-layout-col" data-span="1">...</div>
             </div>
         </div>

       Row (all optional):
         data-gap        px between columns            (default 32)
         data-stack-gap  px between the columns once the row has wrapped
                         and they sit stacked (default: follows data-gap)
         data-wrap     column width below which the row stacks (default 320)
         data-valign   top|center|bottom|stretch       (default top)
         data-justify  left|center|right               (default center)
         data-band     background colour -> the row becomes a padded band
         data-pad-x / data-pad-y / data-radius   band padding + rounding

       Column:
         data-span     width share relative to its siblings (default 1)
         data-inset-x  % of the column kept clear on each side — desktop
                       breathing room between neighbours; fades to zero as
                       the section narrows so phones get the full width
         data-inset-y  px above/below
         (either inset needs the inner .patrik-layout-cell wrapper)

       Content blocks (all data-* optional — defaults in the stylesheet):
         .patrik-layout-heading   data-size(px) data-align data-color
         .patrik-layout-text      data-size(px) data-align data-color
         .patrik-layout-image     data-width(%) data-radius(px) data-align
         .patrik-layout-cta > .patrik-layout-button
                                  data-align on the cta;
                                  data-variant="outline" data-color on the button
         .patrik-layout-spacer    data-height(px)
         .patrik-layout-divider   data-color

       RESPONSIVENESS: the script mirrors the section's rendered width
       into --pl-w (a unitless number on the root), and the stylesheet
       derives everything fluid from it — gaps, band padding, spacer
       heights and heading sizes all scale down with the section itself,
       with min()/clamp() so desktop keeps the configured values. Columns
       stack via flex-wrap + min-width, so no media queries anywhere.

       Legacy note: layouts generated before this version carried inline
       styles and no data-max; they are detected and left untouched.
       ================================================================== */

    const PL_VALIGN = { top: "flex-start", center: "center", bottom: "flex-end", stretch: "stretch" };
    const PL_JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" };

    function injectLayoutStyles() {
        injectStyles("patrik-layout-styles", `
        .patrik-layout{
            display:flex; flex-direction:column; box-sizing:border-box;
            width:100%; max-width:var(--pl-max,1200px); margin:0 auto;
            gap:min(var(--pl-row-gap,56px), calc(var(--pl-w,1200) * 0.1px));
        }
        /* The gap splits into its two axes: column-gap sits BETWEEN columns on
           one line, row-gap between the lines once the row has wrapped — i.e.
           between stacked blocks on a phone. data-stack-gap sets the stacked
           spacing on its own (exact px, the author is deliberately tuning the
           narrow view); without it the stacked spacing follows the fluid
           column gap, which is what rows always did. */
        .patrik-layout-row{
            display:flex; flex-wrap:wrap; box-sizing:border-box;
            column-gap:min(var(--pl-gap,32px), calc(var(--pl-w,1200) * 0.055px));
            row-gap:var(--pl-stack-gap, min(var(--pl-gap,32px), calc(var(--pl-w,1200) * 0.055px)));
            align-items:var(--pl-valign,flex-start);
            justify-content:var(--pl-justify,center);
            padding:min(var(--pl-pad-y,0px), calc(var(--pl-w,1200) * 0.08px))
                    min(var(--pl-pad-x,0px), calc(var(--pl-w,1200) * 0.05px));
            background:var(--pl-band,transparent);
            border-radius:var(--pl-band-radius,0px);
        }
        /* flex-GROW is what makes stacking work: when a column wraps onto its
           own line its flex-basis is still the desktop share (e.g. 50% - gap),
           so without grow it would sit at its min-width — a 320px stub
           centred in the row — instead of filling it. With grow it expands to
           the full line. Desktop is untouched: the bases of a row's columns
           already sum to ~100%, so there is no free space to grow into and
           the span ratios hold. */
        .patrik-layout-col{
            box-sizing:border-box;
            flex:1 1 var(--pl-basis,100%);
            min-width:min(100%, var(--pl-wrap,320px));
            max-width:100%;
        }
        /* The inset lives on this inner cell, never on the column itself: a
           percentage padding resolves against the containing block, so on the
           column it would be a share of the whole row instead of the column.
           Horizontal insets are breathing room BETWEEN side-by-side columns —
           on a narrow section the columns have stacked and the inset would
           only shrink the content, so it ramps down with the section width
           and is gone at phone size (0 at 480px, fully back by ~1000px).
           clamp() keeps the authored value as the ceiling, so desktop is
           untouched and legacy pasted layouts heal themselves on mobile. */
        .patrik-layout-cell{
            box-sizing:border-box; width:100%;
            padding:var(--pl-iy,0px) clamp(0%, calc((var(--pl-w,1200) - 480) * 0.08%), var(--pl-ix,0%));
        }
        .patrik-layout-heading{
            margin:0; font-family:inherit; font-weight:800; letter-spacing:.01em;
            line-height:1.18; overflow-wrap:break-word;
            color:var(--pl-color,#eaf7fb); text-align:var(--pl-align,center);
            font-size:clamp(calc(var(--pl-fs,28px) * 0.6 + 4px), calc(var(--pl-w,1200) * 0.05px), var(--pl-fs,28px));
        }
        .patrik-layout-text{
            margin:0; font-family:inherit; line-height:1.65; overflow-wrap:break-word;
            color:var(--pl-color,#c7dce4); text-align:var(--pl-align,center);
            font-size:clamp(calc(var(--pl-fs,15px) * 0.87), calc(var(--pl-w,1200) * 0.045px), var(--pl-fs,15px));
        }
        .patrik-layout-image{
            display:block; width:var(--pl-width,100%); max-width:100%; height:auto;
            border-radius:var(--pl-img-radius,14px); margin:var(--pl-margin,0 auto);
        }
        .patrik-layout-cta{ text-align:var(--pl-align,center); }
        .patrik-layout-button{
            display:inline-block; font-family:inherit; font-size:14px; font-weight:700;
            letter-spacing:.02em; line-height:1; padding:13px 24px; border-radius:10px;
            text-decoration:none; background:var(--pl-btn,${TEAL}); color:#06222b;
            border:1px solid transparent;
        }
        .patrik-layout-button[data-variant="outline"]{
            background:transparent; color:var(--pl-btn,${TEAL});
            border-color:var(--pl-btn-soft,rgba(56,182,211,0.55));
        }
        .patrik-layout-spacer{ height:min(var(--pl-h,48px), calc(var(--pl-w,1200) * 0.12px)); }
        .patrik-layout-divider{ height:1px; width:100%; background:var(--pl-line,rgba(199,220,228,0.22)); }
        /* Components sized by their column, never overflowing it. */
        .patrik-layout-col .patrik-range-bar-group,
        .patrik-layout-col .patrik-range-bar{ max-width:100%; }
        `);
    }

    function renderLayout(root) {
        injectLayoutStyles();
        // Legacy snippets (pre data-* format) carry their whole layout as inline
        // styles and no data-max — they already work; leave them exactly as-is.
        if (!root.dataset.max && root.getAttribute("style")) return;

        root.style.setProperty("--pl-max", num(root.dataset.max, 1200) + "px");
        root.style.setProperty("--pl-row-gap", num(root.dataset.rowGap, 56) + "px");

        // Mirror the section's rendered width into --pl-w; everything fluid in
        // the stylesheet derives from it. Rounded, and only written on change,
        // so style writes cannot feed the observer back into itself.
        if (!root.__pcObserved) {
            root.__pcObserved = true;
            observeWidth(root, function (w) {
                const nw = String(Math.max(1, Math.round(w)));
                if (root.style.getPropertyValue("--pl-w") !== nw) root.style.setProperty("--pl-w", nw);
            });
        }

        root.querySelectorAll(".patrik-layout-row").forEach(function (row) {
            const rd = row.dataset;
            const gap = num(rd.gap, 32);
            if (rd.gap) row.style.setProperty("--pl-gap", gap + "px");
            // "0" is a valid stacked gap, so presence — not truthiness — decides.
            if (rd.stackGap !== undefined) row.style.setProperty("--pl-stack-gap", Math.max(0, num(rd.stackGap, 0)) + "px");
            if (rd.wrap) row.style.setProperty("--pl-wrap", num(rd.wrap, 320) + "px");
            if (rd.valign && PL_VALIGN[rd.valign]) row.style.setProperty("--pl-valign", PL_VALIGN[rd.valign]);
            if (rd.justify && PL_JUSTIFY[rd.justify]) row.style.setProperty("--pl-justify", PL_JUSTIFY[rd.justify]);
            if (rd.padX) row.style.setProperty("--pl-pad-x", num(rd.padX, 0) + "px");
            if (rd.padY) row.style.setProperty("--pl-pad-y", num(rd.padY, 0) + "px");
            if (rd.band) {
                row.style.setProperty("--pl-band", rd.band);
                row.style.setProperty("--pl-band-radius", num(rd.radius, 20) + "px");
            }

            // Column widths: each column's span is its share of the row. Every
            // column gives back its share of the row's gaps, so the spans stay
            // true ratios; min-width is what makes the row stack when tight.
            const cols = Array.from(row.children).filter(c => c.classList && c.classList.contains("patrik-layout-col"));
            const total = cols.reduce((s, c) => s + Math.max(1, num(c.dataset.span, 1)), 0) || 1;
            cols.forEach(function (col) {
                const frac = Math.max(1, num(col.dataset.span, 1)) / total;
                const gapShare = gap * (cols.length - 1) * frac;
                col.style.setProperty("--pl-basis", cols.length === 1
                    ? "100%"
                    : "calc(" + (frac * 100).toFixed(4) + "% - " + gapShare.toFixed(2) + "px)");
                const cell = Array.from(col.children).find(c => c.classList && c.classList.contains("patrik-layout-cell"));
                if (cell) {
                    cell.style.setProperty("--pl-ix", clamp(num(col.dataset.insetX, 0), 0, 45) + "%");
                    cell.style.setProperty("--pl-iy", Math.max(0, num(col.dataset.insetY, 0)) + "px");
                }
            });
        });

        // Content blocks: data-* -> CSS variables (defaults live in the sheet).
        root.querySelectorAll(".patrik-layout-heading, .patrik-layout-text").forEach(function (el) {
            if (el.dataset.size)  el.style.setProperty("--pl-fs", num(el.dataset.size, 0) + "px");
            if (el.dataset.align) el.style.setProperty("--pl-align", el.dataset.align);
            if (el.dataset.color) el.style.setProperty("--pl-color", el.dataset.color);
        });
        root.querySelectorAll(".patrik-layout-image").forEach(function (el) {
            if (el.dataset.width)  el.style.setProperty("--pl-width", clamp(num(el.dataset.width, 100), 5, 100) + "%");
            if (el.dataset.radius) el.style.setProperty("--pl-img-radius", Math.max(0, num(el.dataset.radius, 14)) + "px");
            const al = el.dataset.align;
            if (al === "left") el.style.setProperty("--pl-margin", "0 auto 0 0");
            else if (al === "right") el.style.setProperty("--pl-margin", "0 0 0 auto");
        });
        root.querySelectorAll(".patrik-layout-cta").forEach(function (el) {
            if (el.dataset.align) el.style.setProperty("--pl-align", el.dataset.align);
        });
        root.querySelectorAll(".patrik-layout-button").forEach(function (el) {
            if (el.dataset.color) {
                el.style.setProperty("--pl-btn", el.dataset.color);
                const c = parseColor(el.dataset.color);
                if (c) el.style.setProperty("--pl-btn-soft", rgba(c, 0.55));
            }
        });
        root.querySelectorAll(".patrik-layout-spacer").forEach(function (el) {
            if (el.dataset.height) el.style.setProperty("--pl-h", Math.max(0, num(el.dataset.height, 48)) + "px");
        });
        root.querySelectorAll(".patrik-layout-divider").forEach(function (el) {
            const c = parseColor(el.dataset.color);
            if (c) el.style.setProperty("--pl-line", rgba(c, 0.22));
        });
    }


    /* ==================================================================
       AUTO-INIT  +  public API
       ================================================================== */
    function renderAll(root) {
        const scope = root || document;
        scope.querySelectorAll(".patrik-layout").forEach(renderLayout);
        scope.querySelectorAll(".patrik-radar-chart").forEach(renderRadarComponent);
        scope.querySelectorAll(".patrik-range-bar-group").forEach(renderRangeGroup);
        scope.querySelectorAll(".patrik-range-bar").forEach((bar) => {
            if (bar.closest(".patrik-range-bar-group")) return; // driven by its group
            renderRangeBar(bar);
        });
    }

    // exposed for manual re-rendering after dynamic DOM changes
    window.renderRadarChart = renderRadarChart;
    window.PatrikComponents  = { render: renderAll };
    window.PatrikLayout      = { render: (r) => (r || document).querySelectorAll(".patrik-layout").forEach(renderLayout), renderOne: renderLayout };
    window.PatrikRadar       = { render: (r) => (r || document).querySelectorAll(".patrik-radar-chart").forEach(renderRadarComponent), renderOne: renderRadarComponent };
    window.PatrikRangeBars   = { render: (r) => { const s = r || document; s.querySelectorAll(".patrik-range-bar-group").forEach(renderRangeGroup); s.querySelectorAll(".patrik-range-bar").forEach((b) => { if (!b.closest(".patrik-range-bar-group")) renderRangeBar(b); }); }, renderOne: renderRangeBar };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => renderAll());
    } else {
        renderAll();
    }
})();
