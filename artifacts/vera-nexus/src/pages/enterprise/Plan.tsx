import { useLocation } from 'wouter';
import { setGateStage } from '../../lib/enterpriseGate';

const FEATURES = [
  'Market Cause Mapping',
  'Decision Simulator',
  'Failure Pattern Matching',
  'Fundraising Intelligence',
  'Competitive Causal Radar',
  'Aurelian Forum access',
  'Unlimited Venus AI queries',
  'Priority response time',
];

export function PlanGate() {
  const [, navigate] = useLocation();

  const handleSelectPlan = () => {
    setGateStage('plan');
    navigate('/enterprise/checkout');
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[var(--mint)]/10 border border-[var(--mint)]/30 px-4 py-1.5 rounded-full text-xs font-mono text-[var(--mint)] uppercase tracking-widest mb-6">
            Enterprise Access · Gate 3 of 4
          </div>
          <h1 className="text-3xl font-syne font-extrabold text-white mb-3">Choose Your Plan</h1>
          <p className="text-sm text-[var(--muted)]">
            Venus AI Enterprise is built for operators who need signal, not noise.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6">
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 relative">
            <div className="text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-2">Starter</div>
            <div className="text-4xl font-syne font-extrabold text-white mb-1">$199<span className="text-lg font-normal text-[var(--muted)]">/mo</span></div>
            <div className="text-xs text-[var(--dim)] mb-6 font-mono">50 simulations · 5 users</div>
            <div className="space-y-3 mb-8">
              {FEATURES.slice(0, 5).map(f => (
                <div key={f} className="flex items-center gap-3 text-sm text-[var(--muted)]">
                  <span className="text-[var(--mint)] text-xs">✓</span>
                  {f}
                </div>
              ))}
              {FEATURES.slice(5).map(f => (
                <div key={f} className="flex items-center gap-3 text-sm text-[var(--dim)] opacity-40">
                  <span className="text-xs">–</span>
                  {f}
                </div>
              ))}
            </div>
            <button
              onClick={handleSelectPlan}
              className="w-full py-3 border border-[var(--indigo)] text-[var(--indigo)] hover:bg-[var(--indigo)] hover:text-white rounded-lg text-sm font-bold uppercase tracking-wider transition-all"
            >
              Select Starter
            </button>
          </div>

          <div className="bg-[var(--surface)] border border-[var(--mint)]/40 rounded-xl p-8 relative shadow-[0_0_30px_rgba(0,229,176,0.05)]">
            <div className="absolute top-4 right-4 bg-[var(--mint)] text-black text-[10px] font-bold uppercase px-2 py-0.5 rounded tracking-wider">Recommended</div>
            <div className="text-xs font-mono text-[var(--mint)] uppercase tracking-wider mb-2">Growth</div>
            <div className="text-4xl font-syne font-extrabold text-white mb-1">$299<span className="text-lg font-normal text-[var(--muted)]">/mo</span></div>
            <div className="text-xs text-[var(--dim)] mb-6 font-mono">Unlimited · 20 users</div>
            <div className="space-y-3 mb-8">
              {FEATURES.map(f => (
                <div key={f} className="flex items-center gap-3 text-sm text-[var(--text)]">
                  <span className="text-[var(--mint)] text-xs">✓</span>
                  {f}
                </div>
              ))}
            </div>
            <button
              onClick={handleSelectPlan}
              className="w-full py-3 bg-[var(--mint)] text-black hover:bg-opacity-90 rounded-lg text-sm font-bold uppercase tracking-wider transition-all"
            >
              Select Growth
            </button>
          </div>
        </div>

        <div className="flex justify-center gap-2 mt-8">
          {['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4'].map((g, i) => (
            <div key={g} className={`text-[10px] font-mono px-2 py-1 rounded ${i <= 2 ? 'bg-[var(--indigo)] text-white' : 'bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]'}`}>
              {g}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
