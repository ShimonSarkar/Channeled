import { Waves } from 'lucide-react';

/**
 * Unauthenticated landing screen. We redirect via a full navigation (not fetch)
 * because the Google OAuth flow needs the browser to follow cross-origin
 * redirects and set cookies on `localhost` / the production host.
 */
export function LoginScreen() {
  const error = new URLSearchParams(window.location.search).get('login') === 'failed';
  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <Waves size={28} className="brand-icon" aria-hidden />
          <h1>Channeled</h1>
        </div>
        <p className="login-tag">A focused to-do app for personal workstreams.</p>
        {error && (
          <p className="login-error" role="alert">
            Sign-in failed. Please try again.
          </p>
        )}
        <a className="btn btn-primary login-btn" href="/api/auth/google">
          <GoogleMark />
          <span>Sign in with Google</span>
        </a>
        <p className="login-fineprint">
          We only read your name, email, and avatar to identify your account.
        </p>
      </div>
    </div>
  );
}

function GoogleMark() {
  // Inline SVG so we don't pull in another icon dependency.
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.209 1.125-.8436 2.0782-1.7964 2.7164v2.2581h2.9087c1.7018-1.5668 2.6841-3.874 2.6841-6.6154z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.181l-2.9087-2.2581c-.806.54-1.8368.8595-3.0477.8595-2.344 0-4.3282-1.5832-5.0364-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.9636 10.71C3.7841 10.17 3.6818 9.5932 3.6818 9s.1023-1.17.2818-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.9636 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5814-2.5814C13.4632.8918 11.4259 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.9636 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}
