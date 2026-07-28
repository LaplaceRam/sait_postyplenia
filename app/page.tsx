"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type EntrantRow = {
  agreement: boolean | null;
  application_status: string | null;
  competitive_group_id: string;
  date_of_list: string | null;
  paid_contract: string | null;
  priority: number | null;
  rating: number | null;
  sum_mark: number | null;
  unique_code_profile: string;
};

type GroupRow = {
  admission_volume: number | null;
  branch_name: string | null;
  competitive_group_id: string;
  competitive_group_name: string | null;
  education_form_name: string | null;
  educational_level_name: string | null;
  faculty_name: string | null;
  faculty_short_name: string | null;
  place_type_name: string | null;
  speciality_name: string | null;
  updated_at: string | null;
};

type ExamSchedule = {
  display: string;
  isConflict: boolean;
};

type ApplicationGroup = {
  id: string;
  agreement: boolean | null;
  exam: ExamSchedule | null;
  faculty: string;
  form: string;
  funding: string;
  myPlace: number | null;
  places: number | null;
  priority: number | null;
  program: string;
  score: number | null;
  status: string;
  updatedAt: string;
};

type TrackerData = {
  applicantUkp: string;
  fetchedAt: string | null;
  groups: ApplicationGroup[];
};

const APPLICANT_UKP = "2420603";
const DATA_URL = "data/rea-2420603.json";
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const REA_API_URL = "https://abitrating.rea.ru/rest/v1";
const REA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNjQxOTU0LCJleHAiOjIwOTYwMDE5NTR9.HK1E0UwpIPbIHK-C1HtCjoiszflge1Ul8gfD7DPicXQ";

const universities = [{ id: "rea", label: "РЭУ" }];

const requestHeaders = {
  apikey: REA_ANON_KEY,
};

const examSchedules: Array<{
  display: string;
  isConflict: boolean;
  matches: string[];
}> = [
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

function getExamSchedule(program: string): ExamSchedule | null {
  return (
    examSchedules.find((schedule) =>
      schedule.matches.some((match) => program.includes(match)),
    ) ?? null
  );
}

function formatDate(value: string | null) {
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

function formatCheckTime(value: Date | null) {
  if (!value) {
    return "Автообновление каждые 10 минут";
  }

  return `Данные РЭУ обновлены: ${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(value)} (на сайте)`;
}

async function fetchTrackerData(): Promise<TrackerData> {
  const response = await fetch(`${DATA_URL}?t=${Date.now()}`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Tracker data error: ${response.status}`);
  }

  return response.json() as Promise<TrackerData>;
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(`${REA_API_URL}${path}`, {
    headers: requestHeaders,
  });

  if (!response.ok) {
    throw new Error(`REA API error: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function mergeApplications(entrantRows: EntrantRow[], groupRows: GroupRow[]) {
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

      return (left.myPlace ?? Number.MAX_SAFE_INTEGER) -
        (right.myPlace ?? Number.MAX_SAFE_INTEGER);
    });
}

async function fetchLiveReaApplications(): Promise<TrackerData> {
  const entrantRows = await fetchJson<EntrantRow[]>(
    `/entrants?select=competitive_group_id,rating,agreement,date_of_list,sum_mark,priority,application_status,paid_contract,unique_code_profile&unique_code_profile=eq.${APPLICANT_UKP}`,
  );

  const ids = entrantRows
    .map((entrant) => entrant.competitive_group_id)
    .filter(Boolean)
    .join(",");

  const groupRows = ids
    ? await fetchJson<GroupRow[]>(
        `/all_competitive_group_stats?select=*&competitive_group_id=in.(${ids})`,
      )
    : [];

  return {
    applicantUkp: APPLICANT_UKP,
    fetchedAt: new Date().toISOString(),
    groups: mergeApplications(entrantRows, groupRows),
  };
}

export default function Home() {
  const [activeUniversity, setActiveUniversity] = useState("rea");
  const [groups, setGroups] = useState<ApplicationGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadReaApplications() {
      setIsLoading(!hasLoadedRef.current);
      setError(null);

      try {
        let data: TrackerData;

        try {
          data = await fetchLiveReaApplications();
        } catch {
          data = await fetchTrackerData();
        }

        if (data.applicantUkp !== APPLICANT_UKP) {
          throw new Error("Unexpected UKP in tracker data");
        }

        if (isMounted) {
          setGroups(data.groups);
          setLastCheckedAt(data.fetchedAt ? new Date(data.fetchedAt) : new Date());
        }
      } catch {
        if (isMounted) {
          setError(
            "Не удалось загрузить сохранённые данные РЭУ. Попробуй обновить страницу.",
          );
        }
      } finally {
        if (isMounted) {
          hasLoadedRef.current = true;
          setIsLoading(false);
        }
      }
    }

    loadReaApplications();
    const refreshTimer = window.setInterval(
      loadReaApplications,
      REFRESH_INTERVAL_MS,
    );

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  const visibleGroups = useMemo(() => {
    if (activeUniversity === "rea") {
      return groups;
    }

    return [];
  }, [activeUniversity, groups]);

  return (
    <main className="min-h-screen bg-[#f4f7fb] text-[#111827]">
      <header className="site-header">
        <div className="site-header__inner">
          <p className="site-header__name">Глеб.</p>
          <h1>Поступление в магистратуру 2026</h1>
          <p className="site-header__ukp">УКП {APPLICANT_UKP}</p>
        </div>
      </header>

      <section className="dashboard">
        <nav className="university-tabs" aria-label="Вузы">
          {universities.map((university) => (
            <button
              aria-pressed={activeUniversity === university.id}
              className="university-tabs__button"
              data-active={activeUniversity === university.id}
              key={university.id}
              onClick={() => setActiveUniversity(university.id)}
              type="button"
            >
              {university.label}
            </button>
          ))}
        </nav>

        <section className="groups-panel" aria-labelledby="rea-heading">
          <div className="groups-panel__top">
            <div>
              <p className="section-label">Конкурсные группы</p>
              <h2 id="rea-heading">РЭУ им. Г.В. Плеханова</h2>
            </div>
            <div className="summary-chip">
              {isLoading ? "Загрузка" : `${visibleGroups.length} заявлений`}
            </div>
          </div>

          <p className="refresh-note">{formatCheckTime(lastCheckedAt)}</p>

          {error ? <p className="state-message">{error}</p> : null}

          {isLoading ? (
            <p className="state-message">Загружаю твои конкурсные группы...</p>
          ) : null}

          {!isLoading && !error && visibleGroups.length === 0 ? (
            <p className="state-message">
              По этому УКП пока не найдено конкурсных групп.
            </p>
          ) : null}

          {!isLoading && !error && visibleGroups.length > 0 ? (
            <div className="groups-list">
              {visibleGroups.map((group) => (
                <article className="group-card" key={group.id}>
                  <div className="group-card__main">
                    <div className="group-card__title-block">
                      <p className="group-card__faculty">{group.faculty}</p>
                      <div className="group-card__heading-row">
                        <h3>{group.program}</h3>
                        <span
                          className="exam-time"
                          data-conflict={group.exam?.isConflict || undefined}
                          data-empty={group.exam ? undefined : true}
                        >
                          {group.exam?.display ?? "Дата не указана"}
                        </span>
                      </div>
                    </div>
                    <span className="status-pill">{group.status}</span>
                  </div>

                  <dl className="group-metrics">
                    <div>
                      <dt>Приоритет</dt>
                      <dd>{group.priority ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Моё место в списках</dt>
                      <dd>{group.myPlace ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Количество мест</dt>
                      <dd>{group.places ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Баллы</dt>
                      <dd>{group.score ?? "-"}</dd>
                    </div>
                    <div>
                      <dt>Согласие</dt>
                      <dd>{group.agreement ? "Да" : "Нет"}</dd>
                    </div>
                  </dl>

                  <div className="group-card__footer">
                    <span>
                      {group.funding} · {group.form}
                    </span>
                    <span>Список РЭУ обновлён: {group.updatedAt} (на сайте)</span>
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
