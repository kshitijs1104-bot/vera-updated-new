import { useState, useEffect } from 'react';
import {
  useGetGroqKeyStatus, useSaveGroqKey, useDeleteGroqKey,
  useGetOnboarding, useSaveOnboarding
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetGroqKeyStatusQueryKey, getGetOnboardingQueryKey } from '@workspace/api-client-react';
import { useCompanyFacts } from '../lib/venusApi';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: keyStatus } = useGetGroqKeyStatus();
  const { data: onboarding } = useGetOnboarding();
  const { data: factsData } = useCompanyFacts();
  const facts = factsData?.facts ?? [];

  const [apiKey, setApiKey] = useState('');
  
  const [formData, setFormData] = useState({
    companyName: '', stage: '', industry: '', teamSize: '', country: '', primaryGoal: ''
  });

  useEffect(() => {
    if (onboarding) {
      setFormData({
        companyName: onboarding.companyName || '',
        stage: onboarding.stage || '',
        industry: onboarding.industry || '',
        teamSize: onboarding.teamSize || '',
        country: onboarding.country || '',
        primaryGoal: onboarding.primaryGoal || ''
      });
    }
  }, [onboarding]);

  const saveKeyMutation = useSaveGroqKey({
    mutation: {
      onSuccess: () => {
        setApiKey('');
        queryClient.invalidateQueries({ queryKey: getGetGroqKeyStatusQueryKey() });
      }
    }
  });

  const deleteKeyMutation = useDeleteGroqKey({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetGroqKeyStatusQueryKey() });
      }
    }
  });

  const saveOnboardingMutation = useSaveOnboarding({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetOnboardingQueryKey() });
      }
    }
  });

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-12">
      <header>
        <h1 className="text-2xl font-syne font-bold text-white mb-2">Settings</h1>
        <p className="text-sm font-mono text-[var(--muted)]">Configure Vera Nexus core parameters.</p>
      </header>

      {/* Groq API Key Section */}
      <section className="bg-[var(--surface2)] border border-[var(--border)] rounded-xl p-8 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-[var(--indigo)] opacity-5 blur-[60px] pointer-events-none"></div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-lg font-syne font-bold text-white flex items-center gap-2 mb-1">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              Groq API Key
            </h2>
            <p className="text-xs text-[var(--muted)]">Configure your Groq API key to power Vera.</p>
          </div>
          {keyStatus?.configured ? (
            <span className="px-2 py-1 bg-[var(--mint)]/10 text-[var(--mint)] border border-[var(--mint)]/30 rounded text-[10px] uppercase font-mono tracking-wider font-bold">Configured</span>
          ) : (
            <span className="px-2 py-1 bg-[var(--surface3)] text-[var(--dim)] border border-[var(--border)] rounded text-[10px] uppercase font-mono tracking-wider">Not Configured</span>
          )}
        </div>

        {keyStatus?.configured ? (
          <div className="flex items-center justify-between bg-[var(--bg)] border border-[var(--border2)] rounded p-4">
            <div className="font-mono text-sm text-[var(--text)]">{keyStatus.maskedKey}</div>
            <button 
              onClick={() => deleteKeyMutation.mutate()}
              className="text-xs font-bold uppercase text-[var(--red)] hover:text-white transition-colors"
            >
              Remove
            </button>
          </div>
        ) : (
          <div className="flex gap-3">
            <input 
              type="password" 
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder="gsk_..." 
              className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded px-4 py-2 font-mono text-sm text-white focus:border-[var(--indigo)] outline-none"
            />
            <button 
              onClick={() => saveKeyMutation.mutate({ data: { apiKey } })}
              disabled={!apiKey || saveKeyMutation.isPending}
              className="bg-[var(--indigo)] hover:bg-[var(--indigo-light)] disabled:opacity-50 text-white font-bold uppercase text-xs tracking-wider px-6 rounded transition-colors"
            >
              Save Key
            </button>
          </div>
        )}
      </section>

      {/* Business Context */}
      <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8">
        <h2 className="text-lg font-syne font-bold text-white mb-1">Business Context</h2>
        <p className="text-xs text-[var(--muted)] mb-8">This context is sent to Vera with every request to calibrate analysis.</p>

        <form 
          className="space-y-6"
          onSubmit={e => {
            e.preventDefault();
            saveOnboardingMutation.mutate({ data: formData as any });
          }}
        >
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase text-[var(--dim)]">Company Name</label>
              <input 
                type="text" 
                value={formData.companyName}
                onChange={e => setFormData(p => ({...p, companyName: e.target.value}))}
                className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded px-4 py-2 text-sm text-white focus:border-[var(--indigo)] outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase text-[var(--dim)]">Stage</label>
              <select 
                value={formData.stage}
                onChange={e => setFormData(p => ({...p, stage: e.target.value}))}
                className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded px-4 py-2 text-sm text-white focus:border-[var(--indigo)] outline-none"
              >
                <option value="">Select Stage...</option>
                <option value="pre-seed">Pre-Seed</option>
                <option value="seed">Seed</option>
                <option value="series-a">Series A</option>
                <option value="series-b">Series B</option>
                <option value="growth">Growth</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase text-[var(--dim)]">Industry</label>
              <input 
                type="text" 
                value={formData.industry}
                onChange={e => setFormData(p => ({...p, industry: e.target.value}))}
                className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded px-4 py-2 text-sm text-white focus:border-[var(--indigo)] outline-none"
              />
            </div>
            <div className="space-y-2">
              <label className="text-xs font-mono uppercase text-[var(--dim)]">Team Size</label>
              <input 
                type="text" 
                value={formData.teamSize}
                onChange={e => setFormData(p => ({...p, teamSize: e.target.value}))}
                className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded px-4 py-2 text-sm text-white focus:border-[var(--indigo)] outline-none"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-mono uppercase text-[var(--dim)]">Primary Goal / Mission</label>
            <textarea 
              value={formData.primaryGoal}
              onChange={e => setFormData(p => ({...p, primaryGoal: e.target.value}))}
              className="w-full bg-[var(--surface2)] border border-[var(--border)] rounded px-4 py-3 text-sm text-white focus:border-[var(--indigo)] outline-none min-h-[100px] resize-none"
            />
          </div>

          <div className="flex justify-end pt-4 border-t border-[var(--border)]">
            <button 
              type="submit"
              disabled={saveOnboardingMutation.isPending}
              className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 font-bold uppercase text-xs tracking-wider px-6 py-2.5 rounded transition-colors"
            >
              {saveOnboardingMutation.isPending ? 'Saving...' : 'Save Context'}
            </button>
          </div>
        </form>
      </section>

      {/* What Vera Knows — read-only view of the structured Company Memory
          (company_facts table), separate from the free-text business context
          above. Each row is captured automatically from things you've told
          Venus in chat, not something you fill in by hand. */}
      {facts.length > 0 && (
        <section className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-8">
          <h2 className="text-lg font-syne font-bold text-white mb-1">What Vera Knows</h2>
          <p className="text-xs text-[var(--muted)] mb-6">
            Captured automatically from your conversations — this is what Venus factors into every answer, beyond the context above.
          </p>
          <ul className="space-y-2">
            {facts.map((fact) => (
              <li
                key={fact.id}
                className="flex items-start gap-3 text-sm text-[var(--muted)] bg-[var(--surface2)] border border-[var(--border)] rounded p-3"
              >
                <span className="text-[9px] font-mono uppercase tracking-wider text-[var(--dim)] shrink-0 mt-0.5 px-1.5 py-0.5 rounded bg-[var(--surface3)]">
                  {fact.factType}
                </span>
                <span className="text-white">{fact.factText}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
