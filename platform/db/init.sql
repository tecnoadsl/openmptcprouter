-- OpenMPTCProuter Platform - Multi-tenant Schema

-- Livelli: super_admin > reseller > organization > site > device

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Tenant (reseller)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    max_devices INTEGER DEFAULT 100,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Organizzazioni (clienti del reseller)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Siti / Sedi
CREATE TABLE sites (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    address TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Dispositivi (router + VPS)
CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
    device_id VARCHAR(100) UNIQUE NOT NULL,  -- ID univoco del dispositivo
    name VARCHAR(255) NOT NULL,
    device_type VARCHAR(20) NOT NULL CHECK (device_type IN ('router', 'vps')),
    model VARCHAR(100),
    firmware_version VARCHAR(50),
    is_online BOOLEAN DEFAULT false,
    last_seen_at TIMESTAMPTZ,
    config JSONB DEFAULT '{}',
    mqtt_password VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Utenti
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role VARCHAR(20) NOT NULL CHECK (role IN ('super_admin', 'reseller_admin', 'org_admin', 'viewer')),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,          -- NULL per super_admin
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE, -- NULL per reseller+
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Telemetria (time-series dei dispositivi)
CREATE TABLE telemetry (
    id BIGSERIAL PRIMARY KEY,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    cpu_usage REAL,
    memory_usage REAL,
    uptime INTEGER,
    wan_status JSONB,       -- [{name, ip, rx_bytes, tx_bytes, latency_ms, is_up}]
    mptcp_status JSONB,     -- {subflows, aggregated_bw, scheduler}
    tunnel_status JSONB,    -- {type, connected, rx_bytes, tx_bytes}
    zenarmor JSONB,         -- {enabled, mode, stats}
    extra JSONB DEFAULT '{}'
);

-- Indici per query veloci
CREATE INDEX idx_telemetry_device_time ON telemetry(device_id, timestamp DESC);
CREATE INDEX idx_devices_site ON devices(site_id);
CREATE INDEX idx_sites_org ON sites(organization_id);
CREATE INDEX idx_orgs_tenant ON organizations(tenant_id);
CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_org ON users(organization_id);

-- Alert / Notifiche
CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    alert_type VARCHAR(50) NOT NULL,  -- wan_down, high_cpu, tunnel_lost, etc.
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
    message TEXT,
    is_resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_alerts_device ON alerts(device_id, created_at DESC);

-- Comandi remoti
CREATE TABLE commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    command_type VARCHAR(50) NOT NULL,  -- reboot, update_config, firmware_update
    payload JSONB DEFAULT '{}',
    status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'ack', 'completed', 'failed')),
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- Super admin iniziale
INSERT INTO tenants (id, name, slug) VALUES
    ('00000000-0000-0000-0000-000000000001', 'Tecnoadsl', 'tecnoadsl');

-- Password: admin (bcrypt hash)
INSERT INTO users (email, password_hash, full_name, role, tenant_id) VALUES
    ('admin@tecnoadsl.net', '$2b$12$IjQNy6Hxo3/etgKUyoL2BOv.SAm.JCajx/Q/OkMZF6.HFC5oT4jMW', 'Super Admin', 'super_admin', NULL);

-- Organizzazione e sito di esempio
INSERT INTO organizations (id, tenant_id, name) VALUES
    ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Sede Centrale');

INSERT INTO sites (id, organization_id, name, address) VALUES
    ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000002', 'Ufficio Roma', 'Via Roma 1, Roma');

-- Dispositivi dev
INSERT INTO devices (site_id, device_id, name, device_type, model) VALUES
    ('00000000-0000-0000-0000-000000000003', 'router-dev-001', 'Router Dev', 'router', 'Raspberry Pi 4'),
    ('00000000-0000-0000-0000-000000000003', 'vps-dev-001', 'VPS Dev', 'vps', 'KVM VPS');
