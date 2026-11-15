import * as unescapeJS from "unescape-js";

const START: string = "# @lc code=start";
const END: string = "# @lc code=end";
const PY: { [json: string]: string } = { true: "True", false: "False", null: "None" };

// "# Testcase Example:  '[2,7,11,15]\n9'": util.inspect output, long values span lines as 'a\n' + 'b'
function firstExample(template: string): string[] {
    const m: RegExpMatchArray | null = template.match(/Testcase Example:\s+([^]*?)\n#\n/);
    const parts: string[] = (m && m[1].match(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|`(?:[^`\\]|\\.)*`/g)) || [];
    const raw: string = parts.map((s: string) => unescapeJS(s.slice(1, -1))).join("");
    // JSON -> Python literals; strings are matched first so their contents stay untouched
    return raw ? raw.split("\n").map((v: string) =>
        v.replace(/"(?:[^"\\]|\\.)*"|\b(true|false|null)\b/g, (s: string, w?: string) => w ? PY[w] : s)) : [];
}

// Reshape LeetCode's python3 template into the personal lc_<id>.py format.
// Keeps the @lc header line and code markers: Test/Submit read the id from the
// header and only submit the code between the markers.
export function formatPython3Template(template: string): string {
    const header: string | undefined = template.split("\n").find((line: string) => line.includes("@lc app="));
    const title: RegExpMatchArray | null = template.match(/^# \[(\d+)\] (.*)$/m);
    const start: number = template.indexOf(START);
    const end: number = template.indexOf(END);
    if (!header || !title || start < 0 || end < 0) {
        return template; // unexpected shape: leave it as LeetCode gave it
    }

    let code: string = template.slice(start + START.length, end).replace(/^\n/, "").replace(/\bList\[/g, "list[");
    let call: string = "";
    if (code.includes("class Solution:")) {
        code = code.replace("class Solution:\n", `class Solution:\n    """leetcode ${title[1]}. ${title[2].trim()}"""\n\n`);
        // search below the class only: ListNode/TreeNode comment blocks contain their own `def __init__`
        const def: RegExpMatchArray | null = code.slice(code.indexOf("class Solution:")).match(/def (\w+)\(self,?([^)]*)\)/);
        if (def) {
            const params: string[] = def[2].match(/\w+(?=\s*:)/g) || [];
            const v: string[] = firstExample(template);
            // no example or count mismatch: fall back to p=...
            const args: string = params.map((p: string, i: number) => `${p}=${v.length === params.length ? v[i] : "..."}`).join(", ");
            call = `\n\nif __name__ == "__main__":\n    print(Solution().${def[1]}(${args}))\n`;
        }
    }
    return `${header.trim()}\n\n${START}\n${code}${END}\n${call}`;
}
