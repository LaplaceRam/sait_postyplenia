import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APPLICANT_UKP = "2420603";
const OSU_BASE_URL = "http://abiturient.osu.ru";
const OSU_FORMS = [
  { id: "full-time", url: "/step5/app-process?year=2026&filial=1&level=1&otdel=1" },
  { id: "part-time", url: "/step5/app-process?year=2026&filial=1&level=1&otdel=2" },
  { id: "correspondence", url: "/step5/app-process?year=2026&filial=1&level=1&otdel=3" },
];

const requestHeaders = {
  Accept: "text/html,application/xhtml+xml",
  "User-Agent":
    "Mozilla/5.0 (compatible; sait-postyplenia-data-updater/1.0; +https://laplaceram.github.io/sait_postyplenia/)",
};

function decodeEntities(value) {
  return value
    .replaceAll("&nbsp;", " ")
    .replaceAll("&mdash;", "—")
    .replaceAll("&ndash;", "–")
    .replaceAll("&laquo;", "«")
    .replaceAll("&raquo;", "»")
    .replaceAll("&quot;", '"')
    .replaceAll("&#039;", "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) =>
      String.fromCodePoint(Number.parseInt(code, 16)),
    );
}

function htmlToText(value) {
  return decodeEntities(
    value
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<(?:br\s*\/?)>/gi, "\n")
      .replace(/<\/(?:p|div|h\d|tr|li|td|th)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\r/g, "")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{2,}/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .trim(),
  );
}

function toAbsoluteUrl(value) {
  return new URL(decodeEntities(value), OSU_BASE_URL).href;
}

async function fetchHtml(url) {
  const response = await fetch(url, { headers: requestHeaders });

  if (!response.ok) {
    throw new Error(`OSU request failed: ${response.status} ${url}`);
  }

  return new TextDecoder("koi8-r").decode(await response.arrayBuffer());
}

function extractRankListLinks(html) {
  const links = [];
  const linkPattern = /<a\b[^>]*href=["']([^"']*\/step5\/rank-list\?[^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = linkPattern.exec(html))) {
    links.push({
      label: htmlToText(match[2]),
      url: toAbsoluteUrl(match[1]),
    });
  }

  return links;
}

function extractListDetails(html) {
  const text = htmlToText(html);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const programIndex = lines.findIndex((line) => /^\d{2}\.\d{2}\.\d{2}\s/.test(line));
  const programLine = programIndex === -1 ? "" : lines[programIndex];
  const programMatch = programLine.match(/^(\d{2}\.\d{2}\.\d{2})\s+(.+)$/);
  const profileLine = lines.find((line) => line.startsWith("Профиль:"));
  const formLine = lines.find((line) => /форма обучения$/i.test(line));
  const placesMatch = text.match(
    /Бюджетных мест:\s*(\d+),\s*платных мест:\s*(\d+)/i,
  );
  const updatedMatch = text.match(/Данные по состоянию на\s*([^\n]+)/i);

  return {
    faculty: programIndex > 0 ? lines[programIndex - 1] : "ОГУ",
    form: formLine?.replace(/ форма обучения$/i, "") ?? "Не указана",
    places: placesMatch ? Number(placesMatch[2]) || Number(placesMatch[1]) : null,
    profile: profileLine?.replace(/^Профиль:\s*/i, "") ?? null,
    program: programMatch
      ? `${programMatch[2]} (${programMatch[1]})`
      : "Конкурсная группа ОГУ",
    updatedAt: updatedMatch?.[1]?.trim() ?? "нет данных",
  };
}

function extractApplicantRow(html) {
  const rowPattern = /<tr\b([^>]*)>([\s\S]*?)<\/tr>/gi;
  let rowMatch;

  while ((rowMatch = rowPattern.exec(html))) {
    if (!new RegExp(`>\\s*${APPLICANT_UKP}\\s*<`).test(rowMatch[2])) {
      continue;
    }

    const cells = [];
    const cellPattern = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch;

    while ((cellMatch = cellPattern.exec(rowMatch[2]))) {
      cells.push(htmlToText(cellMatch[1]).trim());
    }

    return {
      agreement: cells[7]?.toLowerCase() === "да",
      myPlace: /^\d+$/.test(cells[1] ?? "") ? Number(cells[1]) : null,
      priority: /^\d+$/.test(cells[3] ?? "") ? Number(cells[3]) : null,
      score: /^\d+$/.test(cells[6] ?? "") ? Number(cells[6]) : null,
      status: /class=["'][^"']*red/i.test(rowMatch[1])
        ? "Нет результатов ВИ"
        : "Участвует в конкурсе",
    };
  }

  return null;
}

async function mapWithConcurrency(values, limit, mapper) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(values[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, values.length) }, () => worker()),
  );

  return results;
}

async function writeDataFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

export async function fetchOsuData() {
  const formPages = await Promise.all(
    OSU_FORMS.map(async (form) => ({
      ...form,
      html: await fetchHtml(new URL(form.url, OSU_BASE_URL).href),
    })),
  );
  const lists = [
    ...new Map(
      formPages
        .flatMap((page) => extractRankListLinks(page.html))
        .map((list) => [list.url, list]),
    ).values(),
  ];
  const groups = (
    await mapWithConcurrency(lists, 5, async (list) => {
      const html = await fetchHtml(list.url);
      const applicant = extractApplicantRow(html);

      if (!applicant) {
        return null;
      }

      const details = extractListDetails(html);
      const kodplan = new URL(list.url).searchParams.get("kodplan") ?? list.url;

      return {
        agreement: applicant.agreement,
        campus: "osu",
        exam: null,
        faculty: details.faculty,
        form: details.form,
        funding: "Контракт",
        id: `osu-${kodplan}`,
        myPlace: applicant.myPlace,
        places: details.places,
        priority: applicant.priority,
        profile: details.profile,
        program: details.program,
        score: applicant.score,
        status: applicant.status,
        updatedAt: details.updatedAt,
      };
    })
  )
    .filter(Boolean)
    .sort((left, right) => (left.priority ?? 999) - (right.priority ?? 999));

  const data = {
    applicantUkp: APPLICANT_UKP,
    fetchedAt: new Date().toISOString(),
    source: "ОГУ",
    groups,
  };

  await Promise.all([
    writeDataFile("docs/data/osu-2420603.json", data),
    writeDataFile("public/data/osu-2420603.json", data),
  ]);

  console.log(`Saved ${data.groups.length} OSU application groups.`);

  return data;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fetchOsuData().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
