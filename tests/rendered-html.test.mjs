import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const expectedUkp = "2420603";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the admission tracker shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Глеб \| Поступление в магистратуру 2026<\/title>/i);
  assert.match(html, /Глеб\./);
  assert.match(html, /Поступление в магистратуру 2026/);
  assert.match(html, new RegExp(`УКП\\s*(?:<!-- -->)?${expectedUkp}`));
  assert.match(html, /РЭУ Москва/);
  assert.match(html, /РЭУ Оренбург/);
  assert.match(html, /Автообновление каждые 10 минут/);
  assert.doesNotMatch(html, /2294268/);
});

test("keeps the GitHub Pages artifact on the selected UKP", async () => {
  const [page, docs] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../docs/index.html", import.meta.url), "utf8"),
  ]);

  assert.match(page, new RegExp(`const APPLICANT_UKP = "${expectedUkp}"`));
  assert.match(docs, new RegExp(`const APPLICANT_UKP = "${expectedUkp}"`));
  assert.match(docs, new RegExp(`УКП ${expectedUkp}`));
  assert.match(page, /useState\("moscow"\)/);
  assert.match(page, /campus: "moscow" \| "orenburg"/);
  assert.match(page, /РЭУ Москва/);
  assert.match(page, /РЭУ Оренбург/);
  assert.match(docs, /РЭУ Москва/);
  assert.match(docs, /РЭУ Оренбург/);
  assert.match(page, /Дата не указана/);
  assert.match(docs, /Юриспруденция, 7 августа 14:00/);
  assert.match(docs, /Торговое дело, 7 августа 14:00/);
  assert.match(docs, /Информационные системы и технологии, 13 августа 14:00/);
  assert.match(docs, /Реклама и коммуникации, 15 августа 10:00/);
  assert.match(docs, /data-conflict="true"/);
  assert.doesNotMatch(docs, /Юриспруденция \/ Торговое дело/);
  assert.doesNotMatch(docs, /Управление персоналом \/ Товароведение/);
  assert.match(page, /data\/rea-2420603\.json/);
  assert.match(docs, /data\/rea-2420603\.json/);
  assert.match(page, /abitrating\.rea\.ru/);
  assert.match(docs, /abitrating\.rea\.ru/);
  assert.match(page, /apikey: REA_ANON_KEY/);
  assert.match(docs, /apikey: REA_ANON_KEY/);
  assert.doesNotMatch(page, /Authorization/);
  assert.doesNotMatch(docs, /Authorization/);
  assert.doesNotMatch(page, /2294268/);
  assert.doesNotMatch(docs, /2294268/);
});

test("ships saved REA data for GitHub Pages", async () => {
  const docsData = JSON.parse(
    await readFile(new URL("../docs/data/rea-2420603.json", import.meta.url), "utf8"),
  );

  assert.equal(docsData.applicantUkp, expectedUkp);
  assert.equal(docsData.source, "REA");
  assert.equal(docsData.groups.length, 27);
  assert.equal(
    docsData.groups.filter((group) => group.campus === "moscow").length,
    25,
  );
  assert.equal(
    docsData.groups.filter((group) => group.campus === "orenburg").length,
    2,
  );
  const lawGroup = docsData.groups.find(
    (group) => group.program === "Юриспруденция",
  );
  assert.ok(lawGroup);
  assert.equal(
    lawGroup.exam.display,
    "Юриспруденция, 7 августа 14:00",
  );
  assert.ok(docsData.groups.every((group) => group.exam));
  assert.equal(
    docsData.groups.filter((group) => group.exam.isConflict).length,
    4,
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.campus === "orenburg" &&
        group.program === "Экономика" &&
        group.faculty === "Оренбург" &&
        group.form === "Заочная" &&
        group.places === 10 &&
        group.myPlace === 1,
    ),
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.campus === "orenburg" &&
        group.program === "Менеджмент" &&
        group.faculty === "Оренбург" &&
        group.form === "Заочная" &&
        group.places === 10 &&
        group.myPlace === 1,
    ),
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.program === "Товароведение" &&
        group.exam.display === "Товароведение, 14 августа 14:00" &&
        group.exam.isConflict,
    ),
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.program === "Торговое дело" &&
        group.exam.display === "Торговое дело, 7 августа 14:00" &&
        group.exam.isConflict,
    ),
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.program === "Управление персоналом" &&
        group.exam.display === "Управление персоналом, 14 августа 14:00" &&
        group.exam.isConflict,
    ),
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.program === "Прикладная информатика" &&
        group.exam.display ===
          "Информационные системы и технологии, 13 августа 14:00" &&
        !group.exam.isConflict,
    ),
  );
  assert.ok(
    docsData.groups.some(
      (group) =>
        group.program === "Медиакоммуникации" &&
        group.exam.display === "Реклама и коммуникации, 15 августа 10:00" &&
        !group.exam.isConflict,
    ),
  );
  assert.ok(
    docsData.groups
      .filter((group) => group.program === "Экономика")
      .every(
        (group) =>
          group.exam.display === "Экономика и управление, 10 августа 14:00" &&
          !group.exam.isConflict,
      ),
  );
  assert.ok(
    docsData.groups
      .filter((group) => group.program === "Менеджмент")
      .every(
        (group) =>
          group.exam.display === "Экономика и управление, 10 августа 14:00" &&
          !group.exam.isConflict,
      ),
  );
});
