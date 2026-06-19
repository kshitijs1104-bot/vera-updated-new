import { useState } from 'react';
import { saveOnboardingData, type OnboardingData } from '../../lib/enterpriseGate';
import { useLocation } from 'wouter';

const STAGES = [
  { value: 'pre-seed', label: 'Pre-Seed' },
  { value: 'seed', label: 'Seed' },
  { value: 'series-a', label: 'Series A' },
  { value: 'series-b+', label: 'Series B+' },
];

const USE_CASES = [
  { value: 'risk-analysis', label: 'Risk Analysis', desc: 'Identify what could go wrong before it does' },
  { value: 'roadmap', label: 'Roadmap Simulation', desc: 'Stress-test your product and growth plans' },
  { value: 'fundraising', label: 'Fundraising Intelligence', desc: 'Prepare for investor conversations with data' },
  { value: 'mentorship', label: 'Strategic Mentorship', desc: 'Get advisory-level direction on key decisions' },
];

export function OnboardingGate() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState<Omit<OnboardingData, 'stage' | 'useCase'> & { stage: string; useCase: string }>({
    companyName: '',
    stage: '',
    role: '',
    useCase: '',
  });

  const isValid = form.companyName && form.stage && form.role && form.useCase;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    saveOnboardingData(form as OnboardingData);
    navigate('/enterprise/plan');
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[var(--mint)]/10 border border-[var(--mint)]/30 px-4 py-1.5 rounded-full text-xs font-mono text-[var(--mint)] uppercase tracking-widest mb-6">
            Enterprise Access · Gate 2 of 4
          </div>
          <h1 className="text-3xl font-syne font-extrabold text-white mb-3">Tell Venus About You</h1>
          <p className="text-sm text-[var(--muted)]">
            Venus AI calibrates every response to your company stage, role, and goals.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-2">Company Name</label>
              <input
                type="text"
                value={form.companyName}
                onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))}
                placeholder="Acme AI"
                className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-2">Your Role</label>
              <input
                type="text"
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                placeholder="Founder / CEO / CFO"
                className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-4 py-2.5 text-sm text-[var(--text)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-3">Company Stage</label>
            <div className="grid grid-cols-4 gap-2">
              {STAGES.map(s => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, stage: s.value }))}
                  className={`py-2 text-xs font-bold rounded-lg border transition-all uppercase tracking-wide ${
                    form.stage === s.value
                      ? 'bg-[var(--indigo)] border-[var(--indigo)] text-white'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--indigo)]/50 hover:text-white'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-3">Primary Use Case</label>
            <div className="grid grid-cols-2 gap-3">
              {USE_CASES.map(uc => (
                <button
                  key={uc.value}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, useCase: uc.value }))}
                  className={`p-4 text-left rounded-lg border transition-all ${
                    form.useCase === uc.value
                      ? 'bg-[var(--indigo)]/20 border-[var(--indigo)] text-white'
                      : 'border-[var(--border)] text-[var(--muted)] hover:border-[var(--border2)] hover:text-white bg-[var(--surface2)]'
                  }`}
                >
                  <div className="text-sm font-bold mb-1">{uc.label}</div>
                  <div className="text-[11px] opacity-70 leading-relaxed">{uc.desc}</div>
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={!isValid}
            className="w-full bg-[var(--indigo)] hover:bg-[var(--indigo-light)] disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors text-sm uppercase tracking-wider"
          >
            Continue to Plan →
          </button>
        </form>

        <div className="flex justify-center gap-2 mt-8">
          {['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4'].map((g, i) => (
            <div key={g} className={`text-[10px] font-mono px-2 py-1 rounded ${i <= 1 ? 'bg-[var(--indigo)] text-white' : 'bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]'}`}>
              {g}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
