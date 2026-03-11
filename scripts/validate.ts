import { spawn, type ChildProcess } from "node:child_process";

interface ValidationError {
  tool: string;
  file?: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
  summary: string;
  duration_ms: number;
  stopped_early: boolean;
  next_action?: string;
}

interface CommandResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

interface OxlintResult {
  diagnostics?: Array<{
    message: string;
    code?: string;
    severity?: string;
    filename?: string;
    labels?: Array<{
      span?: {
        line?: number;
        column?: number;
      };
    }>;
  }>;
}

interface VitestResult {
  success?: boolean;
  testResults?: Array<{
    name: string;
    assertionResults?: Array<{
      ancestorTitles: string[];
      title: string;
      status: string;
      failureMessages?: string[];
    }>;
  }>;
}

interface Check {
  name: string;
  fn: () => Promise<ValidationError[]>;
}

const MAX_ERRORS = 3;
const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;?]*[A-Za-z]`, "g");

let collectedErrors: ValidationError[] = [];
let failedTools: string[] = [];
let aborted = false;
const runningProcesses: ChildProcess[] = [];

function abort() {
  if (aborted) return;
  aborted = true;

  for (const proc of runningProcesses) {
    proc.kill("SIGTERM");
  }
}

function addErrors(toolName: string, errors: ValidationError[]): boolean {
  if (aborted || errors.length === 0) return aborted;

  if (!failedTools.includes(toolName)) {
    failedTools.push(toolName);
  }

  for (const error of errors) {
    if (collectedErrors.length >= MAX_ERRORS) {
      abort();
      return true;
    }

    collectedErrors.push(error);
  }

  if (collectedErrors.length >= MAX_ERRORS) {
    abort();
    return true;
  }

  return false;
}

function removeRunningProcess(proc: ChildProcess) {
  const index = runningProcesses.indexOf(proc);
  if (index !== -1) {
    runningProcesses.splice(index, 1);
  }
}

function run(command: string, args: string[]): Promise<CommandResult> {
  return new Promise((resolve) => {
    if (aborted) {
      resolve({ stdout: "", stderr: "", success: false });
      return;
    }

    const proc = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    runningProcesses.push(proc);

    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (result: CommandResult) => {
      if (settled) return;
      settled = true;
      removeRunningProcess(proc);
      resolve(result);
    };

    proc.stdout?.setEncoding("utf8");
    proc.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });

    proc.stderr?.setEncoding("utf8");
    proc.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });

    proc.on("error", (error) => {
      const message = error.message.trim();
      finish({
        stdout,
        stderr: [stderr.trim(), message].filter(Boolean).join("\n"),
        success: false,
      });
    });

    proc.on("close", (code, signal) => {
      if (aborted) {
        finish({ stdout: "", stderr: "", success: false });
        return;
      }

      finish({
        stdout,
        stderr,
        success: code === 0 && signal === null,
      });
    });
  });
}

function normalizeOutputLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.replace(ANSI_ESCAPE_PATTERN, "").trim())
    .filter((line) => line.length > 0);
}

function summarizeFailureOutput(text: string): string | undefined {
  const lines = normalizeOutputLines(text);

  if (lines.length === 0) return undefined;

  const prioritized = lines.find((line) =>
    /(^error\b|failed|AssertionError|Format issues found)/i.test(line),
  );

  return prioritized ?? lines[0];
}

function truncateText(text: string, maxLength = 220): string {
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 3)}...`;
}

function parseJson<T>(text: string): T | undefined {
  try {
    return JSON.parse(text.trim()) as T;
  } catch {
    return undefined;
  }
}

function parseTscErrors(tool: string, output: string): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const line of normalizeOutputLines(output)) {
    const match = line.match(/^(.*)\((\d+),(\d+)\): error (TS\d+): (.+)$/);
    if (!match) continue;

    errors.push({
      tool,
      file: match[1],
      line: Number.parseInt(match[2], 10),
      column: Number.parseInt(match[3], 10),
      code: match[4],
      severity: "error",
      message: match[5],
    });
  }

  return errors;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractVitestLocation(
  fileName: string,
  failureMessage: string | undefined,
): Pick<ValidationError, "line" | "column"> {
  if (!failureMessage) return {};

  const match = failureMessage.match(new RegExp(`${escapeRegExp(fileName)}:(\\d+):(\\d+)`));

  if (!match) return {};

  return {
    line: Number.parseInt(match[1], 10),
    column: Number.parseInt(match[2], 10),
  };
}

async function runFormatCheck(): Promise<ValidationError[]> {
  if (aborted) return [];

  const errors: ValidationError[] = [];
  const { stdout, stderr, success } = await run("node_modules/.bin/oxfmt", ["--check", "."]);

  if (aborted) return [];
  if (success) return errors;

  const output = `${stdout}\n${stderr}`;
  const lines = normalizeOutputLines(output);

  for (const line of lines) {
    const match = line.match(/^(.*\S)\s+\(\d+ms\)$/);
    if (!match) continue;

    const file = match[1];
    errors.push({
      tool: "oxfmt",
      file,
      severity: "error",
      message: `File needs formatting. Run: node_modules/.bin/oxfmt --write ${file}`,
    });
  }

  if (errors.length === 0) {
    errors.push({
      tool: "oxfmt",
      severity: "error",
      message: `Formatting check failed${summarizeFailureOutput(output) ? `: ${summarizeFailureOutput(output)}` : ""}`,
    });
  }

  return errors;
}

async function runLint(): Promise<ValidationError[]> {
  if (aborted) return [];

  const errors: ValidationError[] = [];
  const { stdout, stderr, success } = await run("node_modules/.bin/oxlint", ["--format", "json"]);

  if (aborted) return [];

  const result = parseJson<OxlintResult>(stdout);

  if (result) {
    for (const diagnostic of result.diagnostics ?? []) {
      if (diagnostic.severity !== "error") continue;

      const span = diagnostic.labels?.[0]?.span;
      errors.push({
        tool: "oxlint",
        severity: "error",
        message: diagnostic.message,
        ...(diagnostic.filename ? { file: diagnostic.filename } : {}),
        ...(span?.line !== undefined ? { line: span.line } : {}),
        ...(span?.column !== undefined ? { column: span.column } : {}),
        ...(diagnostic.code ? { code: diagnostic.code } : {}),
      });
    }
  }

  if (errors.length === 0 && !success) {
    const summary = summarizeFailureOutput(`${stdout}\n${stderr}`);
    errors.push({
      tool: "oxlint",
      severity: "error",
      message: `Lint failed${summary ? `: ${summary}` : ""}`,
    });
  }

  return errors;
}

async function runTests(): Promise<ValidationError[]> {
  if (aborted) return [];

  const errors: ValidationError[] = [];
  const { stdout, stderr, success } = await run("node_modules/.bin/vitest", [
    "run",
    "--reporter=json",
  ]);

  if (aborted) return [];

  const result = parseJson<VitestResult>(stdout);

  if (result) {
    for (const file of result.testResults ?? []) {
      for (const test of file.assertionResults ?? []) {
        if (test.status !== "failed") continue;

        const failureMessage = test.failureMessages?.[0];
        const { line, column } = extractVitestLocation(file.name, failureMessage);
        const summary = failureMessage
          ?.split("\n")
          .map((entry) => entry.trim())
          .find(Boolean);

        errors.push({
          tool: "vitest",
          file: file.name,
          severity: "error",
          message: truncateText(
            `${[...test.ancestorTitles, test.title].join(" > ")}: ${summary ?? "failed"}`,
          ),
          ...(line !== undefined ? { line } : {}),
          ...(column !== undefined ? { column } : {}),
        });
      }
    }
  }

  if (errors.length === 0 && !success) {
    const summary = summarizeFailureOutput(`${stdout}\n${stderr}`);
    errors.push({
      tool: "vitest",
      severity: "error",
      message: `Tests failed${summary ? `: ${summary}` : ""}`,
    });
  }

  return errors;
}

async function runTypeCheck(
  tool: "tsc:core" | "tsc:svelte",
  tsconfig: "tsconfig.build.json" | "tsconfig.build.svelte.json",
): Promise<ValidationError[]> {
  if (aborted) return [];

  const { stdout, stderr, success } = await run("node_modules/.bin/tsc", [
    "-p",
    tsconfig,
    "--noEmit",
  ]);

  if (aborted) return [];
  if (success) return [];

  const output = `${stdout}\n${stderr}`;
  const errors = parseTscErrors(tool, output);

  if (errors.length > 0) {
    return errors;
  }

  const summary = summarizeFailureOutput(output);
  return [
    {
      tool,
      severity: "error",
      message: `Type check failed${summary ? `: ${summary}` : ""}`,
    },
  ];
}

async function validate(): Promise<ValidationResult> {
  const start = Date.now();

  collectedErrors = [];
  failedTools = [];
  aborted = false;

  const checks: Check[] = [
    { name: "oxfmt", fn: runFormatCheck },
    { name: "oxlint", fn: runLint },
    { name: "tsc:core", fn: () => runTypeCheck("tsc:core", "tsconfig.build.json") },
    { name: "tsc:svelte", fn: () => runTypeCheck("tsc:svelte", "tsconfig.build.svelte.json") },
    { name: "vitest", fn: runTests },
  ];

  console.error(`→ Running ${checks.length} checks in parallel...`);

  await Promise.all(
    checks.map(async (check) => {
      const checkStart = Date.now();
      const errors = await check.fn();
      const duration = Date.now() - checkStart;
      const wasAborted = addErrors(check.name, errors);

      const status = aborted && errors.length === 0 ? "○" : errors.length === 0 ? "✓" : "✗";
      const suffix = wasAborted && errors.length === 0 ? " (cancelled)" : "";
      console.error(`  ${status} ${check.name} (${duration}ms)${suffix}`);
    }),
  );

  const duration_ms = Date.now() - start;

  return {
    success: collectedErrors.length === 0,
    errors: collectedErrors,
    summary:
      collectedErrors.length === 0
        ? `✓ All ${checks.length} checks passed in ${duration_ms}ms`
        : `✗ ${collectedErrors.length} error(s) from ${failedTools.join(", ")}`,
    duration_ms,
    stopped_early: aborted,
    ...(collectedErrors.length > 0
      ? { next_action: "Fix these errors, then re-run validation." }
      : {}),
  };
}

const result = await validate();
console.log(JSON.stringify(result, null, 2));
process.exit(result.success ? 0 : 1);
