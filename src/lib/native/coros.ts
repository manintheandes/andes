import { BleClient, type ScanResult } from "@capacitor-community/bluetooth-le";
import type { SensorConnectionStatus } from "../../types";

const HR_SERVICE = "0000180d-0000-1000-8000-00805f9b34fb";
const HR_CHARACTERISTIC = "00002a37-0000-1000-8000-00805f9b34fb";

export interface CorosDevice {
  deviceId: string;
  name: string;
}

export function parseHeartRate(dataView: DataView): number {
  const flags = dataView.getUint8(0);
  return flags & 0x01 ? dataView.getUint16(1, true) : dataView.getUint8(1);
}

export async function scanHeartRateDevices(): Promise<CorosDevice[]> {
  try {
    await BleClient.initialize();
  } catch {
    return [];
  }
  const devices = new Map<string, CorosDevice>();

  await BleClient.requestLEScan({ services: [HR_SERVICE] }, (result: ScanResult) => {
    const name = result.device.name || "HR Monitor";
    devices.set(result.device.deviceId, { deviceId: result.device.deviceId, name });
  });

  await new Promise((resolve) => window.setTimeout(resolve, 5500));
  try {
    await BleClient.stopLEScan();
  } catch {
    // ignore scan stop errors
  }
  return Array.from(devices.values());
}

export async function testHeartRateDevice(deviceId: string): Promise<number | null> {
  let latest: number | null = null;
  const disconnect = await connectHeartRateDevice(deviceId, (hr) => {
    latest = hr;
  }, () => {});

  await new Promise((resolve) => window.setTimeout(resolve, 4000));
  await disconnect();
  return latest;
}

export async function connectHeartRateDevice(
  deviceId: string,
  onHeartRate: (value: number) => void,
  onStatus: (status: SensorConnectionStatus) => void
): Promise<() => Promise<void>> {
  await BleClient.initialize();

  let closed = false;
  let reconnectTimer: number | null = null;
  let notificationsStarted = false;

  const clearReconnect = () => {
    if (reconnectTimer !== null) {
      window.clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  };

  const disconnectQuietly = async () => {
    try {
      if (notificationsStarted) {
        await BleClient.stopNotifications(deviceId, HR_SERVICE, HR_CHARACTERISTIC);
      }
    } catch {
      // ignore
    }
    try {
      await BleClient.disconnect(deviceId);
    } catch {
      // ignore
    }
    notificationsStarted = false;
  };

  const scheduleReconnect = () => {
    if (closed || reconnectTimer !== null) return;
    onStatus("reconnecting");
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = null;
      void connectOnce(true);
    }, 1800);
  };

  const handleDisconnect = () => {
    if (closed) return;
    onStatus("signal_lost");
    scheduleReconnect();
  };

  const connectOnce = async (isReconnect: boolean) => {
    try {
      onStatus(isReconnect ? "reconnecting" : "connecting");
      await BleClient.connect(deviceId, handleDisconnect);
      await BleClient.startNotifications(deviceId, HR_SERVICE, HR_CHARACTERISTIC, (dataView) => {
        const hr = parseHeartRate(dataView);
        if (hr > 0 && hr < 250) {
          onHeartRate(hr);
        }
      });
      notificationsStarted = true;
      onStatus("live");
    } catch {
      await disconnectQuietly();
      onStatus(isReconnect ? "signal_lost" : "unavailable");
      scheduleReconnect();
    }
  };

  await connectOnce(false);

  return async () => {
    closed = true;
    clearReconnect();
    onStatus("idle");
    await disconnectQuietly();
  };
}
