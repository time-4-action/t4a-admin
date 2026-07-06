/* =====================================================================
   Patrik Components  -  external rendering script
   ---------------------------------------------------------------------
   The HTML pages are SCRIPTLESS. They contain only markup + data-*
   config and load this single file:

       <script src="patrik-components.js"></script>

   Components (all auto-render, all configured from HTML):
     1) .patrik-radar-chart   -> the "performance" octagon
     2) .patrik-range-bar     -> the "feel" / "rider goals" range sliders

   All input values, labels and colours live in the HTML via data-*
   attributes. This file holds rendering + styling logic only, so it can
   be shared across every page.
   ===================================================================== */
(function () {
    "use strict";

    const NS = "http://www.w3.org/2000/svg";

    function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
    function num(value, fallback) {
        const n = parseFloat(value);
        return Number.isFinite(n) ? n : fallback;
    }
    function splitList(str) {
        return (str || "").split(",").map(s => s.trim()).filter(Boolean);
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
       ================================================================== */

    function injectRadarStyles() {
        injectStyles("patrik-radar-styles", `
        .patrik-radar-chart{
            --rc-grid:#b0c4cf;
            --rc-axis:#b0c4cf;
            --rc-fill:rgba(180,255,100,0.6);
            --rc-stroke:#b4ff64;
            --rc-point:#1a3a4a;
            --rc-label:#1a3a4a;
            font-family:sans-serif;
        }
        .patrik-radar-svg{ display:block; width:100%; max-width:500px; height:auto; margin:0 auto; overflow:visible; }
        .patrik-radar-chart .rc-grid-line{ fill:none; stroke:var(--rc-grid); stroke-width:1; }
        .patrik-radar-chart .rc-axis-line{ stroke:var(--rc-axis); stroke-width:1; }
        .patrik-radar-chart .rc-data-poly{ fill:var(--rc-fill); stroke:var(--rc-stroke); stroke-width:2; }
        .patrik-radar-chart .rc-data-point{ fill:var(--rc-point); }
        .patrik-radar-chart .rc-label{ fill:var(--rc-label); font-size:11px; font-weight:bold; text-anchor:middle; }
        `);
    }

    // Low-level renderer. `target` is an <svg> element or an element id.
    function renderRadarChart(target, data) {
        const svg = typeof target === "string" ? document.getElementById(target) : target;
        if (!svg || !Array.isArray(data) || !data.length) return;

        svg.innerHTML = "";
        const centerX = 200, centerY = 200, maxRadius = 150;
        const numAxes = data.length;

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
            renderRadarChart(svg, data);
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
       ================================================================== */

    function injectRangeBarStyles() {
        injectStyles("patrik-range-bar-styles", `
        .patrik-range-bar{
            --rb-track:#e4ebef;
            --rb-range:#b4ff64;
            --rb-text:#1a3a4a;
            --rb-border:#b0c4cf;
            font-family:sans-serif;
            margin:0 0 22px;
            color:var(--rb-text);
        }
        .patrik-rb-title{
            font-size:12px; font-weight:700; letter-spacing:.06em;
            text-transform:uppercase; text-align:right; margin:0 2px 6px 0; opacity:.85;
        }
        .patrik-rb-track{
            position:relative; height:40px; background:var(--rb-track);
            border:1px solid var(--rb-border); border-radius:8px; overflow:hidden;
        }
        .patrik-rb-range{
            position:absolute; top:0; bottom:0; background:var(--rb-range); border-radius:6px;
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
        `);
    }

    function renderRangeBar(el) {
        injectRangeBarStyles();
        const d = el.dataset;

        // colour overrides -> CSS variables
        if (d.track)  el.style.setProperty("--rb-track", d.track);
        if (d.range)  el.style.setProperty("--rb-range", d.range);
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
