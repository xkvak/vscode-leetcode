// Copyright (c) jdneo. All rights reserved.
// Licensed under the MIT license.

import { commands, ProgressLocation, ViewColumn, window } from "vscode";
import { getLeetCodeEndpoint } from "../commands/plugin";
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
        const solve: string = this.sideMode ? "" : `<button id="solve">Code Now</button>`;
        const actions: { element: string; script: string; style: string } = {
            element: `<div id="actions"><button id="translate">${this.translated ? "English" : "한국어"}</button>${solve}</div>`,
            script: `document.getElementById('translate').onclick = () => vscode.postMessage({ command: 'Translate' });
                    const solve = document.getElementById('solve');
                    if (solve) {
                        solve.onclick = () => vscode.postMessage({ command: 'ShowProblem' });
                    }`,
            style: `<style>
                #actions {
                    position: fixed;
                    bottom: 1rem;
                    right: 1rem;
                    margin: 1rem 0;
                    display: flex;
                    gap: 0.5rem;
                }
                #actions button {
                    border: 0;
                    padding: 0.2rem 1rem;
                    color: white;
                    background-color: var(--vscode-button-background);
                }
                #actions button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                #actions button:active {
                    border: 0;
                }
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
}

export const leetCodePreviewProvider: LeetCodePreviewProvider = new LeetCodePreviewProvider();
