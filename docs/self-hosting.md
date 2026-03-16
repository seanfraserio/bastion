# Self-Hosting

Bastion is designed to run wherever your application runs. This guide covers common deployment patterns.

---

## Docker (Single Container)

The simplest deployment. Run Bastion as a single Docker container alongside your application.

```bash
docker build -t bastion -f docker/Dockerfile .

docker run -d \
  --name bastion \
  -p 4000:4000 \
  -v $(pwd)/bastion.yaml:/app/bastion.yaml:ro \
  -e ANTHROPIC_API_KEY \
  bastion
```

Point your application at `http://localhost:4000` or `http://bastion:4000` if using Docker networking.

See [`docker/Dockerfile`](../docker/Dockerfile) for the full multi-stage build.

---

## Docker Compose

For local development or small deployments, use Docker Compose to run Bastion alongside your application.

```bash
cd docker
docker compose up -d
```

The default `docker-compose.yml` exposes port 4000, mounts your `bastion.yaml` as read-only, and persists audit logs to a `logs/` volume.

For development, use the dev override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

See [`docker/docker-compose.yml`](../docker/docker-compose.yml) and [`docker/docker-compose.dev.yml`](../docker/docker-compose.dev.yml).

---

## Kubernetes Sidecar

Run Bastion as a sidecar container in the same pod as your application. This is the recommended pattern for Kubernetes deployments -- it keeps Bastion traffic local to the pod (no network hop) and lets you enforce per-service policies.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-agent-service
spec:
  template:
    spec:
      containers:
        - name: app
          image: my-agent-service:latest
          env:
            - name: ANTHROPIC_BASE_URL
              value: "http://localhost:4000"

        - name: bastion
          image: ghcr.io/your-org/bastion:latest
          ports:
            - containerPort: 4000
          volumeMounts:
            - name: bastion-config
              mountPath: /app/bastion.yaml
              subPath: bastion.yaml
              readOnly: true
          env:
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: llm-secrets
                  key: anthropic-api-key

      volumes:
        - name: bastion-config
          configMap:
            name: bastion-config
```

Store your `bastion.yaml` in a ConfigMap:

```bash
kubectl create configmap bastion-config --from-file=bastion.yaml
```

Store API keys in a Secret:

```bash
kubectl create secret generic llm-secrets \
  --from-literal=anthropic-api-key=sk-ant-...
```

---

## Kubernetes Standalone

For shared deployments where multiple services route through a single Bastion instance, deploy Bastion as its own Deployment with a Service:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bastion
spec:
  replicas: 2
  template:
    spec:
      containers:
        - name: bastion
          image: ghcr.io/your-org/bastion:latest
          ports:
            - containerPort: 4000
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
---
apiVersion: v1
kind: Service
metadata:
  name: bastion
spec:
  selector:
    app: bastion
  ports:
    - port: 4000
      targetPort: 4000
```

Applications connect via `http://bastion.default.svc.cluster.local:4000`.

---

## Cluster Mode (Enterprise)

For high-availability deployments with shared state (rate limit counters, cache), Bastion Enterprise supports cluster mode with Redis-backed state synchronization.

```yaml
# bastion.yaml (enterprise)
cluster:
  enabled: true
  redis_url: "redis://redis:6379"
  node_id: "${HOSTNAME}"

cache:
  enabled: true
  storage: redis
  redis_url: "redis://redis:6379"
```

Cluster mode ensures rate limits are enforced globally across all Bastion instances, not just per-node.

See [Enterprise](./enterprise.md) for details.
