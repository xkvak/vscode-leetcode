import * as cp from "child_process";
import * as os from "os";

const SYSTEM_PROMPT: string = "Translate the HTML given by the user from English to Korean. "
    + "Keep every HTML tag and attribute, code, variable names, values, numbers and formulas exactly as they are. "
    + "Example blocks inside <pre> also contain prose: translate their labels and Explanation sentences but keep the Input and Output values unchanged. "
    + "Output only the translated HTML, with no explanation and no code fences.";

// Claude Code headless on the user's Claude login, with no tools, MCP servers or settings files.
const args: string[] = ["-p", "Translate this HTML.", "--model", "opus", "--tools", "", "--strict-mcp-config",
    "--setting-sources", "", "--no-session-persistence", "--system-prompt", SYSTEM_PROMPT];

export function translateToKorean(html: string): Promise<string> {
    return new Promise((resolve: (value: string) => void, reject: (reason: Error) => void): void => {
        // tmpdir: keep project CLAUDE.md files out of the translation
        const child: cp.ChildProcess = cp.execFile("claude", args, { cwd: os.tmpdir(), maxBuffer: 10 * 1024 * 1024, timeout: 180000 },
            (error: Error | null, stdout: string, stderr: string) => error ? reject(new Error(stderr.trim() || error.message)) : resolve(stdout));
        child.stdin!.end(html);
    });
}
