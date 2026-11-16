import { removeStack } from './stack';

export default function globalTeardown(): void {
  removeStack();
}
