"use client";
import { useCallback, useEffect, useState } from "react";

// Loads the bundled renderer (public/patrik-components.js) once and exposes a
// `render(el)` that re-runs it over a subtree. Using the real website script —
// not a re-implementation — guarantees the live preview is byte-identical to
// what the generated snippet will produce in production.

declare global {
  interface Window {
    PatrikComponents?: { render: (root?: Element | Document) => void };
  }
}

const SRC = "/patrik-components.js";

export function usePatrikComponents() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.PatrikComponents) {
      setReady(true);
      return;
    }
    let script = document.querySelector<HTMLScriptElement>(
      'script[data-patrik-components]',
    );
    const onLoad = () => setReady(true);
    if (!script) {
      script = document.createElement("script");
      script.src = SRC;
      script.async = true;
      script.dataset.patrikComponents = "true";
      script.addEventListener("load", onLoad);
      document.body.appendChild(script);
    } else if (window.PatrikComponents) {
      setReady(true);
    } else {
      script.addEventListener("load", onLoad);
    }
    return () => script?.removeEventListener("load", onLoad);
  }, []);

  const render = useCallback(
    (el: HTMLElement | null) => {
      if (el && window.PatrikComponents) window.PatrikComponents.render(el);
    },
    [],
  );

  return { ready, render };
}
