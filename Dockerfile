# syntax=docker/dockerfile:1.7

FROM emscripten/emsdk:6.0.6 AS builder

WORKDIR /src
COPY . .
RUN EMSDK_DIR=/emsdk ./build-web.sh

FROM nginx:1.27-alpine

ARG VCS_REF=unknown
LABEL org.opencontainers.image.title="Blood WASM" \
      org.opencontainers.image.description="Assetless NBlood browser checkpoint" \
      org.opencontainers.image.source="https://github.com/theodorecharles/blood-wasm" \
      org.opencontainers.image.revision="$VCS_REF"

COPY --from=builder /src/build-web/dist/ /usr/share/nginx/html/
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY AUTHORS.md /usr/share/nginx/html/AUTHORS.md
COPY source/blood/gpl-2.0.txt /usr/share/nginx/html/BLOOD-GPL-2.0.txt

RUN printf '%s\n' \
        'Corresponding source for this image:' \
        "https://github.com/theodorecharles/blood-wasm/tree/${VCS_REF}" \
        'The image contains NBlood engine/runtime code only; each user supplies legal Blood data to browser-local storage.' \
        'The tracked nblood.pk3 resource is a downstream engine resource, not retail Blood data.' \
        > /usr/share/nginx/html/SOURCE-OFFER.txt

EXPOSE 8088/tcp
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -q -O - http://127.0.0.1:8088/health >/dev/null
