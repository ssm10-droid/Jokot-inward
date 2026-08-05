import { redirect } from "next/navigation";
import { AuthError } from "next-auth";
import { auth, signIn } from "@/auth";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (session?.user) redirect("/");

  const params = await searchParams;
  const failed = params.error === "1";
  // Deep links (e.g. from notification emails) arrive as ?callbackUrl=...
  // Only ever honor relative in-app paths — never an absolute URL.
  const rawCb = typeof params.callbackUrl === "string" ? params.callbackUrl : "";
  const callbackUrl =
    rawCb.startsWith("/") && !rawCb.startsWith("//") ? rawCb : "/";

  async function login(formData: FormData) {
    "use server";
    const target = String(formData.get("callbackUrl") ?? "/");
    const safeTarget =
      target.startsWith("/") && !target.startsWith("//") ? target : "/";
    try {
      await signIn("credentials", {
        email: formData.get("email"),
        password: formData.get("password"),
        redirectTo: safeTarget,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        redirect(
          `/login?error=1&callbackUrl=${encodeURIComponent(safeTarget)}`
        );
      }
      throw error; // NEXT_REDIRECT must pass through
    }
  }

  return (
    <main>
      <h1>Jokot Inward</h1>
      <p className="muted">Purchase bill tracking — Jokot International</p>
      <div className="card">
        {failed && (
          <p style={{ color: "#b3261e", marginTop: 0 }}>
            Wrong email or password. Try again, or ask a partner to reset
            your password.
          </p>
        )}
        <form action={login}>
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          <label className="muted">Email</label>
          <input
            name="email"
            type="email"
            required
            autoComplete="username"
            style={inputStyle}
          />
          <label className="muted">Password</label>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            style={inputStyle}
          />
          <button className="primary" type="submit">
            Sign in
          </button>
        </form>
      </div>
    </main>
  );
}

const inputStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  margin: "6px 0 16px",
  padding: "10px 12px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  fontSize: 16, // 16px stops iOS Safari from zooming the field on focus
  background: "#fff",
};
