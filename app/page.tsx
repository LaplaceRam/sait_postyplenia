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

type ApplicationGroup = {
  id: string;
  agreement: boolean | null;
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

const APPLICANT_UKP = "2294268";
const REFRESH_INTERVAL_MS = 10 * 60 * 1000;
const REA_API_URL = "https://abitrating.rea.ru/rest/v1";
const REA_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzgwNjQxOTU0LCJleHAiOjIwOTYwMDE5NTR9.HK1E0UwpIPbIHK-C1HtCjoiszflge1Ul8gfD7DPicXQ";

const universities = [{ id: "rea", label: "РЭУ" }];

const requestHeaders = {
  apikey: REA_ANON_KEY,
  Authorization: `Bearer ${REA_ANON_KEY}`,
};

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

  return `Последняя проверка: ${new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(value)}`;
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

      return {
        agreement: entrant.agreement,
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
        program:
          group?.speciality_name ||
          group?.competitive_group_name ||
          "Конкурсная группа",
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
        const entrantRows = await fetchJson<EntrantRow[]>(
          `/entrants?select=competitive_group_id,rating,agreement,date_of_list,sum_mark,priority,application_status,paid_contract,unique_code_profile&unique_code_profile=eq.${APPLICANT_UKP}`,
        );

        if (entrantRows.length === 0) {
          if (isMounted) {
            setGroups([]);
          }

          return;
        }

        const ids = entrantRows
          .map((entrant) => entrant.competitive_group_id)
          .join(",");

        const groupRows = await fetchJson<GroupRow[]>(
          `/all_competitive_group_stats?select=*&competitive_group_id=in.(${ids})`,
        );

        if (isMounted) {
          setGroups(mergeApplications(entrantRows, groupRows));
        }
      } catch {
        if (isMounted) {
          setError("Не удалось загрузить данные РЭУ. Попробуй обновить страницу.");
        }
      } finally {
        if (isMounted) {
          hasLoadedRef.current = true;
          setLastCheckedAt(new Date());
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
              <p className="section-label">УКП {APPLICANT_UKP}</p>
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
                    <div>
                      <p className="group-card__faculty">{group.faculty}</p>
                      <h3>{group.program}</h3>
                    </div>
                    <span className="status-pill">{group.status}</span>
                  </div>

                  <dl className="group-metrics">
                    <div>
                      <dt>Приоритет</dt>
                      <dd>{group.priority ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Моё место в списках</dt>
                      <dd>{group.myPlace ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Количество мест</dt>
                      <dd>{group.places ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Баллы</dt>
                      <dd>{group.score ?? "—"}</dd>
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
                    <span>Обновлено: {group.updatedAt}</span>
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
