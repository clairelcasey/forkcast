import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadCases } from "./load";
import { PARSERS } from "./parsers";
import { toMarkdown } from "./report";
import { runEval } from "./run-cases";

const USAGE = `Usage: pnpm eval [--parser stub] [--only id,id] [--out file.md]`;

async function main() {
  const { values } = parseArgs({
    options: {
      parser: { type: "string", default: "stub" },
      only: { type: "string" },
      out: { type: "string", default: "evals/results/latest.md" },
      concurrency: { type: "string", default: "4" },
      help: { type: "boolean", default: false },
    },
  });
  if (values.help) return console.log(USAGE);

  const makeParser = PARSERS[values.parser];
  if (!makeParser) {
    throw new Error(
      `Unknown parser "${values.parser}". Options: ${Object.keys(PARSERS).join(", ")}`,
    );
  }

  let cases = await loadCases();
  if (values.only) {
    const ids = new Set(values.only.split(",").map((s) => s.trim()));
    cases = cases.filter((c) => ids.has(c.id));
    const missing = [...ids].filter((id) => !cases.some((c) => c.id === id));
    if (missing.length) throw new Error(`Unknown case id(s): ${missing.join(", ")}`);
  }

  const summary = await runEval(makeParser(cases), cases, {
    concurrency: Number(values.concurrency),
  });
  const markdown = toMarkdown(summary);

  await mkdir(path.dirname(values.out), { recursive: true });
  await writeFile(values.out, markdown);
  console.log(markdown);
  console.log(`Wrote ${values.out}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
