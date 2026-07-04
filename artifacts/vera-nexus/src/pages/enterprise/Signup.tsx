import { useState } from 'react';
import { saveSignupData } from '../../lib/enterpriseGate';
import { useLocation } from 'wouter';

export function SignupGate() {
  const [, navigate] = useLocation();
  const [form, setForm] = useState({ name: '', email: '' });
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email) {
      setError('All fields are required.');
      return;
    }
    if (!form.email.includes('@')) {
      setError('Enter a valid email address.');
      return;
    }
    saveSignupData({ ...form, company: '' });
    navigate('/enterprise/onboarding');
  };

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center p-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 bg-[var(--mint)]/10 border border-[var(--mint)]/30 px-4 py-1.5 rounded-full text-xs font-mono text-[var(--mint)] uppercase tracking-widest mb-6">
            Enterprise Access · Gate 1 of 4
          </div>
          <h1 className="text-3xl font-syne font-extrabold text-white mb-3">Create Your Account</h1>
          <p className="text-sm text-[var(--muted)]">
            Venus AI is available exclusively to enterprise operators. Sign up to begin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8 space-y-5">
          {error && (
            <div className="bg-[var(--red)]/10 border border-[var(--red)]/30 text-[var(--red)] text-sm p-3 rounded font-mono">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-2">Full Name</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Jane Smith"
              className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-[var(--dim)] uppercase tracking-wider mb-2">Work Email</label>
            <input
              type="email"
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@company.com"
              className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded-lg px-4 py-3 text-sm text-[var(--text)] placeholder-[var(--dim)] focus:outline-none focus:border-[var(--indigo)] transition-colors"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[var(--indigo)] hover:bg-[var(--indigo-light)] text-white font-bold py-3 rounded-lg transition-colors text-sm uppercase tracking-wider mt-2"
          >
            Continue to Onboarding →
          </button>
        </form>

        <GateProgress current={0} />
      </div>
    </div>
  );
}

export function GateProgress({ current }: { current: number }) {
  return (
    <div className="flex justify-center gap-2 mt-8">
      {['Gate 1', 'Gate 2', 'Gate 3', 'Gate 4'].map((g, i) => (
        <div key={g} className={`text-[10px] font-mono px-2 py-1 rounded ${i <= current ? 'bg-[var(--indigo)] text-white' : 'bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]'}`}>
          {g}
        </div>
      ))}
    </div>
  );
}
