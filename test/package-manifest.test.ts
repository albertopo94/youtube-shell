import test from "node:test";
import assert from "node:assert/strict";
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createYoutubeShellExtension } from "../src/gate/pi-extension.ts";

const ROOT = join(import.meta.dirname, "..");

const EXPECTED_SKILLS = [
  "yts-orquestador",
  "yts-investigacion-ideas",
  "yts-packaging-miniaturas",
  "yts-guion-narrativa",
  "yts-direccion-edicion",
] as const;

test("package.json declares a private Pi package manifest with existing extension and skill paths", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  assert.equal(pkg.private, true, "youtube-shell must remain private (GitHub/local install only)");
  assert.ok(!pkg.keywords?.includes("pi-package"), "must not advertise in public pi.dev gallery");

  assert.ok(pkg.pi && typeof pkg.pi === "object", "package.json must declare a pi manifest block");
  assert.deepEqual(pkg.pi.extensions, ["./src/gate/pi-extension.ts"]);
  assert.deepEqual(pkg.pi.skills, ["./skills"]);

  for (const extPath of pkg.pi.extensions) {
    assert.equal(existsSync(join(ROOT, extPath)), true, `missing extension entrypoint: ${extPath}`);
  }
  for (const skillRoot of pkg.pi.skills) {
    assert.equal(existsSync(join(ROOT, skillRoot)), true, `missing skills directory: ${skillRoot}`);
  }
});

test("all 4 role skills have portable Agent Skills frontmatter and domain instructions", () => {
  for (const name of EXPECTED_SKILLS) {
    const skillFile = join(ROOT, "skills", name, "SKILL.md");
    assert.equal(existsSync(skillFile), true, `missing skill file: ${skillFile}`);
    const content = readFileSync(skillFile, "utf8");

    const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n/);
    assert.ok(fmMatch, `${name}/SKILL.md must start with YAML frontmatter`);
    const fm = fmMatch[1];

    assert.match(fm, new RegExp(`^name:\\s*${name}\\s*$`, "m"));
    const descMatch = fm.match(/^description:\s*(.+)$/m);
    assert.ok(descMatch && descMatch[1].trim().length >= 30, `${name} must have a descriptive routing description`);
    assert.ok(descMatch[1].trim().length <= 1024, `${name} description must be <= 1024 chars`);
  }
});

test("before_agent_start injects Director Creativo persona, governance rules, and phase status", async (t) => {
  const tmp = mkdtempSync(join(tmpdir(), "yts-pkg-"));
  t.after(() => rmSync(tmp, { recursive: true, force: true }));
  cpSync(join(ROOT, "templates", "pipeline-video"), tmp, { recursive: true });

  let beforeStartHandler: ((event: any, ctx: any) => Promise<any>) | undefined;
  const ext = createYoutubeShellExtension();
  ext({
    on(event: string, fn: any) {
      if (event === "before_agent_start") beforeStartHandler = fn;
    },
    registerTool() {},
    registerCommand() {},
    getAllTools: () => [{ name: "read" }],
    setActiveTools() {},
  });

  assert.ok(beforeStartHandler);
  const res = await beforeStartHandler({ systemPrompt: "Base" }, { cwd: tmp, hasUI: true });
  assert.match(res.systemPrompt, /Director Creativo y de Producción/);
  assert.match(res.systemPrompt, /\/yts-approve/);
  assert.match(res.systemPrompt, /P01_PACKAGING: NO_INICIADO/);
});

test("package.json version is synchronized with README.md and docs/progreso.md, and scheduled upstream check workflow exists", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));
  const readme = readFileSync(join(ROOT, "README.md"), "utf8");
  const progreso = readFileSync(join(ROOT, "docs", "progreso.md"), "utf8");

  assert.equal(
    readme.includes(`Dónde estamos (\`v${pkg.version}\`):`),
    true,
    `README.md must declare Dónde estamos (\`v${pkg.version}\`):`,
  );
  assert.equal(
    progreso.includes(`**Versión actual:** \`${pkg.version}\``),
    true,
    `docs/progreso.md must declare **Versión actual:** \`${pkg.version}\``,
  );

  const upstreamsWorkflowPath = join(ROOT, ".github", "workflows", "upstreams.yml");
  assert.equal(
    existsSync(upstreamsWorkflowPath),
    true,
    "missing .github/workflows/upstreams.yml for scheduled upstream drift detection",
  );
  const upstreamsWorkflow = readFileSync(upstreamsWorkflowPath, "utf8");
  assert.match(upstreamsWorkflow, /schedule:/);
  assert.match(upstreamsWorkflow, /workflow_dispatch:/);
  assert.match(upstreamsWorkflow, /npm run upstreams:check/);
});


