import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { evalCaseSchema, type EvalCase } from "./schema";

export const CASES_DIR = path.join(import.meta.dirname, "cases");

/**
 * Loads and validates every `*.json` case. Collects every problem and throws
 * once, naming each bad file, so a broken case can't silently drop out.
 */
export async function loadCases(dir = CASES_DIR): Promise<EvalCase[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) throw new Error(`No eval cases found in ${dir}`);

  const cases: EvalCase[] = [];
  const problems: string[] = [];
  const seen = new Map<string, string>();

  for (const file of files) {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(path.join(dir, file), "utf8"));
    } catch (err) {
      problems.push(`${file}: invalid JSON (${(err as Error).message})`);
      continue;
    }
    const parsed = evalCaseSchema.safeParse(raw);
    if (!parsed.success) {
      problems.push(`${file}:\n${indent(z.prettifyError(parsed.error))}`);
      continue;
    }
    const c = parsed.data;
    if (`${c.id}.json` !== file) {
      problems.push(`${file}: id "${c.id}" must match the file name`);
    }
    const dupe = seen.get(c.id);
    if (dupe) problems.push(`${file}: id "${c.id}" already used in ${dupe}`);
    seen.set(c.id, file);
    cases.push(c);
  }

  if (problems.length > 0) {
    throw new Error(
      `${problems.length} invalid eval case file(s) in ${dir}:\n${problems.join("\n")}`,
    );
  }
  return cases;
}

function indent(s: string) {
  return s
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}
