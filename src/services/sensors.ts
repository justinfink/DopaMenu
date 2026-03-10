import { Platform } from 'react-native';
import { SensorReading, BatterySnapshot } from '../models';

// ============================================
// Sensors Service
// Wraps Expo sensor APIs for digital phenotype
// collection. Gracefully degrades on iOS.
// ============================================

// Lazy imports to avoid crashes if packages aren't installed
let Pedometer: any = null;
let Accelerometer: any = null;
let Battery: any = null;
let Brightness: any = null;

async function loadSensorModules() {
  try {
    const sensors = await import('expo-sensors');
    Pedometer = sensors.Pedometer;
    Accelerometer = sensors.Accelerometer;
  } catch (e) {
    console.warn('[Sensors] expo-sensors not available:', e);
  }
  try {
    Battery = await import('expo-battery');
  } catch (e) {
    console.warn('[Sensors] expo-battery not available:', e);
  }
  try {
    Brightness = await import('expo-brightness');
  } catch (e) {
    console.warn('[Sensors] expo-brightness not available:', e);
  }
}

type SensorCallback = (reading: SensorReading) => void;
type BatteryCallback = (snapshot: BatterySnapshot) => void;

class SensorsService {
  private initialized = false;
  private pedometerSubscription: any = null;
  private accelerometerSubscription: any = null;
  private batterySubscription: any = null;
  private sensorCallbacks: SensorCallback[] = [];
  private batteryCallbacks: BatteryCallback[] = [];
  private lastStepCount = 0;
  private stepCountBase = 0;

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await loadSensorModules();
    this.initialized = true;
  }

  // ── Pedometer ──────────────────────────────────

  async startPedometer(): Promise<boolean> {
    await this.initialize();
    if (!Pedometer) return false;

    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return false;

      // Get today's step count
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(start, new Date());
      this.stepCountBase = result.steps;

      // Watch for new steps
      this.pedometerSubscription = Pedometer.watchStepCount((data: { steps: number }) => {
        const totalSteps = this.stepCountBase + data.steps;
        if (totalSteps !== this.lastStepCount) {
          this.lastStepCount = totalSteps;
          this.emitSensorReading('pedometer', {
            steps: totalSteps,
            newSteps: data.steps,
          });
        }
      });

      return true;
    } catch (e) {
      console.warn('[Sensors] Pedometer error:', e);
      return false;
    }
  }

  async getTodaySteps(): Promise<number> {
    await this.initialize();
    if (!Pedometer) return 0;

    try {
      const available = await Pedometer.isAvailableAsync();
      if (!available) return 0;

      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const result = await Pedometer.getStepCountAsync(start, new Date());
      return result.steps;
    } catch {
      return 0;
    }
  }

  stopPedometer(): void {
    if (this.pedometerSubscription) {
      this.pedometerSubscription.remove();
      this.pedometerSubscription = null;
    }
  }

  // ── Accelerometer ─────────────────────────────

  async startAccelerometer(intervalMs = 5000): Promise<boolean> {
    await this.initialize();
    if (!Accelerometer) return false;

    try {
      const available = await Accelerometer.isAvailableAsync();
      if (!available) return false;

      Accelerometer.setUpdateInterval(intervalMs);
      this.accelerometerSubscription = Accelerometer.addListener(
        (data: { x: number; y: number; z: number }) => {
          const magnitude = Math.sqrt(data.x ** 2 + data.y ** 2 + data.z ** 2);
          this.emitSensorReading('accelerometer', {
            x: data.x,
            y: data.y,
            z: data.z,
            magnitude,
          });
        }
      );

      return true;
    } catch (e) {
      console.warn('[Sensors] Accelerometer error:', e);
      return false;
    }
  }

  stopAccelerometer(): void {
    if (this.accelerometerSubscription) {
      this.accelerometerSubscription.remove();
      this.accelerometerSubscription = null;
    }
  }

  // ── Battery ───────────────────────────────────

  async getBatteryState(): Promise<BatterySnapshot | null> {
    await this.initialize();
    if (!Battery) return null;

    try {
      const level = await Battery.getBatteryLevelAsync();
      const state = await Battery.getBatteryStateAsync();
      return {
        level,
        isCharging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL,
        timestamp: Date.now(),
      };
    } catch {
      return null;
    }
  }

  async startBatteryMonitoring(intervalMs = 300000): Promise<boolean> {
    await this.initialize();
    if (!Battery) return false;

    try {
      this.batterySubscription = Battery.addBatteryStateListener(
        (state: { batteryState: number; batteryLevel: number }) => {
          const snapshot: BatterySnapshot = {
            level: state.batteryLevel,
            isCharging: state.batteryState === 2 || state.batteryState === 3, // CHARGING or FULL
            timestamp: Date.now(),
          };
          this.emitBatteryReading(snapshot);
          this.emitSensorReading('battery', {
            level: snapshot.level,
            isCharging: snapshot.isCharging ? 1 : 0,
          });
        }
      );
      return true;
    } catch (e) {
      console.warn('[Sensors] Battery monitoring error:', e);
      return false;
    }
  }

  stopBatteryMonitoring(): void {
    if (this.batterySubscription) {
      this.batterySubscription.remove();
      this.batterySubscription = null;
    }
  }

  // ── Brightness ────────────────────────────────

  async getAmbientBrightness(): Promise<number | null> {
    await this.initialize();
    if (!Brightness) return null;

    try {
      // System brightness as proxy (0-1)
      const brightness = await Brightness.getSystemBrightnessAsync();
      return brightness;
    } catch {
      return null;
    }
  }

  // ── Callbacks ─────────────────────────────────

  onSensorReading(callback: SensorCallback): () => void {
    this.sensorCallbacks.push(callback);
    return () => {
      this.sensorCallbacks = this.sensorCallbacks.filter(cb => cb !== callback);
    };
  }

  onBatteryChange(callback: BatteryCallback): () => void {
    this.batteryCallbacks.push(callback);
    return () => {
      this.batteryCallbacks = this.batteryCallbacks.filter(cb => cb !== callback);
    };
  }

  private emitSensorReading(type: SensorReading['type'], value: Record<string, number>): void {
    const reading: SensorReading = { type, timestamp: Date.now(), value };
    this.sensorCallbacks.forEach(cb => cb(reading));
  }

  private emitBatteryReading(snapshot: BatterySnapshot): void {
    this.batteryCallbacks.forEach(cb => cb(snapshot));
  }

  // ── Lifecycle ─────────────────────────────────

  stopAll(): void {
    this.stopPedometer();
    this.stopAccelerometer();
    this.stopBatteryMonitoring();
  }

  // ── Movement Classification ───────────────────

  classifyMovement(magnitude: number): 'sedentary' | 'light' | 'moderate' | 'active' {
    // Gravity is ~1.0, so deviations indicate movement
    const deviation = Math.abs(magnitude - 1.0);
    if (deviation < 0.05) return 'sedentary';
    if (deviation < 0.2) return 'light';
    if (deviation < 0.5) return 'moderate';
    return 'active';
  }
}

export const sensorsService = new SensorsService();
export default sensorsService;
