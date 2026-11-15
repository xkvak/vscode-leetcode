// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { commands, ProgressLocation, ViewColumn, window } from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
import { globalState } from "../globalState";
import { queryHints } from "../request/query-hints";
import { Endpoint, IProblem } from "../shared";
import { translateToKorean } from "../utils/translateUtils";
import { ILeetCodeWebviewOption, LeetCodeWebview } from "./LeetCodeWebview";
import { markdownEngine } from "./markdownEngine";

class LeetCodePreviewProvider extends LeetCodeWebview {
    protected readonly viewType: string = "leetcode.preview";
    private node: IProblem;
    private description: IDescription;
    private sideMode: boolean = false;
    private translations: Map<string, string> = new Map();
    private translated: boolean = false;
    private latest: IProblem | undefined;
    // timer state lives here so re-renders (translate, problem switch) keep it running
    private timer: ITimer | undefined;
    private timerAlarm: NodeJS.Timeout | undefined;

    public isSideMode(): boolean {
        return this.sideMode;
    }

    public async show(descString: string, node: IProblem, isSideMode: boolean = false): Promise<void> {
        this.latest = node;
        const description: IDescription = this.parseDescription(descString, node);
        const slug: string = description.url.split("/problems/")[1].split("/")[0];
        description.hints = await queryHints(slug).catch((): string[] => []);
        if (this.latest !== node) {
            return; // another problem was opened while loading hints
        }
        this.description = description;
        this.node = node;
        this.sideMode = isSideMode;
        this.translated = false;
        this.showWebviewInternal();
    }

    protected getWebviewOption(): ILeetCodeWebviewOption {
        if (!this.sideMode) {
            return {
                title: `${this.node.name}: Preview`,
                viewColumn: ViewColumn.One,
            };
        } else {
            return {
                title: "Description",
                viewColumn: ViewColumn.One,
                preserveFocus: true,
            };
        }
    }

    protected getWebviewContent(): string {
        if (!this.timer) {
            const minutes: number = globalState.getTimerMinutes();
            this.timer = { end: 0, left: minutes * 60000, total: minutes * 60000, minutes };
        }
        const solve: string = this.sideMode ? "" : `<button id="solve">Code Now</button>`;
        const actions: { element: string; script: string; style: string } = {
            element: `<div id="actions">
                    <div id="timer-group">
                        <div id="timer-pop" hidden>
                            <input id="hours" type="number" min="0" max="23" title="hours"><span class="sep">:</span><input id="mins" type="number" min="0" max="59" title="minutes">
                            <button id="start">Start</button>
                        </div>
                        <button id="timer" title="시작 / 일시정지"></button><button id="more" title="시간 설정"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button><button id="reset" title="초기화"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg></button>
                    </div>
                    <button id="translate">${this.translated ? "English" : "한국어"}</button>${solve}
                </div>`,
            script: `document.getElementById('translate').onclick = () => vscode.postMessage({ command: 'Translate' });
                    const solve = document.getElementById('solve');
                    if (solve) {
                        solve.onclick = () => vscode.postMessage({ command: 'ShowProblem' });
                    }
                    // timer: state comes from the extension and every change is posted back
                    const M = 60000;
                    const t = ${JSON.stringify(this.timer)};
                    const $ = (id) => document.getElementById(id);
                    const pop = $("timer-pop");
                    const ICON = {
                        play: '<svg width="10" height="10" viewBox="0 0 24 24"><path d="M6 4.2v15.6a1.2 1.2 0 0 0 1.8 1l13-7.8a1.2 1.2 0 0 0 0-2L7.8 3.2A1.2 1.2 0 0 0 6 4.2z" fill="currentColor"/></svg>',
                        pause: '<svg width="10" height="10" viewBox="0 0 24 24"><rect x="4" y="3" width="6" height="18" rx="1.5" fill="currentColor"/><rect x="14" y="3" width="6" height="18" rx="1.5" fill="currentColor"/></svg>',
                    };
                    const pad = (n) => String(n).padStart(2, "0");
                    const fmt = (ms) => { const s = Math.ceil(Math.abs(ms) / 1000); return (ms < 0 ? "-" : "") + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); };
                    const draw = () => {
                        const ms = t.end ? t.end - Date.now() : t.left;
                        const idle = !t.end && t.left === t.total;
                        $("timer").innerHTML = (t.end ? ICON.pause : ICON.play) + "<span>" + fmt(ms) + "</span>";
                        $("timer").className = ms < 0 ? "over" : (idle || t.end ? "" : "paused");
                        $("timer").style.setProperty("--p", idle ? "0%" : Math.min(100, (1 - ms / t.total) * 100) + "%");
                        $("more").hidden = !idle;
                        $("reset").hidden = idle;
                        if (!idle) { pop.hidden = true; }
                    };
                    const save = () => { vscode.postMessage({ command: 'Timer', timer: t }); draw(); };
                    const start = (min) => { t.minutes = min; t.left = t.total = min * M; t.end = Date.now() + t.left; pop.hidden = true; save(); };
                    $("timer").onclick = () => { if (t.end) { t.left = t.end - Date.now(); t.end = 0; } else { t.end = Date.now() + t.left; } save(); };
                    $("reset").onclick = () => { t.end = 0; t.left = t.total = t.minutes * M; save(); };
                    $("more").onclick = (e) => {
                        e.stopPropagation();
                        pop.hidden = !pop.hidden;
                        $("hours").value = Math.floor(t.minutes / 60);
                        $("mins").value = pad(t.minutes % 60);
                        if (!pop.hidden) { $("mins").focus(); $("mins").select(); }
                    };
                    $("start").onclick = () => { const m = Math.round(+$("hours").value || 0) * 60 + Math.round(+$("mins").value || 0); if (m >= 1) { start(m); } };
                    pop.onkeydown = (e) => { if (e.key === "Enter") { $("start").click(); } if (e.key === "Escape") { pop.hidden = true; } };
                    document.addEventListener("click", (e) => { if (!pop.contains(e.target)) { pop.hidden = true; } });
                    setInterval(draw, 1000); draw();`,
            style: `<style>
                #actions {
                    position: fixed;
                    bottom: 1rem;
                    right: 1rem;
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    padding: 0.35rem;
                    border-radius: 10px;
                    background-color: var(--vscode-editor-background);
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
                }
                #actions button, #actions input {
                    border: 0;
                    border-radius: 8px;
                    padding: 0.35rem 0.9rem;
                    font: inherit;
                    font-size: 13px;
                    font-weight: 500;
                    color: var(--vscode-foreground);
                    background-color: rgba(128, 128, 128, 0.2);
                }
                #actions button {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 0.5rem;
                    cursor: pointer;
                }
                #actions button svg { flex: none; }
                #actions button:hover { background-color: rgba(128, 128, 128, 0.3); }
                #actions [hidden] { display: none; }
                #actions #solve { color: #2cbb5d; }
                #actions #timer {
                    min-width: 6.8rem;
                    font-variant-numeric: tabular-nums;
                    /* thin progress line along the bottom edge */
                    background-image: linear-gradient(currentColor, currentColor);
                    background-repeat: no-repeat;
                    background-position: left bottom;
                    background-size: var(--p, 0%) 2px;
                }
                #actions #more, #actions #reset { padding: 0.35rem 0.6rem; }
                #actions #timer.paused { color: #ffc01e; }
                #actions #timer.over { color: #ef4743; }
                .vscode-light #actions #solve { color: #1a9a4b; }
                .vscode-light #actions #timer.paused { color: #b07d00; }
                /* timer + settings/reset as one segmented control */
                #timer-group {
                    position: relative;
                    display: flex;
                    border-radius: 8px;
                    background-color: rgba(128, 128, 128, 0.2);
                }
                #actions #timer-group > button { border-radius: 0; background-color: transparent; }
                #actions #timer-group > button:hover { background-color: rgba(128, 128, 128, 0.15); }
                #actions #timer-group > #timer { border-radius: 8px 0 0 8px; }
                #actions #timer-group > #more, #actions #timer-group > #reset {
                    border-radius: 0 8px 8px 0;
                    border-left: 1px solid rgba(128, 128, 128, 0.35);
                    background-color: rgba(128, 128, 128, 0.12);
                }
                #actions #timer-group > #more:hover, #actions #timer-group > #reset:hover { background-color: rgba(128, 128, 128, 0.25); }
                #timer-pop {
                    position: absolute;
                    bottom: calc(100% + 0.6rem);
                    /* same width as the timer group below */
                    left: 0;
                    right: 0;
                    display: flex;
                    align-items: center;
                    gap: 0.3rem;
                    padding: 0.45rem;
                    white-space: nowrap;
                    border-radius: 10px;
                    border: 1px solid rgba(128, 128, 128, 0.35);
                    /* a shade off the page so it reads as its own layer */
                    background: linear-gradient(rgba(128, 128, 128, 0.08), rgba(128, 128, 128, 0.08)), var(--vscode-editor-background);
                    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.4);
                }
                /* inputs look like inputs, not like the toolbar buttons */
                #actions #timer-pop input {
                    width: 1.9rem;
                    padding: 0.25rem 0.2rem;
                    text-align: center;
                    font-variant-numeric: tabular-nums;
                    border: 1px solid rgba(128, 128, 128, 0.45);
                    border-radius: 6px;
                    background-color: var(--vscode-input-background);
                }
                #actions #timer-pop input:focus { outline: none; border-color: var(--vscode-focusBorder); }
                #actions #start { flex: 1; margin-left: 0.15rem; padding: 0.35rem 0.5rem; color: #fff; background-color: #2cbb5d; }
                #actions #start:hover { background-color: #26a352; }
                #timer-pop .sep { font-weight: 600; opacity: 0.8; }
                #timer-pop input::-webkit-inner-spin-button { -webkit-appearance: none; }
                </style>`,
        };
        const { title, url, category, difficulty, likes, dislikes } = this.description;
        const body: string = (this.translated && this.translations.get(this.node.id)) || this.bodyWithHints();
        const head: string = markdownEngine.render(`# [${title}](${url})`);
        const info: string = markdownEngine.render(
            [
                `| Category | Difficulty | Likes | Dislikes |`,
                `| :------: | :--------: | :---: | :------: |`,
                `| ${category} | ${difficulty} | ${likes} | ${dislikes} |`,
            ].join("\n")
        );
        const tags: string = [
            `<details>`,
            `<summary><strong>Tags</strong></summary>`,
            markdownEngine.render(this.description.tags.map((t: string) => `[\`${t}\`](${this.getTagLink(t)})`).join(" | ")),
            `</details>`,
        ].join("\n");
        const companies: string = [
            `<details>`,
            `<summary><strong>Companies</strong></summary>`,
            markdownEngine.render(this.description.companies.map((c: string) => `\`${c}\``).join(" | ")),
            `</details>`,
        ].join("\n");
        const links: string = markdownEngine.render(`[Submissions](${this.getSubmissionsLink(url)}) | [Solution](${this.getSolutionsLink(url)})`);
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https:; script-src vscode-resource: 'unsafe-inline'; style-src vscode-resource: 'unsafe-inline';"/>
                ${markdownEngine.getStyles()}
                ${actions.style}
                <style>
                    code { white-space: pre-wrap; }
                    /* LeetCode's newer example markup */
                    .example-block {
                        margin: 0.5rem 0 1rem;
                        padding: 0.25rem 1rem;
                        border-left: 2px solid var(--vscode-textBlockQuote-border);
                    }
                    .example-block p { margin: 0.3rem 0; }
                    .example-io { font-family: var(--vscode-editor-font-family); }
                </style>
            </head>
            <body>
                ${head}
                ${info}
                ${body}
                <hr />
                ${tags}
                ${companies}
                ${links}
                ${actions.element}
                <script>
                    const vscode = acquireVsCodeApi();
                    ${actions.script}
                </script>
            </body>
            </html>
        `;
    }

    protected onDidDisposeWebview(): void {
        super.onDidDisposeWebview();
        this.sideMode = false;
    }

    protected async onDidReceiveMessage(message: IWebViewMessage): Promise<void> {
        switch (message.command) {
            case "ShowProblem": {
                await commands.executeCommand("leetcode.showProblem", this.node);
                break;
            }
            case "Translate": {
                await this.toggleTranslation();
                break;
            }
            case "Timer": {
                this.timer = message.timer!;
                globalState.setTimerMinutes(this.timer.minutes);
                clearTimeout(this.timerAlarm!);
                if (this.timer.end > Date.now()) {
                    this.timerAlarm = setTimeout(() => window.showInformationMessage("⏰ 풀이 시간이 끝났어요"), this.timer.end - Date.now());
                }
                break;
            }
        }
    }

    // Hints go below the description, each collapsed (no `open`), so they stay folded after every re-render.
    private bodyWithHints(): string {
        const hints: string = this.description.hints
            .map((h: string, i: number) => `<details><summary><strong>Hint ${i + 1}</strong></summary>${h}</details>`)
            .join("\n");
        return `${this.description.body}\n\n${hints}`;
    }

    private async toggleTranslation(): Promise<void> {
        const node: IProblem = this.node;
        if (!this.translated && !this.translations.has(node.id)) {
            try {
                const korean: string = await window.withProgress(
                    { location: ProgressLocation.Notification, title: "Translating with Claude..." },
                    () => translateToKorean(this.bodyWithHints()),
                );
                this.translations.set(node.id, korean);
            } catch (error) {
                window.showErrorMessage(`Translation failed: ${error.message}`);
                return;
            }
            if (this.node !== node) {
                return; // another problem was opened while translating
            }
        }
        this.translated = !this.translated;
        this.showWebviewInternal();
    }

    // private async hideSideBar(): Promise<void> {
    //     await commands.executeCommand("workbench.action.focusSideBar");
    //     await commands.executeCommand("workbench.action.toggleSidebarVisibility");
    // }

    private parseDescription(descString: string, problem: IProblem): IDescription {
        const [
            ,
            ,
            /* title */ url,
            ,
            ,
            ,
            ,
            ,
            /* tags */ /* langs */ category,
            difficulty,
            likes,
            dislikes,
            ,
            ,
            ,
            ,
            /* accepted */ /* submissions */ /* testcase */ ...body
        ] = descString.split("\n");
        return {
            title: problem.name,
            url,
            tags: problem.tags,
            companies: problem.companies,
            category: category.slice(2),
            difficulty: difficulty.slice(2),
            likes: likes.split(": ")[1].trim(),
            dislikes: dislikes.split(": ")[1].trim(),
            body: body.join("\n").replace(/<pre>[\r\n]*([^]+?)[\r\n]*<\/pre>/g, "<pre><code>$1</code></pre>"),
            hints: [],
        };
    }

    private getTagLink(tag: string): string {
        const endPoint: string = getLeetCodeEndpoint();
        if (endPoint === Endpoint.LeetCodeCN) {
            return `https://leetcode.cn/tag/${tag}?source=vscode`;
        } else if (endPoint === Endpoint.LeetCode) {
            return `https://leetcode.com/tag/${tag}?source=vscode`;
        }

        return "https://leetcode.com?source=vscode";
    }

    private getSolutionsLink(url: string): string {
        return url.replace("/description/", "/solutions/") + "?source=vscode";
    }
    private getSubmissionsLink(url: string): string {
        return url.replace("/description/", "/submissions/") + "?source=vscode";
    }
}

interface IDescription {
    title: string;
    url: string;
    tags: string[];
    companies: string[];
    category: string;
    difficulty: string;
    likes: string;
    dislikes: string;
    body: string;
    hints: string[];
}

interface IWebViewMessage {
    command: string;
    timer?: ITimer;
}

interface ITimer {
    end: number; // epoch ms when time is up; 0 while not running
    left: number; // ms left while not running
    total: number; // ms of the current run, for the progress line
    minutes: number; // chosen duration
}

export const leetCodePreviewProvider: LeetCodePreviewProvider = new LeetCodePreviewProvider();
