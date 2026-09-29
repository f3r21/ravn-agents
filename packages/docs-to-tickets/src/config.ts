import path from "node:path";

export interface ServerConfig {
  live: boolean;
  token: string | null;
  /**
   * `${CLAUDE_PLUGIN_DATA}/tickets`, the base of every per-repo state directory. Null when the
   * plugin data directory is not in the environment: the server then refuses tool calls instead
   * of guessing a directory, because its working directory is not documented.
   */
  stateBase: string | null;
  thresholdsFile: string;
}

/** A plugin variable that was never substituted arrives empty or as the literal placeholder. */
function resolved(value: string | undefined): string | null {
  const v = value?.trim();
  return v && !v.startsWith("${") ? v : null;
}

/**
 * Server configuration from the environment. Creation stays off unless RAVN_TICKETS_LIVE is
 * exactly "1": the server is dry-run by default.
 */
export function configFromEnv(env: NodeJS.ProcessEnv, serverDir: string): ServerConfig {
  const pluginData = resolved(env.CLAUDE_PLUGIN_DATA);
  return {
    live: env.RAVN_TICKETS_LIVE === "1",
    token: resolved(env.GITHUB_TOKEN),
    stateBase: pluginData ? path.join(pluginData, "tickets") : null,
    thresholdsFile: env.RAVN_TICKETS_THRESHOLDS || path.join(serverDir, "..", "thresholds.json"),
  };
}
