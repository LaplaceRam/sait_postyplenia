import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fetchOsuData } from "./fetch-osu-data.mjs";
import { fetchReaData } from "./fetch-rea-data.mjs";

async function writeDataFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const [rea, osu] = await Promise.all([fetchReaData(), fetchOsuData()]);
  const data = {
    applicantUkp: rea.applicantUkp,
    fetchedAt: new Date().toISOString(),
    source: "Admissions tracker",
    groups: [...rea.groups, ...osu.groups],
  };

  await Promise.all([
    writeDataFile("docs/data/tracker-2420603.json", data),
    writeDataFile("public/data/tracker-2420603.json", data),
  ]);

  console.log(`Saved ${data.groups.length} application groups in total.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
