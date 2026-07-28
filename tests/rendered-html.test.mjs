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
  assert.match(html, /РЭУ им\. Г\.В\. Плеханова/);
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
  assert.match(page, /7 августа, пятница 14:00/);
  assert.match(page, /14 августа, пятница 14:00/);
  assert.match(page, /Дата не указана/);
  assert.match(docs, /7 августа, пятница 14:00/);
  assert.match(docs, /14 августа, пятница 14:00/);
  assert.match(docs, /data-conflict="true"/);
  assert.doesNotMatch(page, /2294268/);
  assert.doesNotMatch(docs, /2294268/);
});
