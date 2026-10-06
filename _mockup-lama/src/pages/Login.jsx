import React, { useState } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { useAppContext } from '../context/AppContext';
import { Lock, User, RefreshCw } from 'lucide-react';

function Login() {
  const { currentUser, login, dispatch } = useAppContext();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  if (currentUser) {
    const targetPath = currentUser.role === 'owner' ? '/dashboard' : '/pos';
    return <Navigate to={targetPath} replace />;
  }

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    setError('');

    if (!username || !password) {
      setError('Please enter both username and password.');
      return;
    }

    console.log('Attempting login for:', username);
    const result = login(username.trim(), password.trim());
    if (result.success) {
      console.log('Login successful:', result.user);
      const targetPath = result.user.role === 'owner' ? '/dashboard' : '/pos';
      navigate(targetPath);
    } else {
      console.warn('Login failed:', result.error);
      setError(result.error || 'Invalid credentials');
    }
  };

  const handleQuickLogin = (userType) => {
    const u = userType === 'owner' ? 'owner' : 'cashier';
    const p = userType === 'owner' ? 'owner123' : 'cashier123';
    setUsername(u);
    setPassword(p);
    
    // Automatically submit after state update
    setTimeout(() => {
      const result = login(u, p);
      if (result.success) {
        navigate(result.user.role === 'owner' ? '/dashboard' : '/pos');
      } else {
        setError(result.error || 'Invalid credentials');
      }
    }, 50);
  };

  const handleResetData = () => {
    if (window.confirm('This will clear all localStorage (including transactions, inventory changes, and users) and reload seed data. Proceed?')) {
      dispatch({ type: 'RESET_ALL_DATA' });
      window.location.reload();
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <div className="login-logo-icon">M</div>
          <h1>MOURDEN</h1>
          <p>Cafe & Eatery — Point of Sale</p>
        </div>

        {error && <div className="login-error">{error}</div>}

        <form onSubmit={handleSubmit} className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Username</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                type="text"
                placeholder="Enter username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{ width: '100%', paddingLeft: '44px' }}
              />
            </div>
          </div>

          <div className="form-group" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-sm)' }}>
            <label className="form-label" style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ width: '100%', paddingLeft: '44px' }}
              />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: 'var(--space-md)' }}>
            Sign In
          </button>
        </form>

        <div style={{ marginTop: 'var(--space-xl)', padding: '12px', background: 'rgba(255,255,255,0.02)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
          <p style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: '8px' }}>
            Quick Demo Login (Tap to Enter):
          </p>
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              type="button"
              onClick={() => handleQuickLogin('owner')}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.7rem', padding: '6px 12px' }}
            >
              🔑 Owner Account
            </button>
            <button
              type="button"
              onClick={() => handleQuickLogin('cashier')}
              className="btn btn-sm btn-secondary"
              style={{ fontSize: '0.7rem', padding: '6px 12px' }}
            >
              🔑 Cashier Account
            </button>
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-lg)', textAlign: 'center' }}>
          <button
            type="button"
            onClick={handleResetData}
            className="btn btn-sm btn-ghost"
            style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
          >
            <RefreshCw size={10} /> Reset & Clear LocalStorage Data
          </button>
        </div>
      </div>
    </div>
  );
}

export default Login;
