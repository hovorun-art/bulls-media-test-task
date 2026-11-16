# Built from the repository root (see compose.yaml). Runs the service with tsx, like `npm start`.
FROM node:26-slim
WORKDIR /repo
COPY package.json package-lock.json tsconfig.json ./
COPY tooling ./tooling
COPY packages ./packages
COPY apps/triage ./apps/triage
RUN npm ci --workspace @triage/service --include-workspace-root --no-audit --no-fund
WORKDIR /repo/apps/triage
EXPOSE 3000
CMD ["npm", "start"]
