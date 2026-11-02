import { basename, dirname } from "node:path";
import type { RunManifest } from "./assurance.ts";

export const LEARNING_EVAL_STATUSES = [
  "APPLICABLE",
  "NOT_APPLICABLE",
  "DELIVERED",
  "OBSERVED",
  "VERIFIED",
  "HUMAN_CONFIRMED",
  "NOT_VERIFIED",
] as const;

export type LearningEvalStatus = (typeof LEARNING_EVAL_STATUSES)[number];

export interface AtomicLearningInput {
  learning_id: string;
  destination: string;
  activation: string;
  application: "instruction" | "instruction_plus_human_review" | "deterministic_gate";
  guarantee_level: "DELIVERED" | "HUMAN_JUDGED" | "RUNTIME_ENFORCED";
  test_type: string;
}

export interface LearningEvaluation {
  learning_id: string;
  status: LearningEvalStatus;
  applicable: boolean;
  reason: string;
}

const APPROVAL_STATUSES = /APROBADO|APROBADA/i;
const ORCHESTRATOR_SKILL = "yts-orquestador";

function phaseTokens(activation: string): string[] {
  return activation.match(/P0\d_[A-Z]+/g) ?? [];
}

function skillFolderOfDestination(destination: string): string {
  // destination like "skills/yts-guion-narrativa/SKILL.md" or "src/...".
  const dir = dirname(destination);
  const base = basename(dir);
  return base.startsWith("yts-") ? base : "";
}

function activationApplies(learning: AtomicLearningInput, manifest: RunManifest): boolean {
  const activation = learning.activation ?? "";
  if (/GLOBAL/i.test(activation)) return true;
  const phases = phaseTokens(activation);
  if (phases.length === 0) {
    // Conditional learning with no phase token: treat as applicable to the active phase.
    return true;
  }
  return phases.includes(manifest.targetPhase);
}

function runtimeGateStatus(manifest: RunManifest): {
  status: LearningEvalStatus;
  reason: string;
} {
  const checks = manifest.checks.filter((c) => c.expected);
  const allPassed =
    checks.length > 0 && checks.every((c) => c.executed && c.verdict === "PASS");
  const anyExecuted = checks.some((c) => c.executed);
  const mutated = manifest.actions.completedTools.some(
    (t) =>
      !t.isError &&
      (t.toolName === "write" ||
        t.toolName === "edit" ||
        t.toolName === "yts_check_contract" ||
        t.toolName === "yts_measure_master" ||
        t.toolName === "yts_transition"),
  );

  if (allPassed) {
    return {
      status: "VERIFIED",
      reason: "gate determinista ejecutado con veredicto PASS en esta corrida",
    };
  }
  if (manifest.workMode === "read_only") {
    return { status: "APPLICABLE", reason: "turno de lectura; el gate determinista no aplica" };
  }
  if (anyExecuted || mutated) {
    return {
      status: "OBSERVED",
      reason: "hubo actividad de la fase pero el gate determinista aún no certifica PASS",
    };
  }
  if (manifest.phaseSubmitted) {
    return {
      status: "NOT_VERIFIED",
      reason: "la fase se envió sin evidencia del gate determinista",
    };
  }
  return { status: "APPLICABLE", reason: "aplicable a la fase; aún sin evidencia de verificación" };
}

function humanStatus(manifest: RunManifest): { status: LearningEvalStatus; reason: string } {
  if (manifest.phaseStatusAtEnd && APPROVAL_STATUSES.test(manifest.phaseStatusAtEnd)) {
    return {
      status: "HUMAN_CONFIRMED",
      reason: `fase ${manifest.targetPhase} aprobada por el creador (${manifest.phaseStatusAtEnd})`,
    };
  }
  if (manifest.phaseSubmitted) {
    return {
      status: "APPLICABLE",
      reason: "enviado a revisión; el juicio humano aún no ocurrió",
    };
  }
  return { status: "APPLICABLE", reason: "requiere revisión editorial humana, pendiente" };
}

function deliveredStatus(manifest: RunManifest, learning: AtomicLearningInput): {
  status: LearningEvalStatus;
  reason: string;
} {
  const skillFolder = skillFolderOfDestination(learning.destination);
  const skillDelivered = manifest.context.expectedSkill.deliveredInPrompt;
  const skillRead = manifest.context.expectedSkill.readByAgent;
  const assigned = manifest.context.expectedSkill.name;
  const belongsToAssignedSkill = skillFolder === assigned;
  const isOrchestrator = skillFolder === ORCHESTRATOR_SKILL || skillFolder === "";

  if (belongsToAssignedSkill && (skillDelivered || skillRead)) {
    return {
      status: "DELIVERED",
      reason: `instrucción entregada vía skill asignada (${assigned})`,
    };
  }
  if (isOrchestrator && skillDelivered) {
    return {
      status: "DELIVERED",
      reason: "instrucción del orquestador inyectada en Capa 1 del prompt",
    };
  }
  return { status: "APPLICABLE", reason: "aplicable pero no entregada por la skill de esta fase" };
}

/**
 * Dynamic per-run evaluation of every atomic learning (spec S4 §4.C). A single explicit
 * status from LEARNING_EVAL_STATUSES is assigned to each learning for this exact run.
 */
export function evaluateAtomicLearnings(
  manifest: RunManifest,
  learnings: readonly AtomicLearningInput[],
): LearningEvaluation[] {
  return learnings.map((learning) => {
    if (!activationApplies(learning, manifest)) {
      return {
        learning_id: learning.learning_id,
        status: "NOT_APPLICABLE",
        applicable: false,
        reason: `activación ${learning.activation} no coincide con la fase ${manifest.targetPhase}`,
      };
    }

    let outcome: { status: LearningEvalStatus; reason: string };
    if (learning.guarantee_level === "RUNTIME_ENFORCED") {
      outcome = runtimeGateStatus(manifest);
    } else if (learning.guarantee_level === "HUMAN_JUDGED") {
      outcome = humanStatus(manifest);
    } else {
      outcome = deliveredStatus(manifest, learning);
    }

    return {
      learning_id: learning.learning_id,
      status: outcome.status,
      applicable: true,
      reason: outcome.reason,
    };
  });
}

export interface LearningEvaluationSummary {
  total: number;
  applicable: number;
  notApplicable: number;
  verified: number;
  humanConfirmed: number;
  delivered: number;
  observed: number;
  notVerified: number;
  applicableUnmet: number;
}

export function summarizeLearningEvaluations(
  evaluations: readonly LearningEvaluation[],
): LearningEvaluationSummary {
  const s: LearningEvaluationSummary = {
    total: evaluations.length,
    applicable: 0,
    notApplicable: 0,
    verified: 0,
    humanConfirmed: 0,
    delivered: 0,
    observed: 0,
    notVerified: 0,
    applicableUnmet: 0,
  };
  for (const e of evaluations) {
    if (!e.applicable) s.notApplicable += 1;
    else s.applicable += 1;
    switch (e.status) {
      case "VERIFIED":
        s.verified += 1;
        break;
      case "HUMAN_CONFIRMED":
        s.humanConfirmed += 1;
        break;
      case "DELIVERED":
        s.delivered += 1;
        break;
      case "OBSERVED":
        s.observed += 1;
        break;
      case "NOT_VERIFIED":
        s.notVerified += 1;
        break;
      case "APPLICABLE":
        s.applicableUnmet += 1;
        break;
      default:
        break;
    }
  }
  return s;
}

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export interface AtomicLearningsRegistry {
  learnings: AtomicLearningInput[];
  sourcePath: string;
}

/** Load the atomic_learnings registry (framework-map.json) that drives per-run evaluation. */
export function loadAtomicLearningsRegistry(packageRoot: string): AtomicLearningsRegistry | undefined {
  const sourcePath = join(packageRoot, "framework-map.json");
  if (!existsSync(sourcePath)) return undefined;
  try {
    const parsed = JSON.parse(readFileSync(sourcePath, "utf8")) as {
      atomic_learnings?: Array<Record<string, unknown>>;
    };
    const list = Array.isArray(parsed.atomic_learnings) ? parsed.atomic_learnings : [];
    const learnings: AtomicLearningInput[] = [];
    for (const raw of list) {
      const id = typeof raw.learning_id === "string" ? raw.learning_id : undefined;
      const destination = typeof raw.destination === "string" ? raw.destination : "";
      const activation = typeof raw.activation === "string" ? raw.activation : "";
      const application = raw.application as AtomicLearningInput["application"];
      const guarantee = raw.guarantee_level as AtomicLearningInput["guarantee_level"];
      const testType = typeof raw.test_type === "string" ? raw.test_type : "";
      if (!id || !VALID_APPLICATIONS.has(application) || !VALID_GUARANTEES.has(guarantee)) continue;
      learnings.push({
        learning_id: id,
        destination,
        activation,
        application,
        guarantee_level: guarantee,
        test_type: testType,
      });
    }
    return learnings.length > 0 ? { learnings, sourcePath } : undefined;
  } catch {
    return undefined;
  }
}

const VALID_APPLICATIONS = new Set<string>([
  "instruction",
  "instruction_plus_human_review",
  "deterministic_gate",
]);
const VALID_GUARANTEES = new Set<string>(["DELIVERED", "HUMAN_JUDGED", "RUNTIME_ENFORCED"]);
