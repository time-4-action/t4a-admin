"use client";
import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { generateRangeBars, rangeBarsDefaultConfig, type RangeBarsConfig } from "../generators";
import { RangeBarsControls, readRangeBarsConfig, withFreshStopKeys } from "../section-controls";
import { BuilderShell } from "../builder-ui";

export default function RangeBarsBuilder() {
  // One config object is the whole build. `stopKeys` inside it are volatile
  // drag-and-drop identities — minted here, ignored by the generator and by the
  // saved-build dirty check.
  const [config, setConfig] = useState<RangeBarsConfig>(() =>
    withFreshStopKeys(rangeBarsDefaultConfig()),
  );

  const { markup, code } = useMemo(() => generateRangeBars(config), [config]);

  return (
    <BuilderShell
      title="Range Bars Builder"
      icon={SlidersHorizontal}
      badge="feel / rider goals"
      description={
        <>
          A range bar shows a highlighted <strong className="text-foreground">band</strong> between
          two poles (or across labelled stops) — ideal for feel and rider-goal scales. Add as many
          bars as you need, then copy the snippet.
        </>
      }
      controls={<RangeBarsControls value={config} onChange={setConfig} />}
      markup={markup}
      code={code}
      presetKey="range-bars"
      getConfig={() => config}
      applyConfig={(raw) => setConfig(readRangeBarsConfig(raw))}
      // Picking a model in the preview makes it the one the snippet opens on.
      onPreviewSelect={([i]) =>
        setConfig((c) => (i == null || c.defaultIndex === i ? c : { ...c, defaultIndex: i }))
      }
      tip={
        <>
          Load the renderer once per page — it renders every{" "}
          <code className="text-[11px] bg-muted px-1 py-0.5 rounded">.patrik-range-bar</code>{" "}
          automatically.
        </>
      }
    />
  );
}
