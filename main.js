"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  computeTodayDateForTimezone: () => computeTodayDateForTimezone,
  default: () => GanttInazumaViewer
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");

// inazuma.ts
var MS_PER_DAY = 24 * 60 * 60 * 1e3;
function parseCsvText(csvText, tz) {
  function parseRows(text) {
    const rows = [];
    let curField = "";
    let curRow = [];
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            curField += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          curField += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ",") {
          curRow.push(curField);
          curField = "";
        } else if (ch === "\r") {
        } else if (ch === "\n") {
          curRow.push(curField);
          rows.push(curRow);
          curRow = [];
          curField = "";
        } else {
          curField += ch;
        }
      }
    }
    if (inQuotes) {
      inQuotes = false;
    }
    if (curField !== "" || curRow.length > 0) {
      curRow.push(curField);
      rows.push(curRow);
    }
    return rows;
  }
  const allRows = parseRows(csvText);
  if (allRows.length === 0) return [];
  const header = allRows[0].map((h) => h.trim());
  const dataRows = allRows.slice(1).filter((r) => r.some((c) => String(c).trim().length > 0));
  const tasks = [];
  for (const colsRaw of dataRows) {
    const cols = colsRaw.map((c) => String(c));
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = (cols[i] || "").trim();
    const id = obj["task_id"] || obj["id"] || "";
    const name = obj["task_name"] || obj["name"] || id;
    const startStr = obj["plan_start"] || obj["start"] || "";
    const endStr = obj["plan_end"] || obj["end"] || "";
    const actualRaw = obj["actual"] ?? obj["progress"] ?? "0";
    const actual = typeof actualRaw === "string" && actualRaw.includes("%") ? parseFloat(actualRaw.replace("%", "")) : parseFloat(String(actualRaw));
    const startDate = parseDateWithTZ(startStr, tz);
    const endDate = parseDateWithTZ(endStr, tz);
    if (!startDate || !endDate) continue;
    tasks.push({
      id,
      name,
      startDateStr: startStr,
      endDateStr: endStr,
      startDate,
      endDate,
      actualRate: isNaN(actual) ? 0 : Math.max(0, Math.min(1, actual / 100))
    });
  }
  return tasks;
}
function parseDateWithTZ(dateString, tz) {
  if (!dateString) return null;
  const m = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return new Date(dateString);
  const y = parseInt(m[1], 10);
  const mo = parseInt(m[2], 10);
  const d = parseInt(m[3], 10);
  if (!tz || tz === "local") {
    return new Date(y, mo - 1, d);
  }
  if (tz === "UTC") {
    return new Date(Date.UTC(y, mo - 1, d));
  }
  const off = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (off) {
    const sign = off[1] === "+" ? 1 : -1;
    const hh = parseInt(off[2], 10);
    const mm = parseInt(off[3], 10);
    const offsetMinutes = sign * (hh * 60 + mm);
    const utc = Date.UTC(y, mo - 1, d);
    return new Date(utc - offsetMinutes * 60 * 1e3);
  }
  return new Date(y, mo - 1, d);
}
function getDayIndex(d) {
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}
function computeInazumaPoints(tasks, today, tz) {
  const TOP = 8;
  const ROW_HEIGHT = 28;
  const points = [];
  const todayIndex = getDayIndex(today);
  for (let i = 0; i < tasks.length; i++) {
    const t = tasks[i];
    const startIndex = getDayIndex(t.startDate);
    const endIndex = getDayIndex(t.endDate);
    const totalDays = endIndex - startIndex + 1;
    let elapsed = todayIndex - startIndex + 1;
    if (todayIndex < startIndex) elapsed = 0;
    if (todayIndex > endIndex) elapsed = totalDays;
    const plannedRate = Math.max(0, Math.min(1, totalDays > 0 ? elapsed / totalDays : 1));
    const actualRate = Math.max(0, Math.min(1, t.actualRate));
    const rawX = startIndex + actualRate * totalDays;
    let x;
    if (actualRate === 0 && todayIndex < startIndex) {
      x = todayIndex;
    } else {
      x = Math.floor(rawX);
    }
    const y = TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2;
    points.push({ xIndex: x, y, dateIndex: startIndex });
  }
  return points;
}

// main.ts
var DEFAULT_SETTINGS = {
  timezone: "local"
};
function computeTodayDateForTimezone(tz, testDate) {
  const timezone = (tz ?? "local").toUpperCase();
  const n = testDate ?? /* @__PURE__ */ new Date();
  if (timezone === "UTC") {
    return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
  }
  const offsetMatch = timezone.match(/^([+-])(\d{2}):?(\d{2})$/);
  if (offsetMatch) {
    const sign = offsetMatch[1] === "+" ? 1 : -1;
    const hours = parseInt(offsetMatch[2], 10);
    const minutes = parseInt(offsetMatch[3], 10);
    const offsetMinutes = sign * (hours * 60 + minutes);
    const adjusted = new Date(n.getTime() + offsetMinutes * 60 * 1e3);
    return new Date(Date.UTC(adjusted.getUTCFullYear(), adjusted.getUTCMonth(), adjusted.getUTCDate()));
  }
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}
var GanttInazumaViewer = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
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
        if (!(file instanceof import_obsidian.TFile)) {
          el.createEl("div", { text: `CSV not found: ${csvPath}` });
          return;
        }
        const csvText = await this.app.vault.read(file);
        const tasks = parseCsvText(csvText, this.settings.timezone);
        const today = this.getTodayDate();
        const points = computeInazumaPoints(tasks, today, this.settings.timezone);
        const svg = this.renderGanttSvg(tasks, today);
        this.renderInazumaSvg(svg, tasks, points, today);
        el.empty();
        el.appendChild(svg);
      } catch (e) {
        console.error(e);
        new import_obsidian.Notice("Error rendering gantt inazuma: " + e.message);
      }
    });
  }
  onunload() {
  }
  /**
   * パラメータ文字列を解析してキー・バリューの連想配列に変換する
   * - 各行は "key: value" の形式であると想定する
   * - 空行や不正な行は無視する
   */
  parseParams(source) {
    const lines = source.split(/\r?\n/);
    const params = {};
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
  resolveCsvPath(ctx, csvParam) {
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
  getTodayDate() {
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
  renderGanttSvg(tasks, today) {
    const DAY_WIDTH = 22;
    const ROW_HEIGHT = 28;
    const LEFT = 120;
    const TOP = 14;
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
    const bg = document.createElementNS(svgNS, "rect");
    bg.setAttribute("x", "0");
    bg.setAttribute("y", "0");
    bg.setAttribute("width", `${width}`);
    bg.setAttribute("height", `${height}`);
    bg.setAttribute("fill", "transparent");
    svg.appendChild(bg);
    let prevMonth = -1;
    const MS_PER_DAY2 = 24 * 60 * 60 * 1e3;
    const headerY = 14;
    for (let d = minIndex; d <= maxIndex; d++) {
      const xCenter = LEFT + (d - minIndex) * DAY_WIDTH + DAY_WIDTH / 2;
      const dayDate = new Date(d * MS_PER_DAY2);
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
    const todayIndexForBars = getDayIndex(today);
    const dayIndicesDebug = dayIndices.map((di) => ({ dayIndex: di, dateUTC: new Date(di * MS_PER_DAY2).toUTCString() }));
    tasks.forEach((t, i) => {
      const si = getDayIndex(t.startDate);
      const ei = getDayIndex(t.endDate);
      const y = TOP + i * ROW_HEIGHT + ROW_HEIGHT / 2;
      const text = document.createElementNS(svgNS, "text");
      text.setAttribute("x", `${8}`);
      text.setAttribute("y", `${y + 4}`);
      text.setAttribute("font-size", "12");
      text.textContent = this.truncateTaskName(t.name);
      svg.appendChild(text);
      const startIdx = getDayIndex(t.startDate);
      const endIdx = getDayIndex(t.endDate);
      const x = LEFT + (startIdx - minIndex) * DAY_WIDTH;
      const w = (endIdx - startIdx + 1) * DAY_WIDTH;
      const rect = document.createElementNS(svgNS, "rect");
      rect.setAttribute("x", `${x}`);
      rect.setAttribute("y", `${y - 8}`);
      rect.setAttribute("width", `${w}`);
      rect.setAttribute("height", `16`);
      let fillColor = "#90caf9";
      const ar = t.actualRate;
      const isComplete = ar === 1 || ar === 100;
      const isNotStartedAfterStart = startIdx <= todayIndexForBars && (ar === 0 || ar == null);
      if (isComplete) fillColor = "#81c784";
      else if (isNotStartedAfterStart) fillColor = "#e57373";
      rect.setAttribute("fill", fillColor);
      rect.setAttribute("opacity", "0.6");
      svg.appendChild(rect);
    });
    const todayIndex = getDayIndex(this.getTodayDate());
    const TODAY_OFFSET = DAY_WIDTH / 2;
    const todayX = LEFT + (todayIndex - minIndex) * DAY_WIDTH + TODAY_OFFSET;
    const todayLine = document.createElementNS(svgNS, "line");
    todayLine.setAttribute("x1", `${todayX}`);
    todayLine.setAttribute("x2", `${todayX}`);
    todayLine.setAttribute("y1", `${headerY + 6}`);
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
  renderInazumaSvg(svg, tasks, points, today) {
    const DAY_WIDTH = 22;
    const LEFT = 120;
    const Y_OFFSET = 6;
    const dayIndices = tasks.flatMap((t) => [getDayIndex(t.startDate), getDayIndex(t.endDate)]);
    const minIndex = Math.min(...dayIndices);
    const svgNS = "http://www.w3.org/2000/svg";
    const poly = document.createElementNS(svgNS, "polyline");
    const pts = points.map((p) => {
      const x = LEFT + (p.xIndex - minIndex) * DAY_WIDTH + DAY_WIDTH / 2;
      const y = p.y + Y_OFFSET;
      return `${x},${y}`;
    }).join(" ");
    poly.setAttribute("points", pts);
    poly.setAttribute("fill", "none");
    poly.setAttribute("stroke", "#e53935");
    poly.setAttribute("stroke-width", "2");
    svg.appendChild(poly);
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
  truncateTaskName(name) {
    const hasAscii = /[A-Za-z]/.test(name);
    const hasJapaneseRegex = /\p{Script=Han}|\p{Script=Hiragana}|\p{Script=Katakana}/u;
    const hasJapanese = hasJapaneseRegex.test(name);
    const jpOnlyRegex = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]+$/u;
    const japaneseOnly = jpOnlyRegex.test(name);
    const EN = { max: 18, head: 10, tail: 8 };
    const JP = { max: 10, head: 5, tail: 5 };
    const MIX = { max: 12, head: 7, tail: 5 };
    let params = EN;
    if (japaneseOnly) {
      params = JP;
    } else if (hasAscii && hasJapanese) {
      const headSub = name.substring(0, MIX.head);
      const tailSub = name.slice(-MIX.tail);
      const jpInHead = hasJapaneseRegex.test(headSub);
      const jpInTail = hasJapaneseRegex.test(tailSub);
      if (jpInHead || jpInTail) {
        params = MIX;
      } else {
        params = EN;
      }
    } else if (hasJapanese) {
      params = JP;
    }
    if (name.length <= params.max) return name;
    let headAdjusted = params.head;
    let tailAdjusted = params.tail;
    const headSeg = name.substring(0, params.head);
    const tailSeg = name.slice(-params.tail);
    const jpOnlyHead = headSeg.length > 0 && jpOnlyRegex.test(headSeg);
    const jpOnlyTail = tailSeg.length > 0 && jpOnlyRegex.test(tailSeg);
    if (!jpOnlyHead && !jpOnlyTail) {
    } else if (!jpOnlyHead || !jpOnlyTail) {
      const visualLen = (s) => {
        let len = 0;
        for (const ch of s) {
          if (hasJapaneseRegex.test(ch)) len += 1;
          else len += 5;
        }
        return len;
      };
      headAdjusted = Math.max(1, headAdjusted);
      tailAdjusted = Math.max(1, tailAdjusted);
      while (headAdjusted + tailAdjusted < name.length) {
        const headVis = visualLen(name.substring(0, headAdjusted));
        const tailVis = visualLen(name.slice(-tailAdjusted));
        if (headVis + tailVis >= params.max - 1) break;
        if (headAdjusted <= tailAdjusted) headAdjusted++;
        else tailAdjusted++;
        if (headAdjusted + tailAdjusted > name.length) {
          headAdjusted = Math.min(headAdjusted, name.length - 1);
          tailAdjusted = Math.min(tailAdjusted, Math.max(1, name.length - 1 - headAdjusted));
          break;
        }
      }
    } else {
      if (jpOnlyHead && jpOnlyTail) {
      } else if (jpOnlyHead) {
        headAdjusted = Math.max(1, headAdjusted + 2);
        tailAdjusted = Math.max(1, tailAdjusted + EN.tail - JP.tail);
      } else {
        headAdjusted = Math.max(1, headAdjusted + EN.head - JP.head - 1);
        tailAdjusted = Math.max(1, tailAdjusted);
      }
    }
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
};
var GanttSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  /**
   * 設定タブの表示処理
   * - コンテナをクリアして見出しと設定項目を追加する
   * - タイムゾーン入力の onChange で設定を更新・保存する
   */
  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Gantt Inazuma Settings" });
    new import_obsidian.Setting(containerEl).setName("Timezone").setDesc("Use 'local' for local dates, 'UTC' or an offset like '+09:00' for parsing CSV dates.").addText(
      (text) => text.setPlaceholder("local").setValue(this.plugin.settings.timezone).onChange(async (value) => {
        this.plugin.settings.timezone = value || "local";
        await this.plugin.saveSettings();
      })
    );
  }
};
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  computeTodayDateForTimezone
});
