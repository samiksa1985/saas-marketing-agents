FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
COPY abm ./abm
COPY analytics ./analytics
COPY client-ops ./client-ops
COPY comms ./comms
COPY content ./content
COPY design ./design
COPY developer-marketing ./developer-marketing
COPY email ./email
COPY events ./events
COPY growth ./growth
COPY paid-media ./paid-media
COPY partnerships ./partnerships
COPY product-marketing ./product-marketing
COPY project-management ./project-management
COPY sales ./sales
COPY seo ./seo
COPY social ./social
COPY strategy ./strategy
COPY scripts ./scripts
COPY tsconfig.json tsconfig.base.json ./
RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim AS api-runtime-files
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/api/dist ./apps/api/dist
COPY --from=build /workspace/abm ./abm
COPY --from=build /workspace/analytics ./analytics
COPY --from=build /workspace/client-ops ./client-ops
COPY --from=build /workspace/comms ./comms
COPY --from=build /workspace/content ./content
COPY --from=build /workspace/design ./design
COPY --from=build /workspace/developer-marketing ./developer-marketing
COPY --from=build /workspace/email ./email
COPY --from=build /workspace/events ./events
COPY --from=build /workspace/growth ./growth
COPY --from=build /workspace/paid-media ./paid-media
COPY --from=build /workspace/partnerships ./partnerships
COPY --from=build /workspace/product-marketing ./product-marketing
COPY --from=build /workspace/project-management ./project-management
COPY --from=build /workspace/sales ./sales
COPY --from=build /workspace/seo ./seo
COPY --from=build /workspace/social ./social
COPY --from=build /workspace/strategy ./strategy
COPY --from=build /workspace/scripts/release/prepare-container-runtime.mjs ./scripts/prepare-container-runtime.mjs
RUN node scripts/prepare-container-runtime.mjs api

FROM node:22-bookworm-slim AS worker-runtime-files
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps ./apps
COPY packages ./packages
RUN npm ci --omit=dev --workspace apps/worker --include-workspace-root=false
COPY --from=build /workspace/packages ./packages
COPY --from=build /workspace/apps/worker/dist ./apps/worker/dist
COPY --from=build /workspace/scripts/release/prepare-container-runtime.mjs ./scripts/prepare-container-runtime.mjs
RUN node scripts/prepare-container-runtime.mjs worker

FROM node:22-bookworm-slim AS api
ARG RELEASE_VERSION=0.0.0-local
ARG VCS_REF=unknown
ARG BUILD_TIMESTAMP=unknown
ARG BUILD_ID=local
ENV NODE_ENV=production RELEASE_VERSION=${RELEASE_VERSION}
WORKDIR /workspace
COPY --chown=node:node --from=api-runtime-files /workspace/package.json ./package.json
COPY --chown=node:node --from=api-runtime-files /workspace/node_modules ./node_modules
COPY --chown=node:node --from=api-runtime-files /workspace/apps ./apps
COPY --chown=node:node --from=api-runtime-files /workspace/packages ./packages
COPY --chown=node:node --from=api-runtime-files /workspace/abm ./abm
COPY --chown=node:node --from=api-runtime-files /workspace/analytics ./analytics
COPY --chown=node:node --from=api-runtime-files /workspace/client-ops ./client-ops
COPY --chown=node:node --from=api-runtime-files /workspace/comms ./comms
COPY --chown=node:node --from=api-runtime-files /workspace/content ./content
COPY --chown=node:node --from=api-runtime-files /workspace/design ./design
COPY --chown=node:node --from=api-runtime-files /workspace/developer-marketing ./developer-marketing
COPY --chown=node:node --from=api-runtime-files /workspace/email ./email
COPY --chown=node:node --from=api-runtime-files /workspace/events ./events
COPY --chown=node:node --from=api-runtime-files /workspace/growth ./growth
COPY --chown=node:node --from=api-runtime-files /workspace/paid-media ./paid-media
COPY --chown=node:node --from=api-runtime-files /workspace/partnerships ./partnerships
COPY --chown=node:node --from=api-runtime-files /workspace/product-marketing ./product-marketing
COPY --chown=node:node --from=api-runtime-files /workspace/project-management ./project-management
COPY --chown=node:node --from=api-runtime-files /workspace/sales ./sales
COPY --chown=node:node --from=api-runtime-files /workspace/seo ./seo
COPY --chown=node:node --from=api-runtime-files /workspace/social ./social
COPY --chown=node:node --from=api-runtime-files /workspace/strategy ./strategy
LABEL org.opencontainers.image.title="CODECORE Growth Intelligence OS API" \
      org.opencontainers.image.version=$RELEASE_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.created=$BUILD_TIMESTAMP \
      com.codecore.build.id=$BUILD_ID
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:4000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
USER node
CMD ["node", "apps/api/dist/main.js"]

FROM node:22-bookworm-slim AS worker
ARG RELEASE_VERSION=0.0.0-local
ARG VCS_REF=unknown
ARG BUILD_TIMESTAMP=unknown
ARG BUILD_ID=local
ENV NODE_ENV=production RELEASE_VERSION=${RELEASE_VERSION}
WORKDIR /workspace
COPY --chown=node:node --from=worker-runtime-files /workspace/package.json ./package.json
COPY --chown=node:node --from=worker-runtime-files /workspace/node_modules ./node_modules
COPY --chown=node:node --from=worker-runtime-files /workspace/apps ./apps
COPY --chown=node:node --from=worker-runtime-files /workspace/packages ./packages
LABEL org.opencontainers.image.title="CODECORE Growth Intelligence OS Worker" \
      org.opencontainers.image.version=$RELEASE_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.created=$BUILD_TIMESTAMP \
      com.codecore.build.id=$BUILD_ID
USER node
CMD ["node", "apps/worker/dist/main.js"]

FROM node:22-bookworm-slim AS web
ARG RELEASE_VERSION=0.0.0-local
ARG VCS_REF=unknown
ARG BUILD_TIMESTAMP=unknown
ARG BUILD_ID=local
ENV NODE_ENV=production RELEASE_VERSION=${RELEASE_VERSION}
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /workspace
COPY --chown=node:node --from=build /workspace/apps/web/.next/standalone ./
COPY --chown=node:node --from=build /workspace/apps/web/.next/static ./apps/web/.next/static
LABEL org.opencontainers.image.title="CODECORE Growth Intelligence OS Web" \
      org.opencontainers.image.version=$RELEASE_VERSION \
      org.opencontainers.image.revision=$VCS_REF \
      org.opencontainers.image.created=$BUILD_TIMESTAMP \
      com.codecore.build.id=$BUILD_ID
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
USER node
CMD ["node", "apps/web/server.js"]
