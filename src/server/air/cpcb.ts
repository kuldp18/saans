import "server-only";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { sources } from "../../catalog/sources";
import { indiaAqiBand, indiaAqiSchema, type IndiaAqi } from "../../domain/india-aqi";
import { readBoundedBytes, withDeadline } from "../http/bounded-json";

const archive = sources["CPCB-BULLETIN"].url;
const vettedArchive = new Set([archive, "https://www.cpcb.gov.in/AQI_Bulletin.php"]);
const halfHour = 30 * 60_000;
const retryMs = 2 * 60_000;
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
type Bulletin = { validAt: string; values: Partial<Record<string, IndiaAqi>> };
const cityKey = (name: string) => name.normalize("NFC").trim().toLowerCase().replace(/\s+/g, " ");

function latestBulletinDate(html: string) {
  let latest = "";
  for (const match of html.matchAll(/displaypdf\.php\?id=([A-Za-z0-9+/=]{12,96})/g)) {
    const path = Buffer.from(match[1], "base64").toString("utf8");
    const date = /^Downloads\/AQI_Bulletin_(\d{8})\.pdf$/.exec(path)?.[1];
    if (date && date > latest) latest = date;
  }
  return latest || null;
}

export function parseCpcbBulletin(text: string, date: string, bulletinUrl: string): Bulletin | null {
  const header = /^Air Quality Index on ([A-Z][a-z]{2}) (\d{1,2}), (\d{4})\s*@\s*(\d{1,2})(?::([0-5]\d))?\s*(AM|PM)\s*$/m.exec(text);
  if (!header) return null;
  const [, month, day, year, hours, minutes = "00", period] = header;
  const monthIndex = months.indexOf(month) + 1;
  const dayString = day.padStart(2, "0");
  const monthString = String(monthIndex).padStart(2, "0");
  const localDate = `${year}-${monthString}-${dayString}`;
  const hour = Number(hours);
  if (date !== `${year}${monthString}${dayString}` || !z.iso.date().safeParse(localDate).success || hour < 1 || hour > 12) return null;
  const clock = String(hour % 12 + (period === "PM" ? 12 : 0)).padStart(2, "0");
  const validAt = new Date(`${localDate}T${clock}:${minutes}:00+05:30`).toISOString();
  const values: Bulletin["values"] = Object.create(null);
  const seen = new Set<string>();

  for (const line of text.split(/\r?\n/)) {
    const row = /^\s*\d+\s+(.+?)\s+(Good|Satisfactory|Moderate|Very Poor|Poor|Severe)\s+(\d{1,3})\b/i.exec(line);
    if (!row) continue;
    const city = cityKey(row[1]);
    const value = Number(row[3]);
    if (!city || indiaAqiBand(value)?.toLowerCase() !== row[2].toLowerCase()) continue;
    if (seen.has(city)) { delete values[city]; continue; }
    seen.add(city);
    const reading = indiaAqiSchema.safeParse({ value, validAt, sourceId: "CPCB-BULLETIN", bulletinUrl });
    if (reading.success) values[city] = reading.data;
  }
  return Object.keys(values).length ? { validAt, values } : null;
}

async function pdfText(data: Uint8Array) {
  if (new TextDecoder().decode(data.subarray(0, 5)) !== "%PDF-") return "";
  const document = await getDocumentProxy(data, {
    useWorkerFetch: false, useSystemFonts: false, disableFontFace: true,
  });
  try {
    if (document.numPages > 32) return "";
    const result = await extractText(document, { mergePages: false });
    return result.text.join("\n");
  } finally {
    await document.loadingTask.destroy();
  }
}

export function createCpcbProvider({ fetcher, now, reserve, archiveUrl = archive, timeoutMs = 4_500, maxAgeHours = 48 }: {
  fetcher: typeof fetch;
  now: () => number;
  reserve: (signal: AbortSignal) => Promise<boolean>;
  archiveUrl?: string;
  timeoutMs?: number;
  maxAgeHours?: number;
}) {
  if (!vettedArchive.has(archiveUrl)) return undefined;
  let last: Bulletin | null = null;
  let nextCheck = 0;
  let pending: Promise<void> | undefined;
  const usable = (record: Bulletin) => {
    const age = now() - Date.parse(record.validAt);
    return age >= 0 && age <= maxAgeHours * 3_600_000;
  };

  async function read(url: string, limit: number, media: string, signal: AbortSignal) {
    if (!(await reserve(signal)) || signal.aborted) return null;
    const response = await fetcher(url, { signal, redirect: "error", cache: "no-store", headers: { accept: media } });
    if (!response.ok || !response.headers.get("content-type")?.toLowerCase().startsWith(media) ||
      Number(response.headers.get("content-length")) > limit) {
      void response.body?.cancel().catch(() => {});
      return null;
    }
    return readBoundedBytes(response.body, limit, signal);
  }

  async function refresh() {
    try {
      const result = await withDeadline(timeoutMs, async (signal) => {
        const html = await read(archiveUrl, 512 * 1024, "text/html", signal);
        if (!html) return null;
        const date = latestBulletinDate(new TextDecoder().decode(html));
        if (!date) return null;
        const url = `${new URL(archiveUrl).origin}/upload/Downloads/AQI_Bulletin_${date}.pdf`;
        if (last && usable(last) && Object.values(last.values)[0]?.bulletinUrl === url) return last;
        const pdf = await read(url, 1024 * 1024, "application/pdf", signal);
        return pdf ? parseCpcbBulletin(await pdfText(pdf), date, url) : null;
      });
      if (result && usable(result) && (!last || result.validAt >= last.validAt)) {
        last = result;
        nextCheck = now() + halfHour;
        return;
      }
    } catch {
      // Keep a recent bulletin available if the next retrieval fails.
    }
    nextCheck = now() + retryMs;
  }

  return async (city: string): Promise<IndiaAqi | null> => {
    if (now() >= nextCheck) {
      pending ??= refresh().finally(() => { pending = undefined; });
      await pending;
    }
    return last && usable(last) ? last.values[cityKey(city)] ?? null : null;
  };
}
