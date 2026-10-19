// CSV for spreadsheet downloads. Cells that start like a formula are prefixed
// with a quote so Excel and Sheets show them as text instead of running them.
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  let text = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

export function csvRow(values: CsvValue[]): string {
  return values.map(csvCell).join(",");
}

// A byte-order mark makes Excel read the file as UTF-8 (names with ñ, etc.).
export function csvDocument(lines: string[]): string {
  return `﻿${lines.join("\r\n")}`;
}
