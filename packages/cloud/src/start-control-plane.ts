import { createControlPlane } from "./control-plane/server.js";

const port = parseInt(process.env.PORT || "8080", 10);
const host = process.env.HOST || "0.0.0.0";

createControlPlane().then((app) => {
  app.listen({ port, host }).then(() => {
    console.log(`Bastion Control Plane running on http://${host}:${port}`);
  });
}).catch((err) => {
  console.error("Failed to start control plane:", err);
  process.exit(1);
});
