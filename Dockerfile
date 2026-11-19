FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

WORKDIR /app
RUN chown node:node /app

COPY --chown=node:node package.json package-lock.json ./
USER node
RUN --mount=type=cache,id=kandang-pagi-npm,target=/home/node/.npm,uid=1000,gid=1000 npm ci --prefer-offline --no-audit --no-fund

COPY --chown=node:node . .
ENV NEXT_TELEMETRY_DISABLED=1
EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0"]
