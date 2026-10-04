import Link from 'next/link';

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">CODECORE GROWTH INTELLIGENCE OS</p>
        <h1>Sign in</h1>
        <p>Use your organization identity provider to access an authorized workspace.</p>
        {error === 'authentication_failed' ? (
          <p role="alert">Sign-in could not be completed. Please try again.</p>
        ) : null}
        <a className="topbar-account" href="/api/auth/login">Continue with organization sign-in</a>
        <Link href="/">Return to the product</Link>
      </section>
    </main>
  );
}
