import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HomeScreen, AlpacaIcon, CheckIcon, HistoryIcon, SleepIcon, CoachIcon, SettingsIcon, TrailDivider, BackIcon } from "../features/home/HomeScreen";

import { SplashScreen } from "../features/home/SplashScreen";
import { RecordingScreen } from "../features/recording/RecordingScreen";
import { backfillComments, backfillOuraHistory, commentActivity, deleteActivity, fetchActivity, fetchBootstrap, importLegacySettings, importStrava, logout, refreshOura, repairLibrary, saveActivity, stravaConnectUrl } from "../lib/api/client";
import { scanHeartRateDevices, testHeartRateDevice } from "../lib/native/coros";
import { getHealthAuthorizationStatus, getHealthAvailability, readHealthFallback, requestHealthAuthorization, retryPendingHealthkitExports, writeWorkoutToHealthKit } from "../lib/native/healthkit";
import { loadPendingWrites, savePendingWrites } from "../lib/storage/pendingWrites";
import { clearSession, loadSession, saveSession } from "../lib/storage/session";
import { loadSettings, saveSettings } from "../lib/storage/settings";
import { todayKey } from "../lib/time";
import { sanitizeActivity } from "../lib/utils/sanitize";
import type { ActivitySummary, AppView, BodySnapshot, LocalSettings, PendingWrite, SessionState, SportType } from "../types";
import { useRecordingMachine } from "../features/recording/useRecordingMachine";
import { successHaptic } from "../lib/native/haptics";
import { useAppStore } from "./store";

type IntegrationState = "idle" | "syncing" | "error";

function isOlderThan(value: string | null, hours: number): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > hours * 60 * 60 * 1000;
}

const CURRENT_COACH_PROMPT_VERSION = "alpaca-coach-v4";
const OPEN_SESSION: SessionState = {
  token: "alpaca-open",
  expiresAt: "2099-01-01T00:00:00.000Z",
};
const ActivityDetailSheet = lazy(() => import("../features/activity-detail/ActivityDetailSheet").then((mod) => ({ default: mod.ActivityDetailSheet })));
const HistoryScreen = lazy(() => import("../features/history/HistoryScreen").then((mod) => ({ default: mod.HistoryScreen })));
const RecordingMapSheet = lazy(() => import("../features/recording/RecordingMapSheet").then((mod) => ({ default: mod.RecordingMapSheet })));
const SettingsScreen = lazy(() => import("../features/settings/SettingsScreen").then((mod) => ({ default: mod.SettingsScreen })));
const SleepScreen = lazy(() => import("../features/sleep/SleepScreen").then((mod) => ({ default: mod.SleepScreen })));

function LazyScreenFallback() {
  return (
    <div className="flex min-h-[28rem] items-center justify-center">
      <AlpacaIcon size={32} color="rgba(90,230,222,0.2)" />
    </div>
  );
}

export function App() {
  const queryClient = useQueryClient();
  const {
    view,
    detailId,
    mapSheetOpen,
    session,
    settings,
    setView,
    openDetail,
    closeDetail,
    setMapSheetOpen,
    setSession,
    setSettings,
  } = useAppStore();
  const [hydrated, setHydrated] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [pendingWrites, setPendingWrites] = useState<PendingWrite[]>([]);
  const [pendingSyncNonce, setPendingSyncNonce] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [todayBody, setTodayBody] = useState<BodySnapshot | null>(null);
  const [healthAvailable, setHealthAvailable] = useState(false);
  const [settingsReturnView, setSettingsReturnView] = useState<Exclude<AppView, "settings">>("home");
  const [integrationState, setIntegrationState] = useState<{ strava: IntegrationState; oura: IntegrationState }>({ strava: "idle", oura: "idle" });
  const [pendingSport, setPendingSport] = useState<SportType | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const healthRetryRanRef = useRef(false);
  const healthStatusSyncRef = useRef(false);
  const healthAuthPromptedRef = useRef(false);
  const stravaSyncRef = useRef(false);
  const ouraSyncRef = useRef(false);
  const ouraHistorySyncRef = useRef(false);
  const stravaAutoKeyRef = useRef("");
  const ouraAutoKeyRef = useRef("");
  const ouraHistoryAutoKeyRef = useRef("");
  const coachBackfillRef = useRef(false);
  const coachSweepStartedRef = useRef(false);
  const commentPrefetchRef = useRef(new Set<string>());
  const pendingWritesRef = useRef<PendingWrite[]>([]);
  const legacyImportRef = useRef(false);
  const effectiveMapboxToken = settings.mapboxToken || import.meta.env.VITE_MAPBOX_TOKEN || "";

  useEffect(() => {
    pendingWritesRef.current = pendingWrites;
  }, [pendingWrites]);

  async function persistSettingsPatch(partial: Partial<LocalSettings>) {
    const nextSettings = { ...useAppStore.getState().settings, ...partial };
    setSettings(nextSettings);
    await saveSettings(nextSettings);
    return nextSettings;
  }

  async function commitPendingWrites(updater: (current: PendingWrite[]) => PendingWrite[]) {
    const next = updater(pendingWritesRef.current);
    pendingWritesRef.current = next;
    setPendingWrites(next);
    await savePendingWrites(next);
    return next;
  }

  async function syncHealthStatus() {
    const status = await getHealthAuthorizationStatus();
    await persistSettingsPatch({
      healthkitEnabled: status.available,
      healthkitReadAuthorized: status.readAuthorized,
      healthkitWriteAuthorized: status.writeAuthorized,
      lastHealthkitError: status.available
        ? status.writeAuthorized
          ? null
          : "Apple Health permission not granted."
        : "Apple Health is unavailable on this device.",
    });
    return status;
  }

  async function connectHealth() {
    const status = await requestHealthAuthorization();
    await persistSettingsPatch({
      healthkitEnabled: status.available,
      healthkitReadAuthorized: status.readAuthorized,
      healthkitWriteAuthorized: status.writeAuthorized,
      lastHealthkitError: status.writeAuthorized ? null : "Apple Health permission not granted.",
    });

    if (status.writeAuthorized) {
      const retry = await retryPendingHealthkitExports();
      if (retry.processed > 0) {
        await persistSettingsPatch({
          lastHealthkitExportAt: new Date().toISOString(),
          lastHealthkitError: null,
        });
      }
    }

    return status;
  }

  useEffect(() => {
    void (async () => {
      const [storedSettings, storedSession, storedPending, available] = await Promise.all([
        loadSettings(),
        loadSession(),
        loadPendingWrites(),
        getHealthAvailability(),
      ]);
      setSettings(storedSettings);
      setSession(storedSession ?? OPEN_SESSION);
      setPendingWrites(storedPending);
      setHealthAvailable(available);
      if (!storedSession) {
        await saveSession(OPEN_SESSION);
      }
      setHydrated(true);
    })();
  }, [setSession, setSettings]);

  useEffect(() => {
    if (!hydrated || session) return;
    setSession(OPEN_SESSION);
    void saveSession(OPEN_SESSION);
  }, [hydrated, session, setSession]);

  // Handle Strava OAuth callback -- read tokens from URL fragment after redirect.
  useEffect(() => {
    if (!hydrated) return;
    const hash = window.location.hash;
    if (!hash.includes("strava_connected=1")) return;
    const params = new URLSearchParams(hash.slice(1));
    const refreshToken = params.get("strava_refresh_token");
    if (!refreshToken) return;

    // Clear the fragment so we don't re-process on next render.
    window.history.replaceState(null, "", window.location.pathname);

    void (async () => {
      await persistSettingsPatch({ stravaRefreshToken: refreshToken });
      // Trigger import with the new token (clientId/secret come from server env).
      stravaSyncRef.current = false;
      void syncStravaHistory();
    })();
  }, [hydrated]);

  const bootstrapQuery = useQuery({
    queryKey: ["bootstrap", session?.token],
    queryFn: fetchBootstrap,
    enabled: hydrated && Boolean(session),
  });

  useEffect(() => {
    if (bootstrapQuery.data?.todayBody) {
      setTodayBody(bootstrapQuery.data.todayBody);
    }
  }, [bootstrapQuery.data?.todayBody]);

  useEffect(() => {
    if (!hydrated || !session || legacyImportRef.current) return;
    const missingLegacySettings = !settings.mapboxToken || !settings.ouraToken || !settings.stravaClientId || !settings.stravaClientSecret || !settings.stravaRefreshToken;
    if (!missingLegacySettings) return;
    legacyImportRef.current = true;

    void (async () => {
      const imported = await importLegacySettings();
      if (!imported) return;
      const patch: Partial<LocalSettings> = {};
      if (!settings.mapboxToken && imported.mapboxToken) patch.mapboxToken = imported.mapboxToken;
      if (!settings.ouraToken && imported.ouraToken) patch.ouraToken = imported.ouraToken;
      if (!settings.stravaClientId && imported.stravaClientId) patch.stravaClientId = imported.stravaClientId;
      if (!settings.stravaClientSecret && imported.stravaClientSecret) patch.stravaClientSecret = imported.stravaClientSecret;
      if (!settings.stravaRefreshToken && imported.stravaRefreshToken) patch.stravaRefreshToken = imported.stravaRefreshToken;
      if (!settings.hrDeviceId && imported.hrDeviceId) patch.hrDeviceId = imported.hrDeviceId;
      if (!settings.hrDeviceName && imported.hrDeviceName) patch.hrDeviceName = imported.hrDeviceName;
      if (Object.keys(patch).length > 0) {
        await persistSettingsPatch(patch);
      }
    })();
  }, [hydrated, session, settings]);

  const queueWrite = async (write: PendingWrite) => {
    await commitPendingWrites((current) => [write, ...current.filter((item) => item.id !== write.id)]);
    setPendingSyncNonce((value) => value + 1);
    successHaptic();
    setSavedFlash(true);
    setView("home");
  };

  const recording = useRecordingMachine({
    pairedDeviceId: settings.hrDeviceId || undefined,
    bodySnapshot: todayBody,
    onQueuedWrite: queueWrite,
  });

  async function syncStravaHistory() {
    if (!settings.stravaRefreshToken || stravaSyncRef.current) return;
    stravaSyncRef.current = true;
    setIntegrationState((current) => ({ ...current, strava: "syncing" }));
    try {
      await importStrava({
        clientId: settings.stravaClientId || undefined,
        clientSecret: settings.stravaClientSecret || undefined,
        refreshToken: settings.stravaRefreshToken,
      });
      await persistSettingsPatch({
        lastStravaImportAt: new Date().toISOString(),
        lastStravaImportError: null,
      });
      await bootstrapQuery.refetch();
      setIntegrationState((current) => ({ ...current, strava: "idle" }));
    } catch (error) {
      await persistSettingsPatch({
        lastStravaImportError: error instanceof Error ? error.message : "Strava history sync failed.",
      });
      setIntegrationState((current) => ({ ...current, strava: "error" }));
    } finally {
      stravaSyncRef.current = false;
    }
  }

  async function refreshBody() {
    if (!settings.ouraToken) {
      if (!healthAvailable) return;
      const today = todayKey();
      const fallback = await readHealthFallback(`${today}T00:00:00`, `${today}T23:59:59`);
      setTodayBody({
        day: today,
        sleep_score: null,
        readiness_score: null,
        hrv: fallback.hrv,
        rhr: fallback.rhr,
        total_sleep: null,
        source_day: today,
        fetched_at: new Date().toISOString(),
        status: fallback.hrv || fallback.rhr ? "ready" : "missing_data",
      });
      return;
    }
    if (ouraSyncRef.current) return;
    ouraSyncRef.current = true;
    setIntegrationState((current) => ({ ...current, oura: "syncing" }));
    try {
      const body = await refreshOura(settings.ouraToken, todayKey(), Intl.DateTimeFormat().resolvedOptions().timeZone);
      setTodayBody(body);
      await persistSettingsPatch({
        lastOuraSyncAt: new Date().toISOString(),
        lastOuraSyncDay: body.day,
        lastOuraSyncError: null,
      });
      void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
      setIntegrationState((current) => ({ ...current, oura: "idle" }));
    } catch (error) {
      await persistSettingsPatch({
        lastOuraSyncError: error instanceof Error ? error.message : "Oura refresh failed.",
      });
      setIntegrationState((current) => ({ ...current, oura: "error" }));
    } finally {
      ouraSyncRef.current = false;
    }
  }

  useEffect(() => {
    if (!session || pendingWrites.length === 0) return;
    let cancelled = false;

    void (async () => {
      for (const pending of pendingWrites) {
        if (cancelled) return;
        try {
          await saveActivity(pending);
          if (settings.healthkitEnabled && healthAvailable) {
            try {
              const hadRoute = pending.detail.points.length > 1;
              const exportResult = await writeWorkoutToHealthKit({
                type: pending.summary.type,
                startDate: pending.summary.start_date_local,
                endDate: new Date(new Date(pending.summary.start_date_local).getTime() + pending.summary.elapsed_time * 1000).toISOString(),
                distance: pending.summary.distance,
                calories: pending.summary.calories,
                averageHeartRate: pending.summary.average_heartrate,
                maxHeartRate: pending.summary.max_heartrate,
                route: pending.detail.points,
              });
              await persistSettingsPatch(
                exportResult.queued
                  ? { lastHealthkitError: "Apple Health export queued for retry." }
                  : {
                      lastHealthkitExportAt: exportResult.exportedAt,
                      lastHealthkitError: hadRoute && !exportResult.routeStored ? "Workout saved to Apple Health, but route export was not stored." : null,
                    },
              );
            } catch (healthError) {
              await persistSettingsPatch({
                lastHealthkitError: healthError instanceof Error ? healthError.message : "HealthKit export failed.",
              });
            }
          }
          void commentActivity(pending.id, false, settings.ouraToken || undefined).catch(() => undefined);
          if (!cancelled) {
            await commitPendingWrites((current) => current.filter((item) => item.id !== pending.id));
            void queryClient.invalidateQueries({ queryKey: ["bootstrap"] });
          }
        } catch {
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [healthAvailable, pendingSyncNonce, pendingWrites, queryClient, session, settings.healthkitEnabled]);

  useEffect(() => {
    if (!session || pendingWrites.length === 0) return;
    const bump = () => setPendingSyncNonce((value) => value + 1);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    const interval = window.setInterval(bump, 30000);
    window.addEventListener("online", bump);
    window.addEventListener("focus", bump);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", bump);
      window.removeEventListener("focus", bump);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [pendingWrites.length, session]);

  useEffect(() => {
    if (!session || !hydrated) return;
    if (settings.ouraToken) {
      const needsOuraRefresh =
        !todayBody ||
        todayBody.day !== todayKey() ||
        todayBody.status !== "ready" ||
        settings.lastOuraSyncDay !== todayKey() ||
        isOlderThan(settings.lastOuraSyncAt, 6);
      if (needsOuraRefresh) {
        const autoKey = `${settings.ouraToken}:${todayKey()}`;
        if (ouraAutoKeyRef.current === autoKey) return;
        ouraAutoKeyRef.current = autoKey;
        void refreshBody();
      }
      return;
    }

    if (!todayBody && healthAvailable) {
      void refreshBody();
    }
  }, [healthAvailable, hydrated, session, settings.lastOuraSyncAt, settings.lastOuraSyncDay, settings.ouraToken, todayBody]);

  const allActivities = useMemo(() => {
    const remoteActivities = Object.values(bootstrapQuery.data?.activities ?? {}).map(sanitizeActivity);
    const merged = new Map<string, ActivitySummary>();
    remoteActivities.forEach((activity) => merged.set(activity.id, activity));
    pendingWrites.forEach((pending) => merged.set(pending.id, pending.summary));
    return Array.from(merged.values()).sort((left, right) => new Date(right.start_date_local).getTime() - new Date(left.start_date_local).getTime());
  }, [bootstrapQuery.data?.activities, pendingWrites]);
  const remainingCoachCount = useMemo(
    () =>
      allActivities.filter(
        (activity) => activity.comment_status !== "ready" || activity.comment_prompt_version !== CURRENT_COACH_PROMPT_VERSION,
      ).length,
    [allActivities],
  );

  useEffect(() => {
    if (!session || !hydrated) return;
    const hasStravaCredentials = Boolean(settings.stravaRefreshToken);
    if (!hasStravaCredentials) return;
    const hasImportedHistory = allActivities.some((activity) => activity.source === "strava");
    const shouldSync = !hasImportedHistory && !settings.lastStravaImportAt;
    if (shouldSync) {
      const autoKey = `${settings.stravaClientId || "oauth"}:${settings.stravaRefreshToken}`;
      if (stravaAutoKeyRef.current === autoKey) return;
      stravaAutoKeyRef.current = autoKey;
      void syncStravaHistory();
    }
  }, [allActivities, hydrated, session, settings.lastStravaImportAt, settings.stravaClientId, settings.stravaClientSecret, settings.stravaRefreshToken]);

  useEffect(() => {
    if (!hydrated || !healthAvailable || !settings.healthkitEnabled || healthRetryRanRef.current) return;
    healthRetryRanRef.current = true;
    void retryPendingHealthkitExports()
      .then(async ({ processed }) => {
        if (!processed) return;
        await persistSettingsPatch({
          lastHealthkitExportAt: new Date().toISOString(),
          lastHealthkitError: null,
        });
      })
      .catch(async (error) => {
        await persistSettingsPatch({
          lastHealthkitError: error instanceof Error ? error.message : "Unable to retry Apple Health exports.",
        });
      });
  }, [healthAvailable, hydrated, settings.healthkitEnabled]);

  useEffect(() => {
    if (!hydrated || showSplash || !healthAvailable || healthStatusSyncRef.current) return;
    healthStatusSyncRef.current = true;

    void syncHealthStatus().catch(async (error) => {
      await persistSettingsPatch({
        lastHealthkitError: error instanceof Error ? error.message : "Unable to read Apple Health authorization.",
      });
      healthStatusSyncRef.current = false;
    });
  }, [healthAvailable, hydrated, showSplash]);

  useEffect(() => {
    if (!hydrated || showSplash || !healthAvailable || !settings.healthkitEnabled || healthAuthPromptedRef.current) return;
    if (settings.healthkitReadAuthorized || settings.healthkitWriteAuthorized) return;
    healthAuthPromptedRef.current = true;
    const timer = window.setTimeout(() => {
      void connectHealth().catch(async (error) => {
        await persistSettingsPatch({
          lastHealthkitError: error instanceof Error ? error.message : "Apple Health authorization failed.",
        });
      });
    }, 600);

    return () => window.clearTimeout(timer);
  }, [healthAvailable, hydrated, settings.healthkitEnabled, settings.healthkitReadAuthorized, settings.healthkitWriteAuthorized, showSplash]);

  useEffect(() => {
    if (!hydrated || !healthAvailable || !settings.healthkitEnabled) return;

    const retryExports = () => {
      void retryPendingHealthkitExports()
        .then(async ({ processed }) => {
          if (!processed) return;
          await persistSettingsPatch({
            lastHealthkitExportAt: new Date().toISOString(),
            lastHealthkitError: null,
          });
        })
        .catch(async (error) => {
          await persistSettingsPatch({
            lastHealthkitError: error instanceof Error ? error.message : "Unable to retry Apple Health exports.",
          });
        });
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") retryExports();
    };

    window.addEventListener("focus", retryExports);
    window.addEventListener("online", retryExports);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", retryExports);
      window.removeEventListener("online", retryExports);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [healthAvailable, hydrated, settings.healthkitEnabled]);

  const detailSummary = useMemo(() => allActivities.find((activity) => activity.id === detailId) ?? null, [allActivities, detailId]);
  const quickStartSport = useMemo(
    () => allActivities.find((activity) => activity.type === "Run" || activity.type === "Ride" || activity.type === "Walk" || activity.type === "Hike")?.type ?? "Run",
    [allActivities],
  );

  const detailQuery = useQuery({
    queryKey: ["activity", detailId],
    queryFn: () => (detailId ? fetchActivity(detailId, settings.ouraToken || undefined) : Promise.resolve(null)),
    enabled: Boolean(detailId),
  });

  async function refreshEverything() {
    setRefreshing(true);
    try {
      setPendingSyncNonce((value) => value + 1);
      await Promise.all([
        bootstrapQuery.refetch(),
        refreshBody(),
        settings.stravaRefreshToken ? syncStravaHistory() : Promise.resolve(),
      ]);
      await bootstrapQuery.refetch();
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshOuraWithHistory() {
    await refreshBody();
    if (!settings.ouraToken) return;
    const missingDays = Array.from(
      new Set(
        allActivities
          .filter((activity) => activity.body_snapshot_status !== "ready")
          .map((activity) => activity.start_date_local.slice(0, 10))
          .filter(Boolean),
      ),
    ).sort((left, right) => right.localeCompare(left));
    if (!missingDays.length) return;
    await backfillOuraHistory(settings.ouraToken, missingDays, Intl.DateTimeFormat().resolvedOptions().timeZone);
    await bootstrapQuery.refetch();
  }

  function openSettings(returnView: Exclude<AppView, "settings">) {
    setSettingsReturnView(returnView);
    setView("settings");
  }

  const commentTarget = useMemo(() => {
    const detailNeedsRefresh =
      detailSummary?.comment_prompt_version !== CURRENT_COACH_PROMPT_VERSION ||
      (detailQuery.data?.coachComment?.prompt_version && detailQuery.data.coachComment.prompt_version !== CURRENT_COACH_PROMPT_VERSION);
    if (detailSummary && (detailSummary.comment_status !== "ready" || detailNeedsRefresh)) {
      return detailSummary;
    }
    return null;
  }, [allActivities, detailQuery.data?.coachComment?.prompt_version, detailSummary, view]);

  useEffect(() => {
    if (!session || !commentTarget) return;
    if (commentPrefetchRef.current.has(commentTarget.id)) return;
    commentPrefetchRef.current.add(commentTarget.id);
    let cancelled = false;

    void (async () => {
      try {
        const forceRefresh = detailSummary?.id === commentTarget.id && detailQuery.data?.coachComment?.prompt_version !== CURRENT_COACH_PROMPT_VERSION;
        await commentActivity(commentTarget.id, forceRefresh, settings.ouraToken || undefined);
        if (cancelled) return;
        await bootstrapQuery.refetch();
        if (detailSummary?.id === commentTarget.id) {
          await detailQuery.refetch();
        }
      } catch {
        return;
      } finally {
        commentPrefetchRef.current.delete(commentTarget.id);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapQuery, commentTarget, detailQuery, detailQuery.data?.coachComment?.prompt_version, detailSummary?.id, session, settings.ouraToken]);

  useEffect(() => {
    if (!session || !hydrated || !settings.ouraToken || ouraHistorySyncRef.current) return;
    const missingDays = Array.from(
      new Set(
        allActivities
          .filter((activity) => activity.body_snapshot_status !== "ready")
          .map((activity) => activity.start_date_local.slice(0, 10))
          .filter(Boolean),
      ),
    ).sort((left, right) => right.localeCompare(left));
    if (!missingDays.length) return;

    const autoKey = `${settings.ouraToken}:${missingDays[0]}:${missingDays.length}`;
    if (ouraHistoryAutoKeyRef.current === autoKey) return;
    ouraHistoryAutoKeyRef.current = autoKey;
    ouraHistorySyncRef.current = true;

    void (async () => {
      try {
        const result = await backfillOuraHistory(settings.ouraToken, missingDays, Intl.DateTimeFormat().resolvedOptions().timeZone);
        if (result.processedDays > 0 || result.updatedActivities > 0) {
          await bootstrapQuery.refetch();
        }
      } catch {
        ouraHistoryAutoKeyRef.current = "";
      } finally {
        ouraHistorySyncRef.current = false;
      }
    })();
  }, [allActivities, bootstrapQuery, hydrated, session, settings.ouraToken]);

  useEffect(() => {
    if (!session || coachBackfillRef.current || recording.draft) return;
    if (remainingCoachCount === 0 && coachSweepStartedRef.current) return;
    coachBackfillRef.current = true;
    coachSweepStartedRef.current = true;
    let cancelled = false;

    void (async () => {
      try {
        let nextRemaining = Math.max(remainingCoachCount, 1);
        let stalledPasses = 0;

        while (!cancelled && nextRemaining > 0) {
          const batchSize = Math.min(12, nextRemaining);
          const result = await backfillComments(batchSize);
          nextRemaining = result.remaining;
          await bootstrapQuery.refetch();

          if (detailSummary) {
            await detailQuery.refetch();
          }

          const progress = result.processed + result.reused;
          stalledPasses = progress === 0 ? stalledPasses + 1 : 0;
          if (stalledPasses >= 2) break;
          if (nextRemaining > 0) {
            await new Promise((resolve) => window.setTimeout(resolve, 250));
          }
        }
      } finally {
        coachBackfillRef.current = false;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [bootstrapQuery, detailQuery, detailSummary, recording.draft, remainingCoachCount, session]);

  const handleSplashDone = useCallback(() => setShowSplash(false), []);

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(false), 1800);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  if (!hydrated) {
    return (
      <div className="andes-shell flex items-center justify-center">
        <div className="andes-breathe"><AlpacaIcon size={48} color="rgba(90,230,222,0.3)" /></div>
      </div>
    );
  }

  if (showSplash) {
    return <SplashScreen onDone={handleSplashDone} />;
  }

  if (!session) {
    return (
      <div className="andes-shell flex items-center justify-center">
        <div className="andes-breathe"><AlpacaIcon size={48} color="rgba(90,230,222,0.3)" /></div>
      </div>
    );
  }

  return (
    <>
    <div className="andes-shell">

      {!recording.draft && !pendingSport ? (
        <>
          {view === "home" ? (
            <HomeScreen
              onRecord={() => setPendingSport(quickStartSport)}
              onOpenRecords={() => setView("records")}
              onOpenSleep={() => setView("sleep")}
            />
          ) : null}

          {view !== "home" ? (
            <div className="relative z-[1] mx-auto max-w-[28rem] px-5 pb-6">
              {view === "records" ? (
              <div>
                <div className="mb-4">
                  <HistoryIcon size={32} />
                </div>
                <div className="mb-4 px-0"><TrailDivider variant="strata" /></div>
                <Suspense fallback={<LazyScreenFallback />}>
                  <HistoryScreen
                    activities={allActivities}
                    body={todayBody}
                    currentPromptVersion={CURRENT_COACH_PROMPT_VERSION}
                    refreshing={refreshing || bootstrapQuery.isFetching}
                    onRefresh={refreshEverything}
                    onOpenDetail={openDetail}
                    onOpenSettings={() => openSettings("records")}
                  />
                </Suspense>
              </div>
              ) : null}

              {view === "sleep" ? (
              <div>
                <div className="mb-4">
                  <SleepIcon size={32} />
                </div>
                <div className="mb-4 px-0"><TrailDivider variant="wave" /></div>
                <Suspense fallback={<LazyScreenFallback />}>
                  <SleepScreen
                    body={todayBody}
                    activities={allActivities}
                    refreshing={refreshing || bootstrapQuery.isFetching}
                    syncing={integrationState.oura === "syncing"}
                    onRefresh={refreshEverything}
                    onOpenSettings={() => openSettings("sleep")}
                  />
                </Suspense>
              </div>
              ) : null}


              {view === "settings" ? (
              <div>
                <div className="mb-4">
                  <SettingsIcon size={24} />
                </div>
                <div className="mb-4 px-0"><TrailDivider variant="drift" /></div>
                <Suspense fallback={<LazyScreenFallback />}>
                  <SettingsScreen
                    settings={settings}
                    body={todayBody}
                    mapboxInherited={Boolean(!settings.mapboxToken && import.meta.env.VITE_MAPBOX_TOKEN)}
                    healthAvailable={healthAvailable}
                    stravaConnectUrl={stravaConnectUrl()}
                    stravaConnected={Boolean(settings.stravaRefreshToken)}
                    stravaSyncing={integrationState.strava === "syncing"}
                    onSave={async (nextSettings) => {
                      setSettings(nextSettings);
                      await saveSettings(nextSettings);
                    }}
                    onScanDevices={scanHeartRateDevices}
                    onTestDevice={testHeartRateDevice}
                    onRefreshOura={refreshOuraWithHistory}
                    onImportStrava={syncStravaHistory}
                    onRepair={async () => {
                      await repairLibrary();
                      await bootstrapQuery.refetch();
                    }}
                    onBackfill={async () => {
                      let remaining = Math.max(remainingCoachCount, 1);
                      let stalledPasses = 0;

                      while (remaining > 0 && stalledPasses < 2) {
                        const result = await backfillComments(Math.min(20, remaining));
                        remaining = result.remaining;
                        await bootstrapQuery.refetch();
                        stalledPasses = result.processed + result.reused === 0 ? stalledPasses + 1 : 0;
                      }
                    }}
                    onHealthAuth={async () => {
                      await connectHealth();
                    }}
                    onLogout={async () => {
                      await logout().catch(() => undefined);
                      await clearSession();
                      setSession(null);
                    }}
                  />
                </Suspense>
              </div>
              ) : null}

              <div className="pt-4">
                <button
                  onClick={() => setView("home")}
                  className="transition-opacity active:opacity-50"
                  aria-label="Home"
                >
                  <CoachIcon size={36} color="rgba(90,230,222,0.5)" />
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {detailSummary ? (
        <Suspense fallback={<LazyScreenFallback />}>
          <ActivityDetailSheet
            summary={detailSummary}
            detail={detailQuery.data ?? null}
            mapboxToken={effectiveMapboxToken}
            onClose={closeDetail}
            onGoHome={() => { closeDetail(); setView("home"); }}
            onGenerateComment={async () => {
              await commentActivity(detailSummary.id, true, settings.ouraToken || undefined);
              await Promise.all([detailQuery.refetch(), bootstrapQuery.refetch()]);
            }}
            onDelete={async () => {
              if (!window.confirm(`Delete "${detailSummary.name}"?`)) return;
              await deleteActivity(detailSummary.id);
              closeDetail();
              await bootstrapQuery.refetch();
            }}
          />
        </Suspense>
      ) : null}

      {recording.draft || pendingSport ? (
        <RecordingScreen
          draft={recording.draft}
          elapsedSeconds={recording.currentElapsed}
          mapboxToken={effectiveMapboxToken}
          gpsCallbackCount={recording.gpsCallbackCount}
          nativeStatus={recording.nativeStatus}
          onStart={() => {
            if (pendingSport) {
              void recording.start(pendingSport);
              setPendingSport(null);
            }
          }}
          onCancel={() => setPendingSport(null)}
          onPause={recording.pause}
          onResume={recording.resume}
          onStop={() => void recording.stop()}
          onDiscard={() => void recording.discard()}
          onOpenMap={() => setMapSheetOpen(true)}
          onOpenLocationSettings={() => void recording.openLocationSettings()}
        />
      ) : null}

      {mapSheetOpen ? (
        <Suspense fallback={<LazyScreenFallback />}>
          <RecordingMapSheet
            open={mapSheetOpen}
            token={effectiveMapboxToken}
            points={recording.draft?.points ?? []}
            onClose={() => setMapSheetOpen(false)}
            onReady={recording.setMapReady}
          />
        </Suspense>
      ) : null}

    </div>

    {savedFlash ? (
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9000,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--color-bg)",
          animation: "andes-saved-flash 1.8s ease-out forwards",
        }}
      >
        <CheckIcon size={48} color="#5ae6de" />
      </div>
    ) : null}

    </>
  );
}
