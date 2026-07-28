import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const APPLICANT_UKP = "2420603";
const REA_API_URL = "https://abitrating.rea.ru/rest/v1";
const REA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNjQxOTU0LCJleHAiOjIwOTYwMDE5NTR9.HK1E0UwpIPbIHK-C1HtCjoiszflge1Ul8gfD7DPicXQ";

const requestHeaders = {
  Accept: "application/json",
  apikey: REA_ANON_KEY,
  Authorization: `Bearer ${REA_ANON_KEY}`,
  "User-Agent":
    "Mozilla/5.0 (compatible; sait-postyplenia-data-updater/1.0; +https://laplaceram.github.io/sait_postyplenia/)",
};

const examSchedules = [
  {
    display: "7 августа, пятница 10:00",
    isConflict: false,
    matches: ["Бизнес-информатика"],
  },
  {
    display: "7 августа, пятница 14:00",
    isConflict: true,
    matches: ["Торговое дело", "Юриспруденция"],
  },
  {
    display: "8 августа, суббота 10:00",
    isConflict: false,
    matches: ["Государственное и муниципальное управление"],
  },
  {
    display: "10 августа, понедельник 14:00",
    isConflict: false,
    matches: ["Экономика", "Менеджмент", "Финансы и кредит"],
  },
  {
    display: "13 августа, четверг 14:00",
    isConflict: false,
    matches: ["Информационные системы и технологии"],
  },
  {
    display: "14 августа, пятница 14:00",
    isConflict: true,
    matches: ["Товароведение", "Управление персоналом"],
  },
  {
    display: "15 августа, суббота 10:00",
    isConflict: false,
    matches: ["Реклама и связи с общественностью"],
  },
];

function getExamSchedule(program) {
  return (
    examSchedules.find((schedule) =>
      schedule.matches.some((match) => program.includes(match)),
    ) ?? null
  );
}

function formatDate(value) {
  if (!value) {
    return "нет данных";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "нет данных";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Europe/Moscow",
    year: "numeric",
  }).format(date);
}

async function fetchJson(pathname) {
  const response = await fetch(`${REA_API_URL}${pathname}`, {
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error(`REA API error: ${response.status}`);
  }

  const text = await response.text();
  const contentType = response.headers.get("content-type") || "unknown";

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `REA API returned non-JSON response: ${response.status} ${contentType} ${text.slice(0, 120)}`,
    );
  }
}

function mergeApplications(entrantRows, groupRows) {
  const groupsById = new Map(
    groupRows.map((group) => [group.competitive_group_id, group]),
  );

  return entrantRows
    .map((entrant) => {
      const group = groupsById.get(entrant.competitive_group_id);
      const program =
        group?.speciality_name ||
        group?.competitive_group_name ||
        "Конкурсная группа";

      return {
        agreement: entrant.agreement,
        exam: getExamSchedule(program),
        faculty:
          group?.faculty_short_name ||
          group?.faculty_name ||
          "Факультет не указан",
        form: group?.education_form_name || "форма не указана",
        funding: group?.place_type_name || "тип места не указан",
        id: entrant.competitive_group_id,
        myPlace: entrant.rating,
        places: group?.admission_volume ?? null,
        priority: entrant.priority,
        program,
        score: entrant.sum_mark,
        status: entrant.application_status || "Статус не указан",
        updatedAt: formatDate(entrant.date_of_list || group?.updated_at || null),
      };
    })
    .sort((left, right) => {
      const leftPriority = left.priority ?? Number.MAX_SAFE_INTEGER;
      const rightPriority = right.priority ?? Number.MAX_SAFE_INTEGER;

      if (leftPriority !== rightPriority) {
        return leftPriority - rightPriority;
      }

      return (
        (left.myPlace ?? Number.MAX_SAFE_INTEGER) -
        (right.myPlace ?? Number.MAX_SAFE_INTEGER)
      );
    });
}

async function writeDataFile(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function main() {
  const entrantRows = await fetchJson(
    `/entrants?select=competitive_group_id,rating,agreement,date_of_list,sum_mark,priority,application_status,paid_contract,unique_code_profile&unique_code_profile=eq.${APPLICANT_UKP}`,
  );

  const uniqueIds = [
    ...new Set(
      entrantRows
        .map((entrant) => entrant.competitive_group_id)
        .filter(Boolean),
    ),
  ];

  const groupRows =
    uniqueIds.length > 0
      ? await fetchJson(
          `/all_competitive_group_stats?select=*&competitive_group_id=in.(${uniqueIds.join(",")})`,
        )
      : [];

  const data = {
    applicantUkp: APPLICANT_UKP,
    fetchedAt: new Date().toISOString(),
    source: "REA",
    groups: mergeApplications(entrantRows, groupRows),
  };

  await Promise.all([
    writeDataFile("docs/data/rea-2420603.json", data),
    writeDataFile("public/data/rea-2420603.json", data),
  ]);

  console.log(`Saved ${data.groups.length} REA application groups.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
