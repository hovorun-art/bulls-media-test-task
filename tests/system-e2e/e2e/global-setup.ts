import { removeStack, startStack } from './stack';

// Starts from an empty runs volume even after an interrupted run. Playwright skips the global
// teardown when the setup throws, so a failed start cleans up here.
export default function globalSetup(): void {
  removeStack();
  try {
    startStack();
  } catch (error) {
    removeStack();
    throw error;
  }
}
