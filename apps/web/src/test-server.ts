import { setupServer } from 'msw/node';

/** The network of the unit tests: each test declares the API answers it needs with server.use(...). */
export const server = setupServer();
