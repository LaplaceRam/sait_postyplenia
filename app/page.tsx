"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

const universities = [{ id: "rea", label: "РЭУ" }];

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
        const data = await fetchTrackerData();

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
