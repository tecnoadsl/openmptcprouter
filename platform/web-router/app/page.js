'use client'

import { useState, useEffect } from 'react'
import AuthGuard from './components/AuthGuard'

const API = 'http://localhost:8000'

export default function Page() {
  return (
    <AuthGuard title="Router Dashboard">
      {({ token, logout }) => <RouterDashboard token={token} logout={logout} />}
    </AuthGuard>
  )
}

function RouterDashboard({ token, logout }) {
  const [telemetry, setTelemetry] = useState(null)
  const [activeTab, setActiveTab] = useState('overview')
  const [editMode, setEditMode] = useState({})
  const [expandedWan, setExpandedWan] = useState(null)
  const [commandLog, setCommandLog] = useState([])
  const [showCommandModal, setShowCommandModal] = useState(false)

  // === STATE: Server ===
  const [servers, setServers] = useState([
    { name: 'server1', ip1: '203.0.113.50', ip2: '', username: 'openmptcprouter', key: '', port: 65500, master: true, disabled: false, redirect_ports: true, nofwredirect: false },
  ])

  // === STATE: WAN Interfaces ===
  const [wanConfig, setWanConfig] = useState([
    {
      name: 'wan1', label: 'Fibra FTTH', device: 'eth1', type: 'fiber', enabled: true,
      proto: 'dhcp', ipaddr: '', netmask: '255.255.255.0', gateway: '', dns1: '', dns2: '',
      mtu: 1500, vlan: '', mac_override: '', ttl: '', intf_type: 'normal',
      master_intf: '', metric: 10, mptcp: 'on',
      // IPv6
      ipv6_enabled: false, ip6addr: '', ip6gw: '', ula: '', dns64: false,
      // Modem
      apn: '', pincode: '', ncm_device: '', qmi_device: '', modem_mode: 'default',
      auth_type: 'none', pap_user: '', pap_pass: '', modem_delay: 10,
      // PPPoE
      pppoe_user: '', pppoe_pass: '',
      // SQM
      sqm_enabled: true, sqm_download: 100000, sqm_upload: 30000, sqm_qdisc: 'cake', sqm_testspeed: false,
      // QoS
      qos_enabled: false,
      // MPTCP over VPN
      mptcpvpn_enabled: false,
    },
    {
      name: 'wan2', label: '4G LTE', device: 'wwan0', type: '4g', enabled: true,
      proto: 'ncm', ipaddr: '', netmask: '255.255.255.0', gateway: '', dns1: '', dns2: '',
      mtu: 1420, vlan: '', mac_override: '', ttl: '65', intf_type: 'normal',
      master_intf: '', metric: 20, mptcp: 'on',
      ipv6_enabled: false, ip6addr: '', ip6gw: '', ula: '', dns64: false,
      apn: 'internet', pincode: '', ncm_device: '/dev/cdc-wdm0', qmi_device: '', modem_mode: 'lte',
      auth_type: 'none', pap_user: '', pap_pass: '', modem_delay: 10,
      pppoe_user: '', pppoe_pass: '',
      sqm_enabled: true, sqm_download: 50000, sqm_upload: 10000, sqm_qdisc: 'cake', sqm_testspeed: false,
      qos_enabled: false, mptcpvpn_enabled: false,
    },
    {
      name: 'wan3', label: 'ADSL PPPoE', device: 'eth0.835', type: 'adsl', enabled: true,
      proto: 'pppoe', ipaddr: '', netmask: '255.255.255.0', gateway: '', dns1: '', dns2: '',
      mtu: 1492, vlan: '835', mac_override: '', ttl: '', intf_type: 'normal',
      master_intf: '', metric: 30, mptcp: 'on',
      ipv6_enabled: false, ip6addr: '', ip6gw: '', ula: '', dns64: false,
      apn: '', pincode: '', ncm_device: '', qmi_device: '', modem_mode: 'default',
      auth_type: 'none', pap_user: '', pap_pass: '', modem_delay: 10,
      pppoe_user: 'utente@isp.it', pppoe_pass: '',
      sqm_enabled: false, sqm_download: 20000, sqm_upload: 1000, sqm_qdisc: 'cake', sqm_testspeed: false,
      qos_enabled: false, mptcpvpn_enabled: false,
    },
  ])

  // === STATE: VPN ===
  const [vpnConfig, setVpnConfig] = useState({
    default_vpn: 'glorytun_tcp',
    mptcpovervpn: 'none',
    glorytun_key: '',
    dsvpn_key: '',
    mlvpn_password: '', mlvpn_first_port: 65201,
    ubond_password: '', ubond_first_port: 65251,
    softether_password: '',
    openvpn_lb: false,
  })

  // === STATE: Proxy ===
  const [proxyConfig, setProxyConfig] = useState({
    default_proxy: 'shadowsocks',
    ss_encryption: 'chacha20-ietf-poly1305',
    ss_key: '',
    ss2022_key: '',
    ss_udp: true,
    obfs_enabled: false, obfs_plugin: 'v2ray', obfs_type: 'http',
    v2ray_user: '', v2ray_udp: false,
    xray_user: '', xray_transport: 'tcp', xray_udp: false,
  })

  // === STATE: MPTCP ===
  const [mptcpConfig, setMptcpConfig] = useState({
    enabled: true,
    scheduler: 'blest',
    congestion: 'bbr',
    path_manager: 'fullmesh',
    checksum: true,
    version: 0,
    syn_retries: 3,
    force_multipath: false,
    max_subflows: 3,
    stale_loss_cnt: 4,
    add_addr_accepted: 1,
    add_addr_timeout: 120,
    debug: false,
    // MPTCPd
    mptcpd_enable: false,
    mptcpd_path_managers: '',
    mptcpd_plugins: '',
    mptcpd_addr_flags: 'subflow,signal',
    mptcpd_notify_flags: 'existing',
  })

  // === STATE: System ===
  const [systemConfig, setSystemConfig] = useState({
    disable_ipv6: false,
    enable_6in4: false,
    sip_alg: false,
    tcp_keepalive_time: 600,
    tcp_fin_timeout: 15,
    tcp_syn_retries: 3,
    tcp_retries1: 3,
    tcp_retries2: 8,
    ip_default_ttl: 64,
    tcp_fastopen: 3,
    disable_fastopen: false,
    enable_nodelay: false,
    sfe_enabled: false,
    sfe_bridge: false,
    scaling_min_freq: '',
    scaling_max_freq: '',
    scaling_governor: 'performance',
    country: 'world',
  })

  // === STATE: Monitoring ===
  const [monitorConfig, setMonitorConfig] = useState({
    check_ipv4_url: 'http://ip.openmptcprouter.com',
    check_ipv6_url: 'http://ipv6.openmptcprouter.com',
    external_check: true,
    status_vps_timeout: 10,
    status_getip_timeout: 1,
    status_whois_timeout: 2,
    disable_server_ping: false,
    disable_server_httptest: false,
    disable_gw_ping: false,
    save_vnstat: false,
    disable_loop_detection: false,
    disable_tracebox: false,
    disable_multipath_test: false,
    debug: false,
    disable_intf_rename: false,
    disable_modemmanager: false,
    disable_default_gw: false,
    ban_udp_ip: false,
    restrict_to_lan: false,
  })

  // === STATE: Quota ===
  const [quotaConfig, setQuotaConfig] = useState([
    { interface: 'wan1', enabled: false, tx_quota: 0, rx_quota: 0, tt_quota: 0, interval: 300 },
    { interface: 'wan2', enabled: true, tx_quota: 5000000, rx_quota: 10000000, tt_quota: 0, interval: 300 },
    { interface: 'wan3', enabled: false, tx_quota: 0, rx_quota: 0, tt_quota: 0, interval: 300 },
  ])

  // === STATE: LAN ===
  const [lanConfig, setLanConfig] = useState({
    proto: 'static', device: 'br-lan', ipaddr: '192.168.100.1', netmask: '255.255.255.0',
  })

  // Telemetria real-time
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8000/ws/telemetry')
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
      if (data.device_type === 'router' || data._device_id?.includes('router')) {
        setTelemetry(data)
      }
    }
    ws.onerror = () => {}
    ws.onclose = () => {}
    return () => ws.close()
  }, [])

  const sendCommand = async (type, payload = {}) => {
    const entry = { time: new Date().toLocaleTimeString(), type, status: 'invio...' }
    setCommandLog(prev => [entry, ...prev.slice(0, 19)])
    try {
      const res = await fetch(`${API}/devices/router-dev-001/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command_type: type, payload }),
      })
      entry.status = 'inviato'
    } catch (e) {
      entry.status = 'errore'
    }
    setCommandLog(prev => [...prev])
  }

  const saveSection = (section, data) => {
    setEditMode({ ...editMode, [section]: false })
    sendCommand(`update_${section}`, data)
  }

  const updateWanField = (index, field, value) => {
    const updated = [...wanConfig]
    updated[index][field] = value
    setWanConfig(updated)
  }

  const t = telemetry || {}
  const wans = t.wan_status || []
  const mptcp = t.mptcp_status || {}

  const tabs = [
    { id: 'overview', label: 'Panoramica' },
    { id: 'interfaces', label: 'Interfacce' },
    { id: 'vpn', label: 'VPN' },
    { id: 'proxy', label: 'Proxy' },
    { id: 'mptcp', label: 'MPTCP' },
    { id: 'system', label: 'Sistema' },
    { id: 'monitoring', label: 'Monitoraggio' },
    { id: 'quota', label: 'Quote' },
    { id: 'server', label: 'Server VPS' },
    { id: 'backup', label: 'Backup' },
  ]

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a' }}>
      {/* Header */}
      <header style={{
        background: '#1e293b', borderBottom: '1px solid #334155',
        padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <h1 style={{ color: '#fff', fontSize: 20, margin: 0 }}>Router Dashboard</h1>
          <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>OpenMPTCProuter - Tecnoadsl</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => sendCommand('reboot')} style={btnStyle('#ef4444', '#3b1c1c')}>Riavvia</button>
          <button onClick={() => sendCommand('speedtest')} style={btnStyle('#06b6d4', '#164e63')}>Speedtest</button>
          <button onClick={() => setShowCommandModal(true)} style={btnStyle('#3b82f6', '#1e3a5f')}>Comando</button>
          <span style={{ ...pill, background: telemetry ? '#16362d' : '#3b1c1c', color: telemetry ? '#22c55e' : '#ef4444' }}>
            {telemetry ? 'CONNESSO' : 'DISCONNESSO'}
          </span>
          <button onClick={logout} style={btnStyle('#94a3b8', '#334155')}>Esci</button>
        </div>
      </header>

      {/* Tabs */}
      <nav style={{ background: '#1e293b', borderBottom: '1px solid #334155', padding: '0 24px', display: 'flex', gap: 0, overflowX: 'auto' }}>
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
            padding: '12px 16px', border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 500,
            background: 'transparent',
            color: activeTab === tab.id ? '#3b82f6' : '#94a3b8',
            borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
          }}>{tab.label}</button>
        ))}
      </nav>

      <div style={{ padding: 24 }}>
        {/* PANORAMICA */}
        {activeTab === 'overview' && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 16, marginBottom: 24 }}>
              {[
                { label: 'Banda Aggregata', value: mptcp.aggregated_bw_mbps ? `${mptcp.aggregated_bw_mbps} Mbps` : '-', color: '#3b82f6' },
                { label: 'WAN Attive', value: wans.length ? `${wans.filter(w => w.is_up).length} / ${wans.length}` : '-', color: '#22c55e' },
                { label: 'Subflow MPTCP', value: mptcp.subflows || '-', color: '#a855f7' },
                { label: 'CPU', value: t.cpu_usage != null ? `${t.cpu_usage}%` : '-', color: '#f59e0b' },
                { label: 'Uptime', value: formatUptime(t.uptime), color: '#06b6d4' },
              ].map(s => (
                <Card key={s.label}>
                  <p style={{ color: '#94a3b8', fontSize: 12, margin: 0 }}>{s.label}</p>
                  <p style={{ color: s.color, fontSize: 28, fontWeight: 700, margin: '8px 0 0' }}>{s.value}</p>
                </Card>
              ))}
            </div>
            {/* Quick WAN status */}
            <Card>
              <h3 style={sectionTitle}>Stato Interfacce</h3>
              {wans.map((w, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #334155' }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: w.is_up ? '#22c55e' : '#ef4444' }} />
                  <span style={{ color: '#fff', fontWeight: 600, fontSize: 13, width: 100 }}>{wanConfig[i]?.label || w.name}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12, width: 80 }}>{wanConfig[i]?.type || ''}</span>
                  <span style={{ color: '#94a3b8', fontSize: 12, fontFamily: 'monospace', width: 120 }}>{w.ip || '-'}</span>
                  <span style={{ color: '#22c55e', fontSize: 12, width: 100 }}>{w.is_up ? `${w.rx_rate_mbps} Mbps` : '-'}</span>
                  <span style={{ color: '#f59e0b', fontSize: 12 }}>{w.is_up ? `${w.latency_ms}ms` : '-'}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        {/* INTERFACCE */}
        {activeTab === 'interfaces' && (
          <>
            {/* LAN */}
            <Card>
              <SectionHeader title="LAN" editing={editMode.lan} onEdit={() => setEditMode({...editMode, lan: true})} onSave={() => saveSection('lan', lanConfig)} />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
                <Field label="Protocollo" value={lanConfig.proto} editing={editMode.lan} type="select" options={[['static','Statico'],['dhcp','DHCP']]} onChange={v => setLanConfig({...lanConfig, proto: v})} />
                <Field label="Dispositivo" value={lanConfig.device} editing={editMode.lan} onChange={v => setLanConfig({...lanConfig, device: v})} />
                <Field label="IP LAN" value={lanConfig.ipaddr} editing={editMode.lan} onChange={v => setLanConfig({...lanConfig, ipaddr: v})} />
                <Field label="Netmask" value={lanConfig.netmask} editing={editMode.lan} onChange={v => setLanConfig({...lanConfig, netmask: v})} />
              </div>
            </Card>

            {/* WAN Interfaces */}
            {wanConfig.map((wan, i) => {
              const live = wans[i] || {}
              const isEditing = editMode[`wan_${i}`]
              const isExpanded = expandedWan === i
              return (
                <Card key={wan.name} style={{ marginTop: 16 }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setExpandedWan(isExpanded ? null : i)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: live.is_up ? '#22c55e' : '#ef4444' }} />
                      <div>
                        <span style={{ color: '#fff', fontWeight: 600, fontSize: 14 }}>{wan.label || wan.name}</span>
                        <span style={{ color: '#64748b', fontSize: 12, marginLeft: 8 }}>{wan.device} | {wan.proto.toUpperCase()} | {wan.type}</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                      {live.is_up && <span style={{ color: '#22c55e', fontSize: 12 }}>{live.rx_rate_mbps} Mbps</span>}
                      {live.latency_ms && <span style={{ color: '#f59e0b', fontSize: 12 }}>{live.latency_ms}ms</span>}
                      <Toggle value={wan.enabled} onChange={() => { updateWanField(i, 'enabled', !wan.enabled); sendCommand('toggle_wan', { wan: wan.name, enabled: !wan.enabled }) }} />
                      <span style={{ color: '#475569', fontSize: 14 }}>{isExpanded ? '\u25B2' : '\u25BC'}</span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div style={{ marginTop: 16 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: 8 }}>
                            <button onClick={() => { saveSection(`wan_${i}`, wan) }} style={btnStyle('#22c55e', '#16362d')}>Salva</button>
                            <button onClick={() => setEditMode({...editMode, [`wan_${i}`]: false})} style={btnStyle('#64748b', '#334155')}>Annulla</button>
                          </div>
                        ) : (
                          <button onClick={() => setEditMode({...editMode, [`wan_${i}`]: true})} style={btnStyle('#3b82f6', '#1e3a5f')}>Modifica</button>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                        {/* Col 1: Connessione */}
                        <SubCard title="Connessione">
                          <Field label="Etichetta" value={wan.label} editing={isEditing} onChange={v => updateWanField(i, 'label', v)} />
                          <Field label="Dispositivo" value={wan.device} editing={isEditing} onChange={v => updateWanField(i, 'device', v)} />
                          <Field label="Tipo Interfaccia" value={wan.intf_type} editing={isEditing} type="select" options={[['normal','Normale'],['macvlan','MacVLAN'],['bridge','Bridge']]} onChange={v => updateWanField(i, 'intf_type', v)} />
                          {wan.intf_type === 'macvlan' && <Field label="Interfaccia Master" value={wan.master_intf} editing={isEditing} onChange={v => updateWanField(i, 'master_intf', v)} />}
                          <Field label="Protocollo" value={wan.proto} editing={isEditing} type="select" options={[['dhcp','DHCP'],['static','IP Statico'],['pppoe','PPPoE'],['ncm','NCM (Modem)'],['qmi','QMI (Modem)'],['modemmanager','ModemManager']]} onChange={v => updateWanField(i, 'proto', v)} />
                          <Field label="Tipo WAN" value={wan.type} editing={isEditing} type="select" options={[['fiber','Fibra'],['4g','4G'],['5g','5G'],['adsl','ADSL'],['vdsl','VDSL'],['ethernet','Ethernet']]} onChange={v => updateWanField(i, 'type', v)} />

                          {wan.proto === 'static' && <>
                            <Field label="Indirizzo IP" value={wan.ipaddr} editing={isEditing} onChange={v => updateWanField(i, 'ipaddr', v)} placeholder="192.168.1.100" />
                            <Field label="Netmask" value={wan.netmask} editing={isEditing} onChange={v => updateWanField(i, 'netmask', v)} />
                            <Field label="Gateway" value={wan.gateway} editing={isEditing} onChange={v => updateWanField(i, 'gateway', v)} />
                          </>}
                          {wan.proto === 'pppoe' && <>
                            <Field label="Utente PPPoE" value={wan.pppoe_user} editing={isEditing} onChange={v => updateWanField(i, 'pppoe_user', v)} />
                            <Field label="Password PPPoE" value={wan.pppoe_pass} editing={isEditing} onChange={v => updateWanField(i, 'pppoe_pass', v)} type="password" />
                          </>}
                          {['ncm','qmi','modemmanager'].includes(wan.proto) && <>
                            <Field label="APN" value={wan.apn} editing={isEditing} onChange={v => updateWanField(i, 'apn', v)} placeholder="internet" />
                            <Field label="PIN SIM" value={wan.pincode} editing={isEditing} onChange={v => updateWanField(i, 'pincode', v)} type="password" />
                            {wan.proto === 'ncm' && <Field label="Dispositivo NCM" value={wan.ncm_device} editing={isEditing} onChange={v => updateWanField(i, 'ncm_device', v)} placeholder="/dev/cdc-wdm0" />}
                            {wan.proto === 'qmi' && <Field label="Dispositivo QMI" value={wan.qmi_device} editing={isEditing} onChange={v => updateWanField(i, 'qmi_device', v)} placeholder="/dev/cdc-wdm0" />}
                            <Field label="Modalita Rete" value={wan.modem_mode} editing={isEditing} type="select" options={[['default','Auto'],['lte','Preferisci LTE'],['umts','UMTS'],['gprs','GPRS']]} onChange={v => updateWanField(i, 'modem_mode', v)} />
                            <Field label="Autenticazione" value={wan.auth_type} editing={isEditing} type="select" options={[['none','Nessuna'],['pap','PAP'],['chap','CHAP'],['pap-chap','PAP+CHAP']]} onChange={v => updateWanField(i, 'auth_type', v)} />
                            {wan.auth_type !== 'none' && <>
                              <Field label="Username" value={wan.pap_user} editing={isEditing} onChange={v => updateWanField(i, 'pap_user', v)} />
                              <Field label="Password" value={wan.pap_pass} editing={isEditing} onChange={v => updateWanField(i, 'pap_pass', v)} type="password" />
                            </>}
                            <Field label="Init Timeout (s)" value={wan.modem_delay} editing={isEditing} onChange={v => updateWanField(i, 'modem_delay', parseInt(v)||0)} type="number" />
                          </>}
                        </SubCard>

                        {/* Col 2: Rete */}
                        <SubCard title="Rete">
                          <Field label="DNS Primario" value={wan.dns1} editing={isEditing} onChange={v => updateWanField(i, 'dns1', v)} placeholder="Auto" />
                          <Field label="DNS Secondario" value={wan.dns2} editing={isEditing} onChange={v => updateWanField(i, 'dns2', v)} placeholder="Auto" />
                          <Field label="MTU" value={wan.mtu} editing={isEditing} onChange={v => updateWanField(i, 'mtu', parseInt(v)||1500)} type="number" />
                          <Field label="VLAN ID" value={wan.vlan} editing={isEditing} onChange={v => updateWanField(i, 'vlan', v)} placeholder="Nessuna" />
                          <Field label="MAC Override" value={wan.mac_override} editing={isEditing} onChange={v => updateWanField(i, 'mac_override', v)} placeholder="Originale" />
                          <Field label="Forza TTL" value={wan.ttl} editing={isEditing} onChange={v => updateWanField(i, 'ttl', v)} placeholder="Auto" />
                          <Field label="Metrica" value={wan.metric} editing={isEditing} onChange={v => updateWanField(i, 'metric', parseInt(v)||0)} type="number" />
                          <Field label="MPTCP" value={wan.mptcp} editing={isEditing} type="select" options={[['on','Attivo'],['off','Disattivo'],['master','Master'],['backup','Backup'],['handover','Handover']]} onChange={v => updateWanField(i, 'mptcp', v)} />
                          <ToggleField label="MPTCP over VPN" value={wan.mptcpvpn_enabled} editing={isEditing} onChange={v => updateWanField(i, 'mptcpvpn_enabled', v)} />

                          <h5 style={subTitle}>IPv6</h5>
                          <ToggleField label="Abilita IPv6" value={wan.ipv6_enabled} editing={isEditing} onChange={v => updateWanField(i, 'ipv6_enabled', v)} />
                          {wan.ipv6_enabled && <>
                            <Field label="Indirizzo IPv6" value={wan.ip6addr} editing={isEditing} onChange={v => updateWanField(i, 'ip6addr', v)} />
                            <Field label="Gateway IPv6" value={wan.ip6gw} editing={isEditing} onChange={v => updateWanField(i, 'ip6gw', v)} />
                            <Field label="Prefisso ULA" value={wan.ula} editing={isEditing} onChange={v => updateWanField(i, 'ula', v)} />
                            <ToggleField label="DNS64" value={wan.dns64} editing={isEditing} onChange={v => updateWanField(i, 'dns64', v)} />
                          </>}
                        </SubCard>

                        {/* Col 3: QoS + Status */}
                        <SubCard title="QoS (SQM)">
                          <ToggleField label="SQM Attivo" value={wan.sqm_enabled} editing={isEditing} onChange={v => updateWanField(i, 'sqm_enabled', v)} />
                          {wan.sqm_enabled && <>
                            <Field label="Download (Kbps)" value={wan.sqm_download} editing={isEditing} onChange={v => updateWanField(i, 'sqm_download', parseInt(v)||0)} type="number" />
                            <Field label="Upload (Kbps)" value={wan.sqm_upload} editing={isEditing} onChange={v => updateWanField(i, 'sqm_upload', parseInt(v)||0)} type="number" />
                            <Field label="Queue Discipline" value={wan.sqm_qdisc} editing={isEditing} type="select" options={[['cake','CAKE'],['fq_codel','fq_codel'],['sfq','SFQ']]} onChange={v => updateWanField(i, 'sqm_qdisc', v)} />
                            <ToggleField label="Test Velocita Auto" value={wan.sqm_testspeed} editing={isEditing} onChange={v => updateWanField(i, 'sqm_testspeed', v)} />
                          </>}
                          <ToggleField label="QoS Attivo" value={wan.qos_enabled} editing={isEditing} onChange={v => updateWanField(i, 'qos_enabled', v)} />

                          <h5 style={subTitle}>Stato Real-time</h5>
                          <StaticField label="Stato" value={live.is_up ? 'ONLINE' : 'OFFLINE'} color={live.is_up ? '#22c55e' : '#ef4444'} />
                          <StaticField label="IP" value={live.ip || '-'} />
                          <StaticField label="Download" value={`${live.rx_rate_mbps || 0} Mbps`} color="#06b6d4" />
                          <StaticField label="Upload" value={`${live.tx_rate_mbps || 0} Mbps`} color="#a855f7" />
                          <StaticField label="Latenza" value={`${live.latency_ms || 0} ms`} color="#f59e0b" />
                        </SubCard>
                      </div>
                    </div>
                  )}
                </Card>
              )
            })}

            <button onClick={() => {
              const n = wanConfig.length + 1
              setWanConfig([...wanConfig, { ...wanConfig[0], name: `wan${n}`, label: `WAN ${n}`, device: '', enabled: false, metric: n*10 }])
            }} style={{ ...btnStyle('#3b82f6', '#1e3a5f'), marginTop: 16 }}>+ Aggiungi Interfaccia</button>
          </>
        )}

        {/* VPN */}
        {activeTab === 'vpn' && (
          <Card>
            <SectionHeader title="Configurazione VPN" editing={editMode.vpn} onEdit={() => setEditMode({...editMode, vpn: true})} onSave={() => saveSection('vpn', vpnConfig)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <SubCard title="VPN Principale">
                <Field label="Tipo VPN" value={vpnConfig.default_vpn} editing={editMode.vpn} type="select" options={[
                  ['glorytun_tcp','Glorytun TCP'],['glorytun_udp','Glorytun UDP'],['dsvpn','DSVPN'],
                  ['mlvpn','MLVPN'],['ubond','UBOND'],['openvpn_tcp','OpenVPN TCP'],['openvpn_bonding','OpenVPN Bonding'],
                  ['softether','SoftEther'],['none','Nessuna'],
                ]} onChange={v => setVpnConfig({...vpnConfig, default_vpn: v})} />

                {vpnConfig.default_vpn.includes('glorytun') && <Field label="Chiave Glorytun" value={vpnConfig.glorytun_key} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, glorytun_key: v})} type="password" />}
                {vpnConfig.default_vpn === 'dsvpn' && <Field label="Chiave DSVPN" value={vpnConfig.dsvpn_key} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, dsvpn_key: v})} type="password" />}
                {vpnConfig.default_vpn === 'mlvpn' && <>
                  <Field label="Password MLVPN" value={vpnConfig.mlvpn_password} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, mlvpn_password: v})} type="password" />
                  <Field label="Prima Porta" value={vpnConfig.mlvpn_first_port} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, mlvpn_first_port: parseInt(v)||65201})} type="number" />
                </>}
                {vpnConfig.default_vpn === 'ubond' && <>
                  <Field label="Password UBOND" value={vpnConfig.ubond_password} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, ubond_password: v})} type="password" />
                  <Field label="Prima Porta" value={vpnConfig.ubond_first_port} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, ubond_first_port: parseInt(v)||65251})} type="number" />
                </>}
                {vpnConfig.default_vpn === 'softether' && <Field label="Password SoftEther" value={vpnConfig.softether_password} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, softether_password: v})} type="password" />}
                {vpnConfig.default_vpn.includes('openvpn') && <ToggleField label="Load Balancing" value={vpnConfig.openvpn_lb} editing={editMode.vpn} onChange={v => setVpnConfig({...vpnConfig, openvpn_lb: v})} />}
              </SubCard>

              <SubCard title="MPTCP over VPN">
                <Field label="Tipo" value={vpnConfig.mptcpovervpn} editing={editMode.vpn} type="select" options={[['none','Nessuno'],['openvpn','OpenVPN'],['wireguard','WireGuard']]} onChange={v => setVpnConfig({...vpnConfig, mptcpovervpn: v})} />
              </SubCard>
            </div>
          </Card>
        )}

        {/* PROXY */}
        {activeTab === 'proxy' && (
          <Card>
            <SectionHeader title="Configurazione Proxy" editing={editMode.proxy} onEdit={() => setEditMode({...editMode, proxy: true})} onSave={() => saveSection('proxy', proxyConfig)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <SubCard title="Proxy Principale">
                <Field label="Tipo Proxy" value={proxyConfig.default_proxy} editing={editMode.proxy} type="select" options={[
                  ['shadowsocks','Shadowsocks'],['shadowsocks_rust_2022','Shadowsocks-Rust 2022'],
                  ['v2ray_vless','V2Ray VLESS'],['v2ray_vmess','V2Ray VMESS'],['v2ray_trojan','V2Ray TROJAN'],['v2ray_socks','V2Ray SOCKS'],
                  ['xray_vless','XRay VLESS'],['xray_vmess','XRay VMESS'],['xray_trojan','XRay TROJAN'],['xray_socks','XRay SOCKS'],
                  ['none','Nessuno'],
                ]} onChange={v => setProxyConfig({...proxyConfig, default_proxy: v})} />
              </SubCard>

              <SubCard title="Shadowsocks">
                <Field label="Crittografia" value={proxyConfig.ss_encryption} editing={editMode.proxy} type="select" options={[
                  ['chacha20-ietf-poly1305','ChaCha20-IETF-Poly1305'],['aes-256-gcm','AES-256-GCM'],['aes-128-gcm','AES-128-GCM'],['none','Nessuna'],
                ]} onChange={v => setProxyConfig({...proxyConfig, ss_encryption: v})} />
                <Field label="Chiave Shadowsocks" value={proxyConfig.ss_key} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, ss_key: v})} type="password" />
                <Field label="Chiave SS 2022" value={proxyConfig.ss2022_key} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, ss2022_key: v})} type="password" />
                <ToggleField label="Supporto UDP" value={proxyConfig.ss_udp} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, ss_udp: v})} />
                <ToggleField label="Obfuscation" value={proxyConfig.obfs_enabled} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, obfs_enabled: v})} />
                {proxyConfig.obfs_enabled && <>
                  <Field label="Plugin" value={proxyConfig.obfs_plugin} editing={editMode.proxy} type="select" options={[['v2ray','V2Ray'],['simple-obfs','Simple-OBFS']]} onChange={v => setProxyConfig({...proxyConfig, obfs_plugin: v})} />
                  <Field label="Tipo" value={proxyConfig.obfs_type} editing={editMode.proxy} type="select" options={[['http','HTTP'],['tls','TLS']]} onChange={v => setProxyConfig({...proxyConfig, obfs_type: v})} />
                </>}
              </SubCard>

              <SubCard title="V2Ray">
                <Field label="User ID" value={proxyConfig.v2ray_user} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, v2ray_user: v})} />
                <ToggleField label="Supporto UDP" value={proxyConfig.v2ray_udp} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, v2ray_udp: v})} />
              </SubCard>

              <SubCard title="XRay">
                <Field label="User ID" value={proxyConfig.xray_user} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, xray_user: v})} />
                <Field label="Trasporto" value={proxyConfig.xray_transport} editing={editMode.proxy} type="select" options={[['tcp','TCP'],['grpc','gRPC'],['xhttp','XHTTP']]} onChange={v => setProxyConfig({...proxyConfig, xray_transport: v})} />
                <ToggleField label="Supporto UDP" value={proxyConfig.xray_udp} editing={editMode.proxy} onChange={v => setProxyConfig({...proxyConfig, xray_udp: v})} />
              </SubCard>
            </div>
          </Card>
        )}

        {/* MPTCP */}
        {activeTab === 'mptcp' && (
          <Card>
            <SectionHeader title="Multipath TCP" editing={editMode.mptcp} onEdit={() => setEditMode({...editMode, mptcp: true})} onSave={() => saveSection('mptcp', mptcpConfig)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <SubCard title="Generale">
                <ToggleField label="MPTCP Attivo" value={mptcpConfig.enabled} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, enabled: v})} />
                <Field label="Scheduler" value={mptcpConfig.scheduler} editing={editMode.mptcp} type="select" options={[['default','Default'],['roundrobin','Round Robin'],['blest','BLEST'],['ecf','ECF'],['redundant','Redundant']]} onChange={v => setMptcpConfig({...mptcpConfig, scheduler: v})} />
                <Field label="Congestion Control" value={mptcpConfig.congestion} editing={editMode.mptcp} type="select" options={[['bbr','BBR'],['cubic','Cubic'],['vegas','Vegas'],['westwood','Westwood'],['hybla','Hybla'],['illinois','Illinois'],['yeah','YeAH'],['veno','Veno']]} onChange={v => setMptcpConfig({...mptcpConfig, congestion: v})} />
                <Field label="Path Manager" value={mptcpConfig.path_manager} editing={editMode.mptcp} type="select" options={[['default','Default'],['fullmesh','Full Mesh'],['ndiffports','N-Diff Ports'],['binder','Binder'],['netlink','Netlink']]} onChange={v => setMptcpConfig({...mptcpConfig, path_manager: v})} />
                <ToggleField label="Checksum" value={mptcpConfig.checksum} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, checksum: v})} />
                <ToggleField label="Debug" value={mptcpConfig.debug} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, debug: v})} />
              </SubCard>

              <SubCard title="Parametri Avanzati">
                <Field label="Versione Protocollo" value={mptcpConfig.version} editing={editMode.mptcp} type="select" options={[['0','v0'],['1','v1']]} onChange={v => setMptcpConfig({...mptcpConfig, version: parseInt(v)})} />
                <Field label="SYN Retries" value={mptcpConfig.syn_retries} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, syn_retries: parseInt(v)||3})} type="number" />
                <ToggleField label="Forza Multipath" value={mptcpConfig.force_multipath} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, force_multipath: v})} />
                <Field label="Max Subflow" value={mptcpConfig.max_subflows} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, max_subflows: parseInt(v)||3})} type="number" />
                <Field label="Stale Loss Count" value={mptcpConfig.stale_loss_cnt} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, stale_loss_cnt: parseInt(v)||4})} type="number" />
                <Field label="ADD_ADDR Accepted" value={mptcpConfig.add_addr_accepted} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, add_addr_accepted: parseInt(v)||1})} type="number" />
                <Field label="ADD_ADDR Timeout (s)" value={mptcpConfig.add_addr_timeout} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, add_addr_timeout: parseInt(v)||120})} type="number" />
              </SubCard>

              <SubCard title="MPTCPd Daemon">
                <ToggleField label="Abilita MPTCPd" value={mptcpConfig.mptcpd_enable} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, mptcpd_enable: v})} />
                {mptcpConfig.mptcpd_enable && <>
                  <Field label="Path Managers" value={mptcpConfig.mptcpd_path_managers} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, mptcpd_path_managers: v})} />
                  <Field label="Plugins" value={mptcpConfig.mptcpd_plugins} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, mptcpd_plugins: v})} />
                  <Field label="Address Flags" value={mptcpConfig.mptcpd_addr_flags} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, mptcpd_addr_flags: v})} placeholder="subflow,signal" />
                  <Field label="Notify Flags" value={mptcpConfig.mptcpd_notify_flags} editing={editMode.mptcp} onChange={v => setMptcpConfig({...mptcpConfig, mptcpd_notify_flags: v})} placeholder="existing" />
                </>}
              </SubCard>
            </div>
          </Card>
        )}

        {/* SISTEMA */}
        {activeTab === 'system' && (
          <Card>
            <SectionHeader title="Impostazioni Sistema" editing={editMode.system} onEdit={() => setEditMode({...editMode, system: true})} onSave={() => saveSection('system', systemConfig)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              <SubCard title="IPv6 e Protocolli">
                <ToggleField label="Disabilita IPv6" value={systemConfig.disable_ipv6} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, disable_ipv6: v})} />
                <ToggleField label="Abilita 6in4" value={systemConfig.enable_6in4} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, enable_6in4: v})} />
                <ToggleField label="SIP ALG" value={systemConfig.sip_alg} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, sip_alg: v})} />
                <Field label="Paese" value={systemConfig.country} editing={editMode.system} type="select" options={[['world','Mondo'],['europe','Europa'],['usa','USA'],['china','Cina'],['custom','Personalizzato']]} onChange={v => setSystemConfig({...systemConfig, country: v})} />
              </SubCard>

              <SubCard title="Parametri TCP">
                <Field label="TCP Keepalive (s)" value={systemConfig.tcp_keepalive_time} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, tcp_keepalive_time: parseInt(v)||600})} type="number" />
                <Field label="TCP FIN Timeout (s)" value={systemConfig.tcp_fin_timeout} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, tcp_fin_timeout: parseInt(v)||15})} type="number" />
                <Field label="SYN Retries" value={systemConfig.tcp_syn_retries} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, tcp_syn_retries: parseInt(v)||3})} type="number" />
                <Field label="TCP Retries 1" value={systemConfig.tcp_retries1} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, tcp_retries1: parseInt(v)||3})} type="number" />
                <Field label="TCP Retries 2" value={systemConfig.tcp_retries2} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, tcp_retries2: parseInt(v)||8})} type="number" />
                <Field label="TTL Default" value={systemConfig.ip_default_ttl} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, ip_default_ttl: parseInt(v)||64})} type="number" />
                <Field label="TCP Fast Open" value={systemConfig.tcp_fastopen} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, tcp_fastopen: parseInt(v)||3})} type="number" />
                <ToggleField label="Disabilita Fast Open" value={systemConfig.disable_fastopen} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, disable_fastopen: v})} />
                <ToggleField label="TCP Low Latency" value={systemConfig.enable_nodelay} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, enable_nodelay: v})} />
              </SubCard>

              <SubCard title="Hardware">
                <ToggleField label="SFE (Fast Path)" value={systemConfig.sfe_enabled} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, sfe_enabled: v})} />
                <ToggleField label="SFE Bridge" value={systemConfig.sfe_bridge} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, sfe_bridge: v})} />
                <Field label="CPU Min Freq" value={systemConfig.scaling_min_freq} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, scaling_min_freq: v})} placeholder="Auto" />
                <Field label="CPU Max Freq" value={systemConfig.scaling_max_freq} editing={editMode.system} onChange={v => setSystemConfig({...systemConfig, scaling_max_freq: v})} placeholder="Auto" />
                <Field label="CPU Governor" value={systemConfig.scaling_governor} editing={editMode.system} type="select" options={[['performance','Performance'],['ondemand','On Demand'],['conservative','Conservative'],['powersave','Powersave']]} onChange={v => setSystemConfig({...systemConfig, scaling_governor: v})} />
              </SubCard>
            </div>
          </Card>
        )}

        {/* MONITORAGGIO */}
        {activeTab === 'monitoring' && (
          <Card>
            <SectionHeader title="Monitoraggio e Diagnostica" editing={editMode.monitor} onEdit={() => setEditMode({...editMode, monitor: true})} onSave={() => saveSection('monitor', monitorConfig)} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <SubCard title="Check Esterni">
                <ToggleField label="Check IP Esterno" value={monitorConfig.external_check} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, external_check: v})} />
                <Field label="URL Check IPv4" value={monitorConfig.check_ipv4_url} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, check_ipv4_url: v})} />
                <Field label="URL Check IPv6" value={monitorConfig.check_ipv6_url} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, check_ipv6_url: v})} />
                <Field label="Timeout VPS (s)" value={monitorConfig.status_vps_timeout} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, status_vps_timeout: parseInt(v)||10})} type="number" />
                <Field label="Timeout Get IP (s)" value={monitorConfig.status_getip_timeout} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, status_getip_timeout: parseInt(v)||1})} type="number" />
                <Field label="Timeout Whois (s)" value={monitorConfig.status_whois_timeout} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, status_whois_timeout: parseInt(v)||2})} type="number" />
              </SubCard>

              <SubCard title="Opzioni Diagnostica">
                <ToggleField label="Disabilita Ping Server" value={monitorConfig.disable_server_ping} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_server_ping: v})} />
                <ToggleField label="Disabilita HTTP Test" value={monitorConfig.disable_server_httptest} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_server_httptest: v})} />
                <ToggleField label="Disabilita Ping Gateway" value={monitorConfig.disable_gw_ping} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_gw_ping: v})} />
                <ToggleField label="VNStat" value={monitorConfig.save_vnstat} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, save_vnstat: v})} />
                <ToggleField label="Disabilita Loop Detection" value={monitorConfig.disable_loop_detection} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_loop_detection: v})} />
                <ToggleField label="Disabilita Tracebox" value={monitorConfig.disable_tracebox} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_tracebox: v})} />
                <ToggleField label="Disabilita Test Multipath" value={monitorConfig.disable_multipath_test} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_multipath_test: v})} />
                <ToggleField label="Debug" value={monitorConfig.debug} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, debug: v})} />
                <ToggleField label="Disabilita Rename Intf" value={monitorConfig.disable_intf_rename} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_intf_rename: v})} />
                <ToggleField label="Disabilita ModemManager" value={monitorConfig.disable_modemmanager} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_modemmanager: v})} />
                <ToggleField label="Disabilita GW Default" value={monitorConfig.disable_default_gw} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, disable_default_gw: v})} />
                <ToggleField label="Forza TCP per UDP" value={monitorConfig.ban_udp_ip} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, ban_udp_ip: v})} />
                <ToggleField label="Proxy solo LAN" value={monitorConfig.restrict_to_lan} editing={editMode.monitor} onChange={v => setMonitorConfig({...monitorConfig, restrict_to_lan: v})} />
              </SubCard>
            </div>
          </Card>
        )}

        {/* QUOTE */}
        {activeTab === 'quota' && (
          <Card>
            <SectionHeader title="Quote Traffico" editing={editMode.quota} onEdit={() => setEditMode({...editMode, quota: true})} onSave={() => saveSection('quota', quotaConfig)} />
            {quotaConfig.map((q, i) => (
              <div key={q.interface} style={{ display: 'grid', gridTemplateColumns: '120px 60px 1fr 1fr 1fr 120px', gap: 12, padding: '12px 0', borderBottom: '1px solid #334155', alignItems: 'center' }}>
                <span style={{ color: '#fff', fontWeight: 600, fontSize: 13 }}>{wanConfig[i]?.label || q.interface}</span>
                <Toggle value={q.enabled} onChange={() => { const u = [...quotaConfig]; u[i].enabled = !u[i].enabled; setQuotaConfig(u) }} disabled={!editMode.quota} />
                <Field label="TX (Kbit)" value={q.tx_quota} editing={editMode.quota && q.enabled} onChange={v => { const u = [...quotaConfig]; u[i].tx_quota = parseInt(v)||0; setQuotaConfig(u) }} type="number" inline />
                <Field label="RX (Kbit)" value={q.rx_quota} editing={editMode.quota && q.enabled} onChange={v => { const u = [...quotaConfig]; u[i].rx_quota = parseInt(v)||0; setQuotaConfig(u) }} type="number" inline />
                <Field label="TX+RX (Kbit)" value={q.tt_quota} editing={editMode.quota && q.enabled} onChange={v => { const u = [...quotaConfig]; u[i].tt_quota = parseInt(v)||0; setQuotaConfig(u) }} type="number" inline />
                <Field label="Intervallo (s)" value={q.interval} editing={editMode.quota && q.enabled} onChange={v => { const u = [...quotaConfig]; u[i].interval = parseInt(v)||300; setQuotaConfig(u) }} type="number" inline />
              </div>
            ))}
          </Card>
        )}

        {/* SERVER VPS */}
        {activeTab === 'server' && (
          <Card>
            <SectionHeader title="Server VPS" editing={editMode.server} onEdit={() => setEditMode({...editMode, server: true})} onSave={() => saveSection('server', servers)} />
            {servers.map((srv, i) => (
              <SubCard key={srv.name} title={`Server ${i+1}${srv.master ? ' (Master)' : ''}`} style={{ marginBottom: 16 }}>
                <Field label="IP Primario" value={srv.ip1} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].ip1 = v; setServers(u) }} />
                <Field label="IP Secondario" value={srv.ip2} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].ip2 = v; setServers(u) }} placeholder="Opzionale" />
                <Field label="Username" value={srv.username} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].username = v; setServers(u) }} />
                <Field label="Chiave/Password" value={srv.key} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].key = v; setServers(u) }} type="password" />
                <Field label="Porta" value={srv.port} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].port = parseInt(v)||65500; setServers(u) }} type="number" />
                <ToggleField label="Master" value={srv.master} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].master = v; setServers(u) }} />
                <ToggleField label="Disabilitato" value={srv.disabled} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].disabled = v; setServers(u) }} />
                <ToggleField label="Port Redirection" value={srv.redirect_ports} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].redirect_ports = v; setServers(u) }} />
                <ToggleField label="No FW Redirect" value={srv.nofwredirect} editing={editMode.server} onChange={v => { const u = [...servers]; u[i].nofwredirect = v; setServers(u) }} />
                {editMode.server && (
                  <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                    <button onClick={() => sendCommand('force_retrieve', { server: srv.name })} style={btnStyle('#f59e0b', '#3b2f1c')}>Forza Retrieve</button>
                    <button onClick={() => sendCommand('update_vps', { server: srv.name })} style={btnStyle('#3b82f6', '#1e3a5f')}>Aggiorna VPS</button>
                  </div>
                )}
              </SubCard>
            ))}
            {editMode.server && <button onClick={() => setServers([...servers, { name: `server${servers.length+1}`, ip1: '', ip2: '', username: 'openmptcprouter', key: '', port: 65500, master: false, disabled: false, redirect_ports: true, nofwredirect: false }])} style={btnStyle('#3b82f6', '#1e3a5f')}>+ Aggiungi Server</button>}
          </Card>
        )}

        {/* BACKUP */}
        {activeTab === 'backup' && (
          <Card>
            <h3 style={sectionTitle}>Backup e Ripristino</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <SubCard title="Salva Configurazione">
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 12px' }}>Salva la configurazione corrente del router.</p>
                <button onClick={() => sendCommand('backup_save')} style={btnStyle('#22c55e', '#16362d')}>Salva Backup</button>
              </SubCard>
              <SubCard title="Ripristina Configurazione">
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '0 0 12px' }}>Ripristina da un backup precedente.</p>
                <button onClick={() => sendCommand('backup_restore')} style={btnStyle('#f59e0b', '#3b2f1c')}>Ripristina</button>
              </SubCard>
            </div>
          </Card>
        )}

        {/* Command log */}
        {commandLog.length > 0 && (
          <Card style={{ marginTop: 16 }}>
            <h3 style={sectionTitle}>Log Comandi</h3>
            {commandLog.map((cmd, i) => (
              <div key={i} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #334155', fontSize: 13 }}>
                <span style={{ color: '#64748b', fontFamily: 'monospace' }}>{cmd.time}</span>
                <span style={{ color: '#fff' }}>{cmd.type}</span>
                <span style={{ color: cmd.status === 'inviato' ? '#22c55e' : cmd.status === 'errore' ? '#ef4444' : '#f59e0b' }}>{cmd.status}</span>
              </div>
            ))}
          </Card>
        )}

        {showCommandModal && <CommandModal onSend={sendCommand} onClose={() => setShowCommandModal(false)} />}
      </div>
    </div>
  )
}

// === COMPONENTI RIUSABILI ===

function Card({ children, style = {} }) {
  return <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 20, ...style }}>{children}</div>
}

function SubCard({ title, children, style = {} }) {
  return (
    <div style={{ background: '#172033', borderRadius: 8, padding: 16, border: '1px solid #334155', ...style }}>
      {title && <h5 style={{ color: '#94a3b8', margin: '0 0 12px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }}>{title}</h5>}
      {children}
    </div>
  )
}

function SectionHeader({ title, editing, onEdit, onSave }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
      <h3 style={sectionTitle}>{title}</h3>
      {editing ? (
        <button onClick={onSave} style={btnStyle('#22c55e', '#16362d')}>Salva Configurazione</button>
      ) : (
        <button onClick={onEdit} style={btnStyle('#3b82f6', '#1e3a5f')}>Modifica</button>
      )}
    </div>
  )
}

function Field({ label, value, editing, onChange, type = 'text', options, placeholder = '', inline }) {
  const row = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: inline ? '2px 0' : '6px 0', borderBottom: inline ? 'none' : '1px solid #334155' }
  if (editing && type === 'select') {
    return (
      <div style={row}>
        <span style={labelStyle}>{label}</span>
        <select value={value} onChange={e => onChange(e.target.value)} style={selectStyle}>
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
    )
  }
  return (
    <div style={row}>
      <span style={labelStyle}>{label}</span>
      {editing ? (
        <input type={type} value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ ...inputStyle, width: type === 'number' ? 80 : 160 }} />
      ) : (
        <span style={{ color: '#fff', fontSize: 12, fontWeight: 600 }}>{type === 'password' ? (value ? '********' : '-') : (value || placeholder || '-')}</span>
      )}
    </div>
  )
}

function ToggleField({ label, value, editing, onChange }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #334155' }}>
      <span style={labelStyle}>{label}</span>
      {editing ? <Toggle value={value} onChange={() => onChange(!value)} /> : (
        <span style={{ color: value ? '#22c55e' : '#64748b', fontSize: 12, fontWeight: 600 }}>{value ? 'Attivo' : 'Disattivo'}</span>
      )}
    </div>
  )
}

function StaticField({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid #334155' }}>
      <span style={labelStyle}>{label}</span>
      <span style={{ color: color || '#fff', fontSize: 12, fontWeight: 600 }}>{value}</span>
    </div>
  )
}

function Toggle({ value, onChange, disabled }) {
  return (
    <div onClick={disabled ? undefined : onChange} style={{
      width: 40, height: 22, borderRadius: 11, cursor: disabled ? 'default' : 'pointer',
      background: value ? '#22c55e' : '#475569', position: 'relative', transition: 'background 0.2s',
      opacity: disabled ? 0.5 : 1,
    }}>
      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#fff', position: 'absolute', top: 2, left: value ? 20 : 2, transition: 'left 0.2s' }} />
    </div>
  )
}

function CommandModal({ onSend, onClose }) {
  const [cmd, setCmd] = useState('')
  const [payload, setPayload] = useState('{}')
  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999 }}>
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, width: 400, border: '1px solid #334155' }}>
        <h3 style={{ color: '#fff', margin: '0 0 16px' }}>Comando Manuale</h3>
        <label style={labelStyle}>Tipo Comando</label>
        <input value={cmd} onChange={e => setCmd(e.target.value)} placeholder="reboot, get_config, speedtest..." style={{ ...inputStyle, width: '100%', marginBottom: 12, boxSizing: 'border-box' }} />
        <label style={labelStyle}>Payload (JSON)</label>
        <textarea value={payload} onChange={e => setPayload(e.target.value)} rows={3} style={{ ...inputStyle, width: '100%', marginBottom: 16, boxSizing: 'border-box', resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={btnStyle('#64748b', '#334155')}>Annulla</button>
          <button onClick={() => { onSend(cmd, JSON.parse(payload || '{}')); onClose() }} style={btnStyle('#22c55e', '#16362d')}>Invia</button>
        </div>
      </div>
    </div>
  )
}

function formatUptime(s) { if (!s) return '-'; const d = Math.floor(s/86400), h = Math.floor((s%86400)/3600); return d > 0 ? `${d}d ${h}h` : `${h}h` }

const btnStyle = (color, bg, small) => ({ padding: small ? '4px 8px' : '6px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: small ? 11 : 12, fontWeight: 600, color, background: bg })
const pill = { padding: '4px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600 }
const inputStyle = { background: '#0f172a', border: '1px solid #475569', borderRadius: 6, color: '#fff', padding: '6px 10px', fontSize: 13, outline: 'none' }
const selectStyle = { background: '#0f172a', border: '1px solid #475569', borderRadius: 6, color: '#fff', padding: '6px 8px', fontSize: 13, outline: 'none' }
const labelStyle = { color: '#94a3b8', fontSize: 12 }
const sectionTitle = { color: '#fff', margin: 0, fontSize: 16 }
const subTitle = { color: '#94a3b8', margin: '16px 0 8px', fontSize: 12, textTransform: 'uppercase', letterSpacing: 1 }
