# Built from the repository root (see compose.yaml). The built page is served by nginx,
# which proxies /api to the triage service.
FROM node:26-slim AS build
WORKDIR /repo
COPY package.json package-lock.json tsconfig.json ./
COPY tooling ./tooling
COPY packages ./packages
COPY apps/web ./apps/web
COPY samples ./samples
RUN npm ci --workspace @triage/web --include-workspace-root --no-audit --no-fund
RUN npm run build --workspace @triage/web

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
