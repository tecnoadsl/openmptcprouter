'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AuthGuard from './components/AuthGuard'

const API = 'http://localhost:8000'

export default function Page() {
  return (
    <AuthGuard title="OMR Platform Cloud">
      {({ token, logout }) => <CloudDashboard token={token} logout={logout} />}
    </AuthGuard>
  )
}

function CloudDashboard({ token, logout }) {
  const [page, setPage] = useState('dashboard')
  const [stats, setStats] = useState({})
  const [devices, setDevices] = useState([])
  const [telemetry, setTelemetry] = useState({})
  const [alerts, setAlerts] = useState([])
  const [tenants, setTenants] = useState([])
  const [orgs, setOrgs] = useState([])
  const [sites, setSites] = useState([])
  const [selectedDevice, setSelectedDevice] = useState(null)
  const [showProvision, setShowProvision] = useState(false)
  const [showCreateTenant, setShowCreateTenant] = useState(false)
  const [showCreateOrg, setShowCreateOrg] = useState(false)
  const [showCreateSite, setShowCreateSite] = useState(false)

  // WebSocket telemetria + alert
  useEffect(() => {
    const wsTel = new WebSocket(`ws://localhost:8000/ws/telemetry`)
    wsTel.onmessage = (e) => {
      const d = JSON.parse(e.data)
      setTelemetry(prev => ({ ...prev, [d._device_id]: d }))
    }
    const wsAlert = new WebSocket(`ws://localhost:8000/ws/alerts`)
    wsAlert.onmessage = (e) => {
      const a = JSON.parse(e.data)
      setAlerts(prev => [a, ...prev.slice(0, 99)])
    }
    // Polling dati
    const interval = setInterval(() => {
      fetchStats()
      fetchDevices()
    }, 10000)
    fetchStats()
    fetchDevices()
    fetchTenants()
    fetchOrgs()
    fetchSites()
    return () => { wsTel.close(); wsAlert.close(); clearInterval(interval) }
  }, [token])

  const headers = () => ({ 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' })


  async function fetchStats() {
    try { const r = await fetch(`${API}/manage/stats`, { headers: headers() }); setStats(await r.json()) } catch (e) {}
  }
  async function fetchDevices() {
    try { const r = await fetch(`${API}/devices/`, { headers: headers() }); const d = await r.json(); setDevices(d.devices || []) } catch (e) {}
  }
  async function fetchTenants() {
    try { const r = await fetch(`${API}/manage/tenants`, { headers: headers() }); const d = await r.json(); setTenants(d.tenants || []) } catch (e) {}
  }
  async function fetchOrgs() {
    try { const r = await fetch(`${API}/manage/organizations`, { headers: headers() }); const d = await r.json(); setOrgs(d.organizations || []) } catch (e) {}
  }
  async function fetchSites() {
    try { const r = await fetch(`${API}/manage/sites`, { headers: headers() }); const d = await r.json(); setSites(d.sites || []) } catch (e) {}
  }

  async function sendCommand(deviceId, type, payload = {}) {
    try {
      await fetch(`${API}/devices/${deviceId}/command`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ command_type: type, payload }),
      })
    } catch (e) {}
  }

  async function createResource(endpoint, data) {
    try {
      const r = await fetch(`${API}/manage/${endpoint}`, {
        method: 'POST', headers: headers(), body: JSON.stringify(data),
      })
      return await r.json()
    } catch (e) { return null }
  }

  async function provisionDevice(data) {
    try {
      const r = await fetch(`${API}/devices/`, {
        method: 'POST', headers: headers(), body: JSON.stringify(data),
      })
      return await r.json()
    } catch (e) { return null }
  }

  const nav = [
    { id: 'dashboard', label: 'Dashboard', icon: '\u25A0' },
    { id: 'devices', label: 'Dispositivi', icon: '\u25CF' },
    { id: 'alerts', label: 'Alert', icon: '\u26A0' },
    { id: 'tenants', label: 'Tenant', icon: '\u2302' },
    { id: 'provision', label: 'Provisioning', icon: '+' },
  ]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: '#0f172a' }}>
      {/* Sidebar */}
      <nav style={{ width: 220, background: '#1e293b', borderRight: '1px solid #334155', padding: '20px 0', flexShrink: 0 }}>
        <div style={{ padding: '0 16px', marginBottom: 24 }}>
          <h1 style={{ color: '#fff', fontSize: 18, margin: 0 }}>OMR Platform</h1>
          <p style={{ color: '#3b82f6', fontSize: 12, margin: '4px 0 0' }}>Tecnoadsl Cloud</p>
        </div>
        {nav.map(n => (
          <div key={n.id} onClick={() => setPage(n.id)} style={{
            padding: '10px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
            background: page === n.id ? '#334155' : 'transparent',
            color: page === n.id ? '#fff' : '#94a3b8', fontSize: 13, fontWeight: page === n.id ? 600 : 400,
            borderLeft: page === n.id ? '3px solid #3b82f6' : '3px solid transparent',
          }}>
            <span style={{ fontSize: 14 }}>{n.icon}</span> {n.label}
            {n.id === 'alerts' && alerts.length > 0 && (
              <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 10, marginLeft: 'auto' }}>{alerts.length}</span>
            )}
          </div>
        ))}
        {/* Device count */}
        <div style={{ padding: '20px 16px', borderTop: '1px solid #334155', marginTop: 20 }}>
          <p style={{ color: '#64748b', fontSize: 11, margin: '0 0 8px' }}>ONLINE</p>
          <div style={{ display: 'flex', gap: 12 }}>
            <div>
              <p style={{ color: '#22c55e', fontSize: 20, fontWeight: 700, margin: 0 }}>{Object.keys(telemetry).length}</p>
              <p style={{ color: '#64748b', fontSize: 10, margin: 0 }}>Dispositivi</p>
            </div>
          </div>
        </div>
        <div style={{ padding: '12px 16px', borderTop: '1px solid #334155' }}>
          <button onClick={logout} style={{ padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', background: '#334155', width: '100%' }}>Esci</button>
        </div>
      </nav>

      {/* Main */}
      <main style={{ flex: 1, padding: 24, overflowY: 'auto' }}>

        {/* === DASHBOARD === */}
        {page === 'dashboard' && (
          <>
            <h2 style={pageTitle}>Dashboard</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Dispositivi Online', value: Object.keys(telemetry).length, total: stats.devices_total, color: '#22c55e' },
                { label: 'Router', value: Object.values(telemetry).filter(t => t.device_type === 'router').length, total: stats.routers, color: '#3b82f6' },
                { label: 'VPS', value: Object.values(telemetry).filter(t => t.device_type === 'vps').length, total: stats.vpss, color: '#a855f7' },
                { label: 'Alert Attivi', value: alerts.length, color: '#ef4444' },
              ].map(s => (
                <Card key={s.label}>
                  <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>{s.label}</p>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
                    <p style={{ color: s.color, fontSize: 32, fontWeight: 700, margin: '4px 0 0' }}>{s.value}</p>
                    {s.total != null && <p style={{ color: '#64748b', fontSize: 14, margin: 0 }}>/ {s.total}</p>}
                  </div>
                </Card>
              ))}
            </div>

            {/* Device list con telemetria real-time */}
            <Card>
              <h3 style={sectionTitle}>Dispositivi Real-time</h3>
              {Object.entries(telemetry).length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>In attesa di telemetria...</p>
              ) : (
                Object.entries(telemetry).map(([id, data]) => (
                  <div key={id} onClick={() => { setSelectedDevice(id); setPage('devices') }} style={{
                    display: 'flex', alignItems: 'center', gap: 16, padding: '12px 0',
                    borderBottom: '1px solid #334155', cursor: 'pointer',
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#22c55e' }} />
                    <div style={{ flex: 1 }}>
                      <p style={{ color: '#fff', margin: 0, fontWeight: 600, fontSize: 13 }}>{id}</p>
                      <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>
                        {data.device_type === 'router' ? 'Router' : 'VPS'} | CPU: {data.cpu_usage}% | RAM: {data.memory_usage}%
                      </p>
                    </div>
                    {data.wan_status && (
                      <div style={{ display: 'flex', gap: 6 }}>
                        {data.wan_status.map((w, i) => (
                          <span key={i} style={{
                            padding: '2px 8px', borderRadius: 4, fontSize: 11,
                            background: w.is_up ? '#16362d' : '#3b1c1c',
                            color: w.is_up ? '#22c55e' : '#ef4444',
                          }}>{w.name} {w.is_up ? `${w.rx_rate_mbps || 0}M` : 'DOWN'}</span>
                        ))}
                      </div>
                    )}
                    {data.mptcp_status && (
                      <span style={{ color: '#3b82f6', fontSize: 13, fontWeight: 600 }}>
                        {data.mptcp_status.aggregated_bw_mbps} Mbps
                      </span>
                    )}
                    {data.zenarmor?.stats && (
                      <span style={{ color: '#ef4444', fontSize: 11 }}>
                        {data.zenarmor.stats.threats_blocked_today} threats
                      </span>
                    )}
                  </div>
                ))
              )}
            </Card>

            {/* Alert recenti */}
            {alerts.length > 0 && (
              <Card style={{ marginTop: 16 }}>
                <h3 style={sectionTitle}>Alert Recenti</h3>
                {alerts.slice(0, 10).map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #334155', alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                      background: a.severity === 'critical' ? '#3b1c1c' : '#3b2f1c',
                      color: a.severity === 'critical' ? '#ef4444' : '#f59e0b',
                    }}>{a.severity}</span>
                    <span style={{ color: '#fff', fontSize: 12 }}>{a.device_id}</span>
                    <span style={{ color: '#94a3b8', fontSize: 12, flex: 1 }}>{a.message}</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{new Date(a.timestamp).toLocaleTimeString()}</span>
                  </div>
                ))}
              </Card>
            )}
          </>
        )}

        {/* === DISPOSITIVI === */}
        {page === 'devices' && !selectedDevice && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={pageTitle}>Dispositivi</h2>
              <button onClick={() => setPage('provision')} style={btnStyle('#3b82f6', '#1e3a5f')}>+ Nuovo Dispositivo</button>
            </div>
            <Card>
              <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr 80px 100px 80px 100px 100px', padding: '10px 0', borderBottom: '1px solid #334155' }}>
                {['', 'Nome', 'Tipo', 'Modello', 'Stato', 'CPU', 'Azioni'].map(h => (
                  <span key={h} style={{ color: '#64748b', fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
                ))}
              </div>
              {/* Device dal DB + telemetria real-time */}
              {(devices.length > 0 ? devices : Object.keys(telemetry).map(id => ({ device_id: id, name: id, device_type: telemetry[id]?.device_type || '?', model: '', is_online: true }))).map(d => {
                const live = telemetry[d.device_id]
                return (
                  <div key={d.device_id} onClick={() => setSelectedDevice(d.device_id)} style={{
                    display: 'grid', gridTemplateColumns: '40px 1fr 80px 100px 80px 100px 100px',
                    padding: '12px 0', borderBottom: '1px solid #334155', cursor: 'pointer', alignItems: 'center',
                  }}>
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: live ? '#22c55e' : '#64748b' }} />
                    <div>
                      <p style={{ color: '#fff', margin: 0, fontWeight: 600, fontSize: 13 }}>{d.name}</p>
                      <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>{d.device_id}</p>
                    </div>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{d.device_type}</span>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{d.model || '-'}</span>
                    <span style={{ color: live ? '#22c55e' : '#64748b', fontSize: 12, fontWeight: 600 }}>{live ? 'Online' : 'Offline'}</span>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>{live ? `${live.cpu_usage}%` : '-'}</span>
                    <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
                      <button onClick={() => sendCommand(d.device_id, 'reboot')} style={btnStyle('#ef4444', '#3b1c1c', true)}>Riavvia</button>
                      <button onClick={() => sendCommand(d.device_id, 'get_config')} style={btnStyle('#3b82f6', '#1e3a5f', true)}>Config</button>
                    </div>
                  </div>
                )
              })}
            </Card>
          </>
        )}

        {/* === DETTAGLIO DISPOSITIVO === */}
        {page === 'devices' && selectedDevice && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <button onClick={() => setSelectedDevice(null)} style={btnStyle('#64748b', '#334155')}>Indietro</button>
              <h2 style={pageTitle}>{selectedDevice}</h2>
            </div>
            <DeviceDetail deviceId={selectedDevice} telemetry={telemetry[selectedDevice]} sendCommand={sendCommand} token={token} />
          </>
        )}

        {/* === ALERT === */}
        {page === 'alerts' && (
          <>
            <h2 style={pageTitle}>Alert</h2>
            <Card>
              {alerts.length === 0 ? (
                <p style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>Nessun alert</p>
              ) : (
                alerts.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: '1px solid #334155', alignItems: 'center' }}>
                    <span style={{
                      padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600, minWidth: 60, textAlign: 'center',
                      background: a.severity === 'critical' ? '#3b1c1c' : a.severity === 'warning' ? '#3b2f1c' : '#1e3a5f',
                      color: a.severity === 'critical' ? '#ef4444' : a.severity === 'warning' ? '#f59e0b' : '#3b82f6',
                    }}>{a.severity}</span>
                    <span style={{ color: '#fff', fontSize: 13, fontWeight: 600, minWidth: 140 }}>{a.device_id}</span>
                    <span style={{ color: '#94a3b8', fontSize: 13, flex: 1 }}>{a.message}</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{a.alert_type}</span>
                    <span style={{ color: '#64748b', fontSize: 11 }}>{new Date(a.timestamp).toLocaleString()}</span>
                  </div>
                ))
              )}
            </Card>
          </>
        )}

        {/* === TENANT MANAGEMENT === */}
        {page === 'tenants' && (
          <>
            <h2 style={pageTitle}>Gestione Multi-Tenant</h2>

            {/* Tenants */}
            <Card>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={sectionTitle}>Tenant (Reseller)</h3>
                <button onClick={() => setShowCreateTenant(true)} style={btnStyle('#3b82f6', '#1e3a5f')}>+ Nuovo Tenant</button>
              </div>
              {tenants.map(t => (
                <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #334155' }}>
                  <div>
                    <p style={{ color: '#fff', margin: 0, fontWeight: 600, fontSize: 13 }}>{t.name}</p>
                    <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>{t.slug} | Max: {t.max_devices} dispositivi</p>
                  </div>
                  <span style={{ color: t.is_active ? '#22c55e' : '#64748b', fontSize: 12 }}>{t.is_active ? 'Attivo' : 'Disattivo'}</span>
                </div>
              ))}
            </Card>

            {/* Organizzazioni */}
            <Card style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={sectionTitle}>Organizzazioni (Clienti)</h3>
                <button onClick={() => setShowCreateOrg(true)} style={btnStyle('#3b82f6', '#1e3a5f')}>+ Nuova Org</button>
              </div>
              {orgs.map(o => (
                <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #334155' }}>
                  <p style={{ color: '#fff', margin: 0, fontSize: 13 }}>{o.name}</p>
                  <span style={{ color: '#64748b', fontSize: 11 }}>Tenant: {tenants.find(t => t.id === o.tenant_id)?.name || o.tenant_id}</span>
                </div>
              ))}
            </Card>

            {/* Siti */}
            <Card style={{ marginTop: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 style={sectionTitle}>Siti / Sedi</h3>
                <button onClick={() => setShowCreateSite(true)} style={btnStyle('#3b82f6', '#1e3a5f')}>+ Nuovo Sito</button>
              </div>
              {sites.map(s => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #334155' }}>
                  <div>
                    <p style={{ color: '#fff', margin: 0, fontSize: 13, fontWeight: 600 }}>{s.name}</p>
                    <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>{s.address || 'Nessun indirizzo'}</p>
                  </div>
                  {s.latitude && <span style={{ color: '#64748b', fontSize: 11 }}>{s.latitude?.toFixed(4)}, {s.longitude?.toFixed(4)}</span>}
                </div>
              ))}
            </Card>

            {/* Modali creazione */}
            {showCreateTenant && <CreateModal title="Nuovo Tenant" fields={[
              { key: 'name', label: 'Nome', placeholder: 'Reseller ABC' },
              { key: 'slug', label: 'Slug', placeholder: 'reseller-abc' },
              { key: 'max_devices', label: 'Max Dispositivi', type: 'number', defaultValue: 100 },
            ]} onSave={async (data) => { await createResource('tenants', data); fetchTenants(); setShowCreateTenant(false) }} onClose={() => setShowCreateTenant(false)} />}

            {showCreateOrg && <CreateModal title="Nuova Organizzazione" fields={[
              { key: 'name', label: 'Nome', placeholder: 'Azienda XYZ' },
              { key: 'tenant_id', label: 'Tenant ID', placeholder: 'UUID tenant' },
            ]} onSave={async (data) => { await createResource('organizations', data); fetchOrgs(); setShowCreateOrg(false) }} onClose={() => setShowCreateOrg(false)} />}

            {showCreateSite && <CreateModal title="Nuovo Sito" fields={[
              { key: 'name', label: 'Nome', placeholder: 'Sede Roma' },
              { key: 'organization_id', label: 'Organizzazione ID', placeholder: 'UUID org' },
              { key: 'address', label: 'Indirizzo', placeholder: 'Via Roma 1' },
              { key: 'latitude', label: 'Latitudine', type: 'number' },
              { key: 'longitude', label: 'Longitudine', type: 'number' },
            ]} onSave={async (data) => { await createResource('sites', data); fetchSites(); setShowCreateSite(false) }} onClose={() => setShowCreateSite(false)} />}
          </>
        )}

        {/* === PROVISIONING === */}
        {page === 'provision' && (
          <>
            <h2 style={pageTitle}>Provisioning Nuovo Dispositivo</h2>
            <ProvisionForm sites={sites} onProvision={provisionDevice} />
            <FirmwareBuild style={{ marginTop: 16 }} />
          </>
        )}
      </main>
    </div>
  )
}

// === COMPONENTI ===


function DeviceDetail({ deviceId, telemetry: t, sendCommand, token }) {
  const [deviceAlerts, setDeviceAlerts] = useState([])
  const [commands, setCommands] = useState([])
  const [history, setHistory] = useState([])
  const [editZen, setEditZen] = useState(false)
  const [zenConfig, setZenConfig] = useState({
    enabled: true,
    mode: 'inline',
    web_categories_blocked: ['malware', 'phishing', 'botnet', 'cryptomining', 'spam'],
    blocked_apps: [],
    policies: [
      { name: 'Default', enabled: true, web_filter: true, threat_intel: true, app_control: true },
    ],
  })

  const WEB_CATS = ['malware', 'phishing', 'botnet', 'cryptomining', 'spam', 'adult', 'gambling', 'social_media', 'streaming', 'gaming', 'p2p', 'vpn_proxy', 'ads', 'weapons', 'drugs']
  const APPS = ['bittorrent', 'tor', 'teamviewer', 'anydesk', 'discord', 'telegram', 'whatsapp', 'tiktok', 'netflix', 'youtube', 'facebook', 'instagram']

  useEffect(() => {
    const h = { 'Authorization': `Bearer ${token}` }
    fetch(`${API}/devices/${deviceId}/alerts?limit=20`, { headers: h }).then(r => r.json()).then(d => setDeviceAlerts(d.alerts || [])).catch(() => {})
    fetch(`${API}/devices/${deviceId}/commands?limit=20`, { headers: h }).then(r => r.json()).then(d => setCommands(d.commands || [])).catch(() => {})
    fetch(`${API}/devices/${deviceId}/telemetry?limit=50&hours=24`, { headers: h }).then(r => r.json()).then(d => setHistory(d.telemetry || [])).catch(() => {})
  }, [deviceId])

  // Sync zenarmor state dalla telemetria
  useEffect(() => {
    if (t?.zenarmor) {
      setZenConfig(prev => ({ ...prev, enabled: t.zenarmor.enabled ?? prev.enabled, mode: t.zenarmor.mode ?? prev.mode }))
    }
  }, [t?.zenarmor])

  const isRouter = t?.device_type === 'router'
  const isVps = t?.device_type === 'vps'

  const saveZenarmor = () => {
    setEditZen(false)
    sendCommand(deviceId, 'update_zenarmor', zenConfig)
  }

  const toggleZenCat = (cat) => {
    const blocked = zenConfig.web_categories_blocked.includes(cat)
      ? zenConfig.web_categories_blocked.filter(c => c !== cat)
      : [...zenConfig.web_categories_blocked, cat]
    setZenConfig({ ...zenConfig, web_categories_blocked: blocked })
  }

  const toggleZenApp = (app) => {
    const blocked = zenConfig.blocked_apps.includes(app)
      ? zenConfig.blocked_apps.filter(a => a !== app)
      : [...zenConfig.blocked_apps, app]
    setZenConfig({ ...zenConfig, blocked_apps: blocked })
  }

  return (
    <>
      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 16 }}>
        {[
          { label: 'CPU', value: t?.cpu_usage != null ? `${t.cpu_usage}%` : '-', color: '#f59e0b' },
          { label: 'RAM', value: t?.memory_usage != null ? `${t.memory_usage}%` : '-', color: '#3b82f6' },
          { label: 'Uptime', value: t?.uptime ? `${Math.floor(t.uptime / 86400)}d` : '-', color: '#22c55e' },
          { label: isRouter ? 'Banda Agg.' : 'Client', value: isRouter ? `${t?.mptcp_status?.aggregated_bw_mbps || 0} Mbps` : `${t?.tunnel_status?.clients || 0}`, color: '#a855f7' },
          { label: 'Tipo', value: t?.device_type || '-', color: '#06b6d4' },
        ].map(s => (
          <Card key={s.label}>
            <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>{s.label}</p>
            <p style={{ color: s.color, fontSize: 24, fontWeight: 700, margin: '4px 0 0' }}>{s.value}</p>
          </Card>
        ))}
      </div>

      {/* Azioni rapide */}
      <Card style={{ marginBottom: 16 }}>
        <h3 style={sectionTitle}>Azioni</h3>
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button onClick={() => sendCommand(deviceId, 'reboot')} style={btnStyle('#ef4444', '#3b1c1c')}>Riavvia</button>
          <button onClick={() => sendCommand(deviceId, 'get_config')} style={btnStyle('#3b82f6', '#1e3a5f')}>Get Config</button>
          {isRouter && <button onClick={() => sendCommand(deviceId, 'speedtest')} style={btnStyle('#06b6d4', '#164e63')}>Speedtest</button>}
          {isVps && <button onClick={() => sendCommand(deviceId, 'zenarmor_update_feeds')} style={btnStyle('#f59e0b', '#3b2f1c')}>Update Feeds</button>}
          <button onClick={() => sendCommand(deviceId, 'update_firmware')} style={btnStyle('#a855f7', '#2d1f4e')}>Aggiorna FW</button>
          <a href={isRouter ? 'http://localhost:8090' : 'http://localhost:8091'} target="_blank" style={{ ...btnStyle('#22c55e', '#16362d'), textDecoration: 'none' }}>Apri Dashboard Locale</a>
        </div>
      </Card>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* WAN / Tunnel status */}
        <Card>
          <h3 style={sectionTitle}>{isRouter ? 'Interfacce WAN' : 'Tunnel Status'}</h3>
          {isRouter && t?.wan_status?.map((w, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #334155' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: w.is_up ? '#22c55e' : '#ef4444' }} />
                <span style={{ color: '#fff', fontSize: 12 }}>{w.name}</span>
              </div>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{w.is_up ? `${w.rx_rate_mbps}M / ${w.latency_ms}ms` : 'DOWN'}</span>
            </div>
          ))}
          {isVps && (
            <>
              <StaticRow label="Tipo" value={t?.tunnel_status?.type || '-'} />
              <StaticRow label="Connesso" value={t?.tunnel_status?.connected ? 'Si' : 'No'} color={t?.tunnel_status?.connected ? '#22c55e' : '#ef4444'} />
              <StaticRow label="Client" value={t?.tunnel_status?.clients || 0} />
            </>
          )}
          {/* Zenarmor mini stats */}
          {t?.zenarmor && (
            <>
              <h4 style={{ color: '#94a3b8', fontSize: 12, margin: '12px 0 8px', textTransform: 'uppercase' }}>Zenarmor</h4>
              <StaticRow label="Stato" value={t.zenarmor.enabled ? 'Attivo' : 'Disattivo'} color={t.zenarmor.enabled ? '#22c55e' : '#ef4444'} />
              <StaticRow label="Minacce Oggi" value={t.zenarmor.stats?.threats_blocked_today || 0} color="#ef4444" />
              <StaticRow label="Richieste Web" value={(t.zenarmor.stats?.web_requests_today || 0).toLocaleString()} />
              <StaticRow label="Connessioni" value={(t.zenarmor.stats?.active_connections || 0).toLocaleString()} />
            </>
          )}
        </Card>

        {/* Alert dispositivo */}
        <Card>
          <h3 style={sectionTitle}>Alert</h3>
          {deviceAlerts.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 12 }}>Nessun alert</p>
          ) : (
            deviceAlerts.slice(0, 10).map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #334155' }}>
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600,
                  background: a.severity === 'critical' ? '#3b1c1c' : '#3b2f1c',
                  color: a.severity === 'critical' ? '#ef4444' : '#f59e0b',
                }}>{a.severity}</span>
                <span style={{ color: '#94a3b8', fontSize: 11, flex: 1 }}>{a.message}</span>
              </div>
            ))
          )}
        </Card>

        {/* Storico comandi */}
        <Card>
          <h3 style={sectionTitle}>Storico Comandi</h3>
          {commands.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 12 }}>Nessun comando</p>
          ) : (
            commands.slice(0, 10).map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid #334155', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontSize: 11 }}>{c.command_type}</span>
                <span style={{
                  padding: '1px 6px', borderRadius: 4, fontSize: 10,
                  background: c.status === 'completed' ? '#16362d' : c.status === 'failed' ? '#3b1c1c' : '#3b2f1c',
                  color: c.status === 'completed' ? '#22c55e' : c.status === 'failed' ? '#ef4444' : '#f59e0b',
                }}>{c.status}</span>
                <span style={{ color: '#64748b', fontSize: 10, marginLeft: 'auto' }}>{new Date(c.created_at).toLocaleTimeString()}</span>
              </div>
            ))
          )}
        </Card>

        {/* Telemetria storica */}
        <Card>
          <h3 style={sectionTitle}>Telemetria (24h)</h3>
          {history.length === 0 ? (
            <p style={{ color: '#64748b', fontSize: 12 }}>Nessun dato storico</p>
          ) : (
            <div style={{ maxHeight: 200, overflowY: 'auto' }}>
              {history.slice(0, 20).map((t, i) => (
                <div key={i} style={{ display: 'flex', gap: 12, padding: '4px 0', borderBottom: '1px solid #334155', fontSize: 11 }}>
                  <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{new Date(t.timestamp).toLocaleTimeString()}</span>
                  <span style={{ color: '#f59e0b' }}>CPU {t.cpu_usage}%</span>
                  <span style={{ color: '#3b82f6' }}>RAM {t.memory_usage}%</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* === ZENARMOR CONFIGURAZIONE (solo VPS) === */}
      {isVps && t?.zenarmor && (
        <Card style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={sectionTitle}>Zenarmor NGFW</h3>
              <span style={{ padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600, background: '#1e3a5f', color: '#3b82f6' }}>
                {zenConfig.mode.toUpperCase()}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {editZen ? (
                <>
                  <button onClick={saveZenarmor} style={btnStyle('#22c55e', '#16362d')}>Salva</button>
                  <button onClick={() => setEditZen(false)} style={btnStyle('#64748b', '#334155')}>Annulla</button>
                </>
              ) : (
                <button onClick={() => setEditZen(true)} style={btnStyle('#3b82f6', '#1e3a5f')}>Configura</button>
              )}
              <div onClick={() => { const v = !zenConfig.enabled; setZenConfig({...zenConfig, enabled: v}); sendCommand(deviceId, v ? 'zenarmor_enable' : 'zenarmor_disable') }} style={{
                width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                background: zenConfig.enabled ? '#22c55e' : '#475569', position: 'relative',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: zenConfig.enabled ? 20 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
            {[
              { label: 'Minacce Bloccate', value: t.zenarmor.stats?.threats_blocked_today || 0, color: '#ef4444' },
              { label: 'Richieste Web', value: (t.zenarmor.stats?.web_requests_today || 0).toLocaleString(), color: '#3b82f6' },
              { label: 'App Rilevate', value: t.zenarmor.stats?.apps_detected || 0, color: '#a855f7' },
              { label: 'Connessioni', value: (t.zenarmor.stats?.active_connections || 0).toLocaleString(), color: '#22c55e' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0f172a', borderRadius: 8, padding: 12 }}>
                <p style={{ color: '#94a3b8', fontSize: 10, margin: 0 }}>{s.label}</p>
                <p style={{ color: s.color, fontSize: 20, fontWeight: 700, margin: '2px 0 0' }}>{s.value}</p>
              </div>
            ))}
          </div>

          {zenConfig.enabled && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {/* Modalita + Policy */}
              <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <h5 style={subH}>Configurazione</h5>
                {editZen && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Modalita</span>
                    <select value={zenConfig.mode} onChange={e => setZenConfig({...zenConfig, mode: e.target.value})} style={selectStyle}>
                      <option value="inline">Inline (blocca)</option>
                      <option value="tap">TAP (monitor)</option>
                      <option value="bridge">Bridge</option>
                    </select>
                  </div>
                )}
                <h5 style={{ ...subH, marginTop: 12 }}>Policy</h5>
                {zenConfig.policies.map((pol, pi) => (
                  <div key={pol.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #334155' }}>
                    <div>
                      <p style={{ color: '#fff', margin: 0, fontSize: 12, fontWeight: 600 }}>{pol.name}</p>
                      <p style={{ color: '#64748b', margin: 0, fontSize: 10 }}>
                        {[pol.web_filter && 'Web', pol.threat_intel && 'Threat', pol.app_control && 'App'].filter(Boolean).join(' + ')}
                      </p>
                    </div>
                    {editZen ? (
                      <ToggleSmall value={pol.enabled} onChange={() => {
                        const p = [...zenConfig.policies]; p[pi].enabled = !p[pi].enabled;
                        setZenConfig({...zenConfig, policies: p})
                      }} />
                    ) : (
                      <span style={{ color: pol.enabled ? '#22c55e' : '#64748b', fontSize: 11 }}>{pol.enabled ? 'ON' : 'OFF'}</span>
                    )}
                  </div>
                ))}
                <div style={{ marginTop: 8 }}>
                  <button onClick={() => sendCommand(deviceId, 'zenarmor_update_feeds')} style={{ ...btnStyle('#f59e0b', '#3b2f1c', true), width: '100%' }}>Aggiorna Feed</button>
                </div>
              </div>

              {/* Categorie Web */}
              <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <h5 style={subH}>Categorie Web</h5>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {WEB_CATS.map(cat => {
                    const blocked = zenConfig.web_categories_blocked.includes(cat)
                    return (
                      <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #334155' }}>
                        <span style={{ color: blocked ? '#ef4444' : '#94a3b8', fontSize: 11, textTransform: 'capitalize' }}>{cat.replace('_', ' ')}</span>
                        {editZen ? (
                          <ToggleSmall value={blocked} onChange={() => toggleZenCat(cat)} color="#ef4444" />
                        ) : (
                          <span style={{ fontSize: 10, color: blocked ? '#ef4444' : '#22c55e' }}>{blocked ? 'BLOCK' : 'OK'}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* App Control */}
              <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <h5 style={subH}>App Control</h5>
                <div style={{ maxHeight: 280, overflowY: 'auto' }}>
                  {APPS.map(app => {
                    const blocked = zenConfig.blocked_apps.includes(app)
                    return (
                      <div key={app} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #334155' }}>
                        <span style={{ color: blocked ? '#ef4444' : '#94a3b8', fontSize: 11, textTransform: 'capitalize' }}>{app}</span>
                        {editZen ? (
                          <ToggleSmall value={blocked} onChange={() => toggleZenApp(app)} color="#ef4444" />
                        ) : (
                          <span style={{ fontSize: 10, color: blocked ? '#ef4444' : '#22c55e' }}>{blocked ? 'BLOCK' : 'OK'}</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </Card>
      )}
    </>
  )
}

function ToggleSmall({ value, onChange, color }) {
  const bg = value ? (color || '#22c55e') : '#475569'
  return (
    <div onClick={onChange} style={{ width: 32, height: 18, borderRadius: 9, cursor: 'pointer', background: bg, position: 'relative', flexShrink: 0 }}>
      <div style={{ width: 14, height: 14, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: value ? 16 : 2, transition: 'left 0.2s' }} />
    </div>
  )
}

const subH = { color: '#94a3b8', margin: '0 0 8px', fontSize: 11, textTransform: 'uppercase', letterSpacing: 1 }

function ProvisionForm({ sites, onProvision }) {
  const [form, setForm] = useState({ site_id: '', device_id: '', name: '', device_type: 'router', model: '' })
  const [result, setResult] = useState(null)

  const submit = async () => {
    const res = await onProvision(form)
    setResult(res)
  }

  return (
    <Card>
      {!result ? (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div>
              <label style={labelStyle}>Device ID</label>
              <input value={form.device_id} onChange={e => setForm({...form, device_id: e.target.value})} placeholder="router-sede-01" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={labelStyle}>Nome</label>
              <input value={form.name} onChange={e => setForm({...form, name: e.target.value})} placeholder="Router Sede Roma" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div>
              <label style={labelStyle}>Tipo</label>
              <select value={form.device_type} onChange={e => setForm({...form, device_type: e.target.value})} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                <option value="router">Router</option>
                <option value="vps">VPS</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Modello</label>
              <input value={form.model} onChange={e => setForm({...form, model: e.target.value})} placeholder="Intel N100 / RPi4" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={labelStyle}>Sito</label>
              <select value={form.site_id} onChange={e => setForm({...form, site_id: e.target.value})} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
                <option value="">Seleziona sito...</option>
                {sites.map(s => <option key={s.id} value={s.id}>{s.name} ({s.address || 'N/A'})</option>)}
              </select>
            </div>
          </div>
          <button onClick={submit} style={{ ...btnStyle('#fff', '#3b82f6'), marginTop: 16, padding: '10px 24px' }}>Registra Dispositivo</button>
        </>
      ) : (
        <div>
          <h3 style={{ color: '#22c55e', margin: '0 0 16px' }}>Dispositivo Registrato!</h3>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 16px' }}>Usa questi dati per installare l'agent sul dispositivo:</p>
          <div style={{ background: '#0f172a', borderRadius: 8, padding: 16, fontFamily: 'monospace', fontSize: 13 }}>
            <p style={{ color: '#64748b', margin: '0 0 4px' }}># Installazione {form.device_type === 'router' ? 'Router' : 'VPS'}:</p>
            <p style={{ color: '#22c55e', margin: '0 0 12px', wordBreak: 'break-all' }}>
              curl -s https://cloud.tecnoadsl.net/install/{form.device_type === 'router' ? 'router' : 'vps'} | {form.device_type === 'router' ? 'sh' : 'bash'} -s -- {result.device_id} {result.mqtt_password}
            </p>
            <p style={{ color: '#64748b', margin: '0 0 4px' }}># Parametri MQTT:</p>
            <p style={{ color: '#fff', margin: 0 }}>Broker: {result.mqtt_broker}</p>
            <p style={{ color: '#fff', margin: 0 }}>Porta: {result.mqtt_port}</p>
            <p style={{ color: '#fff', margin: 0 }}>Device ID: {result.device_id}</p>
            <p style={{ color: '#fff', margin: 0 }}>Password: {result.mqtt_password}</p>
            <p style={{ color: '#fff', margin: 0 }}>Topic: {result.mqtt_topic}</p>
          </div>
          <button onClick={() => setResult(null)} style={{ ...btnStyle('#3b82f6', '#1e3a5f'), marginTop: 16 }}>Registra Altro</button>
        </div>
      )}
    </Card>
  )
}

function CreateModal({ title, fields, onSave, onClose }) {
  const [form, setForm] = useState(() => {
    const initial = {}
    fields.forEach(f => { initial[f.key] = f.defaultValue || '' })
    return initial
  })

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 400, border: '1px solid #334155' }}>
        <h3 style={{ color: '#fff', margin: '0 0 16px' }}>{title}</h3>
        {fields.map(f => (
          <div key={f.key} style={{ marginBottom: 12 }}>
            <label style={labelStyle}>{f.label}</label>
            <input type={f.type || 'text'} value={form[f.key]} onChange={e => setForm({...form, [f.key]: f.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value})} placeholder={f.placeholder || ''} style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#64748b', '#334155')}>Annulla</button>
          <button onClick={() => onSave(form)} style={btnStyle('#22c55e', '#16362d')}>Crea</button>
        </div>
      </div>
    </div>
  )
}

function FirmwareBuild() {
  const BUILD_API = 'http://localhost:8085'
  const [targets, setTargets] = useState({})
  const [builds, setBuilds] = useState({})
  const [form, setForm] = useState({
    target: 'x86_64', device_id: '', mqtt_password: '',
    include_ospf: true, include_agent: true,
  })
  const [building, setBuilding] = useState(false)

  useEffect(() => {
    fetch(`${BUILD_API}/targets`).then(r => r.json()).then(d => setTargets(d.targets || {})).catch(() => {
      setTargets({
        x86_64: 'x86/64 (PC, Mini PC, VM)',
        rpi4: 'Raspberry Pi 4', rpi5: 'Raspberry Pi 5',
        r5s: 'NanoPi R5S', r4s: 'NanoPi R4S', r2s: 'NanoPi R2S',
        'bpi-r4': 'Banana Pi BPI-R4',
        wrt3200acm: 'Linksys WRT3200ACM', rutx50: 'Teltonika RUTX50',
      })
    })
    // Poll builds
    const interval = setInterval(() => {
      fetch(`${BUILD_API}/builds`).then(r => r.json()).then(d => setBuilds(d.builds || {})).catch(() => {})
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const startBuild = async () => {
    setBuilding(true)
    try {
      const res = await fetch(`${BUILD_API}/build`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (data.build_id) {
        setBuilds(prev => ({ ...prev, [data.build_id]: { id: data.build_id, status: 'queued', target: form.target } }))
      }
    } catch (e) {}
    setBuilding(false)
  }

  return (
    <Card style={{ marginTop: 16 }}>
      <h3 style={sectionTitle}>Build Firmware Personalizzato</h3>
      <p style={{ color: '#64748b', fontSize: 12, margin: '4px 0 16px' }}>
        Compila un firmware OpenMPTCProuter con agent preinstallato e OSPF.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <label style={labelStyle}>Target Hardware</label>
          <select value={form.target} onChange={e => setForm({...form, target: e.target.value})} style={{ ...selectStyle, width: '100%', boxSizing: 'border-box' }}>
            {Object.entries(targets).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div>
          <label style={labelStyle}>Device ID (opzionale, per agent preconfigurato)</label>
          <input value={form.device_id} onChange={e => setForm({...form, device_id: e.target.value})} placeholder="router-sede-01" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div>
          <label style={labelStyle}>Password MQTT (opzionale)</label>
          <input value={form.mqtt_password} onChange={e => setForm({...form, mqtt_password: e.target.value})} placeholder="Generata dal provisioning" style={{ ...inputStyle, width: '100%', boxSizing: 'border-box' }} />
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.include_ospf} onChange={e => setForm({...form, include_ospf: e.target.checked})} /> OSPF (bird2)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#94a3b8', fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={form.include_agent} onChange={e => setForm({...form, include_agent: e.target.checked})} /> Agent preinstallato
          </label>
        </div>
      </div>

      <button onClick={startBuild} disabled={building} style={{ ...btnStyle('#fff', '#3b82f6'), padding: '10px 24px', fontSize: 14, opacity: building ? 0.5 : 1 }}>
        {building ? 'Avvio build...' : 'Avvia Build Firmware'}
      </button>

      {/* Lista build */}
      {Object.keys(builds).length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h4 style={{ color: '#fff', fontSize: 14, margin: '0 0 8px' }}>Build in corso / completate</h4>
          {Object.values(builds).reverse().map(b => (
            <div key={b.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #334155' }}>
              <span style={{
                padding: '2px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
                background: b.status === 'completed' ? '#16362d' : b.status === 'failed' ? '#3b1c1c' : '#3b2f1c',
                color: b.status === 'completed' ? '#22c55e' : b.status === 'failed' ? '#ef4444' : '#f59e0b',
              }}>{b.status}</span>
              <span style={{ color: '#fff', fontSize: 12 }}>{b.id}</span>
              <span style={{ color: '#94a3b8', fontSize: 12 }}>{targets[b.target] || b.target}</span>
              <span style={{ color: '#64748b', fontSize: 11, flex: 1 }}>{b.step || ''}</span>
              {b.status === 'completed' && b.firmware && (
                <a href={`${BUILD_API}/download/${b.firmware}`} style={{ ...btnStyle('#22c55e', '#16362d', true), textDecoration: 'none' }}>Download</a>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function StaticRow({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155' }}>
      <span style={{ color: '#94a3b8', fontSize: 12 }}>{label}</span>
      <span style={{ color: color || '#fff', fontSize: 12, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function Card({ children, style = {} }) {
  return <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 20, ...style }}>{children}</div>
}

const btnStyle = (color, bg, small) => ({ padding: small ? '4px 8px' : '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: small ? 11 : 12, fontWeight: 600, color, background: bg })
const inputStyle = { background: '#0f172a', border: '1px solid #475569', borderRadius: 6, color: '#fff', padding: '8px 12px', fontSize: 13, outline: 'none' }
const selectStyle = { background: '#0f172a', border: '1px solid #475569', borderRadius: 6, color: '#fff', padding: '8px 12px', fontSize: 13, outline: 'none' }
const labelStyle = { color: '#94a3b8', fontSize: 12, display: 'block', marginBottom: 4 }
const pageTitle = { color: '#fff', fontSize: 20, margin: '0 0 16px' }
const sectionTitle = { color: '#fff', margin: 0, fontSize: 16 }
