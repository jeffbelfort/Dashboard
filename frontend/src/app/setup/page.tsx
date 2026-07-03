'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const C = {
  bg: '#0a0c0a', bgCard: '#0d100d', bgInner: '#0b0f0b',
  border: '#1e2e1e', borderMid: '#2a3a2a',
  green: '#4ade80', greenDim: '#8bc88b', greenMuted: '#3a5a3a', greenFaint: '#141c14',
  amber: '#fbbf24', red: '#ef4444', cyan: '#22d3ee', purple: '#a78bfa',
  text: '#c8d8c0', textMuted: '#5a7a5a',
};

interface SetupData {
  city: string;
  latitude: string;
  longitude: string;
  spotify: { enabled: boolean; clientId: string; clientSecret: string; };
  alerts: { cpuLoad: number; cpuTemp: number; memPercent: number; gpuLoad: number; gpuTemp: number; diskPercent: number; };
  auth: { enabled: boolean; password: string; confirmPassword: string; twoFactorEnabled: boolean; totpSecret: string; };
}

const DEFAULT: SetupData = {
  city: '',
  latitude: '',
  longitude: '',
  spotify: { enabled: false, clientId: '', clientSecret: '' },
  alerts: { cpuLoad: 90, cpuTemp: 85, memPercent: 90, gpuLoad: 90, gpuTemp: 85, diskPercent: 90 },
  auth: { enabled: false, password: '', confirmPassword: '', twoFactorEnabled: false, totpSecret: '' },
};

const STEPS = ['WELCOME', 'LOCATION', 'SPOTIFY', 'ALERTS', 'SECURITY', 'CONFIRM'];

// ── Shared input component ─────────────────────────────────────────────────
function Input({ label, value, onChange, placeholder, type = 'text', hint }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; type?: string; hint?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      <label style={{ fontSize: '9px', color: C.greenMuted, letterSpacing: '0.18em', fontFamily: 'monospace', textTransform: 'uppercase' }}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          background: C.bgInner, border: `1px solid ${C.border}`, color: C.text,
          padding: '9px 12px', fontSize: '11px', fontFamily: 'monospace',
          outline: 'none', width: '100%', boxSizing: 'border-box',
          transition: 'border-color 0.15s',
        }}
        onFocus={e => e.target.style.borderColor = C.green}
        onBlur={e => e.target.style.borderColor = C.border}
      />
      {hint && <div style={{ fontSize: '9px', color: C.textMuted, fontFamily: 'monospace' }}>{hint}</div>}
    </div>
  );
}

// ── Toggle ─────────────────────────────────────────────────────────────────
function Toggle({ label, value, onChange, description }: { label: string; value: boolean; onChange: (v: boolean) => void; description?: string; }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px' }}>
      <div>
        <div style={{ fontSize: '11px', color: C.text, fontFamily: 'monospace' }}>{label}</div>
        {description && <div style={{ fontSize: '9px', color: C.textMuted, fontFamily: 'monospace', marginTop: '3px' }}>{description}</div>}
      </div>
      <button onClick={() => onChange(!value)} style={{
        width: '44px', height: '22px', border: `1px solid ${value ? C.green : C.border}`,
        background: value ? `${C.green}20` : 'none', cursor: 'pointer',
        position: 'relative', flexShrink: 0, transition: 'all 0.2s',
      }}>
        <div style={{
          position: 'absolute', top: '3px', width: '14px', height: '14px',
          background: value ? C.green : C.greenMuted,
          left: value ? '25px' : '3px', transition: 'all 0.2s',
        }}/>
      </button>
    </div>
  );
}

// ── Slider ─────────────────────────────────────────────────────────────────
function Slider({ label, value, onChange, min, max, unit }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; unit: string; }) {
  const pct = ((value - min) / (max - min)) * 100;
  const color = pct > 80 ? C.red : pct > 60 ? C.amber : C.green;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '10px', color: C.text, fontFamily: 'monospace' }}>{label}</span>
        <span style={{ fontSize: '10px', color: color, fontFamily: 'monospace' }}>{value}{unit}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: color, cursor: 'pointer' }}/>
    </div>
  );
}

// ── Steps ──────────────────────────────────────────────────────────────────
function WelcomeStep() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', alignItems: 'center', textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: '11px', color: C.greenMuted, letterSpacing: '0.3em', fontFamily: 'monospace' }}>WELCOME TO</div>
      <div style={{ fontSize: '40px', color: C.green, letterSpacing: '0.2em', fontFamily: 'monospace', textShadow: `0 0 30px ${C.green}40`, lineHeight: 1 }}>SYS.MONITOR</div>
      <div style={{ fontSize: '11px', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.8, maxWidth: '400px' }}>
        A self-hosted real-time system monitoring dashboard.<br/>
        This wizard will get you set up in about 2 minutes.<br/>
        Your config stays on your machine — nothing is sent anywhere.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%', maxWidth: '300px' }}>
        {[['01', 'Location & weather'], ['02', 'Spotify integration'], ['03', 'Alert thresholds'], ['04', 'Security']].map(([n, l]) => (
          <div key={n} style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '8px 12px', border: `1px solid ${C.border}`, textAlign: 'left' }}>
            <span style={{ fontSize: '9px', color: C.greenMuted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>{n}</span>
            <span style={{ fontSize: '10px', color: C.text, fontFamily: 'monospace' }}>{l}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LocationStep({ data, onChange }: { data: SetupData; onChange: (d: SetupData) => void; }) {
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const search = async () => {
    if (!searchTerm.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`http://127.0.0.1:3001/api/geocode?city=${encodeURIComponent(searchTerm)}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    }
    setSearching(false);
  };

  const pick = (r: any) => {
    onChange({ ...data, city: r.name + (r.country ? `, ${r.country}` : ''), latitude: String(r.latitude), longitude: String(r.longitude) });
    setResults([]);
    setSearchTerm('');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '10px', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.6 }}>
        Used for the weather widget. Search for your city or enter coordinates manually.
      </div>

      {/* City search */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
        <label style={{ fontSize: '9px', color: C.greenMuted, letterSpacing: '0.18em', fontFamily: 'monospace', textTransform: 'uppercase' }}>SEARCH CITY</label>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && search()}
            placeholder="Sheffield, London, New York..."
            style={{ flex: 1, background: C.bgInner, border: `1px solid ${C.border}`, color: C.text, padding: '9px 12px', fontSize: '11px', fontFamily: 'monospace', outline: 'none' }}
          />
          <button onClick={search} disabled={searching} style={{ padding: '9px 16px', background: 'none', border: `1px solid ${C.green}`, color: C.green, cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.1em' }}>
            {searching ? '...' : 'SEARCH'}
          </button>
        </div>
        {results.length > 0 && (
          <div style={{ border: `1px solid ${C.border}`, background: C.bgCard }}>
            {results.map((r, i) => (
              <button key={i} onClick={() => pick(r)} style={{ display: 'block', width: '100%', padding: '8px 12px', background: 'none', border: 'none', borderBottom: i < results.length - 1 ? `1px solid ${C.border}` : 'none', color: C.text, cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = C.greenFaint)}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                {r.name}{r.admin1 ? `, ${r.admin1}` : ''}{r.country ? `, ${r.country}` : ''} <span style={{ color: C.textMuted, fontSize: '9px' }}>({r.latitude.toFixed(2)}, {r.longitude.toFixed(2)})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <Input label="City Name" value={data.city} onChange={v => onChange({ ...data, city: v })} placeholder="Sheffield"/>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          <Input label="Latitude" value={data.latitude} onChange={v => onChange({ ...data, latitude: v })} placeholder="53.3811"/>
          <Input label="Longitude" value={data.longitude} onChange={v => onChange({ ...data, longitude: v })} placeholder="-1.4701"/>
        </div>
      </div>

      {data.city && data.latitude && data.longitude && (
        <div style={{ padding: '10px 12px', border: `1px solid ${C.green}40`, background: `${C.green}08`, fontSize: '10px', color: C.green, fontFamily: 'monospace' }}>
          ✓ {data.city} ({data.latitude}, {data.longitude})
        </div>
      )}
    </div>
  );
}

function SpotifyStep({ data, onChange }: { data: SetupData; onChange: (d: SetupData) => void; }) {
  const sp = data.spotify;
  const set = (k: string, v: any) => onChange({ ...data, spotify: { ...sp, [k]: v } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <Toggle
        label="Enable Spotify Integration"
        value={sp.enabled}
        onChange={v => set('enabled', v)}
        description="Shows currently playing track with controls"
      />

      {sp.enabled && (
        <>
          <div style={{ padding: '12px', border: `1px solid ${C.border}`, background: C.bgInner, fontSize: '9px', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.8 }}>
            <div style={{ color: C.amber, marginBottom: '6px', letterSpacing: '0.1em' }}>HOW TO GET SPOTIFY CREDENTIALS</div>
            1. Go to <span style={{ color: C.cyan }}>developer.spotify.com/dashboard</span><br/>
            2. Click "Create app"<br/>
            3. Set redirect URI to: <span style={{ color: C.green }}>http://127.0.0.1:3001/callback</span><br/>
            4. Copy your Client ID and Client Secret below
          </div>
          <Input label="Client ID" value={sp.clientId} onChange={v => set('clientId', v)} placeholder="89e440d5f5e74654a355435a808b2a94"/>
          <Input label="Client Secret" value={sp.clientSecret} onChange={v => set('clientSecret', v)} placeholder="Your client secret" type="password"/>
          {sp.clientId && sp.clientSecret && (
            <div style={{ padding: '10px 12px', border: `1px solid ${C.green}40`, background: `${C.green}08`, fontSize: '10px', color: C.green, fontFamily: 'monospace' }}>
              ✓ Credentials entered — after setup visit /spotify/auth to connect your account
            </div>
          )}
        </>
      )}

      {!sp.enabled && (
        <div style={{ fontSize: '10px', color: C.textMuted, fontFamily: 'monospace' }}>
          You can enable this later by re-running setup or editing config.ts directly.
        </div>
      )}
    </div>
  );
}

function AlertsStep({ data, onChange }: { data: SetupData; onChange: (d: SetupData) => void; }) {
  const al = data.alerts;
  const set = (k: string, v: number) => onChange({ ...data, alerts: { ...al, [k]: v } });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ fontSize: '10px', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.6 }}>
        Alerts flash on the dashboard when these thresholds are exceeded.
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <Slider label="CPU Load" value={al.cpuLoad} onChange={v => set('cpuLoad', v)} min={50} max={100} unit="%"/>
        <Slider label="CPU Temperature" value={al.cpuTemp} onChange={v => set('cpuTemp', v)} min={50} max={100} unit="°C"/>
        <Slider label="Memory Usage" value={al.memPercent} onChange={v => set('memPercent', v)} min={50} max={100} unit="%"/>
        <Slider label="GPU Load" value={al.gpuLoad} onChange={v => set('gpuLoad', v)} min={50} max={100} unit="%"/>
        <Slider label="GPU Temperature" value={al.gpuTemp} onChange={v => set('gpuTemp', v)} min={50} max={100} unit="°C"/>
        <Slider label="Disk Usage" value={al.diskPercent} onChange={v => set('diskPercent', v)} min={50} max={100} unit="%"/>
      </div>
    </div>
  );
}

function SecurityStep({ data, onChange }: { data: SetupData; onChange: (d: SetupData) => void; }) {
  const auth = data.auth;
  const set = (k: string, v: any) => onChange({ ...data, auth: { ...auth, [k]: v } });
  const passwordMatch = auth.password === auth.confirmPassword;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '10px', color: C.textMuted, fontFamily: 'monospace', lineHeight: 1.6 }}>
        Optional — only needed if you plan to access the dashboard from other devices on your network.
        If you're only using it locally, skip this step.
      </div>

      <Toggle
        label="Enable Password Protection"
        value={auth.enabled}
        onChange={v => set('enabled', v)}
        description="Requires login before accessing the dashboard"
      />

      {auth.enabled && (
        <>
          <Input label="Password" value={auth.password} onChange={v => set('password', v)} type="password" placeholder="Choose a strong password"/>
          <Input label="Confirm Password" value={auth.confirmPassword} onChange={v => set('confirmPassword', v)} type="password" placeholder="Repeat password"/>

          {auth.password && !passwordMatch && (
            <div style={{ fontSize: '10px', color: C.red, fontFamily: 'monospace' }}>✗ Passwords do not match</div>
          )}
          {auth.password && passwordMatch && (
            <div style={{ fontSize: '10px', color: C.green, fontFamily: 'monospace' }}>✓ Passwords match</div>
          )}

          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: '16px' }}>
            <Toggle
              label="Enable Two-Factor Authentication"
              value={auth.twoFactorEnabled}
              onChange={v => set('twoFactorEnabled', v)}
              description="Requires Google Authenticator code on login"
            />
            {auth.twoFactorEnabled && (
              <div style={{ marginTop: '10px', padding: '10px 12px', border: `1px solid ${C.amber}40`, background: `${C.amber}08`, fontSize: '9px', color: C.amber, fontFamily: 'monospace', lineHeight: 1.8 }}>
                After setup completes, visit <span style={{ color: C.green }}>/setup/2fa</span> to scan your QR code with Google Authenticator.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ConfirmStep({ data }: { data: SetupData; }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ fontSize: '10px', color: C.textMuted, fontFamily: 'monospace' }}>Review your settings before saving.</div>

      {[
        ['LOCATION', data.city ? `${data.city} (${data.latitude}, ${data.longitude})` : 'Not set'],
        ['SPOTIFY', data.spotify.enabled ? (data.spotify.clientId ? 'Enabled with credentials' : 'Enabled — credentials missing') : 'Disabled'],
        ['ALERTS', `CPU ${data.alerts.cpuLoad}% / Temp ${data.alerts.cpuTemp}°C / Mem ${data.alerts.memPercent}% / GPU ${data.alerts.gpuLoad}% / Disk ${data.alerts.diskPercent}%`],
        ['SECURITY', data.auth.enabled ? `Password set${data.auth.twoFactorEnabled ? ' + 2FA' : ''}` : 'No authentication (local only)'],
      ].map(([k, v]) => (
        <div key={k} style={{ padding: '12px', border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: '8px', color: C.greenMuted, letterSpacing: '0.18em', fontFamily: 'monospace', marginBottom: '5px' }}>{k}</div>
          <div style={{ fontSize: '10px', color: C.text, fontFamily: 'monospace' }}>{v}</div>
        </div>
      ))}

      <div style={{ padding: '10px 12px', border: `1px solid ${C.green}40`, background: `${C.green}08`, fontSize: '9px', color: C.green, fontFamily: 'monospace', lineHeight: 1.6 }}>
        Config will be saved to backend/src/config.ts<br/>
        This file is gitignored — your credentials are safe.<br/>
        The backend will restart automatically.
      </div>
    </div>
  );
}

// ── Main Setup Page ────────────────────────────────────────────────────────
export default function SetupPage() {
  const [step, setStep] = useState(0);
  const [data, setData] = useState<SetupData>(DEFAULT);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // Check if setup already done
  useEffect(() => {
    fetch('http://127.0.0.1:3001/api/setup/status')
      .then(r => r.json())
      .then(d => { if (!d.setupRequired) router.push('/'); })
      .catch(() => {});
  }, [router]);

  const canProceed = () => {
    if (step === 1) return data.city && data.latitude && data.longitude;
    if (step === 3) return true;
    if (step === 4 && data.auth.enabled) return data.auth.password && data.auth.password === data.auth.confirmPassword;
    return true;
  };

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const payload = {
        city: data.city,
        latitude: parseFloat(data.latitude),
        longitude: parseFloat(data.longitude),
        spotify: data.spotify,
        alerts: data.alerts,
        auth: {
          enabled: data.auth.enabled,
          password: data.auth.password,
          totpSecret: '',
          twoFactorEnabled: data.auth.twoFactorEnabled,
        },
      };
      const res = await fetch('http://127.0.0.1:3001/api/setup/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.ok) {
        setSaved(true);
      } else {
        setError(result.error ?? 'Unknown error');
      }
    } catch (e) {
      setError('Could not reach backend. Is it running?');
    }
    setSaving(false);
  };

  const stepContent = [
    <WelcomeStep key="welcome"/>,
    <LocationStep key="location" data={data} onChange={setData}/>,
    <SpotifyStep key="spotify" data={data} onChange={setData}/>,
    <AlertsStep key="alerts" data={data} onChange={setData}/>,
    <SecurityStep key="security" data={data} onChange={setData}/>,
    <ConfirmStep key="confirm" data={data}/>,
  ];

  if (saved) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
      <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'center' }}>
        <div style={{ fontSize: '40px', color: C.green, textShadow: `0 0 20px ${C.green}40` }}>✓</div>
        <div style={{ fontSize: '14px', color: C.green, letterSpacing: '0.2em' }}>SETUP COMPLETE</div>
        <div style={{ fontSize: '10px', color: C.textMuted, lineHeight: 1.8 }}>
          Config saved. The backend is restarting.<br/>
          Wait a few seconds then click below.
        </div>
        <button onClick={() => router.push('/')} style={{ padding: '10px 24px', border: `1px solid ${C.green}`, color: C.green, background: 'none', cursor: 'pointer', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.15em', marginTop: '8px' }}>
          OPEN DASHBOARD →
        </button>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        ::-webkit-scrollbar { width: 3px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.borderMid}; }
        input[type=range] { height: 4px; }
      `}</style>
      <div style={{ minHeight: '100vh', background: C.bg, color: C.text, fontFamily: 'monospace', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>

        {/* Progress bar */}
        <div style={{ width: '100%', maxWidth: '520px', marginBottom: '32px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            {STEPS.map((s, i) => (
              <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{ width: '20px', height: '20px', border: `1px solid ${i <= step ? C.green : C.border}`, background: i < step ? C.green : i === step ? `${C.green}20` : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {i < step
                    ? <span style={{ fontSize: '9px', color: C.bg }}>✓</span>
                    : <span style={{ fontSize: '8px', color: i === step ? C.green : C.greenMuted }}>{i + 1}</span>
                  }
                </div>
                <span style={{ fontSize: '7px', color: i === step ? C.green : C.textMuted, letterSpacing: '0.1em' }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ width: '100%', height: '1px', background: C.border }}>
            <div style={{ height: '100%', width: `${(step / (STEPS.length - 1)) * 100}%`, background: C.green, transition: 'width 0.3s ease' }}/>
          </div>
        </div>

        {/* Card */}
        <div style={{ width: '100%', maxWidth: '520px', background: C.bgCard, border: `1px solid ${C.borderMid}` }}>
          <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '2px', height: '14px', background: C.green }}/>
            <span style={{ fontSize: '10px', letterSpacing: '0.2em', color: C.green }}>{STEPS[step]}</span>
          </div>
          <div style={{ padding: '24px 20px', minHeight: '280px' }}>
            {stepContent[step]}
          </div>
          <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button
              onClick={() => setStep(s => Math.max(0, s - 1))}
              disabled={step === 0}
              style={{ padding: '8px 16px', border: `1px solid ${step === 0 ? C.border : C.borderMid}`, color: step === 0 ? C.greenMuted : C.text, background: 'none', cursor: step === 0 ? 'default' : 'pointer', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.12em' }}>
              ← BACK
            </button>

            {error && <div style={{ fontSize: '9px', color: C.red, fontFamily: 'monospace', flex: 1, textAlign: 'center', padding: '0 12px' }}>{error}</div>}

            {step < STEPS.length - 1
              ? <button
                  onClick={() => setStep(s => s + 1)}
                  disabled={!canProceed()}
                  style={{ padding: '8px 16px', border: `1px solid ${canProceed() ? C.green : C.border}`, color: canProceed() ? C.green : C.greenMuted, background: canProceed() ? `${C.green}10` : 'none', cursor: canProceed() ? 'pointer' : 'default', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.12em' }}>
                  NEXT →
                </button>
              : <button
                  onClick={save}
                  disabled={saving}
                  style={{ padding: '8px 20px', border: `1px solid ${C.green}`, color: C.bg, background: C.green, cursor: saving ? 'default' : 'pointer', fontFamily: 'monospace', fontSize: '10px', letterSpacing: '0.12em' }}>
                  {saving ? 'SAVING...' : 'SAVE & LAUNCH'}
                </button>
            }
          </div>
        </div>

        <div style={{ marginTop: '16px', fontSize: '8px', color: C.textMuted, fontFamily: 'monospace', letterSpacing: '0.1em' }}>
          SYS.MONITOR — config stays local, never leaves your machine
        </div>
      </div>
    </>
  );
}
