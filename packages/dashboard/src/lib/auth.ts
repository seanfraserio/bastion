import NextAuth from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      tenantId?: string;
      controlKey?: string;
    };
  }
  interface User {
    tenantId?: string;
    controlKey?: string;
  }
}


// Build providers list dynamically
const providers: Provider[] = [
  Google({
    clientId: process.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  }),
  GitHub({
    clientId: process.env.GITHUB_CLIENT_ID ?? "",
    clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
  }),
];

// Only add email provider when EMAIL_SERVER is configured
if (process.env.EMAIL_SERVER) {
  // Dynamic import avoided — use Nodemailer only when configured
  const Nodemailer = require("next-auth/providers/nodemailer").default;
  providers.push(
    Nodemailer({
      server: process.env.EMAIL_SERVER,
      from: process.env.EMAIL_FROM,
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.tenantId = user.tenantId;
        token.controlKey = user.controlKey;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub as string;
        session.user.tenantId = token.tenantId as string | undefined;
        session.user.controlKey = token.controlKey as string | undefined;
      }
      return session;
    },
  },
});
