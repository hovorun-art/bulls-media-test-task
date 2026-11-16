import { removeStack, startStack } from './stack';

// Playwright skips the global teardown when the setup throws, so a failed start cleans up here.
export default function globalSetup(): void {
  try {
    startStack();
  } catch (error) {
    removeStack();
    throw error;
  }
}
