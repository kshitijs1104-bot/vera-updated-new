import { Link, useLocation } from 'wouter';
import { useCategory } from '../../lib/CategoryContext';
import { Settings, ChevronDown, User } from 'lucide-react';

const CATEGORIES = ['all', 'technology', 'finance', 'markets', 'health'] as const;

export function Topbar() {
  const [location] = useLocation();
  const { category, setCategory, tier, setTier } = useCategory();

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg)]/80 backdrop-blur-md border-b border-[var(--border)] h-16 flex items-center justify-between px-6">
      <div className="flex items-center gap-8">
        <Link href="/line" className="font-syne font-extrabold text-xl tracking-tight">
          Vera Nex<span className="text-[var(--mint)]">us</span>
        </Link>

        <nav className="flex items-center gap-1 font-medium text-sm">
          {[
            { href: '/line', label: 'Line' },
            { href: '/sight', label: 'Sight' },
            { href: '/crypt', label: 'Crypt' },
            { href: '/thoughts', label: 'Thoughts Hub' },
            { href: '/venus', label: 'Venus AI' },
          ].map(tab => (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-1.5 rounded-md transition-colors ${
                location === tab.href || (location === '/' && tab.href === '/line')
                  ? 'bg-[var(--surface2)] text-white'
                  : 'text-[var(--muted)] hover:text-white hover:bg-[var(--surface)]'
              }`}
            >
              {tab.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-6">
        <div className="relative group cursor-pointer">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-white transition-colors bg-[var(--surface)] px-3 py-1.5 rounded border border-[var(--border)]">
            <span className="w-2 h-2 rounded-full bg-[var(--indigo)]"></span>
            <span className="uppercase">{category}</span>
            <ChevronDown className="w-4 h-4" />
          </div>
          <div className="absolute top-full mt-2 w-40 bg-[var(--surface2)] border border-[var(--border)] rounded shadow-xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-opacity z-50">
            {CATEGORIES.map(cat => (
              <div 
                key={cat}
                onClick={() => setCategory(cat as any)}
                className="px-4 py-2 text-sm uppercase cursor-pointer hover:bg-[var(--surface3)] text-[var(--text)] transition-colors"
              >
                {cat}
              </div>
            ))}
          </div>
        </div>

        <div className="flex bg-[var(--surface)] p-1 rounded-lg border border-[var(--border)]">
          <button 
            onClick={() => setTier('Personal')}
            className={`px-3 py-1 text-xs font-bold rounded uppercase transition-colors ${tier === 'Personal' ? 'bg-[var(--indigo)] text-white' : 'text-[var(--muted)] hover:text-white'}`}
          >
            Personal
          </button>
          <button 
            onClick={() => setTier('Enterprise')}
            className={`px-3 py-1 text-xs font-bold rounded uppercase transition-colors ${tier === 'Enterprise' ? 'bg-[var(--mint)] text-black' : 'text-[var(--muted)] hover:text-white'}`}
          >
            Enterprise
          </button>
        </div>

        <div className="flex items-center gap-4 border-l border-[var(--border)] pl-6">
          <Link href="/settings" className="text-[var(--muted)] hover:text-white transition-colors">
            <Settings className="w-5 h-5" />
          </Link>
          <button className="flex items-center gap-2 text-sm font-medium text-[var(--muted)] hover:text-white transition-colors">
            <User className="w-5 h-5" />
            Sign in
          </button>
        </div>
      </div>
    </header>
  );
}
