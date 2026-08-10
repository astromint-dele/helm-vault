// A plain link, not a JS click handler, deliberately: navigating to ?demoBlockThreshold=0
// is exactly the mechanism that already exists (see lib/navSentinel.js's threshold override
// and README), so this just makes it discoverable instead of adding a second, separate way
// to trigger the same thing. Honest about what it does, tightening the same real check
// rather than faking the result.
export default function DemoRefusalBanner() {
  return (
    <div className="demo-banner">
      <div className="demo-banner-text">
        <p className="demo-banner-title">See the price fairness check refuse a trade</p>
        <p className="demo-banner-line">
          This tightens the same check Helm always runs so it fires right now. Same code path as a real
          mispriced trade, an artificially strict limit rather than a faked result.
        </p>
      </div>
      <a className="btn-acknowledge demo-banner-btn" href="?demoBlockThreshold=0">
        See Helm refuse a trade
      </a>
    </div>
  );
}
