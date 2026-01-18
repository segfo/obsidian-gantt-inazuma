import {
    Plugin,
    MarkdownPostProcessorContext,
    TFile,
    PluginSettingTab,
    Setting,
    App,
    Notice,
} from "obsidian";
import { parseCsvText, computeInazumaPoints, parseDateWithTZ, getDayIndex } from "./inazuma";

interface Task {
    id: string;
    name: string;
    startDateStr: string;
    endDateStr: string;
    startDate: Date;
    endDate: Date;
    actualRate: number; // 0〜1
}

interface GanttSettings {
    timezone: string; // 'local' | 'UTC' | '+09:00'
}

const DEFAULT_SETTINGS: GanttSettings = {
    timezone: "local",
};

/**
 * 引数のタイムゾーンと（任意の）現在時刻から、そのタイムゾーンの "今日" の UTC ベース 00:00 を返す
 * - tz: 'local' | 'UTC' | '+09:00' のようなオフセット
 * - now: テスト用の現在時刻（省略時は new Date()）
 */
export function computeTodayDateForTimezone(tz: string | undefined, testDate?: Date): Date {
    const timezone = (tz ?? "local").toUpperCase();
    const n = testDate ?? new Date();
    if (timezone === "UTC") {
        return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
    }
    const offsetMatch = timezone.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (offsetMatch) {
        const sign = offsetMatch[1] === "+" ? 1 : -1;
        const hours = parseInt(offsetMatch[2], 10);
        const minutes = parseInt(offsetMatch[3], 10);
        const offsetMinutes = sign * (hours * 60 + minutes);
        const adjusted = new Date(n.getTime() + offsetMinutes * 60 * 1000);
        return new Date(Date.UTC(adjusted.getUTCFullYear(), adjusted.getUTCMonth(), adjusted.getUTCDate()));
    }
    return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

export default class GanttInazumaViewer extends Plugin {
    settings: GanttSettings = DEFAULT_SETTINGS;

    async onload() {
        await this.loadSettings();

        this.addSettingTab(new GanttSettingTab(this.app, this));

        this.registerMarkdownCodeBlockProcessor("gantt", async (source, el, ctx) => {
            try {
                const params = this.parseParams(source);
                const csvParam = params["csv"];
                if (!csvParam) {
                    el.createEl("div", { text: "gantt: csv path is required" });
                    return;
                }

                const csvPath = this.resolveCsvPath(ctx, csvParam.trim());
                const file = this.app.vault.getAbstractFileByPath(csvPath);
                if (!(file instanceof TFile)) {
                    el.createEl("div", { text: `CSV not found: ${csvPath}` });
                    return;
                }

                const csvText = await this.app.vault.read(file);
                const tasks = parseCsvText(csvText, this.settings.timezone);

                const today = this.getTodayDate();

                // イナズマ線の点を計算
                const points = computeInazumaPoints(tasks, today, this.settings.timezone);

                // ガントチャートとイナズマ線の描画
                // ガントを書いた後、イナズマ線を上書きする形で描画する
                const svg = this.renderGanttSvg(tasks, today);
                this.renderInazumaSvg(svg, tasks, points, today);
                el.empty();
                el.appendChild(svg);
            } catch (e) {
                console.error(e);
                new Notice("Error rendering gantt inazuma: " + (e as any).message);
            }
        });
    }

    onunload() { }
    /**
     * パラメータ文字列を解析してキー・バリューの連想配列に変換する
     * - 各行は "key: value" の形式であると想定する
     * - 空行や不正な行は無視する
     */
    parseParams(source: string): Record<string, string> {
        const lines = source.split(/\r?\n/);
        const params: Record<string, string> = {};
        for (const line of lines) {
            const m = line.match(/^\s*([^:]+)\s*:\s*(.+)$/);
            if (m) params[m[1].trim()] = m[2].trim();
        }
        return params;
    }

    /**
     * CSV ファイルパスを解決する
     * - 引数のパスが絶対パス（/で始まる）ならばそのまま返す
     * - 相対パスの場合は、Markdown ノートの所在ディレクトリを基準に解決する
     */
    resolveCsvPath(ctx: MarkdownPostProcessorContext, csvParam: string): string {
        // If absolute (starts with /) treat as vault root; otherwise resolve relative to note path
        if (csvParam.startsWith("/")) return csvParam.slice(1);
        const sourcePath = ctx.sourcePath || "";
        const dir = sourcePath.includes("/") ? sourcePath.replace(/\/[^/]+$/, "") : "";
        return dir ? `${dir}/${csvParam}` : csvParam;
    }
    /**
     * 今日の日付を取得する
     * - 設定の timezone に基づき、UTC またはローカルの日付を返す
     * - 時刻部分は常に 00:00:00 に設定される
     */
    getTodayDate(): Date {
        return computeTodayDateForTimezone(this.settings.timezone);
    }
    /**
     * ガントチャートを SVG に描画する
     * - タスク配列と今日の日付を受け取り、SVG 要素を生成して返す
     * - タスクの開始日・終了日に基づき、日付ヘッダとタスク棒を描画する
     * - タスク棒の色は actualRate と今日の日付に基づき変化する
     *  - 開始日超えてるのに進捗0 : 赤
     *  - 完了 : 緑
     *  - その他 : 水色
     */
    renderGanttSvg(tasks: Task[], today: Date): SVGElement {
        const DAY_WIDTH = 22;
        const ROW_HEIGHT = 28;
        const LEFT = 120;
        const TOP = 14;

        // compute min/max day index
        const dayIndices = tasks.flatMap((t) => [getDayIndex(t.startDate), getDayIndex(t.endDate)]);
        const minIndex = Math.min(...dayIndices);
        const maxIndex = Math.max(...dayIndices);
        const width = LEFT + (maxIndex - minIndex + 3) * DAY_WIDTH;
        const height = TOP + tasks.length * ROW_HEIGHT + 20;

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("width", `${width}`);
        svg.setAttribute("height", `${height}`);
        svg.style.display = "block";

        // 背景
        const bg = document.createElementNS(svgNS, "rect");
        bg.setAttribute("x", "0");
        bg.setAttribute("y", "0");
        bg.setAttribute("width", `${width}`);
        bg.setAttribute("height", `${height}`);
        bg.setAttribute("fill", "transparent");
        svg.appendChild(bg);

        // 日付ヘッダ
        let prevMonth = -1;
        const MS_PER_DAY = 24 * 60 * 60 * 1000;
        const headerY = 14;
        for (let d = minIndex; d <= maxIndex; d++) {
            const xCenter = LEFT + (d - minIndex) * DAY_WIDTH + DAY_WIDTH / 2;
            const dayDate = new Date(d * MS_PER_DAY);
            const m = dayDate.getMonth() + 1;
            const day = dayDate.getDate();
            const showFull = d === minIndex || day === 1;
            const label = showFull ? `${m}/${day}` : `${day}`;
            const t = document.createElementNS(svgNS, "text");
            t.setAttribute("x", `${xCenter}`);
            t.setAttribute("y", `${headerY}`);
            t.setAttribute("font-size", "12");
            t.setAttribute("text-anchor", "middle");
            t.textContent = label;
            svg.appendChild(t);
            prevMonth = m;
        }

        // タスクラベルとガントの棒
        const todayIndexForBars = getDayIndex(today);
        const dayIndicesDebug = dayIndices.map((di) => ({ dayIndex: di, dateUTC: new Date(di * MS_PER_DAY).toUTCString() }));
        tasks.forEach((t, i) => {
            const si = getDayIndex(t.startDate);
            const ei = getDayIndex(t.endDate);
            const y = TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2;
            // タスク名のテキスト
            const text = document.createElementNS(svgNS, "text");
            text.setAttribute("x", `${8}`);
            text.setAttribute("y", `${y + 4}`);
            text.setAttribute("font-size", "12");
            // テキストの最大長さ制限（言語に応じた切り詰め）
            text.textContent = this.truncateTaskName(t.name);
            svg.appendChild(text);

            // プラン終了日の棒
            const startIdx = getDayIndex(t.startDate);
            const endIdx = getDayIndex(t.endDate);
            const x = LEFT + (startIdx - minIndex) * DAY_WIDTH;
            const w = (endIdx - startIdx + 1) * DAY_WIDTH;
            const rect = document.createElementNS(svgNS, "rect");
            rect.setAttribute("x", `${x}`);
            rect.setAttribute("y", `${y - 8}`);
            rect.setAttribute("width", `${w}`);
            rect.setAttribute("height", `16`);

            // 色付け:
            // 完了: actualRate が 1 または 100 のとき 緑
            // 未開始(開始日が過ぎているのに actualRate が 0/null/undefined): 赤
            // それ以外: 青
            let fillColor = "#90caf9"; // default blue (進行中)
            const ar = t.actualRate;
            const isComplete = ar === 1 || ar === 100;
            const isNotStartedAfterStart = startIdx <= todayIndexForBars && (ar === 0 || ar == null);

            if (isComplete) fillColor = "#81c784"; // green (完了)
            else if (isNotStartedAfterStart) fillColor = "#e57373"; // red (開始遅延)

            rect.setAttribute("fill", fillColor);
            rect.setAttribute("opacity", "0.6");
            svg.appendChild(rect);
        });

        // 本日線
        const todayIndex = getDayIndex(this.getTodayDate());
        const TODAY_OFFSET = DAY_WIDTH / 2; // 少し左にずらす調整値
        const todayX = LEFT + (todayIndex - minIndex) * DAY_WIDTH + TODAY_OFFSET;
        const todayLine = document.createElementNS(svgNS, "line");
        todayLine.setAttribute("x1", `${todayX}`);
        todayLine.setAttribute("x2", `${todayX}`);
        todayLine.setAttribute("y1", `${headerY + 6}`); // ヘッダ（日付）の上には描かない
        todayLine.setAttribute("y2", `${height}`);
        todayLine.setAttribute("stroke", "#444");
        todayLine.setAttribute("stroke-width", "2");
        todayLine.setAttribute("stroke-dasharray", "4 4");
        svg.appendChild(todayLine);
        return svg;
    }
    /**
     * イナズマ線を SVG に描画する
     * - 引数の SVG 要素に対してイナズマ線のポリラインとポイントを追加する
     * - tasks はタスク情報の配列、points はイナズマ線のポイント情報の配列
     */
    renderInazumaSvg(svg: SVGElement, tasks: Task[], points: { xIndex: number; y: number; dateIndex: number }[], today?: Date): SVGElement {
        const DAY_WIDTH = 22;
        const LEFT = 120;
        const Y_OFFSET = 6;

        // recompute minIndex from tasks
        const dayIndices = tasks.flatMap((t) => [getDayIndex(t.startDate), getDayIndex(t.endDate)]);
        const minIndex = Math.min(...dayIndices);

        const svgNS = "http://www.w3.org/2000/svg";

        // inazuma polyline
        const poly = document.createElementNS(svgNS, "polyline");
        const pts = points
            .map((p) => {
                const x = LEFT + (p.xIndex - minIndex) * DAY_WIDTH + DAY_WIDTH / 2;
                const y = p.y + Y_OFFSET;
                return `${x},${y}`;
            })
            .join(" ");
        poly.setAttribute("points", pts);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#e53935");
        poly.setAttribute("stroke-width", "2");
        svg.appendChild(poly);

        // points
        points.forEach((p) => {
            const cx = LEFT + (p.xIndex - minIndex) * DAY_WIDTH + DAY_WIDTH / 2;
            const cy = p.y + Y_OFFSET;
            const circle = document.createElementNS(svgNS, "circle");
            circle.setAttribute("cx", `${cx}`);
            circle.setAttribute("cy", `${cy}`);
            circle.setAttribute("r", "3");
            circle.setAttribute("fill", "#e53935");
            svg.appendChild(circle);
        });

        return svg;
    }
    /**
     * タスク名を言語別に切り詰めて返す
     * - 英文字のみ: 最大15文字 (先頭18 + 末尾5)
     * - 日本語のみ: 最大10文字 (先頭7 + 末尾5)
     * - 日英混在: 最大12文字 (先頭または末尾に日本語が含まれる場合は n,m を調整する)
     * - 切り詰めが必要な場合は中央に '...' を挿入する
     */
    private truncateTaskName(name: string): string {
        const hasAscii = /[A-Za-z]/.test(name);
        const hasJapaneseRegex = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
        const hasJapanese = hasJapaneseRegex.test(name);
        const jpOnlyRegex = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u;
        const japaneseOnly = jpOnlyRegex.test(name);

        const EN = { max: 18, head: 10, tail: 8 };
        const JP = { max: 10, head: 5, tail: 5 };
        const MIX = { max: 12, head: 7, tail: 5 }; // 混在している場合はJPを基準に、英文字が2文字あれば1文字ずつ増やす

        let params = EN;

        if (japaneseOnly) {
            params = JP;
        } else if (hasAscii && hasJapanese) {
            // 混在判定は、先頭(head) または 末尾(tail) に日本語が含まれている場合のみ混在扱いにする
            const headSub = name.substring(0, MIX.head);
            const tailSub = name.slice(-MIX.tail);
            const jpInHead = hasJapaneseRegex.test(headSub);
            const jpInTail = hasJapaneseRegex.test(tailSub);
            if (jpInHead || jpInTail) {
                params = MIX;
            } else {
                params = EN; // 英語のみとして扱う
            }
        } else if (hasJapanese) {
            params = JP;
        }

        if (name.length <= params.max) return name;
        // 先頭/末尾に日本語のみが含まれる場合は、表示可能文字数を若干減らす
        let headAdjusted = params.head;
        let tailAdjusted = params.tail;

        const headSeg = name.substring(0, params.head);
        const tailSeg = name.slice(-params.tail);
        const jpOnlyHead = headSeg.length > 0 && jpOnlyRegex.test(headSeg);
        const jpOnlyTail = tailSeg.length > 0 && jpOnlyRegex.test(tailSeg);
        if (!jpOnlyHead && !jpOnlyTail) {
            // すべて英数字で構成されている場合、そのまま
        } else if (!jpOnlyHead || !jpOnlyTail) {
            // 日本語と英数字の混在がある場合、英数字2文字を日本語1文字として扱う視覚長を使って調整する
            const visualLen = (s: string) => {
                let len = 0;
                for (const ch of s) {
                    if (hasJapaneseRegex.test(ch)) len += 1;
                    else len += 5; // 英数字や記号は半分とみなす
                }
                return len;
            };
            headAdjusted = Math.max(1, headAdjusted);
            tailAdjusted = Math.max(1, tailAdjusted);

            // 頭と末尾を増やしつつ、視覚長が params.max を超えないように調整する
            while (headAdjusted + tailAdjusted < name.length) {
                const headVis = visualLen(name.substring(0, headAdjusted));
                const tailVis = visualLen(name.slice(-tailAdjusted));
                // '...' を含めて params.max を超えないようにする（余裕を1だけ残す）
                if (headVis + tailVis >= params.max - 1) break;

                // 優先的に head を増やし、次に tail を増やす
                if (headAdjusted <= tailAdjusted) headAdjusted++;
                else tailAdjusted++;

                // 安全キャップ
                if (headAdjusted + tailAdjusted > name.length) {
                    headAdjusted = Math.min(headAdjusted, name.length - 1);
                    tailAdjusted = Math.min(tailAdjusted, Math.max(1, name.length - 1 - headAdjusted));
                    break;
                }
            }
        } else {
            if (jpOnlyHead && jpOnlyTail) {
                // 両方とも日本語のみの場合は調整不要
            } else if (jpOnlyHead) {
                // jpOnlyHead の場合、head 側を減らす代わりに tail 側を増やす調整を行う
                headAdjusted = Math.max(1, headAdjusted + 2);
                tailAdjusted = Math.max(1, tailAdjusted + EN.tail - JP.tail);
            } else {
                // jpOnlyTail の場合、tail 側を減らす代わりに head 側を増やす調整を行う
                headAdjusted = Math.max(1, headAdjusted + EN.head - JP.head - 1);
                tailAdjusted = Math.max(1, tailAdjusted);
            }
        }

        // もし調整後に head+tail が元の文字列長以上になってしまったら切り詰め不要
        if (headAdjusted + tailAdjusted >= name.length) {
            return name;
        }
        return `${name.substring(0, headAdjusted)}...${name.slice(-tailAdjusted)}`;
    }
    /**
     * プラグイン設定を読み込む
     * - 永続化されたデータ（this.loadData()）を読み、デフォルト設定とマージして `this.settings` に格納する
     * - 設定の未指定値を DEFAULT_SETTINGS で補完する
     */
    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    /**
     * プラグイン設定を保存する
     * - `this.settings` を永続化（this.saveData）する
     */
    async saveSettings() {
        await this.saveData(this.settings);
    }
}
/**
 * プラグイン設定用タブ（Obsidian UI）
 *
 * 概要:
 * - 設定画面に表示される UI 要素を生成する
 * - 現在は `timezone` を編集できるテキストフィールドのみを提供する
 *
 * 注意点:
 * - `display()` は設定タブが表示されるたびに呼ばれるため、状態はこのメソッド内で再描画される
 */
class GanttSettingTab extends PluginSettingTab {
    plugin: GanttInazumaViewer;
    constructor(app: App, plugin: GanttInazumaViewer) {
        super(app, plugin);
        this.plugin = plugin;
    }

    /**
     * 設定タブの表示処理
     * - コンテナをクリアして見出しと設定項目を追加する
     * - タイムゾーン入力の onChange で設定を更新・保存する
     */
    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl("h2", { text: "Gantt Inazuma Settings" });

        new Setting(containerEl)
            .setName("Timezone")
            .setDesc("Use 'local' for local dates, 'UTC' or an offset like '+09:00' for parsing CSV dates.")
            .addText((text) =>
                text
                    .setPlaceholder("local")
                    .setValue(this.plugin.settings.timezone)
                    .onChange(async (value) => {
                        this.plugin.settings.timezone = value || "local";
                        await this.plugin.saveSettings();
                    })
            );
    }
}
