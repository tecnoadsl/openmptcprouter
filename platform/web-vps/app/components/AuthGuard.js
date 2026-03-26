'use client'

import { useState, useEffect } from 'react'

const API = 'http://localhost:8000'

export default function AuthGuard({ children, title }) {
  const [token, setToken] = useState(null)
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('omr_token') : null
    if (saved) {
      // Verifica che il token sia ancora valido
      fetch(`${API}/health`)
        .then(r => { if (r.ok) { setToken(saved) } else { localStorage.removeItem('omr_token') } })
        .catch(() => { localStorage.removeItem('omr_token') })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  async function login() {
    setError('')
    try {
      const res = await fetch(`${API}/auth/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `username=${encodeURIComponent(email)}&password=${encodeURIComponent(pass)}`,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        setError(errData.detail || `Errore ${res.status}`)
        return
      }
      const data = await res.json()
      if (data.access_token) {
        setToken(data.access_token)
        localStorage.setItem('omr_token', data.access_token)
      } else {
        setError('Risposta non valida dal server')
      }
    } catch (e) {
      setError(`Errore di connessione: ${e.message}`)
    }
  }

  function logout() {
    setToken(null)
    localStorage.removeItem('omr_token')
  }

  if (loading) {
    return <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <p style={{ color: '#94a3b8' }}>Caricamento...</p>
    </div>
  }

  if (!token) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
        <div style={{ background: '#1e293b', borderRadius: 12, padding: 32, width: 360, border: '1px solid #334155' }}>
          <h1 style={{ color: '#fff', fontSize: 20, margin: '0 0 4px', textAlign: 'center' }}>{title || 'OMR Platform'}</h1>
          <p style={{ color: '#3b82f6', fontSize: 13, margin: '0 0 24px', textAlign: 'center' }}>Tecnoadsl</p>
          {error && <p style={{ color: '#ef4444', fontSize: 12, textAlign: 'center', margin: '0 0 12px', padding: '8px', background: '#3b1c1c', borderRadius: 6 }}>{error}</p>}
          <input
            value={email} onChange={e => setEmail(e.target.value)}
            placeholder="Email" autoFocus
            onKeyDown={e => e.key === 'Enter' && document.getElementById('pass-input')?.focus()}
            style={inputSt}
          />
          <input
            id="pass-input"
            value={pass} onChange={e => setPass(e.target.value)}
            placeholder="Password" type="password"
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ ...inputSt, marginBottom: 16 }}
          />
          <button onClick={login} style={{ padding: '10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 600, color: '#fff', background: '#3b82f6', width: '100%' }}>Accedi</button>
          <p style={{ color: '#64748b', fontSize: 11, textAlign: 'center', margin: '12px 0 0' }}>admin@tecnoadsl.net / admin</p>
        </div>
      </div>
    )
  }

  return typeof children === 'function' ? children({ token, logout }) : children
}

const inputSt = { background: '#0f172a', border: '1px solid #475569', borderRadius: 6, color: '#fff', padding: '10px 12px', fontSize: 13, outline: 'none', width: '100%', marginBottom: 12, boxSizing: 'border-box' }
