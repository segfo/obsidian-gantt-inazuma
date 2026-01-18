const fs = require('fs');
const csvPath = 'e:\\Editor\\gantt_test\\gantt_data.csv';
const csvText = fs.readFileSync(csvPath, 'utf8');

function parseRows(text) {
  const rows = [];
  let curField = '';
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
      } else if (ch === ',') {
        curRow.push(curField);
        curField = '';
      } else if (ch === '\r') {
        // ignore
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
  if (curField !== '' || curRow.length > 0) {
    curRow.push(curField);
    rows.push(curRow);
  }
  return rows;
}

function parseCsvText(csvText, tz) {
  const allRows = parseRows(csvText);
  if (allRows.length === 0) return [];
  const header = allRows[0].map(h => h.trim());
  const dataRows = allRows.slice(1).filter(r => r.some(c => String(c).trim().length > 0));
  const tasks = [];
  for (const colsRaw of dataRows) {
    const cols = colsRaw.map(c => String(c));
    const obj = {};
    for (let i = 0; i < header.length; i++) obj[header[i]] = (cols[i] || '').trim();
    const id = obj['task_id'] || obj['id'] || '';
    const name = obj['task_name'] || obj['name'] || id;
    const startStr = obj['plan_start'] || obj['start'] || '';
    const endStr = obj['plan_end'] || obj['end'] || '';
    const actualRaw = obj['actual'] ?? obj['progress'] ?? '0';
    const actual = (typeof actualRaw === 'string' && actualRaw.includes('%')) ? parseFloat(actualRaw.replace('%','')) : parseFloat(String(actualRaw));
    const startDate = startStr ? startStr : null;
    const endDate = endStr ? endStr : null;
    tasks.push({ id, name, startStr, endStr, actualRaw, actual, startDate, endDate });
  }
  return tasks;
}

const tasks = parseCsvText(csvText, 'local');
console.log(JSON.stringify(tasks, null, 2));
