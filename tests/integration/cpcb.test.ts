import { expect, it, vi } from "vitest";
import { createCpcbProvider, parseCpcbBulletin } from "../../src/server/air/cpcb";
import { indiaAqiBand } from "../../src/domain/india-aqi";

const url = "https://cpcb.gov.in/upload/Downloads/AQI_Bulletin_20261124.pdf";
const bulletin = [
  "Air Quality Index on Nov 24, 2026 @ 4 PM",
  "(Average of past 24 hours)",
  "1 Delhi Poor 225 PM2.5 14/16",
  "2 Greater Noida Severe 425 PM10 1/2",
  "3 Noida Satisfactory 99 PM10 2/3",
  "4 Gurugram Good 71 PM10 2/3",
].join("\n");

it("parses the official city table without substituting nearby cities or inconsistent categories", () => {
  expect(parseCpcbBulletin(bulletin, "20261124", url)).toEqual({
    validAt: "2026-11-24T10:30:00.000Z",
    values: {
      delhi: { value: 225, validAt: "2026-11-24T10:30:00.000Z", sourceId: "CPCB-BULLETIN", bulletinUrl: url },
      "greater noida": { value: 425, validAt: "2026-11-24T10:30:00.000Z", sourceId: "CPCB-BULLETIN", bulletinUrl: url },
      noida: { value: 99, validAt: "2026-11-24T10:30:00.000Z", sourceId: "CPCB-BULLETIN", bulletinUrl: url },
    },
  });
  expect(parseCpcbBulletin(bulletin, "20261125", url)).toBeNull();
  expect(parseCpcbBulletin(bulletin, "20261124", "https://example.com/other.pdf")).toBeNull();
  expect(parseCpcbBulletin(bulletin + "\n5 Noida Poor 221 PM2.5 1/2", "20261124", url)?.values.noida).toBeUndefined();
});

it("uses CPCB category boundaries rather than their US names or cutoffs", () => {
  expect([0, 50, 51, 100, 101, 200, 201, 300, 301, 400, 401, 500, 501].map(indiaAqiBand)).toEqual([
    "Good", "Good", "Satisfactory", "Satisfactory", "Moderate", "Moderate", "Poor", "Poor",
    "Very Poor", "Very Poor", "Severe", "Severe", null,
  ]);
});

it("coalesces archive reads across cities and rejects arbitrary URLs and links", async () => {
  const unsafe = Buffer.from("../not-a-bulletin.pdf").toString("base64");
  const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
    new Response(`<a href="/displaypdf.php?id=${unsafe}">Test</a>`, { headers: { "content-type": "text/html" } }));
  const options = { fetcher, now: () => Date.parse("2026-11-25T00:00:00Z"), reserve: async () => true };
  expect(createCpcbProvider({ ...options, archiveUrl: "https://example.com/AQI_Bulletin.php" })).toBeUndefined();
  const load = createCpcbProvider(options)!;
  expect(await Promise.all([load("delhi"), load("noida")])).toEqual([null, null]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
