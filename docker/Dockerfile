FROM alpine:3.18.3 AS build
WORKDIR /build

RUN apk --no-cache add \
    linux-headers \
    git \
    g++ \
    make \
    perl \
    pkgconfig \
    libtool \
    ca-certificates \
    libressl-dev \
    zlib-dev \
    lmdb-dev \
    flatbuffers-dev \
    libsecp256k1-dev \
    zstd-dev \
  && rm -rf /var/cache/apk/*

RUN git clone --recurse-submodules https://github.com/hoytech/strfry.git . \
  && make setup-golpe \
  && make clean \
  && make -j4

FROM alpine:3.18.3
WORKDIR /app

RUN apk --no-cache add \
    lmdb \
    flatbuffers \
    libsecp256k1 \
    libb2 \
    zstd \
    libressl \
  && rm -rf /var/cache/apk/*

COPY --from=build /build/strfry strfry

EXPOSE 7777
ENTRYPOINT ["/app/strfry"]
CMD ["relay"]
