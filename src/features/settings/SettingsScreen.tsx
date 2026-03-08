import { useEffect, useState } from "react";
import type { CorosDevice } from "../../lib/native/coros";
import type { BodySnapshot, LocalSettings } from "../../types";
import { SectionHeader } from "../../ui/SectionHeader";
import { StatusChip } from "../../ui/StatusChip";
import { MapIcon, HeartIcon, SleepIcon, SettingsIcon } from "../home/HomeScreen";

interface SettingsScreenProps {
  settings: LocalSettings;
  body: BodySnapshot | null;
  mapboxInherited: boolean;
  healthAvailable: boolean;
  onSave: (settings: LocalSettings) => Promise<void>;
  onScanDevices: () => Promise<CorosDevice[]>;
  onTestDevice: (deviceId: string) => Promise<number | null>;
  onRefreshOura: () => Promise<void>;
  onImportStrava: () => Promise<void>;
  onRepair: () => Promise<void>;
  onBackfill: () => Promise<void>;
  onHealthAuth: () => Promise<void>;
  onLogout: () => Promise<void>;
}

export function SettingsScreen({ settings, body, mapboxInherited, healthAvailable, onSave, onScanDevices, onTestDevice, onRefreshOura, onImportStrava, onRepair, onBackfill, onHealthAuth, onLogout }: SettingsScreenProps) {
  const [draft, setDraft] = useState(settings);
  const [devices, setDevices] = useState<CorosDevice[]>([]);
  const [testingHr, setTestingHr] = useState<number | null>(null);
  const healthConnected = healthAvailable && draft.healthkitReadAuthorized && draft.healthkitWriteAuthorized;

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  return (
    <div>
      <SettingsIcon size={40} />
      <div style={{ marginTop: "1rem", maxWidth: "24rem", color: "var(--color-text-dim)", lineHeight: 1.5, fontSize: "0.9rem" }}>
        Connect once. Keep quiet.
      </div>

      <div className="mt-9 border-t" style={{ borderColor: "var(--color-border)" }}>
        <section className="border-b py-7" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4 flex items-center justify-between">
            <MapIcon size={24} />
            <StatusChip label={draft.mapboxToken ? "ok" : mapboxInherited ? "ok" : "—"} tone={draft.mapboxToken || mapboxInherited ? "accent" : "neutral"} />
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={draft.mapboxToken}
              onChange={(event) => setDraft({ ...draft, mapboxToken: event.target.value })}
              placeholder="Mapbox token"
              className="w-full rounded-[18px] border px-4 py-3"
              style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
            <div className="flex items-center justify-between gap-3">
              <div style={{ color: "var(--color-text-dim)", fontSize: "0.94rem" }}>
                {mapboxInherited && !draft.mapboxToken ? "The app is currently using a bundled token. Add a local token here only if you want to override it." : "Static cards and live route sheet use this token."}
              </div>
              <button onClick={() => void onSave(draft)} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(90,230,222,0.24)", color: "var(--color-accent)" }}>Save</button>
            </div>
          </div>
        </section>

        <section className="border-b py-7" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4 flex items-center justify-between">
            <HeartIcon size={24} />
            <StatusChip label={draft.hrDeviceId ? "ok" : "—"} tone={draft.hrDeviceId ? "accent" : "neutral"} />
          </div>
          <div className="space-y-3">
            <button onClick={async () => setDevices(await onScanDevices())}>
              <StatusChip label="Scan monitors" tone="accent" />
            </button>
            {devices.map((device) => (
              <button
                key={device.deviceId}
                onClick={async () => {
                  const next = { ...draft, hrDeviceId: device.deviceId, hrDeviceName: device.name };
                  setDraft(next);
                  await onSave(next);
                }}
                className="flex w-full items-center justify-between rounded-[18px] border px-4 py-3"
                style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)" }}
              >
                <span>{device.name}</span>
                <span style={{ color: "var(--color-text-dim)" }}>Pair</span>
              </button>
            ))}
            {draft.hrDeviceId ? (
              <button
                onClick={async () => {
                  const result = await onTestDevice(draft.hrDeviceId);
                  setTestingHr(result);
                }}
                className="rounded-[18px] border px-4 py-3"
                style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)", color: "var(--color-text-soft)" }}
              >
                Test HR Monitor {testingHr ? `· ${testingHr} bpm` : ""}
              </button>
            ) : null}
          </div>
        </section>

        <section className="border-b py-7" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4 flex items-center justify-between">
            <SleepIcon size={24} />
            <StatusChip label={body?.status === "ready" ? "ok" : "—"} tone={body?.status === "ready" ? "accent" : "neutral"} />
          </div>
          <div className="space-y-3">
            <input
              type="password"
              value={draft.ouraToken}
              onChange={(event) => setDraft({ ...draft, ouraToken: event.target.value })}
              placeholder="Oura token"
              className="w-full rounded-[18px] border px-4 py-3"
              style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
            <div style={{ color: "var(--color-text-dim)", lineHeight: 1.55, fontSize: "0.94rem" }}>
              <div>Last sync {draft.lastOuraSyncAt ? new Date(draft.lastOuraSyncAt).toLocaleString() : "never"}</div>
              <div>{draft.lastOuraSyncError ? `Status: ${draft.lastOuraSyncError}` : `Day: ${draft.lastOuraSyncDay ?? "not cached"}`}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => void onSave(draft)} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.008)" }}>Save</button>
              <button onClick={() => void onRefreshOura()} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(90,230,222,0.28)", color: "var(--color-accent)" }}>Sync now</button>
            </div>
          </div>
        </section>

        <section className="border-b py-7" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4 flex items-center justify-between">
            <HeartIcon size={24} color={healthConnected ? "#5ae6de" : "rgba(90,230,222,0.3)"} />
            <StatusChip label={healthConnected ? "ok" : "—"} tone={healthConnected ? "accent" : "neutral"} />
          </div>
          <div className="space-y-3">
            <button onClick={() => void onHealthAuth()} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(90,230,222,0.28)", color: "var(--color-accent)" }}>
              {healthConnected ? "Reconnect Apple Health" : "Connect Apple Health"}
            </button>
            <div style={{ color: "var(--color-text-dim)", lineHeight: 1.55, fontSize: "0.95rem" }}>
              <div>Read access {draft.healthkitReadAuthorized ? "granted" : "needed"}</div>
              <div>Workout export {draft.healthkitWriteAuthorized ? "granted" : "needed"}</div>
              <div>Last export {draft.lastHealthkitExportAt ? new Date(draft.lastHealthkitExportAt).toLocaleString() : "never"}</div>
              <div>{draft.lastHealthkitError ? `Status: ${draft.lastHealthkitError}` : "Status: Ready"}</div>
            </div>
          </div>
        </section>

        <section className="border-b py-7" style={{ borderColor: "var(--color-border)" }}>
          <div className="mb-4 flex items-center justify-between">
            <SettingsIcon size={24} />
            <StatusChip label={draft.stravaClientId ? "ok" : "—"} tone={draft.stravaClientId ? "accent" : "neutral"} />
          </div>
          <div className="space-y-3">
            <input
              type="text"
              value={draft.stravaClientId}
              onChange={(event) => setDraft({ ...draft, stravaClientId: event.target.value })}
              placeholder="Client ID"
              className="w-full rounded-[18px] border px-4 py-3"
              style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
            <input
              type="password"
              value={draft.stravaClientSecret}
              onChange={(event) => setDraft({ ...draft, stravaClientSecret: event.target.value })}
              placeholder="Client Secret"
              className="w-full rounded-[18px] border px-4 py-3"
              style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
            <input
              type="password"
              value={draft.stravaRefreshToken}
              onChange={(event) => setDraft({ ...draft, stravaRefreshToken: event.target.value })}
              placeholder="Refresh Token"
              className="w-full rounded-[18px] border px-4 py-3"
              style={{ background: "rgba(255,255,255,0.008)", borderColor: "var(--color-border)", color: "var(--color-text)" }}
            />
            <div style={{ color: "var(--color-text-dim)", lineHeight: 1.55, fontSize: "0.94rem" }}>
              <div>Last import {draft.lastStravaImportAt ? new Date(draft.lastStravaImportAt).toLocaleString() : "never"}</div>
              <div>{draft.lastStravaImportError ? `Status: ${draft.lastStravaImportError}` : "Status: History folds in automatically when credentials are present."}</div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => void onSave(draft)} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.008)" }}>Save</button>
              <button onClick={() => void onImportStrava()} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(90,230,222,0.28)", color: "var(--color-accent)" }}>Sync now</button>
            </div>
          </div>
        </section>

        <section className="py-7">
          <div className="mb-4">
            <SettingsIcon size={24} color="rgba(90,230,222,0.5)" />
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => void onRepair()} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.008)" }}>Repair Library</button>
            <button onClick={() => void onBackfill()} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "var(--color-border)", background: "rgba(255,255,255,0.008)" }}>Backfill Notes</button>
            <button onClick={() => void onLogout()} className="rounded-[18px] border px-4 py-3" style={{ borderColor: "rgba(90,230,222,0.28)", color: "var(--color-accent)" }}>Logout</button>
          </div>
        </section>
      </div>
    </div>
  );
}
