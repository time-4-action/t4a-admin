"use client";
import { useMemo, useState } from "react";
import { Radar } from "lucide-react";
import { generateRadarChart, radarDefaultConfig, type RadarConfig } from "../generators";
import { RadarControls, readRadarConfig } from "../section-controls";
import { BuilderShell } from "../builder-ui";

export default function RadarChartBuilder() {
  // One config object is the whole build: it is what the controls edit, what
  // the generator renders, and what a saved build stores.
  const [config, setConfig] = useState<RadarConfig>(radarDefaultConfig);

  const { markup, code } = useMemo(() => generateRadarChart(config), [config]);

  return (
    <BuilderShell
      title="Radar Chart Builder"
      icon={Radar}
      badge="performance octagon"
      description={
        <>
          A performance octagon — a single dataset, or a comparison dropdown that switches between
          several models. Set the axes and values, tweak the colours if you like, then copy the
          snippet. At least three axes are required.
        </>
      }
      controls={<RadarControls value={config} onChange={setConfig} />}
      markup={markup}
      code={code}
      presetKey="radar-chart"
      getConfig={() => config}
      applyConfig={(raw) => setConfig(readRadarConfig(raw))}
      // Picking a model in the preview makes it the one the snippet opens on.
      onPreviewSelect={([i]) =>
        setConfig((c) => (i == null || c.defaultIndex === i ? c : { ...c, defaultIndex: i }))
      }
      tip={
        <>
          Load the renderer once per page (near the end of{" "}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">&lt;body&gt;</code>). It
          auto-renders every component on the page — no inline JavaScript needed.
        </>
      }
    />
  );
}
