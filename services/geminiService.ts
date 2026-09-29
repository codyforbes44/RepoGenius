// All Gemini calls go through Cody's server-side proxy, so the Gemini API key
// never ships to the browser. The proxy (POST /repogenius/gemini/*) owns the
// prompt templates and holds the key in server-side env only.
//
// Override the proxy location with VITE_GEMINI_PROXY_URL (e.g. for local dev).

const PROXY_BASE = (
  (import.meta.env.VITE_GEMINI_PROXY_URL as string | undefined) ||
  "https://jessica-voice-line.netlify.app"
).replace(/\/$/, "");

export interface ChatTurn {
  role: "user" | "model";
  text: string;
}

export interface ChatSession {
  systemInstruction: string;
  history: ChatTurn[];
}

/** Shared repo context sent with one-shot analyses so the proxy can ground them. */
export interface RepoContext {
  tree: string[];       // file paths, client-capped
  packageJson: string;  // raw package.json, client-capped
  readme: string;       // README excerpt, client-capped
}

const MAX_TREE_PATHS = 400;
const MAX_PACKAGE_JSON = 4000;
const MAX_README = 4000;
const MAX_CODE = 20000;
const MAX_HISTORY_TURNS = 20;

export function buildRepoContext(
  tree: string[],
  packageJson: string,
  readme: string
): RepoContext {
  return {
    tree: tree.slice(0, MAX_TREE_PATHS),
    packageJson: packageJson.slice(0, MAX_PACKAGE_JSON),
    readme: readme.slice(0, MAX_README),
  };
}

async function postJson(path: string, body: unknown): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${PROXY_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Could not reach the AI service. Check your connection and try again.");
  }
  if (!res.ok) {
    if (res.status === 503) {
      throw new Error("AI service is not configured yet. Please try again later.");
    }
    if (res.status === 429) {
      throw new Error("Too many AI requests right now. Wait a bit and try again.");
    }
    throw new Error(`AI request failed (status ${res.status}).`);
  }
  const data = (await res.json()) as { text?: unknown };
  if (typeof data.text !== "string" || !data.text) {
    throw new Error("AI service returned an unexpected response.");
  }
  return data.text;
}

export const createChatSession = (systemInstruction: string): ChatSession => ({
  systemInstruction,
  history: [],
});

export const sendMessageToGemini = async (
  chat: ChatSession,
  message: string
): Promise<string> => {
  const text = await postJson("/repogenius/gemini/chat", {
    systemInstruction: chat.systemInstruction,
    history: chat.history.slice(-MAX_HISTORY_TURNS),
    message,
  });
  chat.history.push({ role: "user", text: message }, { role: "model", text });
  // Keep client-side history bounded too.
  if (chat.history.length > MAX_HISTORY_TURNS * 2) {
    chat.history = chat.history.slice(-MAX_HISTORY_TURNS * 2);
  }
  return text;
};

export const generateSummary = async (
  repoName: string,
  readmeContent: string
): Promise<string> => {
  try {
    return await postJson("/repogenius/gemini/generate", {
      kind: "summary",
      repoName,
      readme: readmeContent.slice(0, 10000),
    });
  } catch (error) {
    console.error("Summary Generation Error:", error);
    return "Failed to generate summary.";
  }
};

export const analyzeCode = async (
  fileName: string,
  code: string
): Promise<string> => {
  try {
    return await postJson("/repogenius/gemini/generate", {
      kind: "analyze",
      fileName,
      code: code.slice(0, MAX_CODE),
    });
  } catch (error) {
    console.error("Code Analysis Error:", error);
    return "Failed to analyze code.";
  }
};

export const generateDeploymentGuide = async (
  repoName: string,
  fileNames: string[],
  readme: string = "",
  packageJson: string = ""
): Promise<string> => {
  try {
    return await postJson("/repogenius/gemini/generate", {
      kind: "guide",
      repoName,
      fileNames,
      readme: readme.slice(0, 3000),
      packageJson: packageJson.slice(0, 3000),
    });
  } catch (error) {
    console.error("Deployment Guide Error:", error);
    return "Failed to generate deployment guide.";
  }
};

export const generateArchitecture = async (
  repoName: string,
  ctx: RepoContext
): Promise<string> => {
  try {
    return await postJson("/repogenius/gemini/generate", {
      kind: "architecture",
      repoName,
      ...ctx,
    });
  } catch (error) {
    console.error("Architecture Error:", error);
    return "Failed to generate architecture overview.";
  }
};

export const generateSecurityAudit = async (
  repoName: string,
  fileName: string,
  code: string,
  ctx: RepoContext
): Promise<string> => {
  try {
    return await postJson("/repogenius/gemini/generate", {
      kind: "security",
      repoName,
      fileName,
      code: code.slice(0, MAX_CODE),
      ...ctx,
    });
  } catch (error) {
    console.error("Security Audit Error:", error);
    return "Failed to run security audit.";
  }
};

export const generateOnboardingGuide = async (
  repoName: string,
  ctx: RepoContext
): Promise<string> => {
  try {
    return await postJson("/repogenius/gemini/generate", {
      kind: "onboarding",
      repoName,
      ...ctx,
    });
  } catch (error) {
    console.error("Onboarding Guide Error:", error);
    return "Failed to generate onboarding guide.";
  }
};
