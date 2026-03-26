'use client'

import { useState, useEffect, useCallback } from 'react'
import AuthGuard from './components/AuthGuard'

const API = 'http://localhost:8000'
const VPS_API = 'https://localhost:8081'

export default function Page() {
  return (
    <AuthGuard title="VPS Dashboard">
      {({ token, logout }) => <VPSDashboard token={token} logout={logout} />}
    </AuthGuard>
  )
}

function VPSDashboard({ token, logout }) {
  const [telemetry, setTelemetry] = useState(null)
  const [vpsStatus, setVpsStatus] = useState(null)
  const [editMode, setEditMode] = useState({})
  const [config, setConfig] = useState({
    shadowsocks_port: 65101,
    glorytun_port: 65001,
    v2ray_port: 65228,
    openvpn_port: 65301,
    wireguard_port: 65310,
  })
  const [services, setServices] = useState([
    { name: 'Glorytun TCP', key: 'glorytun_tcp', enabled: true, port: 65001 },
    { name: 'Glorytun UDP', key: 'glorytun_udp', enabled: true, port: 65001 },
    { name: 'Shadowsocks', key: 'shadowsocks', enabled: true, port: 65101 },
    { name: 'V2Ray', key: 'v2ray', enabled: false, port: 65228 },
    { name: 'OpenVPN', key: 'openvpn', enabled: false, port: 65301 },
    { name: 'WireGuard', key: 'wireguard', enabled: true, port: 65310 },
  ])
  const [commandLog, setCommandLog] = useState([])
  const [showCommandModal, setShowCommandModal] = useState(false)
  const [zenarmor, setZenarmor] = useState({
    enabled: true,
    mode: 'inline', // inline, tap, bridge
    license: 'free', // free, home, business
    policies: [
      { name: 'Default', enabled: true, web_filter: true, threat_intel: true, app_control: true },
      { name: 'Clienti Business', enabled: true, web_filter: true, threat_intel: true, app_control: true },
      { name: 'Clienti Residenziali', enabled: true, web_filter: true, threat_intel: false, app_control: false },
    ],
    web_categories_blocked: ['malware', 'phishing', 'botnet', 'cryptomining', 'spam'],
    web_categories_available: [
      'malware', 'phishing', 'botnet', 'cryptomining', 'spam',
      'adult', 'gambling', 'social_media', 'streaming', 'gaming',
      'p2p', 'vpn_proxy', 'ads', 'weapons', 'drugs',
    ],
    threat_intel_feeds: ['et_open', 'abuse_ch', 'emerging_threats', 'feodo_tracker'],
    blocked_apps: [],
    available_apps: ['bittorrent', 'tor', 'teamviewer', 'anydesk', 'discord', 'telegram', 'whatsapp', 'tiktok', 'netflix', 'youtube', 'facebook', 'instagram'],
    stats: {
      threats_blocked_today: 847,
      web_requests_today: 125430,
      apps_detected: 34,
      active_connections: 1250,
    },
  })
  const [editZenarmor, setEditZenarmor] = useState(false)

  // Telemetria real-time via WebSocket
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/telemetry')
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.device_type === 'vps' || data._device_id?.includes('vps')) {
        setTelemetry(data)
        // Aggiorna stats Zenarmor dalla telemetria
        if (data.zenarmor?.stats) {
          setZenarmor(prev => ({...prev, stats: data.zenarmor.stats, enabled: data.zenarmor.enabled ?? prev.enabled, mode: data.zenarmor.mode ?? prev.mode}))
        }
      }
    }
    ws.onerror = () => {}
    ws.onclose = () => {}

    // Polling fallback
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${API}/devices/vps-dev-001`)
        const data = await res.json()
        if (!telemetry) setTelemetry(data)
      } catch (e) {}
    }, 5000)

    return () => { ws.close(); clearInterval(interval) }
  }, [])

  const sendCommand = async (type, payload = {}) => {
    const entry = { time: new Date().toLocaleTimeString(), type, status: 'invio...' }
    setCommandLog(prev => [entry, ...prev.slice(0, 19)])
    try {
      const res = await fetch(`${API}/devices/vps-dev-001/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command_type: type, payload }),
      })
      const data = await res.json()
      entry.status = data.status === 'sent' ? 'inviato' : 'errore'
    } catch (e) {
      entry.status = 'errore'
    }
    setCommandLog(prev => [...prev])
  }

  const toggleService = (index) => {
    const updated = [...services]
    updated[index].enabled = !updated[index].enabled
    setServices(updated)
    sendCommand('toggle_service', {
      service: updated[index].key,
      enabled: updated[index].enabled,
    })
  }

  const updatePort = (index, newPort) => {
    const updated = [...services]
    updated[index].port = parseInt(newPort) || updated[index].port
    setServices(updated)
  }

  const savePortConfig = (index) => {
    setEditMode({ ...editMode, [index]: false })
    sendCommand('update_port', {
      service: services[index].key,
      port: services[index].port,
    })
  }

  const t = telemetry || {}

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <header style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 20, margin: 0 }}>VPS Dashboard</h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>OpenMPTCProuter Server - Tecnoadsl</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => sendCommand('reboot')} style={btnStyle('#ef4444', '#3b1c1c')}>
            Riavvia VPS
          </button>
          <button onClick={() => sendCommand('update_firmware')} style={btnStyle('#f59e0b', '#3b2f1c')}>
            Aggiorna Firmware
          </button>
          <button onClick={() => setShowCommandModal(!showCommandModal)} style={btnStyle('#3b82f6', '#1e3a5f')}>
            Comando Manuale
          </button>
          <span style={{
            padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
            background: telemetry ? '#16362d' : '#3b1c1c',
            color: telemetry ? '#22c55e' : '#ef4444',
          }}>
            {telemetry ? 'ONLINE' : 'OFFLINE'}
          </span>
          <button onClick={logout} style={btnStyle('#94a3b8', '#334155')}>Esci</button>
        </div>
      </header>

      <div style={{ padding: 24 }}>
        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 16, marginBottom: 24 }}>
          {[
            { label: 'CPU', value: t.cpu_usage != null ? `${t.cpu_usage}%` : '-', color: '#f59e0b' },
            { label: 'RAM', value: t.memory_usage != null ? `${t.memory_usage}%` : '-', color: '#3b82f6' },
            { label: 'Disco', value: t.disk_usage != null ? `${t.disk_usage}%` : '-', color: '#a855f7' },
            { label: 'Client Connessi', value: t.tunnel_status?.clients || '-', color: '#22c55e' },
            { label: 'Traffico RX', value: formatBytes(t.net_rx_bytes), color: '#06b6d4' },
            { label: 'Uptime', value: formatUptime(t.uptime), color: '#22c55e' },
          ].map(s => (
            <div key={s.label} style={{
              background: '#1e293b', borderRadius: 12, padding: 20, border: '1px solid #334155'
            }}>
              <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>{s.label}</p>
              <p style={{ color: s.color, fontSize: 28, fontWeight: 700, margin: '8px 0 0' }}>{s.value}</p>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Servizi - EDITABILI */}
          <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Servizi</h3>
              <button onClick={() => sendCommand('restart_all_services')} style={btnStyle('#a855f7', '#2d1f4e')}>
                Riavvia Tutti
              </button>
            </div>
            {services.map((svc, i) => (
              <div key={svc.key} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '10px 0', borderBottom: '1px solid #334155'
              }}>
                <span style={{ color: '#fff', fontSize: 13, flex: 1 }}>{svc.name}</span>

                {/* Porta editabile */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {editMode[i] ? (
                    <>
                      <input
                        type="number"
                        value={svc.port}
                        onChange={(e) => updatePort(i, e.target.value)}
                        style={inputStyle}
                      />
                      <button onClick={() => savePortConfig(i)} style={btnStyle('#22c55e', '#16362d', true)}>
                        Salva
                      </button>
                    </>
                  ) : (
                    <span
                      onClick={() => setEditMode({ ...editMode, [i]: true })}
                      style={{ color: '#64748b', fontSize: 12, fontFamily: 'monospace', cursor: 'pointer', padding: '2px 6px', borderRadius: 4, border: '1px solid transparent' }}
                      title="Clicca per modificare"
                      onMouseEnter={(e) => e.target.style.borderColor = '#475569'}
                      onMouseLeave={(e) => e.target.style.borderColor = 'transparent'}
                    >
                      :{svc.port}
                    </span>
                  )}

                  {/* Toggle on/off */}
                  <div
                    onClick={() => toggleService(i)}
                    style={{
                      width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                      background: svc.enabled ? '#22c55e' : '#475569',
                      position: 'relative', transition: 'background 0.2s',
                    }}
                  >
                    <div style={{
                      width: 18, height: 18, borderRadius: '50%', background: '#fff',
                      position: 'absolute', top: 2,
                      left: svc.enabled ? 20 : 2,
                      transition: 'left 0.2s',
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Configurazione Rete - EDITABILE */}
          <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 20 }}>
            <h3 style={{ color: '#fff', margin: '0 0 16px', fontSize: 16 }}>Configurazione Rete</h3>
            <EditableField label="IP Pubblico" value="203.0.113.50" onSave={(v) => sendCommand('update_config', { public_ip: v })} />
            <EditableField label="Interfaccia" value="eth0" onSave={(v) => sendCommand('update_config', { interface: v })} />
            <EditableField label="DNS Primario" value="1.1.1.1" onSave={(v) => sendCommand('update_config', { dns1: v })} />
            <EditableField label="DNS Secondario" value="8.8.8.8" onSave={(v) => sendCommand('update_config', { dns2: v })} />
            <div style={{
              display: 'flex', justifyContent: 'space-between', padding: '8px 0',
              borderBottom: '1px solid #334155'
            }}>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Kernel MPTCP</span>
              <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>Attivo</span>
            </div>
            <div style={{
              display: 'flex', justifyContent: 'space-between', padding: '8px 0',
              borderBottom: '1px solid #334155'
            }}>
              <span style={{ color: '#94a3b8', fontSize: 13 }}>Shorewall</span>
              <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 600 }}>Attivo</span>
            </div>
          </div>
        </div>

        {/* Client connessi */}
        <ClientsTable sendCommand={sendCommand} />

        {/* Zenarmor NGFW */}
        <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', marginTop: 24 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Zenarmor NGFW</h3>
              <span style={{
                padding: '2px 10px', borderRadius: 12, fontSize: 11, fontWeight: 600,
                background: zenarmor.license === 'business' ? '#1e3a5f' : zenarmor.license === 'home' ? '#3b2f1c' : '#334155',
                color: zenarmor.license === 'business' ? '#3b82f6' : zenarmor.license === 'home' ? '#f59e0b' : '#94a3b8',
              }}>{zenarmor.license.toUpperCase()}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {editZenarmor ? (
                <>
                  <button onClick={() => { setEditZenarmor(false); sendCommand('update_zenarmor', zenarmor) }} style={btnStyle('#22c55e', '#16362d')}>Salva</button>
                  <button onClick={() => setEditZenarmor(false)} style={btnStyle('#64748b', '#334155')}>Annulla</button>
                </>
              ) : (
                <button onClick={() => setEditZenarmor(true)} style={btnStyle('#3b82f6', '#1e3a5f')}>Configura</button>
              )}
              <div onClick={() => {
                const newEnabled = !zenarmor.enabled
                setZenarmor({...zenarmor, enabled: newEnabled})
                sendCommand(newEnabled ? 'zenarmor_enable' : 'zenarmor_disable')
              }} style={{
                width: 40, height: 22, borderRadius: 11, cursor: 'pointer',
                background: zenarmor.enabled ? '#22c55e' : '#475569', position: 'relative',
              }}>
                <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: zenarmor.enabled ? 20 : 2, transition: 'left 0.2s' }} />
              </div>
            </div>
          </div>

          {/* Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, padding: 20 }}>
            {[
              { label: 'Minacce Bloccate Oggi', value: zenarmor.stats.threats_blocked_today, color: '#ef4444' },
              { label: 'Richieste Web Oggi', value: zenarmor.stats.web_requests_today.toLocaleString(), color: '#3b82f6' },
              { label: 'App Rilevate', value: zenarmor.stats.apps_detected, color: '#a855f7' },
              { label: 'Connessioni Attive', value: zenarmor.stats.active_connections.toLocaleString(), color: '#22c55e' },
            ].map(s => (
              <div key={s.label} style={{ background: '#0f172a', borderRadius: 8, padding: 16 }}>
                <p style={{ color: '#94a3b8', fontSize: 11, margin: 0 }}>{s.label}</p>
                <p style={{ color: s.color, fontSize: 24, fontWeight: 700, margin: '4px 0 0' }}>{s.value}</p>
              </div>
            ))}
          </div>

          {zenarmor.enabled && (
            <div style={{ padding: '0 20px 20px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {/* Policy */}
              <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <h5 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Policy</h5>
                {editZenarmor && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #334155' }}>
                    <span style={{ color: '#94a3b8', fontSize: 12 }}>Modalita</span>
                    <select value={zenarmor.mode} onChange={e => setZenarmor({...zenarmor, mode: e.target.value})} style={selectStyle}>
                      <option value="inline">Inline (blocca)</option>
                      <option value="tap">TAP (solo monitor)</option>
                      <option value="bridge">Bridge</option>
                    </select>
                  </div>
                )}
                {zenarmor.policies.map((pol, pi) => (
                  <div key={pol.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #334155' }}>
                    <div>
                      <p style={{ color: '#fff', margin: 0, fontSize: 13, fontWeight: 600 }}>{pol.name}</p>
                      <p style={{ color: '#64748b', margin: 0, fontSize: 11 }}>
                        {[pol.web_filter && 'Web', pol.threat_intel && 'Threat', pol.app_control && 'App'].filter(Boolean).join(' + ')}
                      </p>
                    </div>
                    {editZenarmor ? (
                      <div onClick={() => {
                        const p = [...zenarmor.policies]; p[pi].enabled = !p[pi].enabled;
                        setZenarmor({...zenarmor, policies: p})
                      }} style={{
                        width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                        background: pol.enabled ? '#22c55e' : '#475569', position: 'relative',
                      }}>
                        <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: pol.enabled ? 18 : 2, transition: 'left 0.2s' }} />
                      </div>
                    ) : (
                      <span style={{ color: pol.enabled ? '#22c55e' : '#64748b', fontSize: 11 }}>{pol.enabled ? 'ATTIVA' : 'OFF'}</span>
                    )}
                  </div>
                ))}
                {editZenarmor && (
                  <button onClick={() => setZenarmor({...zenarmor, policies: [...zenarmor.policies, { name: `Policy ${zenarmor.policies.length+1}`, enabled: true, web_filter: true, threat_intel: true, app_control: false }]})} style={{ ...btnStyle('#3b82f6', '#1e3a5f', true), marginTop: 8 }}>+ Aggiungi Policy</button>
                )}
              </div>

              {/* Web Categories */}
              <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                <h5 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Categorie Web Bloccate</h5>
                {zenarmor.web_categories_available.map(cat => {
                  const blocked = zenarmor.web_categories_blocked.includes(cat)
                  return (
                    <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #334155' }}>
                      <span style={{ color: blocked ? '#ef4444' : '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{cat.replace('_', ' ')}</span>
                      {editZenarmor ? (
                        <div onClick={() => {
                          const b = blocked ? zenarmor.web_categories_blocked.filter(c => c !== cat) : [...zenarmor.web_categories_blocked, cat]
                          setZenarmor({...zenarmor, web_categories_blocked: b})
                        }} style={{
                          width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                          background: blocked ? '#ef4444' : '#475569', position: 'relative',
                        }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: blocked ? 18 : 2, transition: 'left 0.2s' }} />
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: blocked ? '#ef4444' : '#22c55e' }}>{blocked ? 'BLOCCATA' : 'OK'}</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {/* App Control + Threat Intel */}
              <div>
                <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155', marginBottom: 16 }}>
                  <h5 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>App Bloccate</h5>
                  {zenarmor.available_apps.map(app => {
                    const blocked = zenarmor.blocked_apps.includes(app)
                    return (
                      <div key={app} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #334155' }}>
                        <span style={{ color: blocked ? '#ef4444' : '#94a3b8', fontSize: 12, textTransform: 'capitalize' }}>{app}</span>
                        {editZenarmor ? (
                          <div onClick={() => {
                            const b = blocked ? zenarmor.blocked_apps.filter(a => a !== app) : [...zenarmor.blocked_apps, app]
                            setZenarmor({...zenarmor, blocked_apps: b})
                          }} style={{
                            width: 36, height: 20, borderRadius: 10, cursor: 'pointer',
                            background: blocked ? '#ef4444' : '#475569', position: 'relative',
                          }}>
                            <div style={{ width: 16, height: 16, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: blocked ? 18 : 2, transition: 'left 0.2s' }} />
                          </div>
                        ) : (
                          <span style={{ fontSize: 11, color: blocked ? '#ef4444' : '#22c55e' }}>{blocked ? 'BLOCCATA' : 'OK'}</span>
                        )}
                      </div>
                    )
                  })}
                </div>

                <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155' }}>
                  <h5 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Threat Intelligence</h5>
                  {zenarmor.threat_intel_feeds.map(feed => (
                    <div key={feed} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '5px 0', borderBottom: '1px solid #334155' }}>
                      <span style={{ color: '#fff', fontSize: 12 }}>{feed.replace(/_/g, ' ').toUpperCase()}</span>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e' }} />
                    </div>
                  ))}
                  <button onClick={() => sendCommand('zenarmor_update_feeds')} style={{ ...btnStyle('#f59e0b', '#3b2f1c', true), marginTop: 8, width: '100%' }}>Aggiorna Feed</button>
                </div>
              </div>
            </div>
          )}

          {/* Log Minacce Zenarmor */}
          {zenarmor.enabled && (
            <div style={{ padding: '0 20px 20px' }}>
              <ThreatLog sendCommand={sendCommand} />
            </div>
          )}
        </div>

        {/* Command log */}
        {commandLog.length > 0 && (
          <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', marginTop: 16, padding: 20 }}>
            <h3 style={{ color: '#fff', margin: '0 0 12px', fontSize: 16 }}>Log Comandi</h3>
            {commandLog.map((cmd, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #334155', fontSize: 13 }}>
                <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{cmd.time}</span>
                <span style={{ color: '#fff' }}>{cmd.type}</span>
                <span style={{ color: cmd.status === 'inviato' ? '#22c55e' : cmd.status === 'errore' ? '#ef4444' : '#f59e0b' }}>{cmd.status}</span>
              </div>
            ))}
          </div>
        )}

        {/* Modal comando manuale */}
        {showCommandModal && <CommandModal onSend={sendCommand} onClose={() => setShowCommandModal(false)} />}
      </div>
    </div>
  )
}

function ThreatLog({ sendCommand }) {
  const [threats, setThreats] = useState([])
  const [loading, setLoading] = useState(false)

  const loadThreats = async () => {
    setLoading(true)
    // In dev generiamo dati simulati lato client
    const types = ['malware', 'phishing', 'botnet', 'cryptomining', 'c2_callback', 'exploit_kit']
    const actions = ['blocked', 'blocked', 'blocked', 'alerted']
    const simulated = Array.from({ length: 20 }, (_, i) => ({
      time: new Date(Date.now() - i * 45000).toLocaleTimeString(),
      type: types[Math.floor(Math.random() * types.length)],
      severity: Math.random() > 0.7 ? 'critical' : Math.random() > 0.4 ? 'high' : 'medium',
      src_ip: `10.255.255.${Math.floor(Math.random() * 8) + 2}`,
      dst: `${['evil', 'malware', 'phish', 'c2'][Math.floor(Math.random() * 4)]}-${Math.floor(Math.random() * 100)}.example.com`,
      action: actions[Math.floor(Math.random() * actions.length)],
      client: `router-${['dev-001', 'sede-02', 'backup'][Math.floor(Math.random() * 3)]}`,
    }))
    setThreats(simulated)
    sendCommand('zenarmor_get_threats', { limit: 20 })
    setLoading(false)
  }

  useEffect(() => { loadThreats() }, [])

  const severityColor = { critical: '#ef4444', high: '#f59e0b', medium: '#3b82f6', low: '#94a3b8' }
  const typeColor = { malware: '#ef4444', phishing: '#f59e0b', botnet: '#a855f7', cryptomining: '#06b6d4', c2_callback: '#ef4444', exploit_kit: '#ef4444' }

  return (
    <div style={{ background: '#172033', borderRadius: 8, border: '1px solid #334155' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h5 style={{ color: '#94a3b8', margin: 0, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>Log Minacce Recenti</h5>
        <button onClick={loadThreats} disabled={loading} style={btnStyle('#3b82f6', '#1e3a5f', true)}>{loading ? '...' : 'Aggiorna'}</button>
      </div>
      <div style={{ maxHeight: 300, overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'grid', gridTemplateColumns: '70px 90px 60px 100px 1fr 80px 70px', padding: '8px 16px', borderBottom: '1px solid #334155' }}>
          {['Ora', 'Tipo', 'Sev.', 'Sorgente', 'Destinazione', 'Client', 'Azione'].map(h => (
            <span key={h} style={{ color: '#64748b', fontSize: 10, fontWeight: 600, textTransform: 'uppercase' }}>{h}</span>
          ))}
        </div>
        {threats.map((t, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '70px 90px 60px 100px 1fr 80px 70px', padding: '6px 16px', borderBottom: '1px solid #1e293b', alignItems: 'center' }}>
            <span style={{ color: '#64748b', fontSize: 11, fontFamily: 'monospace' }}>{t.time}</span>
            <span style={{ color: typeColor[t.type] || '#94a3b8', fontSize: 11, fontWeight: 600 }}>{t.type}</span>
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, textAlign: 'center',
              background: t.severity === 'critical' ? '#3b1c1c' : t.severity === 'high' ? '#3b2f1c' : '#1e3a5f',
              color: severityColor[t.severity],
            }}>{t.severity}</span>
            <span style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace' }}>{t.src_ip}</span>
            <span style={{ color: '#94a3b8', fontSize: 11, fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.dst}</span>
            <span style={{ color: '#64748b', fontSize: 11 }}>{t.client}</span>
            <span style={{
              padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 600, textAlign: 'center',
              background: t.action === 'blocked' ? '#16362d' : '#3b2f1c',
              color: t.action === 'blocked' ? '#22c55e' : '#f59e0b',
            }}>{t.action === 'blocked' ? 'BLOCK' : 'ALERT'}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function EditableField({ label, value: initialValue, onSave }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(initialValue)

  const save = () => {
    setEditing(false)
    if (value !== initialValue) onSave(value)
  }

  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '8px 0', borderBottom: '1px solid #334155'
    }}>
      <span style={{ color: '#94a3b8', fontSize: 13 }}>{label}</span>
      {editing ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()}
            autoFocus
            style={inputStyle}
          />
          <button onClick={save} style={btnStyle('#22c55e', '#16362d', true)}>OK</button>
          <button onClick={() => { setEditing(false); setValue(initialValue) }} style={btnStyle('#64748b', '#334155', true)}>X</button>
        </div>
      ) : (
        <span
          onClick={() => setEditing(true)}
          style={{ color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '2px 8px', borderRadius: 4 }}
          title="Clicca per modificare"
          onMouseEnter={(e) => e.target.style.background = '#334155'}
          onMouseLeave={(e) => e.target.style.background = 'transparent'}
        >
          {value}
        </span>
      )}
    </div>
  )
}

function ClientsTable({ sendCommand }) {
  const [clients, setClients] = useState([
    { name: 'router-dev-001', ip: '10.255.255.2', tunnel: 'Glorytun TCP', rx: '1.2 GB', tx: '850 MB', status: true },
    { name: 'router-sede-02', ip: '10.255.255.3', tunnel: 'Glorytun TCP', rx: '680 MB', tx: '420 MB', status: true },
    { name: 'router-backup', ip: '10.255.255.4', tunnel: 'Shadowsocks', rx: '120 MB', tx: '85 MB', status: false },
  ])

  return (
    <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: 16 }}>Client Connessi</h3>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 1fr 1fr 100px 80px',
        padding: '10px 20px', borderBottom: '1px solid #334155',
      }}>
        {['', 'Nome', 'IP Tunnel', 'Tunnel', 'RX', 'TX', 'Stato', 'Azioni'].map(h => (
          <p key={h} style={{ color: '#64748b', margin: 0, fontSize: 11, fontWeight: 600, textTransform: 'uppercase' }}>{h}</p>
        ))}
      </div>
      {clients.map((c, i) => (
        <div key={c.name} style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 1fr 1fr 1fr 1fr 100px 80px',
          padding: '14px 20px', borderBottom: '1px solid #334155', alignItems: 'center',
        }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: c.status ? '#22c55e' : '#ef4444' }} />
          <p style={{ color: '#fff', margin: 0, fontSize: 13, fontWeight: 600 }}>{c.name}</p>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: 13, fontFamily: 'monospace' }}>{c.ip}</p>
          <p style={{ color: '#94a3b8', margin: 0, fontSize: 13 }}>{c.tunnel}</p>
          <p style={{ color: '#06b6d4', margin: 0, fontSize: 13 }}>{c.rx}</p>
          <p style={{ color: '#a855f7', margin: 0, fontSize: 13 }}>{c.tx}</p>
          <span style={{
            padding: '4px 10px', borderRadius: 6, fontSize: 11, textAlign: 'center',
            background: c.status ? '#16362d' : '#3b1c1c',
            color: c.status ? '#22c55e' : '#ef4444',
          }}>
            {c.status ? 'ONLINE' : 'OFFLINE'}
          </span>
          <button
            onClick={() => sendCommand('disconnect_client', { client: c.name })}
            style={btnStyle('#ef4444', '#3b1c1c', true)}
          >
            Disconn.
          </button>
        </div>
      ))}
    </div>
  )
}

function CommandModal({ onSend, onClose }) {
  const [cmd, setCmd] = useState('')
  const [payload, setPayload] = useState('{}')

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999
    }}>
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 400, border: '1px solid #334155' }}>
        <h3 style={{ color: '#fff', margin: '0 0 16px' }}>Comando Manuale</h3>
        <label style={{ color: '#94a3b8', fontSize: 12 }}>Tipo Comando</label>
        <input value={cmd} onChange={(e) => setCmd(e.target.value)} placeholder="es: reboot, get_config, speedtest" style={{ ...inputStyle, width: '100%', marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={{ color: '#94a3b8', fontSize: 12 }}>Payload (JSON)</label>
        <textarea value={payload} onChange={(e) => setPayload(e.target.value)} rows={3} style={{ ...inputStyle, width: '100%', marginBottom: 16, boxSizing: 'border-box', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#64748b', '#334155')}>Annulla</button>
          <button onClick={() => { onSend(cmd, JSON.parse(payload || '{}')); onClose() }} style={btnStyle('#22c55e', '#16362d')}>Invia</button>
        </div>
      </div>
    </div>
  )
}

function formatBytes(bytes) {
  if (!bytes) return '-'
  if (bytes > 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes > 1e6) return `${(bytes / 1e6).toFixed(1)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function formatUptime(seconds) {
  if (!seconds) return '-'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  return d > 0 ? `${d}d ${h}h` : `${h}h`
}

const btnStyle = (color, bg, small) => ({
  padding: small ? '4px 8px' : '6px 14px',
  borderRadius: 6, border: 'none', cursor: 'pointer',
  fontSize: small ? 11 : 12, fontWeight: 600,
  color, background: bg,
})

const inputStyle = {
  background: '#0f172a', border: '1px solid #475569', borderRadius: 6,
  color: '#fff', padding: '6px 10px', fontSize: 13, outline: 'none',
  width: 100,
}

const selectStyle = {
  background: '#0f172a', border: '1px solid #475569', borderRadius: 6,
  color: '#fff', padding: '6px 8px', fontSize: 13, outline: 'none',
}
