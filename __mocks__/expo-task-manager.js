/**
 * Shared manual mock for `expo-task-manager`.
 *
 * Opt into it with `jest.mock('expo-task-manager')` (no factory).
 *
 * lib/locationService.ts calls `TaskManager.defineTask(name, executor)` at
 * MODULE LOAD time (top-level), so this mock must be active before the service
 * is imported — `jest.mock()` is hoisted by babel-jest above imports, which
 * guarantees that.
 *
 * `defineTask` stores each executor in a Map keyed by task name and exposes
 * it via `__getTaskExecutor(name)` / `__taskExecutors`, so tests can fire
 * location-update and geofence events into the service's callback registries
 * by invoking the captured executor with a synthetic task body.
 *
 * `isTaskRegisteredAsync` defaults to `false`; tests override it as needed
 * (e.g. to exercise stopTracking()'s "task is registered" branch).
 */
const taskExecutors = new Map();

function defineTask(taskName, taskExecutor) {
  if (!taskName || typeof taskName !== 'string') {
    return;
  }
  if (typeof taskExecutor !== 'function') {
    return;
  }
  taskExecutors.set(taskName, taskExecutor);
}

module.exports = {
  defineTask: jest.fn(defineTask),
  isTaskRegisteredAsync: jest.fn(async () => false),
  isTaskDefined: jest.fn((taskName) => taskExecutors.has(taskName)),
  getTaskOptionsAsync: jest.fn(async () => null),
  getRegisteredTasksAsync: jest.fn(async () => []),
  unregisterTaskAsync: jest.fn(async () => undefined),

  // Test helpers — not part of the real public API.
  __taskExecutors: taskExecutors,
  __getTaskExecutor(taskName) {
    return taskExecutors.get(taskName);
  },
  __clearTaskExecutors() {
    taskExecutors.clear();
  },
};