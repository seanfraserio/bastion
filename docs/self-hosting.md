# Self-Hosting

Bastion is designed to run wherever your application runs. This guide covers common deployment patterns, from a local binary to a multi-node Kubernetes cluster.

## Choose Your Deployment Method

| Method | Best for | Complexity |
|--------|----------|------------|
| Binary | Local dev, single machine | Low |
| Docker | Small teams, CI/CD | Medium |
| Docker Compose | Small teams with Redis cache | Medium |
| Kubernetes Sidecar | Per-service isolation | High |
| Kubernetes Standalone | Multi-tenant gateway | High |
| Cluster (Enterprise) | High availability | Enterprise |

---

## Binary

To run Bastion directly on your machine, build from source and run the binary with your configuration file.

```bash
# Build
npm install
npm run build

# Run
node dist/index.js --config bastion.yaml
```

Bastion listens on the port specified in your `bastion.yaml` (default: `4000`). Point your application at `http://localhost:4000`.

### Verify your deployment

```bash
curl -s http://localhost:4000/health | jq .
```

You should see `{"status":"ok"}`.

---

## Docker (Single Container)

To deploy Bastion as a single Docker container, build the image and run it with your configuration mounted as a volume.

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

### Verify your deployment

```bash
curl -s http://localhost:4000/health | jq .
```

---

## Docker Compose

To run Bastion alongside supporting services (e.g., Redis for caching) in local development or small deployments, use Docker Compose.

```bash
cd docker
docker compose up -d
```

The default `docker-compose.yml` exposes port 4000, mounts your `bastion.yaml` as read-only, and persists audit logs to a `logs/` volume.

For development with live reload, use the dev override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

See [`docker/docker-compose.yml`](../docker/docker-compose.yml) and [`docker/docker-compose.dev.yml`](../docker/docker-compose.dev.yml).

### Verify your deployment

```bash
curl -s http://localhost:4000/health | jq .
```

---

## Kubernetes Sidecar

To run Bastion as a sidecar container in the same pod as your application, use this pattern. This is the recommended approach for Kubernetes deployments because it keeps Bastion traffic local to the pod (no network hop) and lets you enforce per-service policies.

First, store your `bastion.yaml` in a ConfigMap:

```bash
kubectl create configmap bastion-config \
  --namespace=my-namespace \
  --from-file=bastion.yaml
```

Store API keys in a Secret:

```bash
kubectl create secret generic llm-secrets \
  --namespace=my-namespace \
  --from-literal=anthropic-api-key=sk-ant-...
```

Deploy the sidecar alongside your application:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: my-agent-service
  namespace: my-namespace
  labels:
    app: my-agent-service
    component: ai-agent
spec:
  replicas: 1
  selector:
    matchLabels:
      app: my-agent-service
  template:
    metadata:
      labels:
        app: my-agent-service
        component: ai-agent
        bastion-sidecar: "true"
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
              name: proxy
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              cpu: 50m
              memory: 64Mi
            limits:
              cpu: 200m
              memory: 256Mi
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

### Verify your deployment

```bash
# Check the pod is running
kubectl get pods -n my-namespace -l app=my-agent-service

# Check Bastion sidecar readiness
kubectl exec -n my-namespace deploy/my-agent-service -c bastion -- \
  curl -s http://localhost:4000/health

# Check logs
kubectl logs -n my-namespace deploy/my-agent-service -c bastion
```

---

## Kubernetes Standalone

To deploy Bastion as a shared gateway where multiple services route through a single Bastion instance, create a Deployment and Service.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: bastion
  namespace: ai-platform
  labels:
    app: bastion
    component: llm-gateway
spec:
  replicas: 2
  selector:
    matchLabels:
      app: bastion
  template:
    metadata:
      labels:
        app: bastion
        component: llm-gateway
    spec:
      containers:
        - name: bastion
          image: ghcr.io/your-org/bastion:latest
          ports:
            - containerPort: 4000
              name: proxy
          readinessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 5
            periodSeconds: 10
          livenessProbe:
            httpGet:
              path: /health
              port: 4000
            initialDelaySeconds: 10
            periodSeconds: 30
          resources:
            requests:
              cpu: 100m
              memory: 128Mi
            limits:
              cpu: 500m
              memory: 512Mi
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
---
apiVersion: v1
kind: Service
metadata:
  name: bastion
  namespace: ai-platform
  labels:
    app: bastion
    component: llm-gateway
spec:
  selector:
    app: bastion
  ports:
    - port: 4000
      targetPort: 4000
      name: proxy
```

Applications connect via `http://bastion.ai-platform.svc.cluster.local:4000`.

### Verify your deployment

```bash
# Check pods are running
kubectl get pods -n ai-platform -l app=bastion

# Check the service endpoint
kubectl get svc -n ai-platform bastion

# Health check via port-forward
kubectl port-forward -n ai-platform svc/bastion 4000:4000 &
curl -s http://localhost:4000/health | jq .

# Check logs across replicas
kubectl logs -n ai-platform -l app=bastion --all-containers
```

---

## Cluster Mode (Enterprise)

To deploy Bastion for high availability with shared state (rate limit counters, cache), use Bastion Enterprise in cluster mode. Cluster mode uses peer-to-peer HTTP mesh for configuration synchronization and health checking.

Add the cluster configuration to your `bastion.yaml`:

```yaml
# bastion.yaml (enterprise)
cluster:
  enabled: true
  node_id: "${HOSTNAME}"
  address: "http://${HOSTNAME}:4000"
  peers:
    - "http://bastion-0:4000"
    - "http://bastion-1:4000"
    - "http://bastion-2:4000"
  health_interval_ms: 30000
  sync_timeout_ms: 5000

cache:
  enabled: true
  strategy: semantic
  similarity_threshold: 0.95
  embedding_model: "text-embedding-3-small"
```

Cluster mode ensures rate limits are enforced globally across all Bastion instances, not just per-node. Configuration changes propagate to all peers automatically.

See [Enterprise](./enterprise.md) for full configuration details.

### Verify your deployment

```bash
# Check cluster status on any node
curl -s http://bastion-0:4000/cluster/status | jq .

# Expected output includes:
# - nodeId: the current node
# - totalNodes: number of registered peers
# - healthyNodes: number of peers passing health checks
# - configVersion: SHA-256 hash of the active configuration
```
