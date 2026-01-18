const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface RawTask {
    task_id?: string;
    task_name?: string;
    plan_start?: string;
    plan_end?: string;
    actual?: string | number;
}

export function parseCsvText(csvText: string, tz: string) {
    function parseRows(text: string): string[][] {
        const rows: string[][] = [];
        let curField = '';
        let curRow: string[] = [];
        let inQuotes = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (inQuotes) {
                if (ch === '"') {
                    if (i + 1 < text.length && text[i + 1] === '"') {
                        curField += '"';
                        i++; // skip escaped quote
                    } else {
                        inQuotes = false; // end quote
                    }
                } else {
                    curField += ch;
                }
            } else {
                if (ch === '"') {
                    inQuotes = true;
                } else if (ch === ',') {
                    curRow.push(curField);
                    curField = '';
                } else if (ch === '\r') {
                    // ignore, handled by \n
                } else if (ch === '\n') {
                    curRow.push(curField);
                    rows.push(curRow);
                    curRow = [];
                    curField = '';
                } else {
                    curField += ch;
                }
            }
        }
        // finish last field/row
        if (inQuotes) {
            // unmatched quote -- treat as end of field
            // (best-effort fallback)
            inQuotes = false;
        }
        if (curField !== '' || curRow.length > 0) {
            curRow.push(curField);
            rows.push(curRow);
        }
        return rows;
    }

    const allRows = parseRows(csvText);
    if (allRows.length === 0) return [];
    const header = allRows[0].map(h => h.trim());
    const dataRows = allRows.slice(1).filter(r => r.some(c => String(c).trim().length > 0));
    const tasks: any[] = [];
    for (const colsRaw of dataRows) {
        const cols = colsRaw.map(c => String(c));
        const obj: any = {};
        for (let i = 0; i < header.length; i++) obj[header[i]] = (cols[i] || '').trim();
        // normalize keys
        const id = obj['task_id'] || obj['id'] || '';
        const name = obj['task_name'] || obj['name'] || id;
        const startStr = obj['plan_start'] || obj['start'] || '';
        const endStr = obj['plan_end'] || obj['end'] || '';
        const actualRaw = obj['actual'] ?? obj['progress'] ?? '0';
        const actual = (typeof actualRaw === 'string' && actualRaw.includes('%')) ? parseFloat(actualRaw.replace('%', '')) : parseFloat(String(actualRaw));
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
            actualRate: isNaN(actual) ? 0 : Math.max(0, Math.min(1, actual / 100)),
        });
    }
    return tasks;
}

export function parseDateWithTZ(dateString: string, tz: string): Date | null {
    if (!dateString) return null;
    // parse YYYY-MM-DD
    const m = dateString.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return new Date(dateString);
    const y = parseInt(m[1], 10);
    const mo = parseInt(m[2], 10);
    const d = parseInt(m[3], 10);

    if (!tz || tz === 'local') {
        return new Date(y, mo - 1, d);
    }
    if (tz === 'UTC') {
        return new Date(Date.UTC(y, mo - 1, d));
    }
    // offset like +09:00 or -05:00
    const off = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
    if (off) {
        const sign = off[1] === '+' ? 1 : -1;
        const hh = parseInt(off[2], 10);
        const mm = parseInt(off[3], 10);
        const offsetMinutes = sign * (hh * 60 + mm);
        // create as UTC midnight then subtract offset to get correct moment for local midnight at that offset
        const utc = Date.UTC(y, mo - 1, d);
        return new Date(utc - offsetMinutes * 60 * 1000);
    }
    return new Date(y, mo - 1, d);
}

export function getDayIndex(d: Date): number {
    // UTC時間に正規化してから日数を計算する
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
}

export function computeInazumaPoints(tasks: any[], today: Date, tz: string) {
    const TOP = 8;
    const ROW_HEIGHT = 28;
    const points: { xIndex: number; y: number; dateIndex: number }[] = [];
    const todayIndex = getDayIndex(today);
    for (let i = 0; i < tasks.length; i++) {
        const t = tasks[i];
        const startIndex = getDayIndex(t.startDate);
        const endIndex = getDayIndex(t.endDate);
        const totalDays = endIndex - startIndex + 1;
        // clamp
        let elapsed = todayIndex - startIndex + 1;
        if (todayIndex < startIndex) elapsed = 0;
        if (todayIndex > endIndex) elapsed = totalDays;
        const plannedRate = Math.max(0, Math.min(1, totalDays > 0 ? elapsed / totalDays : 1));
        const actualRate = Math.max(0, Math.min(1, t.actualRate));
        const rawX = startIndex + actualRate * totalDays;
        let x: number;
        // Special rule: if task hasn't started yet (startIndex > today) and actualRate === 0,
        // place the inazuma point on today's index (so it aligns with the today line).
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
