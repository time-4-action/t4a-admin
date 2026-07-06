"use client";
import { useMemo, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { BUILDER_SCRIPT_URL } from "@/lib/builder-role";
import {
  BuilderShell,
  Group,
  Field,
  TextField,
  NumberField,
  Segmented,
  Slider,
  CheckRow,
  ColorField,
  AddButton,
  SubCard,
} from "../builder-ui";

const DEF_RANGE = "#b4ff64";

type BarMode = "two" | "scale";
type Bar = {
  mode: BarMode;
  title: string;
  left: string;
  right: string;
  min: number | "";
  max: number | "";
  marker: boolean;
  value: number;
  range: string;
  scale: string;
  scaleIndex: boolean;
};

const esc = (s: string) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const newBar = (over: Partial<Bar> = {}): Bar => ({
  mode: "two",
  title: "New bar",
  left: "Left",
  right: "Right",
  min: 20,
  max: 70,
  marker: false,
  value: 50,
  range: DEF_RANGE,
  scale: "Entry,Intermediate,Advanced,Pro",
  scaleIndex: true,
  ...over,
});

export default function RangeBarsBuilder() {
  const [wrap, setWrap] = useState(true);
  const [heading, setHeading] = useState("Feel");
  const [bars, setBars] = useState<Bar[]>([
    newBar({ title: "Power delivery", left: "Direct", right: "Smooth", min: 25, max: 62 }),
    newBar({ title: "Center of effort", left: "Backhanded", right: "Fronthanded", min: 45, max: 80 }),
  ]);

  const updateBar = (bi: number, patch: Partial<Bar>) =>
    setBars((bs) => bs.map((b, i) => (i === bi ? { ...b, ...patch } : b)));
  const removeBar = (bi: number) => setBars((bs) => bs.filter((_, i) => i !== bi));
  const addBar = () => setBars((bs) => [...bs, newBar()]);

  /* — code generation (faithful port) — */
  const { markup, code } = useMemo(() => {
    const buildBar = (bar: Bar, pad: string): string => {
      const A: string[] = [];
      const push = (name: string, val: string | number) => A.push(`${pad}     ${name}="${esc(String(val))}"`);
      if (bar.title) push("data-title", bar.title);
      if (bar.mode === "two") {
        if (bar.left) push("data-left", bar.left);
        if (bar.right) push("data-right", bar.right);
      } else {
        push("data-scale", bar.scale);
        if (bar.scaleIndex) push("data-scale-index", "true");
      }
      push("data-min", bar.min);
      push("data-max", bar.max);
      if (bar.marker) push("data-value", bar.value);
      if (bar.range && bar.range.toLowerCase() !== DEF_RANGE) push("data-range", bar.range);

      const last = (A.pop() ?? "") + ">";
      return `${pad}<div class="patrik-range-bar"\n${A.join("\n")}${A.length ? "\n" : ""}${last}\n${pad}</div>`;
    };

    const buildMarkup = (): string => {
      const pad = wrap ? "    " : "";
      const body = bars.map((b) => buildBar(b, pad)).join("\n\n");
      if (!wrap) return body;
      let out = `<div style="background-color:#efefef; padding:24px; border-radius:10px; font-family:sans-serif; max-width:550px; margin:30px auto;">\n`;
      if (heading.trim())
        out += `    <h2 style="color:#1a3a4a; margin-top:0; font-size:22px;">${esc(heading)}</h2>\n\n`;
      out += body + `\n</div>`;
      return out;
    };

    const m = buildMarkup();
    const full = `${m}\n\n<!-- load once per page, near the end of <body> -->\n<script src="${BUILDER_SCRIPT_URL}"></script>`;
    return { markup: m, code: full };
  }, [wrap, heading, bars]);

  /* — controls — */
  const controls = (
    <>
      <Group num={1} title="Card wrapper">
        <CheckRow checked={wrap} onChange={setWrap}>
          Wrap all bars in a grey card with a heading
        </CheckRow>
        {wrap && (
          <Field label="Heading">
            <TextField value={heading} onChange={setHeading} placeholder="Feel" />
          </Field>
        )}
      </Group>

      <Group num={2} title="Bars">
        <div className="space-y-3">
          {bars.map((bar, bi) => {
            const unit = bar.scaleIndex ? "stop #" : "0–100%";
            return (
              <SubCard
                key={bi}
                title={`Bar ${bi + 1}`}
                onRemove={bars.length > 1 ? () => removeBar(bi) : undefined}
              >
                <Segmented
                  value={bar.mode}
                  onChange={(m) => updateBar(bi, { mode: m })}
                  options={[
                    { value: "two", label: "Two-pole" },
                    { value: "scale", label: "Scale" },
                  ]}
                />

                <Field label="Title">
                  <TextField
                    value={bar.title}
                    onChange={(v) => updateBar(bi, { title: v })}
                    placeholder="e.g. Power delivery"
                  />
                </Field>

                {bar.mode === "two" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Left label">
                        <TextField
                          value={bar.left}
                          onChange={(v) => updateBar(bi, { left: v })}
                          placeholder="Direct"
                        />
                      </Field>
                      <Field label="Right label">
                        <TextField
                          value={bar.right}
                          onChange={(v) => updateBar(bi, { right: v })}
                          placeholder="Smooth"
                        />
                      </Field>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Band start" hint="(0–100%)">
                        <NumberField value={bar.min} onChange={(v) => updateBar(bi, { min: v })} />
                      </Field>
                      <Field label="Band end" hint="(0–100%)">
                        <NumberField value={bar.max} onChange={(v) => updateBar(bi, { max: v })} />
                      </Field>
                    </div>
                  </>
                ) : (
                  <>
                    <Field label="Stop labels" hint="(comma-separated)">
                      <TextField
                        value={bar.scale}
                        onChange={(v) => updateBar(bi, { scale: v })}
                        placeholder="Entry,Intermediate,Advanced,Pro"
                      />
                    </Field>
                    <CheckRow
                      checked={bar.scaleIndex}
                      onChange={(v) => updateBar(bi, { scaleIndex: v })}
                    >
                      Min / max are stop indexes (0-based)
                    </CheckRow>
                    <div className="grid grid-cols-2 gap-2">
                      <Field label="Band start" hint={`(${unit})`}>
                        <NumberField value={bar.min} onChange={(v) => updateBar(bi, { min: v })} />
                      </Field>
                      <Field label="Band end" hint={`(${unit})`}>
                        <NumberField value={bar.max} onChange={(v) => updateBar(bi, { max: v })} />
                      </Field>
                    </div>
                  </>
                )}

                <CheckRow checked={bar.marker} onChange={(v) => updateBar(bi, { marker: v })}>
                  Add a single marker line
                </CheckRow>
                {bar.marker && (
                  <Slider
                    label="Marker"
                    value={bar.value}
                    onChange={(v) => updateBar(bi, { value: v })}
                  />
                )}

                <ColorField
                  label="Band colour"
                  value={bar.range}
                  onChange={(v) => updateBar(bi, { range: v })}
                  onReset={
                    bar.range.toLowerCase() !== DEF_RANGE
                      ? () => updateBar(bi, { range: DEF_RANGE })
                      : undefined
                  }
                />
              </SubCard>
            );
          })}
        </div>
        <AddButton onClick={addBar}>Add bar</AddButton>
      </Group>
    </>
  );

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
      controls={controls}
      markup={markup}
      code={code}
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
