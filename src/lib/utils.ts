import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { format, parseISO } from 'date-fns';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string | undefined | null, fmt = 'dd MMM yyyy'): string {
  if (!dateStr) return 'â€”';
  try {
    return format(parseISO(dateStr), fmt);
  } catch {
    return dateStr;
  }
}

export function formatDateTime(dateStr: string | undefined | null): string {
  return formatDate(dateStr, 'dd MMM yyyy, HH:mm');
}

export function truncate(str: string, maxLen = 40): string {
  return str.length > maxLen ? str.slice(0, maxLen) + 'â€¦' : str;
}

export function generateAcademicYears(count = 6): string[] {
  const current = new Date().getFullYear();
  const years: string[] = [];
  for (let i = 0; i < count; i++) {
    const y = current - i;
    years.push(`${y}-${(y + 1).toString().slice(2)}`);
  }
  return years;
}

export function parseAcademicYear(ay: string): { start: number; end: number } | null {
  const match = ay.match(/^(\d{4})-(\d{2,4})$/);
  if (!match) return null;
  const start = parseInt(match[1]);
  const endPart = match[2];
  const end = endPart.length === 2 ? start + 1 : parseInt(endPart);
  return { start, end };
}

export function maskApaarId(id: string): string {
  if (!id || id.length < 6) return '***';
  return id.slice(0, 4) + '****' + id.slice(-4);
}

export function downloadCSV(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function objectsToCSV(data: Record<string, unknown>[]): string {
  if (!data.length) return '';
  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(h => {
      const v = row[h];
      const s = v == null ? '' : String(v);
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')
  );
  return [headers.join(','), ...rows].join('\n');
}

export function validateApaarFormat(apaarId: string): boolean {
  // APAAR ID is a 12-digit number (Automated Permanent Academic Account Registry)
  return /^\d{12}$/.test(apaarId);
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
