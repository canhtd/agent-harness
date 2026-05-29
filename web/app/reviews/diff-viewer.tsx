"use client";

import { useEffect, useState } from "react";
import ReactDiffViewer from "react-diff-viewer-continued";

function parsePatch(patch: string): { oldValue: string; newValue: string } {
  if (!patch) return { oldValue: "", newValue: "" };

  const lines = patch.split("\n");
  const oldLines: string[] = [];
  const newLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith("@@")) continue;

    if (line.startsWith("-")) {
      oldLines.push(line.slice(1));
    } else if (line.startsWith("+")) {
      newLines.push(line.slice(1));
    } else {
      const content = line.startsWith(" ") ? line.slice(1) : line;
      oldLines.push(content);
      newLines.push(content);
    }
  }

  return {
    oldValue: oldLines.join("\n"),
    newValue: newLines.join("\n"),
  };
}

const monoFont =
  'ui-monospace, "SF Mono", SFMono-Regular, Menlo, monospace';

const lightVars = {
  diffViewerBackground: "#fff",
  gutterBackground: "#f7f7f8",
  addedBackground: "#e6ffec",
  addedGutterBackground: "#ccffd8",
  removedBackground: "#ffeef0",
  removedGutterBackground: "#ffd7d5",
  wordAddedBackground: "#acf2bd",
  wordRemovedBackground: "#fdb8c0",
  addedGutterColor: "#24292e",
  removedGutterColor: "#24292e",
  gutterColor: "#6e6e80",
  codeFoldGutterBackground: "#f1f1f1",
  codeFoldBackground: "#f1f1f1",
};

const darkVars = {
  diffViewerBackground: "#1a1a1c",
  gutterBackground: "#1a1a1c",
  addedBackground: "rgba(46, 160, 67, 0.15)",
  addedGutterBackground: "rgba(46, 160, 67, 0.2)",
  removedBackground: "rgba(248, 81, 73, 0.15)",
  removedGutterBackground: "rgba(248, 81, 73, 0.2)",
  wordAddedBackground: "rgba(46, 160, 67, 0.4)",
  wordRemovedBackground: "rgba(248, 81, 73, 0.4)",
  addedGutterColor: "#d0d2d6",
  removedGutterColor: "#d0d2d6",
  gutterColor: "#6b6f76",
  codeFoldGutterBackground: "#232326",
  codeFoldBackground: "#232326",
  addedColor: "#d0d2d6",
  removedColor: "#d0d2d6",
  diffViewerColor: "#d0d2d6",
  codeFoldContentColor: "#6b6f76",
  emptyLineBackground: "#1a1a1c",
};

function useDarkMode(): boolean {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    const check = () => {
      const theme = document.documentElement.getAttribute("data-theme");
      setIsDark(theme !== "light");
    };
    check();

    const observer = new MutationObserver(check);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => observer.disconnect();
  }, []);

  return isDark;
}

interface DiffViewerProps {
  patch: string;
}

export default function DiffViewer({ patch }: DiffViewerProps) {
  const { oldValue, newValue } = parsePatch(patch);
  const isDark = useDarkMode();

  if (!patch) {
    return (
      <div className="diff-empty">Binary file or no changes to display</div>
    );
  }

  const diffStyles = {
    variables: {
      dark: darkVars,
      light: lightVars,
    },
    line: {
      fontFamily: monoFont,
      fontSize: "13px",
    },
    gutter: {
      fontFamily: monoFont,
      fontSize: "13px",
      minWidth: "3rem",
    },
    contentText: {
      fontFamily: monoFont,
    },
  };

  return (
    <ReactDiffViewer
      oldValue={oldValue}
      newValue={newValue}
      splitView={false}
      useDarkTheme={isDark}
      showDiffOnly={true}
      styles={diffStyles}
    />
  );
}
