import { FastifyInstance } from "fastify";
import { query } from "../../db/client.js";

export async function teamRoutes(app: FastifyInstance): Promise<void> {
  // List team members
  app.get("/tenants/me/team", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const result = await query(
      `SELECT id, user_email, role, invited_at, accepted_at
       FROM team_members
       WHERE tenant_id = $1
       ORDER BY invited_at ASC`,
      [tenant.id]
    );

    return { members: result.rows };
  });

  // Invite a team member
  app.post("/tenants/me/team/invite", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { email, role } = request.body as { email?: string; role?: string };

    if (!email) {
      return reply.code(400).send({ error: "email is required" });
    }

    const validRole = role === "admin" ? "admin" : "member";

    // Check if already invited
    const existing = await query(
      "SELECT id FROM team_members WHERE tenant_id = $1 AND user_email = $2",
      [tenant.id, email]
    );

    if (existing.rows.length > 0) {
      return reply.code(409).send({ error: "user already invited" });
    }

    const result = await query(
      `INSERT INTO team_members (tenant_id, user_email, role)
       VALUES ($1, $2, $3)
       RETURNING id, user_email, role, invited_at, accepted_at`,
      [tenant.id, email, validRole]
    );

    return reply.code(201).send(result.rows[0]);
  });

  // Update team member role
  app.put("/tenants/me/team/:memberId", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { memberId } = request.params as { memberId: string };
    const { role } = request.body as { role?: string };

    if (!role || !["admin", "member"].includes(role)) {
      return reply.code(400).send({ error: "role must be 'admin' or 'member'" });
    }

    const result = await query(
      `UPDATE team_members SET role = $1
       WHERE id = $2 AND tenant_id = $3
       RETURNING id, user_email, role, invited_at, accepted_at`,
      [role, memberId, tenant.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "team member not found" });
    }

    return result.rows[0];
  });

  // Remove team member
  app.delete("/tenants/me/team/:memberId", async (request, reply) => {
    const tenant = (request as any).tenant;
    if (!tenant) return reply.code(401).send({ error: "unauthorized" });

    const { memberId } = request.params as { memberId: string };

    const result = await query(
      "DELETE FROM team_members WHERE id = $1 AND tenant_id = $2 RETURNING id",
      [memberId, tenant.id]
    );

    if (result.rows.length === 0) {
      return reply.code(404).send({ error: "team member not found" });
    }

    return reply.code(204).send();
  });
}
