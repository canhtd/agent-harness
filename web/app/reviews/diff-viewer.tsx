"use client";

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

const diffStyles = {
  variables: {
    light: {
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
    },
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

interface DiffViewerProps {
  patch: string;
}

export default function DiffViewer({ patch }: DiffViewerProps) {
  const { oldValue, newValue } = parsePatch(patch);

  if (!patch) {
    return (
      <div className="diff-empty">Binary file or no changes to display</div>
    );
  }

  return (
    <ReactDiffViewer
      oldValue={oldValue}
      newValue={newValue}
      splitView={false}
      useDarkTheme={false}
      showDiffOnly={true}
      styles={diffStyles}
    />
  );
}
