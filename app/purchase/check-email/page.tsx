export default function CheckEmailPage() {
  return (
    <main className="shell">
      <div className="phone">
        <section className="screen">
          <header className="topbar">
            <div className="brand">
              <span className="kicker">Purchase received</span>
              <div className="wordmark">Dark Drives<sup>TM</sup></div>
              <h1 className="title">The Dark Side of Saskatoon</h1>
            </div>
            <span className="status-pill">Email</span>
          </header>

          <div className="hero">
            <span className="stop-count">Server-side unlock</span>
            <h2 className="stop-name">Check your email</h2>
            <div className="distance">When Stripe confirms payment by signed webhook, we send your activation link. This page does not unlock the app.</div>
          </div>
        </section>
      </div>
    </main>
  );
}
