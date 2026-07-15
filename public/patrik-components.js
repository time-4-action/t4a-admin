/* =====================================================================
   Patrik Components  -  external rendering script
   ---------------------------------------------------------------------
   The HTML pages are SCRIPTLESS. They contain only markup + data-*
   config and load this single file:

       <script src="patrik-components.js"></script>

   Components (all auto-render, all configured from HTML):
     1) .patrik-radar-chart   -> the "performance" octagon
     2) .patrik-range-bar     -> the "feel" / "rider goals" range sliders

   Design defaults are DARK-NATIVE and TRANSPARENT: the components draw
   nothing behind themselves and default to a smooth teal palette
   (Patrik brand ~#269EBC) with light hairline grids and light labels,
   so they drop straight onto the dark patrikinternational.com pages
   with a transparent background. Put them on a light surface? Override
   the label / grid / text colours via the data-* attributes below.

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
            return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: 1 };
        }
        const m = c.match(/rgba?\(([^)]+)\)/i);
        if (m) {
            const p = m[1].split(",").map(s => parseFloat(s.trim()));
            return { r: p[0] || 0, g: p[1] || 0, b: p[2] || 0, a: p[3] != null ? p[3] : 1 };
        }
        return null;
    }
    function rgba(c, a) { return `rgba(${c.r},${c.g},${c.b},${a})`; }
    // A translucent vertical fade of one colour — the shared "fill" look used by
    // both the radar polygon and the range-bar band.
    function fillGradientCss(c, peak) {
        return `linear-gradient(180deg,${rgba(c, peak)},${rgba(c, Math.max(0.04, peak * 0.34))})`;
    }
    function injectStyles(id, css) {
        if (document.getElementById(id)) return;
        const style = document.createElement("style");
        style.id = id;
        style.textContent = css;
        document.head.appendChild(style);
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
        .patrik-radar-svg{ display:block; width:100%; max-width:460px; height:auto; margin:0 auto; overflow:visible; background:transparent; }
        .patrik-radar-chart .rc-grid-line{ fill:none; stroke:var(--rc-grid); stroke-width:1; }
        .patrik-radar-chart .rc-axis-line{ stroke:var(--rc-axis); stroke-width:1; }
        .patrik-radar-chart .rc-data-poly{ fill:var(--rc-fill); stroke:var(--rc-stroke); stroke-width:2; stroke-linejoin:round; }
        .patrik-radar-chart .rc-data-point{ fill:var(--rc-point); }
        .patrik-radar-chart .rc-label{ fill:var(--rc-label); font-size:11px; font-weight:700; letter-spacing:.04em; text-anchor:middle; }
        .patrik-radar-select{
            -webkit-appearance:none; -moz-appearance:none; appearance:none;
            font-family:inherit; font-size:14px; font-weight:700;
            color:#eaf7fb; background-color:rgba(255,255,255,0.06);
            border:1px solid rgba(255,255,255,0.18); border-radius:10px;
            padding:9px 40px 9px 14px; cursor:pointer; outline:none; line-height:1.2;
            background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23c7dce4' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
            background-repeat:no-repeat; background-position:right 13px center; background-size:14px;
            transition:border-color .15s, background-color .15s, box-shadow .15s;
        }
        .patrik-radar-select:hover{ background-color:rgba(255,255,255,0.10); border-color:rgba(255,255,255,0.28); }
        .patrik-radar-select:focus-visible{ border-color:${TEAL}; box-shadow:0 0 0 3px rgba(56,182,211,0.28); }
        .patrik-radar-select option{ color:#0b131c; background:#eaf7fb; }
        @media (max-width:480px){
            .patrik-radar-chart .rc-label{ font-size:12px; }
        }
        `);
    }

    // Low-level renderer. `target` is an <svg> element or an element id.
    // `opts` (optional): { fillColor:{r,g,b}, fillPeak:Number } — the polygon is
    // ALWAYS a smooth vertical fade of fillColor, from fillPeak opacity at the
    // top down to a faint tail. Changing the colour keeps the gradient; only the
    // hue changes.
    function renderRadarChart(target, data, opts) {
        const svg = typeof target === "string" ? document.getElementById(target) : target;
        if (!svg || !Array.isArray(data) || !data.length) return;
        opts = opts || {};

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
            const labelPos = getXY(angle, maxRadius + 25);

            const line = document.createElementNS(NS, "line");
            line.setAttribute("x1", centerX); line.setAttribute("y1", centerY);
            line.setAttribute("x2", outer.x); line.setAttribute("y2", outer.y);
            line.setAttribute("class", "rc-axis-line");
            svg.appendChild(line);

            const text = document.createElementNS(NS, "text");
            text.setAttribute("x", labelPos.x);
            text.setAttribute("y", labelPos.y + 5);
            text.setAttribute("class", "rc-label");
            text.textContent = item.label;
            svg.appendChild(text);
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
            circle.setAttribute("cx", p.x); circle.setAttribute("cy", p.y); circle.setAttribute("r", "4");
            circle.setAttribute("class", "rc-data-point");
            svg.appendChild(circle);
        });
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
        const fillPeak = d.fill && baseColor && baseColor.a < 1 ? baseColor.a : 0.45;
        const gradientOpts = { fillColor: baseColor, fillPeak };

        // ensure an <svg> exists (created here, not in HTML)
        let svg = el.querySelector("svg.patrik-radar-svg");
        if (!svg) {
            svg = document.createElementNS(NS, "svg");
            svg.setAttribute("class", "patrik-radar-svg");
            svg.setAttribute("viewBox", "0 0 400 400");
            el.appendChild(svg);
        }

        const build = (valuesStr) => {
            const values = splitList(valuesStr).map(v => num(v, 0));
            const data = axes.map((label, i) => ({ label, value: values[i] != null ? values[i] : 0 }));
            renderRadarChart(svg, data, gradientOpts);
        };

        const select = el.querySelector("select.patrik-radar-select");
        if (select) {
            const current = () => select.options[select.selectedIndex].value;
            build(current());
            select.addEventListener("change", () => build(current()));
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
       ================================================================== */

    function injectRangeBarStyles() {
        injectStyles("patrik-range-bar-styles", `
        .patrik-range-bar{
            --rb-track:rgba(255,255,255,0.06);
            /* Same translucent teal fill + crisp edge as the radar polygon. */
            --rb-range:linear-gradient(180deg,rgba(56,182,211,0.65),rgba(56,182,211,0.22));
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
        @media (max-width:480px){
            .patrik-rb-pole{ font-size:12px; }
            .patrik-rb-pole.left{ left:10px; }
            .patrik-rb-pole.right{ right:10px; }
        }
        `);
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
    }


    /* ==================================================================
       AUTO-INIT  +  public API
       ================================================================== */
    function renderAll(root) {
        const scope = root || document;
        scope.querySelectorAll(".patrik-radar-chart").forEach(renderRadarComponent);
        scope.querySelectorAll(".patrik-range-bar").forEach(renderRangeBar);
    }

    // exposed for manual re-rendering after dynamic DOM changes
    window.renderRadarChart = renderRadarChart;
    window.PatrikComponents  = { render: renderAll };
    window.PatrikRadar       = { render: (r) => (r || document).querySelectorAll(".patrik-radar-chart").forEach(renderRadarComponent), renderOne: renderRadarComponent };
    window.PatrikRangeBars   = { render: (r) => (r || document).querySelectorAll(".patrik-range-bar").forEach(renderRangeBar), renderOne: renderRangeBar };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", () => renderAll());
    } else {
        renderAll();
    }
})();
