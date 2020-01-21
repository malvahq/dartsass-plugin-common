# docker build -t dartsass-plugin-common:12.14.1-alpine3.11 .

# https://hub.docker.com/_/node?tab=tags
ARG NODE_VERSION=12.14.1-alpine3.11
FROM node:${NODE_VERSION}
RUN apk add python make g++ && \
    node --version && npm --version && \
    npm install -g npm

# The version of 1.19.0 has no significance except that it is not the
# latest version of sass
# ( see package.json to confirm the latest version of sass ).
# This binary inside the container image is used
# primarily for testing purposes only.
RUN npm install -g sass@1.19.0

ARG DEVEL_USER=develop
ENV TYPESCRIPT_VERSION=3.7.5
RUN npm install -g typescript@${TYPESCRIPT_VERSION} && \
    cat /etc/os-release && \
    adduser -g "" -D  ${DEVEL_USER} &&  \
    adduser ${DEVEL_USER} node && \
    id ${DEVEL_USER}

USER ${DEVEL_USER}
WORKDIR /home/${DEVEL_USER}

RUN npm --version && tsc --version && sass --version

WORKDIR /tmp

ENTRYPOINT /bin/sh -c "while true; do echo hello; sleep 100; done"
# docker-compose up --force-recreate -d --remove-orphans