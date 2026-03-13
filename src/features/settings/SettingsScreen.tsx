import { useEffect, useState } from "react";
import type { CorosDevice } from "../../lib/native/coros";
import type { BodySnapshot, LocalSettings } from "../../types";
import { TrailDivider, MapIcon, HeartIcon, AppleIcon, SleepIcon, SettingsIcon, CheckIcon, RefreshIcon, SensorIcon, CoachIcon, CloseIcon } from "../home/HomeScreen";

interface SettingsScreenProps {
  settings: LocalSettings;
  body: BodySnapshot | null;
  mapboxInherited: boolean;
  healthAvailable: boolean;
  stravaConnectUrl: string;
  stravaConnected: boolean;
  stravaSyncing: boolean;
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

const inputStyle = {
  background: "transparent",
  borderBottom: "1px solid rgba(255,255,255,0.06)",
  color: "var(--color-text)",
  padding: "0.75rem 0",
  width: "100%",
  outline: "none",
  fontSize: "1rem",
  letterSpacing: "-0.01em",
} as const;

function StravaIcon({ size = 20, color = "#5ae6de" }: { size?: number; color?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" width={size} height={size}>
      <path d="M 6,20 L 12,4 L 18,20" stroke={color} strokeWidth="0.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M 14,20 L 16,14 L 18,20" stroke={color} strokeWidth="0.4" strokeLinecap="round" strokeLinejoin="round" fill="none" opacity="0.5" />
    </svg>
  );
}

function ConnectionRow({ icon, label, connected, children }: { icon: React.ReactNode; label: string; connected: boolean; children: React.ReactNode }) {
  return (
    <div className="py-5">
      <div className="mb-3 flex items-center gap-3">
        {icon}
        <span
          style={{
            fontFamily: "var(--font-sharp)",
            textTransform: "uppercase",
            letterSpacing: "0.14em",
            fontSize: "0.68rem",
            color: "var(--color-text-dim)",
          }}
        >
          {label}
        </span>
        <span
          aria-hidden="true"
          style={{
            width: "0.4rem",
            height: "0.4rem",
            borderRadius: "999px",
            background: connected ? "var(--color-accent)" : "transparent",
            border: connected ? "none" : "1px solid rgba(255,255,255,0.15)",
            marginLeft: "auto",
          }}
        />
      </div>
      {children}
    </div>
  );
}

export function SettingsScreen({ settings, body, mapboxInherited, healthAvailable, stravaConnectUrl, stravaConnected, stravaSyncing, onSave, onScanDevices, onTestDevice, onRefreshOura, onImportStrava, onRepair, onBackfill, onHealthAuth, onLogout }: SettingsScreenProps) {
  const [draft, setDraft] = useState(settings);
  const [devices, setDevices] = useState<CorosDevice[]>([]);
  const [testingHr, setTestingHr] = useState<number | null>(null);
  const [showAdvancedStrava, setShowAdvancedStrava] = useState(Boolean(settings.stravaClientId));
  const healthConnected = healthAvailable && draft.healthkitReadAuthorized && draft.healthkitWriteAuthorized;

  useEffect(() => {
    setDraft(settings);
  }, [settings]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(settings);

  return (
    <div className="mt-4">
      {/* Strava */}
      <ConnectionRow icon={<StravaIcon size={22} />} label="Strava" connected={stravaConnected}>
        {stravaConnected ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span style={{ color: "var(--color-text-soft)", fontSize: "0.92rem" }}>
                {stravaSyncing ? "Syncing activities..." : settings.lastStravaImportAt ? `Last sync ${new Date(settings.lastStravaImportAt).toLocaleDateString()}` : "Connected"}
              </span>
              <button
                onClick={() => void onImportStrava()}
                className="transition-opacity active:opacity-50"
                aria-label="Re-sync Strava"
                disabled={stravaSyncing}
              >
                <RefreshIcon size={18} color={stravaSyncing ? "var(--color-text-dim)" : undefined} />
              </button>
            </div>
            {settings.lastStravaImportError ? (
              <div style={{ color: "var(--color-text-dim)", fontSize: "0.82rem" }}>{settings.lastStravaImportError}</div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <a
              href={stravaConnectUrl}
              className="flex items-center justify-center gap-2 rounded-full px-5 py-3 transition-opacity active:opacity-50"
              style={{
                border: "1px solid rgba(90,230,222,0.28)",
                color: "var(--color-accent)",
                fontFamily: "var(--font-sharp)",
                textTransform: "uppercase",
                letterSpacing: "0.12em",
                fontSize: "0.72rem",
                textDecoration: "none",
              }}
            >
              Connect Strava
            </a>
            <button
              onClick={() => setShowAdvancedStrava(!showAdvancedStrava)}
              style={{
                color: "var(--color-text-dim)",
                fontSize: "0.78rem",
                letterSpacing: "0.02em",
              }}
              className="transition-opacity active:opacity-50"
            >
              {showAdvancedStrava ? "Hide manual credentials" : "Or enter credentials manually"}
            </button>
          </div>
        )}

        {showAdvancedStrava && !stravaConnected ? (
          <div className="mt-3 space-y-1">
            <input
              type="text"
              value={draft.stravaClientId}
              onChange={(event) => setDraft({ ...draft, stravaClientId: event.target.value })}
              placeholder="Client ID"
              style={inputStyle}
            />
            <input
              type="password"
              value={draft.stravaClientSecret}
              onChange={(event) => setDraft({ ...draft, stravaClientSecret: event.target.value })}
              placeholder="Client Secret"
              style={inputStyle}
            />
            <input
              type="password"
              value={draft.stravaRefreshToken}
              onChange={(event) => setDraft({ ...draft, stravaRefreshToken: event.target.value })}
              placeholder="Refresh Token"
              style={inputStyle}
            />
            {draft.stravaClientId && draft.stravaClientSecret && draft.stravaRefreshToken ? (
              <div className="pt-3">
                <button onClick={() => void onImportStrava()} className="transition-opacity active:opacity-50" aria-label="Import from Strava">
                  <RefreshIcon size={18} />
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </ConnectionRow>

      <TrailDivider variant="drift" />

      {/* Oura */}
      <ConnectionRow icon={<SleepIcon size={22} />} label="Oura" connected={body?.status === "ready"}>
        <input
          type="password"
          value={draft.ouraToken}
          onChange={(event) => setDraft({ ...draft, ouraToken: event.target.value })}
          placeholder="Oura token"
          style={inputStyle}
        />
        <div className="mt-3 flex items-center justify-between">
          <span style={{ color: "var(--color-text-dim)", fontSize: "0.82rem" }}>
            {draft.lastOuraSyncAt ? new Date(draft.lastOuraSyncAt).toLocaleDateString() : "never synced"}
          </span>
          <button onClick={() => void onRefreshOura()} className="transition-opacity active:opacity-50" aria-label="Sync Oura">
            <RefreshIcon size={18} />
          </button>
        </div>
      </ConnectionRow>

      <TrailDivider variant="drift" />

      {/* Heart Rate Monitor */}
      <ConnectionRow icon={<HeartIcon size={22} />} label="HR Monitor" connected={Boolean(draft.hrDeviceId)}>
        <div className="flex items-center gap-3">
          <button onClick={async () => setDevices(await onScanDevices())} className="transition-opacity active:opacity-50" aria-label="Scan monitors">
            <SensorIcon size={20} />
          </button>
          {draft.hrDeviceId && testingHr ? (
            <span className="tabular-nums" style={{ color: "var(--color-accent)", fontSize: "1.1rem" }}>{testingHr} bpm</span>
          ) : null}
          {draft.hrDeviceName ? (
            <span style={{ color: "var(--color-text-dim)", fontSize: "0.82rem" }}>{draft.hrDeviceName}</span>
          ) : null}
        </div>
        {devices.map((device) => (
          <button
            key={device.deviceId}
            onClick={async () => {
              const next = { ...draft, hrDeviceId: device.deviceId, hrDeviceName: device.name };
              setDraft(next);
              await onSave(next);
            }}
            className="mt-3 block w-full text-left transition-opacity active:opacity-50"
            style={{ color: "var(--color-text-soft)", padding: "0.5rem 0" }}
          >
            {device.name}
          </button>
        ))}
        {draft.hrDeviceId ? (
          <button
            onClick={async () => setTestingHr(await onTestDevice(draft.hrDeviceId))}
            className="mt-3 transition-opacity active:opacity-50"
            aria-label="Test heart rate"
          >
            <SensorIcon size={18} />
          </button>
        ) : null}
      </ConnectionRow>

      <TrailDivider variant="drift" />

      {/* Apple Health */}
      <ConnectionRow icon={<AppleIcon size={22} color={healthConnected ? "#5ae6de" : "rgba(90,230,222,0.3)"} />} label="Apple Health" connected={healthConnected}>
        <button
          onClick={() => void onHealthAuth()}
          className="transition-opacity active:opacity-50"
          style={{
            color: healthConnected ? "var(--color-text-dim)" : "var(--color-accent)",
            fontFamily: "var(--font-sharp)",
            textTransform: "uppercase",
            letterSpacing: "0.12em",
            fontSize: "0.72rem",
          }}
        >
          {healthConnected ? "Connected" : "Authorize"}
        </button>
      </ConnectionRow>

      <TrailDivider variant="drift" />

      {/* Mapbox */}
      <ConnectionRow icon={<MapIcon size={22} />} label="Mapbox" connected={Boolean(draft.mapboxToken || mapboxInherited)}>
        <input
          type="password"
          value={draft.mapboxToken}
          onChange={(event) => setDraft({ ...draft, mapboxToken: event.target.value })}
          placeholder="Mapbox token"
          style={inputStyle}
        />
      </ConnectionRow>

      <TrailDivider variant="drift" />

      {/* Actions row */}
      <div className="flex items-center justify-between py-5">
        <div className="flex items-center gap-5">
          <button onClick={() => void onRepair()} className="transition-opacity active:opacity-50" aria-label="Repair">
            <SettingsIcon size={20} color="var(--color-text-dim)" />
          </button>
          <button onClick={() => void onBackfill()} className="transition-opacity active:opacity-50" aria-label="Backfill">
            <CoachIcon size={20} color="var(--color-text-dim)" />
          </button>
          <button onClick={() => void onLogout()} className="transition-opacity active:opacity-50" aria-label="Logout">
            <CloseIcon size={18} color="var(--color-text-dim)" />
          </button>
        </div>
        {dirty ? (
          <button
            onClick={() => void onSave(draft)}
            className="transition-opacity active:opacity-50"
            aria-label="Save"
          >
            <CheckIcon size={22} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
