'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../lib/database';

export default function RegisterPage() {
  const router = useRouter();
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [confirm,  setConfirm]  = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({ email, password });
    setLoading(false);

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setError('Este email ya está registrado. Intentá iniciar sesión.');
      } else {
        setError(error.message);
      }
      return;
    }

    // Session available → email confirmation is off, user is already logged in
    if (data.session) {
      router.push('/');
      router.refresh();
      return;
    }

    // No session → email confirmation is on; send to login
    router.push('/login');
  };

  const INPUT =
    'w-full rounded-md border border-[#1e293b] bg-[#0d1520] px-3 py-2.5 text-sm ' +
    'text-slate-100 placeholder-slate-600 outline-none ' +
    'focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition';

  return (
    <div className="flex min-h-screen">

      {/* Left — register panel */}
      <div className="flex w-full flex-col justify-between bg-[#050a12] px-10 py-10 md:w-2/5">

        {/* Brand */}
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600">
              <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4 text-white">
                <path d="M3 17l5-5 4 4 9-9" stroke="currentColor" strokeWidth="2.2"
                  strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className="text-sm font-semibold tracking-wide text-slate-100">
              CFO Tech Partners
            </span>
          </div>
        </div>

        {/* Form */}
        <div className="mx-auto w-full max-w-sm">
          <h1 className="mb-1.5 text-2xl font-bold text-slate-50">Crear cuenta</h1>
          <p className="mb-8 text-sm text-slate-500">Accedé a tu panel de análisis financiero.</p>

          <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Correo electrónico
                  </label>
                  <input
                    type="email" value={email} required autoComplete="email"
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@empresa.com"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Contraseña
                  </label>
                  <input
                    type="password" value={password} required autoComplete="new-password"
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className={INPUT}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-medium text-slate-400">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password" value={confirm} required autoComplete="new-password"
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Repetí tu contraseña"
                    className={INPUT}
                  />
                </div>

                {error && (
                  <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    {error}
                  </p>
                )}

                <button
                  type="submit" disabled={loading}
                  className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-semibold
                             text-white transition hover:bg-blue-500 disabled:opacity-50
                             disabled:cursor-not-allowed"
                >
                  {loading ? 'Creando cuenta…' : 'Crear cuenta'}
                </button>
              </form>

              <p className="mt-6 text-center text-xs text-slate-600">
                ¿Ya tenés cuenta?{' '}
                <a href="/login"
                  className="text-blue-500 hover:text-blue-400 transition font-medium">
                  Iniciá sesión
                </a>
              </p>
        </div>

        <p className="text-xs text-slate-700">
          © {new Date().getFullYear()} CFO Tech Partners. Todos los derechos reservados.
        </p>
      </div>

      {/* Right — abstract visual */}
      <div className="relative hidden overflow-hidden bg-[#070e1a] md:flex md:w-3/5 items-center justify-center">

        {/* Mesh gradient layers */}
        <div className="absolute inset-0">
          <div className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full
                          bg-blue-600/10 blur-3xl animate-pulse" />
          <div className="absolute right-1/4 bottom-1/4 h-80 w-80 rounded-full
                          bg-indigo-500/8 blur-3xl animate-pulse [animation-delay:1s]" />
          <div className="absolute left-1/2 top-1/2 h-64 w-64 -translate-x-1/2 -translate-y-1/2
                          rounded-full bg-emerald-500/6 blur-3xl animate-pulse [animation-delay:2s]" />
        </div>

        {/* Abstract chart lines */}
        <svg viewBox="0 0 600 340" className="absolute inset-0 h-full w-full opacity-15"
          preserveAspectRatio="xMidYMid slice">
          <polyline points="0,280 80,240 160,200 240,160 300,140 380,100 460,80 540,60 600,40"
            fill="none" stroke="#3b82f6" strokeWidth="1.5" />
          <polyline points="0,320 80,300 160,280 240,250 300,240 380,220 460,200 540,180 600,160"
            fill="none" stroke="#f56565" strokeWidth="1.5" />
          <polyline points="0,300 600,300"
            fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="4 4" />
          {[0.25, 0.5, 0.75].map((t, i) => (
            <line key={i} x1="0" y1={340 * t} x2="600" y2={340 * t}
              stroke="#1e293b" strokeWidth="0.5" />
          ))}
        </svg>

        {/* Floating feature cards */}
        <div className="relative z-10 flex flex-col gap-4 text-left">
          {[
            { label: 'Análisis de Punto de Equilibrio', value: 'En segundos',    sub: 'para tu negocio',      color: 'text-emerald-400' },
            { label: 'Escenarios Guardados',            value: 'Ilimitados',     sub: 'en la nube',           color: 'text-blue-400'   },
            { label: 'Reportes PDF Profesionales',      value: 'Con un clic',    sub: 'listos para el cliente', color: 'text-amber-400' },
          ].map(({ label, value, sub, color }) => (
            <div key={label}
              className="rounded-xl border border-[#1e293b] bg-[#0d1520]/80 px-5 py-3.5 backdrop-blur-sm">
              <p className="text-xs text-slate-500">{label}</p>
              <p className={`text-xl font-bold font-mono ${color}`}>{value}</p>
              <p className="text-xs text-slate-600">{sub}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
