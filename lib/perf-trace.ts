type PerfStage = {
  name: string;
  ms: number;
};

type PerfMeta = Record<string, string | number | boolean | null | undefined>;

function roundedMs(value: number) {
  return Math.round(value * 10) / 10;
}

function diagnosticsEnabled() {
  return process.env.NOIR_PERF_LOGS === "true";
}

export function createPerfTrace(operation: string, baseMeta: PerfMeta = {}) {
  const startedAt = performance.now();
  const stages: PerfStage[] = [];
  let finished = false;

  async function measure<T>(name: string, task: () => Promise<T>): Promise<T> {
    const stageStartedAt = performance.now();

    try {
      return await task();
    } finally {
      stages.push({
        name,
        ms: roundedMs(performance.now() - stageStartedAt),
      });
    }
  }

  function measureSync<T>(name: string, task: () => T): T {
    const stageStartedAt = performance.now();

    try {
      return task();
    } finally {
      stages.push({
        name,
        ms: roundedMs(performance.now() - stageStartedAt),
      });
    }
  }

  function finish(status: "ok" | "error" = "ok", meta: PerfMeta = {}) {
    if (finished) return;
    finished = true;

    if (!diagnosticsEnabled()) return;

    console.info(
      "[NOIR_PERF]",
      JSON.stringify({
        operation,
        status,
        totalMs: roundedMs(performance.now() - startedAt),
        stages,
        ...baseMeta,
        ...meta,
      }),
    );
  }

  return { measure, measureSync, finish };
}
