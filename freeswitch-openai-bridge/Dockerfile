# Stage 1: Build
FROM golang:1.24-alpine AS builder
WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bridge ./cmd/server

# Stage 2: Runtime
FROM alpine:3.20 AS runner

RUN apk add --no-cache ca-certificates tzdata

# runtime.Caller(0) in config.go resolves to /app/config/config.go at build time,
# so config.yaml must be placed at /app/config/config.yaml
WORKDIR /app
COPY --from=builder /bridge /bridge
COPY --from=builder /app/config/config.yaml /app/config/config.yaml

EXPOSE 8083

CMD ["/bridge"]
