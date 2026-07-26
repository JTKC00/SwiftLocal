"use strict";

/**
 * Pure helpers for workflow resume indexing / input resolution.
 * Mirrors logic in frontend/app.js (kept free of DOM).
 */

const assert = require("node:assert/strict");
const { describe, test } = require("node:test");

function findWorkflowResumeIndex(run) {
  if (!run || !Array.isArray(run.steps)) return -1;
  return run.steps.findIndex((step) => step.status !== "done");
}

function resolveWorkflowStepInputs(run, stepIndex, jobs) {
  if (stepIndex <= 0) {
    return Array.isArray(run.inputPaths) ? run.inputPaths.filter(Boolean) : [];
  }
  const stored = run.stepOutputs && run.stepOutputs[stepIndex - 1];
  if (Array.isArray(stored) && stored.length) {
    return stored.filter(Boolean);
  }
  const prev = run.steps[stepIndex - 1];
  if (prev && prev.jobId && Array.isArray(jobs)) {
    const job = jobs.find((item) => item.id === prev.jobId);
    if (job && Array.isArray(job.outputPaths)) {
      return job.outputPaths.map((item) => item && item.path).filter(Boolean);
    }
  }
  return [];
}

describe("workflow resume helpers", () => {
  test("resume index is first non-done step", () => {
    assert.equal(
      findWorkflowResumeIndex({
        steps: [
          { status: "done" },
          { status: "failed" },
          { status: "pending" }
        ]
      }),
      1
    );
    assert.equal(
      findWorkflowResumeIndex({
        steps: [{ status: "done" }, { status: "done" }]
      }),
      -1
    );
  });

  test("step 0 uses original inputPaths", () => {
    assert.deepEqual(
      resolveWorkflowStepInputs({ inputPaths: ["a.pdf", "b.pdf"] }, 0, []),
      ["a.pdf", "b.pdf"]
    );
  });

  test("later steps prefer stepOutputs then previous job outputs", () => {
    const run = {
      inputPaths: ["src.docx"],
      stepOutputs: { 0: ["mid.pdf"] },
      steps: [
        { status: "done", jobId: "j1" },
        { status: "failed", jobId: "j2" }
      ]
    };
    assert.deepEqual(resolveWorkflowStepInputs(run, 1, []), ["mid.pdf"]);

    const withoutStored = {
      inputPaths: ["src.docx"],
      steps: [
        { status: "done", jobId: "j1" },
        { status: "failed", jobId: "j2" }
      ]
    };
    const jobs = [
      {
        id: "j1",
        outputPaths: [{ path: "C:/out/from-job.pdf", name: "from-job.pdf" }]
      }
    ];
    assert.deepEqual(resolveWorkflowStepInputs(withoutStored, 1, jobs), ["C:/out/from-job.pdf"]);
  });
});
